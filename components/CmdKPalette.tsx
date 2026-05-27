'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { buildPortalNavItems, flattenPortalNav, type PortalNavTarget } from '@/lib/portal-nav';
import type { UserAppNavMeta } from '@/lib/plugins/load-user-apps';

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

interface CreateAction {
  id: string;
  label: string;
  description: string;
  icon: string;
  tone?: string;
  href: string;
}

// Quick-create / quick-jump actions that are not just plain navigation —
// these stay above the long nav list so power users can hit them fast.
const CREATE_ACTIONS: CreateAction[] = [
  {
    id: 'new-knowledge-note',
    label: 'New knowledge note',
    description: 'Create a knowledge note',
    icon: 'note_add',
    tone: 'text-amber-600 dark:text-amber-400',
    href: '/portal/brain/knowledge?new=1',
  },
  {
    id: 'new-survey',
    label: 'New survey',
    description: 'Start a survey',
    icon: 'add_circle',
    tone: 'text-foreground',
    href: '/portal/surveys/new',
  },
  {
    id: 'new-pitch-deck',
    label: 'New pitch deck',
    description: 'Start a deck',
    icon: 'add_to_queue',
    tone: 'text-foreground',
    href: '/portal/tools/pitch-decks?new=1',
  },
];

type Item =
  | { kind: 'create'; action: CreateAction; score: number }
  | { kind: 'nav'; target: PortalNavTarget; score: number }
  | { kind: 'hit'; hit: BrainSearchHit };

const MAX_NAV_RESULTS = 8;

/**
 * Score a haystack against a query: each query token must appear in the
 * haystack. Returns a positive score (higher = better match) or -1 to drop.
 * Boosts: prefix match on the last segment of the haystack (the label),
 * exact label match, and contiguous run.
 */
function scoreMatch(haystack: string, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  let score = 0;
  for (const tok of queryTokens) {
    const idx = haystack.indexOf(tok);
    if (idx < 0) return -1;
    // Earlier-in-haystack matches score slightly higher.
    score += Math.max(0, 100 - idx);
  }
  // Bonus for contiguous run of all tokens joined by spaces.
  if (haystack.includes(queryTokens.join(' '))) score += 200;
  return score;
}

interface CmdKPaletteProps {
  /** Plugin apps the active client is entitled to see. Forwarded into
   *  `buildPortalNavItems` so the palette picks up the "Apps" group + each
   *  plugin's manifest nav items as searchable jump targets. */
  apps?: UserAppNavMeta[];
  /** Controlled-mode open state. When provided alongside `onClose`, the
   *  palette is fully controlled by the parent (typically `CmdKLauncher`,
   *  which owns the Cmd-K hotkey listener and keeps this module lazy until
   *  first open). When omitted, the palette falls back to uncontrolled mode
   *  and registers its own hotkey listener — useful for stand-alone use and
   *  the existing unit-test suite. */
  open?: boolean;
  onClose?: () => void;
}

