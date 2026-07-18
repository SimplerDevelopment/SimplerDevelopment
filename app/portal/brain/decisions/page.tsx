'use client';

/**
 * Decisions — list view.
 *
 * Lists brain_decisions for the active tenant with filterable status pills,
 * a reversibility chip, an owner dropdown, a decided-at date range, and a
 * "superseded only" toggle. Rows render via <DecisionCard>. Pagination is
 * 25/page with prev/next at the bottom.
 *
 * Filters live in the URL query string (?status=&reversibility=&
 * decisionMakerId=&dateFrom=&dateTo=&supersededOnly=&topicId=&page=) so
 * the view is shareable + survives refresh. Status defaults to `accepted`
 * to keep the noise down; switching to "All" or other statuses is one
 * click away.
 */
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import DecisionCard, { type DecisionRow } from '@/components/brain/DecisionCard';
import type { BrainDecisionReversibility, BrainDecisionStatus } from '@/lib/db/schema';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost } from '@/components/portal/portal-ui';

interface ListResponse {
  success: boolean;
  data?: { items: DecisionRow[]; limit: number; offset: number };
  message?: string;
}

interface TeamMember {
  userId: number;
  name: string | null;
  email: string;
}

type StatusFilter = 'all' | BrainDecisionStatus;
type ReversibilityFilter = 'all' | BrainDecisionReversibility;

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string; icon: string }> = [
  { key: 'all', label: 'All', icon: 'inbox' },
  { key: 'accepted', label: 'Accepted', icon: 'check_circle' },
  { key: 'proposed', label: 'Proposed', icon: 'pending' },
  { key: 'superseded', label: 'Superseded', icon: 'history' },
  { key: 'rejected', label: 'Rejected', icon: 'cancel' },
];

const PAGE_SIZE = 25;

// Allowed parse domains — we only honour values that pass these guards, so a
// crafted URL can't sneak an invalid status into the API call.
const STATUS_KEYS: StatusFilter[] = ['all', 'accepted', 'proposed', 'superseded', 'rejected'];
const REVERSIBILITY_KEYS: ReversibilityFilter[] = ['all', 'one_way', 'two_way'];

