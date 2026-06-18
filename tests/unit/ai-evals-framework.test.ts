/**
 * Prompt-eval framework — offline self-test.
 *
 * Exercises the generic harness end-to-end WITHOUT any network: scorers run on
 * synthetic + canned (`mockOutput`) data, the runner aggregates, and the report
 * renders. This is the proof that `lib/ai/evals/**` works; live model runs use
 * the same code path via the CLI (`bun run lib/ai/evals/runner.ts --key=...`).
 *
 * @critical
 */
import { describe, it, expect, vi } from 'vitest';

// The suite registry transitively imports the real prompt modules (automation
// parser → portal-tools, survey summary → schema). Stub the DB + auth import
// chains so this stays a DB-free unit test (the prompt fns are never invoked in
// mock mode — only their module-load side effects matter here).
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { zodConformance, requiredFields, predicate, latencyUnder } from '@/lib/ai/evals/scorers';
import { runSuite, runAll } from '@/lib/ai/evals/runner';
import { renderMarkdown } from '@/lib/ai/evals/report';
import type { EvalSuite, ScoreContext } from '@/lib/ai/evals/types';
import { z } from 'zod';

function ctx<O>(output: O | null, over: Partial<ScoreContext<unknown, O>> = {}): ScoreContext<unknown, O> {
  return { caseId: 'c', input: {}, output, latencyMs: 1, inputTokens: 0, outputTokens: 0, env: {}, ...over };
}

describe('eval scorers @critical', () => {
  it('zodConformance passes on valid, fails on invalid output', async () => {
    const schema = z.object({ a: z.string() });
    expect((await zodConformance(schema).score(ctx({ a: 'x' }))).passed).toBe(true);
    const bad = await zodConformance(schema).score(ctx({ a: 1 } as unknown as { a: string }));
    expect(bad.passed).toBe(false);
    expect(bad.score).toBe(0);
    expect(bad.detail).toContain('a');
  });

  it('requiredFields scores the fraction of present fields, supports dotted/indexed paths', async () => {
    const s = requiredFields(['name', 'trigger.event', 'actions.0.tool']);
    const full = await s.score(ctx({ name: 'n', trigger: { event: 'e' }, actions: [{ tool: 't' }] }));
    expect(full.passed).toBe(true);
    expect(full.score).toBe(1);
    const partial = await s.score(ctx({ name: 'n', trigger: {}, actions: [] }));
    expect(partial.passed).toBe(false);
    expect(partial.score).toBeCloseTo(1 / 3);
  });

  it('predicate supports boolean and partial-score returns', async () => {
    const boolScorer = predicate<unknown, { ok: boolean }>('p', (o) => o.ok);
    expect((await boolScorer.score(ctx({ ok: true }))).passed).toBe(true);
    expect((await boolScorer.score(ctx({ ok: false }))).passed).toBe(false);
  });

  it('latencyUnder fails over budget and is weighted out of the aggregate', async () => {
    const s = latencyUnder(100);
    expect(s.weight).toBe(0);
    expect((await s.score(ctx({}, { latencyMs: 50 }))).passed).toBe(true);
    expect((await s.score(ctx({}, { latencyMs: 500 }))).passed).toBe(false);
  });

  it('a scorer error in the context (null output) fails closed', async () => {
    const r = await requiredFields(['a']).score(ctx(null, { error: 'boom' }));
    expect(r.passed).toBe(false);
  });
});

describe('eval runner — mock mode @critical', () => {
  // Tiny synthetic suite: one passing case, one failing case.
  const synthetic: EvalSuite<{ n: number }, { v: number }> = {
    id: 'synthetic',
    description: 'in-memory suite for the self-test',
    cases: [
      { id: 'good', input: { n: 1 }, expected: 1, mockOutput: { v: 1 } },
      { id: 'bad', input: { n: 2 }, expected: 2, mockOutput: { v: 99 } },
    ],
    scorers: [predicate<{ n: number }, { v: number }>('matches-expected', (o, c) => o.v === (c.expected as number))],
    run: async () => ({ output: { v: 0 } }),
  };

  it('runs cases against mockOutput, computes pass-rate and aggregate', async () => {
    const res = await runSuite(synthetic, { mock: true });
    expect(res.total).toBe(2);
    expect(res.passed).toBe(1);
    expect(res.passRate).toBe(0.5);
    expect(res.cases.find((c) => c.caseId === 'good')!.passed).toBe(true);
    expect(res.cases.find((c) => c.caseId === 'bad')!.passed).toBe(false);
  });

  it('errors when a case lacks mockOutput in mock mode', async () => {
    const noMock: EvalSuite = {
      id: 'x',
      description: '',
      cases: [{ id: 'm', input: {} }],
      scorers: [predicate('always', () => true)],
      run: async () => ({ output: {} }),
    };
    const res = await runSuite(noMock, { mock: true });
    expect(res.cases[0].error).toContain('mockOutput');
    expect(res.cases[0].passed).toBe(false);
  });
});

describe('real suites — mock smoke run @critical', () => {
  it('scores the registered suites end-to-end and renders a report', async () => {
    const { ALL_SUITES } = await import('@/lib/ai/evals/suites');
    expect(ALL_SUITES.length).toBeGreaterThanOrEqual(2);

    const report = await runAll(ALL_SUITES, { mock: true }, '2026-06-17T00:00:00Z');
    expect(report.mock).toBe(true);
    // 4 automation cases + 2 survey cases.
    expect(report.overall.total).toBe(6);
    // automation has one deliberately-wrong case; survey's two pass → 5/6.
    expect(report.overall.passed).toBe(5);

    const automation = report.suites.find((s) => s.suiteId === 'automation-parser')!;
    expect(automation.passRate).toBe(0.75);
    const failing = automation.cases.find((c) => !c.passed)!;
    expect(failing.caseId).toBe('ticket-created-notify');
    expect(failing.scores.find((s) => s.scorer === 'trigger-event-correct')!.passed).toBe(false);

    // LLM-judge must be SKIPPED under mock — never silently counted as a pass.
    const survey = report.suites.find((s) => s.suiteId === 'survey-summary')!;
    const judge = survey.byScorer['judge-groundedness'];
    expect(judge.ran).toBe(0);
    expect(judge.skipped).toBe(2);

    const md = renderMarkdown(report);
    expect(md).toContain('# Prompt eval report');
    expect(md).toContain('## automation-parser');
    expect(md).toContain('## survey-summary');
  });
});
