/**
 * Top-bar avatar stack of online peers in the pitch-deck editor.
 *
 * Each avatar shows the peer's initials (or photo) with a small number badge
 * for the slide they're currently on. Clicking jumps the local editor to that
 * slide via `onJumpToSlide`.
 */
'use client';

import { useDeckCollab } from './DeckCollaborationProvider';
import type { PeerSnapshot } from '@/lib/realtime/client';

export interface DeckPresenceBarProps {
  onJumpToSlide: (index: number) => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function PeerAvatar({
  peer,
  onJumpToSlide,
}: {
  peer: PeerSnapshot;
  onJumpToSlide: (index: number) => void;
}): React.ReactElement {
  const slide = peer.activeSlide;
  const canJump = typeof slide === 'number' && slide >= 0;
  const label = canJump
    ? `${peer.user.name} - on slide ${(slide as number) + 1}`
    : peer.user.name;

  return (
    <button
      onClick={() => {
        if (canJump) onJumpToSlide(slide as number);
      }}
      disabled={!canJump}
      className="relative inline-flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-semibold text-white shadow-sm ring-2 ring-background hover:scale-110 transition-transform disabled:cursor-default disabled:hover:scale-100"
      style={{ backgroundColor: peer.user.color }}
      title={label}
      aria-label={label}
    >
      {peer.user.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary user avatar URLs from session
        <img
          src={peer.user.avatar}
          alt=""
          className="w-full h-full rounded-full object-cover"
        />
      ) : (
        initials(peer.user.name)
      )}
      {canJump && (
        <span
          className="absolute -bottom-1 -right-1 inline-flex items-center justify-center min-w-[14px] h-[14px] px-1 rounded-full bg-foreground text-background text-[9px] font-bold leading-none ring-1 ring-background"
          aria-hidden
        >
          {(slide as number) + 1}
        </span>
      )}
    </button>
  );
}

export function DeckPresenceBar({
  onJumpToSlide,
}: DeckPresenceBarProps): React.ReactElement | null {
  const { peers, status, enabled } = useDeckCollab();

  if (!enabled && status !== 'connecting') return null;
  if (peers.length === 0 && status !== 'connecting') return null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-1.5">
        {peers.map((peer) => (
          <PeerAvatar
            key={peer.clientId}
            peer={peer}
            onJumpToSlide={onJumpToSlide}
          />
        ))}
      </div>
      {status === 'connecting' && (
        <span
          className="inline-flex items-center text-[10px] text-muted-foreground"
          title="Connecting to collaboration server"
        >
          <span className="material-icons text-sm animate-spin">autorenew</span>
        </span>
      )}
      {status === 'connected' && peers.length > 0 && (
        <span className="text-[10px] text-muted-foreground">
          {peers.length} {peers.length === 1 ? 'collaborator' : 'collaborators'}
        </span>
      )}
    </div>
  );
}
