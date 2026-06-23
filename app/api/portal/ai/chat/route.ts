import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { aiConversations, aiMessages } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { eq, asc, sql } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import { PORTAL_TOOLS, executePortalTool } from '@/lib/ai/portal-tools';
import { classifyPortalRequest } from '@/lib/ai/portal-tools/classifier';
import { toolsForDomains, domainsOfToolCalls } from '@/lib/ai/portal-tools/domains';
import { withSpan, startSpan } from '@/lib/ai/tracer';
import { hasCredits, deductCredits, getBalance } from '@/lib/ai-credits';
import { resolveClientApiKey } from '@/lib/ai/resolve-client-key';
import { recordAiUsage } from '@/lib/ai/audit';
import { checkAiPlanGate } from '@/lib/ai/plan-gate';
import { PORTAL_CHAT_SYSTEM_PROMPT } from '@/lib/ai/portal-chat-prompt';

// Model routing: a cheap Haiku classifier decides which model runs the loop.
const HAIKU = 'claude-haiku-4-5-20251001';
const SONNET = 'claude-sonnet-4-6';

// Intent router rollout (ADR agent-topology-router-not-domain-mesh):
//   'shadow' → measure router accuracy/latency; loop still gets ALL tools
//              (zero capability risk on this client-facing, billing route).
//   'active' → hand the loop only the routed domain subset (token savings).
// Flip to 'active' once shadow data shows the router is reliable.
const ROUTER_MODE: 'shadow' | 'active' = 'shadow';

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

    // Cheap Haiku classifier does double duty in ONE call (no extra hop):
    //  - complexity → model routing (simple → Haiku, complex → Sonnet)
    //  - domains    → intent routing (which tool subset the request needs)
    const classification = await withSpan(
      'portal.classify',
      { clientId: client.id },
      () => classifyPortalRequest(message.trim(), anthropic),
    );
    const loopModel = classification.complexity === 'simple' ? HAIKU : SONNET;

    // Intent router: the subset the router would hand the loop. In 'shadow'
    // mode we still pass the full surface and only record what we *would* have
    // selected; in 'active' mode the loop actually gets just this subset.
    // Empty domains → toolsForDomains returns the full set (fail-open).
    const routedTools = toolsForDomains(classification.domains, PORTAL_TOOLS);
    const loopTools = ROUTER_MODE === 'active' ? routedTools : PORTAL_TOOLS;

    // Agentic tool loop. Seed token totals with the classifier spend so
    // platform-keyed credit deduction stays accurate.
    let finalText = '';
    const allToolCalls: { name: string; input: Record<string, unknown>; result: unknown }[] = [];
    let totalInputTokens = classification.inputTokens;
    let totalOutputTokens = classification.outputTokens;

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
        model: loopModel,
        max_tokens: 2048,
        system: PORTAL_CHAT_SYSTEM_PROMPT,
        tools: loopTools,
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
          const result = await withSpan(
            'portal.tool',
            { tool: block.name, clientId: client.id },
            () =>
              executePortalTool(
                block.name,
                block.input as Record<string, unknown>,
                client.id,
                userId,
                { source: 'assistant' },
              ),
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

    // Intent-router accuracy signal. Compare the domains the router predicted
    // against the domains the loop's tool calls actually touched. A "miss" is
    // a tool the model needed from a domain the router did NOT select — in
    // 'active' mode that tool would have been unavailable. This is the data the
    // ADR gate wants before flipping ROUTER_MODE to 'active'.
    const usedDomains = domainsOfToolCalls(allToolCalls);
    const predicted = new Set(classification.domains);
    const routerMisses = usedDomains.filter((d) => !predicted.has(d));
    startSpan('portal.route', {
      clientId: client.id,
      mode: ROUTER_MODE,
      predictedDomains: classification.domains.join(',') || '(none)',
      usedDomains: usedDomains.join(',') || '(none)',
      routedToolCount: routedTools.length,
      totalToolCount: PORTAL_TOOLS.length,
      misses: routerMisses.join(',') || '(none)',
      hit: routerMisses.length === 0,
    }).end();

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
        model: loopModel,
        router: {
          mode: ROUTER_MODE,
          domains: classification.domains,
          routedToolCount: routedTools.length,
          totalToolCount: PORTAL_TOOLS.length,
          misses: routerMisses,
        },
        creditsRemaining,
      },
    });
  } catch (err) {
    console.error('[POST /api/portal/ai/chat]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
