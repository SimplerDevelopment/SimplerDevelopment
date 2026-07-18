'use client';

/**
 * PresenceAvatars — top-bar stack of online peer avatars with tooltips.
 *
 * Renders up to 5 circular avatars overlapping `-ml-2`. Border tinted with
 * each peer's `user.color`. When the peer has no `avatar` URL we fall back
 * to a Material Icons `person` glyph (no emoji per repo convention). If
 * more than 5 peers are present, a `+N` pill is appended.
 */

import type { CSSProperties } from 'react';
import type { PeerSnapshot } from '@/lib/realtime/client';

const MAX_VISIBLE = 5;

interface PresenceAvatarsProps {
  peers: PeerSnapshot[];
}

function avatarStyle(color: string, withImage: boolean): CSSProperties {
  return {
    width: 28,
    height: 28,
    borderRadius: '50%',
    border: `2px solid ${color}`,
    background: withImage ? 'transparent' : color,
    color: 'white',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    boxShadow: '0 0 0 2px var(--background, white)',
    flexShrink: 0,
  };
}

export function PresenceAvatars({ peers }: PresenceAvatarsProps) {
  if (peers.length === 0) return null;

  const visible = peers.slice(0, MAX_VISIBLE);
  const overflow = peers.length - visible.length;

  return (
    <div className="flex items-center pl-2" aria-label="Online collaborators">
      {visible.map((peer, idx) => {
        const { user } = peer;
        const hasImage = Boolean(user.avatar);
        return (
          <div
            key={peer.clientId}
            className={idx === 0 ? '' : '-ml-2'}
            style={avatarStyle(user.color, hasImage)}
            title={user.name}
          >
            {hasImage && user.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatar}
                alt={user.name}
                width={28}
                height={28}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span className="material-icons" style={{ fontSize: 16 }}>
                person
              </span>
            )}
          </div>
        );
      })}
      {overflow > 0 && (
        <div
          className="-ml-2 flex items-center justify-center text-xs font-medium"
          style={{
            ...avatarStyle('hsl(var(--muted-foreground))', false),
            fontSize: 11,
          }}
          title={`${overflow} more`}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
