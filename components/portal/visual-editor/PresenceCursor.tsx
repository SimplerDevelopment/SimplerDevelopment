'use client';

/**
 * PresenceCursor — overlay one peer's cursor + name tag.
 *
 * Receives iframe-doc (or shell-DOM, whichever the parent broadcasts)
 * coordinates and renders an SVG arrow + label colored with the peer's
 * `user.color`. Smoothed with a short transition so trailing-edge updates
 * don't look choppy.
 */

import type { CSSProperties } from 'react';

interface PresenceCursorProps {
  /** Position in the parent overlay's coordinate system. */
  x: number;
  y: number;
  color: string;
  name: string;
}

const cursorPathD =
  'M5.65 1.07 18.23 13.65a.5.5 0 0 1-.27.85l-5.46.78-2.6 5.0a.5.5 0 0 1-.92-.04L4.93 1.79a.5.5 0 0 1 .72-.72Z';

export function PresenceCursor({ x, y, color, name }: PresenceCursorProps) {
  const wrapStyle: CSSProperties = {
    position: 'absolute',
    left: x,
    top: y,
    transform: 'translate(-2px, -2px)',
    transition: 'transform 0.08s linear, left 0.08s linear, top 0.08s linear',
    pointerEvents: 'none',
    zIndex: 30,
  };

  const labelStyle: CSSProperties = {
    background: color,
    color: 'white',
    borderRadius: 6,
    padding: '2px 8px',
    fontSize: 12,
    fontWeight: 500,
    marginTop: 14,
    marginLeft: 14,
    whiteSpace: 'nowrap',
    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
    maxWidth: 160,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  return (
    <div style={wrapStyle} aria-hidden>
      <svg
        width="20"
        height="22"
        viewBox="0 0 24 24"
        fill={color}
        stroke="white"
        strokeWidth="1.5"
        strokeLinejoin="round"
        style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))' }}
      >
        <path d={cursorPathD} />
      </svg>
      <div style={labelStyle}>{name}</div>
    </div>
  );
}
