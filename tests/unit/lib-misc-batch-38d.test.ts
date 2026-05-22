// @vitest-environment jsdom
/**
 * Unit tests for 4 React hook files (batch 38d):
 *   - lib/hooks/useContentTypes.ts        — fetch content types, de-dupe by slug
 *   - lib/hooks/useKeyboardShortcuts.ts   — Mousetrap bind/unbind shortcuts
 *   - lib/hooks/useSettingsPanelSync.ts   — BroadcastChannel sync between panels
 *   - lib/hooks/useBlockDragDrop.ts       — @dnd-kit drag state management
 *
 * Strategy:
 *   - useContentTypes: stub global.fetch, assert dedupe + active-filter + sort
 *   - useKeyboardShortcuts: spy on Mousetrap.bind/unbind, simulate handler call
 *   - useSettingsPanelSync: rely on jsdom's BroadcastChannel polyfill — if
 *     absent, shim it; verify onMessage routing + sendMessage roundtrip.
 *   - useBlockDragDrop: drive state transitions through handlers directly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ─── useContentTypes ─────────────────────────────────────────────────────────
import { useContentTypes } from '@/lib/hooks/useContentTypes';

describe('useContentTypes', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockFetchOnce(data: any, ok = true) {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok,
      json: async () => data,
    }) as any;
  }

  it('returns empty array initially when no siteId provided', () => {
    global.fetch = vi.fn() as any;
    const { result } = renderHook(() => useContentTypes(undefined));
    expect(result.current).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetches and returns active content types sorted by name', async () => {
    mockFetchOnce({
      success: true,
      data: [
        { id: 1, name: 'Zebra', slug: 'zebra', icon: null, description: null, websiteId: null, active: true },
        { id: 2, name: 'Apple', slug: 'apple', icon: null, description: null, websiteId: null, active: true },
        { id: 3, name: 'Mango', slug: 'mango', icon: null, description: null, websiteId: null, active: true },
      ],
    });
    const { result } = renderHook(() => useContentTypes(42));

    await vi.waitFor(() => {
      expect(result.current.length).toBe(3);
    });
    expect(result.current.map((t) => t.name)).toEqual(['Apple', 'Mango', 'Zebra']);
  });

  it('filters out inactive content types', async () => {
    mockFetchOnce({
      success: true,
      data: [
        { id: 1, name: 'Active', slug: 'a', icon: null, description: null, websiteId: null, active: true },
        { id: 2, name: 'Inactive', slug: 'b', icon: null, description: null, websiteId: null, active: false },
      ],
    });
    const { result } = renderHook(() => useContentTypes('site-1'));
    await vi.waitFor(() => {
      expect(result.current.length).toBe(1);
    });
    expect(result.current[0].name).toBe('Active');
  });

  it('dedupes by slug, preferring site-scoped over global built-in', async () => {
    // Built-in "page" (websiteId null) + site-scoped fork (websiteId set).
    // The site-scoped one should win.
    mockFetchOnce({
      success: true,
      data: [
        { id: 2, name: 'Page', slug: 'page', icon: null, description: null, websiteId: null, active: true },
        { id: 99, name: 'Page', slug: 'page', icon: null, description: null, websiteId: 7, active: true },
      ],
    });
    const { result } = renderHook(() => useContentTypes(7));
    await vi.waitFor(() => {
      expect(result.current.length).toBe(1);
    });
    expect(result.current[0].websiteId).toBe(7);
    expect(result.current[0].id).toBe(99);
  });

  it('keeps existing site-scoped over later global (dedupe direction)', async () => {
    mockFetchOnce({
      success: true,
      data: [
        { id: 99, name: 'Page', slug: 'page', icon: null, description: null, websiteId: 7, active: true },
        { id: 2, name: 'Page', slug: 'page', icon: null, description: null, websiteId: null, active: true },
      ],
    });
    const { result } = renderHook(() => useContentTypes(7));
    await vi.waitFor(() => {
      expect(result.current.length).toBe(1);
    });
    expect(result.current[0].id).toBe(99);
  });

  it('handles non-success responses gracefully (stays empty)', async () => {
    mockFetchOnce({ success: false });
    const { result } = renderHook(() => useContentTypes(1));
    // Give the microtask queue a tick to settle
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current).toEqual([]);
  });

  it('handles non-array data gracefully', async () => {
    mockFetchOnce({ success: true, data: 'not-an-array' });
    const { result } = renderHook(() => useContentTypes(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current).toEqual([]);
  });

  it('swallows fetch rejection without throwing', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('network')) as any;
    const { result } = renderHook(() => useContentTypes(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current).toEqual([]);
  });

  it('refetches when siteId changes', async () => {
    const calls: string[] = [];
    global.fetch = vi.fn().mockImplementation((url: string) => {
      calls.push(url);
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      });
    }) as any;

    const { rerender } = renderHook(({ id }: { id: number }) => useContentTypes(id), {
      initialProps: { id: 1 },
    });
    await new Promise((r) => setTimeout(r, 5));
    rerender({ id: 2 });
    await new Promise((r) => setTimeout(r, 5));

    expect(calls.length).toBe(2);
    expect(calls[0]).toContain('/content-types');
    expect(calls[0]).toContain('/1/');
    expect(calls[1]).toContain('/2/');
  });
});

// ─── useKeyboardShortcuts ────────────────────────────────────────────────────
const mtState = vi.hoisted(() => ({
  bindSpy: (..._args: any[]) => {},
  unbindSpy: (..._args: any[]) => {},
  boundHandlers: new Map<string, (e: any) => any>(),
}));

vi.mock('mousetrap', () => ({
  default: {
    bind: (keys: string, handler: (e: any) => any) => {
      mtState.bindSpy(keys);
      mtState.boundHandlers.set(keys, handler);
    },
    unbind: (keys: string) => {
      mtState.unbindSpy(keys);
      mtState.boundHandlers.delete(keys);
    },
  },
}));

describe('useKeyboardShortcuts', () => {
  let bindSpy: ReturnType<typeof vi.fn>;
  let unbindSpy: ReturnType<typeof vi.fn>;
  const boundHandlers = mtState.boundHandlers;

  beforeEach(() => {
    bindSpy = vi.fn();
    unbindSpy = vi.fn();
    mtState.bindSpy = bindSpy;
    mtState.unbindSpy = unbindSpy;
    boundHandlers.clear();
  });

  it('binds all shortcuts on mount', async () => {
    const { useKeyboardShortcuts } = await import('@/lib/hooks/useKeyboardShortcuts');
    const undo = vi.fn();
    const redo = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        { keys: 'mod+z', description: 'Undo', handler: undo },
        { keys: 'mod+shift+z', description: 'Redo', handler: redo },
      ])
    );
    expect(bindSpy).toHaveBeenCalledWith('mod+z');
    expect(bindSpy).toHaveBeenCalledWith('mod+shift+z');
  });

  it('unbinds shortcuts on unmount', async () => {
    const { useKeyboardShortcuts } = await import('@/lib/hooks/useKeyboardShortcuts');
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts([{ keys: 'esc', description: 'Close', handler: () => {} }])
    );
    unmount();
    expect(unbindSpy).toHaveBeenCalledWith('esc');
  });

  it('invokes preventDefault by default when shortcut fires', async () => {
    const { useKeyboardShortcuts } = await import('@/lib/hooks/useKeyboardShortcuts');
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ keys: 'mod+s', description: 'Save', handler }])
    );
    const bound = boundHandlers.get('mod+s')!;
    const evt = { preventDefault: vi.fn() };
    bound(evt);
    expect(evt.preventDefault).toHaveBeenCalled();
    expect(handler).toHaveBeenCalled();
  });

  it('skips preventDefault when preventDefault: false', async () => {
    const { useKeyboardShortcuts } = await import('@/lib/hooks/useKeyboardShortcuts');
    const handler = vi.fn(() => true);
    renderHook(() =>
      useKeyboardShortcuts([
        { keys: 'mod+k', description: 'Palette', handler, preventDefault: false },
      ])
    );
    const bound = boundHandlers.get('mod+k')!;
    const evt = { preventDefault: vi.fn() };
    const ret = bound(evt);
    expect(evt.preventDefault).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalled();
    expect(ret).toBe(true);
  });

  it('handles missing event object without crashing', async () => {
    const { useKeyboardShortcuts } = await import('@/lib/hooks/useKeyboardShortcuts');
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ keys: 'a', description: 'A', handler, preventDefault: true }])
    );
    const bound = boundHandlers.get('a')!;
    // Mousetrap can call with undefined; guard `if (preventDefault && e)` should skip
    expect(() => bound(undefined as any)).not.toThrow();
    expect(handler).toHaveBeenCalled();
  });
});

// ─── useSettingsPanelSync ────────────────────────────────────────────────────
describe('useSettingsPanelSync', () => {
  // jsdom doesn't ship BroadcastChannel — shim it with a same-process pub/sub.
  type BCInstance = {
    name: string;
    onmessage: ((ev: MessageEvent) => void) | null;
    postMessage: (data: any) => void;
    close: () => void;
  };
  const channelRegistry = new Map<string, Set<BCInstance>>();
  let originalBC: any;

  beforeEach(() => {
    originalBC = (globalThis as any).BroadcastChannel;
    channelRegistry.clear();

    class FakeBC implements BCInstance {
      name: string;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      closed = false;
      constructor(name: string) {
        this.name = name;
        const set = channelRegistry.get(name) ?? new Set();
        set.add(this);
        channelRegistry.set(name, set);
      }
      postMessage(data: any) {
        const set = channelRegistry.get(this.name);
        if (!set) return;
        for (const peer of set) {
          if (peer === this || peer.closed) continue;
          // simulate async dispatch
          queueMicrotask(() => {
            if (peer.onmessage) {
              peer.onmessage({ data } as MessageEvent);
            }
          });
        }
      }
      close() {
        this.closed = true;
        channelRegistry.get(this.name)?.delete(this);
      }
    }
    (globalThis as any).BroadcastChannel = FakeBC;
  });

  afterEach(() => {
    (globalThis as any).BroadcastChannel = originalBC;
  });

  it('initializes a BroadcastChannel and reports isConnected=true', async () => {
    const { useSettingsPanelSync } = await import('@/lib/hooks/useSettingsPanelSync');
    const onMessage = vi.fn();
    const { result } = renderHook(() =>
      useSettingsPanelSync({ isMainWindow: true, onMessage, tabId: 'tab-1' })
    );
    expect(result.current.isConnected).toBe(true);
  });

  it('routes valid messages for the same tabId to onMessage', async () => {
    const { useSettingsPanelSync } = await import('@/lib/hooks/useSettingsPanelSync');
    const onMessage = vi.fn();
    renderHook(() =>
      useSettingsPanelSync({ isMainWindow: true, onMessage, tabId: 'tab-A' })
    );
    // Spawn a peer on the same channel and post a message
    const peer = new (globalThis as any).BroadcastChannel('block-editor-settings-tab-A');
    peer.postMessage({
      type: 'BLOCK_UPDATED',
      payload: { id: 1 },
      tabId: 'tab-A',
      timestamp: Date.now(),
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage.mock.calls[0][0].type).toBe('BLOCK_UPDATED');
  });

  it('ignores messages with mismatched tabId', async () => {
    const { useSettingsPanelSync } = await import('@/lib/hooks/useSettingsPanelSync');
    const onMessage = vi.fn();
    renderHook(() =>
      useSettingsPanelSync({ isMainWindow: true, onMessage, tabId: 'tab-A' })
    );
    const peer = new (globalThis as any).BroadcastChannel('block-editor-settings-tab-A');
    peer.postMessage({
      type: 'BLOCK_UPDATED',
      payload: {},
      tabId: 'tab-B', // different
      timestamp: Date.now(),
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('ignores malformed messages without crashing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { useSettingsPanelSync } = await import('@/lib/hooks/useSettingsPanelSync');
    const onMessage = vi.fn();
    renderHook(() =>
      useSettingsPanelSync({ isMainWindow: true, onMessage, tabId: 'tab-X' })
    );
    const peer = new (globalThis as any).BroadcastChannel('block-editor-settings-tab-X');
    peer.postMessage(null);
    peer.postMessage({ type: 'OK' }); // missing tabId
    peer.postMessage({ tabId: 'tab-X' }); // missing type
    await new Promise((r) => setTimeout(r, 5));
    expect(onMessage).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('sendMessage posts a structured envelope on the channel', async () => {
    const { useSettingsPanelSync } = await import('@/lib/hooks/useSettingsPanelSync');
    const onMessage = vi.fn();
    const { result } = renderHook(() =>
      useSettingsPanelSync({ isMainWindow: true, onMessage, tabId: 'tab-S' })
    );

    // A peer subscriber listens for what we send out
    const received: any[] = [];
    const peer = new (globalThis as any).BroadcastChannel('block-editor-settings-tab-S');
    peer.onmessage = (ev: MessageEvent) => received.push(ev.data);

    act(() => {
      result.current.sendMessage('SELECTION_CHANGED', { blockId: 'b-1' });
    });
    await new Promise((r) => setTimeout(r, 5));

    expect(received.length).toBe(1);
    expect(received[0].type).toBe('SELECTION_CHANGED');
    expect(received[0].payload).toEqual({ blockId: 'b-1' });
    expect(received[0].tabId).toBe('tab-S');
    expect(typeof received[0].timestamp).toBe('number');
  });

  it('sendMessage warns when channel is not initialized', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Force BroadcastChannel constructor to throw so channelRef stays null
    (globalThis as any).BroadcastChannel = class {
      constructor() {
        throw new Error('not supported');
      }
    };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { useSettingsPanelSync } = await import('@/lib/hooks/useSettingsPanelSync');
    const { result } = renderHook(() =>
      useSettingsPanelSync({ isMainWindow: true, onMessage: vi.fn(), tabId: 'broken' })
    );
    expect(result.current.isConnected).toBe(false);
    act(() => {
      result.current.sendMessage('BLOCK_UPDATED', {});
    });
    expect(warnSpy).toHaveBeenCalledWith('BroadcastChannel not initialized');
    warnSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('updates onMessage callback ref across renders', async () => {
    const { useSettingsPanelSync } = await import('@/lib/hooks/useSettingsPanelSync');
    const onMessageA = vi.fn();
    const onMessageB = vi.fn();
    const { rerender } = renderHook(
      ({ cb }: { cb: any }) =>
        useSettingsPanelSync({ isMainWindow: true, onMessage: cb, tabId: 'tab-R' }),
      { initialProps: { cb: onMessageA } }
    );
    rerender({ cb: onMessageB });

    const peer = new (globalThis as any).BroadcastChannel('block-editor-settings-tab-R');
    peer.postMessage({
      type: 'BLOCK_UPDATED',
      payload: {},
      tabId: 'tab-R',
      timestamp: Date.now(),
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(onMessageA).not.toHaveBeenCalled();
    expect(onMessageB).toHaveBeenCalledTimes(1);
  });

  it('closes channel and flips isConnected on unmount', async () => {
    const { useSettingsPanelSync } = await import('@/lib/hooks/useSettingsPanelSync');
    const { result, unmount } = renderHook(() =>
      useSettingsPanelSync({ isMainWindow: true, onMessage: vi.fn(), tabId: 'tab-U' })
    );
    expect(result.current.isConnected).toBe(true);
    unmount();
    // After unmount the channel should be removed from registry
    const set = channelRegistry.get('block-editor-settings-tab-U');
    // Either the set is gone or it no longer contains an open instance
    if (set) {
      for (const inst of set) {
        expect((inst as any).closed).toBe(true);
      }
    }
  });
});

// ─── useBlockDragDrop ────────────────────────────────────────────────────────
import { useBlockDragDrop } from '@/lib/hooks/useBlockDragDrop';

describe('useBlockDragDrop', () => {
  it('initializes with null drag state', () => {
    const { result } = renderHook(() => useBlockDragDrop(vi.fn()));
    expect(result.current.dragState).toEqual({ activeId: null, overId: null });
  });

  it('exposes DnD-kit re-exports', () => {
    const { result } = renderHook(() => useBlockDragDrop(vi.fn()));
    expect(result.current.DndContext).toBeDefined();
    expect(result.current.SortableContext).toBeDefined();
    expect(typeof result.current.arrayMove).toBe('function');
    expect(result.current.sensors).toBeDefined();
    expect(Array.isArray(result.current.sensors)).toBe(true);
  });

  it('handleDragStart sets activeId from event.active.id', () => {
    const { result } = renderHook(() => useBlockDragDrop(vi.fn()));
    act(() => {
      result.current.handleDragStart({ active: { id: 'block-1' } } as any);
    });
    expect(result.current.dragState.activeId).toBe('block-1');
    expect(result.current.dragState.overId).toBeNull();
  });

  it('handleDragOver updates overId while preserving activeId', () => {
    const { result } = renderHook(() => useBlockDragDrop(vi.fn()));
    act(() => {
      result.current.handleDragStart({ active: { id: 'block-1' } } as any);
    });
    act(() => {
      result.current.handleDragOver({ over: { id: 'block-2' } } as any);
    });
    expect(result.current.dragState.activeId).toBe('block-1');
    expect(result.current.dragState.overId).toBe('block-2');
  });

  it('handleDragOver handles null over target', () => {
    const { result } = renderHook(() => useBlockDragDrop(vi.fn()));
    act(() => {
      result.current.handleDragStart({ active: { id: 'block-1' } } as any);
    });
    act(() => {
      result.current.handleDragOver({ over: null } as any);
    });
    // event.over?.id is `undefined` when over is null; hook stores it as-is
    expect(result.current.dragState.overId).toBeFalsy();
  });

  it('handleDragEnd calls onReorder when active and over differ', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useBlockDragDrop(onReorder));
    act(() => {
      result.current.handleDragEnd({
        active: { id: 'a' },
        over: { id: 'b' },
      } as any);
    });
    expect(onReorder).toHaveBeenCalledWith('a', 'b');
    expect(result.current.dragState).toEqual({ activeId: null, overId: null });
  });

  it('handleDragEnd does NOT call onReorder when over is null', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useBlockDragDrop(onReorder));
    act(() => {
      result.current.handleDragEnd({
        active: { id: 'a' },
        over: null,
      } as any);
    });
    expect(onReorder).not.toHaveBeenCalled();
    expect(result.current.dragState).toEqual({ activeId: null, overId: null });
  });

  it('handleDragEnd does NOT call onReorder when active.id === over.id', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useBlockDragDrop(onReorder));
    act(() => {
      result.current.handleDragEnd({
        active: { id: 'same' },
        over: { id: 'same' },
      } as any);
    });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('handleDragCancel resets state to null/null', () => {
    const { result } = renderHook(() => useBlockDragDrop(vi.fn()));
    act(() => {
      result.current.handleDragStart({ active: { id: 'x' } } as any);
    });
    act(() => {
      result.current.handleDragOver({ over: { id: 'y' } } as any);
    });
    expect(result.current.dragState.activeId).toBe('x');
    act(() => {
      result.current.handleDragCancel();
    });
    expect(result.current.dragState).toEqual({ activeId: null, overId: null });
  });

  it('arrayMove utility re-export reorders items correctly', () => {
    const { result } = renderHook(() => useBlockDragDrop(vi.fn()));
    const reordered = result.current.arrayMove(['a', 'b', 'c', 'd'], 0, 2);
    expect(reordered).toEqual(['b', 'c', 'a', 'd']);
  });
});
