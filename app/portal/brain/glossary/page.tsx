'use client';

/**
 * Brain Glossary — list page.
 *
 * Filters:
 *   - status pills (All | Active | Deprecated; default Active)
 *   - category dropdown (populated from distinct categories across all terms)
 *   - owner dropdown (populated from /api/portal/mentionable-users)
 *   - search box (debounced 250ms; hits the regular list endpoint `?search=`,
 *     NOT the lookup endpoint — lookup is for ranked single-query matches).
 *
 * URL-param sync so filters survive reload and are shareable.
 *
 * Layout:
 *   - Sticky header (title + "New term" CTA + "Bulk import" CTA opening the modal).
 *   - Body grouped by category (collapsible sections, alphabetical within;
 *     uncategorized rows fall into a final "Uncategorized" group).
 *   - Pagination 25/page.
 *
 * Empty state: Material Icon `menu_book` + "No glossary terms yet…" copy.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import GlossaryTermCard, { type GlossaryTermCardData } from '@/components/brain/GlossaryTermCard';
import GlossaryBulkImportModal from '@/components/brain/GlossaryBulkImportModal';
import type { BrainGlossaryStatus } from '@/lib/db/schema';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pInput, pSelect } from '@/components/portal/portal-ui';

interface ListResponse {
  success: boolean;
  data?: {
    items: GlossaryTermCardData[];
    total: number;
    limit: number;
    offset: number;
  };
  message?: string;
}

interface UserOption {
  id: number;
  name: string | null;
}

type StatusFilter = 'all' | BrainGlossaryStatus;

const PAGE_SIZE = 25;

export default function BrainGlossaryListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL-driven filter state.
  const statusParam = (searchParams.get('status') as StatusFilter | null) ?? 'active';
  const categoryParam = searchParams.get('category') ?? '';
  const ownerParam = searchParams.get('ownerId') ?? '';
  const searchParam = searchParams.get('search') ?? '';
  const pageParam = parseInt(searchParams.get('page') ?? '1', 10) || 1;

  const [searchDraft, setSearchDraft] = useState(searchParam);
  const [items, setItems] = useState<GlossaryTermCardData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── URL param sync helpers ────────────────────────────────────────────────
  const updateParams = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    // Filter changes reset page to 1 — caller passes `page: null` explicitly if
    // they're just paginating.
    const qs = next.toString();
    router.replace(`/portal/brain/glossary${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [router, searchParams]);

  // ─── Load: categories + users (once) ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Pull a wide list (cap 100) to derive distinct categories. The set is
        // bounded — categories are short free-form labels and tenants rarely
        // exceed a few dozen.
        const r = await fetch('/api/portal/brain/glossary?limit=100');
        const json: ListResponse = await r.json();
        if (cancelled || !json.success) return;
        const cats = Array.from(new Set<string>(
          (json.data?.items ?? [])
            .map(it => it.category)
            .filter((c): c is string => !!c && c.trim().length > 0),
        )).sort();
        setCategories(cats);
      } catch {
        /* non-fatal */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/portal/mentionable-users');
        const json = await r.json();
        if (cancelled || !json.success) return;
        setUsers(json.data ?? []);
      } catch {
        /* non-fatal */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Load list whenever filters change ────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (statusParam !== 'all') qs.set('status', statusParam);
      if (categoryParam) qs.set('category', categoryParam);
      if (ownerParam) qs.set('ownerId', ownerParam);
      if (searchParam) qs.set('search', searchParam);
      qs.set('limit', String(PAGE_SIZE));
      qs.set('offset', String((pageParam - 1) * PAGE_SIZE));
      const r = await fetch(`/api/portal/brain/glossary?${qs.toString()}`);
      const json: ListResponse = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to load glossary.');
      } else {
        setItems(json.data?.items ?? []);
        setTotal(json.data?.total ?? 0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [statusParam, categoryParam, ownerParam, searchParam, pageParam]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() defers all setState into async IIFE; this trigger fires synchronously by design
  useEffect(() => { load(); }, [load]);

  // ─── Debounced search input ────────────────────────────────────────────────
  useEffect(() => {
    // Keep the input in sync if the URL is changed externally (e.g. cmd+k nav).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors URL → local input draft; both are React state and there is no external system to subscribe to
    setSearchDraft(searchParam);
  }, [searchParam]);

  const handleSearchChange = (v: string) => {
    setSearchDraft(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParams({ search: v || null, page: null });
    }, 250);
  };

  // ─── Group items by category for the rendered list ────────────────────────
  const groups = useMemo(() => {
    const map = new Map<string, GlossaryTermCardData[]>();
    for (const item of items) {
      const key = item.category?.trim() || 'Uncategorized';
      const arr = map.get(key) ?? [];
      arr.push(item);
      map.set(key, arr);
    }
    // Sort group keys: real categories alpha first, "Uncategorized" last.
    const sorted = Array.from(map.entries()).sort(([a], [b]) => {
      if (a === 'Uncategorized') return 1;
      if (b === 'Uncategorized') return -1;
      return a.localeCompare(b);
    });
    // Each group's items are already alpha-sorted by term server-side.
    return sorted;
  }, [items]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-5">
      <PortalPageHeader
        eyebrow="Brain"
        title={
          <span className="flex items-center gap-2">
            <span className="material-icons text-primary">menu_book</span>
            Glossary
          </span>
        }
        subtitle="Tenant-specific terminology. Used by Ask, AI suggestions, and inline references."
        actions={
          <>
            <button type="button" onClick={() => setBulkOpen(true)} className={pBtnGhost}>
              <span className="material-icons text-base">upload</span>
              Bulk import
            </button>
            <Link href="/portal/brain/glossary/new" className={pBtnPrimary}>
              <span className="material-icons text-base">add</span>
              New term
            </Link>
          </>
        }
      />

      {/* Filters */}
      <div className="grid sm:grid-cols-4 gap-3 items-end">
        <div className="sm:col-span-1">
          <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Status</span>
          <div className="flex items-center gap-1 bg-background border border-border rounded-md p-0.5">
            {(['active', 'deprecated', 'all'] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => updateParams({ status: s === 'active' ? null : s, page: null })}
                className={`flex-1 px-2 py-1 rounded text-xs font-medium capitalize transition-colors ${
                  statusParam === s
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="gl-cat-f" className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
            Category
          </label>
          <select
            id="gl-cat-f"
            value={categoryParam}
            onChange={e => updateParams({ category: e.target.value || null, page: null })}
            className={pSelect}
          >
            <option value="">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="gl-owner-f" className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
            Owner
          </label>
          <select
            id="gl-owner-f"
            value={ownerParam}
            onChange={e => updateParams({ ownerId: e.target.value || null, page: null })}
            className={pSelect}
          >
            <option value="">All owners</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name ?? `User #${u.id}`}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="gl-search" className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
            Search
          </label>
          <div className="relative">
            <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-base pointer-events-none">search</span>
            <input
              id="gl-search"
              type="text"
              value={searchDraft}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search term, alias, definition…"
              className={`${pInput} pl-8`}
            />
          </div>
        </div>
      </div>

      {/* Body */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          <span className="material-icons animate-spin mr-2">progress_activity</span>
          Loading…
        </div>
      )}

      {error && !loading && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-sm text-destructive">
          <div className="flex items-center gap-2 font-medium mb-1">
            <span className="material-icons text-base">error_outline</span>
            Couldn&apos;t load glossary
          </div>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && total === 0 && (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <span className="material-icons text-5xl text-primary mb-3 block">menu_book</span>
          <h2 className="text-base font-semibold text-foreground mb-1">
            {searchParam || categoryParam || ownerParam || statusParam !== 'active'
              ? 'No matching terms.'
              : 'No glossary terms yet.'}
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            {searchParam || categoryParam || ownerParam || statusParam !== 'active'
              ? 'Try clearing filters.'
              : 'Start by adding your most-confused acronym.'}
          </p>
          <Link href="/portal/brain/glossary/new" className={pBtnPrimary}>
            <span className="material-icons text-base">add</span>
            New term
          </Link>
        </div>
      )}

      {!loading && !error && total > 0 && (
        <div className="space-y-5">
          {groups.map(([cat, rows]) => {
            const isCollapsed = !!collapsed[cat];
            return (
              <section key={cat}>
                <button
                  type="button"
                  onClick={() => setCollapsed(prev => ({ ...prev, [cat]: !isCollapsed }))}
                  className="flex items-center gap-1.5 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="material-icons text-base">
                    {isCollapsed ? 'chevron_right' : 'expand_more'}
                  </span>
                  {cat}
                  <span className="text-[10px] text-muted-foreground/70 font-normal normal-case">({rows.length})</span>
                </button>
                {!isCollapsed && (
                  <div className="space-y-1.5">
                    {rows.map(row => <GlossaryTermCard key={row.id} term={row} />)}
                  </div>
                )}
              </section>
            );
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-3 border-t border-border text-xs">
              <span className="text-muted-foreground">
                Page {pageParam} of {totalPages} · {total} term{total === 1 ? '' : 's'}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={pageParam <= 1}
                  onClick={() => updateParams({ page: String(pageParam - 1) })}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="material-icons text-base">chevron_left</span>
                  Prev
                </button>
                <button
                  type="button"
                  disabled={pageParam >= totalPages}
                  onClick={() => updateParams({ page: String(pageParam + 1) })}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                  <span className="material-icons text-base">chevron_right</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <GlossaryBulkImportModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onImported={() => { load(); }}
      />
    </div>
  );
}
