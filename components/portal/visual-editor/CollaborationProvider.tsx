'use client';

/**
 * CollaborationProvider — wires a slice of the editor into the realtime
 * room (Yjs + presence).
 *
 * Responsibilities:
 *   - Open a `useRealtimeDoc({ entityType, entityId })` connection.
 *   - Once the awareness channel is up, broadcast the local user identity
 *     (id / name / color / avatar) exactly once. Without this, peers can't
 *     attribute cursors to a name.
 *   - Mirror `selectedBlockId` into local awareness so peers can see what
 *     each other is selecting (badge halo, layers panel marker, etc).
 *   - Expose `{ ydoc, awareness, peers, status, setCursor }` to the rest
 *     of the editor through `useCollaboration()`. PresenceLayer +
 *     PresenceAvatars consume this; PortalPostForm passes the ydoc into
 *     `usePostForm` to enable Yjs binding.
 *
 * Renders children unchanged — visual presence chrome is layered by
 * sibling components (PresenceLayer over the iframe area, PresenceAvatars
 * in the top bar).
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import {
  useLocalAwareness,
  useRealtimeDoc,
  type PeerSnapshot,
  type RealtimeStatus,
} from '@/lib/realtime/client';
import type { AwarenessUser } from '@/lib/realtime/doc-model';

// ─── Color palette + deterministic picker ───────────────────────────────

/**
 * 8 visually-distinct hues that read OK on both light and dark
 * backgrounds. Picked by hashing the user id so a given user gets the
 * same color across reconnects (and across peers' viewports).
 */
const PEER_COLORS = [
  '#ef4444', // red
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
] as const;

function hashStringToInt(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function pickPeerColor(userId: string): string {
  return PEER_COLORS[hashStringToInt(userId) % PEER_COLORS.length];
}

// ─── Context ────────────────────────────────────────────────────────────

export interface CollaborationContextValue {
  ydoc: Y.Doc | null;
  awareness: Awareness | null;
  peers: PeerSnapshot[];
  status: RealtimeStatus;
  setCursor: (cursor: { x: number; y: number } | null) => void;
}

const CollaborationContext = createContext<CollaborationContextValue>({
  ydoc: null,
  awareness: null,
  peers: [],
  status: 'disconnected',
  setCursor: () => {},
});

export function useCollaboration(): CollaborationContextValue {
  return useContext(CollaborationContext);
}

// ─── Provider ───────────────────────────────────────────────────────────

interface CollaborationProviderProps {
  entityType: 'post' | 'deck' | 'email';
  entityId: string;
  user: { id: string; name: string; image?: string | null };
  /** Forward the current selection to peer awareness. Optional. */
  selectedBlockId?: string | null;
  /** Disable to fall back to single-player mode (no realtime). */
  enabled?: boolean;
  children: ReactNode;
}

export function CollaborationProvider({
  entityType,
  entityId,
  user,
  selectedBlockId,
  enabled = true,
  children,
}: CollaborationProviderProps) {
  const { ydoc, awareness, peers, status } = useRealtimeDoc({
    entityType,
    entityId,
    enabled,
  });

  const { setCursor, setSelection, setPresence } = useLocalAwareness(
    awareness,
  );

  // Push the local identity into awareness once per reconnect. The room
  // server doesn't infer name/color/avatar — peers learn it from the
  // awareness payload.
  const identityPushedFor = useRef<Awareness | null>(null);
  useEffect(() => {
    if (!awareness) return;
    if (identityPushedFor.current === awareness) return;
    identityPushedFor.current = awareness;

    const me: AwarenessUser = {
      id: user.id,
      name: user.name,
      color: pickPeerColor(user.id),
      avatar: user.image ?? null,
    };
    setPresence({ user: me });
  }, [awareness, user.id, user.name, user.image, setPresence]);

  // Mirror selection into awareness so peers can render selection badges.
  useEffect(() => {
    if (!awareness) return;
    setSelection(selectedBlockId ? { blockId: selectedBlockId } : null);
  }, [awareness, selectedBlockId, setSelection]);

  const value = useMemo<CollaborationContextValue>(
    () => ({ ydoc, awareness, peers, status, setCursor }),
    [ydoc, awareness, peers, status, setCursor],
  );

  return (
    <CollaborationContext.Provider value={value}>
      {children}
    </CollaborationContext.Provider>
  );
}