export default function CmdKPalette({ apps, open: controlledOpen, onClose }: CmdKPaletteProps = {}) {
  // Uncontrolled fallback — only used when the palette is rendered without
  // an explicit `open` prop (legacy callers + unit tests). In the production
  // portal path the launcher passes `open` and we ignore this state.
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = isControlled
    ? (next: boolean | ((prev: boolean) => boolean)) => {
        const value = typeof next === 'function' ? next(open) : next;
        if (!value) onClose?.();
      }
    : setUncontrolledOpen;

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<BrainSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeSiteName, setActiveSiteName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Detect active site from URL (mirror the sidebar's logic) so per-site
  // pages show up when the user is inside `/portal/websites/[id]/...`.
  const cmsMatch = pathname?.match(/^\/portal\/websites\/(\d+)(\/|$)/);
  const activeSiteId = cmsMatch ? cmsMatch[1] : null;

  useEffect(() => {
    if (!activeSiteId) { setActiveSiteName(null); return; }
    fetch('/api/portal/cms/websites')
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          const site = res.data.find((s: { id: number }) => String(s.id) === activeSiteId);
          setActiveSiteName(site?.name ?? null);
        }
      })
      .catch(() => {});
  }, [activeSiteId]);

  // Flatten the nav tree once per (site) change. The palette only needs the
  // flat target list with breadcrumbs + haystack — the tree shape is the
  // sidebar's concern.
  const navTargets = useMemo<PortalNavTarget[]>(() => {
    return flattenPortalNav(buildPortalNavItems(activeSiteId, activeSiteName, apps));
  }, [activeSiteId, activeSiteName, apps]);

  // Global Cmd+K / Ctrl+K listener — only registered when the palette is
  // *uncontrolled*. In the production portal path the parent `CmdKLauncher`
  // owns the hotkey so this module can stay lazy until first open.
  useEffect(() => {
    if (isControlled) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        e.stopPropagation();
        setUncontrolledOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isControlled]);

  // Reset state when opening / closing.
  useEffect(() => {
    if (open) {
      setQuery('');
      setHits([]);
      setSelectedIndex(0);
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
          `/api/portal/brain/search?q=${encodeURIComponent(trimmed)}&limit=12`,
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

  const items = useMemo<Item[]>(() => {
    const trimmed = query.trim().toLowerCase();
    const tokens = trimmed.split(/\s+/).filter(Boolean);

    // Score creates and nav targets. With no query, show a curated default
    // list (creates first, then top-level pages) so the palette never feels
    // empty on first open.
    let createItems: Item[];
    let navItems: Item[];

    if (tokens.length === 0) {
      createItems = CREATE_ACTIONS.map((a) => ({ kind: 'create', action: a, score: 0 }));
      navItems = navTargets
        .filter((t) => t.breadcrumb.length === 0)
        .slice(0, MAX_NAV_RESULTS)
        .map((t) => ({ kind: 'nav', target: t, score: 0 }));
    } else {
      createItems = CREATE_ACTIONS
        .map((a) => {
          const haystack = `${a.label} ${a.description}`.toLowerCase();
          return { action: a, score: scoreMatch(haystack, tokens) };
        })
        .filter((x) => x.score >= 0)
        .map((x) => ({ kind: 'create' as const, action: x.action, score: x.score }));

      navItems = navTargets
        .map((t) => ({ target: t, score: scoreMatch(t.haystack, tokens) }))
        .filter((x) => x.score >= 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_NAV_RESULTS)
        .map((x) => ({ kind: 'nav' as const, target: x.target, score: x.score }));
    }

    const hitItems: Item[] = hits.map((hit) => ({ kind: 'hit', hit }));
    return [...createItems, ...navItems, ...hitItems];
  }, [query, navTargets, hits]);

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

  const close = useCallback(() => setOpen(false), [setOpen]);

  const activate = useCallback(
    (item: Item) => {
      const url = item.kind === 'create'
        ? item.action.href
        : item.kind === 'nav'
          ? item.target.href
          : item.hit.url;
      close();
      router.push(url);
    },
    [close, router],
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
  const showEmptyHint = !trimmedQuery && items.length === 0;
  const noResults = trimmedQuery && !loading && items.length === 0;

  // Group items for section headers.
  const grouped: Array<{ kind: Item['kind']; title: string; items: { item: Item; index: number }[] }> = [];
  items.forEach((item, index) => {
    const last = grouped[grouped.length - 1];
    if (last && last.kind === item.kind) {
      last.items.push({ item, index });
    } else {
      const title =
        item.kind === 'create' ? 'Create' :
        item.kind === 'nav' ? (trimmedQuery ? 'Navigate' : 'Quick access') :
        'Search results';
      grouped.push({ kind: item.kind, title, items: [{ item, index }] });
    }
  });

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
            placeholder="Jump to a page, search notes, contacts, deals…"
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
          {grouped.map((group) => (
            <div key={group.kind + group.title}>
              <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                {group.title}
              </div>
              <ul className="text-sm">
                {group.items.map(({ item, index }) => {
                  const isSelected = index === selectedIndex;

                  if (item.kind === 'create') {
                    const a = item.action;
                    return (
                      <li key={`create-${a.id}`}>
                        <button
                          type="button"
                          data-cmdk-index={index}
                          onMouseEnter={() => setSelectedIndex(index)}
                          onClick={() => activate(item)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            isSelected ? 'bg-muted' : 'hover:bg-muted/60'
                          }`}
                        >
                          <span className={`material-icons text-xl ${a.tone ?? 'text-foreground'}`}>{a.icon}</span>
                          <span className="flex-1 min-w-0">
                            <span className="block truncate text-foreground">{a.label}</span>
                            <span className="block truncate text-xs text-muted-foreground">{a.description}</span>
                          </span>
                        </button>
                      </li>
                    );
                  }

                  if (item.kind === 'nav') {
                    const t = item.target;
                    return (
                      <li key={`nav-${t.href}`}>
                        <button
                          type="button"
                          data-cmdk-index={index}
                          onMouseEnter={() => setSelectedIndex(index)}
                          onClick={() => activate(item)}
                          className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                            isSelected ? 'bg-muted' : 'hover:bg-muted/60'
                          }`}
                        >
                          <span className="material-icons text-xl text-muted-foreground shrink-0">{t.icon}</span>
                          <span className="flex-1 min-w-0">
                            <span className="block truncate text-foreground">{t.label}</span>
                            {t.breadcrumb.length > 0 && (
                              <span className="block truncate text-xs text-muted-foreground">
                                {t.breadcrumb.join(' / ')}
                              </span>
                            )}
                          </span>
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium shrink-0">
                            Page
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
                        {hit.contextName && (
                          <span className="text-[10px] text-muted-foreground truncate max-w-[140px] shrink-0 self-center">
                            {hit.contextName}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {noResults && (
            <div className="px-4 py-8 text-center">
              <span className="material-icons text-3xl text-muted-foreground mb-2 block">
                search_off
              </span>
              <p className="text-sm text-muted-foreground">No matches. Try different words.</p>
            </div>
          )}

          {showEmptyHint && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Type to jump to any page, or search notes, meetings, CRM…
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
