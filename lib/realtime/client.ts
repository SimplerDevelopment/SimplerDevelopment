/**
 * Browser realtime client. Wraps `y-websocket` with token-fetching, exposes
 * a React hook (`useRealtimeDoc`) returning a Y.Doc + provider + awareness,
 * and a complementary hook (`useLocalAwareness`) for setting cursor /
 * selection / activeSlide / focusedField on the local awareness state.
 *
 * This file is browser-safe. Do NOT import server-only modules here.
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { Awareness } from 'y-protocols/awareness';
import { docKey, type EntityType, type PresenceState } from './doc-model';

interface TokenResponse {
  token: string;
  wsUrl: string;
  expiresAt: number;
}

async function fetchToken(
  entityType: EntityType,
  entityId: string
): Promise<TokenResponse> {
  const res = await fetch('/api/realtime/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entityType, entityId }),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch realtime token (${res.status})`);
  }
  const json = (await res.json()) as
    | { success: true; data: TokenResponse }
    | { success: false; message?: string };
  if (!json.success) {
    throw new Error(json.message || 'Token request failed');
  }
  return json.data;
}

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected';

export interface PeerSnapshot extends PresenceState {
  /** Yjs awareness clientId. */
  clientId: number;
}

/**
 * Low-level wrapper around `WebsocketProvider`. Owns one Y.Doc + one
 * provider; exposes `connect()` / `disconnect()` / `destroy()`. The hook
 * `useRealtimeDoc` is the normal entry point — most callers shouldn't
 * instantiate this directly.
 */
export class RealtimeClient {
  readonly entityType: EntityType;
  readonly entityId: string;
  readonly doc: Y.Doc;

  private provider: WebsocketProvider | null = null;
  private statusListeners = new Set<(s: RealtimeStatus) => void>();
  private currentStatus: RealtimeStatus = 'disconnected';
  private destroyed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private tokenExpiresAt = 0;

  constructor(entityType: EntityType, entityId: string) {
    this.entityType = entityType;
    this.entityId = entityId;
    this.doc = new Y.Doc();
  }

  get awareness(): Awareness | null {
    return this.provider?.awareness ?? null;
  }

  /** Public accessor for the underlying y-websocket provider. */
  get wsProvider(): WebsocketProvider | null {
    return this.provider;
  }

  get status(): RealtimeStatus {
    return this.currentStatus;
  }

  onStatus(cb: (s: RealtimeStatus) => void): () => void {
    this.statusListeners.add(cb);
    cb(this.currentStatus);
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  private emitStatus(s: RealtimeStatus): void {
    if (this.currentStatus === s) return;
    this.currentStatus = s;
    for (const cb of this.statusListeners) cb(s);
  }

  async connect(): Promise<void> {
    if (this.destroyed) return;
    this.emitStatus('connecting');

    let tokenResponse: TokenResponse;
    try {
      tokenResponse = await fetchToken(this.entityType, this.entityId);
    } catch (err) {
      this.emitStatus('disconnected');
      this.scheduleReconnect();
      throw err;
    }

    this.tokenExpiresAt = tokenResponse.expiresAt;

    // Tear down any prior provider before opening a new one.
    if (this.provider) {
      this.provider.destroy();
      this.provider = null;
    }

    const url = tokenResponse.wsUrl;
    const room = docKey(this.entityType, this.entityId);

    this.provider = new WebsocketProvider(url, room, this.doc, {
      params: { token: tokenResponse.token },
      connect: true,
    });

    this.provider.on(
      'status',
      (event: { status: 'connected' | 'connecting' | 'disconnected' }) => {
        if (event.status === 'connected') {
          this.reconnectAttempts = 0;
        }
        this.emitStatus(event.status);
      }
    );

    // Refresh token before it expires (4m for a 5m token, with jitter).
    const ttlMs = tokenResponse.expiresAt - Date.now();
    const refreshIn = Math.max(30_000, ttlMs - 60_000);
    this.scheduleTokenRefresh(refreshIn);
  }

  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private scheduleTokenRefresh(ms: number): void {
    if (this.tokenRefreshTimer) clearTimeout(this.tokenRefreshTimer);
    this.tokenRefreshTimer = setTimeout(() => {
      if (this.destroyed) return;
      // Reconnect with a fresh token. y-websocket re-syncs state automatically.
      void this.connect().catch(() => {
        // scheduleReconnect will be called from inside connect on failure.
      });
    }, ms);
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const attempt = this.reconnectAttempts++;
    const delay = Math.min(30_000, 500 * Math.pow(2, attempt));
    this.reconnectTimer = setTimeout(() => {
      if (this.destroyed) return;
      void this.connect().catch(() => {});
    }, delay);
  }

  disconnect(): void {
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.provider) {
      this.provider.destroy();
      this.provider = null;
    }
    this.emitStatus('disconnected');
  }

  destroy(): void {
    this.destroyed = true;
    this.disconnect();
    this.statusListeners.clear();
    this.doc.destroy();
  }

