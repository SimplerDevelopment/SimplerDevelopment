'use client';

// Presence beacon — rendered as a non-interactive reactflow node (see
// PathChartCanvas.tsx's `presenceBeacons` prop), not an overlay div, so it
// pans/zooms with the world exactly like every other canvas element. One
// beacon per live agent, offset by `index` (see
// pathviz-graph-projection.ts's PresenceBeaconVM) so two agents on the same
// node don't fully overlap.

import type { NodeProps } from 'reactflow';
import { THEME } from './pathviz-theme';

export interface PathVizBeaconData {
  agentLabel: string;
  action: string | null;
  color: string;
}

const BEACON_OFFSET_PX = 20;

/** Per-agent-index translation offset — kept separate from layout so PathChartCanvas can compute node position + this offset independently. */
export function beaconOffset(index: number): { dx: number; dy: number } {
  return { dx: index * BEACON_OFFSET_PX, dy: (index % 2 === 0 ? 1 : -1) * (6 + index * 4) };
}

export function BeaconNode({ data }: NodeProps<PathVizBeaconData>) {
  const { agentLabel, action, color } = data;
  return (
    <div
      data-testid={`pathviz-beacon-${agentLabel}`}
      className="relative flex items-center justify-center pv-beacon-fade-in"
      style={{ width: 14, height: 14, pointerEvents: 'none' }}
    >
      <span className="pv-beacon-radar" style={beaconRingStyle(color)} />
      <span className="pv-beacon-radar pv-beacon-radar-2" style={beaconRingStyle(color)} />
      <span className="pv-beacon-radar pv-beacon-radar-3" style={beaconRingStyle(color)} />
      <span
        className="rounded-full"
        style={{ width: 7, height: 7, background: color, boxShadow: `0 0 6px ${color}` }}
      />
      <span
        className="absolute left-1/2 -translate-x-1/2 -top-5 whitespace-nowrap text-[8.5px] font-mono px-1.5 py-0.5 rounded-full border"
        style={{ borderColor: color, color: THEME.ink, background: THEME.panel2 }}
      >
        <b>{agentLabel}</b>
        {action ? ` · ${action}` : ''}
      </span>
    </div>
  );
}

function beaconRingStyle(color: string): React.CSSProperties {
  return {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: '9999px',
    border: `1.5px solid ${color}`,
    pointerEvents: 'none',
  };
}

export default BeaconNode;
