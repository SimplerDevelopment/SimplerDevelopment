// Deterministic Search Console report derivations (SEO-012) — pure SQL/TS
// aggregation over seo_gsc_query_daily / seo_gsc_page_daily, no AI.
//
// Every report anchors on the PROJECT's own max(date), never "today" — the
// importer lags ~3 days (lib/seo/gsc.ts) and is capped/top-N, so anchoring
// on wall-clock time would silently shrink the window whenever an import is
// late. A project with no imported rows returns empty structures, never
// throws — callers (dashboard cards) can render an empty state uniformly.

import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { seoGscPageDaily, seoGscQueryDaily } from '@/lib/db/schema';

const DEFAULT_OVERVIEW_DAYS = 90;
const DEFAULT_WINDOW_DAYS = 28;

export type GscOverview = {
  series: { date: string; clicks: number; impressions: number }[]; // ascending by date
  totals: { clicks: number; impressions: number; avgCtr: number; avgPosition: number }; // avgs impression-weighted
};
export type QueryDelta = { query: string; clicks: number; prevClicks: number; deltaClicks: number; position: number; prevPosition: number };
export type QueryStat = { query: string; clicks: number; impressions: number; ctr: number; position: number };
export type PageDelta = { page: string; clicks: number; prevClicks: number; deltaClicks: number; declinePct: number };

// Organic CTR-by-position curve used as the "expected" baseline for the CTR
// opportunity report. 11-12 share a value — the real-world curve is flat by
// the bottom of page 1.
export const EXPECTED_CTR_BY_POSITION: Record<number, number> = {
  1: 0.28, 2: 0.15, 3: 0.1, 4: 0.07, 5: 0.05, 6: 0.04, 7: 0.03, 8: 0.025, 9: 0.02, 10: 0.015, 11: 0.015, 12: 0.015,
};

// ─── date window math (strings, UTC — no Date objects leak across the boundary) ──

function addDaysToDateString(date: string, delta: number): string {
  const d = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))));
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** `days` days ending at `anchor` inclusive. */
function currentWindow(anchor: string, days: number): { start: string; end: string } {
  return { start: addDaysToDateString(anchor, -(days - 1)), end: anchor };
}

/** The `days` days immediately before `currentWindow`. */
function previousWindow(anchor: string, days: number): { start: string; end: string } {
  const currStart = addDaysToDateString(anchor, -(days - 1));
  return { start: addDaysToDateString(currStart, -days), end: addDaysToDateString(currStart, -1) };
}

/** max(date) across both GSC tables for the project, or null if nothing has imported yet. */
async function getAnchorDate(projectId: number): Promise<string | null> {
  const [[queryMax], [pageMax]] = await Promise.all([
    db.select({ maxDate: sql<string | null>`max(${seoGscQueryDaily.date})` })
      .from(seoGscQueryDaily).where(eq(seoGscQueryDaily.projectId, projectId)),
    db.select({ maxDate: sql<string | null>`max(${seoGscPageDaily.date})` })
      .from(seoGscPageDaily).where(eq(seoGscPageDaily.projectId, projectId)),
  ]);
  const dates = [queryMax?.maxDate, pageMax?.maxDate].filter((d): d is string => Boolean(d));
  return dates.length ? dates.sort().at(-1)! : null;
}

// ─── per-window aggregates (SQL groupBy; windows merged in TS) ─────────────

type QueryAgg = { clicks: number; impressions: number; position: number };

/** Per-query sums for one window: clicks, impressions, impression-weighted avg position. */
async function queryAggregatesForWindow(projectId: number, start: string, end: string): Promise<Map<string, QueryAgg>> {
  const rows = await db
    .select({
      query: seoGscQueryDaily.query,
      clicks: sql<number>`coalesce(sum(${seoGscQueryDaily.clicks})::int, 0)`,
      impressions: sql<number>`coalesce(sum(${seoGscQueryDaily.impressions})::int, 0)`,
      weightedPosition: sql<number>`coalesce(sum(${seoGscQueryDaily.position} * ${seoGscQueryDaily.impressions}), 0)`,
    })
    .from(seoGscQueryDaily)
    .where(and(eq(seoGscQueryDaily.projectId, projectId), gte(seoGscQueryDaily.date, start), lte(seoGscQueryDaily.date, end)))
    .groupBy(seoGscQueryDaily.query);

  const map = new Map<string, QueryAgg>();
  for (const r of rows) {
    map.set(r.query, { clicks: r.clicks, impressions: r.impressions, position: r.impressions > 0 ? r.weightedPosition / r.impressions : 0 });
  }
  return map;
}

