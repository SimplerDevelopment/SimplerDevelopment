/**
 * Eval report aggregation + rendering.
 *
 * Turns per-case results into the metrics you optimize against: pass-rate,
 * per-scorer mean quality, latency, token spend — per suite and overall.
 * Skipped scorers are excluded everywhere so a `--mock` run never inflates a
 * number it didn't actually measure.
 */
import type { CaseResult, SuiteResult, EvalReport } from './types';

export function summarizeSuite(suiteId: string, description: string, cases: CaseResult[]): SuiteResult {
  const total = cases.length;
  const passed = cases.filter((c) => c.passed).length;
  const aggregate = total ? cases.reduce((a, c) => a + c.aggregate, 0) / total : 0;
  const avgLatencyMs = total ? Math.round(cases.reduce((a, c) => a + c.latencyMs, 0) / total) : 0;
  const totalTokens = cases.reduce((a, c) => a + c.inputTokens + c.outputTokens, 0);

  // Per-scorer rollup across cases (skipped runs excluded from mean/passRate).
  const byScorer: SuiteResult['byScorer'] = {};
  for (const c of cases) {
    for (const s of c.scores) {
      const b = (byScorer[s.scorer] ??= { mean: 0, passRate: 0, ran: 0, skipped: 0 });
      if (s.skipped) {
        b.skipped++;
        continue;
      }
      b.mean += s.score;
      b.passRate += s.passed ? 1 : 0;
      b.ran++;
    }
  }
  for (const b of Object.values(byScorer)) {
    if (b.ran > 0) {
      b.mean = b.mean / b.ran;
      b.passRate = b.passRate / b.ran;
    }
  }

  return { suiteId, description, total, passed, passRate: total ? passed / total : 0, aggregate, byScorer, avgLatencyMs, totalTokens, cases };
}

export function buildReport(suites: SuiteResult[], opts: { mock: boolean; generatedAt: string }): EvalReport {
  const total = suites.reduce((a, s) => a + s.total, 0);
  const passed = suites.reduce((a, s) => a + s.passed, 0);
  const totalTokens = suites.reduce((a, s) => a + s.totalTokens, 0);
  const aggregate = suites.length ? suites.reduce((a, s) => a + s.aggregate, 0) / suites.length : 0;
  return {
    generatedAt: opts.generatedAt,
    mock: opts.mock,
    suites,
    overall: { total, passed, passRate: total ? passed / total : 0, aggregate, totalTokens },
  };
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Render the report as Markdown — suitable for CI artifacts / PR comments. */
export function renderMarkdown(report: EvalReport): string {
  const lines: string[] = [];
  lines.push(`# Prompt eval report`);
  lines.push('');
  lines.push(`- generated: ${report.generatedAt}${report.mock ? ' _(mock run — no live model calls)_' : ''}`);
  lines.push(
    `- overall: **${pct(report.overall.passRate)}** pass (${report.overall.passed}/${report.overall.total}) · ` +
      `aggregate **${pct(report.overall.aggregate)}** · ${report.overall.totalTokens} tok`,
  );
  lines.push('');

  for (const s of report.suites) {
    lines.push(`## ${s.suiteId}`);
    lines.push(`_${s.description}_`);
    lines.push('');
    lines.push(
      `pass **${pct(s.passRate)}** (${s.passed}/${s.total}) · aggregate **${pct(s.aggregate)}** · ` +
        `avg ${s.avgLatencyMs}ms · ${s.totalTokens} tok`,
    );
    lines.push('');
    lines.push(`| scorer | mean | pass-rate | ran | skipped |`);
    lines.push(`|---|---|---|---|---|`);
    for (const [name, b] of Object.entries(s.byScorer)) {
      lines.push(`| ${name} | ${pct(b.mean)} | ${pct(b.passRate)} | ${b.ran} | ${b.skipped} |`);
    }
    lines.push('');
    // Per-case table — show mean ± stdev column when any case used N>1 runs.
    const anyMultiRun = s.cases.some((c) => c.runs != null && c.runs > 1);
    if (anyMultiRun) {
      lines.push(`| case | aggregate | stdev | runs | passed |`);
      lines.push(`|---|---|---|---|---|`);
      for (const c of s.cases) {
        const agg = pct(c.aggregate);
        const stdev = c.aggregateStdev != null ? pct(c.aggregateStdev) : '—';
        const runs = c.runs ?? 1;
        lines.push(`| \`${c.caseId}\` | ${agg} | ±${stdev} | ${runs} | ${c.passed ? '✓' : '✗'} |`);
      }
      lines.push('');
    }
    const failures = s.cases.filter((c) => !c.passed);
    if (failures.length) {
      lines.push(`<details><summary>${failures.length} failing case(s)</summary>`);
      lines.push('');
      for (const c of failures) {
        const reasons = c.scores.filter((x) => !x.passed && !x.skipped).map((x) => `${x.scorer}: ${x.detail ?? 'failed'}`);
        lines.push(`- \`${c.caseId}\` — ${reasons.join(' · ') || c.error || 'failed'}`);
      }
      lines.push('');
      lines.push(`</details>`);
      lines.push('');
    }
  }
  return lines.join('\n');
}
