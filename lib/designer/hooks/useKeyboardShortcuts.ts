'use client';

import { useEffect } from 'react';

import { useCanvasStore } from '../canvasStore';

interface KeyboardShortcutsConfig {
  onSave?: () => void;
  onExport?: () => void;
  onDeleteLayer?: () => void;
  /** Toggle the keyboard-shortcuts cheatsheet modal (bound to the "?" key). */
  onToggleHelp?: () => void;
  enabled?: boolean;
}

/**
 * Wires standard keyboard shortcuts (undo/redo/save/copy/paste/delete/zoom)
 * into the canvas store. Calls into store actions; no Fabric dependency.
 */
export function useKeyboardShortcuts(config: KeyboardShortcutsConfig = {}): void {
  const canvas = useCanvasStore((s) => s.canvas);
  const selectedLayers = useCanvasStore((s) => s.selectedLayers);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const canUndo = useCanvasStore((s) => s.canUndo);
  const canRedo = useCanvasStore((s) => s.canRedo);
  const copySelectedLayers = useCanvasStore((s) => s.copySelectedLayers);
  const pasteLayersFromClipboard = useCanvasStore((s) => s.pasteLayersFromClipboard);
  const removeLayer = useCanvasStore((s) => s.removeLayer);
  const duplicateLayer = useCanvasStore((s) => s.duplicateLayer);
  const selectAllLayers = useCanvasStore((s) => s.selectAllLayers);
  const reorderLayer = useCanvasStore((s) => s.reorderLayer);
  const setZoom = useCanvasStore((s) => s.setZoom);
  const zoom = useCanvasStore((s) => s.zoom);
  const updateLayer = useCanvasStore((s) => s.updateLayer);

  const {
    onSave,
    onExport,
    enabled = true,
    onDeleteLayer,
    onToggleHelp,
  } = config;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.contentEditable === 'true'
      ) {
        return;
      }

      const isMac =
        typeof navigator !== 'undefined' &&
        navigator.platform.toUpperCase().includes('MAC');
      const ctrlKey = isMac ? e.metaKey : e.ctrlKey;
      const k = e.key.toLowerCase();

      // Undo
      if (ctrlKey && k === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo()) undo();
        return;
      }
      // Redo
      if ((ctrlKey && k === 'y') || (ctrlKey && k === 'z' && e.shiftKey)) {
        e.preventDefault();
        if (canRedo()) redo();
        return;
      }
      // Save
      if (ctrlKey && k === 's') {
        e.preventDefault();
        onSave?.();
        return;
      }
      // Help cheatsheet — "?" (no modifier). On most layouts this requires
      // Shift+/, but we trigger off the resulting character to stay layout
      // agnostic.
      if (!ctrlKey && !e.altKey && e.key === '?') {
        e.preventDefault();
        onToggleHelp?.();
        return;
      }
      // Copy / paste
      if (ctrlKey && k === 'c') {
        if (selectedLayers.length > 0) {
          e.preventDefault();
          copySelectedLayers();
        }
        return;
      }
      if (ctrlKey && k === 'v') {
        e.preventDefault();
        pasteLayersFromClipboard();
        return;
      }
      // Duplicate
      if (ctrlKey && k === 'd') {
        if (selectedLayers.length > 0) {
          e.preventDefault();
          const first = selectedLayers[0] as unknown as {
            data?: { id?: string };
            id?: string;
          };
          const id = first.data?.id || first.id;
          if (id) duplicateLayer(id);
        }
        return;
      }
      // Select all
      if (ctrlKey && k === 'a') {
        e.preventDefault();
        selectAllLayers();
        return;
      }
      // Layer z-order: Cmd/Ctrl+] forward, Cmd/Ctrl+[ backward; add Shift to
      // jump all the way to front/back. Standard Adobe / Figma binding.
      if (ctrlKey && (e.key === ']' || e.key === '[')) {
        const first = selectedLayers[0] as unknown as {
          data?: { id?: string };
          id?: string;
        };
        const id = first?.data?.id || first?.id;
        if (id) {
          e.preventDefault();
          if (e.key === ']') {
            reorderLayer(id, e.shiftKey ? 0 : 'up');
          } else {
            const total =
              useCanvasStore.getState().layers.length;
            reorderLayer(id, e.shiftKey ? total - 1 : 'down');
          }
        }
        return;
      }
      // Delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedLayers.length > 0) {
          e.preventDefault();
          selectedLayers.forEach((obj) => {
            const id =
              (obj as unknown as { data?: { id?: string } }).data?.id ||
              (obj as unknown as { id?: string }).id;
            if (id) removeLayer(id);
          });
          onDeleteLayer?.();
        }
        return;
      }
      // Zoom
      if (ctrlKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        setZoom(Math.min(5, zoom * 1.2));
        return;
      }
      if (ctrlKey && e.key === '-') {
        e.preventDefault();
        setZoom(Math.max(0.1, zoom / 1.2));
        return;
      }
      if (ctrlKey && e.key === '0') {
        e.preventDefault();
        setZoom(1);
        return;
      }
      // Export
      if (ctrlKey && k === 'e') {
        e.preventDefault();
        onExport?.();
        return;
      }
      // Arrow nudge — Fabric `obj.set` doesn't fire `object:modified`, so we
      // also push the new left/top into the store. Without this, nudged
      // positions are visible on the canvas but never make it into the
      // saved design payload and revert on the next reload.
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (selectedLayers.length > 0) {
          e.preventDefault();
          const distance = e.shiftKey ? 10 : 1;
          selectedLayers.forEach((obj) => {
            const left = (obj.left as number | undefined) ?? 0;
            const top = (obj.top as number | undefined) ?? 0;
            let nextLeft = left;
            let nextTop = top;
            switch (e.key) {
              case 'ArrowLeft':
                nextLeft = left - distance;
                break;
              case 'ArrowRight':
                nextLeft = left + distance;
                break;
              case 'ArrowUp':
                nextTop = top - distance;
                break;
              case 'ArrowDown':
                nextTop = top + distance;
                break;
            }
            obj.set('left', nextLeft);
            obj.set('top', nextTop);
            // Keep the bounding-box / coords in sync so the next nudge reads
            // the updated position.
            (obj as unknown as { setCoords?: () => void }).setCoords?.();
            const id =
              (obj as unknown as { data?: { id?: string } }).data?.id ||
              (obj as unknown as { id?: string }).id;
            if (id) updateLayer(id, { left: nextLeft, top: nextTop });
          });
          canvas?.renderAll();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    enabled,
    canvas,
    selectedLayers,
    undo,
    redo,
    canUndo,
    canRedo,
    copySelectedLayers,
    pasteLayersFromClipboard,
    removeLayer,
    duplicateLayer,
    selectAllLayers,
    reorderLayer,
    setZoom,
    zoom,
    onSave,
    onExport,
    onDeleteLayer,
    onToggleHelp,
    updateLayer,
  ]);
}

export default useKeyboardShortcuts;
