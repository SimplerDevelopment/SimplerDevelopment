'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Editor canvas pan + zoom controller.
 *
 * - Ctrl/Cmd+wheel zooms (clamped to 30–200%); plain wheel pans.
 * - Holding Space or middle-click + drag pans (cursor flips to grab/grabbing).
 * - The hook owns the cursor mutation on the canvas DOM node so consumers
 *   only need to bind ref + the returned mouse handlers to their canvas.
 */
export function usePanZoom(initialZoom?: number) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState(initialZoom ?? 100);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, startPanX: 0, startPanY: 0 });
  const spaceDownRef = useRef(false);

  const zoomIn = useCallback(() => setZoomLevel((z) => Math.min(z + 10, 200)), []);
  const zoomOut = useCallback(() => setZoomLevel((z) => Math.max(z - 10, 30)), []);
  const zoomReset = useCallback(() => setZoomLevel(100), []);

  // Scroll/trackpad: Ctrl+scroll = zoom, plain scroll = pan
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoomLevel((z) => {
          const delta = e.deltaY > 0 ? -5 : 5;
          return Math.min(200, Math.max(30, z + delta));
        });
      } else {
        e.preventDefault();
        setPanOffset((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, []);

  // Track Space modifier — held = grabbing cursor, drag = pan
  useEffect(() => {
    const isEditableTarget = (t: EventTarget | null) =>
      t instanceof HTMLInputElement ||
      t instanceof HTMLTextAreaElement ||
      t instanceof HTMLSelectElement ||
      (t instanceof HTMLElement && t.isContentEditable);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !isEditableTarget(e.target)) {
        spaceDownRef.current = true;
        if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDownRef.current = false;
        if (canvasRef.current && !isPanning) canvasRef.current.style.cursor = '';
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPanning]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (spaceDownRef.current || e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, startPanX: panOffset.x, startPanY: panOffset.y };
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
    }
  }, [panOffset]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setPanOffset({ x: panStartRef.current.startPanX + dx, y: panStartRef.current.startPanY + dy });
  }, [isPanning]);

  const handleCanvasMouseUp = useCallback(() => {
    if (!isPanning) return;
    setIsPanning(false);
    if (canvasRef.current) canvasRef.current.style.cursor = spaceDownRef.current ? 'grab' : '';
  }, [isPanning]);

  return {
    canvasRef,
    zoomLevel,
    setZoomLevel,
    zoomIn,
    zoomOut,
    zoomReset,
    panOffset,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
  };
}
