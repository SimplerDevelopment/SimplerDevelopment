'use client';

/**
 * NoteListPane — left rail of the knowledge IDE shell.
 *
 * Search input + filter chips + a grouped, scrollable list of notes. Click a
 * note to select it; the parent shell mirrors the selection into the URL
 * (`?id=N`) and the editor pane re-fetches.
 *
 * Grouping: notes carry provenance tags (`kb-import`, `competitor`,
 * `technolutions-kb`, `discovery`, `daily`, `postcaptain`, etc. — see
 * scripts/migrations/postcaptain/import-kb.ts). Notes without a provenance
 * tag fall into the "Manual" bucket.
 *
 * Pagination is still server-side; the rail uses a "Load more" button
 * rather than numbered pagination.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

const PAGE_SIZE = 50;

/** Provenance tags get highest priority for grouping. Order = display order. */
const PROVENANCE_GROUPS = [
  'daily',
  'discovery',
  'competitor',
  'technolutions-kb',
  'postcaptain',
  'index',
  'slate-news',
  'slate-org',
  'sources-other',
] as const;

type GroupKey = typeof PROVENANCE_GROUPS[number] | 'manual' | 'pinned';

const GROUP_LABELS: Record<GroupKey, string> = {
  pinned: 'Pinned',
  daily: 'Daily',
  discovery: 'Discoveries',
  competitor: 'Competitors',
  'technolutions-kb': 'Technolutions',
  postcaptain: 'Post Captain',
  index: 'Indexes',
  'slate-news': 'Slate news',
  'slate-org': 'Slate org',
  'sources-other': 'Sources (other)',
  manual: 'Manual',
};

const GROUP_ICONS: Record<GroupKey, string> = {
  pinned: 'push_pin',
  daily: 'today',
  discovery: 'lightbulb',
  competitor: 'compare_arrows',
  'technolutions-kb': 'menu_book',
  postcaptain: 'sailing',
  index: 'list_alt',
  'slate-news': 'newspaper',
  'slate-org': 'apartment',
  'sources-other': 'folder',
  manual: 'edit',
};

interface Props {
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  /** Bumped by the parent when a note has been saved/created so the list refreshes. */
  refreshTick?: number;
}

export default function NoteListPane({ selectedId, onSelect, onCreate, refreshTick = 0 }: Props) {
  const [notes, setNotes] = useState<BrainNote[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [tagDrawerOpen, setTagDrawerOpen] = useState(false);

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
    // Server's tag filter is single-tag today; if the user picks multiple
    // we use the first one server-side and filter the rest client-side
    // (KB-scale lists are still small enough to make this fine).
    if (activeTags[0]) params.set('tag', activeTags[0]);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));

    const myReq = ++reqIdRef.current;
    try {
      const r = await fetch(`/api/portal/brain/knowledge?${params.toString()}`);
      const json = await r.json().catch(() => ({}));
      // Discard stale responses (newer query already in flight).
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
  }, [debouncedSearch, pinnedOnly, activeTags]);

  // Initial + filter-change reload.
  useEffect(() => {
    load(0, true);
  }, [load, refreshTick]);

  // Tag inventory for the chip drawer.
  useEffect(() => {
    fetch('/api/portal/brain/knowledge?tags=true')
      .then(r => r.json())
      .then(j => {
        if (j?.success) setAllTags(j.data?.tags ?? []);
      })
      .catch(() => { /* non-fatal */ });
  }, []);

  const grouped = useMemo(() => {
    const buckets: Record<string, BrainNote[]> = {};
    for (const n of notes) {
      let key: GroupKey = 'manual';
      if (n.pinned) key = 'pinned';
      else {
        const provenance = (n.tags ?? []).find(t => (PROVENANCE_GROUPS as readonly string[]).includes(t)) as GroupKey | undefined;
        if (provenance) key = provenance;
      }
      (buckets[key] ??= []).push(n);
    }
    // Stable display order: pinned first, then provenance groups in declared
    // order, then manual at the bottom.
    const order: GroupKey[] = ['pinned', ...PROVENANCE_GROUPS, 'manual'];
    return order
      .filter(k => buckets[k]?.length)
      .map(k => ({ key: k, label: GROUP_LABELS[k], icon: GROUP_ICONS[k], notes: buckets[k] }));
  }, [notes]);

  const hasMore = loaded < total;

  function toggleTag(tag: string) {
    setActiveTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  function toggleGroup(key: string) {
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="h-full flex flex-col bg-card border-r border-border">
      {/* Search + new */}
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
          <button
            type="button"
            onClick={onCreate}
            title="New note"
            aria-label="New note"
            className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border text-foreground hover:bg-accent"
          >
            <span className="material-icons text-base">add</span>
          </button>
        </div>

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

        {tagDrawerOpen && (
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
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="m-2 bg-destructive/10 border border-destructive/30 rounded-md p-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {!loading && notes.length === 0 && !error && (
          <div className="p-6 text-center text-xs text-muted-foreground">
            No notes match.
          </div>
        )}

        {grouped.map(group => {
          const collapsed = collapsedGroups[group.key];
          return (
            <div key={group.key} className="border-b border-border/40 last:border-b-0">
              <button
                type="button"
                onClick={() => toggleGroup(group.key)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/40"
              >
                <span className="material-icons text-sm">
                  {collapsed ? 'chevron_right' : 'expand_more'}
                </span>
                <span className="material-icons text-sm">{group.icon}</span>
                <span className="flex-1 text-left">{group.label}</span>
                <span className="text-[10px] text-muted-foreground">{group.notes.length}</span>
              </button>
              {!collapsed && (
                <ul>
                  {group.notes.map(n => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(n.id)}
                        className={`w-full text-left px-3 py-1.5 flex items-start gap-2 group transition-colors ${
                          selectedId === n.id
                            ? 'bg-primary/10 text-primary'
                            : 'text-foreground hover:bg-muted/40'
                        }`}
                      >
                        <span className="material-icons text-sm mt-0.5 opacity-60 group-hover:opacity-100">
                          {n.attachmentFilename ? 'description' : (n.pinned ? 'push_pin' : 'sticky_note_2')}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm truncate">{n.title || 'Untitled'}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {formatRelative(n.updatedAt)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

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

      {/* Footer */}
      <div className="border-t border-border px-2 py-1 text-[11px] text-muted-foreground flex items-center justify-between">
        <span>{total} {total === 1 ? 'note' : 'notes'}</span>
        {loading && <span className="material-icons text-sm animate-spin">progress_activity</span>}
      </div>
    </div>
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
