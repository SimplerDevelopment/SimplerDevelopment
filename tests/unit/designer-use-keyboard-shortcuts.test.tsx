// @vitest-environment jsdom
/**
 * Unit tests for `lib/designer/hooks/useKeyboardShortcuts.ts`.
 *
 * Strategy:
 *   - Mock `@/lib/designer/canvasStore` entirely so the hook receives
 *     controlled Vitest spy functions — no real Zustand or Fabric needed.
 *   - Mock `fabric` to prevent the Point import from blowing up in jsdom.
 *   - Spy on `navigator.platform` to pin Mac vs non-Mac deterministically.
 *   - Dispatch `KeyboardEvent` on `window` inside `act()` and assert the
 *     right spy was called (or not called).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ── Fabric stub (must precede hook import) ────────────────────────────────────

vi.mock('fabric', () => ({
  Point: class Point {
    x: number;
    y: number;
    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
    }
  },
  Canvas: class Canvas {},
}));

// ── canvasStore mock ──────────────────────────────────────────────────────────

// Mutable store state exposed to individual tests via `mockStore`.
const mockStore = {
  canvas: null as null | { renderAll: ReturnType<typeof vi.fn> },
  selectedLayers: [] as Array<{
    left?: number;
    top?: number;
    set?: ReturnType<typeof vi.fn>;
    setCoords?: ReturnType<typeof vi.fn>;
    data?: { id?: string };
    id?: string;
  }>,
  zoom: 1,
  undo: vi.fn(),
  redo: vi.fn(),
  canUndo: vi.fn(() => true),
  canRedo: vi.fn(() => true),
  copySelectedLayers: vi.fn(),
  pasteLayersFromClipboard: vi.fn(),
  removeLayer: vi.fn(),
  duplicateLayer: vi.fn(),
  selectAllLayers: vi.fn(),
  reorderLayer: vi.fn(),
  setZoom: vi.fn(),
  updateLayer: vi.fn(),
  layers: [] as Array<{ id: string }>,
};

vi.mock('@/lib/designer/canvasStore', () => ({
  useCanvasStore: (selector: (s: typeof mockStore) => unknown) =>
    selector(mockStore),
}));

// Pull in getState for the reorderLayer total-layers check inside the hook.
// The hook calls `useCanvasStore.getState().layers.length`, so we need to
// attach a getState method to the mock export.
import * as canvasStoreMod from '@/lib/designer/canvasStore';
(canvasStoreMod.useCanvasStore as unknown as { getState: () => typeof mockStore }).getState =
  () => mockStore;

// ── Hook import (after mocks) ─────────────────────────────────────────────────

import { useKeyboardShortcuts } from '@/lib/designer/hooks/useKeyboardShortcuts';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Dispatch a keydown event on window. */
function key(
  k: string,
  opts: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {},
) {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: k,
        bubbles: true,
        metaKey: opts.metaKey ?? false,
        ctrlKey: opts.ctrlKey ?? false,
        shiftKey: opts.shiftKey ?? false,
        altKey: opts.altKey ?? false,
      }),
    );
  });
}

/** Mount the hook with optional config overrides. */
function mount(config: Parameters<typeof useKeyboardShortcuts>[0] = {}) {
  return renderHook(() => useKeyboardShortcuts(config));
}

/** Make a minimal FabricObject-like layer stub. */
function makeLayer(id: string, left = 0, top = 0) {
  return {
    id,
    data: { id },
    left,
    top,
    set: vi.fn(),
    setCoords: vi.fn(),
  };
}

// ── Per-test setup ────────────────────────────────────────────────────────────

let platformSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockStore.canvas = null;
  mockStore.selectedLayers = [];
  mockStore.zoom = 1;
  mockStore.layers = [];

  // Default: non-Mac so ctrlKey is the modifier.
  platformSpy = vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
});

afterEach(() => {
  platformSpy.mockRestore();
});

