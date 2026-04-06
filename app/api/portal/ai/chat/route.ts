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

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY is not set in environment variables.');
}
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
Before calling any tool that creates, updates, or modifies data (create_support_ticket, reply_to_ticket, add_card_comment, create_website_page, publish_page, create_website_category, create_website_tag, request_service, request_suggested_project, update_profile, invite_team_member, create_crm_contact, update_crm_contact, create_crm_company, create_crm_deal, update_crm_deal, log_crm_activity), you MUST:
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
- When a client asks "what can you help with?", give a brief overview of ALL your capabilities including CRM (contacts, companies, deals, activities, pipelines)

## CRM capabilities
You can fully manage the client's CRM:
- **Contacts**: Search, create, update contacts. View contact details with activity history and deals.
- **Companies**: List and create companies.
- **Deals**: View pipeline, create deals, move deals between stages, mark as won/lost.
- **Activities**: Log calls, emails, meetings, notes, and tasks on contacts and deals.
- **Pipelines**: View available pipelines and stages.
When asked to do CRM work via email or chat, use these tools directly — don't tell the user to go to the portal unless they need the visual UI (kanban drag-drop, import/export).`;

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

    // Check AI credit balance before processing
    const canProceed = await hasCredits(client.id);
    if (!canProceed) {
      const bal = await getBalance(client.id);
      return NextResponse.json({
        success: false,
        message: 'Insufficient AI credits. Purchase more credits or enable pay-as-you-go in your dashboard.',
        creditsRemaining: bal.balance,
      }, { status: 402 });
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

    // eslint-disable-next-line no-constant-condition
    while (true) {
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

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of toolUseBlocks) {
          const result = await executePortalTool(
            block.name,
            block.input as Record<string, unknown>,
            client.id,
            userId,
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
      } else {
        // end_turn or max_tokens — extract text
        finalText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map(b => b.text)
          .join('');
        break;
      }
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

    // Deduct AI credits
    const totalTokens = totalInputTokens + totalOutputTokens;
    const creditResult = await deductCredits(client.id, totalTokens, 'ai', String(convId), `Chat conversation #${convId}`);

    return NextResponse.json({
      success: true,
      data: {
        conversationId: convId,
        reply: finalText,
        toolCalls: allToolCalls.map(tc => ({ name: tc.name, input: tc.input })),
        tokensUsed: totalTokens,
        creditsRemaining: creditResult.newBalance,
      },
    });
  } catch (err) {
    console.error('[POST /api/portal/ai/chat]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