function parseStatus(raw: string | null): StatusFilter {
  return raw && (STATUS_KEYS as string[]).includes(raw) ? (raw as StatusFilter) : 'accepted';
}
function parseReversibility(raw: string | null): ReversibilityFilter {
  return raw && (REVERSIBILITY_KEYS as string[]).includes(raw) ? (raw as ReversibilityFilter) : 'all';
}
function parsePositiveInt(raw: string | null): number | null {
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function parsePageIndex(raw: string | null): number {
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default function DecisionsListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<DecisionRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters are derived from the URL on every render — the URL is the single
  // source of truth. Handlers push a new querystring via `router.replace`,
  // which re-renders this component with the new searchParams; we never store
  // filter state in component state.
  const status: StatusFilter = parseStatus(searchParams.get('status'));
  const reversibility: ReversibilityFilter = parseReversibility(searchParams.get('reversibility'));
  const decisionMakerId: number | null = parsePositiveInt(searchParams.get('decisionMakerId'));
  const dateFrom: string = searchParams.get('dateFrom') ?? '';
  const dateTo: string = searchParams.get('dateTo') ?? '';
  const supersededOnly: boolean = searchParams.get('supersededOnly') === 'true';
  const topicId: number | null = parsePositiveInt(searchParams.get('topicId'));
  const page: number = parsePageIndex(searchParams.get('page'));

  const [team, setTeam] = useState<TeamMember[]>([]);

  // Helper: replace a subset of search params and push as the new URL. Any
  // explicit `undefined` value clears that key. When a non-page filter
  // changes, we also reset `page` to 0 — refreshing or sharing a deep URL
  // preserves both filter + page if the caller writes both explicitly.
  const updateUrl = useCallback(
    (patch: Record<string, string | number | null | undefined>, opts?: { resetPage?: boolean }) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === '') next.delete(k);
        else next.set(k, String(v));
      }
      if (opts?.resetPage) next.delete('page');
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : '?');
    },
    [router, searchParams],
  );

  // Load team for the decision-maker filter.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/portal/team')
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        if (res?.success && Array.isArray(res.data)) {
          const rows: TeamMember[] = res.data
            .map((m: { userId?: number; name?: string | null; email?: string }) => ({
              userId: typeof m.userId === 'number' ? m.userId : 0,
              name: m.name ?? null,
              email: m.email ?? '',
            }))
            .filter((m: TeamMember) => m.userId > 0);
          setTeam(rows);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (status !== 'all') params.set('status', status);
    if (reversibility !== 'all') params.set('reversibility', reversibility);
    if (decisionMakerId !== null) params.set('decisionMakerId', String(decisionMakerId));
    if (dateFrom) params.set('dateFrom', new Date(dateFrom).toISOString());
    if (dateTo) {
      // Include the whole `dateTo` day by setting the time to end-of-day UTC.
      const d = new Date(dateTo);
      d.setUTCHours(23, 59, 59, 999);
      params.set('dateTo', d.toISOString());
    }
    if (supersededOnly) params.set('supersededOnly', 'true');
    if (topicId !== null) params.set('topicId', String(topicId));
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(page * PAGE_SIZE));
    return params.toString();
  }, [status, reversibility, decisionMakerId, dateFrom, dateTo, supersededOnly, topicId, page]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/portal/brain/decisions?${queryString}`);
      const json: ListResponse = await r.json();
      if (!r.ok || !json.success || !json.data) {
        setError(json.message || `HTTP ${r.status}`);
        setItems([]);
      } else {
        setItems(json.data.items);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-fetch pattern; setLoading/setItems run inside load(), gated by the queryString-keyed useCallback so this only fires when filters/page change.
  useEffect(() => { load(); }, [load]);

  const teamLookup = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of team) map.set(m.userId, m.name || m.email);
    return map;
  }, [team]);

  const isFirstPage = page === 0;
  const isLastPage = (items?.length ?? 0) < PAGE_SIZE;

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 -mx-4 px-4 bg-background/95 backdrop-blur border-b border-border">
        <PortalPageHeader
          eyebrow="Brain"
          title={<span className="flex items-center gap-2"><span className="material-icons text-primary">gavel</span>Decisions</span>}
          subtitle="The rationale-bearing log of what your team has decided, why, and when."
          actions={
            <Link href="/portal/brain/decisions/new" className={pBtnPrimary}>
              <span className="material-icons text-base">add</span>
              Record decision
            </Link>
          }
          className="mb-0"
        />
      </div>

      {/* Filters */}
      <div className="space-y-3">
        {/* Status pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => updateUrl({ status: s.key === 'accepted' ? null : s.key }, { resetPage: true })}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                status === s.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/30 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
              }`}
            >
              <span className="material-icons text-[14px] leading-none">{s.icon}</span>
              {s.label}
            </button>
          ))}
        </div>

        {/* Secondary filter row */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card p-0.5">
            {(['all', 'one_way', 'two_way'] as ReversibilityFilter[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => updateUrl({ reversibility: r === 'all' ? null : r }, { resetPage: true })}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  reversibility === r
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {r === 'all' ? 'All' : r === 'one_way' ? 'One-way' : 'Two-way'}
              </button>
            ))}
          </div>

          <select
            value={decisionMakerId ?? ''}
            onChange={(e) =>
              updateUrl({ decisionMakerId: e.target.value ? parseInt(e.target.value, 10) : null }, { resetPage: true })
            }
            className="px-2 py-1.5 text-xs bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary"
          >
            <option value="">All decision makers</option>
            {team.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name || m.email}
              </option>
            ))}
          </select>

          <label className="inline-flex items-center gap-1 text-xs">
            <span className="text-muted-foreground">From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => updateUrl({ dateFrom: e.target.value || null }, { resetPage: true })}
              className="px-2 py-1 text-xs bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary"
            />
          </label>
          <label className="inline-flex items-center gap-1 text-xs">
            <span className="text-muted-foreground">To</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => updateUrl({ dateTo: e.target.value || null }, { resetPage: true })}
              className="px-2 py-1 text-xs bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary"
            />
          </label>

          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={supersededOnly}
              onChange={(e) => updateUrl({ supersededOnly: e.target.checked ? 'true' : null }, { resetPage: true })}
              className="rounded border-border"
            />
            Superseded only
          </label>

          {(dateFrom || dateTo || decisionMakerId || supersededOnly || reversibility !== 'all' || topicId !== null) && (
            <button
              type="button"
              onClick={() =>
                updateUrl(
                  {
                    reversibility: null,
                    decisionMakerId: null,
                    dateFrom: null,
                    dateTo: null,
                    supersededOnly: null,
                    topicId: null,
                  },
                  { resetPage: true },
                )
              }
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <span className="material-icons text-[14px]">clear</span>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {loading && items === null ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          <span className="material-icons animate-spin mr-2">progress_activity</span>
          Loading decisions…
        </div>
      ) : error ? (
        <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 text-sm text-destructive">
          <div className="flex items-center gap-2 font-medium mb-1">
            <span className="material-icons text-base">error_outline</span>
            Couldn&apos;t load decisions
          </div>
          <p>{error}</p>
        </div>
      ) : items && items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-2">
          {items?.map((d) => (
            <div key={d.id} className="relative">
              <DecisionCard
                decision={d}
                onClick={() => router.push(`/portal/brain/decisions/${d.id}`)}
              />
              {d.decisionMakerId && teamLookup.has(d.decisionMakerId) && (
                <div className="absolute top-3 right-12 text-[10px] text-muted-foreground pointer-events-none hidden sm:flex items-center gap-1">
                  <span className="material-icons text-[12px] leading-none">person</span>
                  {teamLookup.get(d.decisionMakerId)}
                </div>
              )}
            </div>
          ))}

          {/* Pagination */}
          <div className="flex items-center justify-between pt-4 text-sm">
            <button
              type="button"
              disabled={isFirstPage}
              onClick={() => updateUrl({ page: page > 1 ? page - 1 : null })}
              className={`${pBtnGhost} disabled:opacity-30 disabled:hover:shadow-none disabled:hover:border-border`}
            >
              <span className="material-icons text-base">chevron_left</span>
              Previous
            </button>
            <span className="text-xs text-muted-foreground">Page {page + 1}</span>
            <button
              type="button"
              disabled={isLastPage}
              onClick={() => updateUrl({ page: page + 1 })}
              className={`${pBtnGhost} disabled:opacity-30 disabled:hover:shadow-none disabled:hover:border-border`}
            >
              Next
              <span className="material-icons text-base">chevron_right</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-card border border-border rounded-2xl p-10 text-center">
      <span className="material-icons text-5xl text-primary mb-3 block">psychology_alt</span>
      <h2 className="text-base font-semibold text-foreground mb-1">No decisions captured yet</h2>
      <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5">
        Record your first decision to start building your team&apos;s decision log. Capture the context,
        what was decided, why, and what alternatives you considered.
      </p>
      <Link
        href="/portal/brain/decisions/new"
        className={pBtnPrimary}
      >
        <span className="material-icons text-base">add</span>
        Record decision
      </Link>
    </div>
  );
}
