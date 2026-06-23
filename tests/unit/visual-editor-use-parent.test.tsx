/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
/**
 * Unit tests for `lib/visual-editor/useVisualEditorParent.ts` — the parent-side
 * hook of the postMessage visual editor protocol. Exercises listener
 * registration/cleanup, every inbound IFRAME_MESSAGES branch, every outbound
 * action, and the iframeReady guard that gates sends.
 *
 * The iframe is simulated via a fake contentWindow whose postMessage is a spy.
 * Inbound messages are dispatched via window.dispatchEvent(new MessageEvent).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ─── Mock the protocol module ─────────────────────────────────────────────────
// We let isValidOrigin / isVisualEditorMessage run for real (no network/DOM
// dep) but spy on sendToIframe so we can assert postMessage shapes without
// needing a real iframe.

vi.mock('@/lib/visual-editor/protocol', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/visual-editor/protocol')>();
  return {
    ...actual,
    sendToIframe: vi.fn(),
  };
});

import { useVisualEditorParent } from '@/lib/visual-editor/useVisualEditorParent';
import * as protocol from '@/lib/visual-editor/protocol';
import { IFRAME_MESSAGES, PARENT_MESSAGES } from '@/types/visual-editor';

const mockSendToIframe = protocol.sendToIframe as ReturnType<typeof vi.fn>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a well-formed iframe-sourced MessageEvent for window.dispatchEvent */
function iframeMsg(type: string, payload: unknown, origin = 'http://localhost:3001') {
  return new MessageEvent('message', {
    data: {
      source: 'sd-editor-iframe',
      type,
      payload,
      timestamp: 1000,
    },
    origin,
  });
}

/** Minimal block fixture */
const BLOCK_A = { id: 'block-a', type: 'text', values: {}, elementStyles: {} } as any;
const BLOCK_B = { id: 'block-b', type: 'image', values: {}, elementStyles: {} } as any;

/** Default props for the hook — all callbacks are vi.fn() */
function makeProps(overrides: Partial<Parameters<typeof useVisualEditorParent>[0]> = {}) {
  return {
    blocks: [BLOCK_A],
    selectedBlockId: null,
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
    ...overrides,
  };
}

/**
 * Render the hook and simulate the iframe becoming ready by dispatching
 * IFRAME_READY. Returns the renderHook result plus the props used.
 */
function renderReady(overrides: Partial<Parameters<typeof useVisualEditorParent>[0]> = {}) {
  const props = makeProps(overrides);
  const r = renderHook(() => useVisualEditorParent(props as any));

  act(() => {
    window.dispatchEvent(
      iframeMsg(IFRAME_MESSAGES.IFRAME_READY, { registeredComponents: [] }),
    );
  });

  return { ...r, props };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useVisualEditorParent — initial state', () => {
  it('starts with iframeReady=false and empty customComponents', () => {
    const props = makeProps();
    const { result } = renderHook(() => useVisualEditorParent(props as any));
    expect(result.current.iframeReady).toBe(false);
    expect(result.current.customComponents).toEqual([]);
  });

  it('returns a stable iframeRef object', () => {
    const props = makeProps();
    const { result, rerender } = renderHook(() => useVisualEditorParent(props as any));
    const ref1 = result.current.iframeRef;
    rerender();
    expect(result.current.iframeRef).toBe(ref1);
  });

  it('undoRedoState starts as { canUndo: false, canRedo: false }', () => {
    const props = makeProps();
    const { result } = renderHook(() => useVisualEditorParent(props as any));
    expect(result.current.undoRedoState).toEqual({ canUndo: false, canRedo: false });
  });
});

