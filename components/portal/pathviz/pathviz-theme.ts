// Shared theming + small pure helpers for the Path Visualizations ("Dev
// Paths") portal tab. Kept separate from the components so the color/hash
// logic stays unit-testable without pulling in reactflow or React.
//
// Colors are lifted verbatim from the approved mockup's :root block
// (docs/design/path-visualizations-mockup-v3.html) — Dev Paths is a
// self-contained dark "mission control" panel that ignores the portal's
// light/dark theme toggle, so these are plain hex constants applied via
// inline `style`, not Tailwind theme tokens.

import type { PathVizClaim, PathVizNodeStatus } from './types';

// ─── Base surface palette (mockup :root) ───────────────────────────────────

export const THEME = {
  surface: '#0C141C',
  panel: '#111C26',
  panel2: '#16232F',
  line: '#1F3140',
  lineBright: '#2C4356',
  ink: '#E4EDF4',
  ink2: '#93A6B8',
  ink3: '#5C7183',
  mono: 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace',
} as const;

// ─── Status ramp — the 6-step build progression + 2 alert states ──────────
// `step` feeds the 6-segment ring: 1-6 lights that many segments left-to-right;
// 0 (blocked/error) lights none — Phase 4 has no event history to recover
// "how far had it gotten before it broke," so the ring goes dark and the
// status word (always rendered, never color-alone) carries the meaning.
// Recovering the pre-blocked ring fill is a Phase 5 (event-log) concern.

export interface StatusInfo {
  hex: string;
  label: string;
  step: number;
}

export const STATUS_INFO: Record<PathVizNodeStatus, StatusInfo> = {
  planned: { hex: '#64748B', label: 'planned', step: 1 },
  scaffolded: { hex: '#4B8DE0', label: 'scaffolded', step: 2 },
  wired: { hex: '#22B8E6', label: 'wired', step: 3 },
  styled: { hex: '#2EDCB4', label: 'styled', step: 4 },
  tested: { hex: '#6EE86E', label: 'tested', step: 5 },
  shipped: { hex: '#E9F87E', label: 'shipped', step: 6 },
  blocked: { hex: '#ECA83D', label: 'blocked', step: 0 },
  error: { hex: '#F1655A', label: 'error', step: 0 },
};

export const RING_SEGMENTS = 6;

/** One entry per ring segment: whether it's lit, and the color to paint it. */
export interface RingSegment {
  lit: boolean;
  hex: string;
}

/** Pure helper — builds the 6-segment status ring for a node's current status. */
export function ringSegments(status: PathVizNodeStatus): RingSegment[] {
  const info = STATUS_INFO[status];
  return Array.from({ length: RING_SEGMENTS }, (_, i) => ({
    lit: i < info.step,
    hex: info.hex,
  }));
}

// ─── Agent identity — deterministic color hash ─────────────────────────────
// 4 validated accents (from the mockup's in-canvas agent set). Identity is
// never color-alone in the UI — the agent's label is always shown alongside
// the dot/outline, this hash just picks a consistent accent per label.

export const AGENT_ACCENTS = ['#FF66C4', '#8FA0FF', '#DCE7F0', '#E8927C'] as const;

export function agentColor(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return AGENT_ACCENTS[hash % AGENT_ACCENTS.length];
}

// ─── Claim outline — 1 claim = that agent's color; 2+ = contested amber ────
// A node with an active claim gets a colored outline; overlapping claims from
// different agents ("contested") get a dashed amber outline instead of
// picking one agent's color arbitrarily.

export const CONTESTED_HEX = '#ECA83D'; // matches STATUS_INFO.blocked.hex

export interface ClaimVisual {
  outlineColor: string;
  outlineStyle: 'solid' | 'dashed';
  contested: boolean;
  /** Label shown in the claim tag — single agent's label, or "N agents". */
  tagLabel: string;
}

export function claimVisual(claims: PathVizClaim[]): ClaimVisual | null {
  if (claims.length === 0) return null;
  if (claims.length === 1) {
    return {
      outlineColor: agentColor(claims[0].agentLabel),
      outlineStyle: 'solid',
      contested: false,
      tagLabel: claims[0].agentLabel,
    };
  }
  return {
    outlineColor: CONTESTED_HEX,
    outlineStyle: 'dashed',
    contested: true,
    tagLabel: `${claims.length} agents`,
  };
}

// ─── Lane layout constants ─────────────────────────────────────────────────
// kind -> lane row. screen/component/test share row 0 (tests render "near
// UI" per the mockup's lane labels); api is its own row; job+infra share a
// row; schema+service share the data row.

export const LANE_BY_KIND: Record<string, number> = {
  screen: 0,
  component: 0,
  test: 0,
  api: 1,
  job: 2,
  infra: 2,
  schema: 3,
  service: 3,
};

export const LANE_LABELS = ['UI · Tests', 'API', 'Jobs · Infra', 'Data · Services'] as const;

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'no activity yet';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'no activity yet';
  const diffMs = Date.now() - then;
  const diffSec = Math.max(0, Math.round(diffMs / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

/** LIVE badge threshold — matches the spec's "lastEventAt < 2 min" rule. */
export const LIVE_THRESHOLD_MS = 2 * 60 * 1000;

export function isLive(lastEventAt: string | null): boolean {
  if (!lastEventAt) return false;
  const then = new Date(lastEventAt).getTime();
  if (Number.isNaN(then)) return false;
  return Date.now() - then < LIVE_THRESHOLD_MS;
}

// ─── Phase 5/6 animation class lookup ──────────────────────────────────────
// Maps usePathVizLiveReplay.ts's per-node animation hint ('flash' | 'shake')
// to the CSS class defined in pathviz-animation-styles.tsx. Kept here so
// every node renderer in pathviz-node-types.tsx applies the same mapping
// rather than re-deriving it (and so tests only need this one function to
// know the class names are wired correctly).

export type PathVizNodeAnimation = 'flash' | 'shake' | undefined;

export function nodeAnimationClassName(animation: PathVizNodeAnimation): string {
  if (animation === 'flash') return 'pv-flash';
  if (animation === 'shake') return 'pv-shake';
  return '';
}
