/**
 * POST /api/portal/ai/chat/stream
 *
 * Streaming sibling of `app/api/portal/ai/chat/route.ts`. Same auth model,
 * same plan-gate / BYOK key resolution / credit deduction / persistence —
 * but emits Server-Sent Events so mobile (and any other streaming consumer)
 * can render token-by-token output.
 *
 * Auth: Bearer token (`sd_mcp_…` or `sd_oauth_…`) validated via
 * `resolvePortalFromRequest`. Same path the mobile app's `/api/portal/me`
 * call already uses — see `lib/mcp-auth.ts`.
 *
 * Request body:
 *   {
 *     conversationId?: number,
 *     messages: { role: 'user' | 'assistant', content: string }[]
 *   }
 *
 * The *last* message in `messages[]` must be a `user` message — that's the
 * fresh turn we hand to Claude. Anything earlier is treated as transient
 * client-side history (we still persist it as user/assistant rows on the
 * conversation, but only the last user message is enqueued for inference;
 * server-side `aiMessages` history is the source of truth for replay).
 *
 * Response: `text/event-stream` with these event types, one per SSE frame:
 *   { type: 'token', text: string }            — text delta
 *   { type: 'tool_call', tool, args, id }      — a tool is about to run (args complete)
 *   { type: 'tool_result', id, output }        — that tool's result
 *   { type: 'done', conversationId, tokensUsed, creditsRemaining? }
 *   { type: 'error', message }                 — terminal error frame
 *
 * Each frame: `data: <json>\n\n`. The `done` frame is always last.
 *
 * Tool-calling (Phase 4) is gated by `AI_STREAM_TOOLS_ENABLED=1`. When on,
 * this route runs the same agentic loop as the non-streaming sibling
 * (`PORTAL_TOOLS` + `executePortalTool`), relaying text deltas live and
 * emitting `tool_call` / `tool_result` frames between reasoning turns. When
 * off, it falls back to the original text-only single-pass stream (the loop
 * simply never sees a `tool_use` stop reason, so it runs exactly one turn).
 *
 * NOTE: `executePortalTool` commits writes directly — the only safeguard is
 * the prompt-level confirm-before-write rule in the shared system prompt.
 * Routing AI-authored writes through the human approval queue
 * (`lib/mcp/pending-changes.ts`) is tracked separately as P0.3.
 */

import { eq, asc, sql } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';

import { db } from '@/lib/db';
import { aiConversations, aiMessages } from '@/lib/db/schema';
import { resolvePortalFromRequest } from '@/lib/mcp-auth';
import { hasCredits, deductCredits, getBalance } from '@/lib/ai-credits';
import { resolveClientApiKey } from '@/lib/ai/resolve-client-key';
import { recordAiUsage } from '@/lib/ai/audit';
import { checkAiPlanGate } from '@/lib/ai/plan-gate';
import { PORTAL_TOOLS, executePortalTool } from '@/lib/ai/portal-tools';
import { classifyPortalRequest } from '@/lib/ai/portal-tools/classifier';
import { toolsForDomains } from '@/lib/ai/portal-tools/domains';
import { PORTAL_CHAT_SYSTEM_PROMPT } from '@/lib/ai/portal-chat-prompt';
import { sanitizeToolResult } from '@/lib/ai/brain-tools/sanitizer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Shared with the non-streaming agentic route so tool behavior (linking +
// confirmation rules) can't drift between the two surfaces.
const SYSTEM_PROMPT = PORTAL_CHAT_SYSTEM_PROMPT;

// Phase 4: when enabled, the streaming path mirrors the non-streaming agentic
// loop — emitting `tool_call` / `tool_result` SSE frames the mobile client
// renders. Gated by env so the proven text-only path remains the fallback.
// The agentic loop uses sonnet-4-6 (fast, tool-reliable, matches the
// non-streaming route); text-only mode keeps the prior model.
const STREAM_TOOLS_ENABLED = process.env.AI_STREAM_TOOLS_ENABLED === '1';
const MODEL = STREAM_TOOLS_ENABLED ? 'claude-sonnet-4-6' : 'claude-opus-4-7';
const MAX_TOKENS = 2048;

