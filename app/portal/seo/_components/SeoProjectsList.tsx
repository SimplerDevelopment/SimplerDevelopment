'use client';

// /portal/seo — project list body. Client component so it can own the
// "Run audit" polling loop and the create-project dialog without round-
// tripping through the server; the page.tsx wrapper only handles
// auth + entitlement.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pCard } from '@/components/portal/portal-ui';
import DomainGetStarted from '@/components/portal/onboarding/DomainGetStarted';
import { HealthScoreBadge } from './HealthScoreBadge';
import { RunStatusPill } from './RunStatusPill';
import { NewSeoProjectDialog } from './NewSeoProjectDialog';
import { isRunActive, relativeTime } from './format';
import type { SeoProjectListItem } from './types';

const runAuditBtnClass =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-foreground transition hover:border-foreground/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border';

export default function SeoProjectsList() {
  const [projects, setProjects] = useState<SeoProjectListItem[] | null>(null);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [startingIds, setStartingIds] = useState<Set<number>>(new Set());
  const [runErrors, setRunErrors] = useState<Record<number, string>>({});

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/seo/projects');
      const json = await res.json();
      if (!json.success) {
        setError(json.message || 'Failed to load SEO projects.');
        return;
      }
      setError('');
      setProjects(json.data ?? []);
    } catch {
      setError('Network error loading SEO projects.');
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Any project whose latest run is queued/running gets picked up here and
  // refreshed every 5s until nothing is active, so a crawl kicked off from
  // another tab (or the cron) still shows live progress on this list.
  useEffect(() => {
    if (!projects || !projects.some((p) => isRunActive(p.latestRun?.status))) return;
    const t = setInterval(fetchProjects, 5000);
    return () => clearInterval(t);
  }, [projects, fetchProjects]);

  async function runAudit(projectId: number) {
    setStartingIds((prev) => new Set(prev).add(projectId));
    setRunErrors((prev) => {
      const next = { ...prev };
      delete next[projectId];
      return next;
    });
    try {
      const res = await fetch(`/api/portal/seo/projects/${projectId}/crawl`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setRunErrors((prev) => ({ ...prev, [projectId]: json.message || 'Failed to start audit.' }));
      } else {
        await fetchProjects();
      }
    } catch {
      setRunErrors((prev) => ({ ...prev, [projectId]: 'Network error starting audit.' }));
    } finally {
      setStartingIds((prev) => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PortalPageHeader
        eyebrow="Optimization"
        title="SEO Intelligence"
        subtitle="Crawl your sites, find technical issues, and track health over time."
        actions={
          <button type="button" onClick={() => setDialogOpen(true)} className={pBtnPrimary}>
            <span className="material-icons text-base">add</span>
            New project
          </button>
        }
      />

      <DomainGetStarted domainKey="seo" />

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
          <span className="material-icons text-red-600">error</span>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {projects === null ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <span className="material-icons animate-spin text-2xl">progress_activity</span>
        </div>
      ) : projects.length === 0 ? (
        <div className={`${pCard} p-10 flex flex-col items-center text-center`}>
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <span className="material-icons text-3xl text-primary">travel_explore</span>
          </div>
          <h2 className="font-display font-extrabold tracking-[-0.01em] text-foreground mb-1">
            Find and fix what&apos;s holding your rankings back
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mb-6">
            Crawl any domain — hosted here or elsewhere — for technical SEO issues, broken links, and
            indexability problems, then track your health score as you fix them.
          </p>
          <button type="button" onClick={() => setDialogOpen(true)} className={pBtnPrimary}>
            <span className="material-icons text-base">add</span>
            Audit your first site
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {projects.map((p) => {
            const active = isRunActive(p.latestRun?.status);
            return (
              <div key={p.id} className={`${pCard} p-5 hover:border-primary/50 hover:shadow-sm transition-all`}>
                <Link href={`/portal/seo/${p.id}`} className="group block">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="material-icons text-primary text-lg">travel_explore</span>
                      </div>
                      <div className="min-w-0">
                        <h2 className="font-display font-extrabold tracking-[-0.01em] text-foreground group-hover:text-primary transition-colors truncate">
                          {p.name}
                        </h2>
                        <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">{p.domain}</p>
                      </div>
                    </div>
                    <HealthScoreBadge score={p.latestRun?.healthScore ?? null} />
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-3">
                    {active && p.latestRun && <RunStatusPill status={p.latestRun.status} />}
                    <span>
                      Last crawl: {p.latestRun ? relativeTime(p.latestRun.finishedAt ?? p.latestRun.createdAt) : 'never'}
                    </span>
                  </div>

                  {p.latestRun && p.latestRun.criticalCount + p.latestRun.warningCount + p.latestRun.noticeCount > 0 && (
                    <div className="flex items-center gap-3 text-xs border-t border-border pt-3">
                      <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                        <span className="material-icons text-xs">error</span>
                        {p.latestRun.criticalCount} critical
                      </span>
                      <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                        <span className="material-icons text-xs">warning</span>
                        {p.latestRun.warningCount} warning
                      </span>
                      <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                        <span className="material-icons text-xs">info</span>
                        {p.latestRun.noticeCount} notice
                      </span>
                    </div>
                  )}
                </Link>

                <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => runAudit(p.id)}
                    disabled={active || startingIds.has(p.id)}
                    className={runAuditBtnClass}
                  >
                    {startingIds.has(p.id) || active ? (
                      <>
                        <span className="material-icons text-sm animate-spin">progress_activity</span>
                        {active ? 'Auditing…' : 'Starting…'}
                      </>
                    ) : (
                      <>
                        <span className="material-icons text-sm">play_arrow</span>
                        Run audit
                      </>
                    )}
                  </button>
                  <Link
                    href={`/portal/seo/${p.id}`}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    View report
                    <span className="material-icons text-xs">arrow_forward</span>
                  </Link>
                </div>
                {runErrors[p.id] && <p className="mt-2 text-xs text-destructive">{runErrors[p.id]}</p>}
              </div>
            );
          })}
        </div>
      )}

      <NewSeoProjectDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onCreated={fetchProjects} />
    </div>
  );
}
