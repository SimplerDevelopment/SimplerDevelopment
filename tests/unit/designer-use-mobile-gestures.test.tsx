// @vitest-environment jsdom
/**
 * Unit tests for `lib/designer/hooks/useMobileGestures.ts`.
 *
 * The hook registers touchstart/touchmove/touchend listeners on the element
 * returned by canvas.getElement(). Tests simulate gestures by dispatching
 * TouchEvent on that element and assert that onZoom / onPan callbacks fire
 * with correct deltas.
 *
 * jsdom supports TouchEvent and passes plain touch-like objects through the
 * `touches` iterable init field; the hook's `toPoints` reads .clientX /
 * .clientY / .identifier from them — all present on our plain objects.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ─── Fabric mock (must precede hook import) ────────────────────────────────

// The hook imports `Point` and `Canvas` from 'fabric'. We only need:
//   new Point(x, y)          – passed to canvas.zoomToPoint / relativePan
//   canvas.getZoom()         – returns current zoom
//   canvas.zoomToPoint(p, z) – side-effectful
//   canvas.relativePan(p)    – side-effectful
//   canvas.getElement()      – returns the DOM element
//   canvas.getActiveObject() – returns null (no selection)
//   canvas.renderAll()       – side-effectful

vi.mock('fabric', () => {
  class PointCtor {
    x: number;
    y: number;
    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
    }
  }

  class MockCanvas {
    private _zoom = 1;
    private _el: HTMLCanvasElement;

    constructor(el: HTMLCanvasElement) {
      this._el = el;
    }

    getElement() {
      return this._el;
    }
    getZoom() {
      return this._zoom;
    }
    setZoom(z: number) {
      this._zoom = z;
    }
    zoomToPoint(_point: unknown, z: number) {
      void _point;
      this._zoom = z;
    }
    relativePan(_point: unknown) {
      void _point;
      // no-op; captured via onPan spy
    }
    getActiveObject() {
      return null;
    }
    renderAll() {
      // no-op
    }
  }

  return { Point: PointCtor, Canvas: MockCanvas };
});

import { useMobileGestures } from '@/lib/designer/hooks/useMobileGestures';

// ─── Touch-like object helper ──────────────────────────────────────────────

/** A plain object shaped like a Touch — jsdom passes these through the
 *  `touches` iterable unchanged; the hook reads clientX/clientY/identifier. */
interface TouchLike {
  clientX: number;
  clientY: number;
  identifier: number;
}

function makeTouchLike(
  clientX: number,
  clientY: number,
  identifier = 0,
): TouchLike {
  return { clientX, clientY, identifier };
}

/** Build a TouchEvent with an iterable touches array made of plain objects.
 *  jsdom's TouchEventInit accepts any iterable for `touches`. */
function makeTouchEvent(
  type: string,
  touches: TouchLike[],
): TouchEvent {
  return new TouchEvent(type, {
    bubbles: true,
    cancelable: true,
    touches: touches as unknown as Touch[],
    targetTouches: touches as unknown as Touch[],
    changedTouches: touches as unknown as Touch[],
  });
}

// ─── Canvas + DOM element factory ─────────────────────────────────────────

// Import after mock is established so we get the mock class.
import { Canvas as FabricCanvas } from 'fabric';

function makeCanvas(): {
  canvas: InstanceType<typeof FabricCanvas>;
  el: HTMLCanvasElement;
} {
  const el = document.createElement('canvas');
  document.body.appendChild(el);
  const canvas = new (FabricCanvas as unknown as new (
    el: HTMLCanvasElement,
  ) => InstanceType<typeof FabricCanvas>)(el);
  return { canvas, el };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────

beforeEach(() => {
  // Force isMobile = true (hook checks window.innerWidth <= 768).
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: 375,
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  // Remove any canvas elements added to body.
  document.body.innerHTML = '';
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe('useMobileGestures — isMobile flag', () => {
  it('returns isMobile=true when innerWidth <= 768', () => {
    const { canvas } = makeCanvas();
    const { result } = renderHook(() =>
      useMobileGestures({ canvas, enabled: true }),
    );
    expect(result.current.isMobile).toBe(true);
  });

  it('returns isMobile=false when innerWidth > 768', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1280,
    });
    const { canvas } = makeCanvas();
    const { result } = renderHook(() =>
      useMobileGestures({ canvas, enabled: true }),
    );
    expect(result.current.isMobile).toBe(false);
  });
});

