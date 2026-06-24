/**
 * Eval run environment — the knobs shared by the runner, suites, and scorers.
 *
 * Kept in its own module (not `types.ts`) so scorers can import it without a
 * cycle through the suite/result types.
 */
export interface EvalEnv {
  /** Anthropic key for suites that take one directly + for LLM-judge scorers. */
  anthropicApiKey?: string;
  /**
   * Tenant id for suites whose prompt fn resolves a BYOK key by client
   * (e.g. the automation parser). Omit to use the platform key.
   */
  clientId?: number;
  /** Skip live model calls: suites return `case.mockOutput`, judges skip. */
  mock?: boolean;
  /** Model id for LLM-judge scorers (default Haiku — cheap, good enough). */
  judgeModel?: string;
  /**
   * How many times to run each case; aggregate mean ± stddev reported.
   * Default 1 — single run, byte-identical to previous behaviour.
   */
  runs?: number;
}
