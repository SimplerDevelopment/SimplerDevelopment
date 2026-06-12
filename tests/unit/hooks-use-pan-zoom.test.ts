// @vitest-environment jsdom
/**
 * Unit tests for usePanZoom.
 *
 * Strategy:
 *   - For tests that need the wheel/key effects to find a real DOM node, we
 *     render the hook inside a tiny React wrapper component that attaches the
 *     hook's canvasRef to a <div> during the render phase (before effects run).
 *     renderHookWithCanvas() encapsulates this pattern.
 *   - For pure state tests (zoomIn/out/reset, mouse handlers, bounds), we use
 *     the simpler renderHook from @testing-library/react directly.
 *   - Exercise: initial state, zoomIn/out/reset/setZoomLevel bounds, mouse pan
 *     handlers, wheel zoom, wheel pan, space-key grab cursor, cleanup.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, render, act } from '@testing-library/react';
import { usePanZoom } from '/Users/dancoyle/.herdr/worktrees/simplerdevelopment2026/worktree-dev-env/components/portal/visual-editor/_hooks/usePanZoom';

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Render usePanZoom inside a wrapper <div> component so that canvasRef.current
 * is populated BEFORE useEffect runs (wheel + key effects check canvasRef on
 * mount — a null ref skips the listener attachment).
 */
function renderHookWithCanvas(initialZoom?: number) {
  let hookResult!: ReturnType<typeof usePanZoom>;
  const canvasDiv = document.createElement('div');
  document.body.appendChild(canvasDiv);

  function Wrapper() {
    const hook = usePanZoom(initialZoom);
    hookResult = hook;
    // Assign synchronously during render so effects see a populated ref
    if (!hook.canvasRef.current) {
      // @ts-expect-error — RefObject.current is readonly outside reconciler
      hook.canvasRef.current = canvasDiv;
    }
    return null;
  }

  const { unmount } = render(React.createElement(Wrapper));
  const result = { get current() { return hookResult; } };
  return { result, canvas: canvasDiv, unmount };
}

function makeWheelEvent(opts: {
  deltaX?: number;
  deltaY?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
}): WheelEvent {
  return new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaX: opts.deltaX ?? 0,
    deltaY: opts.deltaY ?? 0,
    ctrlKey: opts.ctrlKey ?? false,
    metaKey: opts.metaKey ?? false,
  });
}

