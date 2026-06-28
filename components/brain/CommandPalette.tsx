'use client';

/**
 * CommandPalette — Cmd-K global palette for the brain knowledge IDE.
 *
 * Empty query: shows two sections — "Recent" (resolved from
 * `lib/brain/recent-notes` + a small recent-activity fetch) and
 * "Quick actions". Typed query: hits `/api/portal/brain/knowledge?search=`
 * (debounced 150ms) and renders the top matches. Prefixing the query with
 * `>` switches into a quick-actions filter.
 *
 * Selection (↑/↓/Enter) is purely local — navigation goes through the
 * Next router so the parent page picks the new note up via `?id=N`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getRecentNoteIds, pushRecentNoteId } from '@/lib/brain/recent-notes';

interface PaletteNote {
  id: number;
  title: string;
  tags: string[];
  pinned: boolean;
  updatedAt: string;
}

interface QuickAction {
  kind: 'action';
  id: string;
  icon: string;
  label: string;
  hint?: string;
  run: () => void;
}

interface NoteRowItem {
  kind: 'note';
  id: string;
  note: PaletteNote;
}

type Row =
  | { kind: 'header'; id: string; label: string }
  | NoteRowItem
  | QuickAction;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: () => void;
  selectedNoteId: number | null;
  onShowTrash?: () => void;
}

const SEARCH_DEBOUNCE_MS = 150;
const SEARCH_LIMIT = 20;
const RECENT_FETCH_LIMIT = 50;

export default function CommandPalette({
  open,
  onOpenChange,
  onCreate,
  selectedNoteId,
  onShowTrash,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PaletteNote[]>([]);
  const [recentNotes, setRecentNotes] = useState<PaletteNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  // Reset state every time the palette opens; autofocus the input.
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setQuery('');
      setDebouncedQuery('');
      setSearchResults([]);
      setActiveIndex(0);
    });
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  // Fetch a slice of recent-activity notes once per open so we can resolve
  // the localStorage id list to titles/tags/updatedAt without N round-trips.
  useEffect(() => {
    if (!open) return;
    const ids = getRecentNoteIds();
    if (ids.length === 0) {
      queueMicrotask(() => setRecentNotes([]));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/portal/brain/knowledge?limit=${RECENT_FETCH_LIMIT}&sort=updated&order=desc`,
        );
        const json = await r.json().catch(() => ({}));
        if (cancelled || !r.ok || !json.success) return;
        const items = (json.data?.items ?? []) as PaletteNote[];
        const byId = new Map(items.map((n) => [n.id, n]));
        const resolved: PaletteNote[] = [];
        for (const id of ids) {
          const hit = byId.get(id);
          if (hit) resolved.push(hit);
        }
        setRecentNotes(resolved);
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Debounce typed query.
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query]);

  // Search fetch — only fires on a non-empty, non-`>`-prefixed query.
  const reqIdRef = useRef(0);
  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (!open || !trimmed || trimmed.startsWith('>')) {
      queueMicrotask(() => {
        setSearchResults([]);
        setLoading(false);
      });
      return;
    }
    const myReq = ++reqIdRef.current;
    queueMicrotask(() => setLoading(true));
    (async () => {
      try {
        const r = await fetch(
          `/api/portal/brain/knowledge?search=${encodeURIComponent(trimmed)}&limit=${SEARCH_LIMIT}`,
        );
        const json = await r.json().catch(() => ({}));
        if (myReq !== reqIdRef.current) return;
        if (!r.ok || !json.success) {
          setSearchResults([]);
          return;
        }
        setSearchResults((json.data?.items ?? []) as PaletteNote[]);
      } catch {
        if (myReq === reqIdRef.current) setSearchResults([]);
      } finally {
        if (myReq === reqIdRef.current) setLoading(false);
      }
    })();
  }, [debouncedQuery, open]);

  const goToNote = useCallback(
    (id: number) => {
      pushRecentNoteId(id);
      router.push(`/portal/brain/knowledge?id=${id}`);
      onOpenChange(false);
    },
    [router, onOpenChange],
  );

  const quickActions = useMemo<QuickAction[]>(() => {
    const list: QuickAction[] = [
      {
        kind: 'action',
        id: 'new-note',
        icon: 'add',
        label: 'New note',
        hint: 'Create a blank note',
        run: () => {
          onCreate();
          onOpenChange(false);
        },
      },
    ];
    if (selectedNoteId !== null) {
      list.push({
        kind: 'action',
        id: 'open-zen',
        icon: 'open_in_full',
        label: 'Open zen mode',
        hint: 'Single-pane view of the current note',
        run: () => {
          router.push(`/portal/brain/knowledge/${selectedNoteId}`);
          onOpenChange(false);
        },
      });
    }
    if (onShowTrash) {
      list.push({
        kind: 'action',
        id: 'browse-trash',
        icon: 'delete',
        label: 'Browse trash',
        hint: 'Show deleted notes',
        run: () => {
          onShowTrash();
          onOpenChange(false);
        },
      });
    }
    return list;
  }, [onCreate, onOpenChange, onShowTrash, router, selectedNoteId]);

  const rows = useMemo<Row[]>(() => {
    const trimmed = debouncedQuery.trim();
    const out: Row[] = [];

    if (trimmed.startsWith('>')) {
      const filter = trimmed.slice(1).trim().toLowerCase();
      const filtered = filter
        ? quickActions.filter((a) => a.label.toLowerCase().includes(filter))
        : quickActions;
      if (filtered.length > 0) {
        out.push({ kind: 'header', id: 'h-actions', label: 'Quick actions' });
        out.push(...filtered);
      }
      return out;
    }

    if (trimmed) {
      if (searchResults.length > 0) {
        out.push({ kind: 'header', id: 'h-results', label: 'Notes' });
        for (const n of searchResults) {
          out.push({ kind: 'note', id: `n-${n.id}`, note: n });
        }
      }
      return out;
    }

    if (recentNotes.length > 0) {
      out.push({ kind: 'header', id: 'h-recent', label: 'Recent' });
      for (const n of recentNotes) {
        out.push({ kind: 'note', id: `r-${n.id}`, note: n });
      }
    }
    out.push({ kind: 'header', id: 'h-actions', label: 'Quick actions' });
    out.push(...quickActions);
    return out;
  }, [debouncedQuery, searchResults, recentNotes, quickActions]);

  const selectableIndices = useMemo(() => {
    const out: number[] = [];
    rows.forEach((r, i) => {
      if (r.kind !== 'header') out.push(i);
    });
    return out;
  }, [rows]);

  // Clamp activeIndex when the row set changes so the highlight stays valid.
  useEffect(() => {
    if (selectableIndices.length === 0) {
      queueMicrotask(() => setActiveIndex(0));
      return;
    }
    if (!selectableIndices.includes(activeIndex)) {
      queueMicrotask(() => setActiveIndex(selectableIndices[0]));
    }
  }, [selectableIndices, activeIndex]);

  const moveSelection = useCallback(
    (delta: number) => {
      if (selectableIndices.length === 0) return;
      const currentPos = selectableIndices.indexOf(activeIndex);
      const nextPos =
        currentPos < 0
          ? 0
          : (currentPos + delta + selectableIndices.length) % selectableIndices.length;
      setActiveIndex(selectableIndices[nextPos]);
    },
    [activeIndex, selectableIndices],
  );

  const runRow = useCallback(
    (row: Row) => {
      if (row.kind === 'note') goToNote(row.note.id);
      else if (row.kind === 'action') row.run();
    },
    [goToNote],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveSelection(1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveSelection(-1);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const row = rows[activeIndex];
        if (row && row.kind !== 'header') runRow(row);
      }
    },
    [moveSelection, onOpenChange, rows, activeIndex, runRow],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] px-4 bg-background/40 backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-[600px] rounded-xl border border-border bg-popover shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <span className="material-icons text-base text-muted-foreground">search</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes, or type > for actions…"
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
            aria-label="Search"
          />
          {loading && (
            <span className="material-icons animate-spin text-sm text-muted-foreground">
              progress_activity
            </span>
          )}
          <kbd className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground bg-muted/50">
            esc
          </kbd>
        </div>

        <ul className="max-h-[55vh] overflow-y-auto py-1">
          {rows.length === 0 && (
            <li className="px-4 py-8 text-center text-xs text-muted-foreground">
              {debouncedQuery.trim() ? 'No matches.' : 'Start typing to search notes.'}
            </li>
          )}
          {rows.map((row, idx) => {
            if (row.kind === 'header') {
              return (
                <li
                  key={row.id}
                  className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {row.label}
                </li>
              );
            }
            const isActive = idx === activeIndex;
            if (row.kind === 'note') {
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => runRow(row)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`w-full text-left px-3 py-2 flex items-start gap-2 transition-colors ${
                      isActive ? 'bg-primary/10 text-foreground' : 'text-foreground hover:bg-muted/40'
                    }`}
                  >
                    <span className="material-icons text-sm mt-0.5 opacity-70">
                      {row.note.pinned ? 'push_pin' : 'sticky_note_2'}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm truncate">
                        {row.note.title || 'Untitled'}
                      </span>
                      <span className="block text-[11px] text-muted-foreground flex items-center gap-1.5">
                        {row.note.tags?.slice(0, 2).map((t) => (
                          <span
                            key={t}
                            className="px-1.5 py-px rounded-full bg-muted/60 text-[10px] truncate max-w-[120px]"
                          >
                            {t}
                          </span>
                        ))}
                        <span className="ml-auto">{formatRelative(row.note.updatedAt)}</span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            }
            // action
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => runRow(row)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                    isActive ? 'bg-primary/10 text-foreground' : 'text-foreground hover:bg-muted/40'
                  }`}
                >
                  <span className="material-icons text-sm opacity-70">{row.icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm">{row.label}</span>
                    {row.hint && (
                      <span className="block text-[11px] text-muted-foreground">{row.hint}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-border bg-muted/30 px-3 py-1.5 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1 rounded border border-border bg-background">↑</kbd>
            <kbd className="px-1 rounded border border-border bg-background">↓</kbd>
            navigate
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1 rounded border border-border bg-background">↵</kbd>
            open
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1 rounded border border-border bg-background">{'>'}</kbd>
            actions
          </span>
        </div>
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
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
