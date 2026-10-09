'use client';

/**
 * PUX-180 (design doc screen 39): the overview as one scan — issues severity
 * first, the five top pages, the Search Console clicks sparkline, the top
 * recommendations — over the same routes the six tabs already use. The
 * search-performance and recommendations reads share the shell's cache so
 * opening those tabs later costs nothing. No "Fix on the page": no
 * recommendation carries a page/post id and no URL → post mapping exists, so
 * the deep link is not invented. Studio-only; the shell gates on the flag.
 */

import { useEffect, useState } from 'react';
import { OverviewTab } from './OverviewTab';
import { severityClasses } from './format';
import { flatIssues, sparkPath, topPages } from '@/lib/seo/overview-shape';
import { sBtnGhost } from '@/components/portal/portal-ui';
import { GhostCard } from '@/components/portal/EmptyState';
import type { Recommendation, SearchPerformanceData, SeoCrawlPageRow, SeoIssueGroup, SeoRun } from './types';

type Tab = 'recommendations' | 'overview' | 'issues' | 'pages' | 'search' | 'history';

const card = 'rounded-2xl border border-border bg-card p-4';
const h2 = 'mb-3 flex items-center gap-1.5 font-display text-sm font-semibold text-foreground';

export function StudioOverview({
  projectId, run, onShowTab, searchPerf, onSearchPerf, recommendations, onRecommendations,
}: {
  projectId: number;
  run: SeoRun | null;
  onShowTab: (tab: Tab) => void;
  searchPerf: SearchPerformanceData | null;
  onSearchPerf: (d: SearchPerformanceData) => void;
  recommendations: Recommendation[] | null;
  onRecommendations: (r: Recommendation[]) => void;
}) {
  const runId = run?.id ?? null;
  const [issues, setIssues] = useState<SeoIssueGroup[] | null>(null);
  const [pages, setPages] = useState<SeoCrawlPageRow[] | null>(null);
  // Local copies of what this pane fetched itself — the shell's cache is preferred when it has them.
  const [spLocal, setSpLocal] = useState<SearchPerformanceData | null>(null);
  const [recLocal, setRecLocal] = useState<Recommendation[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const get = async <T,>(url: string): Promise<T | null> => {
        try { const r = await fetch(url); const j = await r.json(); return r.ok && j.success ? (j.data as T) : null; } catch { return null; }
      };
      const [i, p, sp, rec] = await Promise.all([
        runId ? get<SeoIssueGroup[]>(`/api/portal/seo/runs/${runId}/issues`) : null,
        runId ? get<SeoCrawlPageRow[]>(`/api/portal/seo/runs/${runId}/pages`) : null,
        searchPerf ? null : get<SearchPerformanceData>(`/api/portal/seo/projects/${projectId}/search-performance`),
        recommendations ? null : get<Recommendation[]>(`/api/portal/seo/projects/${projectId}/recommendations`),
      ]);
      if (!cancelled) {
        setIssues(i ?? []);
        setPages(p ?? []);
        if (sp) { setSpLocal(sp); onSearchPerf(sp); }
        if (rec) { setRecLocal(rec); onRecommendations(rec); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, runId]);

  if (!run) return <OverviewTab run={run} />;
  const flat = issues ? flatIssues(issues) : [];
  const top = pages ? topPages(pages, 5) : [];
  const sp = searchPerf ?? spLocal;
  const allRecs = recommendations ?? recLocal;
  const series = sp?.overview?.series ?? [];
  const totals = sp?.overview?.totals;
  const recs = (allRecs ?? []).filter((r) => r.status !== 'dismissed').slice(0, 3);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card} aria-label="Issues">
          <h2 className={h2}><span className="material-icons text-base text-muted-foreground">report</span>Issues<span className="ml-auto text-xs font-normal text-muted-foreground">{flat.length} open</span></h2>
          {issues === null ? null : flat.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing flagged on the last crawl.</p>
          ) : (
            <ul className="divide-y divide-border">
              {flat.slice(0, 6).map((i) => (
                <li key={`${i.severity}-${i.title}`} className="flex items-center gap-3 py-2">
                  <span className={`rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold uppercase ${severityClasses[i.severity]}`}>{i.severity}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{i.title}</span>
                  <span className="truncate text-xs text-muted-foreground">{i.count} {i.count === 1 ? 'page' : 'pages'}{i.sampleUrl ? `, incl. ${i.sampleUrl}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
          {flat.length > 6 && <button type="button" onClick={() => onShowTab('issues')} className={`${sBtnGhost} mt-3`}>All {flat.length} issues</button>}
        </section>
        <section className={card} aria-label="Search queries">
          <h2 className={h2}><span className="material-icons text-base text-muted-foreground">query_stats</span>Search queries, 28d</h2>
          {!sp?.connected || !totals ? (
            <GhostCard icon="query_stats" title="Search Console isn't connected" body="Connect it on the Search tab to see clicks and impressions here." onClick={() => onShowTab('search')} />
          ) : (
            <div className="flex items-end justify-between gap-4">
              <dl className="flex gap-4 text-sm">
                {[[totals.clicks.toLocaleString(), 'clicks'], [totals.impressions.toLocaleString(), 'impr.'], [totals.avgPosition.toFixed(1), 'avg pos.']].map(([v, l]) => (
                  <div key={l}><dt className="font-display text-lg font-extrabold tabular-nums text-foreground">{v}</dt><dd className="text-xs text-muted-foreground">{l}</dd></div>
                ))}
              </dl>
              {series.length > 1 && (
                <svg width="160" height="36" viewBox="0 0 160 36" aria-label="Clicks per day"><polyline points={sparkPath(series)} fill="none" className="stroke-primary" strokeWidth="2" strokeLinejoin="round" /></svg>
              )}
            </div>
          )}
        </section>
      </div>

      <section className={card} aria-label="Top pages">
        <h2 className={h2}><span className="material-icons text-base text-muted-foreground">language</span>Top pages<button type="button" onClick={() => onShowTab('pages')} className="ml-auto text-xs font-normal text-muted-foreground hover:text-foreground">All {pages?.length ?? 0} pages →</button></h2>
        {pages === null ? null : top.length === 0 ? <p className="text-sm text-muted-foreground">No pages crawled yet.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-[.05em] text-muted-foreground"><th className="py-1 pr-3">URL</th><th className="py-1 pr-3">Status</th><th className="py-1 pr-3">Indexable</th><th className="py-1 pr-3 text-right">Rank</th><th className="py-1 text-right">Inbound</th></tr></thead>
            <tbody className="divide-y divide-border">
              {top.map((p) => (
                <tr key={p.id}>
                  <td className="max-w-0 truncate py-1.5 pr-3 font-mono text-xs text-foreground">{p.url.replace(/^https?:\/\/[^/]+/, '') || '/'}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{p.httpStatus ?? '—'}</td>
                  <td className="py-1.5 pr-3">{p.indexable == null ? '—' : p.indexable ? 'Yes' : 'No'}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{p.internalRank ?? '—'}</td>
                  <td className="py-1.5 text-right tabular-nums">{p.incomingLinks ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={card} aria-label="Recommendations">
        <h2 className={h2}><span className="material-icons text-base text-[var(--studio-gold-ink)]">lightbulb</span>Recommendations<button type="button" onClick={() => onShowTab('recommendations')} className="ml-auto text-xs font-normal text-muted-foreground hover:text-foreground">All →</button></h2>
        {allRecs === null ? null : recs.length === 0 ? (
          <GhostCard icon="lightbulb" title="No recommendations yet" body="Generate them on the Recommendations tab after an audit." onClick={() => onShowTab('recommendations')} />
        ) : (
          <ul className="divide-y divide-border">
            {recs.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{r.title}</span>
                <span className="text-xs text-muted-foreground">Est. impact: {r.impact}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Crawl detail — status codes, depth, indexability</summary>
        <div className="mt-3"><OverviewTab run={run} /></div>
      </details>
    </div>
  );
}