describe('useMobileGestures — guard branches (no listeners wired)', () => {
  it('does not throw when canvas is null', () => {
    expect(() => {
      renderHook(() => useMobileGestures({ canvas: null }));
    }).not.toThrow();
  });

  it('does not fire onPan when enabled=false', () => {
    const { canvas, el } = makeCanvas();
    const onPan = vi.fn();
    renderHook(() =>
      useMobileGestures({ canvas, enabled: false, onPan }),
    );
    act(() => {
      el.dispatchEvent(makeTouchEvent('touchstart', [makeTouchLike(100, 100)]));
      el.dispatchEvent(makeTouchEvent('touchmove', [makeTouchLike(150, 120)]));
    });
    expect(onPan).not.toHaveBeenCalled();
  });

  it('does not fire onPan when isMobile=false (wide viewport)', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1440,
    });
    const { canvas, el } = makeCanvas();
    const onPan = vi.fn();
    renderHook(() => useMobileGestures({ canvas, enabled: true, onPan }));
    act(() => {
      el.dispatchEvent(makeTouchEvent('touchstart', [makeTouchLike(0, 0)]));
      el.dispatchEvent(makeTouchEvent('touchmove', [makeTouchLike(100, 100)]));
    });
    expect(onPan).not.toHaveBeenCalled();
  });
});

describe('useMobileGestures — single-finger pan', () => {
  it('fires onPan with correct deltas when movement exceeds threshold', () => {
    const { canvas, el } = makeCanvas();
    const onPan = vi.fn();
    renderHook(() => useMobileGestures({ canvas, enabled: true, onPan }));

    act(() => {
      el.dispatchEvent(makeTouchEvent('touchstart', [makeTouchLike(100, 100)]));
    });
    // Advance time so Date.now() returns a value > lastPanTime
    vi.advanceTimersByTime(50);
    act(() => {
      el.dispatchEvent(makeTouchEvent('touchmove', [makeTouchLike(160, 130)]));
    });

    expect(onPan).toHaveBeenCalledOnce();
    const [dx, dy] = onPan.mock.calls[0] as [number, number];
    expect(dx).toBe(60);
    expect(dy).toBe(30);
  });

  it('does NOT fire onPan when movement is <= 2px (below threshold)', () => {
    const { canvas, el } = makeCanvas();
    const onPan = vi.fn();
    renderHook(() => useMobileGestures({ canvas, enabled: true, onPan }));

    act(() => {
      el.dispatchEvent(makeTouchEvent('touchstart', [makeTouchLike(100, 100)]));
    });
    vi.advanceTimersByTime(50);
    act(() => {
      el.dispatchEvent(makeTouchEvent('touchmove', [makeTouchLike(101, 100)]));
    });

    expect(onPan).not.toHaveBeenCalled();
  });

  it('does NOT fire onPan when an active moving object is on the canvas', () => {
    const { canvas, el } = makeCanvas();
    // Simulate an active object that is currently being moved.
    (canvas as unknown as { getActiveObject: () => unknown }).getActiveObject =
      vi.fn().mockReturnValue({ isMoving: true });

    const onPan = vi.fn();
    renderHook(() => useMobileGestures({ canvas, enabled: true, onPan }));

    act(() => {
      el.dispatchEvent(makeTouchEvent('touchstart', [makeTouchLike(100, 100)]));
    });
    vi.advanceTimersByTime(50);
    act(() => {
      el.dispatchEvent(makeTouchEvent('touchmove', [makeTouchLike(200, 200)]));
    });

    expect(onPan).not.toHaveBeenCalled();
  });
});

