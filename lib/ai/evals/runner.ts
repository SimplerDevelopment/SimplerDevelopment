/**
 * Generic prompt-eval runner.
 *
 * Drives every case of a suite through `suite.run()` (or `case.mockOutput`
 * under `--mock`), applies the suite's scorers, and aggregates a report.
 *
 * Standalone Bun script — mirrors `lib/ai/brain-tools/eval/runner.ts`:
 *
 *   # offline smoke test (no key, no network): scores canned mockOutputs
 *   bun run lib/ai/evals/runner.ts --mock
 *
 *   # live run of one suite
 *   bun run lib/ai/evals/runner.ts --suite=survey-summary --key=sk-ant-...
 *
 *   # live run of all suites, write artifacts
 *   bun run lib/ai/evals/runner.ts --key=sk-ant-... --out=evals-out
 *
 * Programmatic:
 *   import { runSuite, runAll } from '@/lib/ai/evals/runner'
 */
import type { EvalSuite, EvalCase, CaseResult, ScoreContext, ScoreResult, EvalReport } from './types';
import type { EvalEnv } from './env';
import { summarizeSuite, buildReport, renderMarkdown } from './report';

async function runCase<I, O>(suite: EvalSuite<I, O>, c: EvalCase<I, O>, env: EvalEnv): Promise<CaseResult<I, O>> {
  const start = Date.now();
  let output: O | null = null;
  let error: string | undefined;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    if (env.mock) {
      if (c.mockOutput === undefined) throw new Error('mock mode but case has no mockOutput');
      output = c.mockOutput;
    } else {
      const r = await suite.run(c.input, env);
      output = r.output;
      inputTokens = r.inputTokens ?? 0;
      outputTokens = r.outputTokens ?? 0;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const latencyMs = Date.now() - start;
  const ctx: ScoreContext<I, O> = {
    caseId: c.id,
    input: c.input,
    output,
    expected: c.expected,
    error,
    latencyMs,
    inputTokens,
    outputTokens,
    env,
  };

  const scores: ScoreResult[] = [];
  for (const scorer of suite.scorers) {
    try {
      scores.push(await scorer.score(ctx));
    } catch (err) {
      scores.push({ scorer: scorer.name, score: 0, passed: false, detail: `scorer threw: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  const weightOf = (name: string) => suite.scorers.find((s) => s.name === name)?.weight ?? 1;
  const active = scores.filter((s) => !s.skipped);
  const weighted = active.filter((s) => weightOf(s.scorer) > 0);
  const totalWeight = weighted.reduce((a, s) => a + weightOf(s.scorer), 0);
  const aggregate = totalWeight > 0 ? weighted.reduce((a, s) => a + s.score * weightOf(s.scorer), 0) / totalWeight : 0;
  const passed = active.length > 0 && active.every((s) => s.passed);

  return { caseId: c.id, input: c.input, output, error, latencyMs, inputTokens, outputTokens, scores, passed, aggregate };
}

export async function runSuite<I, O>(suite: EvalSuite<I, O>, env: EvalEnv) {
  const cases: CaseResult<I, O>[] = [];
  for (const c of suite.cases) {
    cases.push(await runCase(suite, c, env));
  }
  return summarizeSuite(suite.id, suite.description, cases as CaseResult[]);
}

export async function runAll(suites: EvalSuite[], env: EvalEnv, generatedAt: string): Promise<EvalReport> {
  const results = [];
  for (const suite of suites) {
    results.push(await runSuite(suite, env));
  }
  return buildReport(results, { mock: !!env.mock, generatedAt });
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

// `import.meta.main` is Bun-specific; cast to dodge a tsc error under the Next tsconfig.
if ((import.meta as unknown as Record<string, unknown>).main) {
  const arg = (name: string): string | undefined => {
    const flag = `--${name}=`;
    const found = process.argv.find((a) => a.startsWith(flag));
    return found ? found.slice(flag.length) : undefined;
  };
  const has = (name: string) => process.argv.includes(`--${name}`);

  (async () => {
    const { ALL_SUITES, getSuite } = await import('./suites');
    const mock = has('mock');
    const suiteId = arg('suite');
    const key = arg('key') ?? process.env.ANTHROPIC_API_KEY;
    const clientId = arg('clientId') ? parseInt(arg('clientId')!, 10) : undefined;
    const outDir = arg('out');

    if (!mock && !key && !clientId) {
      console.error('Need --key=<anthropic key> (or --clientId for BYOK), or --mock for an offline smoke test.');
      process.exit(1);
    }

    const suites = suiteId ? [getSuite(suiteId)].filter(Boolean) as EvalSuite[] : (ALL_SUITES as EvalSuite[]);
    if (suiteId && suites.length === 0) {
      console.error(`Unknown suite "${suiteId}". Known: ${(ALL_SUITES as EvalSuite[]).map((s) => s.id).join(', ')}`);
      process.exit(1);
    }

    const env: EvalEnv = { anthropicApiKey: key, clientId, mock, judgeModel: arg('judge-model') };
    // Date.now via a one-shot stamp is fine in a CLI (not a resumable workflow).
    const generatedAt = new Date().toISOString();

    console.log(`\nPrompt evals — ${mock ? 'MOCK' : 'LIVE'} · ${suites.length} suite(s)\n`);
    const report = await runAll(suites, env, generatedAt);
    const md = renderMarkdown(report);
    console.log(md);

    if (outDir) {
      const fs = await import('node:fs');
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(`${outDir}/report.md`, md);
      fs.writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
      console.log(`\nwrote ${outDir}/report.md and report.json`);
    }

    // Non-zero exit on any failure so CI can gate.
    process.exit(report.overall.passed === report.overall.total ? 0 : 1);
  })();
}
