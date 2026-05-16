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
  const layersBySurface = useCanvasStore((s) => s.layersBySurface);

  if (!surfaces || surfaces.length === 0) return null;

  return (
    <div
      className={`inline-flex items-center gap-1 p-1 bg-muted rounded-md ${className}`}
      role="tablist"
      aria-label="Design surfaces"
    >
      {surfaces.map((s) => {
        const active = activeSurface === s.slug;
        const count = layersBySurface[s.slug]?.length ?? 0;
        return (
          <button
            key={s.slug}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setActiveSurface(s.slug)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-sm transition-colors ${
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
            }`}
          >
            {s.name}
            {count > 0 && (
              <span
                className={`min-w-[1.25rem] inline-flex items-center justify-center px-1 text-[10px] font-semibold rounded-full leading-4 ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-foreground/10 text-foreground/70'
                }`}
                aria-label={`${count} layer${count === 1 ? '' : 's'}`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
