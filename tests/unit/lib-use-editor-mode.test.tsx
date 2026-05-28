// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
// Spy on sendToParent and force isValidOrigin / isVisualEditorMessage to truthy
// so we can drive the iframe message handler without fighting origin checks.

const sendToParentSpy = vi.fn();
const isValidOriginSpy = vi.fn((_origin: string) => true);
const isVisualEditorMessageSpy = vi.fn((data: unknown) => {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    (d.source === 'sd-editor-parent' || d.source === 'sd-editor-iframe') &&
    typeof d.type === 'string'
  );
});

vi.mock('@/lib/visual-editor/protocol', () => ({
  isValidOrigin: (origin: string) => isValidOriginSpy(origin),
  isVisualEditorMessage: (data: unknown) => isVisualEditorMessageSpy(data),
  sendToParent: (type: string, payload: unknown) => sendToParentSpy(type, payload),
}));

// Block registry — return a stable manifest list so we can assert IFRAME_READY.
const fakeManifests = [
  { type: 'text', label: 'Text', icon: 'text', category: 'content', description: '', inputs: [], defaultProps: {} },
];
vi.mock('@/lib/visual-editor/registry', () => ({
  getBlockRegistry: () => ({
    getCustomManifests: () => fakeManifests,
  }),
}));

import { useEditorMode } from '@/lib/visual-editor/useEditorMode';
import { PARENT_MESSAGES, IFRAME_MESSAGES } from '@/types/visual-editor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setEditMode(on: boolean) {
  const search = on ? '?_edit=true' : '';
  // jsdom allows replaceState to mutate location.search.
  window.history.replaceState(null, '', `/${search}`);
}

function dispatchParent(type: string, payload: unknown) {
  const message = {
    source: 'sd-editor-parent',
    type,
    payload,
    timestamp: Date.now(),
  };
  // MessageEvent with origin defaults to '' in jsdom; we set it explicitly.
  const evt = new MessageEvent('message', {
    data: message,
    origin: 'http://localhost:3000',
  });
  window.dispatchEvent(evt);
}

