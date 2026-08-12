'use client';

// /portal/seo/[projectId] — audit dashboard shell. Owns the project fetch,
// the "Run audit" action, and the poll-while-active loop; tab bodies are
// dumb renderers over whatever run/runs it hands them.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { pBtnPrimary } from '@/components/portal/portal-ui';
import { HealthScoreBadge } from './HealthScoreBadge';
import { RunStatusPill } from './RunStatusPill';
import { isRunActive, relativeTime } from './format';
import type { Recommendation, SearchPerformanceData, SeoProjectDetail, SeoRun } from './types';
import { OverviewTab } from './OverviewTab';
import { IssuesTab } from './IssuesTab';
import { PagesTab } from './PagesTab';
import { SearchPerformanceTab } from './SearchPerformanceTab';
import { RecommendationsTab } from './RecommendationsTab';
import { HistoryTab } from './HistoryTab';

type Tab = 'recommendations' | 'overview' | 'issues' | 'pages' | 'search' | 'history';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'recommendations', label: 'Do next', icon: 'checklist' },
  { id: 'overview', label: 'Overview', icon: 'dashboard' },
  { id: 'issues', label: 'Issues', icon: 'fact_check' },
  { id: 'pages', label: 'Pages', icon: 'description' },
  { id: 'search', label: 'Search', icon: 'query_stats' },
  { id: 'history', label: 'History', icon: 'history' },
];

export default function SeoProjectDashboard({ projectId }: { projectId: number }) {
  const [project, setProject] = useState<SeoProjectDetail | null>(null);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [starting, setStarting] = useState(false);
  const [runError, setRunError] = useState('');
  // Cached at the shell level (not inside SearchPerformanceTab) so switching
  // tabs away and back doesn't re-trigger the GSC fetch — see that
  // component's comment for why this data source needs different caching
  // than the run-scoped Issues/Pages tabs.
  const [searchPerf, setSearchPerf] = useState<SearchPerformanceData | null>(null);
  // Same rationale as searchPerf above — recommendation generation is a
  // real metered AI call, so it must not silently re-fire on tab revisit.
  const [recommendations, setRecommendations] = useState<Recommendation[] | null>(null);

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/seo/projects/${projectId}`);
      const json = await res.json();
      if (!json.success) {
        if (res.status === 404) setMissing(true);
        setError(json.message || 'Failed to load project.');
        return;
      }
      setError('');
      setProject(json.data);
    } catch {
      setError('Network error loading project.');
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const latestRun: SeoRun | null = project?.runs[0] ?? null;

  // While the latest run is queued/running, poll its status every 5s. Once
  // it settles, pull the full project again so History/the runs list pick up
  // the finished run's final numbers.
  useEffect(() => {
    if (!latestRun || !isRunActive(latestRun.status)) return;
    const runId = latestRun.id;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/portal/seo/runs/${runId}`);
        const json = await res.json();
        if (!json.success) return;
        const updated: SeoRun = json.data;
        if (!isRunActive(updated.status)) {
          fetchProject();
          return;
        }
        setProject((prev) => (prev ? { ...prev, runs: [updated, ...prev.runs.slice(1)] } : prev));
      } catch {
        // Transient — try again next tick.
      }
    }, 5000);
    return () => clearInterval(t);
  }, [latestRun, fetchProject]);

  async function runAudit() {
    setStarting(true);
    setRunError('');
    try {
      const res = await fetch(`/api/portal/seo/projects/${projectId}/crawl`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setRunError(json.message || 'Failed to start audit.');
      } else {
        await fetchProject();
      }
    } catch {
      setRunError('Network error starting audit.');
    } finally {
      setStarting(false);
    }
  }

  if (missing) {
    return (
      <div className="max-w-5xl mx-auto py-16 text-center">
        <span className="material-icons text-4xl text-muted-foreground mb-2">search_off</span>
        <h1 className="font-display text-lg font-extrabold text-foreground mb-2">Project not found</h1>
        <Link href="/portal/seo" className="text-primary hover:underline text-sm">
          Back to SEO Intelligence
        </Link>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="max-w-5xl mx-auto flex items-center justify-center py-16 text-muted-foreground">
        {error ? <p className="text-sm text-destructive">{error}</p> : <span className="material-icons animate-spin text-2xl">progress_activity</span>}
      </div>
    );
  }

  const active = isRunActive(latestRun?.status);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <Link href="/portal/seo" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2">
            <span className="material-icons text-sm">arrow_back</span>
            SEO Intelligence
          </Link>
          <h1 className="font-display text-[clamp(1.5rem,2.4vw,2rem)] font-extrabold leading-[1.05] tracking-[-0.028em] text-foreground truncate">
            {project.name}
          </h1>
          <p className="text-sm font-mono text-muted-foreground mt-1 truncate">{project.domain}</p>
          {latestRun && (
            <div className="flex items-center gap-3 mt-2">
              {active && <RunStatusPill status={latestRun.status} />}
              <span className="text-xs text-muted-foreground">
                Last crawl: {relativeTime(latestRun.finishedAt ?? latestRun.createdAt)}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex items-center gap-3">
            <HealthScoreBadge score={latestRun?.healthScore ?? null} size="lg" />
            <button type="button" onClick={runAudit} disabled={active || starting} className={pBtnPrimary}>
              {active || starting ? (
                <>
                  <span className="material-icons text-base animate-spin">progress_activity</span>
                  {active ? 'Auditing…' : 'Starting…'}
                </>
              ) : (
                <>
                  <span className="material-icons text-base">play_arrow</span>
                  Run audit
                </>
              )}
            </button>
          </div>
          {runError && <p className="text-xs text-destructive">{runError}</p>}
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-border overflow-x-auto" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="material-icons text-base">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'recommendations' && (
        <RecommendationsTab projectId={projectId} data={recommendations} onDataChange={setRecommendations} />
      )}
      {tab === 'overview' && <OverviewTab run={latestRun} />}
      {tab === 'issues' && <IssuesTab runId={latestRun?.id ?? null} runStatus={latestRun?.status ?? null} />}
      {tab === 'pages' && <PagesTab runId={latestRun?.id ?? null} runStatus={latestRun?.status ?? null} />}
      {tab === 'search' && (
        <SearchPerformanceTab projectId={projectId} data={searchPerf} onDataChange={setSearchPerf} />
      )}
      {tab === 'history' && <HistoryTab runs={project.runs} />}
    </div>
  );
}
