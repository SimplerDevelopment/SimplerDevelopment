'use client';

// Issues tab — accordion grouped by rule, fetched fresh from
// GET /seo/runs/[id]/issues each time the tab mounts (issues only change
// between crawls, so there's no need for the 5s polling the dashboard shell
// uses for run status).

import { useEffect, useState } from 'react';
import { pCard } from '@/components/portal/portal-ui';
import { isRunActive, severityClasses, severityIcons } from './format';
import type { SeoIssueGroup, SeoRunStatus } from './types';

export function IssuesTab({ runId, runStatus }: { runId: number | null; runStatus: SeoRunStatus | null }) {
  const [issues, setIssues] = useState<SeoIssueGroup[] | null>(null);
  const [error, setError] = useState('');
  const [openRule, setOpenRule] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) {
      setIssues([]);
      return;
    }
    let cancelled = false;
    setIssues(null);
    setOpenRule(null);
    fetch(`/api/portal/seo/runs/${runId}/issues`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (!json.success) {
          setError(json.message || 'Failed to load issues.');
          return;
        }
        setError('');
        setIssues(json.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('Network error loading issues.');
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (!runId) {
    return (
      <div className={`${pCard} p-10 text-center`}>
        <span className="material-icons text-4xl text-muted-foreground/50 mb-2">fact_check</span>
        <p className="text-sm text-muted-foreground">No crawls yet. Run an audit to see issues here.</p>
      </div>
    );
  }

  if (issues === null) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <span className="material-icons animate-spin text-2xl">progress_activity</span>
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (issues.length === 0) {
    return (
      <div className={`${pCard} p-10 text-center`}>
        <span className="material-icons text-4xl text-green-500 mb-2">check_circle</span>
        <p className="text-sm text-muted-foreground">
          {isRunActive(runStatus) ? 'Crawl in progress — no issues found yet.' : 'No issues found. Nice work.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {issues.map((group) => {
        const open = openRule === group.ruleId;
        return (
          <div key={group.ruleId} className={pCard}>
            <button
              type="button"
              onClick={() => setOpenRule(open ? null : group.ruleId)}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-accent/50 transition-colors rounded-2xl"
              aria-expanded={open}
            >
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${severityClasses[group.severity]}`}
              >
                <span className="material-icons text-xs">{severityIcons[group.severity]}</span>
                {group.severity}
              </span>
              <span className="flex-1 min-w-0 font-medium text-sm text-foreground truncate">{group.title}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {group.count} {group.count === 1 ? 'page' : 'pages'}
              </span>
              <span className="material-icons text-muted-foreground shrink-0">
                {open ? 'expand_less' : 'expand_more'}
              </span>
            </button>
            {open && (
              <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                {group.description && <p className="text-sm text-muted-foreground">{group.description}</p>}
                {group.whyItMatters && (
                  <div>
                    <p className="text-xs font-semibold text-foreground mb-0.5">Why it matters</p>
                    <p className="text-sm text-muted-foreground">{group.whyItMatters}</p>
                  </div>
                )}
                {group.howToFix && (
                  <div>
                    <p className="text-xs font-semibold text-foreground mb-0.5">How to fix</p>
                    <p className="text-sm text-muted-foreground">{group.howToFix}</p>
                  </div>
                )}
                {group.pages.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-foreground mb-1.5">Affected pages ({group.count})</p>
                    <ul className="space-y-1 max-h-48 overflow-y-auto">
                      {group.pages.map((p, i) => (
                        <li key={p.id ?? i} className="text-xs font-mono text-muted-foreground truncate">
                          {p.url ?? 'Site-level'}
                        </li>
                      ))}
                    </ul>
                    {group.count > group.pages.length && (
                      <p className="text-xs text-muted-foreground/70 mt-1">+ {group.count - group.pages.length} more</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
