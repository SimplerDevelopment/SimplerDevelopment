/**
 * POST /api/portal/brain/agent
 *
 * Streaming SSE agentic route for the Company Brain Agent.
 *
 * Auth: session cookie or Bearer token — delegated to `requireBrainEntitlement`,
 * which wraps `authorizePortal`. Staff (admin / employee) are permitted because
 * the brain is internal company use (contrast: client chat widget blocks staff).
 *
 * Request body:
 *   { message: string; conversationId?: number }
 *
 * Response: `text/event-stream` with frames:
 *   { type: 'tool_start'; name: string; label: string }
 *   { type: 'tool_end';   name: string }
 *   { type: 'token';      text: string }
 *   { type: 'done';       conversationId: number; tokensUsed: number }
 *   { type: 'error';      message: string }
 *
 * Agentic loop guards: MAX_LOOPS=8, MAX_TOOL_CALLS=20 (same as portal chat).
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
import { BRAIN_TOOLS, executeBrainTool } from '@/lib/ai/brain-tools';
import { classifyIntent } from '@/lib/ai/brain-tools/classifier';
import { generatePlan } from '@/lib/ai/brain-tools/planner';
import { checkGroundedness } from '@/lib/ai/brain-tools/grounder';
import { getAgentPreferences, trackIntentUsage } from '@/lib/brain/agent-preferences';
import { formatPreferencesForPrompt } from '@/lib/brain/agent-preferences-api';
import { withSpan } from '@/lib/ai/tracer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Frame types ───────────────────────────────────────────────────────────────

type AgentFrame =
  | { type: 'tool_start'; name: string; label: string }
  | { type: 'tool_end'; name: string }
  | { type: 'token'; text: string }
  | { type: 'done'; conversationId: number; tokensUsed: number }
  | { type: 'error'; message: string }
  | { type: 'intent'; intent: string; complexity: 'simple' | 'complex'; reasoning: string }
  | { type: 'plan'; steps: Array<{ action: string; tool: string; reasoning: string }> }
  | { type: 'confidence'; score: number; grounded: boolean; uncertain: boolean };

// ── Human-readable labels for tool_start frames ───────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  brain_search: 'Searching Brain...',
  brain_dashboard_summary: 'Loading summary...',
  brain_get_note: 'Reading note...',
  brain_create_note: 'Creating note...',
  brain_list_decisions: 'Loading decisions...',
  brain_get_decision: 'Reading decision...',
  brain_list_people: 'Finding people...',
  brain_lookup_glossary: 'Looking up term...',
  brain_list_glossary: 'Loading glossary...',
  brain_list_initiatives: 'Loading initiatives...',
  brain_list_tasks: 'Loading tasks...',
  brain_create_task: 'Creating task...',
};

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Company Brain Agent — an AI embedded inside the Company Brain portal. You have access to the organization's full knowledge base: notes, decisions, people, glossary, initiatives, tasks, and playbooks.

Always use the appropriate tool before answering — never guess or fabricate data. When you retrieve an entity with an ID, link to it:
- Note → [title](/portal/brain/knowledge?id={id})
- Decision → [title](/portal/brain/decisions/{id})
- Person → [name](/portal/brain/people/{id})
- Initiative → [title](/portal/brain/initiatives/{id})
- Task → [title](/portal/brain/tasks?id={id})

For write actions (create_note, create_task), summarize what you're about to create and wait for the user to confirm before calling the tool.

Be concise and direct. Use bullet lists for multiple items. Format dates as "Month Day, Year".`;

// ── Constants ─────────────────────────────────────────────────────────────────

const SONNET = 'claude-sonnet-4-6';
const HAIKU = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 2048;
const MAX_LOOPS = 8;
const MAX_TOOL_CALLS = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ success: false, message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  // ── 1. Auth + brain entitlement (staff are allowed here).
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

  // ── 3. Plan-gate (Starter without BYOK is blocked).
  const gate = await checkAiPlanGate({ clientId: client.id, provider: 'anthropic' });
  if (!gate.allowed) {
    return jsonError(402, gate.message ?? 'AI access is not available on the current plan.');
  }

  // ── 4. Resolve key (BYOK > platform).
  const resolved = await resolveClientApiKey({ clientId: client.id, provider: 'anthropic' });

  // Credit balance check only for platform-keyed calls.
  if (resolved.source === 'platform') {
    const ok = await hasCredits(client.id);
    if (!ok) {
      const bal = await getBalance(client.id);
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Insufficient AI credits. Purchase more credits, enable pay-as-you-go, or add a BYOK key in Settings → API Keys.',
          creditsRemaining: bal.balance,
        }),
        { status: 402, headers: { 'Content-Type': 'application/json' } },
      );
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
    if (!conv || conv.clientId !== client.id) {
      return jsonError(404, 'Conversation not found');
    }
    convId = conv.id;
  } else {
    const title = message.slice(0, 80);
    const [conv] = await db
      .insert(aiConversations)
      .values({ clientId: client.id, title })
      .returning();
    convId = conv.id;
  }

  // ── 6. Load history + build message list.
  const history = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, convId))
    .orderBy(asc(aiMessages.createdAt));

  const anthropicMessages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));
  anthropicMessages.push({ role: 'user', content: message });

  // Persist user message now so a mid-stream disconnect doesn't lose it.
  await db.insert(aiMessages).values({
    conversationId: convId,
    role: 'user',
    content: message,
    inputTokens: 0,
    outputTokens: 0,
  });
  await db
    .update(aiConversations)
    .set({ updatedAt: new Date() })
    .where(eq(aiConversations.id, convId));

  const anthropic = new Anthropic({ apiKey: resolved.key });

  // ── 7. SSE stream with agentic tool loop.
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const write = (frame: AgentFrame) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));

      let finalText = '';
      const allToolCalls: { name: string; input: Record<string, unknown>; result: unknown }[] = [];
      const toolResultsCollected: string[] = [];
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let finalized = false;

      const finalize = async (errMessage?: string) => {
        if (finalized) return;
        finalized = true;

        // Persist assistant turn (best-effort).
        try {
          if (finalText.length > 0) {
            await db.insert(aiMessages).values({
              conversationId: convId,
              role: 'assistant',
              content: finalText,
              toolCalls: allToolCalls.length > 0 ? allToolCalls : null,
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
            });
          }
          await db
            .update(aiConversations)
            .set({
              totalInputTokens: sql`${aiConversations.totalInputTokens} + ${totalInputTokens}`,
              totalOutputTokens: sql`${aiConversations.totalOutputTokens} + ${totalOutputTokens}`,
              updatedAt: new Date(),
            })
            .where(eq(aiConversations.id, convId));
        } catch (persistErr) {
          console.error('[brain/agent] persist error', persistErr);
        }

        // Credits + audit (best-effort, platform-key only).
        const totalTokens = totalInputTokens + totalOutputTokens;
        if (resolved.source === 'platform' && totalTokens > 0) {
          try {
            await deductCredits(
              client.id,
              totalTokens,
              'ai',
              String(convId),
              `Brain Agent #${convId}`,
            );
          } catch (creditErr) {
            console.error('[brain/agent] deduct error', creditErr);
          }
        }
        void recordAiUsage({ clientId: client.id, source: resolved.source, tokens: totalTokens });

        try {
          if (errMessage) {
            write({ type: 'error', message: errMessage });
          }
          write({ type: 'done', conversationId: convId, tokensUsed: totalTokens });
          controller.close();
        } catch {
          /* already closed */
        }
      };

      try {
        // ── Load user preferences (long-term memory).
        const prefs = await getAgentPreferences(client.id);
        const prefsText = formatPreferencesForPrompt(prefs);

        // ── Pre-loop Step A: classify intent.
        const classification = await withSpan(
          'brain_agent.classify',
          { clientId: client.id, convId },
          () => classifyIntent(message, client.id),
        );
        write({
          type: 'intent',
          intent: classification.intent,
          complexity: classification.complexity,
          reasoning: classification.reasoning,
        });

        // Track intent for long-term preference memory (fire-and-forget).
        void trackIntentUsage(client.id, classification.intent);

        // Route to Haiku for simple queries, Sonnet for complex ones.
        const loopModel = classification.complexity === 'simple' ? HAIKU : SONNET;

        // ── Pre-loop Step B: generate plan for complex queries.
        let systemPrompt = SYSTEM_PROMPT + prefsText;
        if (classification.complexity === 'complex') {
          const plan = await withSpan(
            'brain_agent.plan',
            { clientId: client.id, convId, intent: classification.intent },
            () => generatePlan(message, classification.intent, anthropic),
          );
          if (plan.steps.length > 0) {
            write({ type: 'plan', steps: plan.steps });
            const planText = plan.steps
              .map((s, i) => `${i + 1}. ${s.action} (tool: ${s.tool})`)
              .join('\n');
            systemPrompt = `${SYSTEM_PROMPT}\n\n## Your plan for this query\n${planText}`;
          }
        }

        let currentMessages = [...anthropicMessages];
        let loopCount = 0;
        let toolCallCount = 0;

        while (loopCount < MAX_LOOPS) {
          loopCount++;

          // For the final text turn (no tool use expected), stream tokens.
          // For intermediate turns (tool use), collect non-streaming to avoid
          // interleaved SSE frames from parallel tool fan-out.
          const isLikelyFinalTurn = loopCount > 1;

          if (isLikelyFinalTurn) {
            // Use streaming for the final text-generating turn.
            const sdkStream = anthropic.messages.stream({
              model: loopModel,
              max_tokens: MAX_TOKENS,
              system: systemPrompt,
              tools: BRAIN_TOOLS,
              messages: currentMessages,
            });

            let stopReason: string | null = null;
            // Use a mutable accumulation type; cast to Anthropic.ContentBlock when passing to SDK.
            type MutableTextBlock = { type: 'text'; text: string };
            type MutableToolBlock = { type: 'tool_use'; id: string; name: string; input: Record<string, unknown>; _rawInput?: string };
            type MutableBlock = MutableTextBlock | MutableToolBlock;
            const contentBlocks: MutableBlock[] = [];
            let streamInputTokens = 0;
            let streamOutputTokens = 0;

            for await (const event of sdkStream) {
              if (event.type === 'message_start') {
                streamInputTokens = event.message.usage.input_tokens ?? 0;
                streamOutputTokens = event.message.usage.output_tokens ?? 0;
              } else if (event.type === 'content_block_start') {
                if (event.content_block.type === 'text') {
                  contentBlocks.push({ type: 'text', text: '' });
                } else if (event.content_block.type === 'tool_use') {
                  contentBlocks.push({
                    type: 'tool_use',
                    id: event.content_block.id,
                    name: event.content_block.name,
                    input: {},
                  });
                }
              } else if (event.type === 'content_block_delta') {
                const block = contentBlocks[event.index];
                if (event.delta.type === 'text_delta' && block?.type === 'text') {
                  (block as MutableTextBlock).text += event.delta.text;
                  finalText += event.delta.text;
                  write({ type: 'token', text: event.delta.text });
                } else if (event.delta.type === 'input_json_delta' && block?.type === 'tool_use') {
                  // Accumulate tool input JSON — will be parsed after stream ends.
                  const toolBlock = block as MutableToolBlock;
                  toolBlock._rawInput = (toolBlock._rawInput ?? '') + event.delta.partial_json;
                }
              } else if (event.type === 'message_delta') {
                if (event.usage?.output_tokens) {
                  streamOutputTokens = event.usage.output_tokens;
                }
                if (event.delta.stop_reason) {
                  stopReason = event.delta.stop_reason;
                }
              }
            }

            totalInputTokens += streamInputTokens;
            totalOutputTokens += streamOutputTokens;

            // Parse accumulated tool input JSON.
            for (const block of contentBlocks) {
              if (block.type === 'tool_use') {
                const rawBlock = block as MutableToolBlock;
                try {
                  rawBlock.input = rawBlock._rawInput ? JSON.parse(rawBlock._rawInput) as Record<string, unknown> : {};
                } catch {
                  rawBlock.input = {};
                }
              }
            }

            if (stopReason === 'tool_use') {
              // Still have tool calls even in "likely final" turn — handle them.
              const toolUseBlocks = contentBlocks.filter(
                (b): b is MutableToolBlock => b.type === 'tool_use',
              );

              toolCallCount += toolUseBlocks.length;
              if (toolCallCount > MAX_TOOL_CALLS) {
                write({ type: 'error', message: 'Tool call limit exceeded.' });
                await finalize();
                return;
              }

              const toolResults: Anthropic.ToolResultBlockParam[] = [];
              for (const block of toolUseBlocks) {
                write({ type: 'tool_start', name: block.name, label: TOOL_LABELS[block.name] ?? block.name });
                const result = await withSpan(
                  `brain_tool.${block.name}`,
                  { clientId: client.id, convId, toolName: block.name },
                  () => executeBrainTool(block.name, block.input, client.id, userId),
                );
                write({ type: 'tool_end', name: block.name });
                toolResultsCollected.push(result);
                allToolCalls.push({ name: block.name, input: block.input, result });
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: result,
                });
              }

              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content: contentBlocks as Anthropic.ContentBlock[] },
                { role: 'user', content: toolResults },
              ];
              // Reset finalText — the text we accumulated was pre-tool partial;
              // the next turn will be the real final answer.
              finalText = '';
              continue;
            }

            // end_turn — we're done.
            break;
          } else {
            // First turn: use non-streaming create() to detect tool use cleanly
            // before emitting any SSE frames.
            const response = await anthropic.messages.create({
              model: loopModel,
              max_tokens: MAX_TOKENS,
              system: systemPrompt,
              tools: BRAIN_TOOLS,
              messages: currentMessages,
            });

            totalInputTokens += response.usage.input_tokens;
            totalOutputTokens += response.usage.output_tokens;

            if (response.stop_reason === 'tool_use') {
              const toolUseBlocks = response.content.filter(
                (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
              );

              toolCallCount += toolUseBlocks.length;
              if (toolCallCount > MAX_TOOL_CALLS) {
                write({ type: 'error', message: 'Tool call limit exceeded.' });
                await finalize();
                return;
              }

              const toolResults: Anthropic.ToolResultBlockParam[] = [];
              for (const block of toolUseBlocks) {
                write({ type: 'tool_start', name: block.name, label: TOOL_LABELS[block.name] ?? block.name });
                const result = await withSpan(
                  `brain_tool.${block.name}`,
                  { clientId: client.id, convId, toolName: block.name },
                  () => executeBrainTool(block.name, block.input as Record<string, unknown>, client.id, userId),
                );
                write({ type: 'tool_end', name: block.name });
                toolResultsCollected.push(result);
                allToolCalls.push({ name: block.name, input: block.input as Record<string, unknown>, result });
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: result,
                });
              }

              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content: response.content },
                { role: 'user', content: toolResults },
              ];
              continue;
            }

            // end_turn with no tool use on first pass — stream text on next
            // iteration, or just collect it here.
            finalText = response.content
              .filter((b): b is Anthropic.TextBlock => b.type === 'text')
              .map((b) => b.text)
              .join('');

            // Emit all text as tokens so the client gets something.
            if (finalText) {
              write({ type: 'token', text: finalText });
            }
            break;
          }
        }

        if (loopCount >= MAX_LOOPS && !finalized) {
          write({ type: 'error', message: 'Agent loop limit reached. Please try again.' });
        }

        // ── Post-loop: groundedness check.
        if (finalText) {
          const grounding = await withSpan(
            'brain_agent.groundedness',
            { clientId: client.id, convId, loopModel },
            () => checkGroundedness(message, finalText, toolResultsCollected.join('\n---\n'), anthropic),
          );
          write({
            type: 'confidence',
            score: grounding.confidence,
            grounded: grounding.grounded,
            uncertain: grounding.uncertain,
          });

          if (grounding.uncertain) {
            finalText = `I don't have enough reliable information in the Company Brain to answer this with confidence.\n\n${finalText}`;
          }
        }

        await finalize();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Stream error';
        console.error('[brain/agent] inference error', err);
        await finalize(msg);
      }
    },
    cancel() {
      // Client disconnected — finalize() is idempotent.
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
