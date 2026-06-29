'use client';

/**
 * Playbooks list — sticky header + filter row + paged card list.
 *
 * Filters live in the URL so a page reload survives and links are shareable:
 *   ?status=draft|active|archived|all (default 'active' on first load)
 *   ?triggerKind=manual|event|scheduled|all
 *   ?category=<freeform>
 *   ?ownerId=<id>
 *   ?offset=<n>
 *
 * Page size is fixed at 25; the underlying endpoint caps at 100. We request
 * limit+1 to know whether there's a "Next" page without a count query.
 */

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import PlaybookCard from '@/components/brain/PlaybookCard';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost } from '@/components/portal/portal-ui';
import {
  PLAYBOOK_TRIGGER_KINDS,
  playbookStatusChip,
  playbookTriggerKindChip,
  type BrainPlaybookStatus,
  type BrainPlaybookTriggerKind,
  type PlaybookListRow,
} from '@/components/brain/playbooks-shared';

const PAGE_SIZE = 25;

interface TeamMember {
  userId: number;
  name: string | null;
  email: string;
}

type StatusFilter = BrainPlaybookStatus | 'all';
type TriggerFilter = BrainPlaybookTriggerKind | 'all';
const STATUS_FILTERS: StatusFilter[] = ['active', 'draft', 'archived', 'all'];

export default function PlaybooksListPage() {
  return (
    <Suspense fallback={<ListFallback />}>
      <PlaybooksListContent />
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

function PlaybooksListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const status = (searchParams.get('status') as StatusFilter | null) ?? 'active';
  const triggerKindParam =
    (searchParams.get('triggerKind') as TriggerFilter | null) ?? 'all';
  const categoryParam = searchParams.get('category') ?? '';
  const ownerIdParam = searchParams.get('ownerId');
  const offsetRaw = parseInt(searchParams.get('offset') ?? '0', 10);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

  const [items, setItems] = useState<PlaybookListRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
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

  // ─── owners (for the ownerId dropdown) ───────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    fetch('/api/portal/team')
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success && Array.isArray(json.data)) {
          setTeam(
            json.data
              .filter((m: { userId?: number }) => typeof m.userId === 'number')
              .map((m: { userId: number; name: string | null; email: string }) => ({
                userId: m.userId,
                name: m.name,
                email: m.email,
              })),
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
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
      if (triggerKindParam !== 'all') params.set('triggerKind', triggerKindParam);
      if (categoryParam) params.set('category', categoryParam);
      if (ownerIdParam) params.set('ownerId', ownerIdParam);
      params.set('limit', String(PAGE_SIZE + 1));
      params.set('offset', String(offset));
      const r = await fetch(`/api/portal/brain/playbooks?${params.toString()}`);
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to load playbooks');
        setItems([]);
        setHasMore(false);
        return;
      }
      const all = (Array.isArray(json.data?.items) ? json.data.items : []) as PlaybookListRow[];
      setHasMore(all.length > PAGE_SIZE);
      setItems(all.slice(0, PAGE_SIZE));

      // Track distinct categories seen so the dropdown can offer them.
      const seen = new Set(categories);
      for (const p of all) {
        if (p.category) seen.add(p.category);
      }
      const arr = Array.from(seen);
      arr.sort();
      if (arr.length !== categories.length) setCategories(arr);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [status, triggerKindParam, categoryParam, ownerIdParam, offset, categories]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, triggerKindParam, categoryParam, ownerIdParam, offset]);

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="sticky top-[var(--portal-header-height,3.5rem)] z-10 bg-background -mx-4 sm:mx-0 px-4 sm:px-0 pt-1 pb-3 border-b border-border">
        <PortalPageHeader
          eyebrow="Brain"
          title={<span className="flex items-center gap-2"><span className="material-icons text-primary">play_circle</span>Playbooks</span>}
          subtitle="Repeatable, multi-step processes. Onboarding, renewals, incident response — define once, run many times."
          actions={
            <div className="flex items-center gap-2">
              <Link href="/portal/brain/playbook-runs" className={pBtnGhost}>
                <span className="material-icons text-base">playlist_play</span>
                View runs
              </Link>
              <Link href="/portal/brain/playbooks/new" className={pBtnPrimary}>
                <span className="material-icons text-base">add</span>
                New playbook
              </Link>
            </div>
          }
          className="mb-3"
        />

        {/* Status pills */}
        <div className="mt-3 flex items-center gap-1 overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          {STATUS_FILTERS.map((s) => {
            const active = status === s;
            const label = s === 'all' ? 'All' : playbookStatusChip(s as BrainPlaybookStatus).label;
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

        {/* Secondary filters */}
        <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
          <div className="inline-flex items-center gap-1">
            <span className="text-muted-foreground">Trigger:</span>
            {(['all', ...PLAYBOOK_TRIGGER_KINDS] as TriggerFilter[]).map((k) => {
              const active = triggerKindParam === k;
              const label = k === 'all' ? 'All' : playbookTriggerKindChip(k).label;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setParam({ triggerKind: k })}
                  className={`px-2 py-0.5 rounded-md transition-colors ${
                    active
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <select
            value={categoryParam}
            onChange={(e) => setParam({ category: e.target.value || null })}
            className="px-2 py-1 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={ownerIdParam ?? ''}
            onChange={(e) => setParam({ ownerId: e.target.value || null })}
            className="px-2 py-1 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary"
          >
            <option value="">Any owner</option>
            {team.map((m) => (
              <option key={m.userId} value={m.userId}>{m.name || m.email}</option>
            ))}
          </select>

          {(triggerKindParam !== 'all' || categoryParam || ownerIdParam) && (
            <button
              type="button"
              onClick={() =>
                setParam({ triggerKind: 'all', category: null, ownerId: null })
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
            play_circle
          </span>
          <p className="text-foreground text-sm font-medium">No playbooks yet.</p>
          <p className="text-muted-foreground text-xs mt-1 mb-4 max-w-md mx-auto">
            Define your first repeatable process — onboarding, renewals, incident response.
          </p>
          <Link
            href="/portal/brain/playbooks/new"
            className={pBtnPrimary}
          >
            <span className="material-icons text-base">add</span>
            New playbook
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((p) => (
            <PlaybookCard key={p.id} playbook={p} ownerLookup={ownerLookup} />
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