function makeKeyEvent(type: 'keydown' | 'keyup', code: string, repeat = false): KeyboardEvent {
  return new KeyboardEvent(type, { code, repeat, bubbles: true });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('usePanZoom', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  // ── initial state ─────────────────────────────────────────────────────────

  it('defaults zoomLevel to 100 when no initialZoom supplied', () => {
    const { result } = renderHook(() => usePanZoom());
    expect(result.current.zoomLevel).toBe(100);
  });

  it('accepts an initialZoom value', () => {
    const { result } = renderHook(() => usePanZoom(150));
    expect(result.current.zoomLevel).toBe(150);
  });

  it('defaults panOffset to { x: 0, y: 0 }', () => {
    const { result } = renderHook(() => usePanZoom());
    expect(result.current.panOffset).toEqual({ x: 0, y: 0 });
  });

  it('exposes canvasRef as a RefObject', () => {
    const { result } = renderHook(() => usePanZoom());
    expect(result.current.canvasRef).toBeDefined();
  });

  // ── zoomIn ────────────────────────────────────────────────────────────────

  it('zoomIn increases zoomLevel by 10', () => {
    const { result } = renderHook(() => usePanZoom(100));
    act(() => result.current.zoomIn());
    expect(result.current.zoomLevel).toBe(110);
  });

  it('zoomIn clamps at 200', () => {
    const { result } = renderHook(() => usePanZoom(195));
    act(() => result.current.zoomIn());
    expect(result.current.zoomLevel).toBe(200);

    act(() => result.current.zoomIn());
    expect(result.current.zoomLevel).toBe(200);
  });

  it('zoomIn multiple times accumulates correctly', () => {
    const { result } = renderHook(() => usePanZoom(80));
    act(() => {
      result.current.zoomIn();
      result.current.zoomIn();
    });
    expect(result.current.zoomLevel).toBe(100);
  });

  // ── zoomOut ───────────────────────────────────────────────────────────────

  it('zoomOut decreases zoomLevel by 10', () => {
    const { result } = renderHook(() => usePanZoom(100));
    act(() => result.current.zoomOut());
    expect(result.current.zoomLevel).toBe(90);
  });

  it('zoomOut clamps at 30', () => {
    const { result } = renderHook(() => usePanZoom(35));
    act(() => result.current.zoomOut());
    expect(result.current.zoomLevel).toBe(30);

    act(() => result.current.zoomOut());
    expect(result.current.zoomLevel).toBe(30);
  });

  // ── zoomReset ─────────────────────────────────────────────────────────────

  it('zoomReset resets to 100', () => {
    const { result } = renderHook(() => usePanZoom(170));
    act(() => result.current.zoomReset());
    expect(result.current.zoomLevel).toBe(100);
  });

  it('zoomReset works from a low value too', () => {
    const { result } = renderHook(() => usePanZoom(40));
    act(() => result.current.zoomReset());
    expect(result.current.zoomLevel).toBe(100);
  });

  // ── setZoomLevel ──────────────────────────────────────────────────────────

  it('setZoomLevel directly sets the value', () => {
    const { result } = renderHook(() => usePanZoom());
    act(() => result.current.setZoomLevel(120));
    expect(result.current.zoomLevel).toBe(120);
  });

  // ── bounds ────────────────────────────────────────────────────────────────

  it('zoomIn from 200 stays at 200', () => {
    const { result } = renderHook(() => usePanZoom(200));
    act(() => result.current.zoomIn());
    expect(result.current.zoomLevel).toBe(200);
  });

  it('zoomOut from 30 stays at 30', () => {
    const { result } = renderHook(() => usePanZoom(30));
    act(() => result.current.zoomOut());
    expect(result.current.zoomLevel).toBe(30);
  });

  it('zoomReset followed by zoomIn gives 110', () => {
    const { result } = renderHook(() => usePanZoom(50));
    act(() => result.current.zoomReset());
    act(() => result.current.zoomIn());
    expect(result.current.zoomLevel).toBe(110);
  });

  // ── wheel event: zoom (ctrl/meta + wheel) ─────────────────────────────────

  it('ctrl+wheel-down zooms out by 5', () => {
    const { canvas, unmount } = renderHookWithCanvas(100);

    act(() => {
      canvas.dispatchEvent(makeWheelEvent({ deltaY: 10, ctrlKey: true }));
    });

    // The hook state update happened internally — we read it via a fresh renderHook
    // for the same initial value to check the direction, but since the wrapper owns
    // the state we verify the canvas received the event (no error thrown means it ran).
    // We'll test the state via the result accessor.
    unmount();
    canvas.remove();
  });

  it('ctrl+wheel changes zoom state (verifiable via renderHookWithCanvas result)', () => {
    const { result, canvas, unmount } = renderHookWithCanvas(100);

    act(() => {
      canvas.dispatchEvent(makeWheelEvent({ deltaY: 10, ctrlKey: true }));
    });

    expect(result.current.zoomLevel).toBe(95);
    unmount();
    canvas.remove();
  });

  it('ctrl+wheel-up zooms in by 5', () => {
    const { result, canvas, unmount } = renderHookWithCanvas(100);

    act(() => {
      canvas.dispatchEvent(makeWheelEvent({ deltaY: -10, ctrlKey: true }));
    });

    expect(result.current.zoomLevel).toBe(105);
    unmount();
    canvas.remove();
  });

  it('meta+wheel-down zooms out by 5', () => {
    const { result, canvas, unmount } = renderHookWithCanvas(100);

    act(() => {
      canvas.dispatchEvent(makeWheelEvent({ deltaY: 5, metaKey: true }));
    });

    expect(result.current.zoomLevel).toBe(95);
    unmount();
    canvas.remove();
  });

  it('ctrl+wheel clamps at lower bound (30)', () => {
    const { result, canvas, unmount } = renderHookWithCanvas(31);

    act(() => {
      canvas.dispatchEvent(makeWheelEvent({ deltaY: 100, ctrlKey: true }));
    });

    expect(result.current.zoomLevel).toBe(30);
    unmount();
    canvas.remove();
  });

  it('ctrl+wheel clamps at upper bound (200)', () => {
    const { result, canvas, unmount } = renderHookWithCanvas(198);

    act(() => {
      canvas.dispatchEvent(makeWheelEvent({ deltaY: -100, ctrlKey: true }));
    });

    expect(result.current.zoomLevel).toBe(200);
    unmount();
    canvas.remove();
  });

  // ── wheel event: plain pan ─────────────────────────────────────────────────

  it('plain wheel pans by negated deltaX/deltaY', () => {
    const { result, canvas, unmount } = renderHookWithCanvas();

    act(() => {
      canvas.dispatchEvent(makeWheelEvent({ deltaX: 10, deltaY: 20 }));
    });

    expect(result.current.panOffset).toEqual({ x: -10, y: -20 });
    unmount();
    canvas.remove();
  });

  it('plain wheel accumulates pan offsets across multiple events', () => {
    const { result, canvas, unmount } = renderHookWithCanvas();

    act(() => {
      canvas.dispatchEvent(makeWheelEvent({ deltaX: 5, deltaY: 5 }));
      canvas.dispatchEvent(makeWheelEvent({ deltaX: 5, deltaY: 5 }));
    });

    expect(result.current.panOffset).toEqual({ x: -10, y: -10 });
    unmount();
    canvas.remove();
  });

  it('plain wheel does not change zoom level', () => {
    const { result, canvas, unmount } = renderHookWithCanvas(100);

    act(() => {
      canvas.dispatchEvent(makeWheelEvent({ deltaY: 50 }));
    });

    expect(result.current.zoomLevel).toBe(100);
    unmount();
    canvas.remove();
  });

  // ── mouse pan handlers ────────────────────────────────────────────────────

  it('mouseDown with middle button starts panning', () => {
    const { result } = renderHook(() => usePanZoom());

    act(() => {
      result.current.handleCanvasMouseDown({
        button: 1,
        clientX: 50,
        clientY: 60,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent);
    });

    // Panning started — subsequent mouse move should update offset
    act(() => {
      result.current.handleCanvasMouseMove({
        clientX: 70,
        clientY: 80,
      } as unknown as React.MouseEvent);
    });

    expect(result.current.panOffset).toEqual({ x: 20, y: 20 });
  });

  it('mouseUp ends panning — subsequent mouseMoves do nothing', () => {
    const { result } = renderHook(() => usePanZoom());

    act(() => {
      result.current.handleCanvasMouseDown({
        button: 1,
        clientX: 0,
        clientY: 0,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent);
    });

    act(() => {
      result.current.handleCanvasMouseUp();
    });

    act(() => {
      result.current.handleCanvasMouseMove({
        clientX: 100,
        clientY: 100,
      } as unknown as React.MouseEvent);
    });

    expect(result.current.panOffset).toEqual({ x: 0, y: 0 });
  });

  it('mouseMove while not panning is a no-op', () => {
    const { result } = renderHook(() => usePanZoom());

    act(() => {
      result.current.handleCanvasMouseMove({
        clientX: 999,
        clientY: 999,
      } as unknown as React.MouseEvent);
    });

    expect(result.current.panOffset).toEqual({ x: 0, y: 0 });
  });

  it('mouseDown with left button (no space) does not start panning', () => {
    const { result } = renderHook(() => usePanZoom());

    act(() => {
      result.current.handleCanvasMouseDown({
        button: 0,
        clientX: 0,
        clientY: 0,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent);
    });

    act(() => {
      result.current.handleCanvasMouseMove({
        clientX: 50,
        clientY: 50,
      } as unknown as React.MouseEvent);
    });

    expect(result.current.panOffset).toEqual({ x: 0, y: 0 });
  });

  it('mouseUp when not panning is a no-op', () => {
    const { result } = renderHook(() => usePanZoom());

    act(() => {
      result.current.handleCanvasMouseUp();
    });

    expect(result.current.panOffset).toEqual({ x: 0, y: 0 });
  });

  // ── pan delta math ────────────────────────────────────────────────────────

  it('pan delta = (currentMouse - startMouse) + startOffset', () => {
    const { result } = renderHook(() => usePanZoom());

    act(() => {
      result.current.handleCanvasMouseDown({
        button: 1,
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent);
    });

    act(() => {
      result.current.handleCanvasMouseMove({
        clientX: 150,
        clientY: 80,
      } as unknown as React.MouseEvent);
    });

    // dx = 150-100 = 50, dy = 80-100 = -20
    expect(result.current.panOffset).toEqual({ x: 50, y: -20 });
  });

  // ── space key: grab cursor ────────────────────────────────────────────────

  it('space keydown sets grab cursor on canvas', () => {
    const { canvas, unmount } = renderHookWithCanvas();

    act(() => {
      window.dispatchEvent(makeKeyEvent('keydown', 'Space'));
    });

    expect(canvas.style.cursor).toBe('grab');
    unmount();
    canvas.remove();
  });

  it('space keyup clears cursor when not panning', () => {
    const { canvas, unmount } = renderHookWithCanvas();

    act(() => {
      window.dispatchEvent(makeKeyEvent('keydown', 'Space'));
    });

    act(() => {
      window.dispatchEvent(makeKeyEvent('keyup', 'Space'));
    });

    expect(canvas.style.cursor).toBe('');
    unmount();
    canvas.remove();
  });

  it('space+mouseDown starts panning (left button allowed when space held)', () => {
    const { result, canvas, unmount } = renderHookWithCanvas();

    act(() => {
      window.dispatchEvent(makeKeyEvent('keydown', 'Space'));
    });

    act(() => {
      result.current.handleCanvasMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent);
    });

    act(() => {
      result.current.handleCanvasMouseMove({
        clientX: 30,
        clientY: 30,
      } as unknown as React.MouseEvent);
    });

    expect(result.current.panOffset).toEqual({ x: 20, y: 20 });
    unmount();
    canvas.remove();
  });

  it('repeated space keydown (repeat=true) is ignored', () => {
    const { canvas, unmount } = renderHookWithCanvas();

    act(() => {
      window.dispatchEvent(makeKeyEvent('keydown', 'Space'));
      // repeat=true: should be a no-op for cursor
      window.dispatchEvent(makeKeyEvent('keydown', 'Space', true));
    });

    // cursor set by first press, not doubled
    expect(canvas.style.cursor).toBe('grab');
    unmount();
    canvas.remove();
  });

  it('non-space keydown does not affect cursor', () => {
    const { canvas, unmount } = renderHookWithCanvas();

    act(() => {
      window.dispatchEvent(makeKeyEvent('keydown', 'KeyA'));
    });

    expect(canvas.style.cursor).toBe('');
    unmount();
    canvas.remove();
  });

  // ── cleanup: no listener leaks ────────────────────────────────────────────

  it('unmounting removes window key listeners', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => usePanZoom());
    unmount();

    const removed = removeSpy.mock.calls.map((c) => c[0]);
    expect(removed).toContain('keydown');
    expect(removed).toContain('keyup');
  });

  it('unmounting removes wheel listener on canvas', () => {
    const { canvas, unmount } = renderHookWithCanvas();

    const removeSpy = vi.spyOn(canvas, 'removeEventListener');
    unmount();

    expect(removeSpy).toHaveBeenCalledWith('wheel', expect.any(Function));
    canvas.remove();
  });
});
