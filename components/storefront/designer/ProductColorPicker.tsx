'use client';

import React from 'react';

import { useCanvasStore } from '@/lib/designer/canvasStore';

// A handful of common apparel colors. The hex values are what
// Fabric.BlendColor will multiply the mockup against, so they should be
// representative of how the finished garment actually looks. "None" = clear
// the tint and use the mockup as-uploaded.
export interface ProductColorOption {
  label: string;
  hex: string | null;
}

const DEFAULT_COLORS: ProductColorOption[] = [
  { label: 'None', hex: null },
  { label: 'White', hex: '#ffffff' },
  { label: 'Heather Grey', hex: '#c9cbcd' },
  { label: 'Black', hex: '#111111' },
  { label: 'Navy', hex: '#1f2a44' },
  { label: 'Royal Blue', hex: '#1d4ed8' },
  { label: 'Forest Green', hex: '#1f5132' },
  { label: 'Red', hex: '#b71c1c' },
  { label: 'Burgundy', hex: '#65161f' },
  { label: 'Mustard', hex: '#c9a227' },
];

interface ProductColorPickerProps {
  options?: ProductColorOption[];
  className?: string;
}

/**
 * Row of color swatches that retints the mockup background image so the
 * customer can see their design on different garment colors without us
 * needing a separate mockup PNG per color. Selecting a swatch updates the
 * Zustand store; DesignCanvas reacts to mockupTint and applies a Fabric
 * BlendColor filter to the background image.
 */
export default function ProductColorPicker({
  options = DEFAULT_COLORS,
  className = '',
}: ProductColorPickerProps) {
  const mockupTint = useCanvasStore((s) => s.mockupTint);
  const setMockupTint = useCanvasStore((s) => s.setMockupTint);

  return (
    <div
      className={`inline-flex items-center gap-2 ${className}`}
      role="radiogroup"
      aria-label="Garment color"
    >
      <span className="text-xs font-medium text-muted-foreground">Color</span>
      <div className="inline-flex items-center gap-1">
        {options.map((opt) => {
          const active = (opt.hex ?? null) === (mockupTint ?? null);
          const isNone = opt.hex === null;
          return (
            <button
              key={opt.label}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setMockupTint(opt.hex)}
              title={opt.label}
              aria-label={opt.label}
              className={`relative w-6 h-6 rounded-full border-2 transition-shadow ${
                active
                  ? 'border-primary ring-2 ring-primary/30'
                  : 'border-border hover:border-foreground/40'
              }`}
              style={{
                backgroundColor: isNone ? 'transparent' : opt.hex ?? undefined,
                backgroundImage: isNone
                  ? // Diagonal-stripe pattern so "no tint" reads visually as
                    // "leave the mockup alone" instead of a white swatch.
                    'repeating-linear-gradient(45deg, transparent 0 4px, currentColor 4px 5px)'
                  : undefined,
                color: 'rgba(120,120,120,0.55)',
              }}
            >
              {isNone && (
                <span className="sr-only">No tint (use mockup as-is)</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
