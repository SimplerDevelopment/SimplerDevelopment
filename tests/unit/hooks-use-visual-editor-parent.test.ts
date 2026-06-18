// @vitest-environment jsdom
/**
 * Unit tests for useVisualEditorParent.
 *
 * Strategy:
 *   - Mock `sendToIframe` from lib/visual-editor/protocol so we can assert
 *     which messages the hook sends without needing a real iframe.
 *   - Mock `isValidOrigin` / `isVisualEditorMessage` so we can control which
 *     MessageEvents pass the guard (real isValidOrigin only accepts localhost
 *     in test, but this keeps tests origin-agnostic).
 *   - Dispatch synthetic MessageEvents to window to drive every inbound
 *     IFRAME_MESSAGES branch.
 *   - Use renderHook + act from @testing-library/react.
 *   - Exercise: mount (listener registered), each inbound message type, each
 *     returned action (iframeReady guard + correct postMessage args), cleanup
 *     (listener removed).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ── mock protocol helpers ─────────────────────────────────────────────────────
vi.mock(
  '@/lib/visual-editor/protocol',
  () => ({
    isValidOrigin: vi.fn(() => true),
    isVisualEditorMessage: vi.fn(() => true),
    sendToIframe: vi.fn(),
  }),
);

import {
  isValidOrigin,
  isVisualEditorMessage,
  sendToIframe,
} from '@/lib/visual-editor/protocol';

import { useVisualEditorParent } from '@/lib/visual-editor/useVisualEditorParent';
import { IFRAME_MESSAGES, PARENT_MESSAGES } from '@/types/visual-editor';
import type { Block } from '@/types/blocks';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeBlock(id = 'block-1'): Block {
  return { id, type: 'text', values: {}, elementStyles: {} } as Block;
}

/** Build a valid inbound MessageEvent (from the iframe side). */
function makeIframeEvent(type: string, payload: unknown): MessageEvent {
  return new MessageEvent('message', {
    origin: 'http://localhost:3000',
    data: {
      source: 'sd-editor-iframe',
      type,
      payload,
      timestamp: Date.now(),
    },
  });
}

function dispatchIframeEvent(type: string, payload: unknown): void {
  window.dispatchEvent(makeIframeEvent(type, payload));
}

