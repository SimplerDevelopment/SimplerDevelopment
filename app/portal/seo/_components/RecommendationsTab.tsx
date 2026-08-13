'use client';

// Recommendations tab ("Do next") — the AI-generated prioritized fix list.
// Cached at the shell level like the Search tab (`data`/`onDataChange`): see
// SearchPerformanceTab.tsx's header comment for why this data source is
// lazy-fetched once rather than refetched on every tab switch. Generation
// (POST) is a real metered AI call, so re-opening this tab after the first
// load should never silently trigger another one.

import { useCallback, useEffect, useState } from 'react';
import { pBtnGhost, pBtnPrimary, pCard } from '@/components/portal/portal-ui';
import { RecommendationCard } from './RecommendationCard';
import type { Recommendation, RecommendationStatus } from './types';

interface Props {
  projectId: number;
  data: Recommendation[] | null;
  onDataChange: (data: Recommendation[]) => void;
}

export function RecommendationsTab({ projectId, data, onDataChange }: Props) {
  const [error, setError] = useState('');
  const [genError, setGenError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);
  const [resolvedOpen, setResolvedOpen] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});

  const fetchData = useCallback(async () => {
    setError('');
    try {
      const res = await fetch(`/api/portal/seo/projects/${projectId}/recommendations`);
      const json = await res.json();
      if (!json.success) {
        setError(json.message || 'Failed to load recommendations.');
        return;
      }
      onDataChange(json.data);
    } catch {
      setError('Network error loading recommendations.');
    }
  }, [projectId, onDataChange]);

  // Lazy-fetch: only the first tab open (data still null) triggers a
  // request — same pattern as SearchPerformanceTab.
  useEffect(() => {
    if (data === null) fetchData();
  }, [data, fetchData]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setGenError('');
    try {
      const res = await fetch(`/api/portal/seo/projects/${projectId}/recommendations`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setGenError(json.message || 'Failed to generate recommendations.');
        return;
      }
      // The POST response is only the freshly generated open items (the
      // route deletes+reinserts open rows); refetch so kept done/dismissed
      // rows come back into view too.
      await fetchData();
      setConfirmingRegenerate(false);
    } catch {
      setGenError('Network error generating recommendations.');
    } finally {
      setGenerating(false);
    }
  }, [projectId, fetchData]);

  const updateStatus = useCallback(
    async (id: number, status: RecommendationStatus) => {
      if (!data) return;
      const prev = data;
      setRowErrors((e) => ({ ...e, [id]: '' }));
      setPendingId(id);
      onDataChange(prev.map((r) => (r.id === id ? { ...r, status } : r)));
      try {
        const res = await fetch(`/api/portal/seo/recommendations/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          onDataChange(prev);
          setRowErrors((e) => ({ ...e, [id]: json.message || 'Failed to update.' }));
          return;
        }
        onDataChange(prev.map((r) => (r.id === id ? (json.data as Recommendation) : r)));
      } catch {
        onDataChange(prev);
        setRowErrors((e) => ({ ...e, [id]: 'Network error updating.' }));
      } finally {
        setPendingId(null);
      }
    },
    [data, onDataChange],
  );

  if (data === null) {
    if (error) return <p className="text-sm text-destructive">{error}</p>;
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <span className="material-icons animate-spin text-2xl">progress_activity</span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={`${pCard} p-10 text-center max-w-xl mx-auto space-y-4`}>
        <div>
          <span className="material-icons text-4xl text-muted-foreground/50 mb-2">checklist</span>
          <p className="text-sm font-semibold text-foreground mb-1">
            Turn your audit + Search data into a prioritized fix list
          </p>
          <p className="text-sm text-muted-foreground">
            AI reads your latest crawl and Search Console history and ranks the changes most likely to move
            organic traffic — by impact, effort, and confidence.
          </p>
        </div>
        <button type="button" onClick={generate} disabled={generating} className={`${pBtnPrimary} mx-auto`}>
          {generating ? (
            <>
              <span className="material-icons text-base animate-spin">progress_activity</span>
              Generating…
            </>
          ) : (
            <>
              <span className="material-icons text-base">auto_awesome</span>
              Generate recommendations
            </>
          )}
        </button>
        <p className="text-xs text-muted-foreground/70">Uses AI credits — a real metered generation, usually a few seconds.</p>
        {genError && <p className="text-xs text-destructive">{genError}</p>}
      </div>
    );
  }

  const open = data.filter((r) => r.status === 'open');
  const resolved = data.filter((r) => r.status !== 'open');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {open.length} open {open.length === 1 ? 'recommendation' : 'recommendations'}
        </p>
        <div className="flex items-center gap-2">
          {confirmingRegenerate ? (
            <>
              <span className="text-xs text-muted-foreground">
                Replaces your current open recommendations — done/dismissed are kept.
              </span>
              <button type="button" onClick={generate} disabled={generating} className={pBtnPrimary}>
                {generating ? (
                  <>
                    <span className="material-icons text-base animate-spin">progress_activity</span>
                    Generating…
                  </>
                ) : (
                  'Confirm'
                )}
              </button>
              <button type="button" onClick={() => setConfirmingRegenerate(false)} disabled={generating} className={pBtnGhost}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmingRegenerate(true)} className={pBtnGhost}>
              <span className="material-icons text-base">refresh</span>
              Regenerate
            </button>
          )}
        </div>
      </div>
      {genError && <p className="text-xs text-destructive">{genError}</p>}

      {open.length === 0 ? (
        <div className={`${pCard} p-10 text-center`}>
          <span className="material-icons text-4xl text-green-500 mb-2">check_circle</span>
          <p className="text-sm text-muted-foreground">No open recommendations — you&apos;re caught up.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {open.map((rec) => (
            <RecommendationCard
              key={rec.id}
              rec={rec}
              busy={pendingId === rec.id}
              error={rowErrors[rec.id]}
              onMarkDone={() => updateStatus(rec.id, 'done')}
              onDismiss={() => updateStatus(rec.id, 'dismissed')}
            />
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <div className={pCard}>
          <button
            type="button"
            onClick={() => setResolvedOpen((v) => !v)}
            className="w-full flex items-center gap-3 p-4 text-left hover:bg-accent/50 transition-colors rounded-2xl"
            aria-expanded={resolvedOpen}
          >
            <span className="material-icons text-muted-foreground text-lg shrink-0">inventory_2</span>
            <span className="flex-1 min-w-0 font-medium text-sm text-foreground">Done &amp; dismissed</span>
            <span className="text-xs text-muted-foreground shrink-0">{resolved.length}</span>
            <span className="material-icons text-muted-foreground shrink-0">{resolvedOpen ? 'expand_less' : 'expand_more'}</span>
          </button>
          {resolvedOpen && (
            <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
              {resolved.map((rec) => (
                <RecommendationCard key={rec.id} rec={rec} readOnly />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
