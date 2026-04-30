'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';

type EntityType =
  | 'meeting'
  | 'note'
  | 'task'
  | 'relationship'
  | 'company'
  | 'contact'
  | 'deal'
  | 'post';

interface BrainSearchHit {
  type: EntityType;
  id: number;
  title: string;
  snippet: string;
  score: number;
  status?: string;
  occurredAt?: string;
  contextName?: string;
  url: string;
}

interface BrainSearchResponse {
  success?: boolean;
  data?: { query: string; total: number; hits: BrainSearchHit[] };
  query?: string;
  total?: number;
  hits?: BrainSearchHit[];
}

// Keep visual choices in sync with app/portal/brain/ask/page.tsx
const TYPE_META: Record<EntityType, { label: string; icon: string; tone: string }> = {
  meeting:      { label: 'Meeting',      icon: 'forum',          tone: 'text-blue-600 dark:text-blue-400' },
  note:         { label: 'Knowledge',    icon: 'sticky_note_2',  tone: 'text-amber-600 dark:text-amber-400' },
  task:         { label: 'Task',         icon: 'task_alt',       tone: 'text-foreground' },
  relationship: { label: 'Relationship', icon: 'group_work',     tone: 'text-cyan-600 dark:text-cyan-400' },
  company:      { label: 'Company',      icon: 'business',       tone: 'text-emerald-600 dark:text-emerald-400' },
  contact:      { label: 'Contact',      icon: 'person',         tone: 'text-rose-600 dark:text-rose-400' },
  deal:         { label: 'Deal',         icon: 'handshake',      tone: 'text-violet-600 dark:text-violet-400' },
  post:         { label: 'Page',         icon: 'web',            tone: 'text-sky-600 dark:text-sky-400' },
};

interface ActionCommand {
  id: string;
  label: string;
  description?: string;
  icon: string;
  tone?: string;
  /** Resolves the destination URL given the current typed query. */
  resolve: (q: string) => string;
}

const ACTION_COMMANDS: ActionCommand[] = [
  {
    id: 'new-knowledge-note',
    label: 'New knowledge note',
    description: 'Create a knowledge note',
    icon: 'note_add',
    tone: 'text-amber-600 dark:text-amber-400',
    resolve: () => '/portal/brain/knowledge?new=1',
  },
  {
    id: 'search-brain',
    label: 'Search Brain',
    description: 'Ask Brain across all entities',
    icon: 'travel_explore',
    tone: 'text-primary',
    resolve: (q) => (q ? `/portal/brain/ask?q=${encodeURIComponent(q)}` : '/portal/brain/ask'),
  },
  {
    id: 'open-dashboard',
    label: 'Open dashboard',
    description: 'Brain dashboard',
    icon: 'dashboard',
    tone: 'text-foreground',
    resolve: () => '/portal/brain',
  },
  {
    id: 'open-knowledge',
    label: 'Open knowledge',
    description: 'Knowledge notes',
    icon: 'sticky_note_2',
    tone: 'text-amber-600 dark:text-amber-400',
    resolve: () => '/portal/brain/knowledge',
  },
  {
    id: 'open-meetings',
    label: 'Open meetings',
    description: 'Meeting notes & recordings',
    icon: 'forum',
    tone: 'text-blue-600 dark:text-blue-400',
    resolve: () => '/portal/brain/meetings',
  },
  {
    id: 'open-relationships',
    label: 'Open relationships',
    description: 'Relationship graph',
    icon: 'group_work',
    tone: 'text-cyan-600 dark:text-cyan-400',
    resolve: () => '/portal/brain/relationships',
  },
  {
    id: 'open-crm-contacts',
    label: 'Open CRM contacts',
    description: 'CRM · Contacts',
    icon: 'person',
    tone: 'text-rose-600 dark:text-rose-400',
    resolve: () => '/portal/crm/contacts',
  },
  {
    id: 'open-crm-companies',
    label: 'Open CRM companies',
    description: 'CRM · Companies',
    icon: 'business',
    tone: 'text-emerald-600 dark:text-emerald-400',
    resolve: () => '/portal/crm/companies',
  },
  {
    id: 'open-crm-deals',
    label: 'Open CRM deals',
    description: 'CRM · Deals',
    icon: 'handshake',
    tone: 'text-violet-600 dark:text-violet-400',
    resolve: () => '/portal/crm/deals',
  },
];

type Item =
  | { kind: 'action'; cmd: ActionCommand }
  | { kind: 'hit'; hit: BrainSearchHit };

const MAX_INLINE_ACTIONS = 7;

