'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { flattenNav, type FlatNavEntry } from '@/lib/admin/nav';

interface Action {
  id: string;
  label: string;
  icon: string;
  group: string;
  run: () => void;
}

/**
 * ⌘K command palette. Opens on ⌘K / Ctrl+K or the `admin:openCommandPalette`
 * window event (dispatched by the topbar search button). Navigates to any nav
 * destination; fully keyboard-driven (↑/↓/↵/esc).
 */
export default function CommandPalette({ onToggleTheme }: { onToggleTheme: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);

  const show = useCallback(() => { setQuery(''); setSel(0); openRef.current = true; setOpen(true); }, []);
  const hide = useCallback(() => { openRef.current = false; setOpen(false); }, []);

  const actions = useMemo<Action[]>(() => {
    const nav: Action[] = flattenNav().map((e: FlatNavEntry) => ({
      id: e.href,
      label: e.label,
      icon: e.icon,
      group: e.section,
      run: () => router.push(e.href),
    }));
    return [
      ...nav,
      { id: 'action:new-client', label: 'New client', icon: 'add', group: 'Actions', run: () => router.push('/admin/clients') },
      { id: 'action:new-invoice', label: 'New invoice', icon: 'add', group: 'Actions', run: () => router.push('/admin/portal-invoices/new') },
      { id: 'action:toggle-theme', label: 'Toggle theme', icon: 'contrast', group: 'Actions', run: onToggleTheme },
    ];
  }, [router, onToggleTheme]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter(a => a.label.toLowerCase().includes(q) || a.group.toLowerCase().includes(q));
  }, [query, actions]);

  // Group results in stable order while preserving the filtered set.
  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, Action[]>();
    for (const a of results) {
      if (!map.has(a.group)) { map.set(a.group, []); order.push(a.group); }
      map.get(a.group)!.push(a);
    }
    return order.map(g => ({ group: g, items: map.get(g)! }));
  }, [results]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (openRef.current) hide(); else show();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('admin:openCommandPalette', show);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('admin:openCommandPalette', show);
    };
  }, [show, hide]);

  // Focus the input when the palette opens (DOM side-effect only).
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const choose = (a: Action) => { hide(); a.run(); };

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { hide(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[sel]) choose(results[sel]); }
  };

  useEffect(() => {
    listRef.current?.querySelector('[data-sel="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!open) return null;

  let flatIdx = -1;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] bg-black/45"
      style={{ backdropFilter: 'blur(2px)' }}
      onClick={hide}
    >
      <div
        className="w-[min(620px,92vw)] bg-popover text-popover-foreground border border-[var(--admin-border-strong)] rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onListKey}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
          <span className="material-icons text-muted-foreground text-xl">search</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSel(0); }}
            placeholder="Jump to a page, client, or action…"
            className="flex-1 bg-transparent outline-none text-foreground text-base placeholder:text-muted-foreground/70"
          />
          <kbd className="font-mono text-[11px] px-1.5 py-px rounded border border-border bg-[var(--admin-surface-2)] text-muted-foreground">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {groups.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">No matches for “{query}”.</div>
          )}
          {groups.map(({ group, items }) => (
            <div key={group}>
              <div className="px-2.5 pt-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">{group}</div>
              {items.map((a) => {
                flatIdx += 1;
                const selected = flatIdx === sel;
                const idx = flatIdx;
                return (
                  <button
                    key={a.id}
                    data-sel={selected}
                    onMouseEnter={() => setSel(idx)}
                    onClick={() => choose(a)}
                    className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-[13.5px] text-left ${
                      selected ? 'bg-accent text-foreground' : 'text-foreground/90'
                    }`}
                  >
                    <span className={`material-icons text-[18px] ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>{a.icon}</span>
                    <span className="flex-1 truncate">{a.label}</span>
                    {selected && <span className="material-icons text-[15px] text-muted-foreground">subdirectory_arrow_left</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-border text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><kbd className="font-mono px-1 rounded border border-border bg-[var(--admin-surface-2)]">↑↓</kbd> navigate</span>
          <span className="flex items-center gap-1.5"><kbd className="font-mono px-1 rounded border border-border bg-[var(--admin-surface-2)]">↵</kbd> open</span>
          <span className="ml-auto">SimplerDev Admin</span>
        </div>
      </div>
    </div>
  );
}
