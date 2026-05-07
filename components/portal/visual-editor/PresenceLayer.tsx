'use client';

/**
 * PresenceLayer — renders all peer cursors over the editor shell and
 * broadcasts the local cursor position to the realtime room.
 *
 * Coordinate space (v1 simplification):
 *   We capture cursor coordinates on the editor-shell DOM (the parent
 *   document, not inside the iframe). Sending `MOUSE_MOVE` through the
 *   existing visual-editor postMessage protocol would require touching
 *   `useVisualEditorParent.ts`, the iframe-side bridge, and `types/visual-
 *   editor.ts` — three files marked off-limits or one-step-removed from
 *   this scope. Shell-DOM coords give us a working presence affordance
 *   without crossing those seams; we can promote to true iframe-doc coords
 *   in a follow-up by:
 *     1. Adding `MOUSE_MOVE_IN_IFRAME` to `IFRAME_MESSAGES`.
 *     2. Have the iframe page emit rAF-paced postMessages from `mousemove`.
 *     3. Route through `useVisualEditorParent.ts` into the same setCursor
 *        call this component already does.
 *   Remote cursors will look correct relative to the shell as long as
 *   peers' shell layouts are similar — which they are, because every
 *   editor instance loads the same page.
 *
 * Throttling: rAF-paced. Two updates per frame collapse to one.
 *
 * Stale cursor cleanup: we track a `lastSeen` timestamp per peer and hide
 * cursors that haven't moved for 5 seconds.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Awareness } from 'y-protocols/awareness';
import { PresenceCursor } from './PresenceCursor';
import type { PeerSnapshot } from '@/lib/realtime/client';

const STALE_MS = 5_000;

interface PresenceLayerProps {
  peers: PeerSnapshot[];
  /** When provided, the layer broadcasts the local cursor here. */
  awareness: Awareness | null;
  /**
   * Optional setter from `useLocalAwareness().setCursor`. Preferred over
   * `awareness?.setLocalStateField('cursor', ...)` so the rest of the
   * presence object (selection, focusedField) is preserved.
   */
  setCursor?: (cursor: { x: number; y: number } | null) => void;
}

interface PeerWithLastSeen {
  peer: PeerSnapshot;
  lastSeen: number;
}

export function PresenceLayer({
  peers,
  awareness,
  setCursor,
}: PresenceLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const pendingCursor = useRef<{ x: number; y: number } | null>(null);

  // Track lastSeen per peer keyed by client id. Updates whenever the peer's
  // cursor coords change so we can fade them out after STALE_MS quiet.
  const [, forceTick] = useState(0);
  const lastSeenRef = useRef<Map<number, number>>(new Map());
  const lastCursorRef = useRef<Map<number, string>>(new Map());

  // Update lastSeen whenever a peer's cursor moved.
  useEffect(() => {
    const now = Date.now();
    for (const peer of peers) {
      if (!peer.cursor) continue;
      const sig = `${peer.cursor.x},${peer.cursor.y}`;
      if (lastCursorRef.current.get(peer.clientId) !== sig) {
        lastCursorRef.current.set(peer.clientId, sig);
        lastSeenRef.current.set(peer.clientId, now);
      } else if (!lastSeenRef.current.has(peer.clientId)) {
        lastSeenRef.current.set(peer.clientId, now);
      }
    }
    // Drop entries for peers that left.
    const ids = new Set(peers.map((p) => p.clientId));
    for (const id of Array.from(lastSeenRef.current.keys())) {
      if (!ids.has(id)) {
        lastSeenRef.current.delete(id);
        lastCursorRef.current.delete(id);
      }
    }
  }, [peers]);

  // Tick once per second to re-evaluate stale cursors. (Cheap; the layer is
  // mounted only inside the editor so this is bounded to the active page.)
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Broadcast local cursor (rAF-throttled) on mousemove over the shell.
  useEffect(() => {
    if (!awareness && !setCursor) return;
    const el = containerRef.current;
    if (!el) return;

    const flush = () => {
      rafRef.current = null;
      const c = pendingCursor.current;
      if (!c) return;
      if (setCursor) setCursor(c);
      else if (awareness)
        awareness.setLocalStateField('cursor', c);
    };

    const onMove = (event: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      pendingCursor.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(flush);
    };

    const onLeave = () => {
      pendingCursor.current = null;
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (setCursor) setCursor(null);
      else if (awareness) awareness.setLocalStateField('cursor', null);
    };

    // Capture phase so iframe pointer-event blockers don't steal the event.
    window.addEventListener('mousemove', onMove, { capture: true });
    window.addEventListener('mouseout', onLeave, { capture: true });

    return () => {
      window.removeEventListener('mousemove', onMove, { capture: true } as EventListenerOptions);
      window.removeEventListener('mouseout', onLeave, { capture: true } as EventListenerOptions);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [awareness, setCursor]);

  const visiblePeers: PeerWithLastSeen[] = useMemo(() => {
    const now = Date.now();
    return peers
      .filter((p) => p.cursor != null)
      .map((peer) => ({
        peer,
        lastSeen: lastSeenRef.current.get(peer.clientId) ?? now,
      }))
      .filter(({ lastSeen }) => now - lastSeen < STALE_MS);
  }, [peers]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 25 }}
      aria-hidden
    >
      {visiblePeers.map(({ peer }) => {
        const c = peer.cursor;
        if (!c) return null;
        return (
          <PresenceCursor
            key={peer.clientId}
            x={c.x}
            y={c.y}
            color={peer.user.color}
            name={peer.user.name}
          />
        );
      })}
    </div>
  );
}
