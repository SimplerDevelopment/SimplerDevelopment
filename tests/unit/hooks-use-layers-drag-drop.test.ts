// @vitest-environment jsdom
/**
 * Unit tests for useLayersDragDrop.
 *
 * Strategy:
 *   - Mock @dnd-kit/core (useSensors/useSensor/KeyboardSensor/MouseSensor/
 *     TouchSensor return stubs so we can call the hook without a DOM drag
 *     implementation).
 *   - Mock @dnd-kit/sortable (arrayMove is the real function under test).
 *   - Mock @/lib/utils/blockHelpers so we can inject controlled return values
 *     for findBlockById, findBlockPath, getAllBlocks, insertBlockInContainer,
 *     removeBlockById.
 *   - Build synthetic DragStartEvent / DragOverEvent / DragEndEvent objects
 *     and call the hook's handlers directly — no DOM dispatch needed.
 *   - Use renderHook + act from @testing-library/react.
 *   - Exercises: initial state, handleDragStart, handleLayerDragOver,
 *     handleDragEnd (all branching paths), allBlockIds memo.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ── mock @dnd-kit/core ────────────────────────────────────────────────────────
const mockSensors = Symbol('sensors');
vi.mock('@dnd-kit/core', () => ({
  useSensors: vi.fn(() => mockSensors),
  useSensor: vi.fn(() => ({})),
  MouseSensor: class MouseSensor {},
  TouchSensor: class TouchSensor {},
  KeyboardSensor: class KeyboardSensor {},
}));

// ── mock @dnd-kit/sortable ────────────────────────────────────────────────────
vi.mock('@dnd-kit/sortable', () => ({
  arrayMove: vi.fn((arr: unknown[], from: number, to: number) => {
    const copy = [...arr];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    return copy;
  }),
}));

// ── mock blockHelpers ─────────────────────────────────────────────────────────
vi.mock(
  '/Users/dancoyle/simplerdevelopment/simplerdevelopment2026/lib/utils/blockHelpers',
  () => ({
    findBlockById: vi.fn(),
    findBlockPath: vi.fn(),
    getAllBlocks: vi.fn(),
    insertBlockInContainer: vi.fn(),
    removeBlockById: vi.fn(),
  }),
);

import * as blockHelpers from '/Users/dancoyle/simplerdevelopment/simplerdevelopment2026/lib/utils/blockHelpers';
import { useLayersDragDrop } from '/Users/dancoyle/simplerdevelopment/simplerdevelopment2026/components/portal/visual-editor/_hooks/useLayersDragDrop';
import type { Block } from '/Users/dancoyle/simplerdevelopment/simplerdevelopment2026/types/blocks/index';

// ── fixtures ──────────────────────────────────────────────────────────────────

function makeBlock(id: string): Block {
  return { id, type: 'text', values: {}, elementStyles: {} } as Block;
}

type DragStartEvent = Parameters<ReturnType<typeof useLayersDragDrop>['handleDragStart']>[0];
type DragOverEvent = Parameters<ReturnType<typeof useLayersDragDrop>['handleLayerDragOver']>[0];
type DragEndEvent = Parameters<ReturnType<typeof useLayersDragDrop>['handleDragEnd']>[0];

function makeDragStart(id: string): DragStartEvent {
  return { active: { id } } as DragStartEvent;
}

function makeDragOver(overId: string | null): DragOverEvent {
  return { over: overId ? { id: overId } : null } as DragOverEvent;
}

function makeDragEnd(activeId: string, overId: string | null): DragEndEvent {
  return {
    active: { id: activeId },
    over: overId ? { id: overId } : null,
  } as DragEndEvent;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('useLayersDragDrop', () => {
  let blocks: Block[];
  let onBlocksChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    blocks = [makeBlock('a'), makeBlock('b'), makeBlock('c')];
    onBlocksChange = vi.fn();

    // Default stubs so non-exercised branches don't blow up
    vi.mocked(blockHelpers.getAllBlocks).mockReturnValue(blocks);
    vi.mocked(blockHelpers.findBlockById).mockReturnValue(null);
    vi.mocked(blockHelpers.findBlockPath).mockReturnValue(null);
    vi.mocked(blockHelpers.removeBlockById).mockReturnValue([]);
    vi.mocked(blockHelpers.insertBlockInContainer).mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── initial state ─────────────────────────────────────────────────────────

  it('initialises draggedBlockId as null', () => {
    const { result } = renderHook(() => useLayersDragDrop({ blocks, onBlocksChange }));
    expect(result.current.draggedBlockId).toBeNull();
  });

  it('initialises layerOverId as null', () => {
    const { result } = renderHook(() => useLayersDragDrop({ blocks, onBlocksChange }));
    expect(result.current.layerOverId).toBeNull();
  });

  it('returns the sensors object from useSensors', () => {
    const { result } = renderHook(() => useLayersDragDrop({ blocks, onBlocksChange }));
    expect(result.current.sensors).toBe(mockSensors);
  });

  it('returns all five handler functions', () => {
    const { result } = renderHook(() => useLayersDragDrop({ blocks, onBlocksChange }));
    expect(typeof result.current.handleDragStart).toBe('function');
    expect(typeof result.current.handleLayerDragOver).toBe('function');
    expect(typeof result.current.handleDragEnd).toBe('function');
  });

  // ── allBlockIds ───────────────────────────────────────────────────────────

  it('allBlockIds includes each top-level block id from getAllBlocks', () => {
    vi.mocked(blockHelpers.getAllBlocks).mockReturnValue([makeBlock('x'), makeBlock('y')]);
    const { result } = renderHook(() => useLayersDragDrop({ blocks, onBlocksChange }));
    expect(result.current.allBlockIds).toContain('x');
    expect(result.current.allBlockIds).toContain('y');
  });

  it('allBlockIds appends dropzone ids for a columns block', () => {
    const colBlock = {
      id: 'col1',
      type: 'columns',
      columns: [{ id: 'c0', blocks: [] }, { id: 'c1', blocks: [] }],
      values: {},
      elementStyles: {},
    } as unknown as Block;
    vi.mocked(blockHelpers.getAllBlocks).mockReturnValue([colBlock]);
    const { result } = renderHook(() => useLayersDragDrop({ blocks, onBlocksChange }));
    expect(result.current.allBlockIds).toContain('dropzone:col1:0');
    expect(result.current.allBlockIds).toContain('dropzone:col1:1');
  });

  it('allBlockIds appends dropzone ids for a tabs block', () => {
    const tabBlock = {
      id: 'tab1',
      type: 'tabs',
      tabs: [{ id: 't0', blocks: [] }, { id: 't1', blocks: [] }],
      values: {},
      elementStyles: {},
    } as unknown as Block;
    vi.mocked(blockHelpers.getAllBlocks).mockReturnValue([tabBlock]);
    const { result } = renderHook(() => useLayersDragDrop({ blocks, onBlocksChange }));
    expect(result.current.allBlockIds).toContain('dropzone:tab1:0');
    expect(result.current.allBlockIds).toContain('dropzone:tab1:1');
  });

  it('allBlockIds appends a single dropzone for a section block', () => {
    const sectionBlock = {
      id: 'sec1',
      type: 'section',
      blocks: [],
      values: {},
      elementStyles: {},
    } as unknown as Block;
    vi.mocked(blockHelpers.getAllBlocks).mockReturnValue([sectionBlock]);
    const { result } = renderHook(() => useLayersDragDrop({ blocks, onBlocksChange }));
    expect(result.current.allBlockIds).toContain('dropzone:sec1:0');
  });

  // ── handleDragStart ───────────────────────────────────────────────────────

  it('handleDragStart: sets draggedBlockId to the active block id', () => {
    const { result } = renderHook(() => useLayersDragDrop({ blocks, onBlocksChange }));
    act(() => {
      result.current.handleDragStart(makeDragStart('block-a'));
    });
    expect(result.current.draggedBlockId).toBe('block-a');
  });

  it('handleDragStart: resets layerOverId to null', () => {
    const { result } = renderHook(() => useLayersDragDrop({ blocks, onBlocksChange }));
    // Set layerOverId first via handleLayerDragOver
    act(() => {
      result.current.handleLayerDragOver(makeDragOver('block-b'));
    });
    act(() => {
      result.current.handleDragStart(makeDragStart('block-a'));
    });
    expect(result.current.layerOverId).toBeNull();
  });

  // ── handleLayerDragOver ───────────────────────────────────────────────────

  it('handleLayerDragOver: sets layerOverId to the over block id', () => {
    const { result } = renderHook(() => useLayersDragDrop({ blocks, onBlocksChange }));
    act(() => {
      result.current.handleLayerDragOver(makeDragOver('block-b'));
    });
    expect(result.current.layerOverId).toBe('block-b');
  });

  it('handleLayerDragOver: sets layerOverId to null when over is null', () => {
    const { result } = renderHook(() => useLayersDragDrop({ blocks, onBlocksChange }));
    act(() => {
      result.current.handleLayerDragOver(makeDragOver('block-b'));
    });
    act(() => {
      result.current.handleLayerDragOver(makeDragOver(null));
    });
    expect(result.current.layerOverId).toBeNull();
  });

  // ── handleDragEnd ─────────────────────────────────────────────────────────

  it('handleDragEnd: resets draggedBlockId and layerOverId', () => {
    const { result } = renderHook(() => useLayersDragDrop({ blocks, onBlocksChange }));
    act(() => {
      result.current.handleDragStart(makeDragStart('a'));
      result.current.handleLayerDragOver(makeDragOver('b'));
    });
    act(() => {
      result.current.handleDragEnd(makeDragEnd('a', 'b'));
    });
    expect(result.current.draggedBlockId).toBeNull();
    expect(result.current.layerOverId).toBeNull();
  });

  it('handleDragEnd: no-ops when over is null', () => {
    const { result } = renderHook(() => useLayersDragDrop({ blocks, onBlocksChange }));
    act(() => {
      result.current.handleDragEnd(makeDragEnd('a', null));
    });
    expect(onBlocksChange).not.toHaveBeenCalled();
  });

  it('handleDragEnd: no-ops when active.id === over.id', () => {
    const { result } = renderHook(() => useLayersDragDrop({ blocks, onBlocksChange }));
    act(() => {
      result.current.handleDragEnd(makeDragEnd('a', 'a'));
    });
    expect(onBlocksChange).not.toHaveBeenCalled();
  });

  // ── dropzone drop ─────────────────────────────────────────────────────────

  it('handleDragEnd: dropzone — calls removeBlockById then insertBlockInContainer', () => {
    const draggedBlock = makeBlock('a');
    vi.mocked(blockHelpers.findBlockById)
      .mockReturnValueOnce(draggedBlock) // first call: find dragged block in original
      .mockReturnValueOnce(null);        // second call: find container after removal
    vi.mocked(blockHelpers.removeBlockById).mockReturnValue([makeBlock('b')]);
    vi.mocked(blockHelpers.insertBlockInContainer).mockReturnValue([makeBlock('b'), makeBlock('a')]);

    const { result } = renderHook(() => useLayersDragDrop({ blocks, onBlocksChange }));
    act(() => {
      result.current.handleDragEnd(makeDragEnd('a', 'dropzone:container1:0'));
    });

    expect(blockHelpers.removeBlockById).toHaveBeenCalledWith(blocks, 'a');
    expect(blockHelpers.insertBlockInContainer).toHaveBeenCalled();
    expect(onBlocksChange).toHaveBeenCalledWith([makeBlock('b'), makeBlock('a')]);
  });

  it('handleDragEnd: dropzone — skips when dragged block is not found', () => {
    vi.mocked(blockHelpers.findBlockById).mockReturnValue(null);
    const { result } = renderHook(() => useLayersDragDrop({ blocks, onBlocksChange }));
    act(() => {
      result.current.handleDragEnd(makeDragEnd('missing', 'dropzone:container1:0'));
    });
    expect(onBlocksChange).not.toHaveBeenCalled();
  });

  it('handleDragEnd: dropzone — skips when slotIndex is NaN', () => {
    const draggedBlock = makeBlock('a');
    vi.mocked(blockHelpers.findBlockById).mockReturnValue(draggedBlock);
    const { result } = renderHook(() => useLayersDragDrop({ blocks, onBlocksChange }));
    act(() => {
      result.current.handleDragEnd(makeDragEnd('a', 'dropzone:container1:NaN'));
    });
    expect(onBlocksChange).not.toHaveBeenCalled();
  });

  it('handleDragEnd: dropzone — skips when dropping container onto itself', () => {
    const draggedBlock = makeBlock('a');
    vi.mocked(blockHelpers.findBlockById).mockReturnValue(draggedBlock);
    const { result } = renderHook(() => useLayersDragDrop({ blocks, onBlocksChange }));
    act(() => {
      result.current.handleDragEnd(makeDragEnd('a', 'dropzone:a:0'));
    });
    expect(onBlocksChange).not.toHaveBeenCalled();
  });

  it('handleDragEnd: dropzone onto columns container — uses column child count for appendAt', () => {
    const colBlock = {
      id: 'container1',
      type: 'columns',
      columns: [{ id: 'c0', blocks: [makeBlock('x'), makeBlock('y')] }],
      values: {},
      elementStyles: {},
    } as unknown as Block;
    const draggedBlock = makeBlock('a');

    vi.mocked(blockHelpers.findBlockById)
      .mockReturnValueOnce(draggedBlock)   // original blocks search
      .mockReturnValueOnce(colBlock);      // post-removal search for container

    vi.mocked(blockHelpers.removeBlockById).mockReturnValue([colBlock]);
    vi.mocked(blockHelpers.insertBlockInContainer).mockReturnValue([]);

    const { result } = renderHook(() => useLayersDragDrop({ blocks, onBlocksChange }));
    act(() => {
      result.current.handleDragEnd(makeDragEnd('a', 'dropzone:container1:0'));
    });

    expect(blockHelpers.insertBlockInContainer).toHaveBeenCalledWith(
      [colBlock], 'container1', 0, 2, draggedBlock,
    );
  });

  it('handleDragEnd: dropzone onto tabs container — uses tab child count for appendAt', () => {
    const tabBlock = {
      id: 'container2',
      type: 'tabs',
      tabs: [{ id: 't0', blocks: [makeBlock('x')] }],
      values: {},
      elementStyles: {},
    } as unknown as Block;
    const draggedBlock = makeBlock('b');

    vi.mocked(blockHelpers.findBlockById)
      .mockReturnValueOnce(draggedBlock)
      .mockReturnValueOnce(tabBlock);

    vi.mocked(blockHelpers.removeBlockById).mockReturnValue([tabBlock]);
    vi.mocked(blockHelpers.insertBlockInContainer).mockReturnValue([]);

    const { result } = renderHook(() => useLayersDragDrop({ blocks, onBlocksChange }));
    act(() => {
      result.current.handleDragEnd(makeDragEnd('b', 'dropzone:container2:0'));
    });

    expect(blockHelpers.insertBlockInContainer).toHaveBeenCalledWith(
      [tabBlock], 'container2', 0, 1, draggedBlock,
    );
  });

  it('handleDragEnd: dropzone onto section container — uses section child count for appendAt', () => {
    const secBlock = {
      id: 'sec1',
      type: 'section',
      blocks: [makeBlock('p'), makeBlock('q'), makeBlock('r')],
      values: {},
      elementStyles: {},
    } as unknown as Block;
    const draggedBlock = makeBlock('drag');

    vi.mocked(blockHelpers.findBlockById)
      .mockReturnValueOnce(draggedBlock)
      .mockReturnValueOnce(secBlock);

    vi.mocked(blockHelpers.removeBlockById).mockReturnValue([secBlock]);
    vi.mocked(blockHelpers.insertBlockInContainer).mockReturnValue([]);

    const { result } = renderHook(() => useLayersDragDrop({ blocks, onBlocksChange }));
    act(() => {
      result.current.handleDragEnd(makeDragEnd('drag', 'dropzone:sec1:0'));
    });

    expect(blockHelpers.insertBlockInContainer).toHaveBeenCalledWith(
      [secBlock], 'sec1', 0, 3, draggedBlock,
    );
  });

  // ── standard reorder (both top-level) ────────────────────────────────────

  it('handleDragEnd: standard reorder — calls arrayMove when both ids are at top level', () => {
    vi.mocked(blockHelpers.findBlockById).mockReturnValue(makeBlock('a'));

    const { result } = renderHook(() => useLayersDragDrop({ blocks, onBlocksChange }));
    act(() => {
      // blocks = [a, b, c]; move 'a' (index 0) to 'c' (index 2)
      result.current.handleDragEnd(makeDragEnd('a', 'c'));
    });

    // arrayMove real impl reorders to [b, c, a]
    expect(onBlocksChange).toHaveBeenCalledWith([makeBlock('b'), makeBlock('c'), makeBlock('a')]);
  });

  // ── nested → top-level ────────────────────────────────────────────────────

  it('handleDragEnd: nested→top — removes from nested and splices at newIndex', () => {
    // 'active' is NOT in blocks (oldIndex === -1), 'over' IS in blocks (newIndex !== -1)
    const topBlock = makeBlock('b');
    vi.mocked(blockHelpers.findBlockById).mockReturnValue(makeBlock('nested'));
    vi.mocked(blockHelpers.removeBlockById).mockReturnValue([makeBlock('a'), topBlock, makeBlock('c')]);

    const { result } = renderHook(() => useLayersDragDrop({ blocks: [makeBlock('a'), topBlock, makeBlock('c')], onBlocksChange }));
    act(() => {
      result.current.handleDragEnd(makeDragEnd('nested', 'b'));
    });

    expect(onBlocksChange).toHaveBeenCalled();
    const called = onBlocksChange.mock.calls[0][0] as Block[];
    // 'nested' block should appear at index 1 (where 'b' was)
    expect(called.some((bl: Block) => bl.id === 'nested')).toBe(true);
  });

  // ── top-level → nested ───────────────────────────────────────────────────

  it('handleDragEnd: top→nested — uses findBlockPath and insertBlockInContainer', () => {
    const overPath = { containerId: 'col1', slotIndex: 0, blockIndex: 1 };
    vi.mocked(blockHelpers.findBlockById).mockReturnValue(makeBlock('a'));
    vi.mocked(blockHelpers.findBlockPath).mockReturnValue(overPath);
    vi.mocked(blockHelpers.removeBlockById).mockReturnValue([makeBlock('b')]);
    vi.mocked(blockHelpers.insertBlockInContainer).mockReturnValue([makeBlock('b')]);

    // 'over' is 'nested-b' which is NOT in the top-level blocks array
    const topLevelBlocks = [makeBlock('a'), makeBlock('b')];
    const { result } = renderHook(() => useLayersDragDrop({ blocks: topLevelBlocks, onBlocksChange }));
    act(() => {
      result.current.handleDragEnd(makeDragEnd('a', 'nested-b'));
    });

    expect(blockHelpers.findBlockPath).toHaveBeenCalledWith(topLevelBlocks, 'nested-b');
    expect(blockHelpers.insertBlockInContainer).toHaveBeenCalledWith(
      [makeBlock('b')], 'col1', 0, 1, makeBlock('a'),
    );
    expect(onBlocksChange).toHaveBeenCalledWith([makeBlock('b')]);
  });

  it('handleDragEnd: top→nested — no-ops when findBlockPath returns null', () => {
    vi.mocked(blockHelpers.findBlockById).mockReturnValue(makeBlock('a'));
    vi.mocked(blockHelpers.findBlockPath).mockReturnValue(null);

    const { result } = renderHook(() => useLayersDragDrop({ blocks: [makeBlock('a'), makeBlock('b')], onBlocksChange }));
    act(() => {
      result.current.handleDragEnd(makeDragEnd('a', 'nested-x'));
    });

    expect(onBlocksChange).not.toHaveBeenCalled();
  });

  // ── both nested ───────────────────────────────────────────────────────────

  it('handleDragEnd: both nested — routes via findBlockPath and insertBlockInContainer', () => {
    const overPath = { containerId: 'col2', slotIndex: 1, blockIndex: 0 };
    // Neither 'na' nor 'nb' appears in top-level blocks array
    vi.mocked(blockHelpers.findBlockById).mockReturnValue(makeBlock('na'));
    vi.mocked(blockHelpers.findBlockPath).mockReturnValue(overPath);
    vi.mocked(blockHelpers.removeBlockById).mockReturnValue([makeBlock('x')]);
    vi.mocked(blockHelpers.insertBlockInContainer).mockReturnValue([makeBlock('x')]);

    // Empty top-level (both blocks are nested)
    const { result } = renderHook(() => useLayersDragDrop({ blocks: [], onBlocksChange }));
    act(() => {
      result.current.handleDragEnd(makeDragEnd('na', 'nb'));
    });

    expect(blockHelpers.insertBlockInContainer).toHaveBeenCalledWith(
      [makeBlock('x')], 'col2', 1, 0, makeBlock('na'),
    );
    expect(onBlocksChange).toHaveBeenCalledWith([makeBlock('x')]);
  });

  it('handleDragEnd: both nested — no-ops when findBlockPath returns null', () => {
    vi.mocked(blockHelpers.findBlockById).mockReturnValue(makeBlock('na'));
    vi.mocked(blockHelpers.findBlockPath).mockReturnValue(null);
    vi.mocked(blockHelpers.removeBlockById).mockReturnValue([]);

    const { result } = renderHook(() => useLayersDragDrop({ blocks: [], onBlocksChange }));
    act(() => {
      result.current.handleDragEnd(makeDragEnd('na', 'nb'));
    });

    expect(onBlocksChange).not.toHaveBeenCalled();
  });
});
