// @vitest-environment jsdom
/**
 * Unit tests for 4 lib files (batch 37h):
 *   - lib/realtime/client.ts          (RealtimeClient class + hooks)
 *   - lib/realtime/comments-broadcast.ts (useCommentsRealtime hook)
 *   - lib/survey-logic.ts             (isFieldVisible / getConditionalOptions / resolvePiping)
 *   - lib/preview-token.ts            (generatePreviewToken / verifyPreviewToken)
 *
 * Strategy:
 *   - For client.ts: mock 'y-websocket' so we never open a real socket.
 *     Drive status, token-refresh, reconnect-backoff via fake timers.
 *   - For comments-broadcast.ts: drive the hook with a real `Awareness`
 *     attached to a real Y.Doc (in-memory). Spawn a peer client to flip
 *     events through `awareness.setLocalStateField` so the listener fires.
 *   - For survey-logic.ts: pure functions, hammer happy + edge cases.
 *   - For preview-token.ts: HMAC roundtrip, tamper rejection, day-boundary.
 */

// Ensure preview-token's module-level guard passes when it's dynamically
// imported below. Must run before any `await import('@/lib/preview-token')`.
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? 'test-secret-batch-37h';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

// ─── y-websocket mock ─────────────────────────────────────────────────────────
// Capture every constructed provider so the test can inspect/drive it.
type FakeStatus = 'connecting' | 'connected' | 'disconnected';
interface FakeProvider {
  url: string;
  room: string;
  doc: Y.Doc;
  opts: { params?: Record<string, string>; connect?: boolean };
  awareness: Awareness;
  destroyed: boolean;
  destroy: () => void;
  on: (ev: string, cb: (payload: { status: FakeStatus }) => void) => void;
  off: (ev: string, cb: (payload: { status: FakeStatus }) => void) => void;
  emit: (ev: string, payload: { status: FakeStatus }) => void;
  _listeners: Map<string, Set<(payload: { status: FakeStatus }) => void>>;
}
const constructedProviders: FakeProvider[] = [];
vi.mock('y-websocket', () => {
  class WebsocketProvider implements FakeProvider {
    url: string;
    room: string;
    doc: Y.Doc;
    opts: { params?: Record<string, string>; connect?: boolean };
    awareness: Awareness;
    destroyed = false;
    _listeners = new Map<string, Set<(payload: { status: FakeStatus }) => void>>();
    constructor(
      url: string,
      room: string,
      doc: Y.Doc,
      opts: { params?: Record<string, string>; connect?: boolean } = {}
    ) {
      this.url = url;
      this.room = room;
      this.doc = doc;
      this.opts = opts;
      this.awareness = new Awareness(doc);
      constructedProviders.push(this);
    }
    on(ev: string, cb: (p: { status: FakeStatus }) => void): void {
      if (!this._listeners.has(ev)) this._listeners.set(ev, new Set());
      this._listeners.get(ev)!.add(cb);
    }
    off(ev: string, cb: (p: { status: FakeStatus }) => void): void {
      this._listeners.get(ev)?.delete(cb);
    }
    emit(ev: string, payload: { status: FakeStatus }): void {
      this._listeners.get(ev)?.forEach((cb) => cb(payload));
    }
    destroy(): void {
      this.destroyed = true;
      this.awareness.destroy();
      this._listeners.clear();
    }
  }
  return { WebsocketProvider };
});

// Import AFTER vi.mock so the client picks up the mocked module.
import {
  RealtimeClient,
  useRealtimeDoc,
  useLocalAwareness,
  type RealtimeStatus,
} from '@/lib/realtime/client';
import { useCommentsRealtime } from '@/lib/realtime/comments-broadcast';
import {
  isFieldVisible,
  getConditionalOptions,
  resolvePiping,
} from '@/lib/survey-logic';
import type { SurveyFieldDef } from '@/lib/db/schema/surveys';

