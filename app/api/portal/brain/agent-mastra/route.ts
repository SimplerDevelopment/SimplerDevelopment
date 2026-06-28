/**
 * POST /api/portal/brain/agent-mastra
 *
 * NON-STREAMING Mastra rebuild of the Company Brain agent loop. Phase 1 of
 * wiring the Next app -> Mastra: it reuses the EXACT auth/entitlement/billing
 * lifecycle of the streaming route (/api/portal/brain/agent) and only swaps the
 * hand-rolled anthropic tool loop for a Mastra Agent (lib/ai/mastra/brain-agent).
 *
 * Tools run in-process via executeBrainTool (native, sanitized) — not MCP.
 * The per-tenant key is injected into a Mastra model built from @ai-sdk/anthropic.
 * classify / plan / ground reuse the app's existing tenant-aware functions.
 *
 * Request:  { message: string; conversationId?: number }
 * Response: JSON { success, data: { answer, intent, plan, confidence, conversationId, tokensUsed } }
 *
 * The production streaming route and its frontend contract are untouched.
 * Phase 2 (later): per-token SSE parity + replacing the prod route.
 */
import { eq, asc, sql } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';

import { db } from '@/lib/db';
import { aiConversations, aiMessages } from '@/lib/db/schema';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { resolveClientApiKey } from '@/lib/ai/resolve-client-key';
import { hasCredits, deductCredits, getBalance } from '@/lib/ai-credits';
import { recordAiUsage } from '@/lib/ai/audit';
import { checkAiPlanGate } from '@/lib/ai/plan-gate';
import { classifyIntent } from '@/lib/ai/brain-tools/classifier';
import { generatePlan } from '@/lib/ai/brain-tools/planner';
import { checkGroundedness } from '@/lib/ai/brain-tools/grounder';
import { runBrainLoop } from '@/lib/ai/mastra/brain-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(status: number, message: string, extra?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ success: false, message, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(req: Request): Promise<Response> {
  // ── 1. Auth + brain entitlement (same gate as the streaming route).
  const authResult = await requireBrainEntitlement({ action: 'write' });
  if ('response' in authResult) return authResult.response;
  const { client, userId } = authResult;

  // ── 2. Parse body.
  let message: string;
  let conversationId: number | undefined;
  try {
    const body = (await req.json()) as { message?: unknown; conversationId?: unknown };
    message = typeof body.message === 'string' ? body.message.trim() : '';
    conversationId = typeof body.conversationId === 'number' ? body.conversationId : undefined;
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }
  if (!message) return jsonError(400, 'message is required');

  // ── 3. Plan-gate.
  const gate = await checkAiPlanGate({ clientId: client.id, provider: 'anthropic' });
  if (!gate.allowed) {
    return jsonError(402, gate.message ?? 'AI access is not available on the current plan.');
  }

  // ── 4. Resolve key (BYOK > platform) + credit check (platform only).
  const resolved = await resolveClientApiKey({ clientId: client.id, provider: 'anthropic' });
  if (resolved.source === 'platform') {
    const ok = await hasCredits(client.id);
    if (!ok) {
      const bal = await getBalance(client.id);
      return jsonError(402, 'Insufficient AI credits. Purchase more credits, enable pay-as-you-go, or add a BYOK key in Settings → API Keys.', {
        creditsRemaining: bal.balance,
      });
    }
  }

  // ── 5. Get-or-create conversation.
  let convId: number;
  if (conversationId) {
    const [conv] = await db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.id, conversationId))
      .limit(1);
    if (!conv || conv.clientId !== client.id) return jsonError(404, 'Conversation not found');
    convId = conv.id;
  } else {
    const [conv] = await db
      .insert(aiConversations)
      .values({ clientId: client.id, title: message.slice(0, 80) })
      .returning();
    convId = conv.id;
  }

  // ── 6. Load history, append user turn, persist it.
  const history = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, convId))
    .orderBy(asc(aiMessages.createdAt));

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = history.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));
  messages.push({ role: 'user', content: message });

  await db.insert(aiMessages).values({
    conversationId: convId,
    role: 'user',
    content: message,
    inputTokens: 0,
    outputTokens: 0,
  });
  await db.update(aiConversations).set({ updatedAt: new Date() }).where(eq(aiConversations.id, convId));

  // ── 7. Mastra pipeline: classify → (plan) → Mastra tool loop → ground.
  try {
    const classification = await classifyIntent(message, client.id);
    const plan =
      classification.complexity === 'complex'
        ? await generatePlan(message, classification.intent, client.id)
        : null;

    const modelId =
      classification.complexity === 'complex' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
    const planNote = plan
      ? `Suggested plan:\n${plan.steps.map((s) => `- ${s.action} (${s.tool})`).join('\n')}`
      : undefined;

    const loop = await runBrainLoop({
      apiKey: resolved.key,
      modelId,
      clientId: client.id,
      userId,
      messages,
      systemExtra: planNote,
    });

    // Groundedness check (reuses the app's grounder + the same tenant key).
    const anthropic = new Anthropic({ apiKey: resolved.key });
    const grounded = loop.text
      ? await checkGroundedness(message, loop.text, JSON.stringify(loop.toolResults), anthropic)
      : null;

    // ── 8. Persist assistant turn + bill (mirrors the streaming route's finalize()).
    const totalTokens = loop.inputTokens + loop.outputTokens;
    if (loop.text.length > 0) {
      await db.insert(aiMessages).values({
        conversationId: convId,
        role: 'assistant',
        content: loop.text,
        inputTokens: loop.inputTokens,
        outputTokens: loop.outputTokens,
      });
    }
    await db
      .update(aiConversations)
      .set({
        totalInputTokens: sql`${aiConversations.totalInputTokens} + ${loop.inputTokens}`,
        totalOutputTokens: sql`${aiConversations.totalOutputTokens} + ${loop.outputTokens}`,
        updatedAt: new Date(),
      })
      .where(eq(aiConversations.id, convId));

    if (resolved.source === 'platform' && totalTokens > 0) {
      try {
        await deductCredits(client.id, totalTokens, 'ai', String(convId), `Brain Agent (mastra) #${convId}`);
      } catch (creditErr) {
        console.error('[brain/agent-mastra] deduct error', creditErr);
      }
    }
    void recordAiUsage({ clientId: client.id, source: resolved.source, tokens: totalTokens });

    return Response.json({
      success: true,
      data: {
        answer: loop.text,
        intent: classification,
        plan: plan?.steps ?? [],
        confidence: grounded,
        conversationId: convId,
        tokensUsed: totalTokens,
      },
    });
  } catch (err) {
    console.error('[brain/agent-mastra] error', err);
    return jsonError(500, err instanceof Error ? err.message : 'Brain agent failed');
  }
}
