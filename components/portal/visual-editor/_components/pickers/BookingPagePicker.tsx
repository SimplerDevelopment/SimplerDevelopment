'use client';

import { useEffect, useRef, useState } from 'react';

export function BookingPagePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [pages, setPages] = useState<Array<{ id: number; slug: string; title: string; duration: number; active: boolean }>>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/portal/tools/booking')
      .then(r => r.json())
      .then(json => { if (json.success) setPages(json.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = search
    ? pages.filter(p => p.title.toLowerCase().includes(search.toLowerCase()) || p.slug.toLowerCase().includes(search.toLowerCase()))
    : pages;

  const selected = pages.find(p => p.slug === value);

  return (
    <div ref={ref} className="relative">
      <span className="text-xs font-medium text-muted-foreground">Booking Page</span>
      {selected && !open && (
        <button type="button" onClick={() => setOpen(true)}
          className="mt-1 w-full flex items-center gap-2 rounded border border-border px-2.5 py-1.5 text-sm text-left hover:border-primary transition-colors">
          <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="material-icons text-sm text-primary">calendar_month</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="truncate font-medium">{selected.title}</div>
            <div className="text-xs text-muted-foreground">{selected.slug} &middot; {selected.duration}min</div>
          </div>
          <span className="material-icons text-sm text-muted-foreground">unfold_more</span>
        </button>
      )}
      {(!selected || open) && (
        <input type="text" value={open ? search : value || ''}
          onChange={(e) => { setSearch(e.target.value); if (!open) onChange(e.target.value); }}
          onFocus={() => setOpen(true)}
          placeholder={loading ? 'Loading...' : 'Search booking pages...'}
          className="mt-1 block w-full rounded border border-border px-2.5 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary" />
      )}
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          {!selected && (
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search booking pages..." autoFocus
              className="sticky top-0 w-full border-b border-border px-3 py-2 text-sm bg-card focus:outline-none" />
          )}
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              {loading ? 'Loading...' : pages.length === 0 ? 'No booking pages found' : 'No matches'}
            </div>
          ) : (
            filtered.map(p => (
              <button key={p.slug} type="button"
                onClick={() => { onChange(p.slug); setOpen(false); setSearch(''); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-primary/5 transition-colors ${p.slug === value ? 'bg-primary/10' : ''}`}>
                <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="material-icons text-sm text-primary">calendar_month</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate">{p.title}</div>
                  <div className="text-xs text-muted-foreground">{p.slug} &middot; {p.duration}min {!p.active && <span className="text-amber-500">(inactive)</span>}</div>
                </div>
                {p.slug === value && <span className="material-icons text-primary text-sm">check</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
