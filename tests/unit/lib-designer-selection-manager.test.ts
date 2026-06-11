// @vitest-environment node
/**
 * Unit tests for lib/designer/selectionManager.ts
 *
 * Fabric is mocked entirely — Canvas, ActiveSelection, Group are plain JS
 * objects / classes.  No real canvas / DOM required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Captured constructor calls
// ---------------------------------------------------------------------------

const ActiveSelectionCalls: Array<{ objects: unknown[]; opts: unknown }> = [];

vi.mock('fabric', () => {
  class FabricObject {
    type = 'rect';
    selectable = true;
    left = 0;
    top = 0;
  }

  class Group extends FabricObject {
    type = 'group';
    private _objects: FabricObject[];
    constructor(objects: FabricObject[] = []) {
      super();
      this._objects = objects;
    }
    getObjects(): FabricObject[] { return this._objects; }
  }

  class ActiveSelection extends FabricObject {
    type = 'activeSelection';
    private _objects: FabricObject[];
    constructor(objects: FabricObject[] = [], opts?: unknown) {
      super();
      this._objects = objects;
      ActiveSelectionCalls.push({ objects, opts });
    }
    getObjects(): FabricObject[] { return this._objects; }
  }

  return { FabricObject, Group, ActiveSelection };
});

// ---------------------------------------------------------------------------
// Minimal Canvas stub — wires event emit/off so bindEvents can function.
// ---------------------------------------------------------------------------

type EventHandler = (e?: unknown) => void;

function makeCanvas(objects: unknown[] = []) {
  const handlers: Record<string, EventHandler[]> = {};

  const canvas = {
    selection: true,
    preserveObjectStacking: true,
    selectionColor: '',
    selectionBorderColor: '',
    selectionLineWidth: 0,
    selectionDashArray: [] as number[],
    _objects: objects as Array<{ selectable?: boolean; data?: { id?: string }; id?: string }>,

    on(event: string, handler: EventHandler) {
      (handlers[event] = handlers[event] || []).push(handler);
    },
    off(event: string, handler: EventHandler) {
      if (!handlers[event]) return;
      handlers[event] = handlers[event].filter((h) => h !== handler);
    },
    emit(event: string, payload?: unknown) {
      (handlers[event] || []).forEach((h) => h(payload));
    },
    getObjects() { return this._objects; },
    setActiveObject: vi.fn(),
    discardActiveObject: vi.fn(),
    requestRenderAll: vi.fn(),
    remove: vi.fn((obj: unknown) => {
      canvas._objects = canvas._objects.filter((o) => o !== obj);
    }),
  };

  return canvas;
}

// ---------------------------------------------------------------------------
// Import after mocks are hoisted
// ---------------------------------------------------------------------------
import { SelectionManager } from '@/lib/designer/selectionManager';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  ActiveSelectionCalls.length = 0;
  vi.clearAllMocks();
});

describe('SelectionManager — constructor / initializeCanvas', () => {
  it('sets canvas.selection from enableMultiSelection option (default true)', () => {
    const canvas = makeCanvas();
    new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);
    expect(canvas.selection).toBe(true);
  });

  it('sets canvas.selection=false when enableMultiSelection=false', () => {
    const canvas = makeCanvas();
    new SelectionManager(
      canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0],
      { enableMultiSelection: false },
    );
    expect(canvas.selection).toBe(false);
  });

  it('sets canvas.preserveObjectStacking from option (default true)', () => {
    const canvas = makeCanvas();
    new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);
    expect(canvas.preserveObjectStacking).toBe(true);
  });

  it('sets canvas styling properties', () => {
    const canvas = makeCanvas();
    new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);
    expect(canvas.selectionColor).toBe('rgba(37, 99, 235, 0.1)');
    expect(canvas.selectionBorderColor).toBe('#2563eb');
    expect(canvas.selectionLineWidth).toBe(2);
    expect(canvas.selectionDashArray).toEqual([5, 5]);
  });
});

describe('SelectionManager — onSelectionChange / subscribe-unsubscribe', () => {
  it('fires callback on selection:created event', () => {
    const canvas = makeCanvas();
    const sm = new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);

    const cb = vi.fn();
    sm.onSelectionChange(cb);

    const target = { type: 'rect', selectable: true };
    canvas.emit('selection:created', { target });

    expect(cb).toHaveBeenCalledTimes(1);
    const evt = cb.mock.calls[0][0];
    expect(evt.selected).toContain(target);
  });

  it('fires callback on selection:updated event', () => {
    const canvas = makeCanvas();
    const sm = new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);

    const cb = vi.fn();
    sm.onSelectionChange(cb);

    const target = { type: 'rect', selectable: true };
    canvas.emit('selection:updated', { target });

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('fires callback with deselected items on selection:cleared', () => {
    const canvas = makeCanvas();
    const sm = new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);

    const cb = vi.fn();
    sm.onSelectionChange(cb);

    // First select something
    const target = { type: 'rect', selectable: true };
    canvas.emit('selection:created', { target });
    cb.mockClear();

    // Now clear
    canvas.emit('selection:cleared');
    expect(cb).toHaveBeenCalledTimes(1);
    const evt = cb.mock.calls[0][0];
    expect(evt.selected).toEqual([]);
    expect(evt.deselected).toContain(target);
  });

  it('returns an unsubscribe function that stops future calls', () => {
    const canvas = makeCanvas();
    const sm = new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);

    const cb = vi.fn();
    const unsub = sm.onSelectionChange(cb);

    // First event fires
    canvas.emit('selection:created', { target: { type: 'rect' } });
    expect(cb).toHaveBeenCalledTimes(1);

    // Unsubscribe — next event should NOT fire
    unsub();
    canvas.emit('selection:updated', { target: { type: 'rect' } });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does not throw when a callback throws — logs error instead', () => {
    const canvas = makeCanvas();
    const sm = new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);

    const badCb = vi.fn().mockImplementation(() => { throw new Error('boom'); });
    const goodCb = vi.fn();
    sm.onSelectionChange(badCb);
    sm.onSelectionChange(goodCb);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    canvas.emit('selection:created', { target: { type: 'rect' } });

    expect(badCb).toHaveBeenCalled();
    expect(goodCb).toHaveBeenCalled(); // still called after the bad one
    consoleSpy.mockRestore();
  });
});

describe('SelectionManager — unwrapSelection', () => {
  it('unwraps activeSelection objects into individual items', () => {
    const canvas = makeCanvas();
    const sm = new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);

    const cb = vi.fn();
    sm.onSelectionChange(cb);

    const child1 = { type: 'rect', selectable: true };
    const child2 = { type: 'text', selectable: true };
    const activeSelection = {
      type: 'activeSelection',
      getObjects: () => [child1, child2],
    };

    canvas.emit('selection:created', { target: activeSelection });
    const evt = cb.mock.calls[0][0];
    expect(evt.selected).toContain(child1);
    expect(evt.selected).toContain(child2);
  });

  it('unwraps group objects into individual items', () => {
    const canvas = makeCanvas();
    const sm = new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);

    const cb = vi.fn();
    sm.onSelectionChange(cb);

    const child = { type: 'rect', selectable: true };
    const group = { type: 'group', getObjects: () => [child] };

    canvas.emit('selection:created', { target: group });
    const evt = cb.mock.calls[0][0];
    expect(evt.selected).toContain(child);
  });

  it('wraps single objects in an array', () => {
    const canvas = makeCanvas();
    const sm = new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);

    const cb = vi.fn();
    sm.onSelectionChange(cb);

    const obj = { type: 'rect', selectable: true };
    canvas.emit('selection:created', { target: obj });
    const evt = cb.mock.calls[0][0];
    expect(evt.selected).toEqual([obj]);
  });
});

describe('SelectionManager — selectObject', () => {
  it('calls canvas.setActiveObject and requestRenderAll', () => {
    const canvas = makeCanvas();
    const sm = new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);

    const obj = { type: 'rect', selectable: true };
    sm.selectObject(obj as unknown as Parameters<typeof sm.selectObject>[0]);

    expect(canvas.setActiveObject).toHaveBeenCalledWith(obj);
    expect(canvas.requestRenderAll).toHaveBeenCalled();
  });
});

describe('SelectionManager — selectObjects', () => {
  it('does nothing when objects array is empty', () => {
    const canvas = makeCanvas();
    const sm = new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);
    sm.selectObjects([]);
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
  });

  it('calls selectObject directly for a single-element array', () => {
    const canvas = makeCanvas();
    const sm = new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);
    const obj = { type: 'rect', selectable: true };
    sm.selectObjects([obj as unknown as Parameters<typeof sm.selectObjects>[0][0]]);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(obj);
  });

  it('creates an ActiveSelection for multiple objects', () => {
    const canvas = makeCanvas();
    const sm = new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);
    const obj1 = { type: 'rect', selectable: true };
    const obj2 = { type: 'text', selectable: true };
    sm.selectObjects([obj1, obj2] as unknown as Parameters<typeof sm.selectObjects>[0]);
    expect(ActiveSelectionCalls.length).toBe(1);
    expect(canvas.setActiveObject).toHaveBeenCalled();
  });

  it('does nothing when enableMultiSelection=false and multiple objects given', () => {
    const canvas = makeCanvas();
    const sm = new SelectionManager(
      canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0],
      { enableMultiSelection: false },
    );
    const obj1 = { type: 'rect', selectable: true };
    const obj2 = { type: 'text', selectable: true };
    sm.selectObjects([obj1, obj2] as unknown as Parameters<typeof sm.selectObjects>[0]);
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
  });
});

describe('SelectionManager — selectByIds', () => {
  it('selects objects matching provided ids via data.id', () => {
    const obj1 = { type: 'rect', selectable: true, data: { id: 'abc' } };
    const obj2 = { type: 'rect', selectable: true, data: { id: 'def' } };
    const canvas = makeCanvas([obj1, obj2]);
    const sm = new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);

    sm.selectByIds(['abc']);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(obj1);
  });

  it('selects objects matching provided ids via top-level id', () => {
    const obj1 = { type: 'rect', selectable: true, id: 'xyz' };
    const canvas = makeCanvas([obj1]);
    const sm = new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);

    sm.selectByIds(['xyz']);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(obj1);
  });

  it('selects nothing when no ids match', () => {
    const obj1 = { type: 'rect', selectable: true, data: { id: 'abc' } };
    const canvas = makeCanvas([obj1]);
    const sm = new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);

    sm.selectByIds(['no-match']);
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
  });
});

describe('SelectionManager — clearSelection', () => {
  it('discards active object and rerenders', () => {
    const canvas = makeCanvas();
    const sm = new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);
    sm.clearSelection();
    expect(canvas.discardActiveObject).toHaveBeenCalled();
    expect(canvas.requestRenderAll).toHaveBeenCalled();
  });
});

describe('SelectionManager — selectAll', () => {
  it('selects all selectable objects', () => {
    const selectable1 = { type: 'rect', selectable: true };
    const selectable2 = { type: 'text', selectable: true };
    const notSelectable = { type: 'rect', selectable: false };
    const canvas = makeCanvas([selectable1, selectable2, notSelectable]);
    const sm = new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);

    sm.selectAll();
    // Two selectable objects → ActiveSelection created
    expect(ActiveSelectionCalls.length).toBe(1);
    expect(ActiveSelectionCalls[0].objects).toContain(selectable1);
    expect(ActiveSelectionCalls[0].objects).toContain(selectable2);
    expect(ActiveSelectionCalls[0].objects).not.toContain(notSelectable);
  });

  it('does nothing when there are no selectable objects', () => {
    const canvas = makeCanvas([]);
    const sm = new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);
    sm.selectAll();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
  });
});

describe('SelectionManager — deleteSelected', () => {
  it('removes all currently selected objects from the canvas', () => {
    const canvas = makeCanvas();
    const sm = new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);

    // Simulate a selection
    const obj = { type: 'rect', selectable: true };
    canvas.emit('selection:created', { target: obj });

    const deleted = sm.deleteSelected();
    expect(deleted).toContain(obj);
    expect(canvas.remove).toHaveBeenCalledWith(obj);
  });

  it('returns empty array when nothing is selected', () => {
    const canvas = makeCanvas();
    const sm = new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);
    const result = sm.deleteSelected();
    expect(result).toEqual([]);
  });
});

describe('SelectionManager — destroy', () => {
  it('removes all event listeners and clears callbacks', () => {
    const canvas = makeCanvas();
    const sm = new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);

    const cb = vi.fn();
    sm.onSelectionChange(cb);
    sm.destroy();

    // After destroy, events should not trigger callbacks
    canvas.emit('selection:created', { target: { type: 'rect' } });
    expect(cb).not.toHaveBeenCalled();
  });

  it('clears selectedObjects so deleteSelected returns empty', () => {
    const canvas = makeCanvas();
    const sm = new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);

    const obj = { type: 'rect', selectable: true };
    canvas.emit('selection:created', { target: obj });

    sm.destroy();
    const result = sm.deleteSelected();
    expect(result).toEqual([]);
  });
});

describe('SelectionManager — event tracking / deselected diff', () => {
  it('computes deselected correctly when switching from one object to another', () => {
    const canvas = makeCanvas();
    const sm = new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);

    const cb = vi.fn();
    sm.onSelectionChange(cb);

    const obj1 = { type: 'rect', selectable: true };
    const obj2 = { type: 'text', selectable: true };

    canvas.emit('selection:created', { target: obj1 });
    cb.mockClear();

    canvas.emit('selection:updated', { target: obj2 });
    const evt = cb.mock.calls[0][0];
    expect(evt.selected).toContain(obj2);
    expect(evt.deselected).toContain(obj1);
  });

  it('skips handleSelected when event has no target', () => {
    const canvas = makeCanvas();
    const sm = new SelectionManager(canvas as unknown as Parameters<typeof SelectionManager.prototype.constructor>[0]);

    const cb = vi.fn();
    sm.onSelectionChange(cb);

    canvas.emit('selection:created', {}); // no target
    expect(cb).not.toHaveBeenCalled();
  });
});
