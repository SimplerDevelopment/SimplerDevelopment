/**
 * Prompt-eval framework — depth tests for N>1 variance runs + retrieval scorer.
 *
 * All assertions run offline (mock mode / deterministic scorers only).
 */
import { describe, it, expect } from 'vitest';

import { predicate, retrievalRecall } from '@/lib/ai/evals/scorers';
import { runSuite } from '@/lib/ai/evals/runner';
import { renderMarkdown, buildReport, summarizeSuite } from '@/lib/ai/evals/report';
import type { EvalSuite, ScoreContext } from '@/lib/ai/evals/types';

// ─── helpers ────────────────────────────────────────────────────────────────

function ctx<O>(output: O | null, over: Partial<ScoreContext<unknown, O>> = {}): ScoreContext<unknown, O> {
  return { caseId: 'c', input: {}, output, latencyMs: 1, inputTokens: 0, outputTokens: 0, env: {}, ...over };
}

/** Minimal mock suite for a given scorer set. */
function makeSuite(mockOutput: { v: number }): EvalSuite<{ n: number }, { v: number }> {
  return {
    id: 'variance-test',
    description: 'variance-run self-test',
    cases: [{ id: 'case-a', input: { n: 1 }, expected: 1, mockOutput }],
    scorers: [predicate<{ n: number }, { v: number }>('always-pass', () => true)],
    run: async () => ({ output: { v: 0 } }),
  };
}

// ─── CHANGE 1: N>1 variance runs ────────────────────────────────────────────

describe('N>1 variance runs', () => {
  it('runs=3 yields CaseResult with runs===3, aggregateStdev===0, and correct aggregate', async () => {
    const suite = makeSuite({ v: 42 });
    const result = await runSuite(suite, { mock: true, runs: 3 });

    expect(result.cases).toHaveLength(1);
    const c = result.cases[0];

    // runs field set
    expect(c.runs).toBe(3);

    // deterministic mock → stdev should be exactly 0
    expect(c.aggregateStdev).toBe(0);

    // aggregate = mean of 3 identical aggregates = the single-run aggregate
    // all-pass scorer → single run aggregate = 1
    expect(c.aggregate).toBe(1);

    // passed: majority (3/3) → true
    expect(c.passed).toBe(true);
  });

  it('runs=1 (default) leaves runs and aggregateStdev unset — byte-identical output', async () => {
    const suite = makeSuite({ v: 7 });
    const result = await runSuite(suite, { mock: true });

    const c = result.cases[0];
    expect(c.runs).toBeUndefined();
    expect(c.aggregateStdev).toBeUndefined();
    expect(c.aggregate).toBe(1);
    expect(c.passed).toBe(true);
  });

  it('explicit runs=1 env also leaves extra fields unset', async () => {
    const suite = makeSuite({ v: 7 });
    const result = await runSuite(suite, { mock: true, runs: 1 });

    const c = result.cases[0];
    expect(c.runs).toBeUndefined();
    expect(c.aggregateStdev).toBeUndefined();
  });

  it('majority-pass logic: all 3 runs pass → passed=true', async () => {
    const suite = makeSuite({ v: 1 });
    const result = await runSuite(suite, { mock: true, runs: 3 });
    expect(result.cases[0].passed).toBe(true);
  });

  it('renderMarkdown shows mean ± stdev table when runs > 1', async () => {
    const suite = makeSuite({ v: 1 });
    const suiteResult = await runSuite(suite, { mock: true, runs: 3 });
    const report = buildReport([suiteResult], { mock: true, generatedAt: '2026-01-01T00:00:00Z' });
    const md = renderMarkdown(report);

    // multi-run table headers present
    expect(md).toContain('| case | aggregate | stdev | runs | passed |');
    // stdev column rendered
    expect(md).toContain('±');
  });

  it('renderMarkdown does NOT show multi-run table when all cases have runs=1', async () => {
    const suite = makeSuite({ v: 1 });
    const suiteResult = await runSuite(suite, { mock: true, runs: 1 });
    const report = buildReport([suiteResult], { mock: true, generatedAt: '2026-01-01T00:00:00Z' });
    const md = renderMarkdown(report);

    expect(md).not.toContain('| case | aggregate | stdev | runs | passed |');
  });
});

