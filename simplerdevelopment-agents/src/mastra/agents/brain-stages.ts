import { Agent } from '@mastra/core/agent';
import { z } from 'zod';

/**
 * The three "thin" LLM stages that bracket the Brain agent's tool-loop, ported
 * from the parent app's hand-rolled `lib/ai/brain-tools/` pipeline:
 *
 *   classify (intent + complexity)  →  plan (complex only)  →  [tool-loop]  →  ground
 *
 * Each is a small, fast Claude Haiku agent that returns a typed object via
 * Mastra's `structuredOutput`. None of them have tools — they only reason.
 */
const FAST_MODEL = process.env.SD_BRAIN_FAST_MODEL ?? 'anthropic/claude-haiku-4-5';

// --- 1. Intent classifier ----------------------------------------------------

export const intentSchema = z.object({
  intent: z.enum(['lookup', 'capture', 'planning', 'people', 'procedural', 'summary']),
  complexity: z.enum(['simple', 'complex']),
  reasoning: z.string().describe('One sentence on why.'),
});
export type Intent = z.infer<typeof intentSchema>;

export const classifierAgent = new Agent({
  id: 'brain-classifier',
  name: 'Brain Intent Classifier',
  instructions: `Classify a Company Brain query.
- intent: lookup (find info), capture (save something), planning (tasks/initiatives), people (who/expertise), procedural (how-to), summary (overview/digest).
- complexity: "complex" when answering needs multiple lookups, cross-referencing, or planning; otherwise "simple".
Return only the structured fields.`,
  model: FAST_MODEL,
});

export async function classifyIntent(query: string): Promise<Intent> {
  const { object } = await classifierAgent.generate(query, {
    structuredOutput: { schema: intentSchema },
  });
  return object;
}

// --- 2. Planner (only invoked for complex queries) ---------------------------

export const planSchema = z.object({
  steps: z.array(z.string()).max(5).describe('Ordered, concrete steps to answer the query.'),
});

export const plannerAgent = new Agent({
  id: 'brain-planner',
  name: 'Brain Planner',
  instructions: `Break a complex Company Brain query into at most 5 ordered, concrete steps.
Each step names exactly what to look up or do. No prose, no preamble.`,
  model: FAST_MODEL,
});

export async function generatePlan(query: string): Promise<string[]> {
  const { object } = await plannerAgent.generate(query, {
    structuredOutput: { schema: planSchema },
  });
  return object.steps;
}

// --- 3. Groundedness checker (runs after the tool-loop) ----------------------

export const groundednessSchema = z.object({
  confidence: z.number().min(0).max(1),
  grounded: z.boolean().describe('Did the answer rely on tool results vs. invented facts?'),
  uncertain: z.boolean(),
  sources: z.array(z.string()).describe('Tool names that support the answer.'),
});
export type Groundedness = z.infer<typeof groundednessSchema>;

export const grounderAgent = new Agent({
  id: 'brain-grounder',
  name: 'Brain Groundedness Checker',
  instructions: `You grade an AI answer for groundedness against the tools it actually used.
Given the user question, the answer, and the names of tools that were called, judge:
- grounded: true if the answer is supported by tool results, false if it looks invented.
- confidence: 0..1, your confidence the answer is correct and supported.
- uncertain: true if the answer hedges, is incomplete, or no tools were called for a factual question.
- sources: the tool names that support the answer.
Fail closed: when unsure, set uncertain=true and lower confidence.`,
  model: FAST_MODEL,
});

export async function checkGroundedness(input: {
  query: string;
  answer: string;
  toolsCalled: string[];
}): Promise<Groundedness> {
  const prompt = `Question: ${input.query}

Answer: ${input.answer}

Tools called: ${input.toolsCalled.join(', ') || '(none)'}`;
  const { object } = await grounderAgent.generate(prompt, {
    structuredOutput: { schema: groundednessSchema },
  });
  return object;
}
