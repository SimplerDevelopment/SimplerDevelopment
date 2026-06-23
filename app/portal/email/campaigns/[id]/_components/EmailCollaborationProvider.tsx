/**
 * EmailCollaborationProvider — wires the email-campaign edit page into the
 * shared Yjs doc + awareness layer.
 *
 * Responsibilities:
 *   - Open a `useRealtimeDoc({ entityType: 'email', entityId })` connection
 *     while the page is mounted.
 *   - Seed local awareness with the signed-in user's identity (id, name,
 *     a deterministic color) on first connect.
 *   - Expose a `useEmailPresence()` hook that surfaces remote peers + the
 *     local awareness setters needed for field-focus and (optional) cursor
 *     broadcasting.
 *
 * Children consume the context — the provider itself renders no UI.
 */

'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { useSession } from 'next-auth/react';
import type * as Y from 'yjs';
import {
  useLocalAwareness,
  useRealtimeDoc,
  type PeerSnapshot,
  type RealtimeStatus,
} from '@/lib/realtime/client';
import type { AwarenessUser } from '@/lib/realtime/doc-model';

/** Stable color from a string id — used so each peer has a consistent hue. */
const PEER_COLORS = [
  '#ef4444', // red-500
  '#f97316', // orange-500
  '#eab308', // yellow-500
  '#22c55e', // green-500
  '#06b6d4', // cyan-500
  '#3b82f6', // blue-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
];

function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return PEER_COLORS[Math.abs(hash) % PEER_COLORS.length];
}

export interface EmailPresenceApi {
  /** Online peers (excluding self). */
  peers: PeerSnapshot[];
  /** Connection status — useful to gate the "live" indicator. */
  status: RealtimeStatus;
  /** Underlying Y.Doc — exposed so the page can bind block edits. */
  ydoc: Y.Doc | null;
  /** Local user (the one this client is broadcasting as), if known. */
  localUser: AwarenessUser | null;
  /** Set the field path the local user is currently focused on. */
  setFocusedField: (path: string | null) => void;
  /** Set the local cursor position (optional v1 stretch). */
  setCursor: (cursor: { x: number; y: number } | null) => void;
  /** Set the local block selection. */
  setSelection: (selection: { blockId: string } | null) => void;
}

const EmailPresenceContext = createContext<EmailPresenceApi | null>(null);

export function useEmailPresence(): EmailPresenceApi {
  const ctx = useContext(EmailPresenceContext);
  if (!ctx) {
    // Outside a provider — return a no-op shim so child components can
    // render unconditionally without crashing.
    return {
      peers: [],
      status: 'disconnected',
      ydoc: null,
      localUser: null,
      setFocusedField: () => {},
      setCursor: () => {},
      setSelection: () => {},
    };
  }
  return ctx;
}

export interface EmailCollaborationProviderProps {
  entityId: string;
  /** When false, no realtime connection is opened (e.g. for new-campaign). */
  enabled?: boolean;
  children: ReactNode;
}

export function EmailCollaborationProvider({
  entityId,
  enabled = true,
  children,
}: EmailCollaborationProviderProps) {
  const { data: session } = useSession();
  const { ydoc, awareness, status, peers } = useRealtimeDoc({
    entityType: 'email',
    entityId,
    enabled,
  });
  const local = useLocalAwareness(awareness);

  const localUser = useMemo<AwarenessUser | null>(() => {
    const u = session?.user;
    if (!u?.id) return null;
    return {
      id: u.id,
      name: u.name || u.email || 'Anonymous',
      color: colorForId(u.id),
      avatar: (u as { image?: string | null }).image ?? null,
    };
  }, [session?.user]);

  // Publish our user onto awareness as soon as both the awareness object
  // and the user identity are available. Re-runs if the user flips.
  useEffect(() => {
    if (!awareness || !localUser) return;
    local.setPresence({ user: localUser });
  }, [awareness, localUser, local]);

  const value = useMemo<EmailPresenceApi>(
    () => ({
      peers,
      status,
      ydoc,
      localUser,
      setFocusedField: local.setFocusedField,
      setCursor: local.setCursor,
      setSelection: local.setSelection,
    }),
    [peers, status, ydoc, localUser, local]
  );

  return (
    <EmailPresenceContext.Provider value={value}>
      {children}
    </EmailPresenceContext.Provider>
  );
}
