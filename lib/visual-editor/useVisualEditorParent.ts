'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isValidOrigin, isVisualEditorMessage, sendToIframe } from './protocol';
import type { Block, PageSettings } from '@/types/blocks';
import {
  PARENT_MESSAGES,
  IFRAME_MESSAGES,
  type ComponentManifestEntry,
  type BlockClickedPayload,
  type BlockHoveredPayload,
  type IframeReadyPayload,
  type ComponentRegistryPayload,
  type EditorInitPayload,
  type BlocksUpdatePayload,
  type SelectBlockPayload,
  type HoverBlockPayload,
} from '@/types/visual-editor';

interface UseVisualEditorParentOptions {
  blocks: Block[];
  selectedBlockId: string | null;
  pageSettings?: PageSettings;
  /** Post-type template JSON ({ blocks, version }) — forwarded to the iframe so
   *  it renders the type's wrapper chrome with the post body in the slot. */
  typeTemplate?: string | null;
  onBlockClicked: (blockId: string, modifiers?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => void;
  onBlockHovered: (blockId: string | null) => void;
  onBlocksReordered?: (blocks: Block[]) => void;
  onAddBlockAfter?: (blockId: string) => void;
  onBlockResized?: (blockId: string, width: string | undefined, height: string | undefined) => void;
  onBlockStyleUpdated?: (blockId: string, style: Record<string, string>) => void;
  onColumnResized?: (blockId: string, columnWidths: number[]) => void;
  onGapChanged?: (blockId: string, gap: 'sm' | 'md' | 'lg') => void;
  onBlockContentUpdated?: (blockId: string, field: string, value: string) => void;
  onBlockContextMenu?: (blockId: string, x: number, y: number, modifiers?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => void;
  /** Iframe forwarded a Cmd+C — parent runs its localStorage copy. */
  onCopyBlocks?: () => void;
  /** Iframe forwarded a Cmd+V — parent reads its clipboard and inserts. */
  onPasteBlocks?: () => void;
  /** Iframe clicked an editable image — parent opens MediaPicker for the field. */
  onRequestImagePicker?: (blockId: string, field: string, currentValue: string) => void;
}

export function useVisualEditorParent({
  blocks,
  selectedBlockId,
  pageSettings,
  typeTemplate,
  onBlockClicked,
  onBlockHovered,
  onBlocksReordered,
  onAddBlockAfter,
  onBlockResized,
  onBlockStyleUpdated,
  onColumnResized,
  onGapChanged,
  onBlockContentUpdated,
  onBlockContextMenu,
  onCopyBlocks,
  onPasteBlocks,
  onRequestImagePicker,
}: UseVisualEditorParentOptions) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeReady, setIframeReady] = useState(false);
  // Mirrors iframeReady for use inside the load fallback — avoids reading
  // state inside a setter callback and decouples it from re-renders.
  const iframeReadyRef = useRef(false);
  const [customComponents, setCustomComponents] = useState<ComponentManifestEntry[]>([]);
  const [undoRedoState, setUndoRedoState] = useState({ canUndo: false, canRedo: false });

  // Store latest values in refs so the message handler always has current data
  const blocksRef = useRef(blocks);
  const selectedRef = useRef(selectedBlockId);
  const settingsRef = useRef(pageSettings);
  const typeTemplateRef = useRef(typeTemplate ?? null);
  const onClickedRef = useRef(onBlockClicked);
  const onHoveredRef = useRef(onBlockHovered);
  const onReorderedRef = useRef(onBlocksReordered);
  const onAddAfterRef = useRef(onAddBlockAfter);
  const onResizedRef = useRef(onBlockResized);
  const onStyleUpdatedRef = useRef(onBlockStyleUpdated);
  const onColumnResizedRef = useRef(onColumnResized);
  const onGapChangedRef = useRef(onGapChanged);
  const onContentUpdatedRef = useRef(onBlockContentUpdated);
  const onContextMenuRef = useRef(onBlockContextMenu);
  const onCopyBlocksRef = useRef(onCopyBlocks);
  const onPasteBlocksRef = useRef(onPasteBlocks);
  const onRequestImagePickerRef = useRef(onRequestImagePicker);
  blocksRef.current = blocks;
  selectedRef.current = selectedBlockId;
  settingsRef.current = pageSettings;
  typeTemplateRef.current = typeTemplate ?? null;
  onClickedRef.current = onBlockClicked;
  onHoveredRef.current = onBlockHovered;
  onReorderedRef.current = onBlocksReordered;
  onAddAfterRef.current = onAddBlockAfter;
  onResizedRef.current = onBlockResized;
  onStyleUpdatedRef.current = onBlockStyleUpdated;
  onColumnResizedRef.current = onColumnResized;
  onGapChangedRef.current = onGapChanged;
  onContentUpdatedRef.current = onBlockContentUpdated;
  onContextMenuRef.current = onBlockContextMenu;
  onCopyBlocksRef.current = onCopyBlocks;
  onPasteBlocksRef.current = onPasteBlocks;
  onRequestImagePickerRef.current = onRequestImagePicker;