describe('useVisualEditorParent — message listener registration', () => {
  it('registers a message listener on mount and removes it on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const props = makeProps();
    const { unmount } = renderHook(() => useVisualEditorParent(props as any));

    const addedListeners = addSpy.mock.calls.filter(([ev]) => ev === 'message');
    expect(addedListeners).toHaveLength(1);

    unmount();

    const removedListeners = removeSpy.mock.calls.filter(([ev]) => ev === 'message');
    expect(removedListeners).toHaveLength(1);
    // Same handler reference must be passed to both calls
    expect(addedListeners[0][1]).toBe(removedListeners[0][1]);
  });

  it('ignores messages from an invalid origin', () => {
    const props = makeProps();
    renderHook(() => useVisualEditorParent(props as any));

    act(() => {
      window.dispatchEvent(
        iframeMsg(IFRAME_MESSAGES.BLOCK_CLICKED, { blockId: 'block-a' }, 'https://evil.com'),
      );
    });

    expect(props.onBlockClicked).not.toHaveBeenCalled();
  });

  it('ignores messages with the wrong source field', () => {
    const props = makeProps();
    renderHook(() => useVisualEditorParent(props as any));

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            source: 'sd-editor-parent', // wrong — hook only accepts iframe msgs
            type: IFRAME_MESSAGES.BLOCK_CLICKED,
            payload: { blockId: 'block-a' },
            timestamp: 1000,
          },
          origin: 'http://localhost:3001',
        }),
      );
    });

    expect(props.onBlockClicked).not.toHaveBeenCalled();
  });

  it('ignores messages whose data is not a visual-editor envelope', () => {
    const props = makeProps();
    renderHook(() => useVisualEditorParent(props as any));

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { arbitrary: 'noise' },
          origin: 'http://localhost:3001',
        }),
      );
    });

    expect(props.onBlockClicked).not.toHaveBeenCalled();
  });
});

describe('useVisualEditorParent — IFRAME_READY', () => {
  it('sets iframeReady=true when IFRAME_READY arrives', () => {
    const props = makeProps();
    const { result } = renderHook(() => useVisualEditorParent(props as any));
    expect(result.current.iframeReady).toBe(false);

    act(() => {
      window.dispatchEvent(
        iframeMsg(IFRAME_MESSAGES.IFRAME_READY, { registeredComponents: [] }),
      );
    });

    expect(result.current.iframeReady).toBe(true);
  });

  it('calls sendToIframe(EDITOR_INIT) when IFRAME_READY fires', () => {
    const props = makeProps();
    renderHook(() => useVisualEditorParent(props as any));

    act(() => {
      window.dispatchEvent(
        iframeMsg(IFRAME_MESSAGES.IFRAME_READY, { registeredComponents: [] }),
      );
    });

    expect(mockSendToIframe).toHaveBeenCalledWith(
      null, // iframeRef.current is null in jsdom (no real DOM element attached)
      PARENT_MESSAGES.EDITOR_INIT,
      expect.objectContaining({ blocks: [BLOCK_A], selectedBlockId: null }),
    );
  });

  it('populates customComponents from IFRAME_READY payload', () => {
    const component = {
      type: 'hero',
      label: 'Hero',
      icon: 'star',
      category: 'layout',
      description: 'Hero block',
      inputs: [],
      defaultProps: {},
    };
    const props = makeProps();
    const { result } = renderHook(() => useVisualEditorParent(props as any));

    act(() => {
      window.dispatchEvent(
        iframeMsg(IFRAME_MESSAGES.IFRAME_READY, { registeredComponents: [component] }),
      );
    });

    expect(result.current.customComponents).toHaveLength(1);
    expect(result.current.customComponents[0].type).toBe('hero');
  });

  it('does NOT populate customComponents when registeredComponents is empty', () => {
    const props = makeProps();
    const { result } = renderHook(() => useVisualEditorParent(props as any));

    act(() => {
      window.dispatchEvent(
        iframeMsg(IFRAME_MESSAGES.IFRAME_READY, { registeredComponents: [] }),
      );
    });

    expect(result.current.customComponents).toEqual([]);
  });
});

describe('useVisualEditorParent — BLOCK_CLICKED', () => {
  it('calls onBlockClicked with blockId', () => {
    const { props } = renderReady();

    act(() => {
      window.dispatchEvent(
        iframeMsg(IFRAME_MESSAGES.BLOCK_CLICKED, { blockId: 'block-a' }),
      );
    });

    expect(props.onBlockClicked).toHaveBeenCalledWith('block-a', undefined);
  });

  it('forwards modifier keys to onBlockClicked', () => {
    const { props } = renderReady();

    act(() => {
      window.dispatchEvent(
        iframeMsg(IFRAME_MESSAGES.BLOCK_CLICKED, {
          blockId: 'block-a',
          modifiers: { shiftKey: true, metaKey: false, ctrlKey: false },
        }),
      );
    });

    expect(props.onBlockClicked).toHaveBeenCalledWith('block-a', {
      shiftKey: true,
      metaKey: false,
      ctrlKey: false,
    });
  });
});

