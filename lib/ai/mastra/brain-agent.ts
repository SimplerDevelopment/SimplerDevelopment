import { Agent } from '@mastra/core/agent';
import { createAnthropic } from '@ai-sdk/anthropic';
import { buildBrainMastraTools } from './brain-tools';

/**
 * In-app Mastra Brain agent loop. This is the piece that replaces the route's
 * hand-rolled `anthropic.messages` tool loop: a Mastra Agent given the native
 * brain tools and a per-tenant Anthropic model (built from the resolved BYOK /
 * platform key). No Mastra memory — the route owns conversation persistence.
 *
 * Mirrors simplerdevelopment-agents' brain agent in spirit, but tenant-keyed + native-tooled
 * for in-process use. The classify / plan / ground stages stay as the app's
 * existing functions (already tenant-aware); this only owns the tool loop.
 */
const SYSTEM_PROMPT = `You are the Company Brain assistant — an agency's internal knowledge base
(notes, decisions, people/expertise, glossary, initiatives, tasks).

- Ground every factual claim with the brain_* tools; never answer org-specific
  questions from memory — search first.
- Prefer brain_search for open lookups; use the specific getters when you have an id.
- Cite what you used (the notes/decisions/people your answer rests on).
- Be concise; answer the question asked.
- For write actions (brain_create_note, brain_create_task), summarize what you're
  about to create and confirm with the user before calling the tool.
- If the tools return nothing relevant, say so plainly rather than guessing.`;

export type BrainLoopResult = {
  text: string;
  toolResults: Array<{ toolName: string; result: unknown }>;
  inputTokens: number;
  outputTokens: number;
};

export async function runBrainLoop(opts: {
  apiKey: string;
  modelId: string;
  clientId: number;
  userId: number;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Optional plan text appended to the system prompt for complex queries. */
  systemExtra?: string;
}): Promise<BrainLoopResult> {
  const anthropic = createAnthropic({ apiKey: opts.apiKey });

  const agent = new Agent({
    id: 'brain-agent-inapp',
    name: 'Company Brain (in-app)',
    instructions: opts.systemExtra ? `${SYSTEM_PROMPT}\n\n${opts.systemExtra}` : SYSTEM_PROMPT,
    model: anthropic(opts.modelId),
    tools: buildBrainMastraTools(opts.clientId, opts.userId),
  });

  // messages are plain {role,content} chat turns; .map() widens role to a union
  // that doesn't narrow to the AI SDK message discriminated union, so cast to the
  // method's own input type (safe: every element is a valid user/assistant turn).
  const res = await agent.generate(opts.messages as Parameters<typeof agent.generate>[0], {
    maxSteps: 8,
  });

  // FullOutput: tool results carry { payload: { toolName, result } }; usage has token counts.
  const toolResults: BrainLoopResult['toolResults'] = (res.toolResults ?? []).map((r) => {
    const payload = (r as { payload?: { toolName?: string; result?: unknown } }).payload;
    return { toolName: payload?.toolName ?? 'unknown', result: payload?.result };
  });

  const usage = (res.totalUsage ?? res.usage) as
    | { inputTokens?: number; outputTokens?: number }
    | undefined;

  return {
    text: res.text,
    toolResults,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
  };
}
