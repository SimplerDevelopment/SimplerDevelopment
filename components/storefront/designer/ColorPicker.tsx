'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
  className?: string;
}

/**
 * 40-swatch default palette: 5 rows of 8.
 * Row 1 — neutrals (black/white/greys), Rows 2-5 — branded reds/oranges/
 * yellows/greens/teals/blues/purples/pinks across light/mid/deep tints so
 * customers can pick on-brand colors without leaving the popover.
 */
export const DEFAULT_SWATCHES: string[] = [
  // Row 1 — neutrals
  '#000000', '#1F2937', '#374151', '#6B7280', '#9CA3AF', '#D1D5DB', '#F3F4F6', '#FFFFFF',
  // Row 2 — reds & oranges
  '#7F1D1D', '#DC2626', '#EF4444', '#F87171', '#9A3412', '#EA580C', '#F97316', '#FB923C',
  // Row 3 — yellows & greens
  '#A16207', '#EAB308', '#FACC15', '#FDE047', '#166534', '#16A34A', '#22C55E', '#86EFAC',
  // Row 4 — teals & blues
  '#115E59', '#0D9488', '#14B8A6', '#5EEAD4', '#1E3A8A', '#2563EB', '#3B82F6', '#93C5FD',
  // Row 5 — purples & pinks
  '#581C87', '#7C3AED', '#A855F7', '#D8B4FE', '#9D174D', '#DB2777', '#EC4899', '#F9A8D4',
];

const RECENT_KEY = 'designer:recentColors';
const MAX_RECENT = 8;
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

function readRecent(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === 'string' && HEX_RE.test(x))
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function writeRecent(list: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {
    // localStorage may be unavailable (Safari private mode, etc.) — ignore.
  }
}

function normalizeHex(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (!HEX_RE.test(withHash)) return null;
  return withHash.toLowerCase();
}

export default function ColorPicker({
  value,
  onChange,
  label,
  className = '',
}: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState(value);
  const [recent, setRecent] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHexDraft(value);
  }, [value]);

  useEffect(() => {
    if (open) setRecent(readRecent());
  }, [open]);

  // Outside-click close.
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

  const commit = useCallback(
    (hex: string) => {
      const normalized = normalizeHex(hex);
      if (!normalized) return;
      onChange(normalized);
      // Push onto recents (de-duped, MRU).
      const next = [normalized, ...recent.filter((c) => c.toLowerCase() !== normalized)].slice(
        0,
        MAX_RECENT
      );
      setRecent(next);
      writeRecent(next);
    },
    [onChange, recent]
  );

  const swatchRows = useMemo(() => {
    const rows: string[][] = [];
    for (let i = 0; i < DEFAULT_SWATCHES.length; i += 8) {
      rows.push(DEFAULT_SWATCHES.slice(i, i + 8));
    }
    return rows;
  }, []);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {label && (
        <label className="block text-xs font-medium text-foreground mb-1">{label}</label>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border bg-background hover:bg-muted transition-colors w-full"
        aria-label="Choose color"
      >
        <span
          className="block w-6 h-6 rounded border border-border shrink-0"
          style={{ backgroundColor: value }}
        />
        <span className="text-sm text-foreground font-mono uppercase">{value}</span>
        <span className="material-icons text-base text-muted-foreground ml-auto">
          arrow_drop_down
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-64 p-3 rounded-md border border-border bg-background shadow-lg space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={HEX_RE.test(value) ? value : '#000000'}
              onChange={(e) => {
                setHexDraft(e.target.value);
                commit(e.target.value);
              }}
              className="w-10 h-8 rounded border border-border cursor-pointer p-0"
              aria-label="Pick custom color"
            />
            <input
              type="text"
              value={hexDraft}
              maxLength={7}
              onChange={(e) => {
                const v = e.target.value;
                setHexDraft(v);
                const normalized = normalizeHex(v);
                if (normalized) commit(normalized);
              }}
              placeholder="#000000"
              className="flex-1 px-2 py-1 text-sm font-mono uppercase rounded-md border border-border bg-background text-foreground"
            />
          </div>

          <div>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Swatches</div>
            <div className="space-y-1">
              {swatchRows.map((row, ri) => (
                <div key={ri} className="flex gap-1">
                  {row.map((hex) => {
                    const isActive = value.toLowerCase() === hex.toLowerCase();
                    return (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => commit(hex)}
                        title={hex}
                        className={`w-6 h-6 rounded border transition-shadow ${
                          isActive
                            ? 'border-foreground ring-2 ring-foreground/40'
                            : 'border-border hover:ring-2 hover:ring-foreground/20'
                        }`}
                        style={{ backgroundColor: hex }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {recent.length > 0 && (
            <div>
              <div className="text-[10px] uppercase text-muted-foreground mb-1">Recent</div>
              <div className="flex gap-1">
                {recent.map((hex) => {
                  const isActive = value.toLowerCase() === hex.toLowerCase();
                  return (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => commit(hex)}
                      title={hex}
                      className={`w-6 h-6 rounded border transition-shadow ${
                        isActive
                          ? 'border-foreground ring-2 ring-foreground/40'
                          : 'border-border hover:ring-2 hover:ring-foreground/20'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
