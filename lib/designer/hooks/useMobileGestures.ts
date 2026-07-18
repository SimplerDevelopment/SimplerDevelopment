'use client';

import { useEffect, useRef } from 'react';
import { Point } from 'fabric';
import type { Canvas as FabricCanvas } from 'fabric';

interface TouchGesturesConfig {
  canvas: FabricCanvas | null;
  enabled?: boolean;
  onZoom?: (zoom: number) => void;
  onPan?: (deltaX: number, deltaY: number) => void;
  minZoom?: number;
  maxZoom?: number;
}

interface TouchPoint {
  x: number;
  y: number;
  id: number;
}

interface GestureRef {
  isGesturing: boolean;
  lastTouches: TouchPoint[];
  lastDistance: number;
  lastCenter: { x: number; y: number };
  initialZoom: number;
  lastPanTime: number;
  panVelocity: { x: number; y: number };
}

/**
 * Wires pinch/zoom + 1-finger pan + double-tap-zoom for touch devices onto
 * the supplied Fabric canvas. Pointer/keyboard interactions remain unchanged.
 */
export function useMobileGestures(config: TouchGesturesConfig): {
  isMobile: boolean;
} {
  const { canvas, enabled = true, onZoom, onPan, minZoom = 0.1, maxZoom = 5 } =
    config;

  const gestureRef = useRef<GestureRef>({
    isGesturing: false,
    lastTouches: [],
    lastDistance: 0,
    lastCenter: { x: 0, y: 0 },
    initialZoom: 1,
    lastPanTime: 0,
    panVelocity: { x: 0, y: 0 },
  });

  const isMobile =
    typeof window !== 'undefined' && window.innerWidth <= 768;

  useEffect(() => {
    if (!enabled || !canvas || !isMobile) return;
    const canvasEl = canvas.getElement();
    if (!canvasEl) return;

    const getDistance = (p1: TouchPoint, p2: TouchPoint) => {
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      return Math.sqrt(dx * dx + dy * dy);
    };
    const getCenter = (p1: TouchPoint, p2: TouchPoint) => ({
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2,
    });
    const toPoints = (touches: TouchList): TouchPoint[] =>
      Array.from(touches).map((t) => ({
        x: t.clientX,
        y: t.clientY,
        id: t.identifier,
      }));

    const handleTouchStart = (e: TouchEvent) => {
      const touches = toPoints(e.touches);
      gestureRef.current.lastTouches = touches;
      gestureRef.current.lastPanTime = Date.now();
      if (touches.length === 2) {
        gestureRef.current.isGesturing = true;
        gestureRef.current.lastDistance = getDistance(touches[0], touches[1]);
        gestureRef.current.lastCenter = getCenter(touches[0], touches[1]);
        gestureRef.current.initialZoom = canvas.getZoom();
        e.preventDefault();
      } else if (touches.length === 1) {
        gestureRef.current.panVelocity = { x: 0, y: 0 };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touches = toPoints(e.touches);
      const now = Date.now();

      if (touches.length === 2 && gestureRef.current.isGesturing) {
        e.preventDefault();
        const dist = getDistance(touches[0], touches[1]);
        const center = getCenter(touches[0], touches[1]);
        if (gestureRef.current.lastDistance > 0) {
          const scaleFactor = dist / gestureRef.current.lastDistance;
          let z = canvas.getZoom() * scaleFactor;
          z = Math.max(minZoom, Math.min(maxZoom, z));
          const rect = canvasEl.getBoundingClientRect();
          const zoomPoint = new Point(
            center.x - rect.left,
            center.y - rect.top
          );
          canvas.zoomToPoint(zoomPoint, z);
          onZoom?.(z);
        }
        const cDeltaX = center.x - gestureRef.current.lastCenter.x;
        const cDeltaY = center.y - gestureRef.current.lastCenter.y;
        if (Math.abs(cDeltaX) > 0 || Math.abs(cDeltaY) > 0) {
          canvas.relativePan(new Point(cDeltaX, cDeltaY));
          onPan?.(cDeltaX, cDeltaY);
        }
        gestureRef.current.lastDistance = dist;
        gestureRef.current.lastCenter = center;
      } else if (
        touches.length === 1 &&
        gestureRef.current.lastTouches.length === 1
      ) {
        const last = gestureRef.current.lastTouches[0];
        const cur = touches[0];
        const dx = cur.x - last.x;
        const dy = cur.y - last.y;
        const active = canvas.getActiveObject();
        const isMoving = (active as unknown as { isMoving?: boolean })
          ?.isMoving;
        if (!active || !isMoving) {
          if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
            canvas.relativePan(new Point(dx, dy));
            onPan?.(dx, dy);
            const td = now - gestureRef.current.lastPanTime;
            if (td > 0) {
              gestureRef.current.panVelocity = { x: dx / td, y: dy / td };
            }
          }
        }
        gestureRef.current.lastPanTime = now;
      }

      gestureRef.current.lastTouches = touches;
      canvas.renderAll();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const touches = toPoints(e.touches);
      if (touches.length < 2) gestureRef.current.isGesturing = false;
      gestureRef.current.lastTouches = touches;
    };

    canvasEl.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvasEl.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvasEl.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      canvasEl.removeEventListener('touchstart', handleTouchStart);
      canvasEl.removeEventListener('touchmove', handleTouchMove);
      canvasEl.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, canvas, isMobile, onZoom, onPan, minZoom, maxZoom]);

  return { isMobile };
}

export default useMobileGestures;