describe('useVisualEditorParent — BLOCK_HOVERED', () => {
  it('calls onBlockHovered with blockId', () => {
    const { props } = renderReady();

    act(() => {
      window.dispatchEvent(
        iframeMsg(IFRAME_MESSAGES.BLOCK_HOVERED, { blockId: 'block-a' }),
      );
    });

    expect(props.onBlockHovered).toHaveBeenCalledWith('block-a');
  });

  it('calls onBlockHovered with null (hover cleared)', () => {
    const { props } = renderReady();

    act(() => {
      window.dispatchEvent(
        iframeMsg(IFRAME_MESSAGES.BLOCK_HOVERED, { blockId: null }),
      );
    });

    expect(props.onBlockHovered).toHaveBeenCalledWith(null);
  });
});

describe('useVisualEditorParent — COMPONENT_REGISTRY', () => {
  it('replaces customComponents with COMPONENT_REGISTRY payload', () => {
    const { result } = renderReady();
    const newComponent = {
      type: 'footer',
      label: 'Footer',
      icon: 'web',
      category: 'layout',
      description: 'Footer block',
      inputs: [],
      defaultProps: {},
    };

    act(() => {
      window.dispatchEvent(
        iframeMsg(IFRAME_MESSAGES.COMPONENT_REGISTRY, { components: [newComponent] }),
      );
    });

    expect(result.current.customComponents).toHaveLength(1);
    expect(result.current.customComponents[0].type).toBe('footer');
  });
});

describe('useVisualEditorParent — BLOCKS_REORDERED', () => {
  it('calls onBlocksReordered with the new block array', () => {
    const { props } = renderReady();

    act(() => {
      window.dispatchEvent(
        iframeMsg(IFRAME_MESSAGES.BLOCKS_REORDERED, { blocks: [BLOCK_B, BLOCK_A] }),
      );
    });

    expect(props.onBlocksReordered).toHaveBeenCalledWith([BLOCK_B, BLOCK_A]);
  });
});

describe('useVisualEditorParent — ADD_BLOCK_AFTER', () => {
  it('calls onAddBlockAfter with the target blockId', () => {
    const { props } = renderReady();

    act(() => {
      window.dispatchEvent(
        iframeMsg(IFRAME_MESSAGES.ADD_BLOCK_AFTER, { blockId: 'block-a' }),
      );
    });

    expect(props.onAddBlockAfter).toHaveBeenCalledWith('block-a');
  });
});

describe('useVisualEditorParent — BLOCK_RESIZED', () => {
  it('calls onBlockResized with blockId, width, height', () => {
    const { props } = renderReady();

    act(() => {
      window.dispatchEvent(
        iframeMsg(IFRAME_MESSAGES.BLOCK_RESIZED, {
          blockId: 'block-a',
          width: '300px',
          height: '200px',
        }),
      );
    });

    expect(props.onBlockResized).toHaveBeenCalledWith('block-a', '300px', '200px');
  });

  it('calls onBlockResized with undefined width/height when omitted', () => {
    const { props } = renderReady();

    act(() => {
      window.dispatchEvent(
        iframeMsg(IFRAME_MESSAGES.BLOCK_RESIZED, { blockId: 'block-a' }),
      );
    });

    expect(props.onBlockResized).toHaveBeenCalledWith('block-a', undefined, undefined);
  });
});

describe('useVisualEditorParent — BLOCK_STYLE_UPDATED', () => {
  it('calls onBlockStyleUpdated with blockId and style map', () => {
    const { props } = renderReady();
    const style = { color: '#ff0000', fontSize: '16px' };

    act(() => {
      window.dispatchEvent(
        iframeMsg(IFRAME_MESSAGES.BLOCK_STYLE_UPDATED, { blockId: 'block-a', style }),
      );
    });

    expect(props.onBlockStyleUpdated).toHaveBeenCalledWith('block-a', style);
  });
});

