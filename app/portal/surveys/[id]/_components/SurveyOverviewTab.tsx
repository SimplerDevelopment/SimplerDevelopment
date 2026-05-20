'use client';

/**
 * SurveyOverviewTab — overview/dashboard tab for the survey detail page.
 *
 * Renders top-level stat cards, three quick-action buttons, and the
 * recent-responses list. Also surfaces an A/B variants summary when the
 * survey has any: per-variant response totals + a hint to dive into the
 * Variants tab. The data comes from the dedicated stats endpoint so we don't
 * need to refetch it across panels.
 */

import { useEffect, useState } from 'react';
import type { Survey, SurveyResponse, SurveyResponseStats } from '../_lib/api';

interface VariantSummary {
  id: number;
  name: string;
  weight: number;
  enabled: boolean;
}

interface VariantStat {
  variantId: number | null;
  total: number;
  completed: number;
  withEmail: number;
}

interface Props {
  survey: Survey;
  responses: SurveyResponse[];
  stats: SurveyResponseStats;
  setTab: (tab: 'share' | 'edit' | 'responses' | 'variants') => void;
}

export default function SurveyOverviewTab({ survey, responses, stats, setTab }: Props) {
  const questionCount = (survey.fields as unknown[])?.length || 0;
  const [variants, setVariants] = useState<VariantSummary[]>([]);
  const [variantStats, setVariantStats] = useState<VariantStat[]>([]);

  // Fire-and-forget — overview gracefully degrades when variants are absent
  // or the request fails. The endpoint is cheap (one COUNT per variant).
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/portal/surveys/${survey.id}/variants`).then((r) => r.json()).catch(() => null),
      fetch(`/api/portal/surveys/${survey.id}/variants/stats`).then((r) => r.json()).catch(() => null),
    ]).then(([v, s]) => {
      if (cancelled) return;
      if (v?.success && Array.isArray(v.data)) setVariants(v.data as VariantSummary[]);
      if (s?.success && Array.isArray(s.data)) setVariantStats(s.data as VariantStat[]);
    });
    return () => { cancelled = true; };
  }, [survey.id]);

  const enabledTotal = variants.filter((v) => v.enabled).reduce((sum, v) => sum + v.weight, 0);
  function statFor(id: number | null): VariantStat | undefined {
    return variantStats.find((s) => s.variantId === id);
  }
  const hasVariants = variants.length > 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Responses</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{stats.completed}</p>
          <p className="text-xs text-muted-foreground">Completed</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{stats.withEmail}</p>
          <p className="text-xs text-muted-foreground">With Email</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{questionCount}</p>
          <p className="text-xs text-muted-foreground">Questions</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <button
          onClick={() => setTab('share')}
          className="bg-card border border-border rounded-xl p-4 text-left hover:border-primary/50 transition-all"
        >
          <span className="material-icons text-xl text-primary mb-2">share</span>
          <p className="font-medium text-foreground text-sm">Share Survey</p>
          <p className="text-xs text-muted-foreground">Get link, embed code, or email integration</p>
        </button>
        <button
          onClick={() => setTab('edit')}
          className="bg-card border border-border rounded-xl p-4 text-left hover:border-primary/50 transition-all"
        >
          <span className="material-icons text-xl text-primary mb-2">edit</span>
          <p className="font-medium text-foreground text-sm">Edit Questions</p>
          <p className="text-xs text-muted-foreground">Add, remove, or reorder questions</p>
        </button>
        <button
          onClick={() => setTab('responses')}
          className="bg-card border border-border rounded-xl p-4 text-left hover:border-primary/50 transition-all"
        >
          <span className="material-icons text-xl text-primary mb-2">analytics</span>
          <p className="font-medium text-foreground text-sm">View Responses</p>
          <p className="text-xs text-muted-foreground">See individual answers and analytics</p>
        </button>
      </div>

      {hasVariants && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <span className="material-icons text-lg text-primary">science</span>
              A/B Variants
            </h3>
            <button
              onClick={() => setTab('variants')}
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              Manage <span className="material-icons text-base">arrow_forward</span>
            </button>
          </div>
          <div className="space-y-2">
            {variants.map((v) => {
              const stat = statFor(v.id);
              const sharePct = v.enabled && enabledTotal > 0
                ? Math.round((v.weight / enabledTotal) * 100)
                : 0;
              const conversion = stat && stat.total > 0
                ? Math.round((stat.completed / stat.total) * 100)
                : null;
              return (
                <div key={v.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <span className={`material-icons text-base ${v.enabled ? 'text-green-600' : 'text-muted-foreground/50'}`}>
                    {v.enabled ? 'toggle_on' : 'toggle_off'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{v.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {v.enabled ? `~${sharePct}% of traffic` : 'disabled'}
                      {stat && ` • ${stat.total} response${stat.total === 1 ? '' : 's'}`}
                      {conversion !== null && survey.requireEmail && ` • ${conversion}% completed`}
                    </p>
                  </div>
                </div>
              );
            })}
            {(() => {
              const orphan = statFor(null);
              if (!orphan || orphan.total === 0) return null;
              return (
                <div className="flex items-center gap-3 py-2 border-t border-dashed border-border">
                  <span className="material-icons text-base text-muted-foreground/50">help_outline</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground">Unattributed</p>
                    <p className="text-xs text-muted-foreground">
                      {orphan.total} response{orphan.total === 1 ? '' : 's'} not tied to a variant (default fields or pre-A/B traffic)
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {responses.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <span className="material-icons text-lg text-primary">schedule</span>
            Recent Responses
          </h3>
          <div className="space-y-2">
            {responses.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                <span className="material-icons text-muted-foreground">person</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">
                    {r.respondentEmail || r.respondentName || 'Anonymous'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.source} &middot; {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {r.completedAt && <span className="material-icons text-green-500 text-sm">check_circle</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
