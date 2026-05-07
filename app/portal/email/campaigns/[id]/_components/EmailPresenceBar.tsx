/**
 * EmailPresenceBar — avatar stack for everyone currently editing this
 * campaign. Renders nothing while disconnected (no flicker on cold load)
 * and a tidy stack with tooltips once peers arrive.
 *
 * Falls back to a Material Icons "person" glyph when a peer has no avatar.
 */

'use client';

import { useEmailPresence } from './EmailCollaborationProvider';
import type { PeerSnapshot } from '@/lib/realtime/client';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

interface PeerAvatarProps {
  peer: PeerSnapshot;
  /** Stack overlap — z-index ordering. */
  index: number;
}

function PeerAvatar({ peer, index }: PeerAvatarProps) {
  const { user } = peer;
  const ring = user.color || '#3b82f6';
  return (
    <div
      className="relative -ml-2 first:ml-0 group"
      style={{ zIndex: 100 - index }}
      title={`${user.name} is editing`}
    >
      <div
        className="w-7 h-7 rounded-full bg-card border-2 flex items-center justify-center text-[10px] font-semibold uppercase text-foreground overflow-hidden shadow-sm"
        style={{ borderColor: ring }}
      >
        {user.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatar}
            alt={user.name}
            className="w-full h-full object-cover"
          />
        ) : user.name ? (
          <span>{initials(user.name)}</span>
        ) : (
          <span className="material-icons text-sm text-muted-foreground">
            person
          </span>
        )}
      </div>
      <span className="pointer-events-none absolute top-full mt-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-0.5 text-[10px] text-background opacity-0 group-hover:opacity-100 transition-opacity z-50">
        {user.name}
      </span>
    </div>
  );
}

export function EmailPresenceBar() {
  const { peers, status, localUser } = useEmailPresence();

  if (status !== 'connected' && peers.length === 0) return null;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center">
        {peers.slice(0, 5).map((p, i) => (
          <PeerAvatar key={p.clientId} peer={p} index={i} />
        ))}
        {peers.length > 5 && (
          <div className="-ml-2 w-7 h-7 rounded-full bg-muted border-2 border-card flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
            +{peers.length - 5}
          </div>
        )}
      </div>
      {peers.length > 0 ? (
        <span className="text-xs text-muted-foreground">
          {peers.length === 1
            ? `${peers[0]!.user.name} is here`
            : `${peers.length} people editing`}
        </span>
      ) : status === 'connected' ? (
        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          {localUser ? 'Live' : 'Connected'}
        </span>
      ) : null}
    </div>
  );
}