describe('useVisualEditorParent — COLUMN_RESIZED', () => {
  it('calls onColumnResized with blockId and column widths', () => {
    const { props } = renderReady();

    act(() => {
      window.dispatchEvent(
        iframeMsg(IFRAME_MESSAGES.COLUMN_RESIZED, {
          blockId: 'block-a',
          columnWidths: [50, 50],
        }),
      );
    });

    expect(props.onColumnResized).toHaveBeenCalledWith('block-a', [50, 50]);
  });
});

describe('useVisualEditorParent — GAP_CHANGED', () => {
  it('calls onGapChanged with blockId and gap value', () => {
    const { props } = renderReady();

    act(() => {
      window.dispatchEvent(
        iframeMsg(IFRAME_MESSAGES.GAP_CHANGED, { blockId: 'block-a', gap: 'md' }),
      );
    });

    expect(props.onGapChanged).toHaveBeenCalledWith('block-a', 'md');
  });
});

describe('useVisualEditorParent — UNDO_REDO_STATE', () => {
  it('updates undoRedoState when UNDO_REDO_STATE arrives', () => {
    const { result } = renderReady();

    act(() => {
      window.dispatchEvent(
        iframeMsg(IFRAME_MESSAGES.UNDO_REDO_STATE, { canUndo: true, canRedo: false }),
      );
    });

    expect(result.current.undoRedoState).toEqual({ canUndo: true, canRedo: false });
  });

  it('updates both canUndo and canRedo independently', () => {
    const { result } = renderReady();

    act(() => {
      window.dispatchEvent(
        iframeMsg(IFRAME_MESSAGES.UNDO_REDO_STATE, { canUndo: true, canRedo: true }),
      );
    });

    expect(result.current.undoRedoState).toEqual({ canUndo: true, canRedo: true });
  });
});

describe('useVisualEditorParent — EXTERNAL_DROP_COMPLETED', () => {
  it('calls onBlocksReordered with blocks from external drop', () => {
    const { props } = renderReady();

    act(() => {
      window.dispatchEvent(
        iframeMsg(IFRAME_MESSAGES.EXTERNAL_DROP_COMPLETED, { blocks: [BLOCK_B] }),
      );
    });

    expect(props.onBlocksReordered).toHaveBeenCalledWith([BLOCK_B]);
  });
});

describe('useVisualEditorParent — BLOCK_CONTENT_UPDATED', () => {
  it('calls onBlockContentUpdated with blockId, field, value', () => {
    const { props } = renderReady();

    act(() => {
      window.dispatchEvent(
        iframeMsg(IFRAME_MESSAGES.BLOCK_CONTENT_UPDATED, {
          blockId: 'block-a',
          field: 'title',
          value: 'New Title',
        }),
      );
    });

    expect(props.onBlockContentUpdated).toHaveBeenCalledWith('block-a', 'title', 'New Title');
  });
});

describe('useVisualEditorParent — BLOCK_CONTEXT_MENU', () => {
  it('calls onBlockContextMenu with blockId, x, y, and modifiers', () => {
    const { props } = renderReady();

    act(() => {
      window.dispatchEvent(
        iframeMsg(IFRAME_MESSAGES.BLOCK_CONTEXT_MENU, {
          blockId: 'block-a',
          x: 120,
          y: 240,
          modifiers: { shiftKey: false, metaKey: true, ctrlKey: false },
        }),
      );
    });

    expect(props.onBlockContextMenu).toHaveBeenCalledWith('block-a', 120, 240, {
      shiftKey: false,
      metaKey: true,
      ctrlKey: false,
    });
  });

  it('calls onBlockContextMenu with undefined modifiers when omitted', () => {
    const { props } = renderReady();

    act(() => {
      window.dispatchEvent(
        iframeMsg(IFRAME_MESSAGES.BLOCK_CONTEXT_MENU, { blockId: 'block-a', x: 10, y: 20 }),
      );
    });

    expect(props.onBlockContextMenu).toHaveBeenCalledWith('block-a', 10, 20, undefined);
  });
});

describe('useVisualEditorParent — COPY_BLOCKS / PASTE_BLOCKS', () => {
  it('calls onCopyBlocks when COPY_BLOCKS arrives', () => {
    const { props } = renderReady();

    act(() => {
      window.dispatchEvent(iframeMsg(IFRAME_MESSAGES.COPY_BLOCKS, {}));
    });

    expect(props.onCopyBlocks).toHaveBeenCalledTimes(1);
  });

  it('calls onPasteBlocks when PASTE_BLOCKS arrives', () => {
    const { props } = renderReady();

    act(() => {
      window.dispatchEvent(iframeMsg(IFRAME_MESSAGES.PASTE_BLOCKS, {}));
    });

    expect(props.onPasteBlocks).toHaveBeenCalledTimes(1);
  });
});

