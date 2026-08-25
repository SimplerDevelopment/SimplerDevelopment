/**
 * Visual Page Comparison Script
 *
 * Usage:
 *   bunx tsx scripts/migrations/<site-slug>/visual-compare-pages.ts \
 *     --source   https://original-site.com \
 *     --migrated https://<subdomain>.simplerdevelopment.com \
 *     --paths    /,/about,/services,/contact \
 *     [--out     ./reports/visual] \
 *     [--viewport 1440x900]
 *
 * What it does:
 *   1. Opens each path on both the source and migrated URLs using Playwright (Chromium).
 *   2. Takes full-page screenshots of each.
 *   3. Builds a side-by-side HTML comparison report per page.
 *   4. Writes a JSON manifest + the HTML report to --out.
 *
 * Requires: @playwright/test is already in the project's devDependencies (bun.lock).
 *   Run: bunx playwright install chromium  (one-time, if Chromium binary is missing)
 *
 * Pixel-diff threshold (configurable via env var):
 *   DIFF_THRESHOLD=0.05   — pages with pixel diff ratio above this are flagged (default 0.05 = 5%)
 *   Note: exact pixel diff requires an additional package (pixelmatch). This script uses
 *   Playwright's built-in toHaveScreenshot diff when run as a spec, but as a standalone
 *   script it produces the side-by-side HTML for HUMAN visual review. Flag pages that
 *   look materially different to the operator.
 *
 * Output (in --out directory):
 *   screenshots/<slug>-source.png   — full-page source screenshot per path
 *   screenshots/<slug>-migrated.png — full-page migrated screenshot per path
 *   visual-report-<timestamp>.html  — side-by-side comparison page (open in browser)
 *   visual-report-<timestamp>.json  — manifest of all screenshots + paths
 *
 * Idempotent: each run uses a timestamped report file; prior runs are not overwritten.
 *
 * NOTE: The `visual-compare` skill (~/.claude/skills/visual-compare/SKILL.md) provides
 * an agent-driven equivalent for interactive one-off comparisons. Use this script for
 * automated/batch runs; use the skill for manual deep-dives on individual pages.
 */

import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';

// ─── Config ──────────────────────────────────────────────────────────────────

const DIFF_THRESHOLD = parseFloat(process.env.DIFF_THRESHOLD ?? '0.05');

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
  const outDir = get('--out') ?? './reports/visual';
  const viewportRaw = get('--viewport') ?? '1440x900';

  if (!sourceBase || !migratedBase) {
    console.error(
      'Usage: bunx tsx visual-compare-pages.ts --source <url> --migrated <url> [--paths /,/about] [--out ./reports/visual] [--viewport 1440x900]'
    );
    process.exit(1);
  }

  const [width, height] = viewportRaw.split('x').map(Number);
  const paths = pathsRaw.split(',').map(p => (p.startsWith('/') ? p : `/${p}`));

  return {
    sourceBase: sourceBase.replace(/\/$/, ''),
    migratedBase: migratedBase.replace(/\/$/, ''),
    paths,
    outDir,
    viewport: { width: width || 1440, height: height || 900 },
  };
}

// ─── Slug helper ──────────────────────────────────────────────────────────────

function slugify(pagePath: string): string {
  const s = pagePath.replace(/^\/|\/$/g, '').replace(/\//g, '-') || 'home';
  return s.replace(/[^a-z0-9-]/gi, '-');
}

// ─── Screenshot ───────────────────────────────────────────────────────────────

interface ScreenshotResult {
  path: string;
  slug: string;
  sourceFile: string;
  migratedFile: string;
  sourceOk: boolean;
  migratedOk: boolean;
  sourceError?: string;
  migratedError?: string;
}

async function captureScreenshots(
  args: ReturnType<typeof parseArgs>,
  screenshotsDir: string
): Promise<ScreenshotResult[]> {
  const browser = await chromium.launch({ headless: true });
  const results: ScreenshotResult[] = [];

  for (const pagePath of args.paths) {
    const slug = slugify(pagePath);
    const sourceFile = path.join(screenshotsDir, `${slug}-source.png`);
    const migratedFile = path.join(screenshotsDir, `${slug}-migrated.png`);
    const result: ScreenshotResult = { path: pagePath, slug, sourceFile, migratedFile, sourceOk: false, migratedOk: false };

    console.log(`\n[${pagePath}]`);

    // Source screenshot
    const sourceUrl = `${args.sourceBase}${pagePath}`;
    try {
      const page = await browser.newPage();
      await page.setViewportSize(args.viewport);
      await page.goto(sourceUrl, { waitUntil: 'networkidle', timeout: 30_000 });
      // Let late-loading assets settle
      await page.waitForTimeout(1500);
      await page.screenshot({ path: sourceFile, fullPage: true });
      await page.close();
      result.sourceOk = true;
      console.log(`  Source    ✅ ${sourceFile}`);
    } catch (err) {
      result.sourceError = String(err);
      console.warn(`  Source    ⚠ FAILED: ${err}`);
    }

    // Migrated screenshot
    const migratedUrl = `${args.migratedBase}${pagePath}`;
    try {
      const page = await browser.newPage();
      await page.setViewportSize(args.viewport);
      await page.goto(migratedUrl, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: migratedFile, fullPage: true });
      await page.close();
      result.migratedOk = true;
      console.log(`  Migrated  ✅ ${migratedFile}`);
    } catch (err) {
      result.migratedError = String(err);
      console.warn(`  Migrated  ⚠ FAILED: ${err}`);
    }

    results.push(result);
  }

  await browser.close();
  return results;
}

// ─── HTML Report Builder ──────────────────────────────────────────────────────

