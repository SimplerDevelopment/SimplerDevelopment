'use client';

/**
 * NoteListPane — left rail of the knowledge IDE shell.
 *
 * Search input + filter chips + a Bear-style nested tag tree of notes,
 * with sort menu, select-mode bulk actions, and a Trash tab. Click a row
 * to select a note; the parent shell mirrors selection into `?id=N`.
 *
 * Tag tree: tags containing `/` produce nested folders (e.g.
 * `kb/marketing/seo`). Bare tags become root folders. Notes with no tag
 * fall into a sentinel `Untagged` folder. Pinned notes float to a top
 * "Pinned" section and are NOT duplicated under their tag folders.
 *
 * When a search/tag filter is active, the tree is bypassed in favor of
 * a flat result list so users can see actual matches.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TemplatesPickerButton from '@/components/brain/TemplatesPickerButton';

interface BrainNote {
  id: number;
  title: string;
  tags: string[];
  pinned: boolean;
  updatedAt: string;
  attachmentFilename: string | null;
}

interface ListResponse {
  items: BrainNote[];
  total: number;
  limit: number;
  offset: number;
}

interface SavedSearchFilters {
  search?: string;
  tagPrefix?: string;
  tags?: string[];
  pinnedOnly?: boolean;
  trashed?: boolean;
  sort?: SortField;
  order?: SortOrder;
}

interface SavedSearch {
  id: number;
  name: string;
  icon: string;
  filters: SavedSearchFilters;
  userId: number | null;
  sortOrder: number;
}

const SAVED_SEARCH_ICONS = ['bookmark', 'star', 'today', 'lightbulb', 'inbox'] as const;
type SavedSearchIcon = (typeof SAVED_SEARCH_ICONS)[number];

const PAGE_SIZE = 50;

const COLLAPSED_KEY = 'brain.knowledge.list.collapsed';
const SORT_KEY = 'brain.knowledge.list.sort';
const ORDER_KEY = 'brain.knowledge.list.order';

type SortField = 'updated' | 'created' | 'title';
type SortOrder = 'asc' | 'desc';

const UNTAGGED_PATH = '__untagged__';
const PINNED_PATH = '__pinned__';

interface Props {
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  /** Called when a template-driven create succeeds; parent can refresh + select. */
  onTemplateApplied?: (noteId: number) => void;
  /** Bumped by the parent when a note has been saved/created so the list refreshes. */
  refreshTick?: number;
}