// ═════════════════════════════════════════════════════════════════════════════
// Undo / Redo
// ═════════════════════════════════════════════════════════════════════════════

describe('undo / redo', () => {
  it('Ctrl+Z triggers undo when canUndo returns true', () => {
    mockStore.canUndo.mockReturnValue(true);
    mount();
    key('z', { ctrlKey: true });
    expect(mockStore.undo).toHaveBeenCalledTimes(1);
    expect(mockStore.redo).not.toHaveBeenCalled();
  });

  it('Ctrl+Z does NOT call undo when canUndo returns false', () => {
    mockStore.canUndo.mockReturnValue(false);
    mount();
    key('z', { ctrlKey: true });
    expect(mockStore.undo).not.toHaveBeenCalled();
  });

  it('Ctrl+Y triggers redo when canRedo returns true', () => {
    mockStore.canRedo.mockReturnValue(true);
    mount();
    key('y', { ctrlKey: true });
    expect(mockStore.redo).toHaveBeenCalledTimes(1);
    expect(mockStore.undo).not.toHaveBeenCalled();
  });

  it('Ctrl+Shift+Z triggers redo (Figma-style alternate binding)', () => {
    mockStore.canRedo.mockReturnValue(true);
    mount();
    key('z', { ctrlKey: true, shiftKey: true });
    expect(mockStore.redo).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Y does NOT call redo when canRedo returns false', () => {
    mockStore.canRedo.mockReturnValue(false);
    mount();
    key('y', { ctrlKey: true });
    expect(mockStore.redo).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Save / Export
// ═════════════════════════════════════════════════════════════════════════════

describe('save / export', () => {
  it('Ctrl+S calls onSave', () => {
    const onSave = vi.fn();
    mount({ onSave });
    key('s', { ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+S is a no-op when onSave is not provided', () => {
    // Must not throw
    expect(() => {
      mount();
      key('s', { ctrlKey: true });
    }).not.toThrow();
  });

  it('Ctrl+E calls onExport', () => {
    const onExport = vi.fn();
    mount({ onExport });
    key('e', { ctrlKey: true });
    expect(onExport).toHaveBeenCalledTimes(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Help cheatsheet
// ═════════════════════════════════════════════════════════════════════════════

describe('help cheatsheet toggle', () => {
  it('"?" key calls onToggleHelp', () => {
    const onToggleHelp = vi.fn();
    mount({ onToggleHelp });
    key('?');
    expect(onToggleHelp).toHaveBeenCalledTimes(1);
  });

  it('"?" with ctrlKey does NOT call onToggleHelp', () => {
    const onToggleHelp = vi.fn();
    mount({ onToggleHelp });
    key('?', { ctrlKey: true });
    expect(onToggleHelp).not.toHaveBeenCalled();
  });

  it('"?" is a no-op when onToggleHelp is not provided', () => {
    expect(() => {
      mount();
      key('?');
    }).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Copy / Paste / Duplicate / Select-all
// ═════════════════════════════════════════════════════════════════════════════

describe('copy / paste / duplicate / select-all', () => {
  it('Ctrl+C calls copySelectedLayers when layers are selected', () => {
    mockStore.selectedLayers = [makeLayer('a')];
    mount();
    key('c', { ctrlKey: true });
    expect(mockStore.copySelectedLayers).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+C does NOT call copySelectedLayers when nothing is selected', () => {
    mockStore.selectedLayers = [];
    mount();
    key('c', { ctrlKey: true });
    expect(mockStore.copySelectedLayers).not.toHaveBeenCalled();
  });

  it('Ctrl+V always calls pasteLayersFromClipboard', () => {
    mount();
    key('v', { ctrlKey: true });
    expect(mockStore.pasteLayersFromClipboard).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+D calls duplicateLayer with the first selected layer id', () => {
    mockStore.selectedLayers = [makeLayer('layer-1')];
    mount();
    key('d', { ctrlKey: true });
    expect(mockStore.duplicateLayer).toHaveBeenCalledWith('layer-1');
  });

  it('Ctrl+D is a no-op when nothing is selected', () => {
    mockStore.selectedLayers = [];
    mount();
    key('d', { ctrlKey: true });
    expect(mockStore.duplicateLayer).not.toHaveBeenCalled();
  });

  it('Ctrl+A calls selectAllLayers', () => {
    mount();
    key('a', { ctrlKey: true });
    expect(mockStore.selectAllLayers).toHaveBeenCalledTimes(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Delete / Backspace
// ═════════════════════════════════════════════════════════════════════════════

describe('delete / backspace', () => {
  it('Delete key calls removeLayer for each selected layer and onDeleteLayer', () => {
    const onDeleteLayer = vi.fn();
    mockStore.selectedLayers = [makeLayer('x'), makeLayer('y')];
    mount({ onDeleteLayer });
    key('Delete');
    expect(mockStore.removeLayer).toHaveBeenCalledWith('x');
    expect(mockStore.removeLayer).toHaveBeenCalledWith('y');
    expect(mockStore.removeLayer).toHaveBeenCalledTimes(2);
    expect(onDeleteLayer).toHaveBeenCalledTimes(1);
  });

  it('Backspace key also triggers deletion', () => {
    const onDeleteLayer = vi.fn();
    mockStore.selectedLayers = [makeLayer('z')];
    mount({ onDeleteLayer });
    key('Backspace');
    expect(mockStore.removeLayer).toHaveBeenCalledWith('z');
    expect(onDeleteLayer).toHaveBeenCalledTimes(1);
  });

  it('Delete is a no-op when nothing is selected', () => {
    const onDeleteLayer = vi.fn();
    mockStore.selectedLayers = [];
    mount({ onDeleteLayer });
    key('Delete');
    expect(mockStore.removeLayer).not.toHaveBeenCalled();
    expect(onDeleteLayer).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Zoom
// ═════════════════════════════════════════════════════════════════════════════

describe('zoom', () => {
  it('Ctrl+= zooms in (zoom * 1.2, capped at 5)', () => {
    mockStore.zoom = 1;
    mount();
    key('=', { ctrlKey: true });
    expect(mockStore.setZoom).toHaveBeenCalledWith(1.2);
  });

  it('Ctrl++ also zooms in', () => {
    mockStore.zoom = 1;
    mount();
    key('+', { ctrlKey: true });
    expect(mockStore.setZoom).toHaveBeenCalledWith(1.2);
  });

  it('zoom-in is capped at 5', () => {
    mockStore.zoom = 5;
    mount();
    key('=', { ctrlKey: true });
    // Math.min(5, 5 * 1.2) = 5
    expect(mockStore.setZoom).toHaveBeenCalledWith(5);
  });

  it('Ctrl+- zooms out (zoom / 1.2, floored at 0.1)', () => {
    mockStore.zoom = 1;
    mount();
    key('-', { ctrlKey: true });
    expect(mockStore.setZoom).toHaveBeenCalledWith(
      expect.closeTo(1 / 1.2, 5),
    );
  });

  it('zoom-out is floored at 0.1', () => {
    mockStore.zoom = 0.1;
    mount();
    key('-', { ctrlKey: true });
    // Math.max(0.1, 0.1 / 1.2) = 0.1
    expect(mockStore.setZoom).toHaveBeenCalledWith(0.1);
  });

  it('Ctrl+0 resets zoom to 1', () => {
    mockStore.zoom = 3;
    mount();
    key('0', { ctrlKey: true });
    expect(mockStore.setZoom).toHaveBeenCalledWith(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Arrow nudge
// ═════════════════════════════════════════════════════════════════════════════

describe('arrow nudge', () => {
  it('ArrowLeft nudges selected layer by -1 on x and calls updateLayer', () => {
    const layer = makeLayer('n1', 10, 20);
    mockStore.selectedLayers = [layer];
    const mockCanvas = { renderAll: vi.fn() };
    mockStore.canvas = mockCanvas;
    mount();
    key('ArrowLeft');
    expect(layer.set).toHaveBeenCalledWith('left', 9);
    expect(layer.set).toHaveBeenCalledWith('top', 20);
    expect(mockStore.updateLayer).toHaveBeenCalledWith('n1', { left: 9, top: 20 });
    expect(mockCanvas.renderAll).toHaveBeenCalled();
  });

  it('ArrowRight nudges by +1 on x', () => {
    const layer = makeLayer('n2', 10, 20);
    mockStore.selectedLayers = [layer];
    mount();
    key('ArrowRight');
    expect(layer.set).toHaveBeenCalledWith('left', 11);
    expect(mockStore.updateLayer).toHaveBeenCalledWith('n2', { left: 11, top: 20 });
  });

  it('ArrowUp nudges by -1 on y', () => {
    const layer = makeLayer('n3', 10, 20);
    mockStore.selectedLayers = [layer];
    mount();
    key('ArrowUp');
    expect(layer.set).toHaveBeenCalledWith('top', 19);
    expect(mockStore.updateLayer).toHaveBeenCalledWith('n3', { left: 10, top: 19 });
  });

  it('ArrowDown nudges by +1 on y', () => {
    const layer = makeLayer('n4', 10, 20);
    mockStore.selectedLayers = [layer];
    mount();
    key('ArrowDown');
    expect(layer.set).toHaveBeenCalledWith('top', 21);
    expect(mockStore.updateLayer).toHaveBeenCalledWith('n4', { left: 10, top: 21 });
  });

  it('Shift+ArrowRight nudges by 10 (large step)', () => {
    const layer = makeLayer('n5', 0, 0);
    mockStore.selectedLayers = [layer];
    mount();
    key('ArrowRight', { shiftKey: true });
    expect(layer.set).toHaveBeenCalledWith('left', 10);
    expect(mockStore.updateLayer).toHaveBeenCalledWith('n5', { left: 10, top: 0 });
  });

  it('ArrowKey is a no-op when nothing is selected', () => {
    mockStore.selectedLayers = [];
    mount();
    key('ArrowLeft');
    expect(mockStore.updateLayer).not.toHaveBeenCalled();
  });

  it('calls setCoords on the layer object after nudge', () => {
    const layer = makeLayer('n6', 5, 5);
    mockStore.selectedLayers = [layer];
    mount();
    key('ArrowUp');
    expect(layer.setCoords).toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Layer z-order (] and [)
// ═════════════════════════════════════════════════════════════════════════════

describe('layer z-order', () => {
  it('Ctrl+] calls reorderLayer with "up"', () => {
    mockStore.selectedLayers = [makeLayer('z1')];
    mount();
    key(']', { ctrlKey: true });
    expect(mockStore.reorderLayer).toHaveBeenCalledWith('z1', 'up');
  });

  it('Ctrl+[ calls reorderLayer with "down"', () => {
    mockStore.selectedLayers = [makeLayer('z2')];
    mockStore.layers = [{ id: 'z2' }, { id: 'z3' }, { id: 'z4' }];
    mount();
    key('[', { ctrlKey: true });
    expect(mockStore.reorderLayer).toHaveBeenCalledWith('z2', 'down');
  });

  it('Ctrl+Shift+] calls reorderLayer with 0 (bring to front)', () => {
    mockStore.selectedLayers = [makeLayer('z3')];
    mount();
    key(']', { ctrlKey: true, shiftKey: true });
    expect(mockStore.reorderLayer).toHaveBeenCalledWith('z3', 0);
  });

  it('Ctrl+Shift+[ calls reorderLayer with total-1 (send to back)', () => {
    mockStore.selectedLayers = [makeLayer('z4')];
    mockStore.layers = [{ id: 'z4' }, { id: 'z5' }, { id: 'z6' }];
    mount();
    key('[', { ctrlKey: true, shiftKey: true });
    // total - 1 = 3 - 1 = 2
    expect(mockStore.reorderLayer).toHaveBeenCalledWith('z4', 2);
  });

  it('Ctrl+] is a no-op when no layer is selected', () => {
    mockStore.selectedLayers = [];
    mount();
    key(']', { ctrlKey: true });
    expect(mockStore.reorderLayer).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Mac modifier (metaKey instead of ctrlKey)
// ═════════════════════════════════════════════════════════════════════════════

describe('Mac modifier (metaKey)', () => {
  beforeEach(() => {
    platformSpy.mockReturnValue('MacIntel');
  });

  it('Cmd+Z (metaKey) triggers undo on Mac', () => {
    mockStore.canUndo.mockReturnValue(true);
    mount();
    key('z', { metaKey: true });
    expect(mockStore.undo).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Z does NOT trigger undo on Mac (ctrlKey is ignored)', () => {
    mockStore.canUndo.mockReturnValue(true);
    mount();
    key('z', { ctrlKey: true });
    expect(mockStore.undo).not.toHaveBeenCalled();
  });

  it('Cmd+S calls onSave on Mac', () => {
    const onSave = vi.fn();
    mount({ onSave });
    key('s', { metaKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Guard: ignore events when typing in form elements
// ═════════════════════════════════════════════════════════════════════════════

describe('guard: ignored when target is a form element', () => {
  it('ignores Ctrl+Z when event target is an <input>', () => {
    mockStore.canUndo.mockReturnValue(true);
    mount();
    const input = document.createElement('input');
    document.body.appendChild(input);
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'z',
          bubbles: true,
          ctrlKey: true,
        }),
      );
    });
    expect(mockStore.undo).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('ignores Delete when event target is a <textarea>', () => {
    mockStore.selectedLayers = [makeLayer('guarded')];
    mount();
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    act(() => {
      ta.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }),
      );
    });
    expect(mockStore.removeLayer).not.toHaveBeenCalled();
    document.body.removeChild(ta);
  });

  it('ignores shortcuts when target is a contentEditable element', () => {
    const onSave = vi.fn();
    mount({ onSave });
    const div = document.createElement('div');
    div.contentEditable = 'true';
    document.body.appendChild(div);
    act(() => {
      div.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 's',
          bubbles: true,
          ctrlKey: true,
        }),
      );
    });
    expect(onSave).not.toHaveBeenCalled();
    document.body.removeChild(div);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Guard: enabled=false disables all shortcuts
// ═════════════════════════════════════════════════════════════════════════════

describe('guard: enabled=false', () => {
  it('does not register any listener when enabled is false', () => {
    const onSave = vi.fn();
    mount({ onSave, enabled: false });
    key('s', { ctrlKey: true });
    expect(onSave).not.toHaveBeenCalled();
    expect(mockStore.undo).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Guard: unmount removes listener
// ═════════════════════════════════════════════════════════════════════════════

describe('listener cleanup on unmount', () => {
  it('stops responding to keydown events after the hook unmounts', () => {
    const onSave = vi.fn();
    const { unmount } = mount({ onSave });
    key('s', { ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);

    unmount();

    key('s', { ctrlKey: true });
    // Still 1 — the second dispatch should be ignored
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// No-op for unmapped keys
// ═════════════════════════════════════════════════════════════════════════════

describe('no-op for unmapped keys', () => {
  it('does not call any store action for an unmapped key', () => {
    const onSave = vi.fn();
    mount({ onSave });
    key('F5');
    key('Tab');
    key('Enter');
    expect(onSave).not.toHaveBeenCalled();
    expect(mockStore.undo).not.toHaveBeenCalled();
    expect(mockStore.redo).not.toHaveBeenCalled();
    expect(mockStore.removeLayer).not.toHaveBeenCalled();
    expect(mockStore.setZoom).not.toHaveBeenCalled();
  });
});