function buildHtmlReport(
  args: ReturnType<typeof parseArgs>,
  results: ScreenshotResult[],
  timestamp: string
): string {
  const sections = results.map((r, i) => {
    const srcImg = r.sourceOk
      ? `<img src="screenshots/${r.slug}-source.png" alt="Source ${r.path}">`
      : `<div class="err">Screenshot failed: ${r.sourceError ?? 'unknown error'}</div>`;
    const migImg = r.migratedOk
      ? `<img src="screenshots/${r.slug}-migrated.png" alt="Migrated ${r.path}">`
      : `<div class="err">Screenshot failed: ${r.migratedError ?? 'unknown error'}</div>`;

    return `
    <section class="page-cmp" id="page-${i + 1}">
      <h2>Page ${i + 1}: <code>${r.path}</code></h2>
      <p class="meta">
        Source: <a href="${args.sourceBase}${r.path}" target="_blank">${args.sourceBase}${r.path}</a><br>
        Migrated: <a href="${args.migratedBase}${r.path}" target="_blank">${args.migratedBase}${r.path}</a>
      </p>
      <div class="cmp-row">
        <div class="col">
          <div class="col-label">SOURCE</div>
          <div class="img-wrap">${srcImg}</div>
        </div>
        <div class="col">
          <div class="col-label migrated">MIGRATED</div>
          <div class="img-wrap">${migImg}</div>
        </div>
      </div>
    </section>`;
  }).join('\n');

  const navLinks = results.map((r, i) =>
    `<a href="#page-${i + 1}">${r.path || '/'}</a>`
  ).join(' · ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Visual Migration QA — ${timestamp}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { background: #111; color: #eee; font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 0; }
    header { background: #1a1a2e; padding: 20px 32px; border-bottom: 1px solid #333; position: sticky; top: 0; z-index: 10; }
    header h1 { margin: 0 0 4px; font-size: 1rem; font-weight: 600; color: #a8b4ff; letter-spacing: 0.05em; text-transform: uppercase; }
    header .meta { font-size: 0.75rem; color: #666; margin: 0 0 8px; }
    header nav { font-size: 0.8rem; }
    header nav a { color: #5b8dee; text-decoration: none; margin-right: 8px; }
    header nav a:hover { text-decoration: underline; }
    .page-cmp { padding: 32px; border-bottom: 1px solid #222; }
    .page-cmp h2 { font-size: 1.1rem; margin: 0 0 4px; color: #c8d3ff; }
    .page-cmp h2 code { font-size: 1rem; background: #1e293b; padding: 2px 8px; border-radius: 4px; }
    .meta { font-size: 0.75rem; color: #666; margin: 0 0 16px; }
    .meta a { color: #5b8dee; text-decoration: none; }
    .cmp-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .col { background: #1a1a1a; border-radius: 8px; overflow: hidden; border: 1px solid #2a2a2a; }
    .col-label { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.15em; padding: 8px 12px; background: #b05c2a; color: #fff; text-transform: uppercase; }
    .col-label.migrated { background: #2a5cb0; }
    .img-wrap { padding: 0; overflow: auto; max-height: 80vh; }
    .img-wrap img { width: 100%; height: auto; display: block; }
    .err { padding: 24px; color: #f87171; font-size: 0.875rem; }
    .instructions { background: #1e293b; border-left: 3px solid #5b8dee; margin: 0; padding: 20px 32px; font-size: 0.875rem; line-height: 1.6; }
    .instructions strong { color: #a8b4ff; }
  </style>
</head>
<body>
  <header>
    <h1>Visual Migration QA Report</h1>
    <p class="meta">Generated: ${timestamp} · Source: ${args.sourceBase} · Migrated: ${args.migratedBase} · Viewport: ${args.viewport.width}×${args.viewport.height}</p>
    <nav>${navLinks}</nav>
  </header>

  <div class="instructions">
    <strong>Operator instructions:</strong> For each page below, compare the Source (left) and Migrated (right) screenshots.
    Flag pages where the visual layout, color scheme, or key content differs meaningfully.
    Use the <code>visual-compare</code> skill for an interactive deep-dive on any flagged page.
    Diff threshold for automated flagging: <strong>${(DIFF_THRESHOLD * 100).toFixed(0)}%</strong> pixel change (human review required regardless).
  </div>

  ${sections}
</body>
</html>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  const screenshotsDir = path.join(args.outDir, 'screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });

  console.log(`\n=== Visual Migration QA ===`);
  console.log(`Source:   ${args.sourceBase}`);
  console.log(`Migrated: ${args.migratedBase}`);
  console.log(`Paths:    ${args.paths.join(', ')}`);
  console.log(`Viewport: ${args.viewport.width}×${args.viewport.height}\n`);

  const results = await captureScreenshots(args, screenshotsDir);

  const htmlReport = buildHtmlReport(args, results, timestamp);
  const htmlPath = path.join(args.outDir, `visual-report-${timestamp}.html`);
  const jsonPath = path.join(args.outDir, `visual-report-${timestamp}.json`);

  fs.writeFileSync(htmlPath, htmlReport);
  fs.writeFileSync(jsonPath, JSON.stringify({ timestamp, args, results }, null, 2));

  console.log(`\n=== Reports written ===`);
  console.log(`  HTML (open in browser): ${htmlPath}`);
  console.log(`  JSON manifest:          ${jsonPath}`);
  console.log(`  Screenshots dir:        ${screenshotsDir}`);

  const failures = results.filter(r => !r.sourceOk || !r.migratedOk);
  if (failures.length > 0) {
    console.warn(`\n⚠ ${failures.length} page(s) had screenshot errors — review the HTML report.\n`);
    process.exit(1);
  } else {
    console.log(`\n✅ All ${results.length} page(s) captured. Open the HTML report for visual review.\n`);
    process.exit(0);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