// Default callback stubs
function makeCallbacks() {
  return {
    onBlockClicked: vi.fn(),
    onBlockHovered: vi.fn(),
    onBlocksReordered: vi.fn(),
    onAddBlockAfter: vi.fn(),
    onBlockResized: vi.fn(),
    onBlockStyleUpdated: vi.fn(),
    onColumnResized: vi.fn(),
    onGapChanged: vi.fn(),
    onBlockContentUpdated: vi.fn(),
    onBlockContextMenu: vi.fn(),
    onCopyBlocks: vi.fn(),
    onPasteBlocks: vi.fn(),
    onRequestImagePicker: vi.fn(),
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('useVisualEditorParent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isValidOrigin).mockReturnValue(true);
    vi.mocked(isVisualEditorMessage).mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── mount / cleanup ─────────────────────────────────────────────────────────

  it('registers a message listener on mount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const cbs = makeCallbacks();
    renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );
    expect(addSpy).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('removes the message listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const cbs = makeCallbacks();
    const { unmount } = renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('returns iframeReady=false initially', () => {
    const cbs = makeCallbacks();
    const { result } = renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );
    expect(result.current.iframeReady).toBe(false);
  });

  it('returns iframeRef, customComponents, undoRedoState in initial state', () => {
    const cbs = makeCallbacks();
    const { result } = renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );
    expect(result.current.iframeRef).toBeDefined();
    expect(result.current.customComponents).toEqual([]);
    expect(result.current.undoRedoState).toEqual({ canUndo: false, canRedo: false });
  });

  // ── guard: invalid origin / non-visual-editor message ───────────────────────

  it('ignores messages with invalid origin', () => {
    vi.mocked(isValidOrigin).mockReturnValue(false);
    const cbs = makeCallbacks();
    renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );
    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.BLOCK_CLICKED, { blockId: 'b1' });
    });
    expect(cbs.onBlockClicked).not.toHaveBeenCalled();
  });

  it('ignores messages that are not visual-editor messages', () => {
    vi.mocked(isVisualEditorMessage).mockReturnValue(false);
    const cbs = makeCallbacks();
    renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );
    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.BLOCK_CLICKED, { blockId: 'b1' });
    });
    expect(cbs.onBlockClicked).not.toHaveBeenCalled();
  });

  it('ignores messages from the wrong source', () => {
    const cbs = makeCallbacks();
    renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );
    act(() => {
      // source is 'sd-editor-parent' — not 'sd-editor-iframe'
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'http://localhost:3000',
          data: {
            source: 'sd-editor-parent',
            type: IFRAME_MESSAGES.BLOCK_CLICKED,
            payload: { blockId: 'b1' },
            timestamp: Date.now(),
          },
        }),
      );
    });
    expect(cbs.onBlockClicked).not.toHaveBeenCalled();
  });

  // ── IFRAME_READY ─────────────────────────────────────────────────────────────

  it('IFRAME_READY: sets iframeReady=true and calls sendInit (sendToIframe with EDITOR_INIT)', () => {
    const cbs = makeCallbacks();
    const { result } = renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.IFRAME_READY, { registeredComponents: [] });
    });

    expect(result.current.iframeReady).toBe(true);
    expect(sendToIframe).toHaveBeenCalledWith(
      null, // iframeRef.current is null in renderHook (no real DOM iframe)
      PARENT_MESSAGES.EDITOR_INIT,
      expect.objectContaining({ blocks: [], selectedBlockId: null }),
    );
  });

  it('IFRAME_READY: populates customComponents when registeredComponents are provided', () => {
    const cbs = makeCallbacks();
    const { result } = renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    const component = { name: 'MyCard', description: 'A card', inputs: [], defaultProps: {} };
    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.IFRAME_READY, {
        registeredComponents: [component],
      });
    });

    expect(result.current.customComponents).toEqual([component]);
  });

  it('IFRAME_READY: skips setCustomComponents when registeredComponents is empty', () => {
    const cbs = makeCallbacks();
    const { result } = renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.IFRAME_READY, { registeredComponents: [] });
    });

    // customComponents should remain []
    expect(result.current.customComponents).toEqual([]);
  });

  it('IFRAME_READY: includes pageSettings and typeTemplate in EDITOR_INIT payload', () => {
    const cbs = makeCallbacks();
    const pageSettings = { backgroundColor: '#fff' } as never;
    renderHook(() =>
      useVisualEditorParent({
        blocks: [],
        selectedBlockId: null,
        pageSettings,
        typeTemplate: '{"blocks":[]}',
        ...cbs,
      }),
    );

    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.IFRAME_READY, { registeredComponents: [] });
    });

    expect(sendToIframe).toHaveBeenCalledWith(
      null,
      PARENT_MESSAGES.EDITOR_INIT,
      expect.objectContaining({
        pageSettings,
        typeTemplate: '{"blocks":[]}',
      }),
    );
  });

  // ── BLOCK_CLICKED ─────────────────────────────────────────────────────────────

  it('BLOCK_CLICKED: calls onBlockClicked with blockId', () => {
    const cbs = makeCallbacks();
    renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.BLOCK_CLICKED, { blockId: 'b1' });
    });

    expect(cbs.onBlockClicked).toHaveBeenCalledWith('b1', undefined);
  });

  it('BLOCK_CLICKED: forwards modifiers to onBlockClicked', () => {
    const cbs = makeCallbacks();
    renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.BLOCK_CLICKED, {
        blockId: 'b2',
        modifiers: { shiftKey: true, metaKey: false, ctrlKey: false },
      });
    });

    expect(cbs.onBlockClicked).toHaveBeenCalledWith('b2', {
      shiftKey: true,
      metaKey: false,
      ctrlKey: false,
    });
  });

  // ── BLOCK_HOVERED ─────────────────────────────────────────────────────────────

  it('BLOCK_HOVERED: calls onBlockHovered with blockId', () => {
    const cbs = makeCallbacks();
    renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.BLOCK_HOVERED, { blockId: 'b3' });
    });

    expect(cbs.onBlockHovered).toHaveBeenCalledWith('b3');
  });

  it('BLOCK_HOVERED: passes null blockId when hovering nothing', () => {
    const cbs = makeCallbacks();
    renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.BLOCK_HOVERED, { blockId: null });
    });

    expect(cbs.onBlockHovered).toHaveBeenCalledWith(null);
  });

  // ── COMPONENT_REGISTRY ────────────────────────────────────────────────────────

  it('COMPONENT_REGISTRY: updates customComponents state', () => {
    const cbs = makeCallbacks();
    const { result } = renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    const components = [{ name: 'Foo', description: '', inputs: [], defaultProps: {} }];
    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.COMPONENT_REGISTRY, { components });
    });

    expect(result.current.customComponents).toEqual(components);
  });

  // ── BLOCKS_REORDERED ──────────────────────────────────────────────────────────

  it('BLOCKS_REORDERED: calls onBlocksReordered with blocks array', () => {
    const cbs = makeCallbacks();
    const blocks = [makeBlock('a'), makeBlock('b')];
    renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.BLOCKS_REORDERED, { blocks });
    });

    expect(cbs.onBlocksReordered).toHaveBeenCalledWith(blocks);
  });

  it('BLOCKS_REORDERED: no-ops when onBlocksReordered is not provided', () => {
    const { onBlocksReordered: _, ...cbsNoReorder } = makeCallbacks();
    expect(() => {
      renderHook(() =>
        useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbsNoReorder }),
      );
      act(() => {
        dispatchIframeEvent(IFRAME_MESSAGES.BLOCKS_REORDERED, { blocks: [] });
      });
    }).not.toThrow();
  });

  // ── ADD_BLOCK_AFTER ───────────────────────────────────────────────────────────

  it('ADD_BLOCK_AFTER: calls onAddBlockAfter with blockId', () => {
    const cbs = makeCallbacks();
    renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.ADD_BLOCK_AFTER, { blockId: 'after-me' });
    });

    expect(cbs.onAddBlockAfter).toHaveBeenCalledWith('after-me');
  });

  // ── BLOCK_RESIZED ─────────────────────────────────────────────────────────────

  it('BLOCK_RESIZED: calls onBlockResized with blockId + dimensions', () => {
    const cbs = makeCallbacks();
    renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.BLOCK_RESIZED, {
        blockId: 'r1',
        width: '200px',
        height: '100px',
      });
    });

    expect(cbs.onBlockResized).toHaveBeenCalledWith('r1', '200px', '100px');
  });

  it('BLOCK_RESIZED: passes undefined when width/height are absent', () => {
    const cbs = makeCallbacks();
    renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.BLOCK_RESIZED, { blockId: 'r1' });
    });

    expect(cbs.onBlockResized).toHaveBeenCalledWith('r1', undefined, undefined);
  });

  // ── BLOCK_STYLE_UPDATED ───────────────────────────────────────────────────────

  it('BLOCK_STYLE_UPDATED: calls onBlockStyleUpdated with blockId + style map', () => {
    const cbs = makeCallbacks();
    renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    const style = { color: 'red', fontSize: '14px' };
    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.BLOCK_STYLE_UPDATED, { blockId: 's1', style });
    });

    expect(cbs.onBlockStyleUpdated).toHaveBeenCalledWith('s1', style);
  });

  // ── COLUMN_RESIZED ────────────────────────────────────────────────────────────

  it('COLUMN_RESIZED: calls onColumnResized with blockId + columnWidths', () => {
    const cbs = makeCallbacks();
    renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.COLUMN_RESIZED, {
        blockId: 'col1',
        columnWidths: [50, 50],
      });
    });

    expect(cbs.onColumnResized).toHaveBeenCalledWith('col1', [50, 50]);
  });

  // ── GAP_CHANGED ───────────────────────────────────────────────────────────────

  it('GAP_CHANGED: calls onGapChanged with blockId + gap', () => {
    const cbs = makeCallbacks();
    renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.GAP_CHANGED, { blockId: 'g1', gap: 'lg' });
    });

    expect(cbs.onGapChanged).toHaveBeenCalledWith('g1', 'lg');
  });

  // ── UNDO_REDO_STATE ───────────────────────────────────────────────────────────

  it('UNDO_REDO_STATE: updates undoRedoState', () => {
    const cbs = makeCallbacks();
    const { result } = renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.UNDO_REDO_STATE, { canUndo: true, canRedo: false });
    });

    expect(result.current.undoRedoState).toEqual({ canUndo: true, canRedo: false });
  });

  it('UNDO_REDO_STATE: both flags can be true simultaneously', () => {
    const cbs = makeCallbacks();
    const { result } = renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.UNDO_REDO_STATE, { canUndo: true, canRedo: true });
    });

    expect(result.current.undoRedoState).toEqual({ canUndo: true, canRedo: true });
  });

  // ── EXTERNAL_DROP_COMPLETED ───────────────────────────────────────────────────

  it('EXTERNAL_DROP_COMPLETED: calls onBlocksReordered with blocks', () => {
    const cbs = makeCallbacks();
    const blocks = [makeBlock('x')];
    renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.EXTERNAL_DROP_COMPLETED, { blocks });
    });

    expect(cbs.onBlocksReordered).toHaveBeenCalledWith(blocks);
  });

  // ── BLOCK_CONTENT_UPDATED ─────────────────────────────────────────────────────

  it('BLOCK_CONTENT_UPDATED: calls onBlockContentUpdated with blockId, field, value', () => {
    const cbs = makeCallbacks();
    renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.BLOCK_CONTENT_UPDATED, {
        blockId: 'cu1',
        field: 'title',
        value: 'Hello',
      });
    });

    expect(cbs.onBlockContentUpdated).toHaveBeenCalledWith('cu1', 'title', 'Hello');
  });

  // ── BLOCK_CONTEXT_MENU ────────────────────────────────────────────────────────

  it('BLOCK_CONTEXT_MENU: calls onBlockContextMenu with blockId, x, y', () => {
    const cbs = makeCallbacks();
    renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.BLOCK_CONTEXT_MENU, {
        blockId: 'cm1',
        x: 100,
        y: 200,
      });
    });

    expect(cbs.onBlockContextMenu).toHaveBeenCalledWith('cm1', 100, 200, undefined);
  });

  it('BLOCK_CONTEXT_MENU: forwards modifiers to onBlockContextMenu', () => {
    const cbs = makeCallbacks();
    renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    const modifiers = { shiftKey: false, metaKey: true, ctrlKey: false };
    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.BLOCK_CONTEXT_MENU, {
        blockId: 'cm2',
        x: 10,
        y: 20,
        modifiers,
      });
    });

    expect(cbs.onBlockContextMenu).toHaveBeenCalledWith('cm2', 10, 20, modifiers);
  });

  // ── COPY_BLOCKS ───────────────────────────────────────────────────────────────

  it('COPY_BLOCKS: calls onCopyBlocks', () => {
    const cbs = makeCallbacks();
    renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.COPY_BLOCKS, {});
    });

    expect(cbs.onCopyBlocks).toHaveBeenCalledTimes(1);
  });

  it('COPY_BLOCKS: no-ops gracefully when onCopyBlocks not provided', () => {
    const { onCopyBlocks: _, ...cbsNoCopy } = makeCallbacks();
    expect(() => {
      renderHook(() =>
        useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbsNoCopy }),
      );
      act(() => {
        dispatchIframeEvent(IFRAME_MESSAGES.COPY_BLOCKS, {});
      });
    }).not.toThrow();
  });

  // ── PASTE_BLOCKS ──────────────────────────────────────────────────────────────

  it('PASTE_BLOCKS: calls onPasteBlocks', () => {
    const cbs = makeCallbacks();
    renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.PASTE_BLOCKS, {});
    });

    expect(cbs.onPasteBlocks).toHaveBeenCalledTimes(1);
  });

  // ── REQUEST_IMAGE_PICKER ──────────────────────────────────────────────────────

  it('REQUEST_IMAGE_PICKER: calls onRequestImagePicker with blockId, field, currentValue', () => {
    const cbs = makeCallbacks();
    renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.REQUEST_IMAGE_PICKER, {
        blockId: 'ip1',
        field: 'heroImage',
        currentValue: 'https://example.com/img.jpg',
      });
    });

    expect(cbs.onRequestImagePicker).toHaveBeenCalledWith(
      'ip1',
      'heroImage',
      'https://example.com/img.jpg',
    );
  });

  // ── returned actions: iframeReady guard ──────────────────────────────────────

  it('sendBlocksUpdate: no-ops when iframeReady=false', () => {
    const cbs = makeCallbacks();
    const { result } = renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      result.current.sendBlocksUpdate([makeBlock()]);
    });

    expect(sendToIframe).not.toHaveBeenCalled();
  });

  it('sendSelectBlock: no-ops when iframeReady=false', () => {
    const cbs = makeCallbacks();
    const { result } = renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      result.current.sendSelectBlock('b1');
    });

    expect(sendToIframe).not.toHaveBeenCalled();
  });

  it('sendHoverBlock: no-ops when iframeReady=false', () => {
    const cbs = makeCallbacks();
    const { result } = renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      result.current.sendHoverBlock('b1');
    });

    expect(sendToIframe).not.toHaveBeenCalled();
  });

  it('sendUndo: no-ops when iframeReady=false', () => {
    const cbs = makeCallbacks();
    const { result } = renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      result.current.sendUndo();
    });

    expect(sendToIframe).not.toHaveBeenCalled();
  });

  it('sendRedo: no-ops when iframeReady=false', () => {
    const cbs = makeCallbacks();
    const { result } = renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      result.current.sendRedo();
    });

    expect(sendToIframe).not.toHaveBeenCalled();
  });

  it('sendExternalDragStart: no-ops when iframeReady=false', () => {
    const cbs = makeCallbacks();
    const { result } = renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      result.current.sendExternalDragStart('text');
    });

    expect(sendToIframe).not.toHaveBeenCalled();
  });

  it('sendExternalDragMove: no-ops when iframeReady=false', () => {
    const cbs = makeCallbacks();
    const { result } = renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      result.current.sendExternalDragMove(10, 20);
    });

    expect(sendToIframe).not.toHaveBeenCalled();
  });

  it('sendExternalDragEnd: no-ops when iframeReady=false', () => {
    const cbs = makeCallbacks();
    const { result } = renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      result.current.sendExternalDragEnd(10, 20);
    });

    expect(sendToIframe).not.toHaveBeenCalled();
  });

  it('sendExternalDragCancel: no-ops when iframeReady=false', () => {
    const cbs = makeCallbacks();
    const { result } = renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      result.current.sendExternalDragCancel();
    });

    expect(sendToIframe).not.toHaveBeenCalled();
  });

  it('sendCustomCodeUpdate: no-ops when iframeReady=false', () => {
    const cbs = makeCallbacks();
    const { result } = renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      result.current.sendCustomCodeUpdate('body{}', 'console.log(1)');
    });

    expect(sendToIframe).not.toHaveBeenCalled();
  });

  // ── returned actions: post-ready messages ────────────────────────────────────

  /** Fire IFRAME_READY first so iframeReady=true, then test each send action. */
  function makeReadyHook(overrides: Parameters<typeof useVisualEditorParent>[0] = {
    blocks: [],
    selectedBlockId: null,
    ...makeCallbacks(),
  }) {
    const rendered = renderHook(() => useVisualEditorParent(overrides));
    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.IFRAME_READY, { registeredComponents: [] });
    });
    // Clear the EDITOR_INIT call that fires during IFRAME_READY
    vi.mocked(sendToIframe).mockClear();
    return rendered;
  }

  it('sendBlocksUpdate: calls sendToIframe with BLOCKS_UPDATE + blocks', () => {
    const cbs = makeCallbacks();
    const { result } = makeReadyHook({ blocks: [], selectedBlockId: null, ...cbs });
    const blocks = [makeBlock()];

    act(() => {
      result.current.sendBlocksUpdate(blocks);
    });

    expect(sendToIframe).toHaveBeenCalledWith(
      null,
      PARENT_MESSAGES.BLOCKS_UPDATE,
      expect.objectContaining({ blocks, coalesce: false }),
    );
  });

  it('sendBlocksUpdate: passes coalesce:true when option is set', () => {
    const cbs = makeCallbacks();
    const { result } = makeReadyHook({ blocks: [], selectedBlockId: null, ...cbs });

    act(() => {
      result.current.sendBlocksUpdate([], { coalesce: true });
    });

    expect(sendToIframe).toHaveBeenCalledWith(
      null,
      PARENT_MESSAGES.BLOCKS_UPDATE,
      expect.objectContaining({ coalesce: true }),
    );
  });

  it('sendSelectBlock: calls sendToIframe with SELECT_BLOCK + blockId', () => {
    const cbs = makeCallbacks();
    const { result } = makeReadyHook({ blocks: [], selectedBlockId: null, ...cbs });

    act(() => {
      result.current.sendSelectBlock('sel-1');
    });

    expect(sendToIframe).toHaveBeenCalledWith(
      null,
      PARENT_MESSAGES.SELECT_BLOCK,
      expect.objectContaining({ blockId: 'sel-1' }),
    );
  });

  it('sendSelectBlock: accepts null blockId', () => {
    const cbs = makeCallbacks();
    const { result } = makeReadyHook({ blocks: [], selectedBlockId: null, ...cbs });

    act(() => {
      result.current.sendSelectBlock(null);
    });

    expect(sendToIframe).toHaveBeenCalledWith(
      null,
      PARENT_MESSAGES.SELECT_BLOCK,
      expect.objectContaining({ blockId: null }),
    );
  });

  it('sendSelectBlock: forwards optional selectedBlockIds array', () => {
    const cbs = makeCallbacks();
    const { result } = makeReadyHook({ blocks: [], selectedBlockId: null, ...cbs });

    act(() => {
      result.current.sendSelectBlock('a', ['a', 'b']);
    });

    expect(sendToIframe).toHaveBeenCalledWith(
      null,
      PARENT_MESSAGES.SELECT_BLOCK,
      expect.objectContaining({ selectedBlockIds: ['a', 'b'] }),
    );
  });

  it('sendHoverBlock: calls sendToIframe with HOVER_BLOCK + blockId', () => {
    const cbs = makeCallbacks();
    const { result } = makeReadyHook({ blocks: [], selectedBlockId: null, ...cbs });

    act(() => {
      result.current.sendHoverBlock('hov-1');
    });

    expect(sendToIframe).toHaveBeenCalledWith(
      null,
      PARENT_MESSAGES.HOVER_BLOCK,
      expect.objectContaining({ blockId: 'hov-1' }),
    );
  });

  it('sendUndo: calls sendToIframe with UNDO', () => {
    const cbs = makeCallbacks();
    const { result } = makeReadyHook({ blocks: [], selectedBlockId: null, ...cbs });

    act(() => {
      result.current.sendUndo();
    });

    expect(sendToIframe).toHaveBeenCalledWith(null, PARENT_MESSAGES.UNDO, {});
  });

  it('sendRedo: calls sendToIframe with REDO', () => {
    const cbs = makeCallbacks();
    const { result } = makeReadyHook({ blocks: [], selectedBlockId: null, ...cbs });

    act(() => {
      result.current.sendRedo();
    });

    expect(sendToIframe).toHaveBeenCalledWith(null, PARENT_MESSAGES.REDO, {});
  });

  it('sendExternalDragStart: calls sendToIframe with EXTERNAL_DRAG_START + blockType', () => {
    const cbs = makeCallbacks();
    const { result } = makeReadyHook({ blocks: [], selectedBlockId: null, ...cbs });

    act(() => {
      result.current.sendExternalDragStart('hero');
    });

    expect(sendToIframe).toHaveBeenCalledWith(
      null,
      PARENT_MESSAGES.EXTERNAL_DRAG_START,
      { blockType: 'hero' },
    );
  });

  it('sendExternalDragMove: calls sendToIframe with EXTERNAL_DRAG_MOVE + coords', () => {
    const cbs = makeCallbacks();
    const { result } = makeReadyHook({ blocks: [], selectedBlockId: null, ...cbs });

    act(() => {
      result.current.sendExternalDragMove(42, 99);
    });

    expect(sendToIframe).toHaveBeenCalledWith(
      null,
      PARENT_MESSAGES.EXTERNAL_DRAG_MOVE,
      { x: 42, y: 99 },
    );
  });

  it('sendExternalDragEnd: calls sendToIframe with EXTERNAL_DRAG_END + coords', () => {
    const cbs = makeCallbacks();
    const { result } = makeReadyHook({ blocks: [], selectedBlockId: null, ...cbs });

    act(() => {
      result.current.sendExternalDragEnd(5, 10);
    });

    expect(sendToIframe).toHaveBeenCalledWith(
      null,
      PARENT_MESSAGES.EXTERNAL_DRAG_END,
      { x: 5, y: 10 },
    );
  });

  it('sendExternalDragCancel: calls sendToIframe with EXTERNAL_DRAG_CANCEL', () => {
    const cbs = makeCallbacks();
    const { result } = makeReadyHook({ blocks: [], selectedBlockId: null, ...cbs });

    act(() => {
      result.current.sendExternalDragCancel();
    });

    expect(sendToIframe).toHaveBeenCalledWith(null, PARENT_MESSAGES.EXTERNAL_DRAG_CANCEL, {});
  });

  it('sendCustomCodeUpdate: calls sendToIframe with CUSTOM_CODE_UPDATE + css/js', () => {
    const cbs = makeCallbacks();
    const { result } = makeReadyHook({ blocks: [], selectedBlockId: null, ...cbs });

    act(() => {
      result.current.sendCustomCodeUpdate('body { color: red; }', 'alert(1)');
    });

    expect(sendToIframe).toHaveBeenCalledWith(
      null,
      PARENT_MESSAGES.CUSTOM_CODE_UPDATE,
      { css: 'body { color: red; }', js: 'alert(1)' },
    );
  });

  // ── handleIframeLoad ──────────────────────────────────────────────────────────

  it('handleIframeLoad: resets iframeReady to false immediately', () => {
    vi.useFakeTimers();
    const cbs = makeCallbacks();
    const { result } = renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    // First make it ready
    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.IFRAME_READY, { registeredComponents: [] });
    });
    expect(result.current.iframeReady).toBe(true);

    // Load should reset it
    act(() => {
      result.current.handleIframeLoad();
    });
    expect(result.current.iframeReady).toBe(false);

    vi.useRealTimers();
  });

  it('handleIframeLoad: fires fallback sendInit after 800ms if IFRAME_READY never arrives', () => {
    vi.useFakeTimers();
    const cbs = makeCallbacks();
    const { result } = renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      result.current.handleIframeLoad();
    });

    expect(result.current.iframeReady).toBe(false);

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(result.current.iframeReady).toBe(true);
    expect(sendToIframe).toHaveBeenCalledWith(
      null,
      PARENT_MESSAGES.EDITOR_INIT,
      expect.any(Object),
    );

    vi.useRealTimers();
  });

  it('handleIframeLoad: skips fallback if IFRAME_READY fires before 800ms', () => {
    vi.useFakeTimers();
    const cbs = makeCallbacks();
    const { result } = renderHook(() =>
      useVisualEditorParent({ blocks: [], selectedBlockId: null, ...cbs }),
    );

    act(() => {
      result.current.handleIframeLoad();
    });

    // IFRAME_READY fires at 400ms — before the 800ms fallback
    act(() => {
      vi.advanceTimersByTime(400);
      dispatchIframeEvent(IFRAME_MESSAGES.IFRAME_READY, { registeredComponents: [] });
    });

    vi.mocked(sendToIframe).mockClear();

    // Advance past the fallback window
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Fallback should NOT have called sendToIframe again
    expect(sendToIframe).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  // ── ref-based callback update (latest-ref pattern) ────────────────────────────

  it('uses the latest onBlockClicked callback even if it changes after mount', () => {
    const cbs = makeCallbacks();
    let currentOnClick = cbs.onBlockClicked;
    const { rerender } = renderHook(() =>
      useVisualEditorParent({
        blocks: [],
        selectedBlockId: null,
        ...cbs,
        onBlockClicked: currentOnClick,
      }),
    );

    const newOnClick = vi.fn();
    currentOnClick = newOnClick;
    rerender();

    act(() => {
      dispatchIframeEvent(IFRAME_MESSAGES.BLOCK_CLICKED, { blockId: 'late' });
    });

    expect(newOnClick).toHaveBeenCalledWith('late', undefined);
    expect(cbs.onBlockClicked).not.toHaveBeenCalled();
  });
});
