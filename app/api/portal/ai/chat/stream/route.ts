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
 *   { type: 'tool_call', tool, args, id }      — (Phase 4 — currently never emitted; tools disabled in stream path)
 *   { type: 'tool_result', id, output }        — (Phase 4)
 *   { type: 'done', conversationId, tokensUsed, creditsRemaining? }
 *   { type: 'error', message }                 — terminal error frame
 *
 * Each frame: `data: <json>\n\n`. The `done` frame is always last.
 *
 * Phase 3 deliberately ships text-only streaming. The agentic tool loop in
 * the non-streaming sibling is intentionally NOT replicated here — adding
 * tool execution to a streaming endpoint requires multi-turn fan-out
 * handling that's out of scope. Phase 4 will wire `PORTAL_TOOLS` +
 * `executePortalTool` and emit `tool_call` / `tool_result` frames.
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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `You are the SimplerDevelopment portal AI assistant for this user's client. Be concise, professional, and helpful. Format currency as dollars (e.g. $1,200.00). Format dates human-friendly (e.g. "March 15, 2026"). Use markdown sparingly — bullet lists are fine for multiple items, but skip bold/headers for one-line answers. If a request is outside your scope, suggest the user contact the team directly.`;

const MODEL = 'claude-opus-4-7';
const MAX_TOKENS = 2048;

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
      const userId_ = userId; // closure capture (referenced in finalize)
      void userId_;

      const finalize = async (errMessage?: string) => {
        if (finalized) return;
        finalized = true;

        // Persist assistant turn (best-effort).
        try {
          if (assistantText.length > 0) {
            await db.insert(aiMessages).values({
              conversationId: convId,
              role: 'assistant',
              content: assistantText,
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

        // `anthropic.messages.stream` returns a MessageStream with both an
        // EventEmitter API and an async iterator. Using the iterator keeps
        // back-pressure clean and avoids relying on EventEmitter timing.
        const sdkStream = anthropic.messages.stream({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: sysParam,
          messages: anthropicMessages,
        });

        for await (const event of sdkStream) {
          if (event.type === 'content_block_delta') {
            const delta = event.delta;
            if (delta.type === 'text_delta' && delta.text) {
              assistantText += delta.text;
              controller.enqueue(
                encoder.encode(sseFrame({ type: 'token', text: delta.text })),
              );
            }
            // input_json_delta (tool args) is ignored in Phase 3 — tools
            // aren't enabled on this stream call so this branch is dead today.
          } else if (event.type === 'message_delta') {
            // usage is cumulative output_tokens by spec
            if (event.usage?.output_tokens) {
              outputTokens = event.usage.output_tokens;
            }
          } else if (event.type === 'message_start') {
            inputTokens = event.message.usage.input_tokens ?? 0;
            // initial output_tokens (usually 1) — overwritten by message_delta
            outputTokens = event.message.usage.output_tokens ?? 0;
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
