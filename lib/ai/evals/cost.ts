/**
 * Per-model cost rates for the eval-run cost rollup.
 *
 * Each eval suite's core calls a specific Claude model; the cost of a run should
 * use THAT model's rate, not a single blended number. Rates come from the
 * published Claude model pricing. Unknown suites/models fall back to the Sonnet
 * blended rate (which is what the rollup used before this existed).
 *
 * ponytail: SUITE_MODEL is a static map, kept dependency-free on purpose — the
 * eval framework doesn't record which model a run used, and importing the suite
 * cores here would drag in @/lib/db (the cost path stays light). Keep it in sync
 * with each core's MODEL constant; `tests/unit/eval-cost.test.ts` pins the
 * expected pricing so a wrong entry fails CI.
 *
 * Approximation: a suite's LLM-judge scorer may use a cheaper model
 * (env.judgeModel, default Haiku); judge tokens are folded into the suite's
 * primary-model rate here rather than priced separately.
 */
export interface ModelRate {
  /** USD per million input tokens. */
  input: number;
  /** USD per million output tokens. */
  output: number;
}

/** USD per MILLION tokens, from the Claude model pricing catalogue. */
export const MODEL_RATES: Record<string, ModelRate> = {
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

/** Blended Sonnet-tier fallback for unknown models (the prior flat rate). */
export const FALLBACK_RATE: ModelRate = { input: 3, output: 15 };

export function modelRate(model: string | undefined): ModelRate {
  return (model && MODEL_RATES[model]) || FALLBACK_RATE;
}

/** Which model each eval suite's core actually calls (keep in sync with the cited file). */
export const SUITE_MODEL: Record<string, string> = {
  'meeting-extractor': 'claude-sonnet-4-5', // lib/ai/meeting-processor.ts → MODEL
  'branding-messaging': 'claude-sonnet-4-6', // lib/branding/generators.ts → MODEL
  'branding-theme': 'claude-sonnet-4-6', // lib/branding/generators.ts → MODEL
  'deck-generator': 'claude-sonnet-4-6', // lib/ai/pitch-deck-generate.ts → MODEL
};

/** Estimated USD cost of a run's token usage, priced by the suite's model. */
export function estimateCostUsd(suiteId: string, inputTokens: number, outputTokens: number): number {
  const rate = modelRate(SUITE_MODEL[suiteId]);
  return (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
}
