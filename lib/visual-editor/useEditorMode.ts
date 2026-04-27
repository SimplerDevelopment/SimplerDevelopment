'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isValidOrigin, isVisualEditorMessage, sendToParent } from './protocol';
import { PARENT_MESSAGES, IFRAME_MESSAGES } from '@/types/visual-editor';
import type { Block, PageSettings } from '@/types/blocks';
import { getBlockRegistry } from './registry';

export interface ExternalDragState {
  active: boolean;
  blockType: string | null;
  x: number;
  y: number;
}

interface EditorState {
  active: boolean;
  blocks: Block[];
  selectedBlockId: string | null;
  selectedBlockIds: string[];
  hoveredBlockId: string | null;
  pageSettings?: PageSettings;
  externalDrag: ExternalDragState;
}

const MAX_HISTORY = 50;

export function useEditorMode() {
  const [state, setState] = useState<EditorState>({
    active: false,
    blocks: [],
    selectedBlockId: null,
    selectedBlockIds: [],
    hoveredBlockId: null,
    externalDrag: { active: false, blockType: null, x: 0, y: 0 },
  });

  // Undo/redo history
  const historyRef = useRef<Block[][]>([]);
  const futureRef = useRef<Block[][]>([]);
  const skipHistoryRef = useRef(false);
  // Ref to current blocks so the stable message handler can access them
  const blocksRef = useRef<Block[]>(state.blocks);
  blocksRef.current = state.blocks;
  // Track drag sessions so only one history entry is created per drag
  const dragSessionRef = useRef<Block[] | null>(null);
  const dragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushHistory = useCallback((blocks: Block[]) => {
    historyRef.current = [...historyRef.current.slice(-MAX_HISTORY), blocks];
    futureRef.current = [];
  }, []);

  const canUndo = historyRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const prev = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    futureRef.current = [...futureRef.current, state.blocks];
    skipHistoryRef.current = true;
    setState((s) => ({ ...s, blocks: prev }));
    sendToParent(IFRAME_MESSAGES.BLOCKS_REORDERED, { blocks: prev });
  }, [state.blocks]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current[futureRef.current.length - 1];
    futureRef.current = futureRef.current.slice(0, -1);
    historyRef.current = [...historyRef.current, state.blocks];
    skipHistoryRef.current = true;
    setState((s) => ({ ...s, blocks: next }));
    sendToParent(IFRAME_MESSAGES.BLOCKS_REORDERED, { blocks: next });
  }, [state.blocks]);

  // Store undo/redo in refs so the message handler can call them
  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  undoRef.current = undo;
  redoRef.current = redo;

  // Broadcast undo/redo availability to parent
  const prevCanUndo = useRef(false);
  const prevCanRedo = useRef(false);
  useEffect(() => {
    if (!state.active) return;
    if (prevCanUndo.current !== canUndo || prevCanRedo.current !== canRedo) {
      prevCanUndo.current = canUndo;
      prevCanRedo.current = canRedo;
      sendToParent(IFRAME_MESSAGES.UNDO_REDO_STATE, { canUndo, canRedo });
    }
  }, [state.active, canUndo, canRedo]);

  // Detect edit mode and set up listeners
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    if (params.get('_edit') !== 'true') return;

    // We're in edit mode inside an iframe
    setState((s) => ({ ...s, active: true }));

    function handleMessage(event: MessageEvent) {
      if (!isValidOrigin(event.origin)) return;
      if (!isVisualEditorMessage(event.data)) return;
      if (event.data.source !== 'sd-editor-parent') return;

      switch (event.data.type) {
        case PARENT_MESSAGES.EDITOR_INIT: {
          const { blocks, selectedBlockId, pageSettings } = event.data.payload as {
            blocks: Block[];
            selectedBlockId: string | null;
            pageSettings?: PageSettings;
          };
          setState((s) => ({ ...s, blocks, selectedBlockId, pageSettings }));
          break;
        }
        case PARENT_MESSAGES.BLOCKS_UPDATE: {
          const { blocks } = event.data.payload as { blocks: Block[] };
          // Don't overwrite local state during undo/redo
          if (skipHistoryRef.current) {
            skipHistoryRef.current = false;
            setState((s) => ({ ...s, blocks }));
            return;
          }
          // Push current state to history so parent-initiated changes are undoable
          // But only once per rapid sequence (drag batching)
          const currentBlocks = blocksRef.current;
          if (currentBlocks.length > 0 && JSON.stringify(currentBlocks) !== JSON.stringify(blocks)) {
            if (!dragSessionRef.current) {
              dragSessionRef.current = currentBlocks;
              historyRef.current = [...historyRef.current.slice(-MAX_HISTORY), currentBlocks];
              futureRef.current = [];
            }
            // Reset drag session after quiet period
            if (dragTimerRef.current) clearTimeout(dragTimerRef.current);
            dragTimerRef.current = setTimeout(() => { dragSessionRef.current = null; }, 300);
          }
          setState((s) => ({ ...s, blocks }));
          break;
        }
        case PARENT_MESSAGES.SELECT_BLOCK: {
          const { blockId, selectedBlockIds: ids } = event.data.payload as { blockId: string | null; selectedBlockIds?: string[] };
          setState((s) => ({ ...s, selectedBlockId: blockId, selectedBlockIds: ids || (blockId ? [blockId] : []) }));
          break;
        }
        case PARENT_MESSAGES.HOVER_BLOCK: {
          const { blockId } = event.data.payload as { blockId: string | null };
          setState((s) => ({ ...s, hoveredBlockId: blockId }));
          break;
        }
        case PARENT_MESSAGES.EXIT_EDIT_MODE: {
          setState((s) => ({ ...s, active: false }));
          break;
        }
        case PARENT_MESSAGES.PAGE_SETTINGS_UPDATE: {
          const { pageSettings } = event.data.payload as { pageSettings: PageSettings };
          setState((s) => ({ ...s, pageSettings }));
          break;
        }
        case PARENT_MESSAGES.UNDO: {
          undoRef.current();
          break;
        }
        case PARENT_MESSAGES.REDO: {
          redoRef.current();
          break;
        }
        case PARENT_MESSAGES.EXTERNAL_DRAG_START: {
          const { blockType } = event.data.payload as { blockType: string };
          setState((s) => ({ ...s, externalDrag: { active: true, blockType, x: 0, y: 0 } }));
          break;
        }
        case PARENT_MESSAGES.EXTERNAL_DRAG_MOVE: {
          const { x, y } = event.data.payload as { x: number; y: number };
          setState((s) => ({ ...s, externalDrag: { ...s.externalDrag, x, y } }));
          break;
        }
        case PARENT_MESSAGES.EXTERNAL_DRAG_END: {
          const { x, y } = event.data.payload as { x: number; y: number };
          setState((s) => ({ ...s, externalDrag: { ...s.externalDrag, x, y, active: false } }));
          // The BlockRenderer will handle the actual drop via onExternalDrop
          window.dispatchEvent(new CustomEvent('sd-external-drop', { detail: { x, y } }));
          break;
        }
        case PARENT_MESSAGES.EXTERNAL_DRAG_CANCEL: {
          setState((s) => ({ ...s, externalDrag: { active: false, blockType: null, x: 0, y: 0 } }));
          break;
        }
        case PARENT_MESSAGES.CUSTOM_CODE_UPDATE: {
          // Live-inject custom CSS so modal "Apply" updates the iframe without
          // a full reload (which would reset scroll + selection). The injected
          // <style> is appended last so it overrides the SiteBlockRenderer's
          // server-rendered <style> tag for the same rules.
          const { css } = event.data.payload as { css: string; js?: string };
          let liveStyle = document.getElementById('sd-editor-live-css') as HTMLStyleElement | null;
          if (!liveStyle) {
            liveStyle = document.createElement('style');
            liveStyle.id = 'sd-editor-live-css';
            document.head.appendChild(liveStyle);
          }
          liveStyle.textContent = css || '';
          // JS is intentionally not re-run here — re-executing custom JS in a
          // live-running iframe risks duplicate event listeners and polluted
          // globals. JS changes still take effect on the next iframe reload.
          break;
        }
      }
    }

    window.addEventListener('message', handleMessage);

    // Send ready signal with registered components
    const registry = getBlockRegistry();
    const manifests = registry.getCustomManifests();
    sendToParent(IFRAME_MESSAGES.IFRAME_READY, { registeredComponents: manifests });

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const onBlockClicked = useCallback(
    (blockId: string, modifiers?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => {
      if (!state.active) return;
      setState((s) => ({ ...s, selectedBlockId: blockId }));
      sendToParent(IFRAME_MESSAGES.BLOCK_CLICKED, { blockId, modifiers });
    },
    [state.active],
  );

  const onBlockHovered = useCallback(
    (blockId: string | null) => {
      if (!state.active) return;
      setState((s) => ({ ...s, hoveredBlockId: blockId }));
      sendToParent(IFRAME_MESSAGES.BLOCK_HOVERED, { blockId });
    },
    [state.active],
  );

  const onBlocksReordered = useCallback(
    (newBlocks: Block[]) => {
      if (!state.active) return;
      pushHistory(state.blocks);
      setState((s) => ({ ...s, blocks: newBlocks }));
      sendToParent(IFRAME_MESSAGES.BLOCKS_REORDERED, { blocks: newBlocks });
    },
    [state.active, state.blocks, pushHistory],
  );

  const onAddBlockAfter = useCallback(
    (blockId: string) => {
      if (!state.active) return;
      sendToParent(IFRAME_MESSAGES.ADD_BLOCK_AFTER, { blockId });
    },
    [state.active],
  );

  const onBlockResized = useCallback(
    (blockId: string, width: string | undefined, height: string | undefined) => {
      if (!state.active) return;
      sendToParent(IFRAME_MESSAGES.BLOCK_RESIZED, { blockId, width, height });
    },
    [state.active],
  );

  const onBlockStyleUpdated = useCallback(
    (blockId: string, style: Record<string, string>) => {
      if (!state.active) return;
      // Recursively update block style (works for nested blocks too)
      const updateStyle = (blocks: Block[]): Block[] =>
        blocks.map(b => {
          if (b.id === blockId) return { ...b, style: { ...(b.style || {}), ...style } };
          if (b.type === 'columns') return { ...b, columns: b.columns.map(c => ({ ...c, blocks: updateStyle(c.blocks) })) };
          if (b.type === 'tabs') return { ...b, tabs: b.tabs.map(t => ({ ...t, blocks: updateStyle(t.blocks) })) };
          if (b.type === 'section') return { ...b, blocks: updateStyle(b.blocks) };
          return b;
        });
      // Only push history once at the start of a drag sequence
      if (!dragSessionRef.current) {
        dragSessionRef.current = state.blocks;
        pushHistory(state.blocks);
      }
      // Reset drag session after a quiet period (drag ended)
      if (dragTimerRef.current) clearTimeout(dragTimerRef.current);
      dragTimerRef.current = setTimeout(() => { dragSessionRef.current = null; }, 300);
      setState((s) => ({ ...s, blocks: updateStyle(s.blocks) }));
      sendToParent(IFRAME_MESSAGES.BLOCK_STYLE_UPDATED, { blockId, style });
    },
    [state.active, state.blocks, pushHistory],
  );

  return {
    ...state,
    onBlockClicked,
    onBlockHovered,
    onBlocksReordered,
    onAddBlockAfter,
    onBlockResized,
    onBlockStyleUpdated,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
