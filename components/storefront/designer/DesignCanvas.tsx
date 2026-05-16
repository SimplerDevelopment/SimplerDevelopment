'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Point, filters as fabricFilters } from 'fabric';
import type { Canvas, FabricImage, FabricObject } from 'fabric';

import { useCanvasStore } from '@/lib/designer/canvasStore';
import {
  createFabricIcon,
  createFabricImage,
  createFabricText,
  fabricObjectToLayer,
} from '@/lib/designer/layerFactory';
import { useMobileGestures } from '@/lib/designer/hooks/useMobileGestures';
import { initializeFontVirtualization } from '@/lib/designer/fontVirtualizer';
import type {
  DesignerSurface,
  IconLayerData,
  ImageLayerData,
  LayerData,
  TextLayerData,
} from '@/lib/designer/types';

interface DesignCanvasProps {
  surface: DesignerSurface;
  productId: number;
  className?: string;
}

// Fabric's event payload types are tagged with TPointerEvent and don't
// expose a stable public type. We only need `target` from these events.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FabricEventHandler<T = any> = (opt: T) => void;

// Background image id used to keep the mockup pinned to the bottom of the stack.
const BACKGROUND_ID = 'designer-canvas-background';

// Snap threshold (in canvas units, i.e. pre-zoom). Matches typical Figma feel.
const SNAP_THRESHOLD = 6;

// Stable guide ids so we can find/remove them later.
const GUIDE_ID_PREFIX = 'designer-guide-';

interface FabricMovingEvent {
  target?: FabricObject;
  e?: { altKey?: boolean };
}

interface FabricRotatingEvent {
  target?: FabricObject;
  e?: { shiftKey?: boolean };
}

// Rotation snaps to multiples of this many degrees.
const ROTATION_SNAP_STEP = 15;
// Snap threshold (degrees) for rotation snapping.
const ROTATION_SNAP_THRESHOLD = 5;

// Stable empty array — Zustand selectors that fall back to `[]` MUST reuse the
// same reference, otherwise React 19 fires "getSnapshot should be cached to
// avoid an infinite loop" and our save-loop reactivity breaks.
const EMPTY_LAYERS: readonly LayerData[] = Object.freeze([]);