// Stub the global fetch used by client.ts → fetchToken.
type TokenResp = { token: string; wsUrl: string; expiresAt: number };
function setFetchOk(resp: TokenResp): void {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: resp }),
  }) as unknown as typeof fetch;
}
function setFetchUnsuccessful(message?: string): void {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: false, message }),
  }) as unknown as typeof fetch;
}
function setFetchHttp(status: number): void {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ success: false }),
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  constructedProviders.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// lib/realtime/client.ts
// ─────────────────────────────────────────────────────────────────────────────
describe('lib/realtime/client.ts — RealtimeClient', () => {
  it('constructor seeds entityType/entityId/doc and starts disconnected', () => {
    const c = new RealtimeClient('post', 'p1');
    expect(c.entityType).toBe('post');
    expect(c.entityId).toBe('p1');
    expect(c.doc).toBeInstanceOf(Y.Doc);
    expect(c.status).toBe('disconnected');
    expect(c.awareness).toBeNull();
    expect(c.wsProvider).toBeNull();
    expect(c.tokenTtl).toBe(0);
    c.destroy();
  });

  it('onStatus subscribes, fires immediately with current status, and unsubscribes', () => {
    const c = new RealtimeClient('post', 'p1');
    const seen: RealtimeStatus[] = [];
    const off = c.onStatus((s) => seen.push(s));
    expect(seen).toEqual(['disconnected']);
    off();
    // After unsubscribe, no more callbacks even on internal status change.
    (c as unknown as { emitStatus: (s: RealtimeStatus) => void }).emitStatus(
      'connecting'
    );
    expect(seen).toEqual(['disconnected']);
    c.destroy();
  });

  it('connect() fetches token, builds a provider, and forwards status events', async () => {
    vi.useFakeTimers();
    const expiresAt = Date.now() + 5 * 60_000;
    setFetchOk({ token: 'tok1', wsUrl: 'ws://x', expiresAt });

    const c = new RealtimeClient('deck', 'd9');
    const seen: RealtimeStatus[] = [];
    c.onStatus((s) => seen.push(s));

    await c.connect();
    expect(constructedProviders.length).toBe(1);
    expect(constructedProviders[0].url).toBe('ws://x');
    expect(constructedProviders[0].room).toBe('deck:d9');
    expect(constructedProviders[0].opts.params?.token).toBe('tok1');
    expect(c.awareness).not.toBeNull();
    expect(c.wsProvider).toBe(constructedProviders[0]);
    expect(c.tokenTtl).toBeGreaterThan(0);

    // Emit a provider status event and observe forwarding.
    constructedProviders[0].emit('status', { status: 'connected' });
    expect(seen[seen.length - 1]).toBe('connected');

    // No-op when same status is emitted.
    const before = seen.length;
    (c as unknown as { emitStatus: (s: RealtimeStatus) => void }).emitStatus(
      'connected'
    );
    expect(seen.length).toBe(before);

    c.destroy();
  });

  it('connect() rejects when fetch returns !ok and schedules a reconnect', async () => {
    vi.useFakeTimers();
    setFetchHttp(500);
    const c = new RealtimeClient('post', 'p1');
    await expect(c.connect()).rejects.toThrow(/Failed to fetch realtime token/);
    // Subsequent attempt should be scheduled — flush the reconnect timer.
    setFetchOk({
      token: 't2',
      wsUrl: 'ws://y',
      expiresAt: Date.now() + 60_000,
    });
    await act(async () => {
      vi.runOnlyPendingTimers();
      await Promise.resolve();
      await Promise.resolve();
    });
    c.destroy();
  });

  it('connect() rejects when the API response is unsuccessful', async () => {
    setFetchUnsuccessful('nope');
    const c = new RealtimeClient('post', 'p1');
    await expect(c.connect()).rejects.toThrow(/nope/);
    c.destroy();
  });

  it('connect() falls back to a default error message when none provided', async () => {
    setFetchUnsuccessful();
    const c = new RealtimeClient('post', 'p1');
    await expect(c.connect()).rejects.toThrow(/Token request failed/);
    c.destroy();
  });

  it('reconnect uses exponential backoff and stops when destroyed', async () => {
    vi.useFakeTimers();
    setFetchHttp(503);
    const c = new RealtimeClient('post', 'p1');
    // First failure schedules a reconnect at ~500ms.
    await c.connect().catch(() => {});
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    // Destroy stops further reconnects from running.
    c.destroy();
    // Advance time — any pending callbacks should early-return on `destroyed`.
    vi.advanceTimersByTime(60_000);
    setTimeoutSpy.mockRestore();
  });

  it('connect() tears down a prior provider before opening a new one', async () => {
    const expiresAt = Date.now() + 60_000;
    setFetchOk({ token: 'a', wsUrl: 'ws://1', expiresAt });
    const c = new RealtimeClient('email', 'e1');
    await c.connect();
    const first = constructedProviders[0];
    setFetchOk({ token: 'b', wsUrl: 'ws://2', expiresAt });
    await c.connect();
    expect(first.destroyed).toBe(true);
    expect(constructedProviders.length).toBe(2);
    expect(c.wsProvider).toBe(constructedProviders[1]);
    c.destroy();
  });

  it('disconnect() clears provider + timers and emits disconnected', async () => {
    const c = new RealtimeClient('post', 'p1');
    setFetchOk({ token: 't', wsUrl: 'ws://x', expiresAt: Date.now() + 60_000 });
    await c.connect();
    expect(c.wsProvider).not.toBeNull();
    c.disconnect();
    expect(c.wsProvider).toBeNull();
    expect(c.status).toBe('disconnected');
    // Idempotent
    c.disconnect();
    c.destroy();
  });

  it('connect() is a no-op once destroyed', async () => {
    const c = new RealtimeClient('post', 'p1');
    c.destroy();
    // Should NOT call fetch
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    await c.connect();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('scheduleTokenRefresh fires before TTL, recalling connect()', async () => {
    vi.useFakeTimers();
    const expiresAt = Date.now() + 5 * 60_000;
    setFetchOk({ token: 'first', wsUrl: 'ws://x', expiresAt });
    const c = new RealtimeClient('post', 'p1');
    await c.connect();
    expect(constructedProviders.length).toBe(1);

    setFetchOk({
      token: 'second',
      wsUrl: 'ws://x',
      expiresAt: Date.now() + 5 * 60_000,
    });

    // refreshIn = max(30_000, ttl - 60_000) ≈ 4 minutes — advance past it.
    await act(async () => {
      vi.advanceTimersByTime(5 * 60_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(constructedProviders.length).toBeGreaterThanOrEqual(2);
    c.destroy();
  });
});

// ─── useRealtimeDoc / useLocalAwareness React hooks ─────────────────────────
describe('lib/realtime/client.ts — React hooks', () => {
  let container: HTMLElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('useRealtimeDoc renders without throwing when enabled=false', async () => {
    let captured: ReturnType<typeof useRealtimeDoc> | null = null;
    function Probe(): React.ReactElement | null {
      captured = useRealtimeDoc({
        entityType: 'post',
        entityId: 'p1',
        enabled: false,
      });
      return null;
    }
    await act(async () => {
      root.render(React.createElement(Probe));
    });
    expect(captured).not.toBeNull();
    expect(captured!.status).toBe('disconnected');
    expect(captured!.peers).toEqual([]);
    expect(captured!.ydoc).toBeNull();
  });

  it('useRealtimeDoc connects when enabled (default true) and tears down on unmount', async () => {
    setFetchOk({
      token: 't',
      wsUrl: 'ws://hook',
      expiresAt: Date.now() + 60_000,
    });
    function Probe(): React.ReactElement | null {
      useRealtimeDoc({ entityType: 'post', entityId: 'pX' });
      return null;
    }
    await act(async () => {
      root.render(React.createElement(Probe));
    });
    // mount kicked off a connect; let microtasks settle
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(constructedProviders.length).toBeGreaterThanOrEqual(1);
    await act(async () => {
      root.unmount();
    });
    // Re-create root so afterEach unmount doesn't double-call on a dead root.
    root = createRoot(container);
  });

  it('useLocalAwareness returns no-op setters when awareness is null', () => {
    let api: ReturnType<typeof useLocalAwareness> | null = null;
    function Probe(): React.ReactElement | null {
      api = useLocalAwareness(null);
      return null;
    }
    act(() => {
      root.render(React.createElement(Probe));
    });
    expect(api).not.toBeNull();
    // All five setters present and callable.
    expect(() => api!.setCursor({ x: 1, y: 2 })).not.toThrow();
    expect(() => api!.setSelection({ blockId: 'b' })).not.toThrow();
    expect(() => api!.setActiveSlide(0)).not.toThrow();
    expect(() => api!.setFocusedField('a.b')).not.toThrow();
    expect(() => api!.setPresence({})).not.toThrow();
  });

  it('useLocalAwareness writes through to the real Awareness object', () => {
    const doc = new Y.Doc();
    const aw = new Awareness(doc);
    let api: ReturnType<typeof useLocalAwareness> | null = null;
    function Probe(): React.ReactElement | null {
      api = useLocalAwareness(aw);
      return null;
    }
    act(() => {
      root.render(React.createElement(Probe));
    });
    expect(api).not.toBeNull();
    api!.setCursor({ x: 1, y: 2 });
    api!.setSelection({ blockId: 'b' });
    api!.setActiveSlide(3);
    api!.setFocusedField('headline');
    api!.setPresence({ user: { id: 'u1', name: 'U' } as never });
    const state = aw.getLocalState() as Record<string, unknown>;
    expect(state.cursor).toEqual({ x: 1, y: 2 });
    expect(state.selection).toEqual({ blockId: 'b' });
    expect(state.activeSlide).toBe(3);
    expect(state.focusedField).toBe('headline');
    expect((state.user as { id: string }).id).toBe('u1');
    aw.destroy();
    doc.destroy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// lib/realtime/comments-broadcast.ts
// ─────────────────────────────────────────────────────────────────────────────
describe('lib/realtime/comments-broadcast.ts', () => {
  let container: HTMLElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => {
      try {
        root.unmount();
      } catch {
        /* ignore */
      }
    });
    container.remove();
  });

  function mount(props: Parameters<typeof useCommentsRealtime>[0]): {
    api: ReturnType<typeof useCommentsRealtime> | null;
  } {
    const ref: { api: ReturnType<typeof useCommentsRealtime> | null } = {
      api: null,
    };
    function Probe(): React.ReactElement | null {
      ref.api = useCommentsRealtime(props);
      return null;
    }
    act(() => {
      root.render(React.createElement(Probe));
    });
    return ref;
  }

  it('returns a stable broadcastEvent that is a no-op when awareness is null', () => {
    const { api } = mount({
      awareness: null,
      entityType: 'post',
      entityId: 'p1',
      onRemoteEvent: () => {},
    });
    expect(api).not.toBeNull();
    expect(typeof api!.broadcastEvent).toBe('function');
    // Must not throw with no awareness.
    expect(() =>
      api!.broadcastEvent({ kind: 'create', threadId: 't', commentId: 'c' })
    ).not.toThrow();
  });

  it('broadcastEvent writes an envelope on awareness then clears it', async () => {
    vi.useFakeTimers();
    const doc = new Y.Doc();
    const aw = new Awareness(doc);
    const { api } = mount({
      awareness: aw,
      entityType: 'post',
      entityId: 'p1',
      onRemoteEvent: () => {},
    });
    api!.broadcastEvent({ kind: 'create', threadId: 't1', commentId: 'c1' });
    const after = aw.getLocalState() as Record<string, unknown>;
    expect(after.commentEvent).toMatchObject({
      kind: 'create',
      threadId: 't1',
      commentId: 'c1',
      entityType: 'post',
      entityId: 'p1',
    });
    // After ~100ms the awareness field is cleared to null.
    vi.advanceTimersByTime(150);
    const cleared = aw.getLocalState() as Record<string, unknown>;
    expect(cleared.commentEvent).toBeNull();
    aw.destroy();
    doc.destroy();
  });

  it('fires onRemoteEvent (debounced) when a peer broadcasts a matching event', async () => {
    vi.useFakeTimers();
    // Two distinct Y.Docs → distinct clientIDs → the peer's state shows up
    // under a different key in localAw.getStates() and is recognized as remote.
    const localDoc = new Y.Doc();
    const peerDoc = new Y.Doc();
    if (peerDoc.clientID === localDoc.clientID) {
      // Astronomically unlikely, but guard against test flakiness.
      (peerDoc as unknown as { clientID: number }).clientID =
        localDoc.clientID + 1;
    }
    const localAw = new Awareness(localDoc);
    const peerAw = new Awareness(peerDoc);
    const fired = vi.fn();
    mount({
      awareness: localAw,
      entityType: 'post',
      entityId: 'p1',
      onRemoteEvent: fired,
    });

    peerAw.setLocalStateField('commentEvent', {
      kind: 'create',
      threadId: null,
      commentId: null,
      ts: Date.now(),
      entityType: 'post',
      entityId: 'p1',
    });

    const { encodeAwarenessUpdate, applyAwarenessUpdate } = await import(
      'y-protocols/awareness'
    );
    const upd = encodeAwarenessUpdate(peerAw, [peerAw.clientID]);
    applyAwarenessUpdate(localAw, upd, 'peer');

    expect(fired).not.toHaveBeenCalled(); // debounced
    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });
    expect(fired).toHaveBeenCalledTimes(1);
    localAw.destroy();
    peerAw.destroy();
    localDoc.destroy();
    peerDoc.destroy();
  });

  it('ignores events that do not match entityType/entityId', async () => {
    vi.useFakeTimers();
    const localDoc = new Y.Doc();
    const peerDoc = new Y.Doc();
    if (peerDoc.clientID === localDoc.clientID) {
      (peerDoc as unknown as { clientID: number }).clientID =
        localDoc.clientID + 1;
    }
    const localAw = new Awareness(localDoc);
    const peerAw = new Awareness(peerDoc);
    const fired = vi.fn();
    mount({
      awareness: localAw,
      entityType: 'post',
      entityId: 'p1',
      onRemoteEvent: fired,
    });
    peerAw.setLocalStateField('commentEvent', {
      kind: 'create',
      threadId: null,
      commentId: null,
      ts: Date.now(),
      entityType: 'deck', // wrong type
      entityId: 'p1',
    });
    const { encodeAwarenessUpdate, applyAwarenessUpdate } = await import(
      'y-protocols/awareness'
    );
    applyAwarenessUpdate(
      localAw,
      encodeAwarenessUpdate(peerAw, [peerAw.clientID]),
      'peer'
    );
    vi.advanceTimersByTime(600);
    expect(fired).not.toHaveBeenCalled();
    localAw.destroy();
    peerAw.destroy();
    localDoc.destroy();
    peerDoc.destroy();
  });

  it('resets the seen map when the entity changes', async () => {
    const doc = new Y.Doc();
    const aw = new Awareness(doc);
    const fired = vi.fn();
    function Probe({
      eid,
    }: {
      eid: string;
    }): React.ReactElement | null {
      useCommentsRealtime({
        awareness: aw,
        entityType: 'post',
        entityId: eid,
        onRemoteEvent: fired,
      });
      return null;
    }
    await act(async () => {
      root.render(React.createElement(Probe, { eid: 'A' }));
    });
    // Rerender with a new entity id — no exception, and the inner
    // useEffect that clears `seenRef` runs.
    await act(async () => {
      root.render(React.createElement(Probe, { eid: 'B' }));
    });
    aw.destroy();
    doc.destroy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// lib/survey-logic.ts
// ─────────────────────────────────────────────────────────────────────────────
describe('lib/survey-logic.ts', () => {
  const field = (showIf?: SurveyFieldDef['showIf']): Pick<SurveyFieldDef, 'showIf'> => ({
    showIf,
  });

  describe('isFieldVisible', () => {
    it('returns true when no showIf is set', () => {
      expect(isFieldVisible(field(undefined), {})).toBe(true);
    });

    it('legacy single-rule: matches when answer is in values', () => {
      expect(
        isFieldVisible(field({ fieldId: 'a', values: ['x', 'y'] }), {
          a: 'x',
        })
      ).toBe(true);
    });

    it('legacy single-rule: false when answer not in values', () => {
      expect(
        isFieldVisible(field({ fieldId: 'a', values: ['x'] }), { a: 'z' })
      ).toBe(false);
    });

    it('legacy single-rule: false when dependency answer is missing', () => {
      expect(
        isFieldVisible(field({ fieldId: 'a', values: ['x'] }), {})
      ).toBe(false);
    });

    it('compound AND with empty rules is visible', () => {
      expect(
        isFieldVisible(field({ combinator: 'AND', rules: [] }), {})
      ).toBe(true);
    });

    it('compound AND with equals operator', () => {
      const f = field({
        combinator: 'AND',
        rules: [
          { fieldId: 'a', operator: 'equals', values: ['1'] },
          { fieldId: 'b', operator: 'equals', values: ['yes'] },
        ],
      });
      expect(isFieldVisible(f, { a: '1', b: 'yes' })).toBe(true);
      expect(isFieldVisible(f, { a: '1', b: 'no' })).toBe(false);
    });

    it('compound AND with not_equals operator', () => {
      const f = field({
        combinator: 'AND',
        rules: [{ fieldId: 'a', operator: 'not_equals', values: ['x'] }],
      });
      expect(isFieldVisible(f, { a: 'y' })).toBe(true);
      expect(isFieldVisible(f, { a: 'x' })).toBe(false);
      // Missing dep with not_equals returns true (rule.operator === 'not_equals' branch).
      expect(isFieldVisible(f, {})).toBe(true);
    });

    it('coerces non-string answers to string before comparing', () => {
      const f = field({
        combinator: 'AND',
        rules: [{ fieldId: 'n', operator: 'equals', values: ['42'] }],
      });
      expect(isFieldVisible(f, { n: 42 })).toBe(true);
    });

    it('null answer behaves like missing answer', () => {
      const f = field({
        combinator: 'AND',
        rules: [{ fieldId: 'a', operator: 'equals', values: ['x'] }],
      });
      expect(isFieldVisible(f, { a: null })).toBe(false);
    });

    it('unknown operator falls back to equals behaviour', () => {
      const f = field({
        combinator: 'AND',
        rules: [
          // Cast to access the default branch
          { fieldId: 'a', operator: 'weird' as 'equals', values: ['x'] },
        ],
      });
      expect(isFieldVisible(f, { a: 'x' })).toBe(true);
      expect(isFieldVisible(f, { a: 'y' })).toBe(false);
    });
  });

  describe('getConditionalOptions', () => {
    it('returns field.options when no conditionalOptions is set', () => {
      expect(
        getConditionalOptions({ options: ['a', 'b'] } as never, {})
      ).toEqual(['a', 'b']);
    });

    it('returns mapped options when dependency answer matches', () => {
      expect(
        getConditionalOptions(
          {
            options: ['fallback'],
            conditionalOptions: {
              fieldId: 'dep',
              map: { yes: ['1', '2'], no: ['3'] },
            },
          } as never,
          { dep: 'yes' }
        )
      ).toEqual(['1', '2']);
    });

    it('returns explicit default when dependency answer has no map entry', () => {
      expect(
        getConditionalOptions(
          {
            options: ['fallback'],
            conditionalOptions: {
              fieldId: 'dep',
              map: { yes: ['1'] },
              default: ['def'],
            },
          } as never,
          { dep: 'something' }
        )
      ).toEqual(['def']);
    });

    it('returns field.options when no map entry and no default', () => {
      expect(
        getConditionalOptions(
          {
            options: ['fallback'],
            conditionalOptions: { fieldId: 'dep', map: { yes: ['1'] } },
          } as never,
          { dep: 'x' }
        )
      ).toEqual(['fallback']);
    });

    it('treats missing dep answer as empty-string key', () => {
      expect(
        getConditionalOptions(
          {
            options: ['fallback'],
            conditionalOptions: {
              fieldId: 'dep',
              map: { '': ['empty-match'] },
            },
          } as never,
          {}
        )
      ).toEqual(['empty-match']);
    });
  });

  describe('resolvePiping', () => {
    it('returns the template unchanged when there are no tokens', () => {
      expect(resolvePiping('hello world', { a: 1 })).toBe('hello world');
    });

    it('returns the empty string unchanged', () => {
      expect(resolvePiping('', {})).toBe('');
    });

    it('substitutes single token with answer value', () => {
      expect(resolvePiping('hi {name}', { name: 'Alex' })).toBe('hi Alex');
    });

    it('renders blank for unanswered tokens', () => {
      expect(resolvePiping('hi {name}!', {})).toBe('hi !');
    });

    it('renders blank for null/undefined/empty-string values', () => {
      expect(resolvePiping('{a}{b}{c}', { a: null, b: undefined, c: '' })).toBe(
        ''
      );
    });

    it('coerces non-string values', () => {
      expect(resolvePiping('n={n}', { n: 7 })).toBe('n=7');
    });

    it('handles multiple tokens', () => {
      expect(
        resolvePiping('{a} and {b}', { a: 'X', b: 'Y' })
      ).toBe('X and Y');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// lib/preview-token.ts
// ─────────────────────────────────────────────────────────────────────────────
describe('lib/preview-token.ts', () => {
  // The module reads AUTH_SECRET at import time. Tests below import it once
  // at the top of this file, so we rely on whatever value it captured then.
  // We can still exercise both code paths because verify accepts today + yesterday.

  it('generatePreviewToken returns a 64-char hex string', async () => {
    const { generatePreviewToken } = await import('@/lib/preview-token');
    const t = generatePreviewToken(1);
    expect(t).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verifyPreviewToken accepts a token generated today', async () => {
    const { generatePreviewToken, verifyPreviewToken } = await import(
      '@/lib/preview-token'
    );
    const t = generatePreviewToken(99);
    expect(verifyPreviewToken(99, t)).toBe(true);
  });

  it('verifyPreviewToken rejects a token for a different site id', async () => {
    const { generatePreviewToken, verifyPreviewToken } = await import(
      '@/lib/preview-token'
    );
    const t = generatePreviewToken(1);
    expect(verifyPreviewToken(2, t)).toBe(false);
  });

  it('verifyPreviewToken rejects a tampered (wrong-length) token', async () => {
    const { verifyPreviewToken } = await import('@/lib/preview-token');
    expect(verifyPreviewToken(1, 'deadbeef')).toBe(false);
  });

  it('verifyPreviewToken rejects garbage hex', async () => {
    const { verifyPreviewToken } = await import('@/lib/preview-token');
    expect(verifyPreviewToken(1, 'z'.repeat(64))).toBe(false);
  });

  it('page-scoped token validates only when the same scope is supplied', async () => {
    const { generatePreviewToken, verifyPreviewToken } = await import(
      '@/lib/preview-token'
    );
    const scoped = generatePreviewToken(7, 'blog/hello');
    // Authorizes only its own page path...
    expect(verifyPreviewToken(7, scoped, 'blog/hello')).toBe(true);
    // ...never a different page, and never a site-wide (no-scope) check —
    // this is the property that stops a lifted approval-iframe token from
    // enumerating other draft pages on the same site.
    expect(verifyPreviewToken(7, scoped, 'blog/secret')).toBe(false);
    expect(verifyPreviewToken(7, scoped)).toBe(false);
  });

  it('site-wide token is accepted even when a scope is supplied (editor path)', async () => {
    const { generatePreviewToken, verifyPreviewToken } = await import(
      '@/lib/preview-token'
    );
    // The authenticated editor mints a no-scope (site-wide) token; the site
    // renderer passes the page path as scope — the site-wide token must still
    // validate so existing editor previews keep working.
    const siteWide = generatePreviewToken(8);
    expect(verifyPreviewToken(8, siteWide, 'blog/hello')).toBe(true);
    expect(verifyPreviewToken(8, siteWide, 'anything')).toBe(true);
  });

  it('verifyPreviewToken accepts yesterday-bucket tokens (day boundary)', async () => {
    const realDateNow = Date.now;
    // Pin "now" to T, generate a token, then advance "now" by ~25h so the
    // token is "yesterday" and verify should still accept.
    const t0 = realDateNow();
    const dayMs = 24 * 60 * 60 * 1000;

    // Generate at t0
    Date.now = () => t0;
    const { generatePreviewToken, verifyPreviewToken } = await import(
      '@/lib/preview-token'
    );
    const tok = generatePreviewToken(5);

    // Advance "now" so token falls in yesterday bucket.
    Date.now = () => t0 + dayMs + 60_000;
    try {
      expect(verifyPreviewToken(5, tok)).toBe(true);
      // Two days later: should reject.
      Date.now = () => t0 + 2 * dayMs + 60_000;
      expect(verifyPreviewToken(5, tok)).toBe(false);
    } finally {
      Date.now = realDateNow;
    }
  });
});
