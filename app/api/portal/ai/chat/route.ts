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
import { PORTAL_CHAT_SYSTEM_PROMPT } from '@/lib/ai/portal-chat-prompt';

const SYSTEM_PROMPT = PORTAL_CHAT_SYSTEM_PROMPT;

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
