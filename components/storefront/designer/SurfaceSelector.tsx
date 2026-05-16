'use client';

import React from 'react';

import { useCanvasStore } from '@/lib/designer/canvasStore';
import type { DesignerSurface } from '@/lib/designer/types';

interface SurfaceSelectorProps {
  surfaces: DesignerSurface[];
  className?: string;
}

/**
 * Tab-style selector that switches the active surface in the store.
 * Renders nothing if there is only one surface (no need to choose).
 */
export default function SurfaceSelector({
  surfaces,
  className = '',
}: SurfaceSelectorProps) {
  const activeSurface = useCanvasStore((s) => s.activeSurface);
  const setActiveSurface = useCanvasStore((s) => s.setActiveSurface);

  if (!surfaces || surfaces.length === 0) return null;

  return (
    <div
      className={`inline-flex items-center gap-1 p-1 bg-muted rounded-md ${className}`}
      role="tablist"
      aria-label="Design surfaces"
    >
      {surfaces.map((s) => {
        const active = activeSurface === s.slug;
        return (
          <button
            key={s.slug}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setActiveSurface(s.slug)}
            className={`px-3 py-1.5 text-sm font-medium rounded-sm transition-colors ${
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
            }`}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}
