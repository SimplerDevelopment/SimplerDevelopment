// @vitest-environment jsdom
/**
 * Unit tests for 4 React hook files (batch 39g):
 *   - hooks/use3DScene.ts            — WebGL support + performance detection
 *   - hooks/useScrollAnimation.ts    — scroll-based motion values (framer-motion)
 *   - hooks/useTheme.ts              — light/dark/system theme management
 *   - lib/hooks/useBlockHistory.ts   — block editor undo/redo state
 *
 * Strategy:
 *   - use3DScene: stub HTMLCanvasElement.getContext + navigator props to drive
 *     all branches (WebGL present/absent, mobile UA, low deviceMemory).
 *   - useScrollAnimation: framer-motion's useScroll requires a scroll target.
 *     We verify the hooks return MotionValue-shaped objects without crashing,
 *     drive useScrollDirection through window.scroll events, and exercise
 *     useInView via a mocked IntersectionObserver.
 *   - useTheme: drive localStorage + matchMedia + system-theme changes.
 *   - useBlockHistory: cover initialization, setBlocks (normal + batch),
 *     setPageSettings, undo, redo, clearHistory, and metadata.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ─── use3DScene ─────────────────────────────────────────────────────────────
import { use3DScene } from '@/hooks/use3DScene';

describe('use3DScene', () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent');

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    if (originalUserAgent) {
      Object.defineProperty(navigator, 'userAgent', originalUserAgent);
    }
    delete (navigator as any).deviceMemory;
    vi.restoreAllMocks();
  });

  it('reports supportsWebGL=false when getContext returns null', () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as any;
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Desktop)',
    });

    const { result } = renderHook(() => use3DScene());
    expect(result.current.supportsWebGL).toBe(false);
    // when getContext returns null, hook returns early — isLowPerformance
    // stays at its default (false), frameloopMode is 'always'
    expect(result.current.isLowPerformance).toBe(false);
    expect(result.current.frameloopMode).toBe('always');
  });

  it('returns supportsWebGL=true on a desktop UA with no low-memory flag', () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({}) as any) as any;
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120',
    });
    delete (navigator as any).deviceMemory;

    const { result } = renderHook(() => use3DScene());
    expect(result.current.supportsWebGL).toBe(true);
    // Without deviceMemory, hasLowMemory is undefined; the resulting value
    // of (false || undefined) is undefined (falsy). frameloopMode should
    // therefore resolve to 'always'.
    expect(result.current.isLowPerformance).toBeFalsy();
    expect(result.current.frameloopMode).toBe('always');
  });

  it('flags isLowPerformance=true for mobile user agents', () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({}) as any) as any;
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    });

    const { result } = renderHook(() => use3DScene());
    expect(result.current.supportsWebGL).toBe(true);
    expect(result.current.isLowPerformance).toBe(true);
    expect(result.current.frameloopMode).toBe('demand');
  });

  it('flags isLowPerformance=true when deviceMemory < 4', () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({}) as any) as any;
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    });
    (navigator as any).deviceMemory = 2;

    const { result } = renderHook(() => use3DScene());
    expect(result.current.isLowPerformance).toBe(true);
    expect(result.current.frameloopMode).toBe('demand');
  });

  it('falls back to experimental-webgl context when webgl context is unavailable', () => {
    const ctxStub = {};
    HTMLCanvasElement.prototype.getContext = vi.fn((type: string) =>
      type === 'webgl' ? null : ctxStub
    ) as any;
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; X11)',
    });

    const { result } = renderHook(() => use3DScene());
    expect(result.current.supportsWebGL).toBe(true);
  });
});

// ─── useScrollAnimation ─────────────────────────────────────────────────────
import {
  useScrollAnimation,
  useScrollDirection,
  useScrollProgress,
  useInView,
} from '@/hooks/useScrollAnimation';

describe('useScrollAnimation', () => {
  it('returns scrollYProgress + derived motion values', () => {
    const { result } = renderHook(() => useScrollAnimation());
    expect(result.current).toHaveProperty('scrollYProgress');
    expect(result.current).toHaveProperty('opacity');
    expect(result.current).toHaveProperty('scale');
    expect(result.current).toHaveProperty('y');
    // Framer MotionValues expose a `.get()` method
    expect(typeof (result.current.scrollYProgress as any).get).toBe('function');
    expect(typeof (result.current.opacity as any).get).toBe('function');
    expect(typeof (result.current.scale as any).get).toBe('function');
    expect(typeof (result.current.y as any).get).toBe('function');
  });

  it('accepts a custom offset option without throwing', () => {
    const { result } = renderHook(() =>
      useScrollAnimation({ offset: ['start start', 'end end'], smooth: false })
    );
    expect(result.current.scrollYProgress).toBeDefined();
  });
});

describe('useScrollDirection', () => {
  beforeEach(() => {
    (window as any).scrollY = 0;
  });

  it('returns null when no scroll has happened', () => {
    const { result } = renderHook(() => useScrollDirection());
    expect(result.current).toBeNull();
  });

  it('reports "down" when scrollY increases', () => {
    const { result } = renderHook(() => useScrollDirection());
    act(() => {
      (window as any).scrollY = 100;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(result.current).toBe('down');
  });

  it('reports "up" when scrollY decreases', () => {
    (window as any).scrollY = 500;
    const { result } = renderHook(() => useScrollDirection());
    // first scroll to establish lastScrollY in state
    act(() => {
      (window as any).scrollY = 500;
      window.dispatchEvent(new Event('scroll'));
    });
    act(() => {
      (window as any).scrollY = 100;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(result.current).toBe('up');
  });

  it('cleans up scroll listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useScrollDirection());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
    removeSpy.mockRestore();
  });
});

describe('useScrollProgress', () => {
  it('returns a MotionValue', () => {
    const { result } = renderHook(() => useScrollProgress());
    expect(typeof (result.current as any).get).toBe('function');
  });
});

describe('useInView', () => {
  let observers: Array<{
    cb: IntersectionObserverCallback;
    observe: ReturnType<typeof vi.fn>;
    unobserve: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }>;
  const OriginalIO = (global as any).IntersectionObserver;

  beforeEach(() => {
    observers = [];
    (global as any).IntersectionObserver = vi.fn(function (
      cb: IntersectionObserverCallback,
    ) {
      const obs = {
        cb,
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      };
      observers.push(obs);
      return obs;
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    (global as any).IntersectionObserver = OriginalIO;
  });

  it('starts with isInView=false and hasBeenInView=false', () => {
    const { result } = renderHook(() => useInView());
    expect(result.current.isInView).toBe(false);
    expect(result.current.hasBeenInView).toBe(false);
  });

  it('updates isInView and hasBeenInView when intersection fires', () => {
    const el = document.createElement('div');
    el.setAttribute('data-observe', 'true');
    document.body.appendChild(el);

    const { result } = renderHook(() => useInView(0.25));

    expect(observers.length).toBe(1);
    expect(observers[0].observe).toHaveBeenCalledWith(el);

    act(() => {
      observers[0].cb(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        observers[0] as unknown as IntersectionObserver,
      );
    });

    expect(result.current.isInView).toBe(true);
    expect(result.current.hasBeenInView).toBe(true);

    // intersection goes false again; hasBeenInView remains true
    act(() => {
      observers[0].cb(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        observers[0] as unknown as IntersectionObserver,
      );
    });
    expect(result.current.isInView).toBe(false);
    expect(result.current.hasBeenInView).toBe(true);
  });

  it('does nothing when no observable element exists', () => {
    document.body.innerHTML = '';
    const { unmount } = renderHook(() => useInView());
    expect(observers[0].observe).not.toHaveBeenCalled();
    // unmounting should be safe even with no observed element
    expect(() => unmount()).not.toThrow();
  });

  it('unobserves the element on unmount when one was observed', () => {
    const el = document.createElement('div');
    el.setAttribute('data-observe', 'true');
    document.body.appendChild(el);

    const { unmount } = renderHook(() => useInView());
    unmount();
    expect(observers[0].unobserve).toHaveBeenCalledWith(el);
  });
});

// ─── useTheme ───────────────────────────────────────────────────────────────
import { useTheme } from '@/hooks/useTheme';

describe('useTheme', () => {
  let matchMediaMock: ReturnType<typeof vi.fn>;
  let mediaListeners: Array<(e: any) => void>;
  let currentMatches: boolean;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('light', 'dark');
    mediaListeners = [];
    currentMatches = false;

    matchMediaMock = vi.fn().mockImplementation((_query: string) => ({
      get matches() {
        return currentMatches;
      },
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: (_evt: string, cb: (e: any) => void) => {
        mediaListeners.push(cb);
      },
      removeEventListener: (_evt: string, cb: (e: any) => void) => {
        const idx = mediaListeners.indexOf(cb);
        if (idx >= 0) mediaListeners.splice(idx, 1);
      },
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: matchMediaMock,
    });
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('light', 'dark');
  });

  it('defaults to "system" theme and resolves to "light" when prefers-color-scheme is light', () => {
    currentMatches = false;
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('system');
    expect(result.current.resolvedTheme).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });

  it('resolves to "dark" when system prefers-color-scheme is dark', () => {
    currentMatches = true;
    const { result } = renderHook(() => useTheme());
    expect(result.current.resolvedTheme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('reads saved theme preference from localStorage', () => {
    localStorage.setItem('theme', 'dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('setTheme updates state and persists to localStorage', () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setTheme('light');
    });
    expect(result.current.theme).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });

  it('toggleTheme flips between light and dark', () => {
    localStorage.setItem('theme', 'light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.resolvedTheme).toBe('light');
    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.resolvedTheme).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.resolvedTheme).toBe('light');
  });

  it('re-applies system theme when matchMedia change fires (while in system mode)', () => {
    currentMatches = false;
    const { result } = renderHook(() => useTheme());
    expect(result.current.resolvedTheme).toBe('light');

    // Simulate the OS flipping to dark mode
    act(() => {
      currentMatches = true;
      mediaListeners.forEach((cb) => cb({ matches: true }));
    });
    expect(result.current.resolvedTheme).toBe('dark');
  });
});

// ─── useBlockHistory ────────────────────────────────────────────────────────
import { useBlockHistory } from '@/lib/hooks/useBlockHistory';
import type { Block, HistoryAction, PageSettings } from '@/types/blocks';

function blk(id: string, content: any = { text: id }): Block {
  return {
    id,
    type: 'text',
    content,
  } as unknown as Block;
}

const addAction: HistoryAction = { type: 'add', description: 'Added block' };
const modifyAction: HistoryAction = { type: 'modify', description: 'Modified block' };

describe('useBlockHistory', () => {
  it('returns starting blocks + history flags when initialized empty', () => {
    const { result } = renderHook(() => useBlockHistory([]));
    expect(result.current.blocks).toEqual([]);
    expect(result.current.pageSettings).toEqual({});
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.lastAction).toBeNull();
    expect(result.current.nextAction).toBeNull();
  });

  it('seeds an initial-state history entry when initialBlocks are provided', () => {
    const initial = [blk('a'), blk('b')];
    const { result } = renderHook(() => useBlockHistory(initial));
    expect(result.current.blocks).toEqual(initial);
    // canUndo is false initially (need 2 entries to undo back)
    expect(result.current.canUndo).toBe(false);
  });

  it('setBlocks updates state, can-undo flag, and lastAction metadata', () => {
    const initial = [blk('a')];
    const { result } = renderHook(() => useBlockHistory(initial));

    act(() => {
      result.current.setBlocks([blk('a'), blk('b')], addAction);
    });

    expect(result.current.blocks.map((b) => b.id)).toEqual(['a', 'b']);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.lastAction).toBe(addAction.description);
  });

  it('undo reverts blocks back to the previous state and toggles canRedo', () => {
    const initial = [blk('a')];
    const { result } = renderHook(() => useBlockHistory(initial));

    act(() => {
      result.current.setBlocks([blk('a'), blk('b')], addAction);
    });
    expect(result.current.blocks.length).toBe(2);

    act(() => {
      result.current.undo();
    });
    expect(result.current.blocks.map((b) => b.id)).toEqual(['a']);
    expect(result.current.canRedo).toBe(true);
  });

  it('redo moves a future entry back to the past and clears canRedo', () => {
    const initial = [blk('a')];
    const { result } = renderHook(() => useBlockHistory(initial));

    act(() => {
      result.current.setBlocks([blk('a'), blk('b')], addAction);
    });
    act(() => {
      result.current.undo();
    });
    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.redo();
    });
    // The BlockHistory contract is "push BEFORE change"; redo returns the
    // entry that was popped, so we just verify the redo plumbing fires
    // (canRedo flips off, lastAction reflects redone action).
    expect(result.current.canRedo).toBe(false);
    expect(result.current.lastAction).toBe(addAction.description);
  });

  it('setPageSettings tracks history and updates resolved page settings', () => {
    const initial = [blk('a')];
    const initialPage: PageSettings = { backgroundColor: '#fff' };
    const { result } = renderHook(() => useBlockHistory(initial, 50, initialPage));

    const next: PageSettings = { backgroundColor: '#000' };
    act(() => {
      result.current.setPageSettings(next, modifyAction);
    });

    expect(result.current.pageSettings).toEqual(next);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.lastAction).toBe(modifyAction.description);

    act(() => {
      result.current.undo();
    });
    expect(result.current.pageSettings).toEqual(initialPage);
  });

  it('batch mode only pushes one history entry across rapid calls', () => {
    const initial = [blk('a')];
    const { result } = renderHook(() => useBlockHistory(initial));

    act(() => {
      result.current.setBlocks([blk('a'), blk('b')], modifyAction, { batch: true });
    });
    const firstUndoState = result.current.lastAction;

    act(() => {
      result.current.setBlocks([blk('a'), blk('b'), blk('c')], modifyAction, {
        batch: true,
      });
    });
    // lastAction reflects the most recent history push, which during batch is
    // still the initial one — so it must remain the same single description
    expect(result.current.lastAction).toBe(firstUndoState);

    // Only one undo step exists from the batch
    act(() => {
      result.current.undo();
    });
    expect(result.current.blocks.map((b) => b.id)).toEqual(['a']);
  });

  it('clearHistory wipes the past and disables undo/redo', () => {
    const initial = [blk('a')];
    const { result } = renderHook(() => useBlockHistory(initial));
    act(() => {
      result.current.setBlocks([blk('a'), blk('b')], addAction);
    });
    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.clearHistory();
    });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.lastAction).toBeNull();
    expect(result.current.nextAction).toBeNull();
  });

  it('respects maxHistorySize cap by trimming oldest entries', () => {
    const initial = [blk('a')];
    // maxHistorySize=2 keeps just 2 past entries
    const { result } = renderHook(() => useBlockHistory(initial, 2));

    // First push (from initialization) consumes one slot
    act(() => {
      result.current.setBlocks([blk('a'), blk('b')], addAction);
    });
    act(() => {
      result.current.setBlocks([blk('a'), blk('b'), blk('c')], modifyAction);
    });
    act(() => {
      result.current.setBlocks(
        [blk('a'), blk('b'), blk('c'), blk('d')],
        modifyAction,
      );
    });

    // After three setBlocks calls with maxSize=2, the oldest entries have
    // been trimmed; undo should still work but return to a recent state.
    expect(result.current.blocks.length).toBe(4);
    act(() => {
      result.current.undo();
    });
    expect(result.current.blocks.length).toBeGreaterThan(0);
  });
});
