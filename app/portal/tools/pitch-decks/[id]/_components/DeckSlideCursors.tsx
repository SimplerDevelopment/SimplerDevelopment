/**
 * Renders peer cursors over the active slide canvas. The component owns:
 *  - capturing the local pointer position over a tracked DOM element and
 *    broadcasting it (rAF-throttled, normalized to slide-local 0..1 coords);
 *  - rendering arrow + name-tag overlays for each peer whose `activeSlide`
 *    matches the local active slide.
 *
 * The slide canvas renders as plain HTML (no iframe) so we can attach the
 * pointermove listener directly without postMessage.
 *
 * Coordinates are normalized to [0,1] of the canvas container so peers on
 * different viewport sizes still see roughly the same cursor target. The
 * presence schema (`PresenceState.cursor`) only types `{ x, y }` — we treat
 * those as fractions of the canvas bounds.
 */
'use client';

import { useEffect, useRef } from 'react';
import { useDeckCollab } from './DeckCollaborationProvider';

export interface DeckSlideCursorsProps {
  /** The local editor's current slide index — used to filter peers. */
  activeSlideIndex: number;
  /** The element whose bounding rect we track. */
  trackedRef: React.RefObject<HTMLElement | null>;
}

export function DeckSlideCursors({
  activeSlideIndex,
  trackedRef,
}: DeckSlideCursorsProps): React.ReactElement | null {
  const { peers, awareness, enabled } = useDeckCollab();

  // Local pointer broadcasting — rAF throttled.
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const el = trackedRef.current;
    if (!el) return;

    const onMove = (e: PointerEvent): void => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      // Skip when outside the canvas rect (e.g. floating UI hover).
      if (x < 0 || x > 1 || y < 0 || y > 1) {
        if (lastPosRef.current !== null) {
          lastPosRef.current = null;
          awareness.setCursor(null);
        }
        return;
      }
      lastPosRef.current = { x, y };
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (lastPosRef.current) awareness.setCursor(lastPosRef.current);
      });
    };

    const onLeave = (): void => {
      lastPosRef.current = null;
      awareness.setCursor(null);
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      // Clear our cursor on unmount so peers don't see a ghost.
      awareness.setCursor(null);
    };
  }, [trackedRef, awareness, enabled, activeSlideIndex]);

  if (!enabled) return null;

  // Filter peers to those on the same slide with a cursor.
  const visible = peers.filter(
    (p) => p.activeSlide === activeSlideIndex && p.cursor != null
  );
  if (visible.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      {visible.map((peer) => {
        const cursor = peer.cursor;
        if (!cursor) return null;
        const left = `${Math.max(0, Math.min(1, cursor.x)) * 100}%`;
        const top = `${Math.max(0, Math.min(1, cursor.y)) * 100}%`;
        return (
          <div
            key={peer.clientId}
            className="absolute will-change-transform"
            style={{ left, top, transform: 'translate(-2px, -2px)' }}
          >
            {/* Arrow */}
            <svg
              width="16"
              height="20"
              viewBox="0 0 16 20"
              fill="none"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))' }}
            >
              <path
                d="M1 1 L1 16 L5.5 12 L8 18 L10.5 17 L8 11 L14 11 Z"
                fill={peer.user.color}
                stroke="white"
                strokeWidth="1"
                strokeLinejoin="round"
              />
            </svg>
            {/* Name tag */}
            <span
              className="ml-3 -mt-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold text-white whitespace-nowrap"
              style={{ backgroundColor: peer.user.color }}
            >
              {peer.user.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
