'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useCanvasStore } from '@/lib/designer/canvasStore';
import { loadGoogleFont } from '@/lib/designer/fontVirtualizer';

type FontCategory = 'serif' | 'sans-serif' | 'display' | 'handwriting' | 'monospace';

interface GoogleFontEntry {
  family: string;
  category: FontCategory;
}

interface FontPickerProps {
  value: string;
  onChange: (family: string) => void;
  className?: string;
}

/**
 * Curated set of 24 popular Google Fonts. Hard-coded to keep the picker
 * snappy and predictable — no list-API roundtrip.
 */
export const GOOGLE_FONTS: GoogleFontEntry[] = [
  // Sans-serif
  { family: 'Inter', category: 'sans-serif' },
  { family: 'Roboto', category: 'sans-serif' },
  { family: 'Open Sans', category: 'sans-serif' },
  { family: 'Lato', category: 'sans-serif' },
  { family: 'Montserrat', category: 'sans-serif' },
  { family: 'Poppins', category: 'sans-serif' },
  { family: 'Source Sans Pro', category: 'sans-serif' },
  // Serif
  { family: 'Playfair Display', category: 'serif' },
  { family: 'Merriweather', category: 'serif' },
  { family: 'Lora', category: 'serif' },
  { family: 'EB Garamond', category: 'serif' },
  { family: 'Crimson Text', category: 'serif' },
  { family: 'Cormorant Garamond', category: 'serif' },
  // Display
  { family: 'Oswald', category: 'display' },
  { family: 'Bebas Neue', category: 'display' },
  { family: 'Anton', category: 'display' },
  { family: 'Archivo Black', category: 'display' },
  { family: 'Russo One', category: 'display' },
  // Handwriting
  { family: 'Caveat', category: 'handwriting' },
  { family: 'Dancing Script', category: 'handwriting' },
  { family: 'Pacifico', category: 'handwriting' },
  { family: 'Permanent Marker', category: 'handwriting' },
  // Monospace
  { family: 'Roboto Mono', category: 'monospace' },
  { family: 'Source Code Pro', category: 'monospace' },
];

const CATEGORY_ORDER: FontCategory[] = [
  'sans-serif',
  'serif',
  'display',
  'handwriting',
  'monospace',
];

const CATEGORY_LABELS: Record<FontCategory, string> = {
  'sans-serif': 'Sans-serif',
  serif: 'Serif',
  display: 'Display',
  handwriting: 'Handwriting',
  monospace: 'Monospace',
};

export default function FontPicker({ value, onChange, className = '' }: FontPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Brand fonts come from the active site's branding profile (heading +
  // body). De-dup, drop empties, and label each entry so the picker can
  // render a pinned row above the curated categories. We trust the strings
  // are Google Font names — fontVirtualizer is tolerant of unknown
  // families and just leaves them as a CSS fallback rather than erroring.
  const brandFontsRaw = useCanvasStore((s) => s.brandFonts);
  const brandFontEntries = useMemo(() => {
    const entries: Array<{ family: string; role: 'Heading' | 'Body' }> = [];
    const seen = new Set<string>();
    const push = (family: string | undefined, role: 'Heading' | 'Body') => {
      const trimmed = (family ?? '').trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      entries.push({ family: trimmed, role });
    };
    push(brandFontsRaw.heading, 'Heading');
    push(brandFontsRaw.body, 'Body');
    return entries;
  }, [brandFontsRaw]);

  // Pre-load every preview face so each option renders in its own font.
  useEffect(() => {
    if (!open) return;
    GOOGLE_FONTS.forEach((f) => {
      void loadGoogleFont({ family: f.family, category: f.category });
    });
    // Brand fonts often aren't in the curated 24 — make sure they load
    // when the customer opens the picker so the preview row renders in
    // the actual brand face instead of the fallback.
    brandFontEntries.forEach((f) => {
      void loadGoogleFont({ family: f.family, category: 'sans-serif' });
    });
  }, [open, brandFontEntries]);

  // Also make sure the currently selected font is loaded so the trigger
  // button renders correctly on mount.
  useEffect(() => {
    if (!value) return;
    const known = GOOGLE_FONTS.find((f) => f.family === value);
    if (known) void loadGoogleFont({ family: known.family, category: known.category });
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const handleSelect = async (font: GoogleFontEntry) => {
    await loadGoogleFont({ family: font.family, category: font.category });
    onChange(font.family);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border bg-background hover:bg-muted transition-colors w-full"
        aria-label="Choose font"
      >
        <span className="material-icons text-base text-muted-foreground">text_fields</span>
        <span className="text-sm text-foreground truncate" style={{ fontFamily: value || 'inherit' }}>
          {value || 'Choose font'}
        </span>
        <span className="material-icons text-base text-muted-foreground ml-auto">
          arrow_drop_down
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-72 max-h-80 overflow-y-auto p-2 rounded-md border border-border bg-background shadow-lg">
          {brandFontEntries.length > 0 && (
            <div className="mb-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-2 pt-1 pb-1 flex items-center gap-1">
                <span className="material-icons text-xs">palette</span>
                Brand
              </div>
              <div className="flex flex-col">
                {brandFontEntries.map((font) => {
                  const isActive = value === font.family;
                  return (
                    <button
                      key={`brand-${font.family}`}
                      type="button"
                      onClick={() =>
                        void handleSelect({
                          family: font.family,
                          category: 'sans-serif',
                        })
                      }
                      className={`text-left px-2 py-1.5 rounded text-sm transition-colors flex items-center gap-2 ${
                        isActive
                          ? 'bg-muted text-foreground'
                          : 'text-foreground hover:bg-muted/60'
                      }`}
                      style={{ fontFamily: font.family }}
                    >
                      <span className="flex-1 truncate">{font.family}</span>
                      <span
                        className="text-[10px] uppercase tracking-wide text-muted-foreground"
                        style={{ fontFamily: 'inherit' }}
                      >
                        {font.role}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {CATEGORY_ORDER.map((cat) => {
            const inCat = GOOGLE_FONTS.filter((f) => f.category === cat);
            if (inCat.length === 0) return null;
            return (
              <div key={cat} className="mb-2 last:mb-0">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-2 pt-1 pb-1">
                  {CATEGORY_LABELS[cat]}
                </div>
                <div className="flex flex-col">
                  {inCat.map((font) => {
                    const isActive = value === font.family;
                    return (
                      <button
                        key={font.family}
                        type="button"
                        onClick={() => void handleSelect(font)}
                        className={`text-left px-2 py-1.5 rounded text-sm transition-colors ${
                          isActive
                            ? 'bg-muted text-foreground'
                            : 'text-foreground hover:bg-muted/60'
                        }`}
                        style={{ fontFamily: font.family }}
                      >
                        {font.family}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