  /** Time-until-token-expiry in ms (0 if already expired). */
  get tokenTtl(): number {
    return Math.max(0, this.tokenExpiresAt - Date.now());
  }
}

// ─── React hooks ─────────────────────────────────────────────────────────────

export interface UseRealtimeDocOptions {
  entityType: EntityType;
  entityId: string;
  /** When false, no connection is made. Toggle to lazily mount the editor. */
  enabled?: boolean;
}

export interface UseRealtimeDocResult {
  ydoc: Y.Doc | null;
  provider: WebsocketProvider | null;
  awareness: Awareness | null;
  status: RealtimeStatus;
  peers: PeerSnapshot[];
}

/**
 * Open a realtime connection for an entity. Returns Y.Doc + provider +
 * awareness + a list of remote peers (via `Awareness.getStates()` snapshot).
 *
 * Callers are responsible for binding their editor state to `ydoc` (see
 * `lib/realtime/doc-model.ts` for the canonical Y representation).
 */
export function useRealtimeDoc(
  opts: UseRealtimeDocOptions
): UseRealtimeDocResult {
  const enabled = opts.enabled !== false;
  const clientRef = useRef<RealtimeClient | null>(null);

  const [status, setStatus] = useState<RealtimeStatus>('disconnected');
  const [peers, setPeers] = useState<PeerSnapshot[]>([]);
  const [, forceTick] = useState(0);

  // Track entity changes — recreate the client when entity flips.
  useEffect(() => {
    if (!enabled) return;
    const c = new RealtimeClient(opts.entityType, opts.entityId);
    clientRef.current = c;

    const offStatus = c.onStatus(setStatus);
    void c.connect().catch(() => {});

    forceTick((n) => n + 1); // surface the new doc/provider to consumers

    return () => {
      offStatus();
      c.destroy();
      if (clientRef.current === c) clientRef.current = null;
    };
  }, [opts.entityType, opts.entityId, enabled]);

  // Subscribe to awareness updates and project to a typed snapshot.
  useEffect(() => {
    const c = clientRef.current;
    if (!c) return;
    const a = c.awareness;
    if (!a) return;
    const update = () => {
      const out: PeerSnapshot[] = [];
      a.getStates().forEach((state, clientId) => {
        if (clientId === a.clientID) return; // skip self
        const presence = state as Partial<PresenceState>;
        if (!presence?.user) return;
        out.push({
          clientId,
          user: presence.user,
          cursor: presence.cursor ?? null,
          selection: presence.selection ?? null,
          activeSlide: presence.activeSlide ?? null,
          focusedField: presence.focusedField ?? null,
        });
      });
      setPeers(out);
    };
    a.on('change', update);
    update();
    return () => {
      a.off('change', update);
    };
  }, [status]); // re-subscribe whenever the underlying provider/awareness rotates

  return useMemo(
    () => ({
      ydoc: clientRef.current?.doc ?? null,
      provider: clientRef.current?.wsProvider ?? null,
      awareness: clientRef.current?.awareness ?? null,
      status,
      peers,
    }),
    [status, peers]
  );
}

// ─── Local awareness setters ─────────────────────────────────────────────────

export interface LocalAwarenessApi {
  setCursor: (cursor: { x: number; y: number } | null) => void;
  setSelection: (selection: { blockId: string } | null) => void;
  setActiveSlide: (index: number | null) => void;
  setFocusedField: (path: string | null) => void;
  /** Replace the entire local presence object (advanced). */
  setPresence: (next: Partial<PresenceState>) => void;
}

/**
 * Provides typed setters over `awareness.setLocalStateField`. Each setter
 * patches a single key without disturbing the others (e.g. updating cursor
 * does not clear selection).
 *
 * The caller is expected to populate the `user` field at least once via
 * `setPresence({ user })` — usually right after the first connect — so other
 * peers can see who's online. `useRealtimeDoc` intentionally does NOT do
 * this for you, because the user object lives in the parent component's
 * session/profile state.
 */
export function useLocalAwareness(
  awareness: Awareness | null
): LocalAwarenessApi {
  return useMemo<LocalAwarenessApi>(() => {
    if (!awareness) {
      const noop = (): void => {};
      return {
        setCursor: noop,
        setSelection: noop,
        setActiveSlide: noop,
        setFocusedField: noop,
        setPresence: noop,
      };
    }
    return {
      setCursor: (cursor) => awareness.setLocalStateField('cursor', cursor),
      setSelection: (selection) =>
        awareness.setLocalStateField('selection', selection),
      setActiveSlide: (index) =>
        awareness.setLocalStateField('activeSlide', index),
      setFocusedField: (path) =>
        awareness.setLocalStateField('focusedField', path),
      setPresence: (next) => {
        const cur = awareness.getLocalState() ?? {};
        awareness.setLocalState({ ...cur, ...next });
      },
    };
  }, [awareness]);
}
