'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback, useMemo } from 'react';

interface RelationshipListRow {
  overlay: {
    id: number;
    relationshipType: string;
    status: 'active' | 'paused' | 'archived';
    priority: 'low' | 'medium' | 'high' | 'critical';
    summary: string | null;
    nextReviewAt: string | null;
    lastTouchAt: string | null;
    staleAfterDays: number | null;
    serviceLines: string[];
  };
  underlying: { type: 'company' | 'deal'; id: number; name: string; secondaryName?: string };
  openTaskCount: number;
  isStale: boolean;
}

const PRIORITY_TONE: Record<RelationshipListRow['overlay']['priority'], string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  high: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  critical: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

type Mode = 'stale' | 'prospects' | 'all';

export default function BrainProspectsPage() {
  const [rows, setRows] = useState<RelationshipListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('stale');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (mode === 'stale') params.set('stale', 'true');
      if (mode === 'prospects') params.set('type', 'prospect');
      const r = await fetch(`/api/portal/brain/relationships?${params.toString()}`);
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to load.');
      } else {
        setRows(json.data);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      // Stale ones first; then oldest lastTouchAt; then priority desc.
      if (a.isStale !== b.isStale) return a.isStale ? -1 : 1;
      const aTouch = a.overlay.lastTouchAt ? new Date(a.overlay.lastTouchAt).getTime() : 0;
      const bTouch = b.overlay.lastTouchAt ? new Date(b.overlay.lastTouchAt).getTime() : 0;
      if (aTouch !== bTouch) return aTouch - bTouch;
      const priRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
      return (priRank[b.overlay.priority] ?? 0) - (priRank[a.overlay.priority] ?? 0);
    });
  }, [rows]);

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <span className="material-icons text-primary">schedule</span>
            Prospects &amp; stale relationships
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Relationships overdue for follow-up — based on each one&apos;s configured stale-after threshold.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex gap-1 border-b border-border">
        {(['stale', 'prospects', 'all'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              mode === m
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {m === 'stale' ? 'Stale only' : m === 'prospects' ? 'Prospects' : 'All relationships'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <span className="material-icons animate-spin mr-2">progress_activity</span>
          Loading…
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-lg">
          <span className="material-icons text-4xl text-muted-foreground mb-2 block">
            {mode === 'stale' ? 'check_circle' : 'schedule'}
          </span>
          <p className="text-sm text-foreground font-medium">
            {mode === 'stale' ? 'No stale relationships.' : 'No relationships in this view.'}
          </p>
          {mode === 'stale' && (
            <p className="text-muted-foreground text-xs mt-1">
              Set a stale-after threshold on any relationship to start tracking neglect.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg divide-y divide-border">
          {sorted.map((row) => {
            const lastTouch = row.overlay.lastTouchAt ? new Date(row.overlay.lastTouchAt) : null;
            const days = lastTouch ? Math.floor((Date.now() - lastTouch.getTime()) / 86400000) : null;
            return (
              <Link
                key={row.overlay.id}
                href={`/portal/brain/relationships/${row.overlay.id}`}
                className="flex items-start gap-3 p-4 hover:bg-accent/50 transition-colors"
              >
                <span className="material-icons text-muted-foreground mt-0.5">
                  {row.underlying.type === 'company' ? 'business' : 'handshake'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-foreground truncate">{row.underlying.name}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PRIORITY_TONE[row.overlay.priority]}`}>
                      {row.overlay.priority}
                    </span>
                    {row.isStale && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        stale
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                    <span>{row.overlay.relationshipType.replace(/_/g, ' ')}</span>
                    {row.underlying.secondaryName && <><span>·</span><span>{row.underlying.secondaryName}</span></>}
                    {lastTouch && (
                      <>
                        <span>·</span>
                        <span>last touched {lastTouch.toLocaleDateString()} ({days}d ago)</span>
                      </>
                    )}
                    {row.overlay.staleAfterDays && (
                      <>
                        <span>·</span>
                        <span>stale after {row.overlay.staleAfterDays}d</span>
                      </>
                    )}
                    {row.openTaskCount > 0 && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-0.5">
                          <span className="material-icons text-sm">checklist</span>
                          {row.openTaskCount} open
                        </span>
                      </>
                    )}
                  </div>
                  {row.overlay.summary && (
                    <p className="text-xs text-foreground mt-1 line-clamp-2">{row.overlay.summary}</p>
                  )}
                </div>
                <span className="material-icons text-muted-foreground self-center">chevron_right</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
