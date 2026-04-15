'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useDesignTokens } from '@/contexts/DesignTokensContext';
import { isBrandSentinel, listSentinels, resolveBrandSentinel, getSentinelLabel } from '@/lib/branding/sentinel';

interface TokenColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}

/** Parse any CSS color string into { r, g, b, a } (0-255 for rgb, 0-1 for a) */
function parseColor(color: string): { r: number; g: number; b: number; a: number } {
  if (!color) return { r: 255, g: 255, b: 255, a: 1 };

  // rgba(r, g, b, a)
  const rgbaMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (rgbaMatch) {
    return { r: +rgbaMatch[1], g: +rgbaMatch[2], b: +rgbaMatch[3], a: rgbaMatch[4] !== undefined ? +rgbaMatch[4] : 1 };
  }

  // #rrggbbaa or #rrggbb or #rgba or #rgb
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2] + 'ff';
    if (hex.length === 4) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    if (hex.length === 6) hex = hex + 'ff';
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = parseInt(hex.slice(6, 8), 16) / 255;
    return { r, g, b, a: Math.round(a * 100) / 100 };
  }

  return { r: 255, g: 255, b: 255, a: 1 };
}

function toRgba(r: number, g: number, b: number, a: number): string {
  if (a >= 1) return `#${hex(r)}${hex(g)}${hex(b)}`;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function hex(n: number): string {
  return n.toString(16).padStart(2, '0');
}

const BRAND_COLOR_SENTINELS = listSentinels('color');

export function TokenColorPicker({ value, onChange, label, placeholder = 'transparent' }: TokenColorPickerProps) {
  const { tokens } = useDesignTokens();
  const [showSwatches, setShowSwatches] = useState(false);
  const [showAlpha, setShowAlpha] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const sentinelLabel = getSentinelLabel(value);
  const isSentinel = sentinelLabel !== null;

  // For parsing/rendering the picker: use the raw value if it's a real color,
  // else fall back to white (the alpha panel is hidden when sentinel anyway).
  const parsed = parseColor(isSentinel ? '#ffffff' : value);
  const alpha = parsed.a;
  const colorHex6 = `#${hex(parsed.r)}${hex(parsed.g)}${hex(parsed.b)}`;

  // Close panel on outside click
  useEffect(() => {
    if (!showAlpha) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowAlpha(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAlpha]);

  const handleColorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { r, g, b } = parseColor(e.target.value);
    onChange(toRgba(r, g, b, alpha));
  }, [alpha, onChange]);

  const handleAlphaChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newAlpha = +e.target.value / 100;
    onChange(toRgba(parsed.r, parsed.g, parsed.b, Math.round(newAlpha * 100) / 100));
  }, [parsed.r, parsed.g, parsed.b, onChange]);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  }, [onChange]);

  // Preview background — sentinel values resolve to CSS var, others render literal
  const swatchBackground = isSentinel ? resolveBrandSentinel(value) : value || 'transparent';

  // Checkerboard background for transparency preview
  const checkerBg = 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%)';

  return (
    <div ref={panelRef} data-testid="token-color-picker">
      {label && <label className="block text-xs text-muted-foreground mb-1.5">{label}</label>}
      <div className="flex gap-2">
        {/* Color swatch button — shows actual color with alpha over checkerboard */}
        <button
          type="button"
          onClick={() => setShowAlpha(!showAlpha)}
          className="w-10 h-9 rounded border border-border cursor-pointer flex-shrink-0 relative overflow-hidden"
          title={`${value || 'transparent'} — click for opacity`}
          data-testid="token-color-swatch"
        >
          <div
            className="absolute inset-0"
            style={{ background: checkerBg, backgroundSize: '8px 8px', backgroundPosition: '0 0, 4px 4px' }}
          />
          <div className="absolute inset-0" style={{ background: swatchBackground }} />
        </button>

        {isSentinel ? (
          // When current value is a brand sentinel, show a pill instead of the raw text input
          <div
            className="flex-1 flex items-center gap-2 text-sm rounded border border-primary/40 bg-primary/5 px-3 py-1.5"
            data-testid="brand-sentinel-pill"
            data-sentinel={value}
          >
            <span className="inline-block w-2 h-2 rounded-full bg-primary" />
            <span className="text-primary font-medium">{sentinelLabel}</span>
            <button
              type="button"
              onClick={() => onChange('')}
              className="ml-auto text-muted-foreground hover:text-foreground text-xs"
              title="Reset to default"
              data-testid="brand-sentinel-reset"
            >
              ✕
            </button>
          </div>
        ) : (
          <input
            type="text"
            value={value || ''}
            onChange={handleTextChange}
            className="flex-1 text-sm rounded border border-border bg-background px-3 py-1.5 text-foreground font-mono"
            placeholder={placeholder}
            onFocus={() => setShowSwatches(true)}
            onBlur={() => setTimeout(() => setShowSwatches(false), 200)}
            data-testid="token-color-input"
          />
        )}
      </div>

      {/* Alpha / Color panel — hidden when sentinel is active */}
      {showAlpha && !isSentinel && (
        <div className="mt-2 p-3 border border-border rounded-lg bg-background shadow-lg space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={colorHex6}
              onChange={handleColorChange}
              className="w-8 h-8 rounded border border-border cursor-pointer flex-shrink-0"
            />
            <div className="flex-1">
              <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Color</label>
              <span className="text-xs font-mono text-foreground">{colorHex6}</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Opacity</label>
              <span className="text-xs font-mono text-foreground">{Math.round(alpha * 100)}%</span>
            </div>
            <div className="relative h-6 rounded overflow-hidden border border-border">
              <div
                className="absolute inset-0"
                style={{ background: checkerBg, backgroundSize: '8px 8px', backgroundPosition: '0 0, 4px 4px' }}
              />
              <div
                className="absolute inset-0"
                style={{ background: `linear-gradient(to right, transparent, ${colorHex6})` }}
              />
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(alpha * 100)}
                onChange={handleAlphaChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div
                className="absolute top-0.5 bottom-0.5 w-3 rounded-sm border-2 border-white shadow pointer-events-none"
                style={{ left: `calc(${alpha * 100}% - 6px)`, backgroundColor: value || 'transparent' }}
              />
            </div>
          </div>

          <div className="flex gap-1">
            {[100, 75, 50, 25, 10, 0].map(pct => (
              <button
                key={pct}
                type="button"
                onClick={() => onChange(toRgba(parsed.r, parsed.g, parsed.b, pct / 100))}
                className={`flex-1 py-1 text-[10px] font-medium rounded border transition-colors ${
                  Math.round(alpha * 100) === pct
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Brand + Token Swatches popover */}
      {showSwatches && !isSentinel && (
        <div className="mt-2 p-2 border border-border rounded-lg bg-background shadow-sm space-y-2">
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1.5 px-0.5">
              Brand Tokens
            </div>
            <div className="flex flex-wrap gap-1" data-testid="brand-sentinel-swatches">
              {BRAND_COLOR_SENTINELS.map((def) => (
                <button
                  key={def.sentinel}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(def.sentinel);
                    setShowSwatches(false);
                  }}
                  className="w-6 h-6 rounded border transition-all hover:scale-110 border-border hover:border-foreground/30 relative overflow-hidden"
                  style={{ background: `var(${def.cssVar})` }}
                  title={def.label}
                  data-sentinel={def.sentinel}
                />
              ))}
            </div>
          </div>
          {tokens.colors.length > 0 && (
            <div className="pt-2 border-t border-border">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1.5 px-0.5">Design Tokens</div>
              <div className="flex flex-wrap gap-1">
                {tokens.colors.map((token, i) => (
                  <button
                    key={i}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(token.value);
                      setShowSwatches(false);
                    }}
                    className={`w-6 h-6 rounded border transition-all hover:scale-110 ${
                      value === token.value
                        ? 'border-primary ring-2 ring-primary/30'
                        : 'border-border hover:border-foreground/30'
                    }`}
                    style={{ backgroundColor: token.value }}
                    title={`${token.name} (${token.value})`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