describe('useMobileGestures — two-finger pinch-zoom', () => {
  it('fires onZoom when two fingers spread apart (zoom in)', () => {
    const { canvas, el } = makeCanvas();
    const onZoom = vi.fn();
    renderHook(() =>
      useMobileGestures({ canvas, enabled: true, onZoom }),
    );

    // Two-touch start: fingers 50px apart
    act(() => {
      el.dispatchEvent(
        makeTouchEvent('touchstart', [
          makeTouchLike(100, 100, 0),
          makeTouchLike(150, 100, 1),
        ]),
      );
    });

    // Two-touch move: fingers now 100px apart (scale factor = 2)
    act(() => {
      el.dispatchEvent(
        makeTouchEvent('touchmove', [
          makeTouchLike(75, 100, 0),
          makeTouchLike(175, 100, 1),
        ]),
      );
    });

    expect(onZoom).toHaveBeenCalledOnce();
    const [zoom] = onZoom.mock.calls[0] as [number];
    // Initial zoom=1, scaleFactor = 100/50 = 2 → zoom = 2 (within maxZoom=5)
    expect(zoom).toBeCloseTo(2, 5);
  });

  it('fires onZoom when two fingers pinch together (zoom out)', () => {
    const { canvas, el } = makeCanvas();
    const onZoom = vi.fn();
    renderHook(() =>
      useMobileGestures({ canvas, enabled: true, onZoom, minZoom: 0.1 }),
    );

    // Start 100px apart
    act(() => {
      el.dispatchEvent(
        makeTouchEvent('touchstart', [
          makeTouchLike(50, 100, 0),
          makeTouchLike(150, 100, 1),
        ]),
      );
    });

    // Move to 50px apart (scale = 0.5)
    act(() => {
      el.dispatchEvent(
        makeTouchEvent('touchmove', [
          makeTouchLike(75, 100, 0),
          makeTouchLike(125, 100, 1),
        ]),
      );
    });

    expect(onZoom).toHaveBeenCalledOnce();
    const [zoom] = onZoom.mock.calls[0] as [number];
    expect(zoom).toBeCloseTo(0.5, 5);
  });

  it('clamps zoom to maxZoom', () => {
    const { canvas, el } = makeCanvas();
    const onZoom = vi.fn();
    renderHook(() =>
      useMobileGestures({ canvas, enabled: true, onZoom, maxZoom: 1.5 }),
    );

    act(() => {
      el.dispatchEvent(
        makeTouchEvent('touchstart', [
          makeTouchLike(100, 100, 0),
          makeTouchLike(110, 100, 1),
        ]),
      );
    });

    // Spread to 10x → would be zoom=10, clamped to 1.5
    act(() => {
      el.dispatchEvent(
        makeTouchEvent('touchmove', [
          makeTouchLike(50, 100, 0),
          makeTouchLike(150, 100, 1),
        ]),
      );
    });

    expect(onZoom).toHaveBeenCalledOnce();
    const [zoom] = onZoom.mock.calls[0] as [number];
    expect(zoom).toBe(1.5);
  });

  it('clamps zoom to minZoom', () => {
    const { canvas, el } = makeCanvas();
    const onZoom = vi.fn();
    renderHook(() =>
      useMobileGestures({ canvas, enabled: true, onZoom, minZoom: 0.8 }),
    );

    act(() => {
      el.dispatchEvent(
        makeTouchEvent('touchstart', [
          makeTouchLike(0, 100, 0),
          makeTouchLike(200, 100, 1),
        ]),
      );
    });

    // Pinch to near-zero distance → zoom would underflow, clamped to 0.8
    act(() => {
      el.dispatchEvent(
        makeTouchEvent('touchmove', [
          makeTouchLike(99, 100, 0),
          makeTouchLike(101, 100, 1),
        ]),
      );
    });

    expect(onZoom).toHaveBeenCalledOnce();
    const [zoom] = onZoom.mock.calls[0] as [number];
    expect(zoom).toBe(0.8);
  });

  it('fires onPan from the center shift during two-finger gesture', () => {
    const { canvas, el } = makeCanvas();
    const onPan = vi.fn();
    renderHook(() => useMobileGestures({ canvas, enabled: true, onPan }));

    // Start: center at (125, 100)
    act(() => {
      el.dispatchEvent(
        makeTouchEvent('touchstart', [
          makeTouchLike(100, 100, 0),
          makeTouchLike(150, 100, 1),
        ]),
      );
    });

    // Move: center shifts to (150, 110) → deltaX=25, deltaY=10
    act(() => {
      el.dispatchEvent(
        makeTouchEvent('touchmove', [
          makeTouchLike(125, 105, 0),
          makeTouchLike(175, 115, 1),
        ]),
      );
    });

    expect(onPan).toHaveBeenCalledOnce();
    const [dx, dy] = onPan.mock.calls[0] as [number, number];
    expect(dx).toBe(25);
    expect(dy).toBe(10);
  });

  it('does not fire onZoom on the first touchmove when lastDistance is 0', () => {
    // If somehow lastDistance was 0 (e.g. touches coincident on start), the
    // hook guards with `if (gestureRef.current.lastDistance > 0)` before zooming.
    const { canvas, el } = makeCanvas();
    const onZoom = vi.fn();
    renderHook(() => useMobileGestures({ canvas, enabled: true, onZoom }));

    // Start with coincident touches → distance = 0
    act(() => {
      el.dispatchEvent(
        makeTouchEvent('touchstart', [
          makeTouchLike(100, 100, 0),
          makeTouchLike(100, 100, 1),
        ]),
      );
    });

    act(() => {
      el.dispatchEvent(
        makeTouchEvent('touchmove', [
          makeTouchLike(50, 100, 0),
          makeTouchLike(150, 100, 1),
        ]),
      );
    });

    expect(onZoom).not.toHaveBeenCalled();
  });
});