export default function CmdKPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<BrainSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Global Cmd+K / Ctrl+K listener — toggles open. Cmd+K is not a typing key
  // so it is safe to capture even when an input/textarea is focused (matches
  // Linear/Raycast behavior).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        e.stopPropagation();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Reset state when opening / closing.
  useEffect(() => {
    if (open) {
      setQuery('');
      setHits([]);
      setSelectedIndex(0);
      // Slight delay so the autoFocus on the input plays nicely with mount.
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  // Debounced brain search.
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/portal/brain/search?q=${encodeURIComponent(trimmed)}&limit=15`,
          { signal: ctrl.signal, credentials: 'same-origin' },
        );
        if (!res.ok) {
          setHits([]);
          return;
        }
        const json: BrainSearchResponse = await res.json();
        const payload = json.data ?? json;
        setHits(Array.isArray(payload?.hits) ? payload.hits! : []);
      } catch {
        // Aborted or network error — silently ignore.
      } finally {
        setLoading(false);
      }
    }, 100);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, open]);

  // Filter actions by case-insensitive substring match on the label.
  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ACTION_COMMANDS;
    return ACTION_COMMANDS.filter((c) => c.label.toLowerCase().includes(q));
  }, [query]);

  const items = useMemo<Item[]>(() => {
    const inlineActions = filteredActions.slice(0, MAX_INLINE_ACTIONS);
    const actionItems: Item[] = inlineActions.map((cmd) => ({ kind: 'action', cmd }));
    const hitItems: Item[] = hits.map((hit) => ({ kind: 'hit', hit }));
    return [...actionItems, ...hitItems];
  }, [filteredActions, hits]);

  // Keep selection within bounds when items change.
  useEffect(() => {
    if (selectedIndex >= items.length) {
      setSelectedIndex(items.length === 0 ? 0 : items.length - 1);
    }
  }, [items.length, selectedIndex]);

  // Reset selection to top when the query changes.
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const close = useCallback(() => setOpen(false), []);

  const activate = useCallback(
    (item: Item) => {
      const url = item.kind === 'action' ? item.cmd.resolve(query.trim()) : item.hit.url;
      close();
      router.push(url);
    },
    [close, query, router],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(items.length - 1, i + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const target = items[selectedIndex];
        if (target) activate(target);
        return;
      }
    },
    [activate, close, items, selectedIndex],
  );

  // Scroll the selected row into view.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-cmdk-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, open]);

  if (!open) return null;

  const trimmedQuery = query.trim();
  const showEmptyHint = !trimmedQuery && hits.length === 0;
  const noResults = trimmedQuery && !loading && items.length === 0;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center px-4"
      style={{ paddingTop: 80 }}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onMouseDown={close}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-[640px] bg-background border border-border rounded-xl shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <span className="material-icons text-muted-foreground text-xl">search</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search notes, contacts, companies, deals…"
            className="flex-1 bg-transparent outline-none text-base text-foreground placeholder:text-muted-foreground"
            autoFocus
            spellCheck={false}
            autoComplete="off"
          />
          {loading && (
            <span className="material-icons animate-spin text-muted-foreground text-base">
              progress_activity
            </span>
          )}
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border border-border text-[10px] text-muted-foreground font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-1">
          {items.length > 0 && (
            <ul className="text-sm">
              {items.map((item, index) => {
                const isSelected = index === selectedIndex;
                if (item.kind === 'action') {
                  const cmd = item.cmd;
                  return (
                    <li key={`action-${cmd.id}`}>
                      <button
                        type="button"
                        data-cmdk-index={index}
                        onMouseEnter={() => setSelectedIndex(index)}
                        onClick={() => activate(item)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          isSelected ? 'bg-muted' : 'hover:bg-muted/60'
                        }`}
                      >
                        <span className={`material-icons text-xl ${cmd.tone ?? 'text-foreground'}`}>
                          {cmd.icon}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block truncate text-foreground">{cmd.label}</span>
                          {cmd.description && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {cmd.description}
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                          Action
                        </span>
                      </button>
                    </li>
                  );
                }
                const hit = item.hit;
                const meta = TYPE_META[hit.type];
                return (
                  <li key={`hit-${hit.type}-${hit.id}`}>
                    <button
                      type="button"
                      data-cmdk-index={index}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => activate(item)}
                      className={`w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                        isSelected ? 'bg-muted' : 'hover:bg-muted/60'
                      }`}
                    >
                      <span className={`material-icons text-xl mt-0.5 ${meta.tone}`}>{meta.icon}</span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-foreground">{hit.title}</span>
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium shrink-0">
                            {meta.label}
                          </span>
                        </span>
                        {hit.snippet && (
                          <span className="block text-xs text-muted-foreground line-clamp-1">
                            {hit.snippet}
                          </span>
                        )}
                      </span>
                      <span className="flex flex-col items-end gap-0.5 shrink-0 self-center">
                        {hit.contextName && (
                          <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                            {hit.contextName}
                          </span>
                        )}
                        {typeof hit.score === 'number' && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {hit.score.toFixed(2)}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {noResults && (
            <div className="px-4 py-8 text-center">
              <span className="material-icons text-3xl text-muted-foreground mb-2 block">
                search_off
              </span>
              <p className="text-sm text-muted-foreground">No matches. Try different words.</p>
            </div>
          )}

          {showEmptyHint && items.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Type to search across notes, meetings, CRM…
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-border bg-muted/30 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded border border-border bg-background font-mono">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded border border-border bg-background font-mono">↵</kbd>
              open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded border border-border bg-background font-mono">esc</kbd>
              close
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded border border-border bg-background font-mono">⌘K</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}
