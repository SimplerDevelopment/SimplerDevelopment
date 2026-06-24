/**
 * Generic prompt-eval framework — core types.
 *
 * Generalizes the one-off Company Brain eval runner
 * (`lib/ai/brain-tools/eval/runner.ts`) into a reusable shape so ANY runtime
 * LLM prompt can be evaluated the same way:
 *
 *   suite  = { how to run the prompt for one input } + { cases } + { scorers }
 *   runner = drives every case through the suite, applies the scorers, and
 *            aggregates metrics into a report.
 *
 * A "scorer" is a pure-ish function over the model output; bundling several
 * scorers per suite lets you mix cheap deterministic checks (schema
 * conformance, required fields) with expensive judgment (LLM-as-judge) and get
 * one metrics surface. See `scorers.ts` for the built-in factories.
 */
import type { EvalEnv } from './env';

export type { EvalEnv };

/** One scorer's verdict on one case's output. */
export interface ScoreResult {
  /** Scorer name (stable key used in aggregate metrics). */
  scorer: string;
  /** Normalized 0..1 quality for this dimension. */
  score: number;
  /** Did this dimension meet its bar? Drives the case pass/fail. */
  passed: boolean;
  /**
   * Scorer did not run (e.g. an LLM-judge under `--mock`, or a missing key).
   * Skipped scorers are EXCLUDED from pass-rate and aggregate so a mock run
   * never fakes a quality signal it didn't measure.
   */
  skipped?: boolean;
  /** Human-readable reason, shown on failures. */
  detail?: string;
}

/** Everything a scorer can see about a single executed case. */
export interface ScoreContext<I = unknown, O = unknown> {
  caseId: string;
  input: I;
  /** The model output, or null if the run errored. */
  output: O | null;
  /** Suite-defined expected value(s) some scorers compare against. */
  expected?: unknown;
  /** Error message if the prompt call threw. */
  error?: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  /** The run env — lets LLM-judge scorers reach the API key / mock flag. */
  env: EvalEnv;
}

export interface Scorer<I = unknown, O = unknown> {
  name: string;
  /** Weight in the suite's aggregate score (default 1). */
  weight?: number;
  score(ctx: ScoreContext<I, O>): ScoreResult | Promise<ScoreResult>;
}

export interface EvalCase<I = unknown, O = unknown> {
  id: string;
  input: I;
  /** Expected value(s) passed to scorers via `ScoreContext.expected`. */
  expected?: unknown;
  tags?: string[];
  /** Canned output returned in `--mock` mode so the pipeline runs offline. */
  mockOutput?: O;
}

export interface EvalSuite<I = unknown, O = unknown> {
  id: string;
  description: string;
  cases: EvalCase<I, O>[];
  scorers: Scorer<I, O>[];
  /**
   * Invoke the REAL prompt function for one case's input. Only called in live
   * mode — under `--mock` the runner uses `case.mockOutput` and never calls
   * this. Return token counts when the underlying call exposes them.
   */
  run(input: I, env: EvalEnv): Promise<{ output: O; inputTokens?: number; outputTokens?: number }>;
}

// ─── Result shapes ──────────────────────────────────────────────────────────

export interface CaseResult<I = unknown, O = unknown> {
  caseId: string;
  input: I;
  output: O | null;
  error?: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  scores: ScoreResult[];
  /** All non-skipped scorers passed (and at least one ran). */
  passed: boolean;
  /** Weighted mean of non-skipped scores, 0..1. */
  aggregate: number;
  /**
   * Number of times this case was executed (from `EvalEnv.runs`).
   * Present and > 1 only when N>1 variance runs are enabled.
   * Omitted (or 1) for single runs — byte-identical to previous behaviour.
   */
  runs?: number;
  /**
   * Population standard deviation of per-run aggregates.
   * Present when `runs > 1`; 0 for deterministic mocks.
   * Omitted for single runs.
   */
  aggregateStdev?: number;
}

export interface SuiteResult {
  suiteId: string;
  description: string;
  total: number;
  passed: number;
  passRate: number;
  /** Mean of per-case aggregates, 0..1. */
  aggregate: number;
  /** Per-scorer rollup across cases (skipped runs excluded). */
  byScorer: Record<string, { mean: number; passRate: number; ran: number; skipped: number }>;
  avgLatencyMs: number;
  totalTokens: number;
  cases: CaseResult[];
}

export interface EvalReport {
  generatedAt: string;
  mock: boolean;
  suites: SuiteResult[];
  overall: {
    total: number;
    passed: number;
    passRate: number;
    aggregate: number;
    totalTokens: number;
  };
}