  // Send EDITOR_INIT to the iframe
  const sendInit = useCallback(() => {
    sendToIframe(iframeRef.current, PARENT_MESSAGES.EDITOR_INIT, {
      blocks: blocksRef.current,
      selectedBlockId: selectedRef.current,
      pageSettings: settingsRef.current,
      typeTemplate: typeTemplateRef.current,
    } satisfies EditorInitPayload);
  }, []);

  // Listen for messages from iframe (stable listener — no deps that change)
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!isValidOrigin(event.origin)) return;
      if (!isVisualEditorMessage(event.data)) return;
      if (event.data.source !== 'sd-editor-iframe') return;

      switch (event.data.type) {
        case IFRAME_MESSAGES.IFRAME_READY: {
          iframeReadyRef.current = true;
          setIframeReady(true);
          const payload = event.data.payload as IframeReadyPayload;
          if (payload.registeredComponents?.length) {
            setCustomComponents(payload.registeredComponents);
          }
          sendInit();
          break;
        }
        case IFRAME_MESSAGES.BLOCK_CLICKED: {
          const payload = event.data.payload as BlockClickedPayload & { modifiers?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean } };
          onClickedRef.current(payload.blockId, payload.modifiers);
          break;
        }
        case IFRAME_MESSAGES.BLOCK_HOVERED: {
          const payload = event.data.payload as BlockHoveredPayload;
          onHoveredRef.current(payload.blockId);
          break;
        }
        case IFRAME_MESSAGES.COMPONENT_REGISTRY: {
          const payload = event.data.payload as ComponentRegistryPayload;
          setCustomComponents(payload.components);
          break;
        }
        case IFRAME_MESSAGES.BLOCKS_REORDERED: {
          const payload = event.data.payload as { blocks: Block[] };
          onReorderedRef.current?.(payload.blocks);
          break;
        }
        case IFRAME_MESSAGES.ADD_BLOCK_AFTER: {
          const payload = event.data.payload as { blockId: string };
          onAddAfterRef.current?.(payload.blockId);
          break;
        }
        case IFRAME_MESSAGES.BLOCK_RESIZED: {
          const payload = event.data.payload as { blockId: string; width?: string; height?: string };
          onResizedRef.current?.(payload.blockId, payload.width, payload.height);
          break;
        }
        case IFRAME_MESSAGES.BLOCK_STYLE_UPDATED: {
          const payload = event.data.payload as { blockId: string; style: Record<string, string> };
          onStyleUpdatedRef.current?.(payload.blockId, payload.style);
          break;
        }
        case IFRAME_MESSAGES.COLUMN_RESIZED: {
          const payload = event.data.payload as { blockId: string; columnWidths: number[] };
          onColumnResizedRef.current?.(payload.blockId, payload.columnWidths);
          break;
        }
        case IFRAME_MESSAGES.GAP_CHANGED: {
          const payload = event.data.payload as { blockId: string; gap: 'sm' | 'md' | 'lg' };
          onGapChangedRef.current?.(payload.blockId, payload.gap);
          break;
        }
        case IFRAME_MESSAGES.UNDO_REDO_STATE: {
          const payload = event.data.payload as { canUndo: boolean; canRedo: boolean };
          setUndoRedoState(payload);
          break;
        }
        case IFRAME_MESSAGES.EXTERNAL_DROP_COMPLETED: {
          const payload = event.data.payload as { blocks: Block[] };
          onReorderedRef.current?.(payload.blocks);
          break;
        }
        case IFRAME_MESSAGES.BLOCK_CONTENT_UPDATED: {
          const payload = event.data.payload as { blockId: string; field: string; value: string };
          onContentUpdatedRef.current?.(payload.blockId, payload.field, payload.value);
          break;
        }
        case IFRAME_MESSAGES.BLOCK_CONTEXT_MENU: {
          const payload = event.data.payload as { blockId: string; x: number; y: number; modifiers?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean } };
          onContextMenuRef.current?.(payload.blockId, payload.x, payload.y, payload.modifiers);
          break;
        }
        case IFRAME_MESSAGES.COPY_BLOCKS: {
          onCopyBlocksRef.current?.();
          break;
        }
        case IFRAME_MESSAGES.PASTE_BLOCKS: {
          onPasteBlocksRef.current?.();
          break;
        }
        case IFRAME_MESSAGES.REQUEST_IMAGE_PICKER: {
          const payload = event.data.payload as { blockId: string; field: string; currentValue: string };
          onRequestImagePickerRef.current?.(payload.blockId, payload.field, payload.currentValue);
          break;
        }
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [sendInit]);

  // When the iframe loads (or reloads), trust IFRAME_READY to drive the
  // handshake. The iframe's React calls postMessage({type: IFRAME_READY}) as
  // soon as its useEffect attaches, which the message listener above handles
  // by calling sendInit() and setIframeReady(true).
  //
  // Previously this used setTimeout(500ms) as the source of truth, which
  // capped per-slide TTI at half a second even when the iframe was ready
  // in ~50ms. Now we just keep a short fallback for the rare race where
  // the iframe loads but never fires IFRAME_READY (e.g. iframe HTML
  // shipped without the editor harness because of a stale build). 800ms
  // matches the longest hydration we've ever seen in dev profiling, and
  // the work it does (a single postMessage + boolean set) is idempotent
  // if IFRAME_READY also lands.
  const handleIframeLoad = useCallback(() => {
    if (typeof window === 'undefined') return;
    // A reload means the in-iframe React just remounted — wait for its
    // fresh IFRAME_READY. If that never arrives (older bundle, hard
    // error), the fallback below kicks in.
    iframeReadyRef.current = false;
    setIframeReady(false);
    window.setTimeout(() => {
      // If IFRAME_READY already fired we've nothing to do — the listener
      // above already initialized us. Otherwise this is the safety net
      // for the very rare case where the iframe loaded but never posted
      // IFRAME_READY (e.g. an older bundle).
      if (iframeReadyRef.current) return;
      iframeReadyRef.current = true;
      sendInit();
      setIframeReady(true);
    }, 800);
  }, [sendInit]);

  // Send block updates when blocks change. Pass `coalesce: true` for updates
  // generated mid-drag (slider thumb moving, color picker tracking) so the
  // iframe collapses the burst into a single undo entry. Default (false /
  // omitted) treats each call as a discrete history entry — one per panel
  // checkbox, dropdown, button, or text-input commit.
  const sendBlocksUpdate = useCallback(
    (updatedBlocks: Block[], options?: { coalesce?: boolean }) => {
      if (!iframeReady) return;
      sendToIframe(iframeRef.current, PARENT_MESSAGES.BLOCKS_UPDATE, {
        blocks: updatedBlocks,
        coalesce: options?.coalesce ?? false,
      } satisfies BlocksUpdatePayload);
    },
    [iframeReady],
  );

  // Send selection changes
  const sendSelectBlock = useCallback(
    (blockId: string | null, selectedBlockIds?: string[]) => {
      if (!iframeReady) return;
      sendToIframe(iframeRef.current, PARENT_MESSAGES.SELECT_BLOCK, {
        blockId,
        selectedBlockIds,
      } as SelectBlockPayload & { selectedBlockIds?: string[] });
    },
    [iframeReady],
  );

  // Send hover changes
  const sendHoverBlock = useCallback(
    (blockId: string | null) => {
      if (!iframeReady) return;
      sendToIframe(iframeRef.current, PARENT_MESSAGES.HOVER_BLOCK, {
        blockId,
      } satisfies HoverBlockPayload);
    },
    [iframeReady],
  );

  const sendUndo = useCallback(() => {
    if (!iframeReady) return;
    sendToIframe(iframeRef.current, PARENT_MESSAGES.UNDO, {});
  }, [iframeReady]);

  const sendRedo = useCallback(() => {
    if (!iframeReady) return;
    sendToIframe(iframeRef.current, PARENT_MESSAGES.REDO, {});
  }, [iframeReady]);

  // External drag-and-drop from block picker into iframe
  const sendExternalDragStart = useCallback((blockType: string) => {
    if (!iframeReady) return;
    sendToIframe(iframeRef.current, PARENT_MESSAGES.EXTERNAL_DRAG_START, { blockType });
  }, [iframeReady]);

  const sendExternalDragMove = useCallback((x: number, y: number) => {
    if (!iframeReady) return;
    sendToIframe(iframeRef.current, PARENT_MESSAGES.EXTERNAL_DRAG_MOVE, { x, y });
  }, [iframeReady]);

  const sendExternalDragEnd = useCallback((x: number, y: number) => {
    if (!iframeReady) return;
    sendToIframe(iframeRef.current, PARENT_MESSAGES.EXTERNAL_DRAG_END, { x, y });
  }, [iframeReady]);

  const sendExternalDragCancel = useCallback(() => {
    if (!iframeReady) return;
    sendToIframe(iframeRef.current, PARENT_MESSAGES.EXTERNAL_DRAG_CANCEL, {});
  }, [iframeReady]);

  const sendCustomCodeUpdate = useCallback((css: string, js: string) => {
    if (!iframeReady) return;
    sendToIframe(iframeRef.current, PARENT_MESSAGES.CUSTOM_CODE_UPDATE, { css, js });
  }, [iframeReady]);

  return {
    iframeRef,
    iframeReady,
    customComponents,
    sendBlocksUpdate,
    sendSelectBlock,
    sendHoverBlock,
    handleIframeLoad,
    sendUndo,
    sendRedo,
    undoRedoState,
    sendExternalDragStart,
    sendExternalDragMove,
    sendExternalDragEnd,
    sendExternalDragCancel,
    sendCustomCodeUpdate,
  };
}
