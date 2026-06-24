/**
 * Built-in scorer factories for the prompt-eval framework.
 *
 * Three archetypes cover almost every prompt in the codebase:
 *   1. Contract        — does the output parse + conform to a schema? (cheap,
 *                        deterministic, the single biggest reliability win
 *                        given most prompts here use raw JSON.parse).
 *   2. Deterministic   — task-specific assertions via `predicate(...)`
 *                        (right enum chosen, count in range, expected item
 *                        present, latency under budget).
 *   3. Judgment        — `llmJudge(...)`: an LLM grades quality on a rubric.
 *
 * Every scorer returns a normalized 0..1 score + a pass/fail. Compose them per
 * suite; the runner aggregates.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { ZodType } from 'zod';
import type { Scorer, ScoreContext, ScoreResult } from './types';

function result(name: string, score: number, passed: boolean, detail?: string): ScoreResult {
  return { scorer: name, score, passed, detail };
}

/** Resolve a dotted path (supports numeric array indices: `actions.0.tool`). */
function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

// ─── 1. Contract ────────────────────────────────────────────────────────────

/** Pass iff the output parses against the Zod schema. */
export function zodConformance<O = unknown>(schema: ZodType, name = 'schema-conformance'): Scorer<unknown, O> {
  return {
    name,
    score(ctx) {
      if (ctx.error || ctx.output == null) {
        return result(name, 0, false, ctx.error ?? 'no output');
      }
      const parsed = schema.safeParse(ctx.output);
      if (parsed.success) return result(name, 1, true);
      const issues = parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ');
      return result(name, 0, false, issues);
    },
  };
}

/** Score = fraction of the listed paths that are present + non-empty. */
export function requiredFields<O = unknown>(paths: string[], name = 'required-fields'): Scorer<unknown, O> {
  return {
    name,
    score(ctx) {
      if (ctx.output == null) return result(name, 0, false, ctx.error ?? 'no output');
      const missing = paths.filter((p) => isEmpty(getPath(ctx.output, p)));
      const score = paths.length === 0 ? 1 : (paths.length - missing.length) / paths.length;
      return result(name, score, missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : undefined);
    },
  };
}

// ─── 2. Deterministic ───────────────────────────────────────────────────────

/**
 * Task-specific boolean (or partial 0..1) assertion. The callback receives the
 * parsed output plus the full context (so it can read `ctx.expected`).
 */
export function predicate<I = unknown, O = unknown>(
  name: string,
  fn: (output: O, ctx: ScoreContext<I, O>) => boolean | { pass: boolean; score?: number; detail?: string },
): Scorer<I, O> {
  return {
    name,
    score(ctx) {
      if (ctx.output == null) return result(name, 0, false, ctx.error ?? 'no output');
      const r = fn(ctx.output, ctx);
      if (typeof r === 'boolean') return result(name, r ? 1 : 0, r);
      return result(name, r.score ?? (r.pass ? 1 : 0), r.pass, r.detail);
    },
  };
}

/** Pass iff the case ran under the latency budget. Score decays past it. */
export function latencyUnder(ms: number, name = 'latency'): Scorer {
  return {
    name,
    weight: 0, // informational by default — don't drag the quality aggregate
    score(ctx) {
      const passed = ctx.latencyMs <= ms;
      const score = passed ? 1 : Math.max(0, ms / ctx.latencyMs);
      return result(name, score, passed, passed ? undefined : `${ctx.latencyMs}ms > ${ms}ms budget`);
    },
  };
}

/**
 * Retrieval recall — the standard RAG metric: of the ground-truth ids that
 * SHOULD have been retrieved, what fraction actually were
 * (`|retrieved ∩ expected| / |expected|`). Skipped (excluded from the aggregate,
 * not a hard fail) when there's no output or no expected ids, so a case with
 * nothing to measure against doesn't drag the pass-rate.
 */
export function retrievalRecall<I = unknown, O = unknown>(opts: {
  getRetrievedIds: (output: O) => string[];
  getExpectedIds: (ctx: ScoreContext<I, O>) => string[];
  threshold?: number;
  name?: string;
}): Scorer<I, O> {
  const name = opts.name ?? 'retrieval-recall';
  const threshold = opts.threshold ?? 0.5;
  return {
    name,
    score(ctx) {
      if (ctx.output == null) {
        return { scorer: name, score: 0, passed: false, skipped: true, detail: ctx.error ?? 'no output' };
      }
      const expected = [...new Set(opts.getExpectedIds(ctx))];
      if (expected.length === 0) {
        return { scorer: name, score: 0, passed: false, skipped: true, detail: 'no expected ids' };
      }
      const retrieved = new Set(opts.getRetrievedIds(ctx.output));
      const hits = expected.filter((id) => retrieved.has(id)).length;
      const score = hits / expected.length;
      const passed = score >= threshold;
      return result(name, score, passed, passed ? undefined : `recall ${score.toFixed(2)} < ${threshold}`);
    },
  };
}

// ─── 3. Judgment ─────────────────────────────────────────────────────────────

/**
 * LLM-as-judge. Calls a (cheap) model to grade the output on `dimensions`,
 * each 1..5, and normalizes the mean to 0..1. Skipped (not failed) under
 * `--mock` or when no API key is available, so a structural-only run stays
 * honest about what it did and didn't measure.
 */
export function llmJudge<I = unknown, O = unknown>(opts: {
  name?: string;
  dimensions: string[];
  /** Render the artifact-to-grade + the criteria as the judge's user message. */
  buildPrompt: (output: O, ctx: ScoreContext<I, O>) => string;
  /** Pass threshold on the normalized mean (default 0.7). */
  threshold?: number;
}): Scorer<I, O> {
  const name = opts.name ?? 'llm-judge';
  const threshold = opts.threshold ?? 0.7;
  return {
    name,
    async score(ctx) {
      if (ctx.output == null) return result(name, 0, false, ctx.error ?? 'no output');
      if (ctx.env.mock || !ctx.env.anthropicApiKey) {
        return { scorer: name, score: 0, passed: false, skipped: true, detail: 'judge skipped (mock / no key)' };
      }
      const anthropic = new Anthropic({ apiKey: ctx.env.anthropicApiKey });
      const dims = opts.dimensions;
      const judgeTool: Anthropic.Tool = {
        name: 'grade',
        description: 'Return an integer 1-5 score for each requested dimension.',
        input_schema: {
          type: 'object',
          properties: Object.fromEntries(
            dims.map((d) => [d, { type: 'integer', minimum: 1, maximum: 5, description: `Score for ${d}` }]),
          ),
          required: dims,
        },
      };
      try {
        const resp = await anthropic.messages.create({
          model: ctx.env.judgeModel ?? 'claude-haiku-4-5-20251001',
          max_tokens: 256,
          system:
            'You are a strict evaluation judge. Grade ONLY on the requested dimensions, 1 (poor) to 5 (excellent). Be skeptical; reserve 5 for clearly excellent work.',
          tools: [judgeTool],
          tool_choice: { type: 'tool', name: 'grade' },
          messages: [{ role: 'user', content: opts.buildPrompt(ctx.output, ctx) }],
        });
        const block = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
        const grades = (block?.input ?? {}) as Record<string, number>;
        const vals = dims.map((d) => Number(grades[d]) || 0);
        const mean = vals.reduce((a, b) => a + b, 0) / (dims.length * 5);
        const detail = dims.map((d, i) => `${d}=${vals[i]}`).join(' ');
        return result(name, mean, mean >= threshold, detail);
      } catch (err) {
        return result(name, 0, false, `judge error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}
