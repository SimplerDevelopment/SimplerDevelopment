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
}

export function useVisualEditorParent({
  blocks,
  selectedBlockId,
  pageSettings,
  onBlockClicked,
  onBlockHovered,
}: UseVisualEditorParentOptions) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [customComponents, setCustomComponents] = useState<ComponentManifestEntry[]>([]);

  // Listen for messages from iframe
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
          // Send initial state
          sendToIframe(iframeRef.current, PARENT_MESSAGES.EDITOR_INIT, {
            blocks,
            selectedBlockId,
            pageSettings,
          } satisfies EditorInitPayload);
          break;
        }
        case IFRAME_MESSAGES.BLOCK_CLICKED: {
          const payload = event.data.payload as BlockClickedPayload;
          onBlockClicked(payload.blockId);
          break;
        }
        case IFRAME_MESSAGES.BLOCK_HOVERED: {
          const payload = event.data.payload as BlockHoveredPayload;
          onBlockHovered(payload.blockId);
          break;
        }
        case IFRAME_MESSAGES.COMPONENT_REGISTRY: {
          const payload = event.data.payload as ComponentRegistryPayload;
          setCustomComponents(payload.components);
          break;
        }
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [blocks, selectedBlockId, pageSettings, onBlockClicked, onBlockHovered]);

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
  };
}
