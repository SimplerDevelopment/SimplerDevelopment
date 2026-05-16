'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Point } from 'fabric';
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

export default function DesignCanvas({
  surface,
  productId,
  className = '',
}: DesignCanvasProps) {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<Canvas | null>(null);
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
  const layers = useCanvasStore((s) =>
    s.layersBySurface[surface.slug] || []
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
   * Layer sync — keep Fabric objects in lock-step with the store.
   * ──────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const c = fabricRef.current;
    if (!c || !isReady) return;
    let cancelled = false;

    const syncLayers = async () => {
      isSyncingRef.current = true;
      try {
        const currentObjects = c
          .getObjects()
          .filter((o) => (o as unknown as { id?: string }).id !== BACKGROUND_ID);
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

        // Re-pin background to bottom.
        const bg = c
          .getObjects()
          .find((o) => (o as unknown as { id?: string }).id === BACKGROUND_ID);
        if (bg) c.moveObjectTo(bg, 0);
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
    return createFabricImage(d.url, {
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
  }
  return null;
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
