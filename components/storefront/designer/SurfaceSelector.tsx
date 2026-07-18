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
  const mirrorActiveSurfaceTo = useCanvasStore((s) => s.mirrorActiveSurfaceTo);

  if (!surfaces || surfaces.length === 0) return null;

  const activeHasLayers = (layersBySurface[activeSurface]?.length ?? 0) > 0;
  const handleMirror = () => {
    const otherSurfaces = surfaces.filter((s) => s.slug !== activeSurface);
    if (otherSurfaces.length === 0) return;
    const overwriteCount = otherSurfaces.filter(
      (s) => (layersBySurface[s.slug]?.length ?? 0) > 0
    ).length;
    const msg =
      overwriteCount > 0
        ? `Copy this surface's layers to ${otherSurfaces.length} other surface${
            otherSurfaces.length === 1 ? '' : 's'
          }? This will replace ${overwriteCount} existing surface${
            overwriteCount === 1 ? '' : 's'
          } (undo with Ctrl+Z).`
        : `Copy this surface's layers to ${otherSurfaces.length} other surface${
            otherSurfaces.length === 1 ? '' : 's'
          }?`;
    if (typeof window !== 'undefined' && !window.confirm(msg)) return;
    mirrorActiveSurfaceTo();
  };

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
    <div
      className="inline-flex items-center gap-1 p-1 bg-muted rounded-md"
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
    {surfaces.length > 1 && (
      <button
        type="button"
        onClick={handleMirror}
        disabled={!activeHasLayers}
        title={
          activeHasLayers
            ? 'Copy this surface’s design to every other surface'
            : 'Add layers first, then mirror them across surfaces'
        }
        className="inline-flex items-center gap-1 px-2 py-1.5 text-xs rounded-md border border-border bg-background hover:bg-muted text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Mirror to other surfaces"
      >
        <span className="material-icons text-sm">flip</span>
        <span className="hidden sm:inline">Mirror</span>
      </button>
    )}
    </div>
  );
}
