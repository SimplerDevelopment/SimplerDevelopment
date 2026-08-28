/**
 * PUX-180 (design doc screen 39): pure shapes for the studio SEO overview.
 * - topPages: the crawl's best-ranked pages first (internalRank asc, nulls last).
 * - flatIssues: the rule groups (already severity-sorted by the issues route)
 *   as one list a scan can read — severity, title, count, a sample URL.
 * - sparkPath: a per-day series as SVG polyline points.
 */

export interface RankedPage { internalRank: number | null }
export function topPages<T extends RankedPage>(rows: T[], n = 5): T[] {
  return [...rows]
    .sort((a, b) => (a.internalRank ?? Number.POSITIVE_INFINITY) - (b.internalRank ?? Number.POSITIVE_INFINITY))
    .slice(0, n);
}

export interface IssueGroupLike { severity: 'critical' | 'warning' | 'notice'; title: string; count: number; pages: { url: string | null }[] }
export interface FlatIssue { severity: IssueGroupLike['severity']; title: string; count: number; sampleUrl: string | null }
const ORDER: Record<IssueGroupLike['severity'], number> = { critical: 0, warning: 1, notice: 2 };
export function flatIssues(groups: IssueGroupLike[]): FlatIssue[] {
  return [...groups]
    .sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || b.count - a.count)
    .map((g) => ({ severity: g.severity, title: g.title, count: g.count, sampleUrl: g.pages.find((p) => p.url)?.url ?? null }));
}

export function sparkPath(series: { clicks: number }[], width = 160, height = 36): string {
  if (series.length < 2) return '';
  const max = Math.max(...series.map((p) => p.clicks), 1);
  const step = width / (series.length - 1);
  return series.map((p, i) => `${(i * step).toFixed(1)},${(height - (p.clicks / max) * (height - 2) - 1).toFixed(1)}`).join(' ');
}
