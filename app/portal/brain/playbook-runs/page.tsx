'use client';

/**
 * Playbook runs monitor.
 *
 * Filters (URL-synced):
 *   ?status=pending|active|paused|completed|aborted|failed|all (default 'active')
 *   ?playbookId=<id>
 *   ?startedAfter=YYYY-MM-DD
 *   ?startedBefore=YYYY-MM-DD
 *   ?offset=<n>
 *
 * Each row = label + playbook name + status chip + progress bar + relative
 * time. Clicking a row navigates to /playbook-runs/[id].
 */

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnGhost } from '@/components/portal/portal-ui';
import {
  playbookRunStatusChip,
  relativeTime,
  durationBetween,
  type BrainPlaybookRunStatus,
  type PlaybookListRow,
  type PlaybookRunListRow,
} from '@/components/brain/playbooks-shared';

const PAGE_SIZE = 25;

type StatusFilter = BrainPlaybookRunStatus | 'all';
const STATUS_FILTERS: StatusFilter[] = [
  'active',
  'pending',
  'paused',
  'completed',
  'aborted',
  'failed',
  'all',
];

export default function PlaybookRunsPage() {
  return (
    <Suspense fallback={<ListFallback />}>
      <PlaybookRunsContent />
    </Suspense>
  );
}

function ListFallback() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <span className="material-icons animate-spin mr-2">progress_activity</span>
      Loading…
    </div>
  );
}

function PlaybookRunsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const status = (searchParams.get('status') as StatusFilter | null) ?? 'active';
  const playbookIdParam = searchParams.get('playbookId');
  const startedAfterParam = searchParams.get('startedAfter') ?? '';
  const startedBeforeParam = searchParams.get('startedBefore') ?? '';
  const offsetRaw = parseInt(searchParams.get('offset') ?? '0', 10);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

  const [items, setItems] = useState<PlaybookRunListRow[]>([]);
  const [playbooks, setPlaybooks] = useState<PlaybookListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const setParam = useCallback(
    (next: Record<string, string | null | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v === null || v === undefined || v === '') params.delete(k);
        else params.set(k, v);
      }
      if (!Object.prototype.hasOwnProperty.call(next, 'offset')) params.delete('offset');
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router, searchParams],
  );

  // Pull a thin playbooks list for the filter dropdown.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/portal/brain/playbooks?limit=100')
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success && Array.isArray(json.data?.items)) {
          setPlaybooks(json.data.items as PlaybookListRow[]);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      if (playbookIdParam) params.set('playbookId', playbookIdParam);
      params.set('limit', String(PAGE_SIZE + 1));
      params.set('offset', String(offset));
      const r = await fetch(`/api/portal/brain/playbook-runs?${params.toString()}`);
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to load runs');
        setItems([]);
        setHasMore(false);
        return;
      }
      let all = (Array.isArray(json.data?.items) ? json.data.items : []) as PlaybookRunListRow[];

      // Apply date-range filter client-side — the endpoint doesn't accept one.
      if (startedAfterParam) {
        const t = new Date(startedAfterParam).getTime();
        if (Number.isFinite(t)) {
          all = all.filter((it) => it.startedAt && new Date(it.startedAt).getTime() >= t);
        }
      }
      if (startedBeforeParam) {
        const t = new Date(startedBeforeParam).getTime() + 86_400_000; // inclusive end-of-day
        if (Number.isFinite(t)) {
          all = all.filter((it) => it.startedAt && new Date(it.startedAt).getTime() < t);
        }
      }

      setHasMore(all.length > PAGE_SIZE);
      setItems(all.slice(0, PAGE_SIZE));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [status, playbookIdParam, startedAfterParam, startedBeforeParam, offset]);

  useEffect(() => {
    load();
  }, [load]);

  const playbookLookup = useMemo(() => {
    const m = new Map<number, PlaybookListRow>();
    for (const p of playbooks) m.set(p.id, p);
    return m;
  }, [playbooks]);

  return (
    <div className="space-y-4">
      <div className="sticky top-[var(--portal-header-height,3.5rem)] z-10 bg-background -mx-4 sm:mx-0 px-4 sm:px-0 pt-1 pb-3 border-b border-border">
        <PortalPageHeader
          eyebrow="Brain"
          title={<span className="flex items-center gap-2"><span className="material-icons text-primary">playlist_play</span>Playbook runs</span>}
          subtitle="In-flight and historical runs. Click a row to see its step-by-step state."
          actions={
            <Link
              href="/portal/brain/playbooks"
              className={pBtnGhost}
            >
              <span className="material-icons text-base">play_circle</span>
              Playbooks
            </Link>
          }
          className="mb-3"
        />

        <div className="mt-3 flex items-center gap-1 overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          {STATUS_FILTERS.map((s) => {
            const active = status === s;
            const label = s === 'all' ? 'All' : playbookRunStatusChip(s).label;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setParam({ status: s })}
                className={`shrink-0 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
          <select
            value={playbookIdParam ?? ''}
            onChange={(e) => setParam({ playbookId: e.target.value || null })}
            className="px-2 py-1 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary"
          >
            <option value="">Any playbook</option>
            {playbooks.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <label className="inline-flex items-center gap-1.5 text-muted-foreground">
            started after
            <input
              type="date"
              value={startedAfterParam}
              onChange={(e) => setParam({ startedAfter: e.target.value || null })}
              className="px-2 py-0.5 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary"
            />
          </label>

          <label className="inline-flex items-center gap-1.5 text-muted-foreground">
            before
            <input
              type="date"
              value={startedBeforeParam}
              onChange={(e) => setParam({ startedBefore: e.target.value || null })}
              className="px-2 py-0.5 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary"
            />
          </label>

          {(playbookIdParam || startedAfterParam || startedBeforeParam) && (
            <button
              type="button"
              onClick={() =>
                setParam({
                  playbookId: null,
                  startedAfter: null,
                  startedBefore: null,
                })
              }
              className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 text-muted-foreground hover:text-foreground"
            >
              <span className="material-icons text-sm">close</span>
              Clear
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive flex items-center gap-2">
          <span className="material-icons text-base">error_outline</span>
          {error}
        </div>
      )}

      {loading ? (
        <ListFallback />
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-xl">
          <span className="material-icons text-5xl text-muted-foreground mb-2 block">
            playlist_play
          </span>
          <p className="text-foreground text-sm font-medium">No runs match these filters.</p>
          <p className="text-muted-foreground text-xs mt-1 max-w-md mx-auto">
            Start a run from any active playbook to see it appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((run) => (
            <RunRow key={run.id} run={run} playbook={playbookLookup.get(run.playbookId)} />
          ))}
        </div>
      )}

      {!loading && (offset > 0 || hasMore) && (
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => setParam({ offset: String(Math.max(0, offset - PAGE_SIZE)) })}
            className={`${pBtnGhost} disabled:opacity-30 disabled:pointer-events-none`}
          >
            <span className="material-icons text-base">chevron_left</span>
            Previous
          </button>
          <span className="text-xs text-muted-foreground">
            {offset + 1}–{offset + items.length}
          </span>
          <button
            type="button"
            disabled={!hasMore}
            onClick={() => setParam({ offset: String(offset + PAGE_SIZE) })}
            className={`${pBtnGhost} disabled:opacity-30 disabled:pointer-events-none`}
          >
            Next
            <span className="material-icons text-base">chevron_right</span>
          </button>
        </div>
      )}
    </div>
  );
}

function RunRow({
  run,
  playbook,
}: {
  run: PlaybookRunListRow;
  playbook: PlaybookListRow | undefined;
}) {
  const status = playbookRunStatusChip(run.status);
  const { completed, total } = run.stepProgress;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const duration =
    run.completedAt && run.startedAt ? durationBetween(run.startedAt, run.completedAt) : null;

  return (
    <Link
      href={`/portal/brain/playbook-runs/${run.id}`}
      className="block text-left w-full bg-card border border-border rounded-xl p-4 hover:border-primary/50 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-foreground truncate">
              {run.label}
            </h3>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${status.className}`}
            >
              <span className="material-icons text-[14px]">{status.icon}</span>
              {status.label}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="material-icons text-base">play_circle</span>
              {playbook?.name ?? run.playbookName}
            </span>
            {run.startedAt && (
              <span className="inline-flex items-center gap-1">
                <span className="material-icons text-base">schedule</span>
                started {relativeTime(run.startedAt, { signed: true })}
              </span>
            )}
            {duration && (
              <span className="inline-flex items-center gap-1">
                <span className="material-icons text-base">timer</span>
                ran for {duration}
              </span>
            )}
          </div>
        </div>
      </div>

      {total > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
            <span>
              {completed} / {total} step{total === 1 ? '' : 's'}
            </span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                run.status === 'failed'
                  ? 'bg-red-500'
                  : run.status === 'aborted'
                    ? 'bg-zinc-400'
                    : 'bg-emerald-500'
              }`}
              style={{ width: `${pct}%` }}
              aria-hidden
            />
          </div>
        </div>
      )}
    </Link>
  );
}