// Guardrails mirrored from the non-streaming agentic loop — prevent runaway
// reasoning / tool-call storms.
const MAX_LOOPS = 8;
const MAX_TOOL_CALLS = 20;

// Domain-based tool routing, mirroring the non-streaming route. 'shadow' keeps
// the full tool surface (no behavior change); 'active' classifies the request
// and routes to the predicted domains' tools. Unlike the non-streaming route,
// we DON'T run the classifier in 'shadow' mode here — a blocking Haiku call
// before the stream would delay time-to-first-token for telemetry-only value,
// so streaming opts into the cost only when routing actually applies ('active').
const ROUTER_MODE: 'shadow' | 'active' = 'shadow';

// P0.3: when enabled, AI-authored writes are routed through the human approval
// queue (gated per the caller key's `require_cms_approval` flag — see
// executePortalTool). Off → writes commit directly (prior behavior).
const AI_TOOL_APPROVALS_ENABLED = process.env.AI_TOOL_APPROVALS_ENABLED === '1';

interface IncomingMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface IncomingBody {
  conversationId?: number;
  messages?: IncomingMessage[];
}

function sseFrame(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ success: false, message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(req: Request) {
  // ── 1. Auth (bearer-token only — this endpoint is mobile-first).
  const ctx = await resolvePortalFromRequest(req);
  if (!ctx) {
    return jsonError(401, 'Unauthorized');
  }
  const { userId, client } = ctx;

  // ── 2. Parse + validate body.
  let body: IncomingBody;
  try {
    body = (await req.json()) as IncomingBody;
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  if (incoming.length === 0) {
    return jsonError(400, 'messages[] required');
  }
  const lastTurn = incoming[incoming.length - 1];
  if (!lastTurn || lastTurn.role !== 'user' || !lastTurn.content?.trim()) {
    return jsonError(400, 'Last message must be a non-empty user turn');
  }

  // ── 3. Plan-gate (Starter without BYOK is blocked).
  const gate = await checkAiPlanGate({ clientId: client.id, provider: 'anthropic' });
  if (!gate.allowed) {
    return jsonError(402, gate.message ?? 'AI access is not available on the current plan.');
  }

  // ── 4. Resolve key (BYOK > platform).
  const resolved = await resolveClientApiKey({ clientId: client.id, provider: 'anthropic' });

  // Credit balance check only matters for platform-keyed calls.
  if (resolved.source === 'platform') {
    const ok = await hasCredits(client.id);
    if (!ok) {
      return jsonError(402, 'Insufficient AI credits.');
    }
  }

  // ── 5. Get-or-create conversation row.
  let convId: number;
  if (body.conversationId) {
    const [conv] = await db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.id, body.conversationId))
      .limit(1);
    if (!conv || conv.clientId !== client.id) {
      return jsonError(404, 'Conversation not found');
    }
    convId = conv.id;
  } else {
    const title = lastTurn.content.trim().slice(0, 80);
    const [conv] = await db
      .insert(aiConversations)
      .values({ clientId: client.id, title })
      .returning();
    convId = conv.id;
  }

  // ── 6. Build inference message list from server-side history + new turn.
  // (We trust the server's `aiMessages` as the source of truth rather than
  // the client-supplied `messages` — that way the mobile can't accidentally
  // truncate context.)
  const history = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, convId))
    .orderBy(asc(aiMessages.createdAt));

  const anthropicMessages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));
  anthropicMessages.push({ role: 'user', content: lastTurn.content.trim() });

  // Persist the new user message immediately so a mid-stream disconnect
  // doesn't lose it.
  await db.insert(aiMessages).values({
    conversationId: convId,
    role: 'user',
    content: lastTurn.content.trim(),
    inputTokens: 0,
    outputTokens: 0,
  });
  await db
    .update(aiConversations)
    .set({ updatedAt: new Date() })
    .where(eq(aiConversations.id, convId));

  const anthropic = new Anthropic({ apiKey: resolved.key });

  // ── 7. Build SSE stream.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let assistantText = '';
      let inputTokens = 0;
      let outputTokens = 0;
      let finalized = false;
      // Tool calls executed across the agentic loop — persisted on the
      // assistant row (same shape as the non-streaming route) so history +
      // the admin conversation viewer render identically.
      const allToolCalls: { name: string; input: Record<string, unknown>; result: unknown }[] = [];

      const finalize = async (errMessage?: string) => {
        if (finalized) return;
        finalized = true;

        // Persist assistant turn (best-effort).
        try {
          if (assistantText.length > 0 || allToolCalls.length > 0) {
            await db.insert(aiMessages).values({
              conversationId: convId,
              role: 'assistant',
              content: assistantText,
              toolCalls: allToolCalls.length > 0 ? allToolCalls : null,
              inputTokens,
              outputTokens,
            });
          }
          await db
            .update(aiConversations)
            .set({
              totalInputTokens: sql`${aiConversations.totalInputTokens} + ${inputTokens}`,
              totalOutputTokens: sql`${aiConversations.totalOutputTokens} + ${outputTokens}`,
              updatedAt: new Date(),
            })
            .where(eq(aiConversations.id, convId));
        } catch (persistErr) {
          console.error('[ai/chat/stream] persist error', persistErr);
        }

        // Credits + audit (best-effort, platform-key only).
        let creditsRemaining: number | null = null;
        const totalTokens = inputTokens + outputTokens;
        if (resolved.source === 'platform' && totalTokens > 0) {
          try {
            const r = await deductCredits(
              client.id,
              totalTokens,
              'ai',
              String(convId),
              `Chat (stream) #${convId}`,
            );
            creditsRemaining = r.newBalance;
          } catch (creditErr) {
            console.error('[ai/chat/stream] deduct error', creditErr);
            try {
              const bal = await getBalance(client.id);
              creditsRemaining = bal.balance;
            } catch {
              /* swallow */
            }
          }
        }
        void recordAiUsage({
          clientId: client.id,
          source: resolved.source,
          tokens: totalTokens,
        });

        try {
          if (errMessage) {
            controller.enqueue(encoder.encode(sseFrame({ type: 'error', message: errMessage })));
          }
          controller.enqueue(
            encoder.encode(
              sseFrame({
                type: 'done',
                conversationId: convId,
                tokensUsed: totalTokens,
                creditsRemaining,
              }),
            ),
          );
          controller.close();
        } catch {
          /* already closed */
        }
      };

      try {
        // System prompt with prompt-caching breakpoint per Anthropic docs.
        // Even a small system prompt benefits from caching when the same
        // conversation is replayed across multiple user turns.
        const sysParam: Anthropic.TextBlockParam[] = [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ];

        // Agentic loop. With tools disabled (text-only mode) the model never
        // returns stop_reason 'tool_use', so this runs exactly one pass and
        // behaves identically to the prior Phase-3 implementation — we don't
        // even call `finalMessage()` in that case. With tools enabled we stream
        // each turn's text deltas live, then use the SDK's assembled
        // `finalMessage()` (parsed tool_use blocks + stop_reason) to decide
        // whether to run tools and loop, or finalize. Token usage is read from
        // the streamed `message_start` / `message_delta` events either way and
        // accumulated across turns.
        const currentMessages: Anthropic.MessageParam[] = [...anthropicMessages];
        let loopCount = 0;
        let toolCallCount = 0;

        // Resolve the tool surface for this exchange. In 'active' router mode we
        // classify the request (cheap Haiku call) and route to just the
        // predicted domains' tools; 'shadow' keeps the full set with no extra
        // call (protecting time-to-first-token). Classifier failures fail open
        // to the full surface. Used for every turn of the loop.
        let loopTools = PORTAL_TOOLS;
        if (STREAM_TOOLS_ENABLED && ROUTER_MODE === 'active') {
          try {
            const classification = await classifyPortalRequest(lastTurn.content.trim(), anthropic);
            loopTools = toolsForDomains(classification.domains, PORTAL_TOOLS);
            inputTokens += classification.inputTokens;
            outputTokens += classification.outputTokens;
          } catch {
            loopTools = PORTAL_TOOLS;
          }
        }

        while (loopCount < MAX_LOOPS) {
          loopCount++;

          const sdkStream = anthropic.messages.stream({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: sysParam,
            messages: currentMessages,
            ...(STREAM_TOOLS_ENABLED ? { tools: loopTools } : {}),
          });

          // Relay this turn's text deltas live. Only the FINAL turn's text is
          // persisted as the reply (reset per turn) so a tool-use turn's
          // preamble doesn't get double-counted into the saved content.
          let turnText = '';
          let turnInput = 0;
          let turnOutput = 0;
          for await (const event of sdkStream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta' &&
              event.delta.text
            ) {
              turnText += event.delta.text;
              controller.enqueue(
                encoder.encode(sseFrame({ type: 'token', text: event.delta.text })),
              );
            } else if (event.type === 'message_start') {
              turnInput = event.message.usage.input_tokens ?? 0;
              turnOutput = event.message.usage.output_tokens ?? 0;
            } else if (event.type === 'message_delta') {
              // output_tokens is cumulative-for-this-message by spec.
              if (event.usage?.output_tokens) turnOutput = event.usage.output_tokens;
            }
          }
          // Accumulate per-turn usage across the whole agentic exchange.
          inputTokens += turnInput;
          outputTokens += turnOutput;

          // Text-only mode: there is never a tool-use turn, so this is the only
          // pass. Skip `finalMessage()` entirely (keeps behavior — and the test
          // mocks that only implement the async iterator — identical to before).
          if (!STREAM_TOOLS_ENABLED) {
            assistantText = turnText;
            break;
          }

          const msg = await sdkStream.finalMessage();
          if (msg.stop_reason !== 'tool_use') {
            // end_turn / max_tokens — this turn's text is the final reply.
            assistantText = turnText;
            break;
          }

          // stop_reason === 'tool_use' → execute each tool, feed results back.
          const toolUseBlocks = msg.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
          );

          toolCallCount += toolUseBlocks.length;
          if (toolCallCount > MAX_TOOL_CALLS) {
            assistantText = turnText;
            await finalize(
              'Reached the tool-call limit for this turn. Please refine your request.',
            );
            return;
          }

          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of toolUseBlocks) {
            const input = block.input as Record<string, unknown>;
            // Tell the client a tool is running. Args are complete here —
            // parsed from the finalized message, not the partial
            // input_json_delta stream.
            controller.enqueue(
              encoder.encode(
                sseFrame({ type: 'tool_call', tool: block.name, args: input, id: block.id }),
              ),
            );

            let result: unknown;
            try {
              result = await executePortalTool(
                block.name,
                input,
                client.id,
                userId,
                { source: 'assistant', gate: AI_TOOL_APPROVALS_ENABLED ? ctx : undefined },
              );
            } catch (toolErr) {
              // Serialize the failure into the tool_result so the model can
              // recover/retry rather than aborting the whole stream.
              result = {
                error:
                  toolErr instanceof Error ? toolErr.message : 'Tool execution failed',
              };
            }

            allToolCalls.push({ name: block.name, input, result });
            controller.enqueue(
              encoder.encode(sseFrame({ type: 'tool_result', id: block.id, output: result })),
            );
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: sanitizeToolResult(JSON.stringify(result)),
            });
          }

          currentMessages.push(
            { role: 'assistant', content: msg.content },
            { role: 'user', content: toolResults },
          );

          if (loopCount >= MAX_LOOPS) {
            // Hit the reasoning-step cap mid-tool-use; surface what we have.
            assistantText = turnText;
            await finalize(
              'Reached the reasoning-step limit for this turn. The task may be incomplete.',
            );
            return;
          }
        }

        await finalize();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Stream error';
        console.error('[ai/chat/stream] inference error', err);
        await finalize(msg);
      }
    },
    cancel() {
      // Client disconnected mid-stream. Nothing to do — finalize() is
      // idempotent and will have run from the catch path if SDK threw.
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