// ─── CHANGE 2: retrievalRecall scorer ────────────────────────────────────────

describe('retrievalRecall scorer', () => {
  const scorer = retrievalRecall<unknown, { ids: string[] }>({
    getRetrievedIds: (o) => o.ids,
    getExpectedIds: (c) => c.expected as string[],
  });

  it('2/3 retrieved → score ≈ 0.667, passed at default threshold 0.5', async () => {
    const r = await scorer.score(
      ctx({ ids: ['a', 'b', 'x'] }, { expected: ['a', 'b', 'c'] }),
    );
    expect(r.skipped).toBeUndefined();
    expect(r.score).toBeCloseTo(2 / 3, 5);
    expect(r.passed).toBe(true);
  });

  it('1/3 retrieved → score ≈ 0.333, NOT passed at default threshold 0.5', async () => {
    // retrieved=['a'] intersects expected=['a','b','c'] → 1 hit / 3 expected = 0.333
    const r = await scorer.score(
      ctx({ ids: ['a'] }, { expected: ['a', 'b', 'c'] }),
    );
    expect(r.skipped).toBeUndefined();
    expect(r.score).toBeCloseTo(1 / 3, 5);
    expect(r.passed).toBe(false);
  });

  it('null output → skipped=true', async () => {
    const r = await scorer.score(ctx(null, { expected: ['a', 'b'] }));
    expect(r.skipped).toBe(true);
    expect(r.passed).toBe(false);
  });

  it('empty expected set → skipped=true', async () => {
    const r = await scorer.score(ctx({ ids: ['a'] }, { expected: [] }));
    expect(r.skipped).toBe(true);
  });

  it('defaults name to retrieval-recall', () => {
    expect(scorer.name).toBe('retrieval-recall');
  });

  it('respects custom threshold: 0.9 → fails on 2/3 recall', async () => {
    const strict = retrievalRecall<unknown, { ids: string[] }>({
      threshold: 0.9,
      getRetrievedIds: (o) => o.ids,
      getExpectedIds: (c) => c.expected as string[],
    });
    const r = await strict.score(ctx({ ids: ['a', 'b', 'x'] }, { expected: ['a', 'b', 'c'] }));
    expect(r.passed).toBe(false);
  });

  it('perfect recall → score=1, passed=true', async () => {
    const r = await scorer.score(
      ctx({ ids: ['a', 'b', 'c'] }, { expected: ['a', 'b', 'c'] }),
    );
    expect(r.score).toBe(1);
    expect(r.passed).toBe(true);
  });

  it('respects custom name', () => {
    const named = retrievalRecall<unknown, { ids: string[] }>({
      name: 'my-retrieval',
      getRetrievedIds: (o) => o.ids,
      getExpectedIds: () => [],
    });
    expect(named.name).toBe('my-retrieval');
  });
});

// ─── Control: existing single-run behaviour unchanged ────────────────────────

describe('control — single-run backward compat', () => {
  it('runSuite without runs env works exactly as before', async () => {
    const suite: EvalSuite<{ n: number }, { v: number }> = {
      id: 'control',
      description: 'control',
      cases: [
        { id: 'good', input: { n: 1 }, expected: 1, mockOutput: { v: 1 } },
        { id: 'bad', input: { n: 2 }, expected: 2, mockOutput: { v: 99 } },
      ],
      scorers: [predicate<{ n: number }, { v: number }>('matches-expected', (o, c) => o.v === (c.expected as number))],
      run: async () => ({ output: { v: 0 } }),
    };

    const res = await runSuite(suite, { mock: true });
    expect(res.total).toBe(2);
    expect(res.passed).toBe(1);
    expect(res.passRate).toBe(0.5);

    const good = res.cases.find((c) => c.caseId === 'good')!;
    expect(good.passed).toBe(true);
    expect(good.runs).toBeUndefined();
    expect(good.aggregateStdev).toBeUndefined();

    const bad = res.cases.find((c) => c.caseId === 'bad')!;
    expect(bad.passed).toBe(false);
  });
});