describe('useVisualEditorParent — REQUEST_IMAGE_PICKER', () => {
  it('calls onRequestImagePicker with blockId, field, currentValue', () => {
    const { props } = renderReady();

    act(() => {
      window.dispatchEvent(
        iframeMsg(IFRAME_MESSAGES.REQUEST_IMAGE_PICKER, {
          blockId: 'block-a',
          field: 'backgroundImage',
          currentValue: 'https://example.com/img.jpg',
        }),
      );
    });

    expect(props.onRequestImagePicker).toHaveBeenCalledWith(
      'block-a',
      'backgroundImage',
      'https://example.com/img.jpg',
    );
  });
});

describe('useVisualEditorParent — outbound actions (iframeReady guard)', () => {
  it('sendBlocksUpdate does NOT call sendToIframe when iframeReady=false', () => {
    const props = makeProps();
    const { result } = renderHook(() => useVisualEditorParent(props as any));
    // Do NOT dispatch IFRAME_READY — hook starts not-ready

    act(() => {
      result.current.sendBlocksUpdate([BLOCK_A]);
    });

    // sendToIframe was NOT called for BLOCKS_UPDATE (may have been called for
    // EDITOR_INIT from IFRAME_READY if that fired, but we never fired it here)
    const blocksUpdateCalls = mockSendToIframe.mock.calls.filter(
      ([, type]) => type === PARENT_MESSAGES.BLOCKS_UPDATE,
    );
    expect(blocksUpdateCalls).toHaveLength(0);
  });

  it('sendBlocksUpdate calls sendToIframe with BLOCKS_UPDATE payload when ready', () => {
    const { result } = renderReady();
    mockSendToIframe.mockClear();

    act(() => {
      result.current.sendBlocksUpdate([BLOCK_A]);
    });

    expect(mockSendToIframe).toHaveBeenCalledWith(
      null,
      PARENT_MESSAGES.BLOCKS_UPDATE,
      expect.objectContaining({ blocks: [BLOCK_A], coalesce: false }),
    );
  });

  it('sendBlocksUpdate forwards coalesce=true', () => {
    const { result } = renderReady();
    mockSendToIframe.mockClear();

    act(() => {
      result.current.sendBlocksUpdate([BLOCK_A], { coalesce: true });
    });

    expect(mockSendToIframe).toHaveBeenCalledWith(
      null,
      PARENT_MESSAGES.BLOCKS_UPDATE,
      expect.objectContaining({ coalesce: true }),
    );
  });

  it('sendSelectBlock sends SELECT_BLOCK with blockId and selectedBlockIds', () => {
    const { result } = renderReady();
    mockSendToIframe.mockClear();

    act(() => {
      result.current.sendSelectBlock('block-a', ['block-a', 'block-b']);
    });

    expect(mockSendToIframe).toHaveBeenCalledWith(
      null,
      PARENT_MESSAGES.SELECT_BLOCK,
      expect.objectContaining({ blockId: 'block-a', selectedBlockIds: ['block-a', 'block-b'] }),
    );
  });

  it('sendSelectBlock sends null blockId for deselect', () => {
    const { result } = renderReady();
    mockSendToIframe.mockClear();

    act(() => {
      result.current.sendSelectBlock(null);
    });

    expect(mockSendToIframe).toHaveBeenCalledWith(
      null,
      PARENT_MESSAGES.SELECT_BLOCK,
      expect.objectContaining({ blockId: null }),
    );
  });

  it('sendHoverBlock sends HOVER_BLOCK with blockId', () => {
    const { result } = renderReady();
    mockSendToIframe.mockClear();

    act(() => {
      result.current.sendHoverBlock('block-a');
    });

    expect(mockSendToIframe).toHaveBeenCalledWith(
      null,
      PARENT_MESSAGES.HOVER_BLOCK,
      expect.objectContaining({ blockId: 'block-a' }),
    );
  });

  it('sendHoverBlock sends null to clear hover', () => {
    const { result } = renderReady();
    mockSendToIframe.mockClear();

    act(() => {
      result.current.sendHoverBlock(null);
    });

    expect(mockSendToIframe).toHaveBeenCalledWith(
      null,
      PARENT_MESSAGES.HOVER_BLOCK,
      expect.objectContaining({ blockId: null }),
    );
  });

  it('sendUndo sends UNDO', () => {
    const { result } = renderReady();
    mockSendToIframe.mockClear();

    act(() => {
      result.current.sendUndo();
    });

    expect(mockSendToIframe).toHaveBeenCalledWith(null, PARENT_MESSAGES.UNDO, {});
  });

  it('sendRedo sends REDO', () => {
    const { result } = renderReady();
    mockSendToIframe.mockClear();

    act(() => {
      result.current.sendRedo();
    });

    expect(mockSendToIframe).toHaveBeenCalledWith(null, PARENT_MESSAGES.REDO, {});
  });

  it('sendUndo is a no-op when iframeReady=false', () => {
    const props = makeProps();
    const { result } = renderHook(() => useVisualEditorParent(props as any));
    mockSendToIframe.mockClear();

    act(() => {
      result.current.sendUndo();
    });

    const undoCalls = mockSendToIframe.mock.calls.filter(([, type]) => type === PARENT_MESSAGES.UNDO);
    expect(undoCalls).toHaveLength(0);
  });

  it('sendExternalDragStart sends EXTERNAL_DRAG_START with blockType', () => {
    const { result } = renderReady();
    mockSendToIframe.mockClear();

    act(() => {
      result.current.sendExternalDragStart('hero');
    });

    expect(mockSendToIframe).toHaveBeenCalledWith(
      null,
      PARENT_MESSAGES.EXTERNAL_DRAG_START,
      { blockType: 'hero' },
    );
  });

  it('sendExternalDragMove sends EXTERNAL_DRAG_MOVE with x/y', () => {
    const { result } = renderReady();
    mockSendToIframe.mockClear();

    act(() => {
      result.current.sendExternalDragMove(100, 200);
    });

    expect(mockSendToIframe).toHaveBeenCalledWith(
      null,
      PARENT_MESSAGES.EXTERNAL_DRAG_MOVE,
      { x: 100, y: 200 },
    );
  });

  it('sendExternalDragEnd sends EXTERNAL_DRAG_END with x/y', () => {
    const { result } = renderReady();
    mockSendToIframe.mockClear();

    act(() => {
      result.current.sendExternalDragEnd(150, 250);
    });

    expect(mockSendToIframe).toHaveBeenCalledWith(
      null,
      PARENT_MESSAGES.EXTERNAL_DRAG_END,
      { x: 150, y: 250 },
    );
  });

  it('sendExternalDragCancel sends EXTERNAL_DRAG_CANCEL', () => {
    const { result } = renderReady();
    mockSendToIframe.mockClear();

    act(() => {
      result.current.sendExternalDragCancel();
    });

    expect(mockSendToIframe).toHaveBeenCalledWith(
      null,
      PARENT_MESSAGES.EXTERNAL_DRAG_CANCEL,
      {},
    );
  });

  it('sendCustomCodeUpdate sends CUSTOM_CODE_UPDATE with css and js', () => {
    const { result } = renderReady();
    mockSendToIframe.mockClear();

    act(() => {
      result.current.sendCustomCodeUpdate('body { color: red; }', 'console.log("hi")');
    });

    expect(mockSendToIframe).toHaveBeenCalledWith(
      null,
      PARENT_MESSAGES.CUSTOM_CODE_UPDATE,
      { css: 'body { color: red; }', js: 'console.log("hi")' },
    );
  });
});

