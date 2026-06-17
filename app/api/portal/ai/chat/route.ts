import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { aiConversations, aiMessages } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { eq, asc, sql } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import { PORTAL_TOOLS, executePortalTool } from '@/lib/ai/portal-tools';
import { hasCredits, deductCredits, getBalance } from '@/lib/ai-credits';
import { resolveClientApiKey } from '@/lib/ai/resolve-client-key';
import { recordAiUsage } from '@/lib/ai/audit';
import { checkAiPlanGate } from '@/lib/ai/plan-gate';

const SYSTEM_PROMPT = `You are a helpful AI assistant embedded in the Simpler Development client portal. You can help clients with EVERYTHING in their portal — projects, invoices, tickets, websites, email campaigns, booking pages, pitch decks, team management, services, hosting, CRM, and more.

You have access to real-time tools that query and modify the client's data. Always use the appropriate tool before answering — never guess or make up data.

## Linking rules (IMPORTANT)
Whenever you mention a specific entity by name, always make it a markdown link using the ID from the tool result:
- Project → [Project Name](/portal/projects/{id})
- Invoice → [Invoice #number](/portal/billing)
- Support ticket → [Ticket #number](/portal/tickets/{id})
- Suggested project → [Project Name](/portal/suggested-projects/{id})
- Website → [Site Name](/portal/websites/{id})
- Pitch deck → [Deck Name](/portal/tools/pitch-decks/{id})
- Booking page → [Page Name](/portal/tools/booking/{id})
- Email campaign → [Campaign Name](/portal/email/campaigns/{id})
- CRM contact → [Contact Name](/portal/crm/contacts/{id})
- CRM company → [Company Name](/portal/crm/companies/{id})
- CRM deal → [Deal Title](/portal/crm/deals?deal={id})

Only link to things where you have the actual ID from a tool call. Never fabricate IDs.

## Confirmation rules (IMPORTANT — for write actions)
Before calling any tool that creates, updates, or modifies data (create_support_ticket, reply_to_ticket, add_card_comment, create_website_page, publish_page, create_website_category, create_website_tag, request_service, request_suggested_project, update_profile, invite_team_member, create_crm_contact, update_crm_contact, create_crm_company, create_crm_deal, update_crm_deal, log_crm_activity, create_project_card, update_project_card, move_project_card, create_survey, update_survey, create_crm_proposal, send_crm_proposal, create_automation, toggle_automation, add_email_subscriber, create_email_segment), you MUST:
1. Summarize what you're about to do with the specific details
2. Ask the client to confirm with "yes"
3. Only then call the tool

## Navigation rules
When an action is better done through the portal UI (e.g. editing a blog post in the block editor, uploading media, designing an email campaign, connecting Google, paying an invoice via Stripe checkout, editing booking page availability), use the navigate_to tool to send them to the right page. Include a brief message telling them what to do when they get there.

Always prefer to complete simple actions directly (via tools) rather than navigating. Only navigate when the task requires the visual UI (rich editors, file uploads, Stripe checkout, OAuth flows).

## General guidelines
- Be concise, professional, and friendly
- Only answer questions related to the client's work with Simpler Development
- Format currency as dollars (e.g. $1,200.00)
- Format dates in a human-friendly way (e.g. "March 15, 2026")
- Use markdown sparingly — bullet lists are fine for multiple items, but avoid bold/headers for simple one-line answers
- If something is outside your scope, suggest they contact the team directly
- When a client asks "what can you help with?", give a brief overview of ALL your capabilities

## Extended capabilities
Beyond the basics (projects, invoices, tickets, websites, email, booking, pitch decks), you can also:

**CRM**: Search/create/update contacts, companies, deals. View pipelines and stages. Log activities (calls, emails, meetings). Create and send proposals. Mark deals as won/lost.

**Projects & Tasks**: Create cards (tasks) in project boards, update card details, move cards between columns (e.g. "To Do" to "Done").

**Surveys**: Create surveys with custom fields, view responses and stats, update survey status (draft/active/closed).

**Automations**: View, create, and toggle automation rules. Rules have triggers (e.g. "crm.deal.won"), conditions, and actions (any portal tool).

**Email Marketing**: Add subscribers to lists, create audience segments with filter rules.

**Proposals**: Create CRM proposals with line items, send them to contacts (generates a shareable link).

Use tools directly — only navigate to the portal UI when the task requires visual interaction (drag-drop, file uploads, rich editors).`;

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    // Service access check
    const authResult = await authorizePortal({ action: 'write', requireService: 'ai' });
    if (isAuthError(authResult)) return authResult.response;

    const userId = parseInt(session.user.id, 10);
    const role = (session.user as { role?: string })?.role;
    const isStaff = role === 'admin' || role === 'employee';

    // Staff can't use the client chat widget
    if (isStaff) return NextResponse.json({ success: false, message: 'Staff do not have a client portal chat.' }, { status: 403 });

    const client = await getPortalClient(userId);
    if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

    const { message, conversationId } = await req.json();
    if (!message?.trim()) return NextResponse.json({ success: false, message: 'message is required' }, { status: 400 });

    // Plan-gate first: Starter without BYOK is blocked before any other check.
    const gate = await checkAiPlanGate({ clientId: client.id, provider: 'anthropic' });
    if (!gate.allowed) {
      return NextResponse.json({
        success: false,
        message: gate.message ?? 'AI access is not available on the current plan.',
        reason: gate.reason,
      }, { status: 402 });
    }

    // Resolve which key to use (BYOK > platform). Cached per request via the
    // 60s in-memory cache inside resolveClientApiKey.
    const resolved = await resolveClientApiKey({ clientId: client.id, provider: 'anthropic' });
    const anthropic = new Anthropic({ apiKey: resolved.key });

    // Credit balance check only matters for platform-keyed calls. BYOK clients
    // pay their provider directly so we don't gate on internal credits.
    if (resolved.source === 'platform') {
      const canProceed = await hasCredits(client.id);
      if (!canProceed) {
        const bal = await getBalance(client.id);
        return NextResponse.json({
          success: false,
          message: 'Insufficient AI credits. Purchase more credits, enable pay-as-you-go, or add a BYOK key in Settings → API Keys.',
          creditsRemaining: bal.balance,
        }, { status: 402 });
      }
    }

    // Get or create conversation
    let convId = conversationId as number | undefined;
    if (!convId) {
      // Auto-title from first message (truncated)
      const title = message.trim().slice(0, 80);
      const [conv] = await db.insert(aiConversations).values({
        clientId: client.id,
        title,
      }).returning();
      convId = conv.id;
    } else {
      // Verify this conversation belongs to this client
      const [conv] = await db.select().from(aiConversations)
        .where(eq(aiConversations.id, convId)).limit(1);
      if (!conv || conv.clientId !== client.id) {
        return NextResponse.json({ success: false, message: 'Conversation not found' }, { status: 404 });
      }
    }

    // Load history
    const history = await db.select().from(aiMessages)
      .where(eq(aiMessages.conversationId, convId))
      .orderBy(asc(aiMessages.createdAt));

    // Build Anthropic messages array from history
    const anthropicMessages: Anthropic.MessageParam[] = history.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Append new user message
    anthropicMessages.push({ role: 'user', content: message.trim() });

    // Agentic tool loop
    let finalText = '';
    const allToolCalls: { name: string; input: Record<string, unknown>; result: unknown }[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    let currentMessages = [...anthropicMessages];

    // Guardrails to prevent runaway agentic loops / tool-call storms.
    const MAX_LOOPS = 8;
    const MAX_TOOL_CALLS = 20;
    let loopCount = 0;
    let toolCallCount = 0;
    let hitLoopCap = false;

    while (loopCount < MAX_LOOPS) {
      loopCount++;
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: PORTAL_TOOLS,
        messages: currentMessages,
      });

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
        );

        toolCallCount += toolUseBlocks.length;
        if (toolCallCount > MAX_TOOL_CALLS) {
          return NextResponse.json(
            { success: false, error: 'tool_call_cap_exceeded' },
            { status: 400 },
          );
        }

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of toolUseBlocks) {
          const result = await executePortalTool(
            block.name,
            block.input as Record<string, unknown>,
            client.id,
            userId,
            { source: 'assistant' },
          );
          allToolCalls.push({ name: block.name, input: block.input as Record<string, unknown>, result });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }

        currentMessages = [
          ...currentMessages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults },
        ];

        if (loopCount >= MAX_LOOPS) {
          hitLoopCap = true;
          finalText = response.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map(b => b.text)
            .join('');
          break;
        }
      } else {
        // end_turn or max_tokens — extract text
        finalText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map(b => b.text)
          .join('');
        break;
      }
    }

    if (hitLoopCap) {
      return NextResponse.json(
        { success: false, error: 'loop_cap_exceeded' },
        { status: 400 },
      );
    }

    // Save user message
    await db.insert(aiMessages).values({
      conversationId: convId,
      role: 'user',
      content: message.trim(),
      inputTokens: 0,
      outputTokens: 0,
    });

    // Save assistant message (with tool calls logged)
    await db.insert(aiMessages).values({
      conversationId: convId,
      role: 'assistant',
      content: finalText,
      toolCalls: allToolCalls.length > 0 ? allToolCalls : null,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    });

    // Update conversation token totals + updatedAt
    await db.update(aiConversations).set({
      totalInputTokens: sql`${aiConversations.totalInputTokens} + ${totalInputTokens}`,
      totalOutputTokens: sql`${aiConversations.totalOutputTokens} + ${totalOutputTokens}`,
      updatedAt: new Date(),
    }).where(eq(aiConversations.id, convId));

    // Deduct AI credits — only for platform-keyed calls. BYOK skips internal
    // credit deduction (the client paid their own provider directly).
    const totalTokens = totalInputTokens + totalOutputTokens;
    let creditsRemaining: number | null = null;
    if (resolved.source === 'platform') {
      const creditResult = await deductCredits(client.id, totalTokens, 'ai', String(convId), `Chat conversation #${convId}`);
      creditsRemaining = creditResult.newBalance;
    }

    // Audit row for the call (best-effort).
    void recordAiUsage({ clientId: client.id, source: resolved.source, tokens: totalTokens });

    return NextResponse.json({
      success: true,
      data: {
        conversationId: convId,
        reply: finalText,
        toolCalls: allToolCalls.map(tc => ({ name: tc.name, input: tc.input })),
        tokensUsed: totalTokens,
        keySource: resolved.source,
        creditsRemaining,
      },
    });
  } catch (err) {
    console.error('[POST /api/portal/ai/chat]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
