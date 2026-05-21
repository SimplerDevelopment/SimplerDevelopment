'use client';

/**
 * Initiatives list page — sticky header + filter bar + paged card list.
 *
 * Filters live in the URL so a page reload (and shareable URLs) survives:
 *   ?status=active|planned|… (default 'active' on first load with no query)
 *   ?priority=low|medium|…
 *   ?ownerId=<id>
 *   ?hasOpenGoals=true
 *   ?targetDateBefore=YYYY-MM-DD
 *   ?offset=<n>
 *
 * Page size is fixed at 25; the underlying list endpoint caps at 100. We
 * always request limit+1 so we know whether to show a "Next" button without
 * a count query.
 */

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import InitiativeCard from '@/components/brain/InitiativeCard';
import {
  INITIATIVE_PRIORITIES,
  initiativeStatusChip,
  initiativePriorityChip,
  type BrainInitiativeStatus,
  type BrainInitiativePriority,
  type InitiativeRow,
} from '@/components/brain/initiatives-shared';

const PAGE_SIZE = 25;

interface TeamMember {
  userId: number;
  name: string | null;
  email: string;
}

type StatusFilter = BrainInitiativeStatus | 'all';
const STATUS_FILTERS: StatusFilter[] = ['active', 'planned', 'paused', 'completed', 'cancelled', 'all'];

export default function InitiativesListPage() {
  return (
    <Suspense fallback={<ListFallback />}>
      <InitiativesListContent />
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

function InitiativesListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const status = (searchParams.get('status') as StatusFilter | null) ?? 'active';
  const priorityParam = searchParams.get('priority') as BrainInitiativePriority | null;
  const ownerIdParam = searchParams.get('ownerId');
  const hasOpenGoalsParam = searchParams.get('hasOpenGoals') === 'true';
  const targetDateBeforeParam = searchParams.get('targetDateBefore') ?? '';
  const offsetParam = parseInt(searchParams.get('offset') ?? '0', 10);
  const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;

  const [items, setItems] = useState<InitiativeRow[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // ─── URL helpers ──────────────────────────────────────────────────────────

  const setParam = useCallback(
    (next: Record<string, string | null | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v === null || v === undefined || v === '') params.delete(k);
        else params.set(k, v);
      }
      // Any filter change resets pagination.
      if (!Object.prototype.hasOwnProperty.call(next, 'offset')) params.delete('offset');
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router, searchParams],
  );

  // ─── owners ───────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    fetch('/api/portal/team')
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success && Array.isArray(json.data)) {
          // /api/portal/team returns rows with userId, name, email.
          const members = json.data
            .filter((m: { userId?: number }) => typeof m.userId === 'number')
            .map((m: { userId: number; name: string | null; email: string }) => ({
              userId: m.userId,
              name: m.name,
              email: m.email,
            }));
          setTeam(members);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const ownerLookup = useMemo(() => {
    const m: Record<number, TeamMember> = {};
    for (const t of team) m[t.userId] = t;
    return m;
  }, [team]);

  // ─── data ─────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      if (priorityParam) params.set('priority', priorityParam);
      if (ownerIdParam) params.set('ownerId', ownerIdParam);
      if (hasOpenGoalsParam) params.set('hasOpenGoals', 'true');
      if (targetDateBeforeParam) params.set('targetDateBefore', targetDateBeforeParam);
      params.set('limit', String(PAGE_SIZE + 1));
      params.set('offset', String(offset));
      const r = await fetch(`/api/portal/brain/initiatives?${params.toString()}`);
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to load initiatives');
        setItems([]);
        setHasMore(false);
        return;
      }
      const all = (Array.isArray(json.data?.items) ? json.data.items : []) as InitiativeRow[];
      setHasMore(all.length > PAGE_SIZE);
      setItems(all.slice(0, PAGE_SIZE));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [status, priorityParam, ownerIdParam, hasOpenGoalsParam, targetDateBeforeParam, offset]);

  useEffect(() => { load(); }, [load]);

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Sticky header */}
      <div className="sticky top-[var(--portal-header-height,3.5rem)] z-10 bg-background -mx-4 sm:mx-0 px-4 sm:px-0 pt-1 pb-3 border-b border-border">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <span className="material-icons text-primary">flag</span>
              Initiatives
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Multi-quarter efforts. Bundle goals, tasks, decisions, notes, and meetings under one banner.
            </p>
          </div>
          <Link
            href="/portal/brain/initiatives/new"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <span className="material-icons text-base">add</span>
            New initiative
          </Link>
        </div>

        {/* Status pills */}
        <div className="mt-3 flex items-center gap-1 overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          {STATUS_FILTERS.map((s) => {
            const active = status === s;
            const label = s === 'all' ? 'All' : initiativeStatusChip(s as BrainInitiativeStatus).label;
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

        {/* Secondary filter row */}
        <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
          <select
            value={priorityParam ?? ''}
            onChange={(e) => setParam({ priority: e.target.value || null })}
            className="px-2 py-1 rounded-md border border-border bg-background text-foreground"
          >
            <option value="">All priorities</option>
            {INITIATIVE_PRIORITIES.map((p) => (
              <option key={p} value={p}>{initiativePriorityChip(p).label}</option>
            ))}
          </select>

          <select
            value={ownerIdParam ?? ''}
            onChange={(e) => setParam({ ownerId: e.target.value || null })}
            className="px-2 py-1 rounded-md border border-border bg-background text-foreground"
          >
            <option value="">Any owner</option>
            {team.map((m) => (
              <option key={m.userId} value={m.userId}>{m.name || m.email}</option>
            ))}
          </select>

          <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-muted-foreground">
            <input
              type="checkbox"
              checked={hasOpenGoalsParam}
              onChange={(e) => setParam({ hasOpenGoals: e.target.checked ? 'true' : null })}
              className="h-3.5 w-3.5 rounded border-border accent-primary"
            />
            Has open goals
          </label>

          <label className="inline-flex items-center gap-1.5 text-muted-foreground">
            target before
            <input
              type="date"
              value={targetDateBeforeParam}
              onChange={(e) => setParam({ targetDateBefore: e.target.value || null })}
              className="px-2 py-0.5 rounded-md border border-border bg-background text-foreground"
            />
          </label>

          {(priorityParam || ownerIdParam || hasOpenGoalsParam || targetDateBeforeParam) && (
            <button
              type="button"
              onClick={() => setParam({
                priority: null,
                ownerId: null,
                hasOpenGoals: null,
                targetDateBefore: null,
              })}
              className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 text-muted-foreground hover:text-foreground"
            >
              <span className="material-icons text-sm">close</span>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Body */}
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
          <span className="material-icons text-5xl text-muted-foreground mb-2 block">flag</span>
          <p className="text-foreground text-sm font-medium">No initiatives yet.</p>
          <p className="text-muted-foreground text-xs mt-1 mb-4">
            Kick off your first cross-functional effort.
          </p>
          <Link
            href="/portal/brain/initiatives/new"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <span className="material-icons text-base">add</span>
            New initiative
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <InitiativeCard key={it.id} initiative={it} ownerLookup={ownerLookup} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && (offset > 0 || hasMore) && (
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => setParam({ offset: String(Math.max(0, offset - PAGE_SIZE)) })}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none"
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
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none"
          >
            Next
            <span className="material-icons text-base">chevron_right</span>
          </button>
        </div>
      )}
    </div>
  );
}
