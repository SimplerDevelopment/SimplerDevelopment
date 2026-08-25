/**
 * Lighthouse Score Comparison Script
 *
 * Usage:
 *   bunx tsx scripts/migrations/<site-slug>/lighthouse-compare.ts \
 *     --source  https://original-site.com \
 *     --migrated https://<subdomain>.simplerdevelopment.com \
 *     --paths /,/about,/services,/contact \
 *     [--out ./reports]
 *
 * Paths default to "/" if omitted.
 * The --paths flag is a comma-separated list of URL paths to test (no trailing slash).
 *
 * Requires: bunx lighthouse  (no install needed — runs via npx/bunx on demand)
 *   lighthouse ≥ 12 works with Node 18+. Bun can invoke it via bunx.
 *
 * Output:
 *   <out>/lighthouse-report-<timestamp>.json   — raw scores per page + comparison delta
 *   <out>/lighthouse-report-<timestamp>.md     — human-readable markdown report
 *
 * Idempotent: re-running creates a new timestamped file; it never overwrites existing reports.
 *
 * Pass/Fail thresholds (configurable via env vars):
 *   FLOOR_PERFORMANCE=50    — migrated page must score at least 50
 *   FLOOR_ACCESSIBILITY=80  — migrated page must score at least 80
 *   FLOOR_BEST_PRACTICES=80 — migrated page must score at least 80
 *   FLOOR_SEO=80            — migrated page must score at least 80
 *   MAX_REGRESSION=15       — migrated score may not drop more than 15 points vs source
 *
 * Exit codes: 0 = all pass, 1 = one or more pages failed thresholds.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ─── Config ──────────────────────────────────────────────────────────────────

const THRESHOLDS = {
  floors: {
    performance: parseInt(process.env.FLOOR_PERFORMANCE ?? '50'),
    accessibility: parseInt(process.env.FLOOR_ACCESSIBILITY ?? '80'),
    bestPractices: parseInt(process.env.FLOOR_BEST_PRACTICES ?? '80'),
    seo: parseInt(process.env.FLOOR_SEO ?? '80'),
  },
  maxRegression: parseInt(process.env.MAX_REGRESSION ?? '15'),
};

const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'] as const;
type Category = typeof CATEGORIES[number];

interface ScoreSet {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}

interface PageResult {
  path: string;
  source: ScoreSet;
  migrated: ScoreSet;
  delta: ScoreSet;
  passed: boolean;
  failures: string[];
}

// ─── CLI Arg Parsing ──────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const sourceBase = get('--source');
  const migratedBase = get('--migrated');
  const pathsRaw = get('--paths') ?? '/';
  const outDir = get('--out') ?? './reports/lighthouse';

  if (!sourceBase || !migratedBase) {
    console.error('Usage: bunx tsx lighthouse-compare.ts --source <url> --migrated <url> [--paths /,/about] [--out ./reports]');
    process.exit(1);
  }

  const paths = pathsRaw.split(',').map(p => (p.startsWith('/') ? p : `/${p}`));

  return { sourceBase: sourceBase.replace(/\/$/, ''), migratedBase: migratedBase.replace(/\/$/, ''), paths, outDir };
}

// ─── Lighthouse Runner ────────────────────────────────────────────────────────

function runLighthouse(url: string): ScoreSet {
  console.log(`  Running Lighthouse on ${url} …`);
  const tmpFile = `/tmp/lh-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;

  try {
    // Use bunx to invoke lighthouse on-demand (no install required).
    // --chrome-flags="--headless" ensures no visible browser window.
    // --output=json --output-path writes the score file we parse below.
    execSync(
      `bunx lighthouse "${url}" --output=json --output-path="${tmpFile}" ` +
      `--chrome-flags="--headless --no-sandbox --disable-dev-shm-usage" ` +
      `--only-categories=performance,accessibility,best-practices,seo ` +
      `--quiet`,
      { stdio: 'pipe', timeout: 120_000 },
    );

    const raw = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    const cats = raw.categories as Record<string, { score: number }>;

    return {
      performance: Math.round((cats['performance']?.score ?? 0) * 100),
      accessibility: Math.round((cats['accessibility']?.score ?? 0) * 100),
      bestPractices: Math.round((cats['best-practices']?.score ?? 0) * 100),
      seo: Math.round((cats['seo']?.score ?? 0) * 100),
    };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

// ─── Threshold Checker ────────────────────────────────────────────────────────

function checkPage(pagePath: string, source: ScoreSet, migrated: ScoreSet): PageResult {
  const delta: ScoreSet = {
    performance: migrated.performance - source.performance,
    accessibility: migrated.accessibility - source.accessibility,
    bestPractices: migrated.bestPractices - source.bestPractices,
    seo: migrated.seo - source.seo,
  };

  const failures: string[] = [];

  const scoreMap: Array<[keyof ScoreSet, string]> = [
    ['performance', 'Performance'],
    ['accessibility', 'Accessibility'],
    ['bestPractices', 'Best Practices'],
    ['seo', 'SEO'],
  ];

  for (const [key, label] of scoreMap) {
    const floor = THRESHOLDS.floors[key];
    if (migrated[key] < floor) {
      failures.push(`${label} ${migrated[key]} is below floor ${floor}`);
    }
    if (delta[key] < -THRESHOLDS.maxRegression) {
      failures.push(`${label} regressed ${Math.abs(delta[key])} points vs source (max allowed: ${THRESHOLDS.maxRegression})`);
    }
  }

  return { path: pagePath, source, migrated, delta, passed: failures.length === 0, failures };
}

// ─── Report Writers ───────────────────────────────────────────────────────────

function scoreBar(score: number): string {
  const filled = Math.round(score / 10);
  return `[${'█'.repeat(filled)}${'░'.repeat(10 - filled)}] ${score}`;
}

function deltaStr(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `${n}`;
  return '±0';
}

function buildMarkdown(args: ReturnType<typeof parseArgs>, results: PageResult[]): string {
  const allPassed = results.every(r => r.passed);
  const ts = new Date().toISOString();

  let md = `# Lighthouse Migration QA Report\n\n`;
  md += `**Generated:** ${ts}  \n`;
  md += `**Source:** ${args.sourceBase}  \n`;
  md += `**Migrated:** ${args.migratedBase}  \n`;
  md += `**Status:** ${allPassed ? '✅ ALL PASS' : '❌ FAILURES DETECTED'}\n\n`;
  md += `## Thresholds\n\n`;
  md += `| Category | Floor | Max Regression |\n`;
  md += `|---|---|---|\n`;
  md += `| Performance | ${THRESHOLDS.floors.performance} | ${THRESHOLDS.maxRegression} pts |\n`;
  md += `| Accessibility | ${THRESHOLDS.floors.accessibility} | ${THRESHOLDS.maxRegression} pts |\n`;
  md += `| Best Practices | ${THRESHOLDS.floors.bestPractices} | ${THRESHOLDS.maxRegression} pts |\n`;
  md += `| SEO | ${THRESHOLDS.floors.seo} | ${THRESHOLDS.maxRegression} pts |\n\n`;

  for (const r of results) {
    md += `---\n\n## Path: \`${r.path}\`  ${r.passed ? '✅ PASS' : '❌ FAIL'}\n\n`;
    md += `| Category | Source | Migrated | Delta |\n`;
    md += `|---|---|---|---|\n`;
    md += `| Performance    | ${r.source.performance} | ${r.migrated.performance} | ${deltaStr(r.delta.performance)} |\n`;
    md += `| Accessibility  | ${r.source.accessibility} | ${r.migrated.accessibility} | ${deltaStr(r.delta.accessibility)} |\n`;
    md += `| Best Practices | ${r.source.bestPractices} | ${r.migrated.bestPractices} | ${deltaStr(r.delta.bestPractices)} |\n`;
    md += `| SEO            | ${r.source.seo} | ${r.migrated.seo} | ${deltaStr(r.delta.seo)} |\n\n`;

    if (r.failures.length > 0) {
      md += `**Failures:**\n\n`;
      for (const f of r.failures) md += `- ${f}\n`;
      md += '\n';
    }
  }

  md += `---\n\n## Summary\n\n`;
  md += `| Path | Perf S | Perf M | A11y S | A11y M | BP S | BP M | SEO S | SEO M | Result |\n`;
  md += `|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const r of results) {
    md += `| \`${r.path}\` | ${r.source.performance} | ${r.migrated.performance} | ${r.source.accessibility} | ${r.migrated.accessibility} | ${r.source.bestPractices} | ${r.migrated.bestPractices} | ${r.source.seo} | ${r.migrated.seo} | ${r.passed ? '✅' : '❌'} |\n`;
  }

  return md;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  fs.mkdirSync(args.outDir, { recursive: true });

  console.log(`\n=== Lighthouse Migration QA ===`);
  console.log(`Source:   ${args.sourceBase}`);
  console.log(`Migrated: ${args.migratedBase}`);
  console.log(`Paths:    ${args.paths.join(', ')}\n`);

  const results: PageResult[] = [];

  for (const pagePath of args.paths) {
    console.log(`\n[${pagePath}]`);
    const sourceUrl = `${args.sourceBase}${pagePath}`;
    const migratedUrl = `${args.migratedBase}${pagePath}`;

    let sourceScores: ScoreSet;
    let migratedScores: ScoreSet;

    try {
      sourceScores = runLighthouse(sourceUrl);
    } catch (err) {
      console.warn(`  WARN: Could not run Lighthouse on source ${sourceUrl}: ${err}`);
      sourceScores = { performance: 0, accessibility: 0, bestPractices: 0, seo: 0 };
    }

    try {
      migratedScores = runLighthouse(migratedUrl);
    } catch (err) {
      console.error(`  ERROR: Could not run Lighthouse on migrated ${migratedUrl}: ${err}`);
      migratedScores = { performance: 0, accessibility: 0, bestPractices: 0, seo: 0 };
    }

    const result = checkPage(pagePath, sourceScores, migratedScores);
    results.push(result);

    console.log(`  Source    — Perf:${scoreBar(sourceScores.performance)}  A11y:${sourceScores.accessibility}  BP:${sourceScores.bestPractices}  SEO:${sourceScores.seo}`);
    console.log(`  Migrated  — Perf:${scoreBar(migratedScores.performance)}  A11y:${migratedScores.accessibility}  BP:${migratedScores.bestPractices}  SEO:${migratedScores.seo}`);
    console.log(`  Result: ${result.passed ? '✅ PASS' : '❌ FAIL'}`);
    if (result.failures.length) result.failures.forEach(f => console.log(`    ✗ ${f}`));
  }

  // Write reports
  const jsonPath = path.join(args.outDir, `lighthouse-report-${timestamp}.json`);
  const mdPath = path.join(args.outDir, `lighthouse-report-${timestamp}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify({ timestamp, args, thresholds: THRESHOLDS, results }, null, 2));
  fs.writeFileSync(mdPath, buildMarkdown(args, results));

  console.log(`\n=== Reports written ===`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  MD:   ${mdPath}`);

  const allPassed = results.every(r => r.passed);
  if (!allPassed) {
    console.error('\n❌ One or more pages failed Lighthouse thresholds. Review the report above.\n');
    process.exit(1);
  } else {
    console.log('\n✅ All pages passed Lighthouse thresholds.\n');
    process.exit(0);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