describe('useMobileGestures — touchend resets gesture state', () => {
  it('resets isGesturing when fingers drop to <2', () => {
    const { canvas, el } = makeCanvas();
    const onZoom = vi.fn();
    renderHook(() => useMobileGestures({ canvas, enabled: true, onZoom }));

    act(() => {
      el.dispatchEvent(
        makeTouchEvent('touchstart', [
          makeTouchLike(100, 100, 0),
          makeTouchLike(200, 100, 1),
        ]),
      );
    });

    // Lift one finger — remaining touch list has 1 entry
    act(() => {
      el.dispatchEvent(makeTouchEvent('touchend', [makeTouchLike(100, 100, 0)]));
    });

    onZoom.mockClear();

    // Now a single-touch move should NOT trigger zoom (isGesturing is false)
    act(() => {
      el.dispatchEvent(
        makeTouchEvent('touchmove', [
          makeTouchLike(100, 100, 0),
          makeTouchLike(300, 100, 1),
        ]),
      );
    });

    // isGesturing=false so the two-touch branch won't fire
    expect(onZoom).not.toHaveBeenCalled();
  });
});

describe('useMobileGestures — listener cleanup on unmount', () => {
  it('removes event listeners when the hook unmounts', () => {
    const { canvas, el } = makeCanvas();
    const onPan = vi.fn();

    const removeSpy = vi.spyOn(el, 'removeEventListener');

    const { unmount } = renderHook(() =>
      useMobileGestures({ canvas, enabled: true, onPan }),
    );

    unmount();

    // Three listeners should have been removed
    const removedTypes = removeSpy.mock.calls.map(
      (c) => c[0] as string,
    );
    expect(removedTypes).toContain('touchstart');
    expect(removedTypes).toContain('touchmove');
    expect(removedTypes).toContain('touchend');
  });

  it('does not fire callbacks after unmount', () => {
    const { canvas, el } = makeCanvas();
    const onPan = vi.fn();

    const { unmount } = renderHook(() =>
      useMobileGestures({ canvas, enabled: true, onPan }),
    );

    act(() => {
      el.dispatchEvent(makeTouchEvent('touchstart', [makeTouchLike(100, 100)]));
    });

    unmount();

    act(() => {
      el.dispatchEvent(makeTouchEvent('touchmove', [makeTouchLike(200, 200)]));
    });

    // Only the pre-unmount start had any effect; no pan should fire post-unmount
    expect(onPan).not.toHaveBeenCalled();
  });
});
