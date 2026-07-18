'use client';

/**
 * Brain Documents — library list page.
 *
 * Filters:
 *   - status pills (All | Draft | Published | Archived; default Published)
 *   - category dropdown (sop | policy | guide | reference | announcement | other)
 *   - owner dropdown (populated from /api/portal/mentionable-users)
 *   - search box (debounced 300ms, hits `?search=`)
 *
 * URL-param sync via useSearchParams + router.replace so filters survive
 * reload and are shareable. Pagination 25/page (offset/limit — the list
 * endpoint doesn't return a total, so we infer hasNext from `items.length`).
 *
 * Layout: sticky header (title + "New document" CTA + "My reading queue"
 * link). Body grouped by category, alphabetical inside each group.
 *
 * Empty state: Material Icon `description` + the doc-onboarding CTA pair
 * (write new vs promote from note).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import DocumentCard, { type DocumentCardData } from '@/components/brain/DocumentCard';
import type {
  BrainDocumentStatus,
  BrainDocumentCategory,
  DocumentListRow,
} from '@/lib/brain/documents';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pInput, pSelect } from '@/components/portal/portal-ui';

type StatusFilter = 'all' | BrainDocumentStatus;

const CATEGORIES: BrainDocumentCategory[] = ['sop', 'policy', 'guide', 'reference', 'announcement', 'other'];
const CATEGORY_LABEL: Record<BrainDocumentCategory, string> = {
  sop: 'SOP',
  policy: 'Policy',
  guide: 'Guide',
  reference: 'Reference',
  announcement: 'Announcement',
  other: 'Other',
};

const PAGE_SIZE = 25;

interface UserOption {
  id: number;
  name: string | null;
}

interface ListResponse {
  success: boolean;
  data?: {
    items: DocumentListRow[];
    limit: number;
    offset: number;
  };
  message?: string;
}

export default function BrainDocumentsListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusParam = (searchParams.get('status') as StatusFilter | null) ?? 'published';
  const categoryParam = (searchParams.get('category') as BrainDocumentCategory | '') ?? '';
  const ownerParam = searchParams.get('ownerId') ?? '';
  const searchParam = searchParams.get('search') ?? '';
  const pageParam = parseInt(searchParams.get('page') ?? '1', 10) || 1;

  const [searchDraft, setSearchDraft] = useState(searchParam);
  const [items, setItems] = useState<DocumentListRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── URL param sync helper ─────────────────────────────────────────────────
  const updateParams = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(`/portal/brain/documents${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [router, searchParams]);

  // ─── Load owner directory (once) ──────────────────────────────────────────
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
      const r = await fetch(`/api/portal/brain/documents?${qs.toString()}`);
      const json: ListResponse = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to load documents.');
      } else {
        setItems(json.data?.items ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [statusParam, categoryParam, ownerParam, searchParam, pageParam]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() defers setState into async IIFE; trigger fires synchronously by design
  useEffect(() => { load(); }, [load]);

  // ─── Mirror URL search → local input ──────────────────────────────────────
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors URL → local input draft; both are React state
    setSearchDraft(searchParam);
  }, [searchParam]);

  const handleSearchChange = (v: string) => {
    setSearchDraft(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParams({ search: v || null, page: null });
    }, 300);
  };

  // ─── Resolve owner name + group by category ───────────────────────────────
  const ownerNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const u of users) if (u.name) map.set(u.id, u.name);
    return map;
  }, [users]);

  const groups = useMemo(() => {
    const map = new Map<BrainDocumentCategory, DocumentCardData[]>();
    for (const it of items) {
      const arr = map.get(it.category) ?? [];
      arr.push({
        ...it,
        ownerName: it.ownerId !== null ? (ownerNameById.get(it.ownerId) ?? `User #${it.ownerId}`) : null,
      });
      map.set(it.category, arr);
    }
    const sorted: Array<[BrainDocumentCategory, DocumentCardData[]]> = CATEGORIES
      .filter((c) => map.has(c))
      .map((c) => [c, (map.get(c) ?? []).sort((a, b) => a.title.localeCompare(b.title))]);
    return sorted;
  }, [items, ownerNameById]);

  const hasNextPage = items.length === PAGE_SIZE;

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-5">
      <PortalPageHeader
        eyebrow="Brain"
        title={
          <span className="flex items-center gap-2">
            <span className="material-icons text-primary">description</span>
            Documents
          </span>
        }
        subtitle="Versioned, required-readable SOPs &amp; policies. The canonical written answer for your team."
        actions={
          <>
            <Link href="/portal/brain/documents/queue" className={pBtnGhost}>
              <span className="material-icons text-base">assignment_late</span>
              My reading queue
            </Link>
            <Link href="/portal/brain/documents/new" className={pBtnPrimary}>
              <span className="material-icons text-base">add</span>
              New document
            </Link>
          </>
        }
      />

      {/* Filters */}
      <div className="grid sm:grid-cols-4 gap-3 items-end">
        <div className="sm:col-span-1">
          <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Status</span>
          <div className="flex items-center gap-1 bg-background border border-border rounded-md p-0.5">
            {(['all', 'draft', 'published', 'archived'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => updateParams({ status: s === 'published' ? null : s, page: null })}
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
          <label htmlFor="doc-cat-f" className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
            Category
          </label>
          <select
            id="doc-cat-f"
            value={categoryParam}
            onChange={(e) => updateParams({ category: e.target.value || null, page: null })}
            className={pSelect}
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="doc-owner-f" className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
            Owner
          </label>
          <select
            id="doc-owner-f"
            value={ownerParam}
            onChange={(e) => updateParams({ ownerId: e.target.value || null, page: null })}
            className={pSelect}
          >
            <option value="">All owners</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name ?? `User #${u.id}`}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="doc-search" className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
            Search
          </label>
          <div className="relative">
            <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-base pointer-events-none">search</span>
            <input
              id="doc-search"
              type="text"
              value={searchDraft}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search title or body…"
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
            Couldn&apos;t load documents
          </div>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <span className="material-icons text-5xl text-primary mb-3 block">description</span>
          <h2 className="text-base font-semibold text-foreground mb-1">
            {searchParam || categoryParam || ownerParam || statusParam !== 'published'
              ? 'No matching documents.'
              : 'No documents yet.'}
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            {searchParam || categoryParam || ownerParam || statusParam !== 'published'
              ? 'Try clearing filters.'
              : 'Promote a note into your first SOP, or write one from scratch.'}
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <Link href="/portal/brain/documents/new" className={pBtnPrimary}>
              <span className="material-icons text-base">add</span>
              New document
            </Link>
            <Link href="/portal/brain/documents/new?source=note" className={pBtnGhost}>
              <span className="material-icons text-base">file_upload</span>
              Promote from note
            </Link>
          </div>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="space-y-5">
          {groups.map(([cat, rows]) => {
            const isCollapsed = !!collapsed[cat];
            return (
              <section key={cat}>
                <button
                  type="button"
                  onClick={() => setCollapsed((prev) => ({ ...prev, [cat]: !isCollapsed }))}
                  className="flex items-center gap-1.5 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="material-icons text-base">
                    {isCollapsed ? 'chevron_right' : 'expand_more'}
                  </span>
                  {CATEGORY_LABEL[cat]}
                  <span className="text-[10px] text-muted-foreground/70 font-normal normal-case">({rows.length})</span>
                </button>
                {!isCollapsed && (
                  <div className="space-y-1.5">
                    {rows.map((row) => <DocumentCard key={row.id} doc={row} />)}
                  </div>
                )}
              </section>
            );
          })}

          {(pageParam > 1 || hasNextPage) && (
            <div className="flex items-center justify-between pt-3 border-t border-border text-xs">
              <span className="text-muted-foreground">Page {pageParam}</span>
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
                  disabled={!hasNextPage}
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
    </div>
  );
}
