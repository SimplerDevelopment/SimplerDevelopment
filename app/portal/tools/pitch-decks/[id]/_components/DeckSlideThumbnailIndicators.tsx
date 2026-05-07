/**
 * Floating overlay that draws a small avatar bubble next to each slide
 * thumbnail in the SlideList rail, indicating which peer(s) are currently
 * viewing/editing that slide.
 *
 * Implementation note: the SlideList uses sortable items keyed by slide id —
 * adding the bubble inline would require threading a new prop through 4
 * components. Instead this overlay lives next to the SlideList and uses
 * `data-slide-thumb-id` attributes that we add via a small DOM query.
 *
 * To avoid that complexity for v1 we instead render a parallel summary
 * panel: a compact list of "peer X on slide N" rows next to the SlideList.
 * Future revision can swap to per-thumbnail bubbles by querying the rail's
 * children and absolutely positioning bubbles over them.
 */
'use client';

import { useDeckCollab } from './DeckCollaborationProvider';
import type { PeerSnapshot } from '@/lib/realtime/client';

export interface DeckSlideThumbnailIndicatorsProps {
  /** Total slide count — used for clamping displayed slide numbers. */
  slideCount: number;
  /** Optional click handler — jumps the editor to that slide. */
  onJumpToSlide?: (index: number) => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface Group {
  slideIndex: number;
  peers: PeerSnapshot[];
}

function groupBySlide(peers: PeerSnapshot[], slideCount: number): Group[] {
  const map = new Map<number, PeerSnapshot[]>();
  for (const peer of peers) {
    const idx = peer.activeSlide;
    if (typeof idx !== 'number' || idx < 0 || idx >= slideCount) continue;
    const list = map.get(idx);
    if (list) list.push(peer);
    else map.set(idx, [peer]);
  }
  return Array.from(map.entries())
    .map(([slideIndex, peerList]) => ({ slideIndex, peers: peerList }))
    .sort((a, b) => a.slideIndex - b.slideIndex);
}

export function DeckSlideThumbnailIndicators({
  slideCount,
  onJumpToSlide,
}: DeckSlideThumbnailIndicatorsProps): React.ReactElement | null {
  const { peers, enabled } = useDeckCollab();
  if (!enabled || peers.length === 0) return null;

  const groups = groupBySlide(peers, slideCount);
  if (groups.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-2 space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 pb-1 flex items-center gap-1">
        <span className="material-icons text-[14px]">visibility</span>
        On Slide
      </div>
      {groups.map((group) => (
        <button
          key={group.slideIndex}
          onClick={() => onJumpToSlide?.(group.slideIndex)}
          className="w-full flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-accent transition-colors text-left"
          title={`Jump to slide ${group.slideIndex + 1}`}
        >
          <span className="text-[10px] font-mono text-muted-foreground w-4 text-right shrink-0">
            {group.slideIndex + 1}
          </span>
          <div className="flex -space-x-1 shrink-0">
            {group.peers.slice(0, 3).map((peer) => (
              <span
                key={peer.clientId}
                className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[8px] font-semibold text-white ring-1 ring-background"
                style={{ backgroundColor: peer.user.color }}
                title={peer.user.name}
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
              </span>
            ))}
            {group.peers.length > 3 && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[8px] font-semibold bg-muted text-muted-foreground ring-1 ring-background">
                +{group.peers.length - 3}
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground truncate flex-1">
            {group.peers.length === 1
              ? group.peers[0].user.name
              : `${group.peers.length} peers`}
          </span>
        </button>
      ))}
    </div>
  );
}