function makeBlocks(ids: string[] = ['b1']) {
  return ids.map((id) => ({ id, type: 'text', values: { text: id } } as any));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useEditorMode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sendToParentSpy.mockClear();
    isValidOriginSpy.mockClear();
    isVisualEditorMessageSpy.mockClear();
    // Reset live css node between tests
    document.getElementById('sd-editor-live-css')?.remove();
    setEditMode(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    setEditMode(false);
  });

  // -------------------------------------------------------------------------
  // Activation / initial state
  // -------------------------------------------------------------------------

  it('does not activate when _edit query param is missing', () => {
    setEditMode(false);
    const { result } = renderHook(() => useEditorMode());
    expect(result.current.active).toBe(false);
    expect(sendToParentSpy).not.toHaveBeenCalled();
  });

  it('activates and sends IFRAME_READY with registered components when _edit=true', () => {
    const { result } = renderHook(() => useEditorMode());
    expect(result.current.active).toBe(true);
    expect(sendToParentSpy).toHaveBeenCalledWith(IFRAME_MESSAGES.IFRAME_READY, {
      registeredComponents: fakeManifests,
    });
  });

  it('returns initial state shape with zeroed externalDrag', () => {
    const { result } = renderHook(() => useEditorMode());
    expect(result.current.blocks).toEqual([]);
    expect(result.current.selectedBlockId).toBeNull();
    expect(result.current.selectedBlockIds).toEqual([]);
    expect(result.current.hoveredBlockId).toBeNull();
    expect(result.current.externalDrag).toEqual({ active: false, blockType: null, x: 0, y: 0 });
    expect(result.current.typeTemplate).toBeNull();
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('ignores messages from invalid origins', () => {
    isValidOriginSpy.mockImplementationOnce(() => false);
    const { result } = renderHook(() => useEditorMode());
    dispatchParent(PARENT_MESSAGES.EDITOR_INIT, {
      blocks: makeBlocks(['x']),
      selectedBlockId: null,
    });
    expect(result.current.blocks).toEqual([]);
  });

  it('ignores non-visual-editor messages', () => {
    const { result } = renderHook(() => useEditorMode());
    const evt = new MessageEvent('message', {
      data: { not: 'ours' },
      origin: 'http://localhost:3000',
    });
    window.dispatchEvent(evt);
    expect(result.current.blocks).toEqual([]);
  });

  it('ignores messages from sd-editor-iframe source (self echo)', () => {
    const { result } = renderHook(() => useEditorMode());
    const evt = new MessageEvent('message', {
      data: {
        source: 'sd-editor-iframe',
        type: PARENT_MESSAGES.EDITOR_INIT,
        payload: { blocks: makeBlocks(['x']), selectedBlockId: null },
        timestamp: Date.now(),
      },
      origin: 'http://localhost:3000',
    });
    window.dispatchEvent(evt);
    expect(result.current.blocks).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // EDITOR_INIT
  // -------------------------------------------------------------------------

  it('EDITOR_INIT seeds blocks, selectedBlockId and pageSettings', () => {
    const { result } = renderHook(() => useEditorMode());
    const blocks = makeBlocks(['a', 'b']);
    act(() => {
      dispatchParent(PARENT_MESSAGES.EDITOR_INIT, {
        blocks,
        selectedBlockId: 'a',
        pageSettings: { meta: { title: 'Hi' } } as any,
        typeTemplate: '{"x":1}',
      });
    });
    expect(result.current.blocks).toEqual(blocks);
    expect(result.current.selectedBlockId).toBe('a');
    expect(result.current.pageSettings).toEqual({ meta: { title: 'Hi' } });
    expect(result.current.typeTemplate).toBe('{"x":1}');
  });

  it('EDITOR_INIT defaults typeTemplate to null when omitted', () => {
    const { result } = renderHook(() => useEditorMode());
    act(() => {
      dispatchParent(PARENT_MESSAGES.EDITOR_INIT, {
        blocks: makeBlocks(['a']),
        selectedBlockId: null,
      });
    });
    expect(result.current.typeTemplate).toBeNull();
  });

  // -------------------------------------------------------------------------
  // SELECT_BLOCK / HOVER_BLOCK
  // -------------------------------------------------------------------------

  it('SELECT_BLOCK with single blockId sets selectedBlockIds to [blockId]', () => {
    const { result } = renderHook(() => useEditorMode());
    act(() => {
      dispatchParent(PARENT_MESSAGES.SELECT_BLOCK, { blockId: 'b1' });
    });
    expect(result.current.selectedBlockId).toBe('b1');
    expect(result.current.selectedBlockIds).toEqual(['b1']);
  });

  it('SELECT_BLOCK with explicit selectedBlockIds uses them', () => {
    const { result } = renderHook(() => useEditorMode());
    act(() => {
      dispatchParent(PARENT_MESSAGES.SELECT_BLOCK, {
        blockId: 'b1',
        selectedBlockIds: ['b1', 'b2'],
      });
    });
    expect(result.current.selectedBlockIds).toEqual(['b1', 'b2']);
  });

  it('SELECT_BLOCK with null blockId clears selectedBlockIds', () => {
    const { result } = renderHook(() => useEditorMode());
    act(() => {
      dispatchParent(PARENT_MESSAGES.SELECT_BLOCK, { blockId: null });
    });
    expect(result.current.selectedBlockId).toBeNull();
    expect(result.current.selectedBlockIds).toEqual([]);
  });

  it('HOVER_BLOCK updates hoveredBlockId', () => {
    const { result } = renderHook(() => useEditorMode());
    act(() => {
      dispatchParent(PARENT_MESSAGES.HOVER_BLOCK, { blockId: 'b1' });
    });
    expect(result.current.hoveredBlockId).toBe('b1');
    act(() => {
      dispatchParent(PARENT_MESSAGES.HOVER_BLOCK, { blockId: null });
    });
    expect(result.current.hoveredBlockId).toBeNull();
  });

  // -------------------------------------------------------------------------
  // EXIT_EDIT_MODE / PAGE_SETTINGS_UPDATE
  // -------------------------------------------------------------------------

  it('EXIT_EDIT_MODE sets active false', () => {
    const { result } = renderHook(() => useEditorMode());
    expect(result.current.active).toBe(true);
    act(() => {
      dispatchParent(PARENT_MESSAGES.EXIT_EDIT_MODE, {});
    });
    expect(result.current.active).toBe(false);
  });

  it('PAGE_SETTINGS_UPDATE replaces pageSettings', () => {
    const { result } = renderHook(() => useEditorMode());
    act(() => {
      dispatchParent(PARENT_MESSAGES.PAGE_SETTINGS_UPDATE, {
        pageSettings: { meta: { title: 'New' } } as any,
      });
    });
    expect(result.current.pageSettings).toEqual({ meta: { title: 'New' } });
  });

  // -------------------------------------------------------------------------
  // BLOCKS_UPDATE: coalesce + discrete history bookkeeping
  // -------------------------------------------------------------------------

  it('BLOCKS_UPDATE replaces blocks state', () => {
    const { result } = renderHook(() => useEditorMode());
    act(() => {
      dispatchParent(PARENT_MESSAGES.EDITOR_INIT, {
        blocks: makeBlocks(['a']),
        selectedBlockId: null,
      });
    });
    const next = makeBlocks(['a', 'b']);
    act(() => {
      dispatchParent(PARENT_MESSAGES.BLOCKS_UPDATE, { blocks: next });
    });
    expect(result.current.blocks).toEqual(next);
  });

  it('BLOCKS_UPDATE does not push history when current blocks list is empty', () => {
    const { result } = renderHook(() => useEditorMode());
    act(() => {
      dispatchParent(PARENT_MESSAGES.BLOCKS_UPDATE, { blocks: makeBlocks(['a']) });
    });
    expect(result.current.canUndo).toBe(false);
  });

  it('BLOCKS_UPDATE with same-content blocks does not push history', () => {
    const { result } = renderHook(() => useEditorMode());
    const initial = makeBlocks(['a']);
    act(() => {
      dispatchParent(PARENT_MESSAGES.EDITOR_INIT, { blocks: initial, selectedBlockId: null });
    });
    act(() => {
      dispatchParent(PARENT_MESSAGES.BLOCKS_UPDATE, { blocks: makeBlocks(['a']) });
    });
    expect(result.current.canUndo).toBe(false);
  });

  it('discrete BLOCKS_UPDATE pushes a history entry per change', () => {
    const { result } = renderHook(() => useEditorMode());
    act(() => {
      dispatchParent(PARENT_MESSAGES.EDITOR_INIT, {
        blocks: makeBlocks(['a']),
        selectedBlockId: null,
      });
    });
    act(() => {
      dispatchParent(PARENT_MESSAGES.BLOCKS_UPDATE, { blocks: makeBlocks(['a', 'b']) });
    });
    expect(result.current.canUndo).toBe(true);
  });

  it('coalesced BLOCKS_UPDATE only pushes history once per session', () => {
    const { result } = renderHook(() => useEditorMode());
    act(() => {
      dispatchParent(PARENT_MESSAGES.EDITOR_INIT, {
        blocks: makeBlocks(['a']),
        selectedBlockId: null,
      });
    });
    act(() => {
      dispatchParent(PARENT_MESSAGES.BLOCKS_UPDATE, { blocks: makeBlocks(['a', 'b']), coalesce: true });
    });
    act(() => {
      dispatchParent(PARENT_MESSAGES.BLOCKS_UPDATE, { blocks: makeBlocks(['a', 'b', 'c']), coalesce: true });
    });
    act(() => {
      dispatchParent(PARENT_MESSAGES.BLOCKS_UPDATE, { blocks: makeBlocks(['a', 'b', 'c', 'd']), coalesce: true });
    });
    // One undo should drop everything back to original ['a']
    act(() => {
      result.current.undo();
    });
    expect(result.current.blocks).toEqual(makeBlocks(['a']));
  });

  it('coalesce session reopens after 300ms quiet window', () => {
    const { result } = renderHook(() => useEditorMode());
    act(() => {
      dispatchParent(PARENT_MESSAGES.EDITOR_INIT, {
        blocks: makeBlocks(['a']),
        selectedBlockId: null,
      });
    });
    act(() => {
      dispatchParent(PARENT_MESSAGES.BLOCKS_UPDATE, { blocks: makeBlocks(['a', 'b']), coalesce: true });
    });
    // Let the 300ms timer expire
    act(() => {
      vi.advanceTimersByTime(350);
    });
    act(() => {
      dispatchParent(PARENT_MESSAGES.BLOCKS_UPDATE, { blocks: makeBlocks(['a', 'b', 'c']), coalesce: true });
    });
    // Now two history entries — undo twice gets back to original
    act(() => { result.current.undo(); });
    expect(result.current.blocks).toEqual(makeBlocks(['a', 'b']));
    act(() => { result.current.undo(); });
    expect(result.current.blocks).toEqual(makeBlocks(['a']));
  });

  it('discrete update after a coalesce session closes the drag timer cleanly', () => {
    const { result } = renderHook(() => useEditorMode());
    act(() => {
      dispatchParent(PARENT_MESSAGES.EDITOR_INIT, {
        blocks: makeBlocks(['a']),
        selectedBlockId: null,
      });
    });
    act(() => {
      dispatchParent(PARENT_MESSAGES.BLOCKS_UPDATE, { blocks: makeBlocks(['a', 'b']), coalesce: true });
    });
    act(() => {
      dispatchParent(PARENT_MESSAGES.BLOCKS_UPDATE, { blocks: makeBlocks(['a', 'b', 'c']) });
    });
    // Two history entries pushed: one for the coalesced pre-drag, one for the discrete update
    act(() => { result.current.undo(); });
    expect(result.current.blocks).toEqual(makeBlocks(['a', 'b']));
    act(() => { result.current.undo(); });
    expect(result.current.blocks).toEqual(makeBlocks(['a']));
  });

  // -------------------------------------------------------------------------
  // UNDO / REDO via parent messages
  // -------------------------------------------------------------------------

  it('UNDO message walks history and broadcasts BLOCKS_REORDERED', () => {
    const { result } = renderHook(() => useEditorMode());
    act(() => {
      dispatchParent(PARENT_MESSAGES.EDITOR_INIT, {
        blocks: makeBlocks(['a']),
        selectedBlockId: null,
      });
    });
    act(() => {
      dispatchParent(PARENT_MESSAGES.BLOCKS_UPDATE, { blocks: makeBlocks(['a', 'b']) });
    });
    sendToParentSpy.mockClear();
    act(() => {
      dispatchParent(PARENT_MESSAGES.UNDO, {});
    });
    expect(result.current.blocks).toEqual(makeBlocks(['a']));
    expect(sendToParentSpy).toHaveBeenCalledWith(IFRAME_MESSAGES.BLOCKS_REORDERED, {
      blocks: makeBlocks(['a']),
    });
  });

  it('UNDO on empty history is a no-op', () => {
    const { result } = renderHook(() => useEditorMode());
    sendToParentSpy.mockClear();
    act(() => {
      dispatchParent(PARENT_MESSAGES.UNDO, {});
    });
    expect(result.current.blocks).toEqual([]);
    expect(
      sendToParentSpy.mock.calls.filter(
        (c) => c[0] === IFRAME_MESSAGES.BLOCKS_REORDERED,
      ),
    ).toEqual([]);
  });

  it('REDO message restores last undone state', () => {
    const { result } = renderHook(() => useEditorMode());
    act(() => {
      dispatchParent(PARENT_MESSAGES.EDITOR_INIT, {
        blocks: makeBlocks(['a']),
        selectedBlockId: null,
      });
    });
    act(() => {
      dispatchParent(PARENT_MESSAGES.BLOCKS_UPDATE, { blocks: makeBlocks(['a', 'b']) });
    });
    act(() => { result.current.undo(); });
    expect(result.current.blocks).toEqual(makeBlocks(['a']));
    act(() => {
      dispatchParent(PARENT_MESSAGES.REDO, {});
    });
    expect(result.current.blocks).toEqual(makeBlocks(['a', 'b']));
  });

  it('REDO with empty future is a no-op', () => {
    const { result } = renderHook(() => useEditorMode());
    sendToParentSpy.mockClear();
    act(() => {
      dispatchParent(PARENT_MESSAGES.REDO, {});
    });
    expect(result.current.blocks).toEqual([]);
    expect(
      sendToParentSpy.mock.calls.filter(
        (c) => c[0] === IFRAME_MESSAGES.BLOCKS_REORDERED,
      ),
    ).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // External drag lifecycle
  // -------------------------------------------------------------------------

  it('EXTERNAL_DRAG_START sets active externalDrag with blockType', () => {
    const { result } = renderHook(() => useEditorMode());
    act(() => {
      dispatchParent(PARENT_MESSAGES.EXTERNAL_DRAG_START, { blockType: 'text' });
    });
    expect(result.current.externalDrag).toEqual({ active: true, blockType: 'text', x: 0, y: 0 });
  });

  it('EXTERNAL_DRAG_MOVE updates x/y without losing blockType', () => {
    const { result } = renderHook(() => useEditorMode());
    act(() => {
      dispatchParent(PARENT_MESSAGES.EXTERNAL_DRAG_START, { blockType: 'text' });
    });
    act(() => {
      dispatchParent(PARENT_MESSAGES.EXTERNAL_DRAG_MOVE, { x: 10, y: 20 });
    });
    expect(result.current.externalDrag).toEqual({ active: true, blockType: 'text', x: 10, y: 20 });
  });

  it('EXTERNAL_DRAG_END deactivates drag and dispatches sd-external-drop window event', () => {
    const { result } = renderHook(() => useEditorMode());
    act(() => {
      dispatchParent(PARENT_MESSAGES.EXTERNAL_DRAG_START, { blockType: 'text' });
    });
    const listener = vi.fn();
    window.addEventListener('sd-external-drop', listener);
    act(() => {
      dispatchParent(PARENT_MESSAGES.EXTERNAL_DRAG_END, { x: 99, y: 100 });
    });
    window.removeEventListener('sd-external-drop', listener);
    expect(result.current.externalDrag.active).toBe(false);
    expect(result.current.externalDrag.x).toBe(99);
    expect(result.current.externalDrag.y).toBe(100);
    expect(listener).toHaveBeenCalled();
    const ce = listener.mock.calls[0][0] as CustomEvent;
    expect(ce.detail).toEqual({ x: 99, y: 100 });
  });

  it('EXTERNAL_DRAG_CANCEL fully resets externalDrag', () => {
    const { result } = renderHook(() => useEditorMode());
    act(() => {
      dispatchParent(PARENT_MESSAGES.EXTERNAL_DRAG_START, { blockType: 'text' });
    });
    act(() => {
      dispatchParent(PARENT_MESSAGES.EXTERNAL_DRAG_MOVE, { x: 50, y: 50 });
    });
    act(() => {
      dispatchParent(PARENT_MESSAGES.EXTERNAL_DRAG_CANCEL, {});
    });
    expect(result.current.externalDrag).toEqual({ active: false, blockType: null, x: 0, y: 0 });
  });

  // -------------------------------------------------------------------------
  // CUSTOM_CODE_UPDATE injection
  // -------------------------------------------------------------------------

  it('CUSTOM_CODE_UPDATE creates a <style id="sd-editor-live-css"> with the css', () => {
    renderHook(() => useEditorMode());
    act(() => {
      dispatchParent(PARENT_MESSAGES.CUSTOM_CODE_UPDATE, { css: 'body { color: red; }' });
    });
    const node = document.getElementById('sd-editor-live-css') as HTMLStyleElement;
    expect(node).toBeTruthy();
    expect(node.tagName).toBe('STYLE');
    expect(node.textContent).toBe('body { color: red; }');
  });

  it('CUSTOM_CODE_UPDATE reuses an existing live style node', () => {
    renderHook(() => useEditorMode());
    act(() => {
      dispatchParent(PARENT_MESSAGES.CUSTOM_CODE_UPDATE, { css: 'a {}' });
    });
    const first = document.getElementById('sd-editor-live-css');
    act(() => {
      dispatchParent(PARENT_MESSAGES.CUSTOM_CODE_UPDATE, { css: 'b {}' });
    });
    const second = document.getElementById('sd-editor-live-css');
    expect(second).toBe(first);
    expect(second!.textContent).toBe('b {}');
  });

  it('CUSTOM_CODE_UPDATE with empty/undefined css defaults to empty string', () => {
    renderHook(() => useEditorMode());
    act(() => {
      dispatchParent(PARENT_MESSAGES.CUSTOM_CODE_UPDATE, { css: '' });
    });
    expect(document.getElementById('sd-editor-live-css')!.textContent).toBe('');
  });

  // -------------------------------------------------------------------------
  // Returned callbacks (gated on active)
  // -------------------------------------------------------------------------

  it('onBlockClicked posts BLOCK_CLICKED and updates selectedBlockId', () => {
    const { result } = renderHook(() => useEditorMode());
    sendToParentSpy.mockClear();
    act(() => {
      result.current.onBlockClicked('b1', { shiftKey: true });
    });
    expect(result.current.selectedBlockId).toBe('b1');
    expect(sendToParentSpy).toHaveBeenCalledWith(IFRAME_MESSAGES.BLOCK_CLICKED, {
      blockId: 'b1',
      modifiers: { shiftKey: true },
    });
  });

  it('onBlockClicked is a no-op when inactive', () => {
    setEditMode(false);
    const { result } = renderHook(() => useEditorMode());
    sendToParentSpy.mockClear();
    act(() => {
      result.current.onBlockClicked('b1');
    });
    expect(result.current.selectedBlockId).toBeNull();
    expect(sendToParentSpy).not.toHaveBeenCalled();
  });

  it('onBlockHovered posts BLOCK_HOVERED and updates hoveredBlockId', () => {
    const { result } = renderHook(() => useEditorMode());
    sendToParentSpy.mockClear();
    act(() => {
      result.current.onBlockHovered('b1');
    });
    expect(result.current.hoveredBlockId).toBe('b1');
    expect(sendToParentSpy).toHaveBeenCalledWith(IFRAME_MESSAGES.BLOCK_HOVERED, { blockId: 'b1' });
    act(() => {
      result.current.onBlockHovered(null);
    });
    expect(result.current.hoveredBlockId).toBeNull();
  });

  it('onBlockHovered is a no-op when inactive', () => {
    setEditMode(false);
    const { result } = renderHook(() => useEditorMode());
    sendToParentSpy.mockClear();
    act(() => {
      result.current.onBlockHovered('b1');
    });
    expect(sendToParentSpy).not.toHaveBeenCalled();
  });

  it('onBlocksReordered pushes history, updates blocks, and posts BLOCKS_REORDERED', () => {
    const { result } = renderHook(() => useEditorMode());
    act(() => {
      dispatchParent(PARENT_MESSAGES.EDITOR_INIT, {
        blocks: makeBlocks(['a']),
        selectedBlockId: null,
      });
    });
    sendToParentSpy.mockClear();
    const next = makeBlocks(['b', 'a']);
    act(() => {
      result.current.onBlocksReordered(next);
    });
    expect(result.current.blocks).toEqual(next);
    expect(result.current.canUndo).toBe(true);
    expect(sendToParentSpy).toHaveBeenCalledWith(IFRAME_MESSAGES.BLOCKS_REORDERED, { blocks: next });
  });

  it('onBlocksReordered is a no-op when inactive', () => {
    setEditMode(false);
    const { result } = renderHook(() => useEditorMode());
    sendToParentSpy.mockClear();
    act(() => {
      result.current.onBlocksReordered(makeBlocks(['a']));
    });
    expect(result.current.blocks).toEqual([]);
    expect(sendToParentSpy).not.toHaveBeenCalled();
  });

  it('onAddBlockAfter posts ADD_BLOCK_AFTER with blockId', () => {
    const { result } = renderHook(() => useEditorMode());
    sendToParentSpy.mockClear();
    act(() => { result.current.onAddBlockAfter('b1'); });
    expect(sendToParentSpy).toHaveBeenCalledWith(IFRAME_MESSAGES.ADD_BLOCK_AFTER, { blockId: 'b1' });
  });

  it('onAddBlockAfter is a no-op when inactive', () => {
    setEditMode(false);
    const { result } = renderHook(() => useEditorMode());
    sendToParentSpy.mockClear();
    act(() => { result.current.onAddBlockAfter('b1'); });
    expect(sendToParentSpy).not.toHaveBeenCalled();
  });

  it('onBlockResized posts BLOCK_RESIZED', () => {
    const { result } = renderHook(() => useEditorMode());
    sendToParentSpy.mockClear();
    act(() => { result.current.onBlockResized('b1', '100px', '50px'); });
    expect(sendToParentSpy).toHaveBeenCalledWith(IFRAME_MESSAGES.BLOCK_RESIZED, {
      blockId: 'b1', width: '100px', height: '50px',
    });
  });

  it('onBlockResized is a no-op when inactive', () => {
    setEditMode(false);
    const { result } = renderHook(() => useEditorMode());
    sendToParentSpy.mockClear();
    act(() => { result.current.onBlockResized('b1', '100px', '50px'); });
    expect(sendToParentSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // onBlockStyleUpdated — top-level + nested updates + drag-session coalescing
  // -------------------------------------------------------------------------

  it('onBlockStyleUpdated merges style on the targeted block', () => {
    const { result } = renderHook(() => useEditorMode());
    act(() => {
      dispatchParent(PARENT_MESSAGES.EDITOR_INIT, {
        blocks: [{ id: 'b1', type: 'text', values: {}, style: { color: 'red' } } as any],
        selectedBlockId: null,
      });
    });
    act(() => { result.current.onBlockStyleUpdated('b1', { fontSize: '16px' }); });
    const b = result.current.blocks[0] as any;
    expect(b.style).toEqual({ color: 'red', fontSize: '16px' });
  });

  it('onBlockStyleUpdated recurses into columns', () => {
    const { result } = renderHook(() => useEditorMode());
    const blocks = [{
      id: 'col',
      type: 'columns',
      columns: [
        { blocks: [{ id: 'child', type: 'text', values: {} }] },
      ],
    } as any];
    act(() => {
      dispatchParent(PARENT_MESSAGES.EDITOR_INIT, { blocks, selectedBlockId: null });
    });
    act(() => { result.current.onBlockStyleUpdated('child', { color: 'blue' }); });
    const child = (result.current.blocks[0] as any).columns[0].blocks[0];
    expect(child.style).toEqual({ color: 'blue' });
  });

  it('onBlockStyleUpdated recurses into tabs', () => {
    const { result } = renderHook(() => useEditorMode());
    const blocks = [{
      id: 'tabs',
      type: 'tabs',
      tabs: [
        { blocks: [{ id: 'tabchild', type: 'text', values: {} }] },
      ],
    } as any];
    act(() => {
      dispatchParent(PARENT_MESSAGES.EDITOR_INIT, { blocks, selectedBlockId: null });
    });
    act(() => { result.current.onBlockStyleUpdated('tabchild', { color: 'green' }); });
    const child = (result.current.blocks[0] as any).tabs[0].blocks[0];
    expect(child.style).toEqual({ color: 'green' });
  });

  it('onBlockStyleUpdated recurses into section blocks', () => {
    const { result } = renderHook(() => useEditorMode());
    const blocks = [{
      id: 'sec',
      type: 'section',
      blocks: [{ id: 'secchild', type: 'text', values: {} }],
    } as any];
    act(() => {
      dispatchParent(PARENT_MESSAGES.EDITOR_INIT, { blocks, selectedBlockId: null });
    });
    act(() => { result.current.onBlockStyleUpdated('secchild', { color: 'purple' }); });
    const child = (result.current.blocks[0] as any).blocks[0];
    expect(child.style).toEqual({ color: 'purple' });
  });

  it('onBlockStyleUpdated only pushes history once per drag session, resets after 300ms', () => {
    const { result } = renderHook(() => useEditorMode());
    act(() => {
      dispatchParent(PARENT_MESSAGES.EDITOR_INIT, {
        blocks: [{ id: 'b1', type: 'text', values: {} } as any],
        selectedBlockId: null,
      });
    });
    act(() => { result.current.onBlockStyleUpdated('b1', { width: '100px' }); });
    act(() => { result.current.onBlockStyleUpdated('b1', { width: '101px' }); });
    act(() => { result.current.onBlockStyleUpdated('b1', { width: '102px' }); });
    // One undo should jump straight back to original
    act(() => { result.current.undo(); });
    const b = result.current.blocks[0] as any;
    expect(b.style).toBeUndefined();

    // Now drag a second time after the quiet window — fresh history entry
    act(() => { result.current.redo(); });
    act(() => { vi.advanceTimersByTime(350); });
    act(() => { result.current.onBlockStyleUpdated('b1', { width: '200px' }); });
    expect(result.current.canUndo).toBe(true);
  });

  it('onBlockStyleUpdated is a no-op when inactive', () => {
    setEditMode(false);
    const { result } = renderHook(() => useEditorMode());
    sendToParentSpy.mockClear();
    act(() => { result.current.onBlockStyleUpdated('b1', { color: 'red' }); });
    expect(sendToParentSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // canUndo / canRedo broadcasts UNDO_REDO_STATE on transition
  // -------------------------------------------------------------------------

  it('broadcasts UNDO_REDO_STATE on canUndo/canRedo transitions', () => {
    const { result } = renderHook(() => useEditorMode());
    act(() => {
      dispatchParent(PARENT_MESSAGES.EDITOR_INIT, {
        blocks: makeBlocks(['a']),
        selectedBlockId: null,
      });
    });
    sendToParentSpy.mockClear();
    act(() => {
      result.current.onBlocksReordered(makeBlocks(['b', 'a']));
    });
    // canUndo flips false→true → expect a UNDO_REDO_STATE message
    const undoRedoCalls = sendToParentSpy.mock.calls.filter(
      (c) => c[0] === IFRAME_MESSAGES.UNDO_REDO_STATE,
    );
    expect(undoRedoCalls.length).toBeGreaterThanOrEqual(1);
    expect(undoRedoCalls[undoRedoCalls.length - 1][1]).toEqual({ canUndo: true, canRedo: false });
  });

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  it('removes the message listener on unmount', () => {
    const { unmount, result } = renderHook(() => useEditorMode());
    unmount();
    // After unmount, posting a message must not throw and must not change state
    // (we can't read state after unmount, but we can assert no error fires).
    expect(() => {
      dispatchParent(PARENT_MESSAGES.SELECT_BLOCK, { blockId: 'x' });
    }).not.toThrow();
    // result.current still holds the final pre-unmount snapshot
    expect(result.current).toBeDefined();
  });
});
