'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface FontItem {
  family: string;
  category: string;
  variants: string[];
  files: Record<string, string>;
}

interface GoogleFontPickerProps {
  value: string;
  onChange: (fontFamily: string) => void;
}

// Track loaded fonts globally to avoid duplicates
const loadedFonts = new Set<string>();

function loadFontPreview(family: string, url: string) {
  if (loadedFonts.has(family)) return;
  loadedFonts.add(family);
  try {
    const font = new FontFace(family, `url(${url})`);
    font.load().then(() => document.fonts.add(font)).catch(() => {});
  } catch {}
}

export function GoogleFontPicker({ value, onChange }: GoogleFontPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [fonts, setFonts] = useState<FontItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const LIMIT = 30;

  const fetchFonts = useCallback(async (searchQuery: string, newOffset: number, append: boolean) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/google-fonts?search=${encodeURIComponent(searchQuery)}&limit=${LIMIT}&offset=${newOffset}`);
      const data = await res.json();
      if (data.success) {
        const items = data.data as FontItem[];
        setFonts(prev => append ? [...prev, ...items] : items);
        setTotal(data.pagination.total);
        setOffset(newOffset + items.length);
        // Load previews for visible fonts
        items.forEach((f) => {
          const url = f.files?.regular || f.files?.['400'] || Object.values(f.files)[0];
          if (url) loadFontPreview(f.family, url.replace('http://', 'https://'));
        });
      }
    } catch {}
    setLoading(false);
  }, []);

  // Initial load when opened
  useEffect(() => {
    if (open && fonts.length === 0) {
      fetchFonts('', 0, false);
    }
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, fetchFonts, fonts.length]);

  // Search with debounce
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setOffset(0);
      fetchFonts(search, 0, false);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, open, fetchFonts]);

  // Infinite scroll
  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || loading || offset >= total) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
      fetchFonts(search, offset, true);
    }
  }, [loading, offset, total, search, fetchFonts]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Load the currently selected font for display
  useEffect(() => {
    if (value && !loadedFonts.has(value)) {
      const link = document.createElement('link');
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(value)}&display=swap`;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
      loadedFonts.add(value);
    }
  }, [value]);

  const displayValue = value || 'Default';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between rounded border border-border bg-background px-3 py-2 text-sm text-foreground hover:border-foreground/30 transition-colors"
      >
        <span style={value ? { fontFamily: value } : undefined} className="truncate">
          {displayValue}
        </span>
        <span className="material-icons text-sm text-muted-foreground ml-1">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-card shadow-lg overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-1.5 rounded border border-border bg-background px-2 py-1.5">
              <span className="material-icons text-sm text-muted-foreground">search</span>
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search fonts..."
                className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
                  <span className="material-icons text-sm">close</span>
                </button>
              )}
            </div>
          </div>

          {/* Default option */}
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); }}
            className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors ${!value ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'}`}
          >
            Default (inherit)
          </button>

          {/* Font list */}
          <div
            ref={listRef}
            onScroll={handleScroll}
            className="max-h-64 overflow-y-auto border-t border-border"
          >
            {fonts.map((font) => (
              <button
                key={font.family}
                type="button"
                onClick={() => { onChange(font.family); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors ${value === font.family ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'}`}
              >
                <span style={{ fontFamily: font.family }} className="block truncate">
                  {font.family}
                </span>
                <span className="text-[10px] text-muted-foreground">{font.category}</span>
              </button>
            ))}
            {loading && (
              <div className="flex items-center justify-center py-3">
                <span className="material-icons text-sm text-muted-foreground animate-spin">progress_activity</span>
              </div>
            )}
            {!loading && fonts.length === 0 && (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">No fonts found</div>
            )}
          </div>

          {/* Count */}
          <div className="px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground">
            {total > 0 ? `${Math.min(offset, total)} of ${total} fonts` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
