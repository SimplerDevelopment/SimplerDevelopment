// Hand-rolled lane auto-layout for the Dev Paths canvas — precedent is
// lib/surveys/flow-diagram.ts (pure, side-effect-free graph helpers so unit
// tests can exercise the logic without touching React/reactflow). No new
// layout-library dependency; this is intentionally simple fixed-spacing
// placement, not a force-directed/dagre layout.
//
// Rules (per the Phase 4 spec):
//   - kind -> lane row: screen/component/test -> 0, api -> 1, job/infra -> 2,
//     schema/service -> 3 (see LANE_BY_KIND in pathviz-theme.ts).
//   - Order within a lane follows first-seen order in the input node array.
//   - A node's `position` column (agent override) always wins over the
//     computed slot.
//   - `component` nodes nested under a `screen` node (parentNodeId points at
//     a node of kind 'screen') are NOT placed on the canvas at all — they're
//     rendered as chips inside their parent ScreenNode instead. Everything
//     else (including an orphan `component` with no screen parent) gets its
//     own lane slot.

import { LANE_BY_KIND } from './pathviz-theme';
import type { PathVizNode, PathVizPosition } from './types';

export interface LaneLayoutOptions {
  /** Horizontal width reserved per column (includes the node's own width). */
  columnWidth?: number;
  /** Extra horizontal gap between columns. */
  columnGap?: number;
  /** Left margin before the first column. */
  startX?: number;
  /** Y position of each lane row, indexed by lane number (0-3). */
  laneY?: number[];
}

// Exported so the canvas can align its lane-label overlay nodes to the same
// rows without duplicating (and risking drift from) these numbers.
export const DEFAULT_LANE_Y = [80, 380, 620, 860];

const DEFAULT_OPTIONS: Required<LaneLayoutOptions> = {
  columnWidth: 260,
  columnGap: 40,
  startX: 80,
  laneY: DEFAULT_LANE_Y,
};

export interface LaneLayoutResult {
  /** node.id -> computed (or overridden) {x, y}. Only top-level nodes. */
  positions: Record<number, PathVizPosition>;
  /** node.id -> lane row (0-3). Only top-level nodes. */
  laneOf: Record<number, number>;
  /** parentNodeId -> ordered list of child (nested-in-screen) node ids. */
  childrenByParent: Record<number, number[]>;
  /** Set of node ids that are nested chips, not top-level canvas nodes. */
  nestedNodeIds: Set<number>;
}

function laneForKind(kind: string): number {
  return LANE_BY_KIND[kind] ?? 3;
}

/**
 * Determines whether `node` should render as a chip inside its parent
 * ScreenNode rather than as its own canvas box: it must be a `component`,
 * have a `parentNodeId`, and that parent must exist in this chart and be a
 * `screen`. Everything else — including a `component` with no parent, or one
 * whose parent isn't a screen — gets its own lane slot.
 */
function isNestedInScreen(node: PathVizNode, nodesById: Map<number, PathVizNode>): boolean {
  if (node.kind !== 'component' || node.parentNodeId == null) return false;
  const parent = nodesById.get(node.parentNodeId);
  return !!parent && parent.kind === 'screen';
}

export function computeLaneLayout(
  nodes: PathVizNode[],
  options?: LaneLayoutOptions,
): LaneLayoutResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const nodesById = new Map(nodes.map((n) => [n.id, n]));

  const nestedNodeIds = new Set<number>();
  const childrenByParent: Record<number, number[]> = {};
  const topLevel: PathVizNode[] = [];

  for (const node of nodes) {
    if (isNestedInScreen(node, nodesById)) {
      nestedNodeIds.add(node.id);
      const parentId = node.parentNodeId as number;
      (childrenByParent[parentId] ??= []).push(node.id);
    } else {
      topLevel.push(node);
    }
  }

  // Group top-level nodes by lane, preserving first-seen order within a lane.
  const lanes: PathVizNode[][] = [[], [], [], []];
  for (const node of topLevel) {
    const lane = laneForKind(node.kind);
    (lanes[lane] ??= []).push(node);
  }

  const positions: Record<number, PathVizPosition> = {};
  const laneOf: Record<number, number> = {};

  lanes.forEach((laneNodes, laneIdx) => {
    const y = opts.laneY[laneIdx] ?? opts.laneY[opts.laneY.length - 1];
    laneNodes.forEach((node, columnIdx) => {
      laneOf[node.id] = laneIdx;
      // Agent-declared position always wins over the computed slot.
      positions[node.id] = node.position ?? {
        x: opts.startX + columnIdx * (opts.columnWidth + opts.columnGap),
        y,
      };
    });
  });

  return { positions, laneOf, childrenByParent, nestedNodeIds };
}
