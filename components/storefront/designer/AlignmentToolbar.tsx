'use client';

import React, { useCallback, useMemo } from 'react';
import type { Canvas, FabricObject } from 'fabric';

import { useCanvasStore } from '@/lib/designer/canvasStore';
import type { DesignerSurface } from '@/lib/designer/types';

interface AlignmentToolbarProps {
  surface: DesignerSurface | null;
  className?: string;
}

type Axis = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';

/**
 * Floating alignment / distribution toolbar that appears whenever ≥1 layer is
 * selected. Distribution buttons enable at ≥3 selected. Operates directly on
 * the underlying Fabric canvas — we re-fire `object:modified` so the store
 * picks up the new positions through the same path that drag-resize uses.
 */
export default function AlignmentToolbar({
  surface,
  className = '',
}: AlignmentToolbarProps) {
  const selectedLayers = useCanvasStore((s) => s.selectedLayers);
  const canvas = useCanvasStore((s) => s.canvas);

  const count = selectedLayers.length;
  const canDistribute = count >= 3;

  // Build a list of "movable" Fabric objects: when the user has a multi-select,
  // Fabric wraps them in an ActiveSelection. We want the individual children
  // for alignment ops.
  const getTargets = useCallback((): FabricObject[] => {
    const c = canvas;
    if (!c) return [];
    const active = c.getActiveObject();
    if (!active) return c.getActiveObjects();
    // Fabric 6 ActiveSelection has a `_objects` array.
    const grouped = active as unknown as { _objects?: FabricObject[] };
    if (grouped._objects && grouped._objects.length > 0) {
      return grouped._objects;
    }
    return c.getActiveObjects();
  }, [canvas]);

  const fireModified = useCallback(
    (c: Canvas, objs: FabricObject[]) => {
      for (const obj of objs) {
        obj.setCoords();
        c.fire('object:modified', { target: obj });
      }
      c.requestRenderAll();
    },
    []
  );

  /**
   * Align selected objects' bounding boxes against the union bounding box.
   * Uses Fabric's `getBoundingRect()` (which already accounts for scale/angle)
   * and shifts `.left` / `.top` by the delta between the rect edge and the
   * required position — same trick we use in the snap-guide logic so the math
   * stays consistent for arbitrarily-anchored origins.
   */
  const alignTo = useCallback(
    (axis: Axis) => {
      const c = canvas;
      if (!c) return;
      const objs = getTargets();
      if (objs.length === 0) return;

      // Compute union bounding box.
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const obj of objs) {
        const b = obj.getBoundingRect();
        minX = Math.min(minX, b.left);
        minY = Math.min(minY, b.top);
        maxX = Math.max(maxX, b.left + b.width);
        maxY = Math.max(maxY, b.top + b.height);
      }
      const unionCx = (minX + maxX) / 2;
      const unionCy = (minY + maxY) / 2;

      for (const obj of objs) {
        const b = obj.getBoundingRect();
        const left = obj.left ?? 0;
        const top = obj.top ?? 0;
        const dxLeft = b.left - left;
        const dxRight = b.left + b.width - left;
        const dxCenter = b.left + b.width / 2 - left;
        const dyTop = b.top - top;
        const dyBottom = b.top + b.height - top;
        const dyCenter = b.top + b.height / 2 - top;

        switch (axis) {
          case 'left':
            obj.set({ left: minX - dxLeft });
            break;
          case 'right':
            obj.set({ left: maxX - dxRight });
            break;
          case 'centerX':
            obj.set({ left: unionCx - dxCenter });
            break;
          case 'top':
            obj.set({ top: minY - dyTop });
            break;
          case 'bottom':
            obj.set({ top: maxY - dyBottom });
            break;
          case 'centerY':
            obj.set({ top: unionCy - dyCenter });
            break;
        }
      }

      // If the active object is an ActiveSelection we need to reset its
      // bounding box so the selection handles redraw correctly.
      const active = c.getActiveObject() as unknown as {
        setCoords?: () => void;
        _objects?: FabricObject[];
      };
      active?.setCoords?.();

      fireModified(c, objs);
    },
    [canvas, getTargets, fireModified]
  );

  /** Distribute spacing evenly along an axis (≥3 required). */
  const distribute = useCallback(
    (axis: 'horizontal' | 'vertical') => {
      const c = canvas;
      if (!c) return;
      const objs = getTargets();
      if (objs.length < 3) return;

      // Sort by bounding-rect center along the chosen axis.
      const sorted = [...objs].sort((a, b) => {
        const ba = a.getBoundingRect();
        const bb = b.getBoundingRect();
        if (axis === 'horizontal') {
          return ba.left + ba.width / 2 - (bb.left + bb.width / 2);
        }
        return ba.top + ba.height / 2 - (bb.top + bb.height / 2);
      });

      const first = sorted[0].getBoundingRect();
      const last = sorted[sorted.length - 1].getBoundingRect();
      const firstCenter =
        axis === 'horizontal'
          ? first.left + first.width / 2
          : first.top + first.height / 2;
      const lastCenter =
        axis === 'horizontal'
          ? last.left + last.width / 2
          : last.top + last.height / 2;

      const step = (lastCenter - firstCenter) / (sorted.length - 1);

      for (let i = 1; i < sorted.length - 1; i++) {
        const obj = sorted[i];
        const b = obj.getBoundingRect();
        const left = obj.left ?? 0;
        const top = obj.top ?? 0;
        const dCenter =
          axis === 'horizontal'
            ? b.left + b.width / 2 - left
            : b.top + b.height / 2 - top;
        const targetCenter = firstCenter + step * i;
        if (axis === 'horizontal') {
          obj.set({ left: targetCenter - dCenter });
        } else {
          obj.set({ top: targetCenter - dCenter });
        }
      }

      const active = c.getActiveObject() as unknown as {
        setCoords?: () => void;
      };
      active?.setCoords?.();

      fireModified(c, objs);
    },
    [canvas, getTargets, fireModified]
  );

  /** Center the selection (or single object) on the print area. */
  const centerOnPrintArea = useCallback(() => {
    const c = canvas;
    if (!c || !surface) return;
    const objs = getTargets();
    if (objs.length === 0) return;

    const paCx = surface.printAreaX + surface.printAreaWidth / 2;
    const paCy = surface.printAreaY + surface.printAreaHeight / 2;

    // Compute the union bounding box's center, then translate every object
    // so the union center lands on the print-area center.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const obj of objs) {
      const b = obj.getBoundingRect();
      minX = Math.min(minX, b.left);
      minY = Math.min(minY, b.top);
      maxX = Math.max(maxX, b.left + b.width);
      maxY = Math.max(maxY, b.top + b.height);
    }
    const unionCx = (minX + maxX) / 2;
    const unionCy = (minY + maxY) / 2;
    const dx = paCx - unionCx;
    const dy = paCy - unionCy;

    for (const obj of objs) {
      obj.set({
        left: (obj.left ?? 0) + dx,
        top: (obj.top ?? 0) + dy,
      });
    }

    const active = c.getActiveObject() as unknown as {
      setCoords?: () => void;
    };
    active?.setCoords?.();

    fireModified(c, objs);
  }, [canvas, surface, getTargets, fireModified]);

  const buttons = useMemo(
    () => [
      {
        icon: 'format_align_left',
        label: 'Align left edges',
        onClick: () => alignTo('left'),
        enabled: count >= 1,
      },
      {
        icon: 'align_horizontal_center',
        label: 'Align horizontal centers',
        onClick: () => alignTo('centerX'),
        enabled: count >= 1,
      },
      {
        icon: 'format_align_right',
        label: 'Align right edges',
        onClick: () => alignTo('right'),
        enabled: count >= 1,
      },
      {
        icon: 'vertical_align_top',
        label: 'Align top edges',
        onClick: () => alignTo('top'),
        enabled: count >= 1,
      },
      {
        icon: 'align_vertical_center',
        label: 'Align vertical centers',
        onClick: () => alignTo('centerY'),
        enabled: count >= 1,
      },
      {
        icon: 'vertical_align_bottom',
        label: 'Align bottom edges',
        onClick: () => alignTo('bottom'),
        enabled: count >= 1,
      },
      {
        icon: 'horizontal_distribute',
        label: 'Distribute horizontally',
        onClick: () => distribute('horizontal'),
        enabled: canDistribute,
      },
      {
        icon: 'vertical_distribute',
        label: 'Distribute vertically',
        onClick: () => distribute('vertical'),
        enabled: canDistribute,
      },
      {
        icon: 'center_focus_strong',
        label: 'Center on print area',
        onClick: centerOnPrintArea,
        enabled: count >= 1 && !!surface,
      },
    ],
    [alignTo, distribute, centerOnPrintArea, count, canDistribute, surface]
  );

  if (count === 0) return null;

  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-md border border-border bg-background shadow-sm p-1 ${className}`}
      role="toolbar"
      aria-label="Alignment and distribution"
    >
      {buttons.map((b, i) => {
        // Visual divider before distribute group + before center-on-print-area.
        const showDivider = b.icon === 'horizontal_distribute' || b.icon === 'center_focus_strong';
        return (
          <React.Fragment key={b.icon}>
            {showDivider && i > 0 && (
              <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
            )}
            <button
              type="button"
              onClick={b.onClick}
              disabled={!b.enabled}
              aria-label={b.label}
              title={b.label}
              className="w-7 h-7 rounded-md hover:bg-muted text-foreground disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center"
            >
              <span className="material-icons text-base">{b.icon}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