/** Per-page click sums for one window — page decay only needs clicks. */
async function pageClicksForWindow(projectId: number, start: string, end: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ page: seoGscPageDaily.page, clicks: sql<number>`coalesce(sum(${seoGscPageDaily.clicks})::int, 0)` })
    .from(seoGscPageDaily)
    .where(and(eq(seoGscPageDaily.projectId, projectId), gte(seoGscPageDaily.date, start), lte(seoGscPageDaily.date, end)))
    .groupBy(seoGscPageDaily.page);
  return new Map(rows.map((r) => [r.page, r.clicks]));
}

const queryStat = (query: string, agg: QueryAgg): QueryStat => ({
  query,
  clicks: agg.clicks,
  impressions: agg.impressions,
  ctr: agg.impressions > 0 ? agg.clicks / agg.impressions : 0,
  position: agg.position,
});

// ─── reports ────────────────────────────────────────────────────────────────

export async function getSearchOverview(projectId: number, days = DEFAULT_OVERVIEW_DAYS): Promise<GscOverview> {
  const empty: GscOverview = { series: [], totals: { clicks: 0, impressions: 0, avgCtr: 0, avgPosition: 0 } };
  const anchor = await getAnchorDate(projectId);
  if (!anchor) return empty;
  const { start, end } = currentWindow(anchor, days);
  const inWindow = and(eq(seoGscQueryDaily.projectId, projectId), gte(seoGscQueryDaily.date, start), lte(seoGscQueryDaily.date, end));

  const [series, [totals]] = await Promise.all([
    db.select({
        date: seoGscQueryDaily.date,
        clicks: sql<number>`coalesce(sum(${seoGscQueryDaily.clicks})::int, 0)`,
        impressions: sql<number>`coalesce(sum(${seoGscQueryDaily.impressions})::int, 0)`,
      })
      .from(seoGscQueryDaily).where(inWindow).groupBy(seoGscQueryDaily.date).orderBy(asc(seoGscQueryDaily.date)),
    db.select({
        clicks: sql<number>`coalesce(sum(${seoGscQueryDaily.clicks})::int, 0)`,
        impressions: sql<number>`coalesce(sum(${seoGscQueryDaily.impressions})::int, 0)`,
        weightedPosition: sql<number>`coalesce(sum(${seoGscQueryDaily.position} * ${seoGscQueryDaily.impressions}), 0)`,
      })
      .from(seoGscQueryDaily).where(inWindow),
  ]);

  const clicks = totals?.clicks ?? 0;
  const impressions = totals?.impressions ?? 0;
  const weightedPosition = totals?.weightedPosition ?? 0;
  return {
    series,
    totals: {
      clicks,
      impressions,
      avgCtr: impressions > 0 ? clicks / impressions : 0,
      avgPosition: impressions > 0 ? weightedPosition / impressions : 0,
    },
  };
}

export async function getWinnersLosers(projectId: number, days = DEFAULT_WINDOW_DAYS): Promise<{ winners: QueryDelta[]; losers: QueryDelta[] }> {
  const empty = { winners: [] as QueryDelta[], losers: [] as QueryDelta[] };
  const anchor = await getAnchorDate(projectId);
  if (!anchor) return empty;
  const curr = currentWindow(anchor, days);
  const prev = previousWindow(anchor, days);
  const [currMap, prevMap] = await Promise.all([
    queryAggregatesForWindow(projectId, curr.start, curr.end),
    queryAggregatesForWindow(projectId, prev.start, prev.end),
  ]);

  // Union of both windows' keys — a query absent from both never appears;
  // absent from just one counts as 0 clicks / position 0 there (UI shows '—').
  const deltas: QueryDelta[] = [];
  for (const query of new Set([...currMap.keys(), ...prevMap.keys()])) {
    const c = currMap.get(query);
    const p = prevMap.get(query);
    const clicks = c?.clicks ?? 0;
    const prevClicks = p?.clicks ?? 0;
    deltas.push({ query, clicks, prevClicks, deltaClicks: clicks - prevClicks, position: c?.position ?? 0, prevPosition: p?.position ?? 0 });
  }

  return {
    winners: deltas.filter((d) => d.deltaClicks > 0).sort((a, b) => b.deltaClicks - a.deltaClicks).slice(0, 25),
    losers: deltas.filter((d) => d.deltaClicks < 0).sort((a, b) => a.deltaClicks - b.deltaClicks).slice(0, 25),
  };
}

