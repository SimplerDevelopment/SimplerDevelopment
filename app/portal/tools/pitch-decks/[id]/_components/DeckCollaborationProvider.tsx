/**
 * Wraps the pitch-deck editor with realtime collaboration state — opens the
 * Yjs doc, joins awareness, broadcasts the local user's identity + active
 * slide, and exposes peers/cursor helpers via context.
 *
 * Single source of truth for "is collab on for this editor?"; if `enabled`
 * is false (or no `entityId`), this becomes a no-op provider so the editor
 * still renders without realtime wiring.
 */
'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { useSession } from 'next-auth/react';
import type * as Y from 'yjs';
import {
  useLocalAwareness,
  useRealtimeDoc,
  type PeerSnapshot,
  type RealtimeStatus,
} from '@/lib/realtime/client';
import type { LocalAwarenessApi } from '@/lib/realtime/client';
import type { AwarenessUser } from '@/lib/realtime/doc-model';

interface DeckCollabContextValue {
  /** `null` until the realtime doc has connected. */
  ydoc: Y.Doc | null;
  status: RealtimeStatus;
  peers: PeerSnapshot[];
  awareness: LocalAwarenessApi;
  /** The local user's identity broadcast via awareness. */
  localUser: AwarenessUser | null;
  /** True when collaboration is wired up (provider is active and connected). */
  enabled: boolean;
}

const DeckCollabContext = createContext<DeckCollabContextValue | null>(null);

/** Stable per-session color for a given user id. */
function userColor(seed: string): string {
  // Quick deterministic hash → hue.
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

export interface DeckCollaborationProviderProps {
  deckId: string;
  /** When false, the provider becomes inert — no socket, no awareness. */
  enabled?: boolean;
  children: React.ReactNode;
}

export function DeckCollaborationProvider({
  deckId,
  enabled = true,
  children,
}: DeckCollaborationProviderProps): React.ReactElement {
  const { data: session } = useSession();
  const sessionUser = session?.user;

  const realtime = useRealtimeDoc({
    entityType: 'deck',
    entityId: deckId,
    enabled,
  });

  const awareness = useLocalAwareness(realtime.awareness);

  const localUser = useMemo<AwarenessUser | null>(() => {
    if (!sessionUser?.email && !sessionUser?.name) return null;
    const id = sessionUser.email || sessionUser.name || 'anon';
    // Session type in this app doesn't include `image`; the awareness
    // schema allows `avatar` to be null (initials fallback in the UI).
    const avatar =
      (sessionUser as { image?: string | null }).image ?? null;
    return {
      id,
      name: sessionUser.name || sessionUser.email || 'Anonymous',
      color: userColor(id),
      avatar,
    };
  }, [sessionUser?.email, sessionUser?.name]);

  // Broadcast user identity once per session; rebroadcast if the awareness
  // instance rotates (new connection / token refresh).
  const lastUserKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!realtime.awareness || !localUser) return;
    const key = `${realtime.awareness.clientID}:${localUser.id}`;
    if (lastUserKeyRef.current === key) return;
    lastUserKeyRef.current = key;
    awareness.setPresence({ user: localUser });
  }, [realtime.awareness, localUser, awareness]);

  const value = useMemo<DeckCollabContextValue>(
    () => ({
      ydoc: realtime.ydoc,
      status: realtime.status,
      peers: realtime.peers,
      awareness,
      localUser,
      enabled: enabled && realtime.status === 'connected',
    }),
    [
      realtime.ydoc,
      realtime.status,
      realtime.peers,
      awareness,
      localUser,
      enabled,
    ]
  );

  return (
    <DeckCollabContext.Provider value={value}>
      {children}
    </DeckCollabContext.Provider>
  );
}

/** Read the deck-collab context. Returns a stable no-op shape outside a provider. */
export function useDeckCollab(): DeckCollabContextValue {
  const ctx = useContext(DeckCollabContext);
  if (ctx) return ctx;
  // Fallback so consumers don't have to null-check (matches expected hook shape).
  return {
    ydoc: null,
    status: 'disconnected',
    peers: [],
    awareness: {
      setCursor: () => {},
      setSelection: () => {},
      setActiveSlide: () => {},
      setFocusedField: () => {},
      setPresence: () => {},
    },
    localUser: null,
    enabled: false,
  };
}
