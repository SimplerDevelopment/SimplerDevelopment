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
  onBlockClicked: (blockId: string) => void;
  onBlockHovered: (blockId: string | null) => void;
  onBlocksReordered?: (blocks: Block[]) => void;
  onAddBlockAfter?: (blockId: string) => void;
}

export function useVisualEditorParent({
  blocks,
  selectedBlockId,
  pageSettings,
  onBlockClicked,
  onBlockHovered,
  onBlocksReordered,
}: UseVisualEditorParentOptions) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [customComponents, setCustomComponents] = useState<ComponentManifestEntry[]>([]);

  // Store latest values in refs so the message handler always has current data
  const blocksRef = useRef(blocks);
  const selectedRef = useRef(selectedBlockId);
  const settingsRef = useRef(pageSettings);
  const onClickedRef = useRef(onBlockClicked);
  const onHoveredRef = useRef(onBlockHovered);
  const onReorderedRef = useRef(onBlocksReordered);
  const onAddAfterRef = useRef(onAddBlockAfter);
  blocksRef.current = blocks;
  selectedRef.current = selectedBlockId;
  settingsRef.current = pageSettings;
  onClickedRef.current = onBlockClicked;
  onHoveredRef.current = onBlockHovered;
  onReorderedRef.current = onBlocksReordered;
  onAddAfterRef.current = onAddBlockAfter;

  // Send EDITOR_INIT to the iframe
  const sendInit = useCallback(() => {
    sendToIframe(iframeRef.current, PARENT_MESSAGES.EDITOR_INIT, {
      blocks: blocksRef.current,
      selectedBlockId: selectedRef.current,
      pageSettings: settingsRef.current,
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
          setIframeReady(true);
          const payload = event.data.payload as IframeReadyPayload;
          if (payload.registeredComponents?.length) {
            setCustomComponents(payload.registeredComponents);
          }
          sendInit();
          break;
        }
        case IFRAME_MESSAGES.BLOCK_CLICKED: {
          const payload = event.data.payload as BlockClickedPayload;
          onClickedRef.current(payload.blockId);
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
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [sendInit]);

  // When the iframe loads (or reloads), send EDITOR_INIT proactively
  // This handles the race where IFRAME_READY fires before our listener is attached
  const handleIframeLoad = useCallback(() => {
    // Give the iframe's React a moment to hydrate and attach its listener
    setTimeout(() => {
      sendInit();
      setIframeReady(true);
    }, 500);
  }, [sendInit]);

  // Send block updates when blocks change
  const sendBlocksUpdate = useCallback(
    (updatedBlocks: Block[]) => {
      if (!iframeReady) return;
      sendToIframe(iframeRef.current, PARENT_MESSAGES.BLOCKS_UPDATE, {
        blocks: updatedBlocks,
      } satisfies BlocksUpdatePayload);
    },
    [iframeReady],
  );

  // Send selection changes
  const sendSelectBlock = useCallback(
    (blockId: string | null) => {
      if (!iframeReady) return;
      sendToIframe(iframeRef.current, PARENT_MESSAGES.SELECT_BLOCK, {
        blockId,
      } satisfies SelectBlockPayload);
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

  return {
    iframeRef,
    iframeReady,
    customComponents,
    sendBlocksUpdate,
    sendSelectBlock,
    sendHoverBlock,
    handleIframeLoad,
  };
}