export async function getNewLostQueries(projectId: number, days = DEFAULT_WINDOW_DAYS): Promise<{ newQueries: QueryStat[]; lostQueries: QueryStat[] }> {
  const empty = { newQueries: [] as QueryStat[], lostQueries: [] as QueryStat[] };
  const anchor = await getAnchorDate(projectId);
  if (!anchor) return empty;
  const curr = currentWindow(anchor, days);
  const prev = previousWindow(anchor, days);
  const [currMap, prevMap] = await Promise.all([
    queryAggregatesForWindow(projectId, curr.start, curr.end),
    queryAggregatesForWindow(projectId, prev.start, prev.end),
  ]);

  // Map membership IS "has a row in that window" — a query only ever lands
  // in a window's map if at least one daily row summed into it.
  const newQueries = [...currMap.entries()]
    .filter(([query, agg]) => agg.clicks >= 1 && !prevMap.has(query))
    .map(([query, agg]) => queryStat(query, agg))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 50);

  const lostQueries = [...prevMap.entries()]
    .filter(([query, agg]) => agg.clicks >= 1 && !currMap.has(query))
    .map(([query, agg]) => queryStat(query, agg))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 50);

  return { newQueries, lostQueries };
}

export async function getCtrOpportunities(projectId: number, days = DEFAULT_WINDOW_DAYS): Promise<QueryStat[]> {
  const anchor = await getAnchorDate(projectId);
  if (!anchor) return [];
  const { start, end } = currentWindow(anchor, days);
  const map = await queryAggregatesForWindow(projectId, start, end);

  const stats: QueryStat[] = [];
  for (const [query, agg] of map) {
    if (agg.impressions < 200 || agg.position > 12) continue;
    // Clamp the bucket lookup — avgPosition is a continuous impression-weighted
    // average, EXPECTED_CTR_BY_POSITION is keyed 1..12.
    const bucket = Math.min(12, Math.max(1, Math.round(agg.position)));
    const ctr = agg.impressions > 0 ? agg.clicks / agg.impressions : 0;
    if (ctr < 0.6 * EXPECTED_CTR_BY_POSITION[bucket]) stats.push(queryStat(query, agg));
  }
  return stats.sort((a, b) => b.impressions - a.impressions).slice(0, 50);
}

export async function getStrikingDistance(projectId: number, days = DEFAULT_WINDOW_DAYS): Promise<QueryStat[]> {
  const anchor = await getAnchorDate(projectId);
  if (!anchor) return [];
  const { start, end } = currentWindow(anchor, days);
  const map = await queryAggregatesForWindow(projectId, start, end);

  const stats: QueryStat[] = [];
  for (const [query, agg] of map) {
    if (agg.position < 5 || agg.position > 15) continue;
    stats.push(queryStat(query, agg));
  }
  return stats.sort((a, b) => b.impressions - a.impressions).slice(0, 50);
}

export async function getPageDecay(projectId: number, days = DEFAULT_WINDOW_DAYS): Promise<PageDelta[]> {
  const anchor = await getAnchorDate(projectId);
  if (!anchor) return [];
  const curr = currentWindow(anchor, days);
  const prev = previousWindow(anchor, days);
  const [currMap, prevMap] = await Promise.all([
    pageClicksForWindow(projectId, curr.start, curr.end),
    pageClicksForWindow(projectId, prev.start, prev.end),
  ]);

  const deltas: PageDelta[] = [];
  for (const [page, prevClicks] of prevMap) {
    if (prevClicks < 20) continue; // page must have had real traffic to "decay"
    const clicks = currMap.get(page) ?? 0;
    const declinePct = (100 * (prevClicks - clicks)) / prevClicks;
    if (declinePct < 30) continue;
    deltas.push({ page, clicks, prevClicks, deltaClicks: clicks - prevClicks, declinePct });
  }
  return deltas.sort((a, b) => (b.prevClicks - b.clicks) - (a.prevClicks - a.clicks)).slice(0, 50);
}
