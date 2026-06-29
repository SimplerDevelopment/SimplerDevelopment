'use client';

/**
 * Brain People — list view.
 *
 * Layout:
 *   ┌───── sticky header (h1 + "New person" CTA) ─────┐
 *   ├ status pills (All | Active | Inactive | Departed)
 *   ├ org-unit dropdown   expertise chips   search box
 *   ├ ───────────────────────────────────────────────
 *   ├ PersonCard list (25/page, paginated)
 *   └ ───── pagination ─────
 *
 * URL params: status, orgUnitId, expertiseTagId, q, page. We sync them via
 * `router.replace` (no scroll, no history pollution).
 *
 * Default status is `active` — operators almost always want the working
 * roster, not departed alumni.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PersonCard, type PersonCardData } from '@/components/brain/PersonCard';
import type { BrainPersonStatus } from '@/lib/db/schema/brain';
import type { BrainOrgUnitTreeNode } from '@/lib/brain/org-units';
import PortalPageHeader from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost } from '@/components/portal/portal-ui';

type StatusFilter = 'all' | BrainPersonStatus;

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'active',   label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'departed', label: 'Departed' },
  { key: 'all',      label: 'All' },
];

const PAGE_SIZE = 25;

interface TagOption {
  id: number;
  name: string;
}

interface OrgUnitFlat {
  id: number;
  name: string;
  depth: number;
}

function flattenTree(nodes: BrainOrgUnitTreeNode[], depth = 0, out: OrgUnitFlat[] = []): OrgUnitFlat[] {
  for (const n of nodes) {
    out.push({ id: n.id, name: n.name, depth });
    if (n.children?.length) flattenTree(n.children, depth + 1, out);
  }
  return out;
}

export default function BrainPeoplePage() {
  const router = useRouter();
  const params = useSearchParams();

  const statusParam = params.get('status') as StatusFilter | null;
  const status: StatusFilter = statusParam && STATUS_TABS.some((t) => t.key === statusParam)
    ? statusParam
    : 'active';

  const orgUnitIdParam = params.get('orgUnitId');
  const orgUnitId = orgUnitIdParam ? parseInt(orgUnitIdParam, 10) : null;

  const expertiseTagIdParam = params.get('expertiseTagId');
  const expertiseTagId = expertiseTagIdParam ? parseInt(expertiseTagIdParam, 10) : null;

  const searchParam = params.get('q') ?? '';
  const pageParam = params.get('page');
  const page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1;

  const [searchInput, setSearchInput] = useState(searchParam);
  const [rows, setRows] = useState<PersonCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgUnits, setOrgUnits] = useState<OrgUnitFlat[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);

  // Sync `?q=` from input with a small debounce so each keystroke doesn't
  // shove a history entry.
  useEffect(() => {
    if (searchInput === searchParam) return;
    const handle = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (searchInput.trim()) next.set('q', searchInput.trim());
      else next.delete('q');
      next.delete('page');
      router.replace(`/portal/brain/people${next.toString() ? `?${next.toString()}` : ''}`, { scroll: false });
    }, 250);
    return () => clearTimeout(handle);
  }, [searchInput, searchParam, params, router]);

  // Load org-unit tree + expertise tags once (for the filter UI).
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/portal/brain/org-units?as=tree');
        const json = await r.json();
        if (r.ok && json.success) {
          setOrgUnits(flattenTree((json.data?.tree ?? []) as BrainOrgUnitTreeNode[]));
        }
      } catch {
        // non-fatal — filter just stays unpopulated
      }
    })();
    (async () => {
      try {
        const r = await fetch('/api/portal/brain/expertise-tags?limit=200');
        const json = await r.json();
        if (r.ok && json.success) {
          setTags((json.data?.items ?? []) as TagOption[]);
        }
      } catch {
        // non-fatal
      }
    })();
  }, []);

  // Load the page of people whenever a filter changes. All setState calls
  // live inside the async IIFE so the effect body never mutates state
  // synchronously (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }
      try {
        const url = new URL('/api/portal/brain/people', window.location.origin);
        if (status !== 'all') url.searchParams.set('status', status);
        if (orgUnitId !== null) url.searchParams.set('orgUnitId', String(orgUnitId));
        if (expertiseTagId !== null) url.searchParams.set('expertiseTagId', String(expertiseTagId));
        if (searchParam.trim()) url.searchParams.set('search', searchParam.trim());
        // Pull one extra row so we can detect "is there a next page?".
        url.searchParams.set('limit', String(PAGE_SIZE + 1));
        url.searchParams.set('offset', String((page - 1) * PAGE_SIZE));
        const r = await fetch(url.toString());
        const json = await r.json();
        if (cancelled) return;
        if (!r.ok || !json.success) {
          setError(json.message || 'Failed to load people.');
          setRows([]);
          return;
        }
        setRows((json.data?.items ?? []) as PersonCardData[]);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Network error');
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [status, orgUnitId, expertiseTagId, searchParam, page]);

  const hasNextPage = rows.length > PAGE_SIZE;
  const visibleRows = useMemo(() => rows.slice(0, PAGE_SIZE), [rows]);

  const setParam = useCallback((updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    // Any filter change resets pagination.
    if (!('page' in updates)) next.delete('page');
    router.replace(`/portal/brain/people${next.toString() ? `?${next.toString()}` : ''}`, { scroll: false });
  }, [params, router]);

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-4">
      <div className="sticky top-0 z-10 -mx-4 px-4 pb-3 pt-2 bg-background/95 backdrop-blur border-b border-border">
        <PortalPageHeader
          eyebrow="Company Brain"
          title={<span className="flex items-center gap-2"><span className="material-icons text-primary">groups</span>People</span>}
          subtitle="Your internal team — employees, advisors, and contractors. Distinct from CRM contacts."
          actions={
            <Link href="/portal/brain/people/new" className={pBtnPrimary}>
              <span className="material-icons text-base">person_add</span>
              New person
            </Link>
          }
          className="mb-0 pb-3"
        />

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-md border border-border overflow-hidden text-sm">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setParam({ status: t.key === 'active' ? null : t.key })}
                className={`px-3 py-1.5 transition-colors ${
                  status === t.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <select
            value={orgUnitId !== null ? String(orgUnitId) : ''}
            onChange={(e) => setParam({ orgUnitId: e.target.value || null })}
            className="appearance-none rounded-xl border border-border bg-card px-3.5 py-2 pr-10 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
          >
            <option value="">All org units</option>
            {orgUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {' '.repeat(u.depth)}{u.name}
              </option>
            ))}
          </select>

          <div className="flex-1 min-w-[200px] relative">
            <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-base text-muted-foreground pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, email, or title"
              className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-border bg-card text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
            />
          </div>
        </div>

        {tags.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-muted-foreground mr-1">Expertise:</span>
            <button
              type="button"
              onClick={() => setParam({ expertiseTagId: null })}
              className={`text-[11px] px-2 py-0.5 rounded-full border ${
                expertiseTagId === null
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              All
            </button>
            {tags.slice(0, 24).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setParam({ expertiseTagId: expertiseTagId === t.id ? null : String(t.id) })}
                className={`text-[11px] px-2 py-0.5 rounded-full border ${
                  expertiseTagId === t.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            <span className="material-icons animate-spin mr-2">progress_activity</span>
            Loading…
          </div>
        ) : error ? (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-sm text-destructive">
            <div className="flex items-center gap-2 font-medium mb-1">
              <span className="material-icons text-base">error_outline</span>
              Couldn&apos;t load people
            </div>
            <p>{error}</p>
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="text-center py-12 bg-card border border-dashed border-border rounded-lg">
            <span className="material-icons text-5xl text-muted-foreground mb-2 block">person_add</span>
            <p className="text-sm text-foreground font-medium">No people on file yet.</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Add the first member of your team.
            </p>
            <Link
              href="/portal/brain/people/new"
              className={pBtnPrimary}
            >
              <span className="material-icons text-base">person_add</span>
              Add person
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleRows.map((p) => (
              <PersonCard key={p.id} person={p} />
            ))}
          </div>
        )}

        {(page > 1 || hasNextPage) && (
          <div className="flex items-center justify-between mt-6">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setParam({ page: page > 2 ? String(page - 1) : null })}
              className={pBtnGhost + " disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"}
            >
              <span className="material-icons text-base">chevron_left</span>
              Prev
            </button>
            <span className="text-xs text-muted-foreground">Page {page}</span>
            <button
              type="button"
              disabled={!hasNextPage}
              onClick={() => setParam({ page: String(page + 1) })}
              className={pBtnGhost + " disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"}
            >
              Next
              <span className="material-icons text-base">chevron_right</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