describe('useVisualEditorParent — handleIframeLoad fallback', () => {
  it('resets iframeReady to false on load, then fires the fallback after 800ms if IFRAME_READY never comes', () => {
    const { result } = renderReady();
    expect(result.current.iframeReady).toBe(true);

    // Simulate iframe reload
    act(() => {
      result.current.handleIframeLoad();
    });

    expect(result.current.iframeReady).toBe(false);

    // Advance past the 800ms fallback
    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(result.current.iframeReady).toBe(true);
    // The fallback should also call sendInit (EDITOR_INIT)
    const initCalls = mockSendToIframe.mock.calls.filter(
      ([, type]) => type === PARENT_MESSAGES.EDITOR_INIT,
    );
    expect(initCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT fire the fallback send if IFRAME_READY arrives within 800ms', () => {
    const props = makeProps();
    const { result } = renderHook(() => useVisualEditorParent(props as any));

    // Simulate load then immediate IFRAME_READY (race winner)
    act(() => {
      result.current.handleIframeLoad();
    });
    act(() => {
      window.dispatchEvent(
        iframeMsg(IFRAME_MESSAGES.IFRAME_READY, { registeredComponents: [] }),
      );
    });

    mockSendToIframe.mockClear();

    // Advancing past 800ms should NOT trigger another EDITOR_INIT because
    // iframeReadyRef is already true
    act(() => {
      vi.advanceTimersByTime(800);
    });

    const initCalls = mockSendToIframe.mock.calls.filter(
      ([, type]) => type === PARENT_MESSAGES.EDITOR_INIT,
    );
    expect(initCalls).toHaveLength(0);
  });
});

describe('useVisualEditorParent — optional callbacks (undefined safety)', () => {
  it('does not throw when optional callbacks are undefined and their messages arrive', () => {
    // Render with only the required callbacks
    const minimalProps = {
      blocks: [BLOCK_A],
      selectedBlockId: null,
      onBlockClicked: vi.fn(),
      onBlockHovered: vi.fn(),
      // All optional callbacks deliberately omitted
    };
    const { result } = renderHook(() => useVisualEditorParent(minimalProps as any));

    act(() => {
      window.dispatchEvent(iframeMsg(IFRAME_MESSAGES.IFRAME_READY, { registeredComponents: [] }));
    });

    expect(() => {
      act(() => {
        window.dispatchEvent(iframeMsg(IFRAME_MESSAGES.BLOCKS_REORDERED, { blocks: [BLOCK_A] }));
        window.dispatchEvent(iframeMsg(IFRAME_MESSAGES.ADD_BLOCK_AFTER, { blockId: 'block-a' }));
        window.dispatchEvent(iframeMsg(IFRAME_MESSAGES.BLOCK_RESIZED, { blockId: 'block-a', width: '100px' }));
        window.dispatchEvent(iframeMsg(IFRAME_MESSAGES.BLOCK_STYLE_UPDATED, { blockId: 'block-a', style: {} }));
        window.dispatchEvent(iframeMsg(IFRAME_MESSAGES.COLUMN_RESIZED, { blockId: 'block-a', columnWidths: [50, 50] }));
        window.dispatchEvent(iframeMsg(IFRAME_MESSAGES.GAP_CHANGED, { blockId: 'block-a', gap: 'lg' }));
        window.dispatchEvent(iframeMsg(IFRAME_MESSAGES.BLOCK_CONTENT_UPDATED, { blockId: 'block-a', field: 'title', value: 'x' }));
        window.dispatchEvent(iframeMsg(IFRAME_MESSAGES.BLOCK_CONTEXT_MENU, { blockId: 'block-a', x: 0, y: 0 }));
        window.dispatchEvent(iframeMsg(IFRAME_MESSAGES.COPY_BLOCKS, {}));
        window.dispatchEvent(iframeMsg(IFRAME_MESSAGES.PASTE_BLOCKS, {}));
        window.dispatchEvent(iframeMsg(IFRAME_MESSAGES.REQUEST_IMAGE_PICKER, { blockId: 'block-a', field: 'img', currentValue: '' }));
        window.dispatchEvent(iframeMsg(IFRAME_MESSAGES.EXTERNAL_DROP_COMPLETED, { blocks: [BLOCK_A] }));
      });
    }).not.toThrow();

    // outbound actions also safe to call when not ready
    expect(() => {
      act(() => {
        result.current.sendBlocksUpdate([BLOCK_A]);
        result.current.sendSelectBlock(null);
        result.current.sendHoverBlock(null);
        result.current.sendUndo();
        result.current.sendRedo();
        result.current.sendExternalDragStart('text');
        result.current.sendExternalDragMove(0, 0);
        result.current.sendExternalDragEnd(0, 0);
        result.current.sendExternalDragCancel();
        result.current.sendCustomCodeUpdate('', '');
      });
    }).not.toThrow();
  });
});
