/**
 * Lightweight realtime broadcast for the comments system.
 *
 * Tradeoff (v1): rather than open a second wire-protocol channel over
 * `provider.ws`, we piggyback on the Yjs awareness channel. After any local
 * comment mutation (create / update / delete / resolve), we set a transient
 * awareness key — peers see the awareness change and trigger a debounced
 * REST refetch of the comments list.
 *
 * Why this is "good enough":
 *   - Comments live in Postgres and are read via REST. The awareness signal
 *     is just a "something changed, refetch when you can" nudge.
 *   - Awareness already gives us per-peer fan-out for free (same delivery
 *     semantics as cursor/selection presence).
 *   - Worst case is a stale listing that gets cleared on the next refetch
 *     (manual refresh, next mutation, or focus event).
 *
 * Trade-offs we accept:
 *   - Not exactly-once. A peer can miss an event during a brief disconnect.
 *   - No payload — listeners always re-read the full comments list. For an
 *     entity with hundreds of threads we'd add a per-thread cache and switch
 *     to a delta protocol. Not yet.
 *
 * Envelope on the wire (stored under awareness key `commentEvent`):
 *   { kind, threadId, commentId, ts, entityType, entityId, fromClientId }
 */

'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { Awareness } from 'y-protocols/awareness';

export type CommentEventKind = 'create' | 'update' | 'delete' | 'resolve';

export interface CommentEventEnvelope {
  kind: CommentEventKind;
  threadId: string | null;
  commentId: string | null;
  /** Wall-clock millis when the event was emitted. Used to dedupe replays. */
  ts: number;
  /** Used by listeners to filter to their own (entityType, entityId). */
  entityType: 'post' | 'deck' | 'email';
  entityId: string;
}

export interface UseCommentsRealtimeOptions {
  awareness: Awareness | null;
  entityType: 'post' | 'deck' | 'email';
  entityId: string;
  /** Fired (debounced) when a remote peer reports a comment mutation. */
  onRemoteEvent: () => void;
}

export interface UseCommentsRealtimeApi {
  broadcastEvent: (e: {
    kind: CommentEventKind;
    threadId: string | null;
    commentId: string | null;
  }) => void;
}

/** Awareness key used to transport comment events. */
const COMMENT_EVENT_KEY = 'commentEvent';

/** Coalesce burst-y peer events into one refetch within this window. */
const REFETCH_DEBOUNCE_MS = 500;

/**
 * React hook that wires `onRemoteEvent` to peer awareness changes and
 * returns a `broadcastEvent` to call after local optimistic mutations.
 *
 * The returned `broadcastEvent` is stable across renders (callback is
 * captured by ref) so callers can safely call it from inside other
 * memoized callbacks without breaking memo identity.
 */
export function useCommentsRealtime(
  opts: UseCommentsRealtimeOptions
): UseCommentsRealtimeApi {
  const { awareness, entityType, entityId, onRemoteEvent } = opts;

  // Capture latest onRemoteEvent without re-subscribing the awareness handler.
  const onRemoteRef = useRef(onRemoteEvent);
  useEffect(() => {
    onRemoteRef.current = onRemoteEvent;
  }, [onRemoteEvent]);

  // Track timestamps we've already dispatched per peer, so a single peer
  // setting + clearing the field doesn't double-fire.
  const seenRef = useRef<Map<number, number>>(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!awareness) return;

    const onChange = (): void => {
      const states = awareness.getStates();
      let triggered = false;

      states.forEach((state, peerClientId) => {
        if (peerClientId === awareness.clientID) return; // skip self
        const ev = (state as Record<string, unknown>)[COMMENT_EVENT_KEY] as
          | CommentEventEnvelope
          | undefined;
        if (!ev || typeof ev !== 'object') return;
        if (ev.entityType !== entityType || ev.entityId !== entityId) return;

        const last = seenRef.current.get(peerClientId) ?? 0;
        if (ev.ts <= last) return;
        seenRef.current.set(peerClientId, ev.ts);
        triggered = true;
      });

      if (!triggered) return;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onRemoteRef.current();
      }, REFETCH_DEBOUNCE_MS);
    };

    awareness.on('change', onChange);

    return () => {
      awareness.off('change', onChange);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [awareness, entityType, entityId]);

  // Reset seen-timestamps when the entity changes, so a stale ts cap from
  // a previous entity doesn't suppress events on the new one.
  useEffect(() => {
    seenRef.current = new Map();
  }, [entityType, entityId]);

  const broadcastEvent = useCallback(
    (e: {
      kind: CommentEventKind;
      threadId: string | null;
      commentId: string | null;
    }) => {
      if (!awareness) return;
      const envelope: CommentEventEnvelope = {
        kind: e.kind,
        threadId: e.threadId,
        commentId: e.commentId,
        ts: Date.now(),
        entityType,
        entityId,
      };
      awareness.setLocalStateField(COMMENT_EVENT_KEY, envelope);
      // Clear after a tick so we don't keep retransmitting the same event
      // every awareness update. Peers have already captured ts.
      setTimeout(() => {
        try {
          awareness.setLocalStateField(COMMENT_EVENT_KEY, null);
        } catch {
          // awareness may have been destroyed mid-flight; ignore.
        }
      }, 100);
    },
    [awareness, entityType, entityId]
  );

  return { broadcastEvent };
}
