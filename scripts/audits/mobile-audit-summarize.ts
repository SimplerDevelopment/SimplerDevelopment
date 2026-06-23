/**
 * Aggregate .mobile-audit/findings/*.json into a single human-readable report
 * grouped by feature area (the second path segment after /portal).
 *
 *   bun scripts/audits/mobile-audit-summarize.ts
 *
 * Writes:
 *   - .mobile-audit/report.md  — markdown summary, grouped by area
 *   - .mobile-audit/issues.json — flat list of issue objects (per finding)
 *
 * Issue object:
 *   { route, viewport, area, kind, detail }
 *
 * Where `kind` is one of:
 *   - horizontal-overflow
 *   - overflowing-element
 *   - tiny-tap-target
 *   - console-error
 *   - page-error
 *   - non-200
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

interface Finding {
  route: string;
  viewport: string;
  status: number | null;
  finalUrl: string;
  consoleErrors: string[];
  pageErrors: string[];
  horizontalOverflow: { bodyScrollWidth: number; viewportWidth: number; diff: number } | null;
  overflowingElements: Array<{ selector: string; right: number; width: number; text?: string; position?: string }>;
  tinyTapTargets: Array<{ selector: string; w: number; h: number; text?: string }>;
  navState: { hamburgerVisible: boolean; sidebarVisible: boolean; headerHeight: number | null };
  ok: boolean;
  notes: string[];
}

interface Issue {
  route: string;
  viewport: string;
  area: string;
  kind: 'horizontal-overflow' | 'overflowing-element' | 'tiny-tap-target' | 'console-error' | 'page-error' | 'non-200' | 'note';
  severity: 'high' | 'medium' | 'low';
  detail: string;
}

function areaOf(route: string): string {
  const m = route.match(/^\/portal\/([^/?]+)/);
  if (!m) return 'root';
  return m[1];
}

const ROOT = process.cwd();
const FINDINGS_DIR = path.join(ROOT, '.mobile-audit', 'findings');

async function main(): Promise<void> {
  const files = (await readdir(FINDINGS_DIR)).filter((f) => f.endsWith('.json') && !f.startsWith('__'));
  const findings: Finding[] = [];
  for (const f of files) {
    const raw = await readFile(path.join(FINDINGS_DIR, f), 'utf-8');
    findings.push(JSON.parse(raw) as Finding);
  }

  const issues: Issue[] = [];
  for (const f of findings) {
    const area = areaOf(f.route);
    if (f.status !== null && (f.status < 200 || f.status >= 400)) {
      issues.push({ route: f.route, viewport: f.viewport, area, kind: 'non-200', severity: 'high', detail: `status ${f.status} -> ${f.finalUrl}` });
    }
    for (const e of f.consoleErrors) {
      issues.push({ route: f.route, viewport: f.viewport, area, kind: 'console-error', severity: 'medium', detail: e.slice(0, 200) });
    }
    for (const e of f.pageErrors) {
      issues.push({ route: f.route, viewport: f.viewport, area, kind: 'page-error', severity: 'high', detail: e.slice(0, 200) });
    }
    if (f.horizontalOverflow) {
      issues.push({
        route: f.route,
        viewport: f.viewport,
        area,
        kind: 'horizontal-overflow',
        severity: f.horizontalOverflow.diff > 50 ? 'high' : 'medium',
        detail: `body scrolls ${f.horizontalOverflow.bodyScrollWidth}px in ${f.horizontalOverflow.viewportWidth}px viewport (+${f.horizontalOverflow.diff}px)`,
      });
    }
    for (const el of f.overflowingElements) {
      // Skip elements inside a horizontal-scroll container — the container is
      // designed to scroll horizontally on mobile, so child overflow is by
      // design. The audit emits up to 5 ancestor segments in the selector;
      // if `overflow-x-auto` appears anywhere in the path, treat as expected.
      if ((el.selector || '').includes('overflow-x-auto')) continue;
      // Also skip when the element is a descendant of a `table.min-w-[640px]`
      // pattern — these are deliberate horizontally-scrolling tables.
      if (/table\.w-full\.min-w-\[/.test(el.selector || '')) continue;
      issues.push({
        route: f.route,
        viewport: f.viewport,
        area,
        kind: 'overflowing-element',
        severity: el.right - 390 > 50 ? 'high' : 'medium',
        detail: `${el.selector} (w=${el.width}, right=${el.right}, pos=${el.position ?? '?'}) ${el.text ? `text="${el.text}"` : ''}`,
      });
    }
    for (const tt of f.tinyTapTargets) {
      // Skip the tiny "x" close buttons that are usually 24x24 — they're a known
      // exception we tolerate; only flag if smaller than 28x28.
      if (tt.w >= 28 && tt.h >= 28) continue;
      issues.push({
        route: f.route,
        viewport: f.viewport,
        area,
        kind: 'tiny-tap-target',
        severity: 'low',
        detail: `${tt.selector} (${tt.w}x${tt.h}) text="${tt.text ?? ''}"`,
      });
    }
    for (const n of f.notes) {
      issues.push({ route: f.route, viewport: f.viewport, area, kind: 'note', severity: 'low', detail: n });
    }
  }

  // Group by area
  const byArea = new Map<string, Issue[]>();
  for (const i of issues) {
    if (!byArea.has(i.area)) byArea.set(i.area, []);
    byArea.get(i.area)!.push(i);
  }

  // Sort areas by total severity weight
  const weight: Record<Issue['severity'], number> = { high: 4, medium: 2, low: 1 };
  const areas = [...byArea.entries()].sort((a, b) => {
    const wa = a[1].reduce((s, i) => s + weight[i.severity], 0);
    const wb = b[1].reduce((s, i) => s + weight[i.severity], 0);
    return wb - wa;
  });

  // Markdown report
  let md = `# Portal Mobile/Responsive Audit\n\n`;
  md += `Viewport: 390x844 (iPhone 14 Pro). Generated ${new Date().toISOString()}.\n\n`;
  md += `**${issues.length} issues across ${areas.length} areas, from ${findings.length} routes.**\n\n`;

  const highCount = issues.filter((i) => i.severity === 'high').length;
  const medCount = issues.filter((i) => i.severity === 'medium').length;
  const lowCount = issues.filter((i) => i.severity === 'low').length;
  md += `Severity breakdown: **${highCount} high**, ${medCount} medium, ${lowCount} low.\n\n`;

  md += `## Top areas by weighted severity\n\n`;
  md += `| Area | Issues | High | Medium | Low |\n|---|---|---|---|---|\n`;
  for (const [area, list] of areas) {
    const h = list.filter((i) => i.severity === 'high').length;
    const m = list.filter((i) => i.severity === 'medium').length;
    const l = list.filter((i) => i.severity === 'low').length;
    md += `| \`/portal/${area}\` | ${list.length} | ${h} | ${m} | ${l} |\n`;
  }
  md += `\n`;

  for (const [area, list] of areas) {
    md += `## /portal/${area}\n\n`;
    const byRoute = new Map<string, Issue[]>();
    for (const i of list) {
      if (!byRoute.has(i.route)) byRoute.set(i.route, []);
      byRoute.get(i.route)!.push(i);
    }
    for (const [route, ilist] of byRoute) {
      md += `### \`${route}\`\n\n`;
      for (const i of ilist) {
        md += `- **${i.severity.toUpperCase()}** [${i.kind}] ${i.detail}\n`;
      }
      md += `\n`;
    }
  }

  await writeFile(path.join(ROOT, '.mobile-audit', 'report.md'), md);
  await writeFile(path.join(ROOT, '.mobile-audit', 'issues.json'), JSON.stringify(issues, null, 2));

  console.log(`[summarize] ${issues.length} issues; ${highCount} high, ${medCount} medium, ${lowCount} low`);
  console.log(`[summarize] wrote .mobile-audit/report.md and .mobile-audit/issues.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