export default function NoteListPane({ selectedId, onSelect, onCreate, onTemplateApplied, refreshTick = 0 }: Props) {
  const [notes, setNotes] = useState<BrainNote[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [tagDrawerOpen, setTagDrawerOpen] = useState(false);

  const [sortField, setSortField] = useState<SortField>('updated');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [sortOpen, setSortOpen] = useState(false);

  const [trashed, setTrashed] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkPopover, setBulkPopover] = useState<null | 'tag' | 'move'>(null);
  const [bulkTagInput, setBulkTagInput] = useState('');
  const [bulkMoveTarget, setBulkMoveTarget] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const [internalRefresh, setInternalRefresh] = useState(0);

  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savedFormOpen, setSavedFormOpen] = useState(false);
  const [savedFormName, setSavedFormName] = useState('');
  const [savedFormIcon, setSavedFormIcon] = useState<SavedSearchIcon>('bookmark');
  const [savedFormScope, setSavedFormScope] = useState<'personal' | 'shared'>('personal');
  const [savedFormBusy, setSavedFormBusy] = useState(false);
  const [savedRowMenu, setSavedRowMenu] = useState<number | null>(null);
  const [savedRenameId, setSavedRenameId] = useState<number | null>(null);
  const [savedRenameValue, setSavedRenameValue] = useState('');

  // Load persisted prefs once.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(COLLAPSED_KEY);
      if (raw) setCollapsed(JSON.parse(raw));
    } catch { /* non-fatal */ }
    const sf = window.localStorage.getItem(SORT_KEY);
    if (sf === 'updated' || sf === 'created' || sf === 'title') setSortField(sf);
    const so = window.localStorage.getItem(ORDER_KEY);
    if (so === 'asc' || so === 'desc') setSortOrder(so);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed)); } catch { /* */ }
  }, [collapsed]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SORT_KEY, sortField);
    window.localStorage.setItem(ORDER_KEY, sortOrder);
  }, [sortField, sortOrder]);

  // Debounce search by 200ms so each keystroke doesn't trigger a fetch.
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search), 200);
    return () => window.clearTimeout(id);
  }, [search]);

  const reqIdRef = useRef(0);

  const load = useCallback(async (offset: number, replace: boolean) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
    if (pinnedOnly) params.set('pinned', 'true');
    if (activeTags[0]) params.set('tag', activeTags[0]);
    if (trashed) params.set('trashed', 'true');
    params.set('sort', sortField);
    params.set('order', sortOrder);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));

    const myReq = ++reqIdRef.current;
    try {
      const r = await fetch(`/api/portal/brain/knowledge?${params.toString()}`);
      const json = await r.json().catch(() => ({}));
      if (myReq !== reqIdRef.current) return;

      if (!r.ok || !json.success) {
        setError(json.message || `Failed to load notes (${r.status}).`);
        if (replace) setNotes([]);
        return;
      }
      const payload = json.data as ListResponse;
      let nextItems = payload.items;
      if (activeTags.length > 1) {
        const extra = activeTags.slice(1);
        nextItems = nextItems.filter(n => extra.every(t => n.tags?.includes(t)));
      }
      setTotal(payload.total);
      setLoaded(replace ? nextItems.length : (offset + nextItems.length));
      setNotes(prev => (replace ? nextItems : [...prev, ...nextItems]));
    } catch (err) {
      if (myReq !== reqIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      if (myReq === reqIdRef.current) setLoading(false);
    }
  }, [debouncedSearch, pinnedOnly, activeTags, trashed, sortField, sortOrder]);

  // Initial + filter-change reload.
  useEffect(() => {
    load(0, true);
  }, [load, refreshTick, internalRefresh]);

  // Tag inventory for the chip drawer.
  useEffect(() => {
    fetch('/api/portal/brain/knowledge?tags=true')
      .then(r => r.json())
      .then(j => {
        if (j?.success) setAllTags(j.data?.tags ?? []);
      })
      .catch(() => { /* non-fatal */ });
  }, [internalRefresh]);

  // Saved searches inventory.
  const loadSavedSearches = useCallback(async () => {
    try {
      const r = await fetch('/api/portal/brain/saved-searches');
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.success) setSavedSearches(j.data?.items ?? []);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    loadSavedSearches();
  }, [loadSavedSearches]);

  // Clear selection when leaving select mode or when filter context changes.
  useEffect(() => {
    if (!selectMode) {
      setSelectedIds(new Set());
      setBulkPopover(null);
    }
  }, [selectMode]);
  useEffect(() => {
    setSelectedIds(new Set());
  }, [trashed]);

  const pinnedIdsSet = useMemo(() => {
    const s = new Set<number>();
    for (const n of notes) if (n.pinned) s.add(n.id);
    return s;
  }, [notes]);

  const filtersActive = !!(debouncedSearch.trim() || activeTags.length > 0 || pinnedOnly);

  const tree = useMemo(() => buildTagTree(notes, pinnedIdsSet, trashed), [notes, pinnedIdsSet, trashed]);

  const hasMore = loaded < total;

  // All folder paths in tree (used for "expand all" / "collapse all" behaviour).
  const allPaths = useMemo(() => collectPaths(tree), [tree]);

  // Folder-paths the user can pick as a Move target (existing tag-prefix nodes).
  const movablePaths = useMemo(() => {
    const out: string[] = [];
    walkTree(tree, (node, path) => {
      if (path === PINNED_PATH || path === UNTAGGED_PATH) return;
      out.push(path);
    });
    return out.sort();
  }, [tree]);

  function toggleTag(tag: string) {
    setActiveTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  function toggleCollapsed(path: string) {
    setCollapsed(prev => ({ ...prev, [path]: !prev[path] }));
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function runBulk(op: BulkOp) {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const r = await fetch('/api/portal/brain/knowledge/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), op }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success) {
        setError(json.message || `Bulk action failed (${r.status}).`);
        return;
      }
      setSelectedIds(new Set());
      setBulkPopover(null);
      setBulkTagInput('');
      setBulkMoveTarget('');
      setInternalRefresh(t => t + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBulkBusy(false);
    }
  }

  async function restoreOne(id: number) {
    try {
      const r = await fetch(`/api/portal/brain/knowledge/${id}/restore`, { method: 'POST' });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success) {
        setError(json.message || `Restore failed (${r.status}).`);
        return;
      }
      setInternalRefresh(t => t + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }

  async function hardDeleteOne(id: number) {
    if (typeof window !== 'undefined' && !window.confirm('Permanently delete this note? This cannot be undone.')) return;
    try {
      const r = await fetch(`/api/portal/brain/knowledge/${id}`, { method: 'DELETE' });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success) {
        setError(json.message || `Delete failed (${r.status}).`);
        return;
      }
      setInternalRefresh(t => t + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }

  function applySavedSearch(s: SavedSearch) {
    const f = s.filters ?? {};
    setSearch(f.search ?? '');
    setActiveTags(Array.isArray(f.tags) ? f.tags : []);
    setPinnedOnly(!!f.pinnedOnly);
    setSortField(f.sort ?? 'updated');
    setSortOrder(f.order ?? 'desc');
    setTrashed(!!f.trashed);
  }

  const currentFilters = useMemo<SavedSearchFilters>(() => ({
    search: debouncedSearch.trim() || undefined,
    tags: activeTags.length > 0 ? activeTags : undefined,
    pinnedOnly: pinnedOnly || undefined,
    trashed: trashed || undefined,
    sort: sortField,
    order: sortOrder,
  }), [debouncedSearch, activeTags, pinnedOnly, trashed, sortField, sortOrder]);

  const matchedSavedId = useMemo(() => {
    for (const s of savedSearches) {
      if (savedSearchMatches(s.filters, currentFilters)) return s.id;
    }
    return null;
  }, [savedSearches, currentFilters]);

  async function createSavedFromCurrent() {
    if (!savedFormName.trim() || savedFormBusy) return;
    setSavedFormBusy(true);
    try {
      const r = await fetch('/api/portal/brain/saved-searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: savedFormName.trim(),
          icon: savedFormIcon,
          scope: savedFormScope,
          filters: currentFilters,
        }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success) {
        setError(json.message || `Save failed (${r.status}).`);
        return;
      }
      setSavedFormOpen(false);
      setSavedFormName('');
      setSavedFormIcon('bookmark');
      setSavedFormScope('personal');
      await loadSavedSearches();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSavedFormBusy(false);
    }
  }

  async function renameSavedSearch(id: number, name: string) {
    if (!name.trim()) return;
    try {
      const r = await fetch(`/api/portal/brain/saved-searches/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success) {
        setError(json.message || `Rename failed (${r.status}).`);
        return;
      }
      await loadSavedSearches();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSavedRenameId(null);
      setSavedRenameValue('');
      setSavedRowMenu(null);
    }
  }

  async function deleteSavedSearch(id: number) {
    if (typeof window !== 'undefined' && !window.confirm('Delete this saved search?')) return;
    try {
      const r = await fetch(`/api/portal/brain/saved-searches/${id}`, { method: 'DELETE' });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success) {
        setError(json.message || `Delete failed (${r.status}).`);
        return;
      }
      await loadSavedSearches();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSavedRowMenu(null);
    }
  }

  function expandAll() {
    setCollapsed({});
  }

  function collapseAll() {
    const next: Record<string, boolean> = {};
    for (const p of allPaths) next[p] = true;
    setCollapsed(next);
  }

  return (
    <div className="h-full flex flex-col bg-card border-r border-border relative">
      {/* Tabs: Notes / Trash */}
      <div className="flex border-b border-border bg-muted/30">
        <button
          type="button"
          onClick={() => setTrashed(false)}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium transition-colors ${
            !trashed
              ? 'text-foreground bg-background border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
          }`}
        >
          <span className="material-icons text-sm">notes</span>
          Notes
        </button>
        <button
          type="button"
          onClick={() => setTrashed(true)}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium transition-colors ${
            trashed
              ? 'text-foreground bg-background border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
          }`}
        >
          <span className="material-icons text-sm">delete</span>
          Trash
        </button>
      </div>

      {/* Search + new + sort + select-mode toggle */}
      <div className="p-2 border-b border-border space-y-2">
        <div className="flex items-center gap-1.5">
          <div className="flex-1 relative">
            <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-base text-muted-foreground">search</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes…"
              className="w-full pl-8 pr-2 py-1.5 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setSortOpen(o => !o)}
              title="Sort"
              aria-label="Sort"
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border text-foreground hover:bg-accent"
            >
              <span className="material-icons text-base">tune</span>
            </button>
            {sortOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-md border border-border bg-popover shadow-md p-2 text-xs">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Sort by</div>
                  {(['updated', 'created', 'title'] as SortField[]).map(f => (
                    <label key={f} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-accent cursor-pointer">
                      <input
                        type="radio"
                        name="sortField"
                        checked={sortField === f}
                        onChange={() => setSortField(f)}
                        className="h-3 w-3"
                      />
                      <span className="capitalize">{f}</span>
                    </label>
                  ))}
                  <div className="mt-2 pt-2 border-t border-border flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSortOrder('asc')}
                      className={`flex-1 px-2 py-1 rounded ${sortOrder === 'asc' ? 'bg-primary/10 text-primary' : 'hover:bg-accent'}`}
                    >
                      Asc
                    </button>
                    <button
                      type="button"
                      onClick={() => setSortOrder('desc')}
                      className={`flex-1 px-2 py-1 rounded ${sortOrder === 'desc' ? 'bg-primary/10 text-primary' : 'hover:bg-accent'}`}
                    >
                      Desc
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          {filtersActive && !matchedSavedId && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setSavedFormOpen(o => !o)}
                title="Save current view"
                aria-label="Save current view"
                className={`h-8 w-8 inline-flex items-center justify-center rounded-md border transition-colors ${
                  savedFormOpen ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground hover:bg-accent'
                }`}
              >
                <span className="material-icons text-base">bookmark_add</span>
              </button>
              {savedFormOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setSavedFormOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-20 w-64 rounded-md border border-border bg-popover shadow-md p-3 text-xs space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Save current view</div>
                    <input
                      type="text"
                      autoFocus
                      value={savedFormName}
                      onChange={(e) => setSavedFormName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') createSavedFromCurrent(); }}
                      placeholder="Pin name"
                      className="w-full px-2 py-1 rounded border border-border bg-background"
                    />
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Icon</div>
                      <div className="flex items-center gap-1">
                        {SAVED_SEARCH_ICONS.map(ic => (
                          <button
                            key={ic}
                            type="button"
                            onClick={() => setSavedFormIcon(ic)}
                            className={`h-7 w-7 inline-flex items-center justify-center rounded border ${
                              savedFormIcon === ic ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent'
                            }`}
                            aria-label={`Icon ${ic}`}
                          >
                            <span className="material-icons text-sm">{ic}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSavedFormScope('personal')}
                        className={`flex-1 px-2 py-1 rounded border text-[11px] ${
                          savedFormScope === 'personal' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        Personal
                      </button>
                      <button
                        type="button"
                        onClick={() => setSavedFormScope('shared')}
                        className={`flex-1 px-2 py-1 rounded border text-[11px] ${
                          savedFormScope === 'shared' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        Team
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={createSavedFromCurrent}
                      disabled={!savedFormName.trim() || savedFormBusy}
                      className="w-full px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {savedFormBusy ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setSelectMode(s => !s)}
            title={selectMode ? 'Exit select mode' : 'Select notes'}
            aria-label={selectMode ? 'Exit select mode' : 'Select notes'}
            className={`h-8 w-8 inline-flex items-center justify-center rounded-md border transition-colors ${
              selectMode ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground hover:bg-accent'
            }`}
          >
            <span className="material-icons text-base">
              {selectMode ? 'check_box' : 'check_box_outline_blank'}
            </span>
          </button>
          {!trashed && (
            <TemplatesPickerButton
              onCreate={onCreate}
              onTemplateApplied={(note) => { onTemplateApplied?.(note.id); }}
            />
          )}
        </div>

        {!trashed && (
          <div className="flex items-center gap-2 text-xs">
            <label className="inline-flex items-center gap-1 cursor-pointer text-muted-foreground hover:text-foreground">
              <input
                type="checkbox"
                checked={pinnedOnly}
                onChange={(e) => setPinnedOnly(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Pinned
            </label>
            <button
              type="button"
              onClick={() => setTagDrawerOpen(o => !o)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border transition-colors ${
                activeTags.length > 0
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="material-icons text-sm">label</span>
              Tags{activeTags.length > 0 && ` (${activeTags.length})`}
            </button>
            {!filtersActive && (
              <div className="ml-auto inline-flex items-center gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={expandAll}
                  className="text-muted-foreground hover:text-foreground"
                  title="Expand all folders"
                >
                  expand
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  type="button"
                  onClick={collapseAll}
                  className="text-muted-foreground hover:text-foreground"
                  title="Collapse all folders"
                >
                  collapse
                </button>
              </div>
            )}
            {(activeTags.length > 0 || pinnedOnly || debouncedSearch) && (
              <button
                type="button"
                onClick={() => { setActiveTags([]); setPinnedOnly(false); setSearch(''); }}
                className="text-xs text-muted-foreground hover:text-foreground"
                title="Clear filters"
              >
                clear
              </button>
            )}
          </div>
        )}

        {!trashed && tagDrawerOpen && (
          <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto pt-1">
            {allTags.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                  activeTags.includes(t)
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-muted/40 text-muted-foreground hover:bg-accent'
                }`}
              >
                {t}
              </button>
            ))}
            {allTags.length === 0 && (
              <span className="text-xs text-muted-foreground italic">No tags yet.</span>
            )}
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto pb-16">
        {error && (
          <div className="m-2 bg-destructive/10 border border-destructive/30 rounded-md p-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {!trashed && (
          <SavedSearchesSection
            items={savedSearches}
            matchedId={matchedSavedId}
            onApply={applySavedSearch}
            openMenuId={savedRowMenu}
            setOpenMenuId={setSavedRowMenu}
            renamingId={savedRenameId}
            renameValue={savedRenameValue}
            onStartRename={(id, name) => { setSavedRenameId(id); setSavedRenameValue(name); }}
            onChangeRename={setSavedRenameValue}
            onCommitRename={renameSavedSearch}
            onCancelRename={() => { setSavedRenameId(null); setSavedRenameValue(''); }}
            onDelete={deleteSavedSearch}
          />
        )}

        {!loading && notes.length === 0 && !error && (
          <div className="p-6 text-center text-xs text-muted-foreground">
            {trashed ? 'Trash is empty.' : 'No notes match.'}
          </div>
        )}

        {trashed ? (
          <FlatList
            notes={notes}
            selectedId={selectedId}
            onSelect={onSelect}
            selectMode={selectMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            sectionLabel="Trash"
            sectionIcon="delete"
            collapsed={!!collapsed['__trash__']}
            onToggleSection={() => toggleCollapsed('__trash__')}
            trailingActions={(n) => (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); restoreOne(n.id); }}
                  title="Restore"
                  aria-label="Restore"
                  className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                >
                  <span className="material-icons text-sm">restore</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); hardDeleteOne(n.id); }}
                  title="Delete forever"
                  aria-label="Delete forever"
                  className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                  <span className="material-icons text-sm">delete_forever</span>
                </button>
              </div>
            )}
          />
        ) : filtersActive ? (
          <FlatList
            notes={notes}
            selectedId={selectedId}
            onSelect={onSelect}
            selectMode={selectMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            sectionLabel={`Results (${notes.length})`}
            sectionIcon="search"
            collapsed={false}
          />
        ) : (
          <TreeView
            tree={tree}
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
            selectedId={selectedId}
            onSelect={onSelect}
            selectMode={selectMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
        )}

        {hasMore && (
          <div className="p-2">
            <button
              type="button"
              onClick={() => load(loaded, false)}
              disabled={loading}
              className="w-full px-3 py-1.5 text-xs rounded-md border border-border bg-muted/30 text-muted-foreground hover:bg-accent disabled:opacity-50"
            >
              {loading ? 'Loading…' : `Load more (${total - loaded} remaining)`}
            </button>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="absolute bottom-7 left-2 right-2 z-30 rounded-md border border-border bg-popover shadow-lg p-2 flex items-center gap-1.5">
          <span className="text-xs font-medium text-foreground mr-1">{selectedIds.size} selected</span>

          {!trashed && (
            <>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setBulkPopover(p => p === 'tag' ? null : 'tag')}
                  disabled={bulkBusy}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border hover:bg-accent disabled:opacity-50"
                >
                  <span className="material-icons text-sm">label</span>
                  Tag
                </button>
                {bulkPopover === 'tag' && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setBulkPopover(null)} />
                    <div className="absolute bottom-full mb-1 left-0 z-20 w-56 rounded-md border border-border bg-popover shadow-md p-2 text-xs space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Add or remove tag</div>
                      <input
                        type="text"
                        value={bulkTagInput}
                        onChange={(e) => setBulkTagInput(e.target.value)}
                        placeholder="tag/subtag"
                        className="w-full px-2 py-1 rounded border border-border bg-background"
                      />
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={!bulkTagInput.trim() || bulkBusy}
                          onClick={() => runBulk({ kind: 'add_tags', tags: [bulkTagInput.trim()] })}
                          className="flex-1 px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          disabled={!bulkTagInput.trim() || bulkBusy}
                          onClick={() => runBulk({ kind: 'remove_tags', tags: [bulkTagInput.trim()] })}
                          className="flex-1 px-2 py-1 rounded border border-border hover:bg-accent disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                      {allTags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1 border-t border-border max-h-24 overflow-y-auto">
                          {allTags.map(t => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setBulkTagInput(t)}
                              className="text-[10px] px-1.5 py-0.5 rounded-full border border-border bg-muted/40 hover:bg-accent"
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setBulkPopover(p => p === 'move' ? null : 'move')}
                  disabled={bulkBusy || movablePaths.length === 0}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border hover:bg-accent disabled:opacity-50"
                >
                  <span className="material-icons text-sm">drive_file_move</span>
                  Move
                </button>
                {bulkPopover === 'move' && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setBulkPopover(null)} />
                    <div className="absolute bottom-full mb-1 left-0 z-20 w-64 rounded-md border border-border bg-popover shadow-md p-2 text-xs space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Move under folder</div>
                      <input
                        type="text"
                        value={bulkMoveTarget}
                        onChange={(e) => setBulkMoveTarget(e.target.value)}
                        placeholder="kb/marketing"
                        className="w-full px-2 py-1 rounded border border-border bg-background"
                        list="bulk-move-paths"
                      />
                      <datalist id="bulk-move-paths">
                        {movablePaths.map(p => <option key={p} value={p} />)}
                      </datalist>
                      <p className="text-[10px] text-muted-foreground">
                        Replaces the leading tag-prefix on each selected note.
                      </p>
                      <button
                        type="button"
                        disabled={!bulkMoveTarget.trim() || bulkBusy}
                        onClick={() => {
                          const to = bulkMoveTarget.trim();
                          // We don't know which prefix each note had; backend resolves
                          // per-note via `from: ''` ⇒ replace whatever leading prefix
                          // matches an existing folder. The contract from the brief is
                          // `replace_tag_prefix { from, to }` — pass the longest common
                          // prefix or empty to let the backend decide.
                          runBulk({ kind: 'replace_tag_prefix', from: '', to });
                        }}
                        className="w-full px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                      >
                        Move
                      </button>
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => runBulk({ kind: 'soft_delete' })}
                disabled={bulkBusy}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                <span className="material-icons text-sm">delete</span>
                Delete
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => { setSelectedIds(new Set()); setBulkPopover(null); }}
            className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-xs rounded text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-border px-2 py-1 text-[11px] text-muted-foreground flex items-center justify-between">
        <span>{total} {total === 1 ? 'note' : 'notes'}{trashed ? ' in trash' : ''}</span>
        {loading && <span className="material-icons text-sm animate-spin">progress_activity</span>}
      </div>
    </div>
  );
}

