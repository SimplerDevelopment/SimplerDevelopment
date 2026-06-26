'use client';

import { useEffect, useRef, useState } from 'react';

export function ProductSlugPicker({ siteId, value, onChange }: { siteId?: number; value: string; onChange: (v: string) => void }) {
  const [products, setProducts] = useState<Array<{ slug: string; name: string; image: string | null; price: number }>>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!siteId) return;
    setLoading(true);
    fetch(`/api/portal/websites/${siteId}/store/products?limit=100`)
      .then(r => r.json())
      .then(json => { if (json.success) setProducts(json.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [siteId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = search
    ? products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.slug.toLowerCase().includes(search.toLowerCase()))
    : products;

  const selected = products.find(p => p.slug === value);

  return (
    <div ref={ref} className="relative">
      <span className="text-xs font-medium text-muted-foreground">Product</span>
      {/* Selected product display */}
      {selected && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-1 w-full flex items-center gap-2 rounded border border-border px-2.5 py-1.5 text-sm text-left hover:border-primary transition-colors"
        >
          {selected.image && (
            <img src={selected.image} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="truncate font-medium">{selected.name}</div>
            <div className="text-xs text-muted-foreground">{selected.slug}</div>
          </div>
          <span className="material-icons text-sm text-muted-foreground">unfold_more</span>
        </button>
      )}
      {/* Search input */}
      {(!selected || open) && (
        <input
          type="text"
          value={open ? search : value || ''}
          onChange={(e) => { setSearch(e.target.value); if (!open) { onChange(e.target.value); } }}
          onFocus={() => setOpen(true)}
          placeholder={loading ? 'Loading products...' : 'Search products...'}
          className="mt-1 block w-full rounded border border-border px-2.5 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
        />
      )}
      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          {open && !selected && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              autoFocus
              className="sticky top-0 w-full border-b border-border px-3 py-2 text-sm bg-card focus:outline-none"
            />
          )}
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              {loading ? 'Loading...' : products.length === 0 ? 'No products in store' : 'No matches'}
            </div>
          ) : (
            filtered.map(p => (
              <button
                key={p.slug}
                type="button"
                onClick={() => { onChange(p.slug); setOpen(false); setSearch(''); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-primary/5 transition-colors ${p.slug === value ? 'bg-primary/10' : ''}`}
              >
                {p.image ? (
                  <img src={p.image} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded bg-muted/20 flex items-center justify-center flex-shrink-0">
                    <span className="material-icons text-xs text-muted-foreground">inventory_2</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.slug}</div>
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