export default function DesignCanvas({
  surface,
  productId,
  className = '',
}: DesignCanvasProps) {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const rotationBadgeRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);
  const isSyncingRef = useRef(false);
  const productIdRef = useRef(productId);
  productIdRef.current = productId;

  const setStoreCanvas = useCanvasStore((s) => s.setCanvas);
  const setSelectedLayers = useCanvasStore((s) => s.setSelectedLayers);
  const updateLayer = useCanvasStore((s) => s.updateLayer);
  const zoom = useCanvasStore((s) => s.zoom);
  const setZoom = useCanvasStore((s) => s.setZoom);
  const setPan = useCanvasStore((s) => s.setPan);
  const showPrintArea = useCanvasStore((s) => s.showPrintArea);
  const layers = useCanvasStore(
    (s) => s.layersBySurface[surface.slug] ?? (EMPTY_LAYERS as LayerData[])
  );

  // Mobile gesture wiring.
  useMobileGestures({
    canvas: fabricRef.current,
    enabled: true,
    onZoom: setZoom,
    onPan: setPan,
    minZoom: 0.1,
    maxZoom: 5,
  });

  /* ────────────────────────────────────────────────────────────────────
   * Canvas event handlers
   * ──────────────────────────────────────────────────────────────────── */

  const handleSelectionChange = useCallback<FabricEventHandler>(
    () => {
      const active = fabricRef.current?.getActiveObjects() || [];
      setSelectedLayers(active);
    },
    [setSelectedLayers]
  );

  const handleSelectionCleared = useCallback<FabricEventHandler>(() => {
    setSelectedLayers([]);
  }, [setSelectedLayers]);

  const handleObjectModified = useCallback<FabricEventHandler<{ target?: FabricObject }>>(
    (e) => {
      const target = e.target;
      if (!target || isSyncingRef.current) return;
      const objAny = target as unknown as {
        data?: { id?: string };
        id?: string;
      };
      const layerId = objAny.data?.id || objAny.id;
      if (!layerId || layerId === BACKGROUND_ID) return;
      const current = layers.find((l) => l.id === layerId);
      const patch = fabricObjectToLayer(target, current);
      updateLayer(layerId, patch);
    },
    [layers, updateLayer]
  );

  /* ────────────────────────────────────────────────────────────────────
   * Canvas initialization
   * ──────────────────────────────────────────────────────────────────── */

  useEffect(() => {
    let cancelled = false;
    const el = canvasElRef.current;
    if (!el || fabricRef.current) return;

    // Lazy import keeps Fabric out of SSR / RSC bundles.
    (async () => {
      const fabricModule = await import('fabric');
      if (cancelled || !el) return;
      const FabricCanvas = fabricModule.Canvas;
      const canvas = new FabricCanvas(el, {
        width: surface.canvasWidth,
        height: surface.canvasHeight,
        backgroundColor: '#ffffff',
        preserveObjectStacking: true,
        selection: true,
        allowTouchScrolling: false,
        imageSmoothingEnabled: true,
        enableRetinaScaling: true,
      });

      canvas.on('selection:created', handleSelectionChange);
      canvas.on('selection:updated', handleSelectionChange);
      canvas.on('selection:cleared', handleSelectionCleared);
      canvas.on('object:modified', handleObjectModified);

      fabricRef.current = canvas;
      setIsReady(true);
      setStoreCanvas(canvas);

      // Apply initial zoom from store
      canvas.zoomToPoint(
        new Point(canvas.getWidth() / 2, canvas.getHeight() / 2),
        zoom
      );

      // Font virtualization (no-op until a Google font is registered).
      initializeFontVirtualization(canvas);
    })();

    return () => {
      cancelled = true;
      const c = fabricRef.current;
      fabricRef.current = null;
      setIsReady(false);
      if (c) {
        try {
          c.dispose();
        } catch {
          // ignore disposal errors
        }
        const storeCanvas = useCanvasStore.getState().canvas;
        if (storeCanvas === c) setStoreCanvas(null);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface.canvasWidth, surface.canvasHeight]);

  // Re-attach listeners when handlers change (they close over fresh layers).
  useEffect(() => {
    const c = fabricRef.current;
    if (!c || !isReady) return;
    c.off('selection:created');
    c.off('selection:updated');
    c.off('selection:cleared');
    c.off('object:modified');
    c.on('selection:created', handleSelectionChange);
    c.on('selection:updated', handleSelectionChange);
    c.on('selection:cleared', handleSelectionCleared);
    c.on('object:modified', handleObjectModified);
  }, [isReady, handleSelectionChange, handleSelectionCleared, handleObjectModified]);

  /* ────────────────────────────────────────────────────────────────────
   * Background mockup image — load when surface.mockupImage changes.
   * ──────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const c = fabricRef.current;
    if (!c || !isReady || !surface.mockupImage) return;

    let cancelled = false;
    (async () => {
      try {
        const existing = c.getObjects().find(
          (o) => (o as unknown as { id?: string }).id === BACKGROUND_ID
        );
        if (existing) c.remove(existing);

        const img: FabricImage = await createFabricImage(surface.mockupImage, {
          selectable: false,
          evented: false,
        });
        if (cancelled) return;

        const cw = surface.canvasWidth;
        const ch = surface.canvasHeight;
        const iw = img.width || 1;
        const ih = img.height || 1;
        const canvasAspect = cw / ch;
        const imgAspect = iw / ih;
        const scale = imgAspect > canvasAspect ? ch / ih : cw / iw;

        img.set({
          left: cw / 2,
          top: ch / 2,
          originX: 'center',
          originY: 'center',
          scaleX: scale,
          scaleY: scale,
        });
        (img as unknown as { id?: string }).id = BACKGROUND_ID;
        c.add(img);
        c.moveObjectTo(img, 0);
        c.renderAll();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to load surface mockup:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [surface.mockupImage, surface.canvasWidth, surface.canvasHeight, isReady]);

  /* ────────────────────────────────────────────────────────────────────
   * Print-area overlay — non-interactive dashed rect showing the safe zone.
   * Sits just above the background, below all user layers.
   * ──────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const c = fabricRef.current;
    if (!c || !isReady) return;

    let cancelled = false;
    (async () => {
      const fabricModule = await import('fabric');
      if (cancelled) return;
      const FabricRect = fabricModule.Rect;

      // Remove any pre-existing overlay so we can resize on surface changes.
      const existing = c
        .getObjects()
        .find(
          (o) =>
            (o as unknown as { _designerPrintArea?: boolean })
              ._designerPrintArea === true
        );
      if (existing) c.remove(existing);

      const rect = new FabricRect({
        left: surface.printAreaX,
        top: surface.printAreaY,
        width: surface.printAreaWidth,
        height: surface.printAreaHeight,
        fill: 'transparent',
        stroke: 'rgba(37, 99, 235, 0.5)',
        strokeDashArray: [8, 6],
        strokeWidth: 1.5,
        selectable: false,
        evented: false,
        hoverCursor: 'default',
        objectCaching: false,
        excludeFromExport: true,
        visible: showPrintArea,
      });
      (rect as unknown as { _designerPrintArea?: boolean })._designerPrintArea =
        true;
      (rect as unknown as { excludeFromExport?: boolean }).excludeFromExport =
        true;
      c.add(rect);
      // Background is at index 0 — pop the overlay to index 1 so user layers
      // remain above it.
      c.moveObjectTo(rect, 1);
      c.requestRenderAll();
    })();

    return () => {
      cancelled = true;
    };
  }, [
    surface.printAreaX,
    surface.printAreaY,
    surface.printAreaWidth,
    surface.printAreaHeight,
    isReady,
    // showPrintArea intentionally omitted — handled by the visibility-only
    // effect below to avoid re-creating the rect on toggle.
  ]);

  // Toggle visibility without recreating the rect.
  useEffect(() => {
    const c = fabricRef.current;
    if (!c || !isReady) return;
    const rect = c
      .getObjects()
      .find(
        (o) =>
          (o as unknown as { _designerPrintArea?: boolean })
            ._designerPrintArea === true
      );
    if (rect) {
      rect.visible = showPrintArea;
      c.requestRenderAll();
    }
  }, [showPrintArea, isReady]);

  /* ────────────────────────────────────────────────────────────────────
   * Snap guides — drawn while dragging, snap to print-area + canvas centers.
   * ──────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const c = fabricRef.current;
    if (!c || !isReady) return;

    let FabricLine: typeof import('fabric').Line | null = null;
    let cancelled = false;

    const guideRefs: Record<string, FabricObject | null> = {
      v: null,
      h: null,
      vEdge: null,
      hEdge: null,
    };

    const clearGuides = () => {
      for (const key of Object.keys(guideRefs)) {
        const g = guideRefs[key];
        if (g) {
          c.remove(g);
          guideRefs[key] = null;
        }
      }
      c.requestRenderAll();
    };

    const upsertGuide = (
      key: 'v' | 'h' | 'vEdge' | 'hEdge',
      x1: number,
      y1: number,
      x2: number,
      y2: number
    ) => {
      if (!FabricLine) return;
      const existing = guideRefs[key];
      if (existing) {
        existing.set({ x1, y1, x2, y2 });
        existing.setCoords();
        return;
      }
      const line = new FabricLine([x1, y1, x2, y2], {
        stroke: '#ec4899',
        strokeWidth: 1,
        strokeDashArray: [4, 4],
        selectable: false,
        evented: false,
        excludeFromExport: true,
        objectCaching: false,
        hoverCursor: 'default',
      });
      (line as unknown as { _designerGuide?: string })._designerGuide =
        GUIDE_ID_PREFIX + key;
      c.add(line);
      // Keep guides above all layers.
      c.bringObjectToFront(line);
      guideRefs[key] = line as unknown as FabricObject;
    };

    const handleMoving = (opt: FabricMovingEvent) => {
      const target = opt.target;
      if (!target) return;
      // Alt/Option disables snapping.
      if (opt.e?.altKey) {
        clearGuides();
        return;
      }
      if (!FabricLine) return;

      const cw = surface.canvasWidth;
      const ch = surface.canvasHeight;
      const paX = surface.printAreaX;
      const paY = surface.printAreaY;
      const paW = surface.printAreaWidth;
      const paH = surface.printAreaHeight;
      const paCx = paX + paW / 2;
      const paCy = paY + paH / 2;
      const canvasCx = cw / 2;
      const canvasCy = ch / 2;

      const br = target.getBoundingRect();
      const objLeft = br.left;
      const objTop = br.top;
      const objW = br.width;
      const objH = br.height;
      const objCx = objLeft + objW / 2;
      const objCy = objTop + objH / 2;
      const objRight = objLeft + objW;
      const objBottom = objTop + objH;

      // Collect snap targets from other layers (centers + edges).
      // Skip the moving target itself, the background, the print-area overlay,
      // any guide lines (excludeFromExport / _designerGuide tagged), plus any
      // other internal-only objects.
      const otherObjects = c.getObjects().filter((obj) => {
        if (obj === target) return false;
        const meta = obj as unknown as {
          id?: string;
          _designerPrintArea?: boolean;
          _designerGuide?: string;
          excludeFromExport?: boolean;
        };
        if (meta.id === BACKGROUND_ID) return false;
        if (meta._designerPrintArea) return false;
        if (meta._designerGuide) return false;
        if (meta.excludeFromExport) return false;
        return true;
      });

      const otherRects = otherObjects.map((obj) => obj.getBoundingRect());

      // Vertical guides (x-axis snapping — moves target.left).
      const verticalTargets: Array<{ x: number; kind: 'center' | 'edge' }> = [
        { x: paCx, kind: 'center' },
        { x: canvasCx, kind: 'center' },
        { x: paX, kind: 'edge' },
        { x: paX + paW, kind: 'edge' },
      ];
      for (const r of otherRects) {
        verticalTargets.push({ x: r.left + r.width / 2, kind: 'center' });
        verticalTargets.push({ x: r.left, kind: 'edge' });
        verticalTargets.push({ x: r.left + r.width, kind: 'edge' });
      }

      let snappedX = false;
      // We need to snap based on the object's bounding-rect center/edges, but
      // assign via target.left which is the object's own origin position.
      // Compute the delta between bounding-rect-center and target.left so we
      // can translate snap-targets into target.left values.
      const dxCenter = objCx - (target.left ?? 0);
      const dxLeft = objLeft - (target.left ?? 0);
      const dxRight = objRight - (target.left ?? 0);

      for (const t of verticalTargets) {
        if (Math.abs(objCx - t.x) <= SNAP_THRESHOLD) {
          target.set({ left: t.x - dxCenter });
          upsertGuide(
            t.kind === 'center' ? 'v' : 'vEdge',
            t.x,
            0,
            t.x,
            ch
          );
          snappedX = true;
          break;
        }
        if (Math.abs(objLeft - t.x) <= SNAP_THRESHOLD) {
          target.set({ left: t.x - dxLeft });
          upsertGuide('vEdge', t.x, 0, t.x, ch);
          snappedX = true;
          break;
        }
        if (Math.abs(objRight - t.x) <= SNAP_THRESHOLD) {
          target.set({ left: t.x - dxRight });
          upsertGuide('vEdge', t.x, 0, t.x, ch);
          snappedX = true;
          break;
        }
      }
      if (!snappedX) {
        if (guideRefs.v) {
          c.remove(guideRefs.v);
          guideRefs.v = null;
        }
        if (guideRefs.vEdge) {
          c.remove(guideRefs.vEdge);
          guideRefs.vEdge = null;
        }
      }

      // Horizontal guides (y-axis snapping — moves target.top).
      const horizontalTargets: Array<{ y: number; kind: 'center' | 'edge' }> = [
        { y: paCy, kind: 'center' },
        { y: canvasCy, kind: 'center' },
        { y: paY, kind: 'edge' },
        { y: paY + paH, kind: 'edge' },
      ];
      for (const r of otherRects) {
        horizontalTargets.push({ y: r.top + r.height / 2, kind: 'center' });
        horizontalTargets.push({ y: r.top, kind: 'edge' });
        horizontalTargets.push({ y: r.top + r.height, kind: 'edge' });
      }

      let snappedY = false;
      const dyCenter = objCy - (target.top ?? 0);
      const dyTop = objTop - (target.top ?? 0);
      const dyBottom = objBottom - (target.top ?? 0);

      for (const t of horizontalTargets) {
        if (Math.abs(objCy - t.y) <= SNAP_THRESHOLD) {
          target.set({ top: t.y - dyCenter });
          upsertGuide(
            t.kind === 'center' ? 'h' : 'hEdge',
            0,
            t.y,
            cw,
            t.y
          );
          snappedY = true;
          break;
        }
        if (Math.abs(objTop - t.y) <= SNAP_THRESHOLD) {
          target.set({ top: t.y - dyTop });
          upsertGuide('hEdge', 0, t.y, cw, t.y);
          snappedY = true;
          break;
        }
        if (Math.abs(objBottom - t.y) <= SNAP_THRESHOLD) {
          target.set({ top: t.y - dyBottom });
          upsertGuide('hEdge', 0, t.y, cw, t.y);
          snappedY = true;
          break;
        }
      }
      if (!snappedY) {
        if (guideRefs.h) {
          c.remove(guideRefs.h);
          guideRefs.h = null;
        }
        if (guideRefs.hEdge) {
          c.remove(guideRefs.hEdge);
          guideRefs.hEdge = null;
        }
      }

      target.setCoords();
      c.requestRenderAll();
    };

    const handleEnd = () => clearGuides();

    (async () => {
      const fabricModule = await import('fabric');
      if (cancelled) return;
      FabricLine = fabricModule.Line;
      c.on('object:moving', handleMoving as unknown as FabricEventHandler);
      c.on('mouse:up', handleEnd as unknown as FabricEventHandler);
      c.on('object:modified', handleEnd as unknown as FabricEventHandler);
    })();

    return () => {
      cancelled = true;
      c.off('object:moving', handleMoving as unknown as FabricEventHandler);
      c.off('mouse:up', handleEnd as unknown as FabricEventHandler);
      c.off('object:modified', handleEnd as unknown as FabricEventHandler);
      clearGuides();
    };
  }, [
    isReady,
    surface.canvasWidth,
    surface.canvasHeight,
    surface.printAreaX,
    surface.printAreaY,
    surface.printAreaWidth,
    surface.printAreaHeight,
  ]);

  /* ────────────────────────────────────────────────────────────────────
   * Rotation snap — snap angle to 15° multiples while rotating, show a
   * small fixed badge in the canvas corner with the live angle. Shift
   * disables snapping.
   * ──────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const c = fabricRef.current;
    if (!c || !isReady) return;

    const showBadge = (angle: number) => {
      const el = rotationBadgeRef.current;
      if (!el) return;
      const normalized = ((angle % 360) + 360) % 360;
      el.textContent = `${Math.round(normalized)}°`;
      el.style.display = 'block';
    };

    const hideBadge = () => {
      const el = rotationBadgeRef.current;
      if (!el) return;
      el.style.display = 'none';
    };

    const handleRotating = (opt: FabricRotatingEvent) => {
      const target = opt.target;
      if (!target) return;
      let angle = target.angle ?? 0;
      // Shift disables snapping.
      if (!opt.e?.shiftKey) {
        const snapped = Math.round(angle / ROTATION_SNAP_STEP) * ROTATION_SNAP_STEP;
        if (Math.abs(angle - snapped) <= ROTATION_SNAP_THRESHOLD) {
          target.set({ angle: snapped });
          target.setCoords();
          angle = snapped;
        }
      }
      showBadge(angle);
      c.requestRenderAll();
    };

    c.on(
      'object:rotating',
      handleRotating as unknown as FabricEventHandler
    );
    c.on('mouse:up', hideBadge as unknown as FabricEventHandler);
    c.on('object:modified', hideBadge as unknown as FabricEventHandler);

    return () => {
      c.off(
        'object:rotating',
        handleRotating as unknown as FabricEventHandler
      );
      c.off('mouse:up', hideBadge as unknown as FabricEventHandler);
      c.off('object:modified', hideBadge as unknown as FabricEventHandler);
      hideBadge();
    };
  }, [isReady]);

  /* ────────────────────────────────────────────────────────────────────
   * Layer sync — keep Fabric objects in lock-step with the store.
   * ──────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const c = fabricRef.current;
    if (!c || !isReady) return;
    let cancelled = false;

    const syncLayers = async () => {
      isSyncingRef.current = true;
      try {
        const currentObjects = c.getObjects().filter((o) => {
          const meta = o as unknown as {
            id?: string;
            _designerPrintArea?: boolean;
            _designerGuide?: string;
          };
          if (meta.id === BACKGROUND_ID) return false;
          if (meta._designerPrintArea) return false;
          if (meta._designerGuide) return false;
          return true;
        });
        const targetIds = new Set(layers.map((l) => l.id));

        // Remove orphaned fabric objects.
        for (const obj of currentObjects) {
          const objAny = obj as unknown as { data?: { id?: string }; id?: string };
          const id = objAny.data?.id || objAny.id;
          if (id && !targetIds.has(id)) c.remove(obj);
        }

        // Upsert each layer.
        for (const layer of layers) {
          const existing = currentObjects.find((o) => {
            const objAny = o as unknown as { data?: { id?: string }; id?: string };
            return (objAny.data?.id || objAny.id) === layer.id;
          });

          if (!existing) {
            try {
              const fab = await buildFabricFromLayer(layer);
              if (cancelled || !fab) continue;
              c.add(fab);
            } catch (err) {
              // eslint-disable-next-line no-console
              console.error('Failed to create fabric object for layer:', layer.id, err);
            }
          } else {
            applyLayerToFabric(existing, layer);
          }
        }

        // Re-pin background + print-area overlay to the bottom of the stack.
        const allObjects = c.getObjects();
        const bg = allObjects.find(
          (o) => (o as unknown as { id?: string }).id === BACKGROUND_ID
        );
        if (bg) c.moveObjectTo(bg, 0);
        const printArea = allObjects.find(
          (o) =>
            (o as unknown as { _designerPrintArea?: boolean })
              ._designerPrintArea === true
        );
        if (printArea) c.moveObjectTo(printArea, 1);
        c.renderAll();
      } finally {
        isSyncingRef.current = false;
      }
    };

    const timer = setTimeout(() => {
      void syncLayers();
    }, 5);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [layers, isReady]);

  return (
    <div
      className={`relative inline-block border border-border rounded-md overflow-hidden bg-background ${className}`}
      style={{ minWidth: surface.canvasWidth, minHeight: surface.canvasHeight }}
    >
      <canvas
        ref={canvasElRef}
        className="block"
        style={{ maxWidth: '100%', height: 'auto' }}
        data-product-id={productId}
      />
      <div
        ref={rotationBadgeRef}
        aria-hidden="true"
        className="absolute top-2 right-2 z-10 px-2 py-1 rounded bg-black/70 text-white text-xs font-mono pointer-events-none"
        style={{ display: 'none' }}
      />
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/40">
          <span className="material-icons animate-spin text-muted-foreground">
            refresh
          </span>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────────────── */

async function buildFabricFromLayer(
  layer: LayerData
): Promise<FabricObject | null> {
  if (layer.type === 'text') {
    const d = layer.data as Partial<TextLayerData>;
    return createFabricText(d.text ?? 'Text', {
      left: layer.left,
      top: layer.top,
      scaleX: layer.scaleX,
      scaleY: layer.scaleY,
      angle: layer.angle,
      opacity: layer.opacity,
      visible: layer.visible,
      selectable: !layer.locked,
      evented: !layer.locked,
      fontFamily: d.fontFamily,
      fontSize: d.fontSize,
      fontWeight: d.fontWeight,
      fontStyle: d.fontStyle,
      underline: d.underline,
      fill: d.fill || d.color,
      textAlign: d.textAlign,
      lineHeight: d.lineHeight,
      charSpacing: d.charSpacing,
      textBackgroundColor: d.textBackgroundColor,
      stroke: d.stroke,
      strokeWidth: d.strokeWidth,
      data: { id: layer.id },
    });
  }
  if (layer.type === 'icon') {
    const d = layer.data as Partial<IconLayerData>;
    return createFabricIcon(d.iconName ?? 'star', {
      left: layer.left,
      top: layer.top,
      scaleX: layer.scaleX,
      scaleY: layer.scaleY,
      angle: layer.angle,
      opacity: layer.opacity,
      visible: layer.visible,
      selectable: !layer.locked,
      evented: !layer.locked,
      fill: d.fill || d.color,
      fontSize: d.size,
      data: { id: layer.id },
    });
  }
  if (layer.type === 'image') {
    const d = layer.data as Partial<ImageLayerData>;
    if (!d.url) return null;
    const img = await createFabricImage(d.url, {
      left: layer.left,
      top: layer.top,
      scaleX: layer.scaleX,
      scaleY: layer.scaleY,
      angle: layer.angle,
      opacity: layer.opacity,
      visible: layer.visible,
      selectable: !layer.locked,
      evented: !layer.locked,
      data: { id: layer.id },
    });
    // Replay persisted filters so saved designs render with the same look.
    if (d.filters) {
      applyImageFilters(img, d.filters);
    }
    return img;
  }
  return null;
}

function applyImageFilters(
  img: FabricImage,
  filterData: NonNullable<ImageLayerData['filters']>
): void {
  img.filters = [
    new fabricFilters.Brightness({ brightness: filterData.brightness }),
    new fabricFilters.Contrast({ contrast: filterData.contrast }),
    new fabricFilters.Saturation({ saturation: filterData.saturation }),
    new fabricFilters.Blur({ blur: filterData.blur }),
  ];
  img.applyFilters();
}

function applyLayerToFabric(obj: FabricObject, layer: LayerData): void {
  const props: Record<string, unknown> = {
    left: layer.left,
    top: layer.top,
    scaleX: layer.scaleX,
    scaleY: layer.scaleY,
    angle: layer.angle,
    opacity: layer.opacity,
    visible: layer.visible,
    selectable: !layer.locked,
    evented: !layer.locked,
  };
  if (layer.type === 'text' || layer.type === 'icon') {
    const d = layer.data as Partial<TextLayerData & IconLayerData>;
    if (d.fill || d.color) props.fill = d.fill || d.color;
    if (layer.type === 'text') {
      if (d.text !== undefined) props.text = d.text;
      if (d.fontSize) props.fontSize = d.fontSize;
      if (d.fontFamily) props.fontFamily = d.fontFamily;
      if (d.fontWeight) props.fontWeight = d.fontWeight;
      if (d.fontStyle) props.fontStyle = d.fontStyle;
      if (d.textAlign) props.textAlign = d.textAlign;
      if (d.lineHeight) props.lineHeight = d.lineHeight;
      if (d.charSpacing) props.charSpacing = d.charSpacing;
    }
    if (layer.type === 'icon' && d.size) {
      props.fontSize = d.size;
    }
  }
  obj.set(props);
}