// ─── List subcomponents ────────────────────────────────────────────────────

interface FlatListProps {
  notes: BrainNote[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  selectMode: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  sectionLabel: string;
  sectionIcon: string;
  collapsed: boolean;
  onToggleSection?: () => void;
  trailingActions?: (n: BrainNote) => React.ReactNode;
}

function FlatList({
  notes,
  selectedId,
  onSelect,
  selectMode,
  selectedIds,
  onToggleSelect,
  sectionLabel,
  sectionIcon,
  collapsed,
  onToggleSection,
  trailingActions,
}: FlatListProps) {
  return (
    <div className="border-b border-border/40 last:border-b-0">
      <button
        type="button"
        onClick={() => onToggleSection?.()}
        disabled={!onToggleSection}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:cursor-default disabled:hover:text-muted-foreground disabled:hover:bg-transparent"
      >
        {onToggleSection && (
          <span className="material-icons text-sm">
            {collapsed ? 'chevron_right' : 'expand_more'}
          </span>
        )}
        {!onToggleSection && <span className="w-4" />}
        <span className="material-icons text-sm">{sectionIcon}</span>
        <span className="flex-1 text-left">{sectionLabel}</span>
        <span className="text-[10px] text-muted-foreground">{notes.length}</span>
      </button>
      {!collapsed && (
        <ul>
          {notes.map(n => (
            <NoteRow
              key={n.id}
              n={n}
              depth={0}
              selectedId={selectedId}
              onSelect={onSelect}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              trailingActions={trailingActions}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface TreeViewProps {
  tree: TagNode;
  collapsed: Record<string, boolean>;
  onToggleCollapsed: (path: string) => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
  selectMode: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
}

function TreeView({ tree, collapsed, onToggleCollapsed, selectedId, onSelect, selectMode, selectedIds, onToggleSelect }: TreeViewProps) {
  // Render top-level children of synthetic root.
  return (
    <div>
      {tree.children.map(child => (
        <TreeNode
          key={child.path}
          node={child}
          depth={0}
          collapsed={collapsed}
          onToggleCollapsed={onToggleCollapsed}
          selectedId={selectedId}
          onSelect={onSelect}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
}

interface TreeNodeProps {
  node: TagNode;
  depth: number;
  collapsed: Record<string, boolean>;
  onToggleCollapsed: (path: string) => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
  selectMode: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
}

function TreeNode({ node, depth, collapsed, onToggleCollapsed, selectedId, onSelect, selectMode, selectedIds, onToggleSelect }: TreeNodeProps) {
  const isCollapsed = !!collapsed[node.path];
  const totalCount = node.descendantCount;
  const indent = depth * 12;
  const icon = iconForNode(node);

  return (
    <div className="border-b border-border/40 last:border-b-0">
      <button
        type="button"
        onClick={() => onToggleCollapsed(node.path)}
        className="w-full flex items-center gap-1 px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/40"
        style={{ paddingLeft: 8 + indent }}
      >
        <span className="material-icons text-sm">
          {node.children.length > 0 || node.notes.length > 0
            ? (isCollapsed ? 'chevron_right' : 'expand_more')
            : 'remove'}
        </span>
        <span className="material-icons text-sm">{icon}</span>
        <span className="flex-1 text-left normal-case tracking-normal">{node.label}</span>
        <span className="text-[10px] text-muted-foreground">{totalCount}</span>
      </button>
      {!isCollapsed && (
        <>
          {node.notes.length > 0 && (
            <ul>
              {node.notes.map(n => (
                <NoteRow
                  key={`${node.path}:${n.id}`}
                  n={n}
                  depth={depth + 1}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  selectMode={selectMode}
                  selectedIds={selectedIds}
                  onToggleSelect={onToggleSelect}
                />
              ))}
            </ul>
          )}
          {node.children.map(child => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              onToggleCollapsed={onToggleCollapsed}
              selectedId={selectedId}
              onSelect={onSelect}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </>
      )}
    </div>
  );
}

interface NoteRowProps {
  n: BrainNote;
  depth: number;
  selectedId: number | null;
  onSelect: (id: number) => void;
  selectMode: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  trailingActions?: (n: BrainNote) => React.ReactNode;
}

function NoteRow({ n, depth, selectedId, onSelect, selectMode, selectedIds, onToggleSelect, trailingActions }: NoteRowProps) {
  const indent = depth * 12;
  const isSelected = selectedIds.has(n.id);
  return (
    <li>
      <div
        className={`w-full flex items-start gap-2 px-3 py-1.5 group transition-colors cursor-pointer ${
          selectedId === n.id ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted/40'
        }`}
        style={{ paddingLeft: 12 + indent }}
        onClick={() => {
          if (selectMode) onToggleSelect(n.id);
          else onSelect(n.id);
        }}
      >
        {selectMode && (
          <span
            className="material-icons text-base mt-0.5"
            onClick={(e) => { e.stopPropagation(); onToggleSelect(n.id); }}
          >
            {isSelected ? 'check_box' : 'check_box_outline_blank'}
          </span>
        )}
        <span className="material-icons text-sm mt-0.5 opacity-60 group-hover:opacity-100">
          {n.attachmentFilename ? 'description' : (n.pinned ? 'push_pin' : 'sticky_note_2')}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm truncate">{n.title || 'Untitled'}</span>
          <span className="block text-[11px] text-muted-foreground">
            {formatRelative(n.updatedAt)}
          </span>
        </span>
        {trailingActions && trailingActions(n)}
      </div>
    </li>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ─── Tag-tree helpers ──────────────────────────────────────────────────────

interface TagNode {
  /** Stable identity for collapse-state and React keys. Slash-joined path or sentinel. */
  path: string;
  /** Last segment of the path (display name). */
  label: string;
  /** Direct child folders. */
  children: TagNode[];
  /** Notes that live exactly at this folder (not in a deeper child). */
  notes: BrainNote[];
  /** Total notes including descendants — for the count badge. */
  descendantCount: number;
}

type BulkOp =
  | { kind: 'add_tags'; tags: string[] }
  | { kind: 'remove_tags'; tags: string[] }
  | { kind: 'soft_delete' }
  | { kind: 'replace_tag_prefix'; from: string; to: string };

function newNode(path: string, label: string): TagNode {
  return { path, label, children: [], notes: [], descendantCount: 0 };
}

function buildTagTree(notes: BrainNote[], pinnedIds: Set<number>, trashed: boolean): TagNode {
  const root = newNode('', '');

  if (trashed) {
    // In trash mode the caller renders a flat list, but keep a defensive
    // empty tree.
    return root;
  }

  const pinnedNode = newNode(PINNED_PATH, 'Pinned');
  const untaggedNode = newNode(UNTAGGED_PATH, 'Untagged');

  // We build folder nodes lazily; track by path.
  const folderIndex = new Map<string, TagNode>();
  folderIndex.set('', root);

  function ensureFolder(parts: string[]): TagNode {
    if (parts.length === 0) return root;
    const path = parts.join('/');
    const existing = folderIndex.get(path);
    if (existing) return existing;
    const parent = ensureFolder(parts.slice(0, -1));
    const node = newNode(path, parts[parts.length - 1]);
    parent.children.push(node);
    folderIndex.set(path, node);
    return node;
  }

  for (const n of notes) {
    if (pinnedIds.has(n.id)) {
      pinnedNode.notes.push(n);
      continue;
    }
    const tags = (n.tags ?? []).filter(t => typeof t === 'string' && t.length > 0);
    if (tags.length === 0) {
      untaggedNode.notes.push(n);
      continue;
    }
    // Place under each tag-folder (multi-tag duplication).
    const seenPaths = new Set<string>();
    for (const tag of tags) {
      const parts = tag.split('/').filter(Boolean);
      if (parts.length === 0) continue;
      const path = parts.join('/');
      if (seenPaths.has(path)) continue;
      seenPaths.add(path);
      const folder = ensureFolder(parts);
      folder.notes.push(n);
    }
  }

  // Stitch sentinel sections at the front: Pinned first, Untagged last.
  if (pinnedNode.notes.length > 0) root.children.unshift(pinnedNode);
  if (untaggedNode.notes.length > 0) root.children.push(untaggedNode);

  // Sort siblings alphabetically except for sentinels which we placed manually.
  sortTreeChildren(root);

  // Compute descendant counts. For multi-tagged notes we count a unique
  // note id only once per node (across the node's own + descendants).
  computeCounts(root);

  return root;
}

function sortTreeChildren(node: TagNode): void {
  for (const child of node.children) sortTreeChildren(child);
  // Keep sentinels pinned at their positions (Pinned first, Untagged last) by
  // only sorting the middle slice.
  const isSentinel = (p: string) => p === PINNED_PATH || p === UNTAGGED_PATH;
  const sentinelsFront = node.children.filter(c => c.path === PINNED_PATH);
  const sentinelsBack = node.children.filter(c => c.path === UNTAGGED_PATH);
  const middle = node.children.filter(c => !isSentinel(c.path));
  middle.sort((a, b) => a.label.localeCompare(b.label));
  node.children = [...sentinelsFront, ...middle, ...sentinelsBack];
}

function computeCounts(node: TagNode): Set<number> {
  const ids = new Set<number>();
  for (const n of node.notes) ids.add(n.id);
  for (const child of node.children) {
    const childIds = computeCounts(child);
    for (const id of childIds) ids.add(id);
  }
  node.descendantCount = ids.size;
  return ids;
}

function collectPaths(node: TagNode): string[] {
  const out: string[] = [];
  walkTree(node, (_n, p) => { if (p) out.push(p); });
  return out;
}

function walkTree(node: TagNode, fn: (n: TagNode, path: string) => void): void {
  if (node.path) fn(node, node.path);
  for (const child of node.children) walkTree(child, fn);
}

function iconForNode(node: TagNode): string {
  if (node.path === PINNED_PATH) return 'push_pin';
  if (node.path === UNTAGGED_PATH) return 'inbox';
  return node.children.length > 0 ? 'folder' : 'tag';
}

// ─── Saved searches ────────────────────────────────────────────────────────

function savedSearchMatches(stored: SavedSearchFilters, current: SavedSearchFilters): boolean {
  const a = stored ?? {};
  const b = current ?? {};
  if ((a.search ?? '') !== (b.search ?? '')) return false;
  if (!!a.pinnedOnly !== !!b.pinnedOnly) return false;
  if (!!a.trashed !== !!b.trashed) return false;
  if ((a.sort ?? 'updated') !== (b.sort ?? 'updated')) return false;
  if ((a.order ?? 'desc') !== (b.order ?? 'desc')) return false;
  const at = (a.tags ?? []).slice().sort();
  const bt = (b.tags ?? []).slice().sort();
  if (at.length !== bt.length) return false;
  for (let i = 0; i < at.length; i++) if (at[i] !== bt[i]) return false;
  return true;
}

interface SavedSearchesSectionProps {
  items: SavedSearch[];
  matchedId: number | null;
  onApply: (s: SavedSearch) => void;
  openMenuId: number | null;
  setOpenMenuId: (id: number | null) => void;
  renamingId: number | null;
  renameValue: string;
  onStartRename: (id: number, name: string) => void;
  onChangeRename: (v: string) => void;
  onCommitRename: (id: number, name: string) => void;
  onCancelRename: () => void;
  onDelete: (id: number) => void;
}

function SavedSearchesSection({
  items,
  matchedId,
  onApply,
  openMenuId,
  setOpenMenuId,
  renamingId,
  renameValue,
  onStartRename,
  onChangeRename,
  onCommitRename,
  onCancelRename,
  onDelete,
}: SavedSearchesSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="border-b border-border/40">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/40"
      >
        <span className="material-icons text-sm">{collapsed ? 'chevron_right' : 'expand_more'}</span>
        <span className="material-icons text-sm">bookmark</span>
        <span className="flex-1 text-left">Saved</span>
        <span className="text-[10px] text-muted-foreground">{items.length}</span>
      </button>
      {!collapsed && (
        items.length === 0 ? (
          <div className="px-3 py-2 text-[11px] text-muted-foreground italic">
            No saved searches yet — apply filters and click <span className="material-icons text-[13px] align-middle">bookmark_add</span> to save this view.
          </div>
        ) : (
          <ul>
            {items.map(s => {
              const isActive = matchedId === s.id;
              const isRenaming = renamingId === s.id;
              return (
                <li key={s.id} className="relative">
                  <div
                    className={`w-full flex items-center gap-2 px-3 py-1.5 group transition-colors cursor-pointer ${
                      isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted/40'
                    }`}
                    onClick={() => { if (!isRenaming) onApply(s); }}
                  >
                    <span className="material-icons text-sm opacity-70 group-hover:opacity-100">{s.icon || 'bookmark'}</span>
                    {isRenaming ? (
                      <input
                        type="text"
                        autoFocus
                        value={renameValue}
                        onChange={(e) => onChangeRename(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') onCommitRename(s.id, renameValue);
                          else if (e.key === 'Escape') onCancelRename();
                        }}
                        onBlur={() => onCommitRename(s.id, renameValue)}
                        className="flex-1 px-1 py-0 text-sm border-b border-border bg-transparent focus:outline-none"
                      />
                    ) : (
                      <span className="flex-1 truncate text-sm">
                        {s.name}
                        {s.userId === null && <span className="ml-1 text-[9px] uppercase tracking-wider text-muted-foreground">team</span>}
                      </span>
                    )}
                    {!isRenaming && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === s.id ? null : s.id);
                        }}
                        title="More"
                        aria-label="More"
                        className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-accent"
                      >
                        <span className="material-icons text-sm">more_horiz</span>
                      </button>
                    )}
                  </div>
                  {openMenuId === s.id && !isRenaming && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                      <div className="absolute right-2 top-full z-20 w-32 rounded-md border border-border bg-popover shadow-md py-1 text-xs">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartRename(s.id, s.name);
                            setOpenMenuId(null);
                          }}
                          className="w-full text-left px-3 py-1 hover:bg-accent"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                          className="w-full text-left px-3 py-1 text-destructive hover:bg-destructive/10"
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )
      )}
    </div>
  );
}
