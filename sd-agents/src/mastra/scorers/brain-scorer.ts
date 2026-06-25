import { z } from 'zod';
import { createScorer } from '@mastra/core/evals';
import {
  extractToolCalls,
  getUserMessageFromRunInput,
  getAssistantMessageFromRunOutput,
} from '@mastra/evals/scorers/utils';

/**
 * Eval scorers for the SimplerDevelopment agents (Brain + Portal).
 *
 * These are the Mastra **eval layer** — they grade runs (sampled) and surface in
 * Studio, separate from the runtime groundedness gate inside the Brain workflow.
 * They answer "are my prompt/model changes actually getting better?".
 */
const JUDGE_MODEL = process.env.SD_SCORER_MODEL ?? 'anthropic/claude-haiku-4-5';

/**
 * Code scorer: did the agent ground its answer in at least one tool call?
 * These agents should never answer org-specific questions from memory — a run
 * with zero tool calls scores 0.
 */
export const toolGroundingScorer = createScorer({
  id: 'tool-grounding',
  name: 'Tool Grounding',
  description: 'Scores 1 when the agent called at least one tool, 0 otherwise.',
  type: 'agent',
})
  .preprocess(({ run }) => {
    const { tools } = extractToolCalls(run.output);
    return { toolCount: tools.length, tools };
  })
  .generateScore(({ results }) => {
    const r = (results as any)?.preprocessStepResult || {};
    return r.toolCount > 0 ? 1 : 0;
  })
  .generateReason(({ results, score }) => {
    const r = (results as any)?.preprocessStepResult || {};
    return `Tools called: ${r.toolCount ?? 0}${r.tools?.length ? ` (${r.tools.join(', ')})` : ''}. Score=${score}.`;
  });

/**
 * LLM-judged scorer: is the answer grounded in the tool results, vs. invented or
 * over-hedged? Mirrors the runtime grounder, but as an observe-only eval.
 */
export const groundednessScorer = createScorer({
  id: 'answer-groundedness',
  name: 'Answer Groundedness',
  description: 'Judges whether the answer is supported by the tools used and not hallucinated.',
  type: 'agent',
  judge: {
    model: JUDGE_MODEL,
    instructions:
      'You evaluate whether an AI assistant answer is grounded in the tools it called. ' +
      'A grounded answer is supported by tool results; an ungrounded one invents facts or ' +
      'answers org-specific questions with no tools. Return only the structured JSON.',
  },
})
  .preprocess(({ run }) => {
    const { tools } = extractToolCalls(run.output);
    return {
      userText: getUserMessageFromRunInput(run.input) || '',
      assistantText: getAssistantMessageFromRunOutput(run.output) || '',
      tools,
    };
  })
  .analyze({
    description: 'Judge groundedness of the answer against the tools used.',
    outputSchema: z.object({
      grounded: z.boolean(),
      hedged: z.boolean().describe('Answer dodges/over-hedges instead of answering.'),
      confidence: z.number().min(0).max(1).default(0.5),
      explanation: z.string().default(''),
    }),
    createPrompt: ({ results }) => `
      Evaluate whether this assistant answer is grounded.

      User question:
      """${results.preprocessStepResult.userText}"""

      Assistant answer:
      """${results.preprocessStepResult.assistantText}"""

      Tools the assistant called: ${results.preprocessStepResult.tools.join(', ') || '(none)'}

      Judge:
      - grounded: is the answer supported by those tool calls (true) or invented (false)?
      - hedged: does it dodge instead of answering?
      - confidence: 0-1 your confidence the answer is correct and supported.
      Return JSON: { "grounded": boolean, "hedged": boolean, "confidence": number, "explanation": string }
    `,
  })
  .generateScore(({ results }) => {
    const r = (results as any)?.analyzeStepResult || {};
    if (!r.grounded) return 0;
    let s = r.confidence ?? 0.5;
    if (r.hedged) s *= 0.7;
    return Math.max(0, Math.min(1, s));
  })
  .generateReason(({ results, score }) => {
    const r = (results as any)?.analyzeStepResult || {};
    return `grounded=${r.grounded ?? false}, hedged=${r.hedged ?? false}, confidence=${r.confidence ?? 0}. Score=${score}. ${r.explanation ?? ''}`;
  });

export const sdScorers = {
  toolGroundingScorer,
  groundednessScorer,
};
