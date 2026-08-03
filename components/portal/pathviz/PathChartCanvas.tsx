'use client';

// The Dev Paths reactflow@11 canvas. Follows the same reactflow usage
// pattern as app/portal/automations/workflows/[id]/page.tsx (default import,
// Background/Controls/MiniMap, `reactflow/dist/style.css`), but read-only:
// Phase 4 is a static snapshot render — no drag, no connect, no live
// updates (that's Phase 5's SSE subscription + animation layer).
//
// Layout is the hand-rolled lane auto-layout from pathviz-layout.ts (no new
// deps — same precedent as lib/surveys/flow-diagram.ts). Custom node shapes
// live in pathviz-node-types.tsx; this file just turns
// (PathVizNode[], PathVizEdge[], PathVizClaim[]) into reactflow's
// Node[]/Edge[] shape and renders the canvas chrome.

import { useCallback, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  type Edge,
  type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { computeLaneLayout, DEFAULT_LANE_Y } from './pathviz-layout';
import { PATHVIZ_NODE_TYPES, type PathVizNodeData } from './pathviz-node-types';
import BeaconNode, { beaconOffset } from './pathviz-beacon-node';
import { makeEdgeKey } from './pathviz-reducer';
import type { PresenceBeaconVM } from './pathviz-graph-projection';
import type { AnimationHints } from './usePathVizLiveReplay';
import { agentColor, LANE_LABELS, STATUS_INFO, THEME } from './pathviz-theme';
import type { PathVizClaim, PathVizEdge, PathVizNode } from './types';

// Re-exported so callers/tests can reach the pure layout helper via the
// canvas module path without also pulling in reactflow.
export { computeLaneLayout } from './pathviz-layout';

// Defined outside the component (reactflow warns if nodeTypes/edgeTypes is a
// new object every render) — merges Phase 4's per-kind renderers with the
// Phase 5 presence-beacon pseudo-node type.
const NODE_TYPES = { ...PATHVIZ_NODE_TYPES, beacon: BeaconNode };

interface PathChartCanvasProps {
  nodes: PathVizNode[];
  edges: PathVizEdge[];
  activeClaims: PathVizClaim[];
  selectedNodeId: number | null;
  onSelectNode: (nodeId: number | null) => void;
  /** Phase 5 — live agents to render as radar-pulse beacons. Omit/empty for a static (Phase 4) render. */
  presenceBeacons?: PresenceBeaconVM[];
  /** Phase 5 — which nodes/edges are within their mount/flash/fade animation window right now. */
  animationHints?: AnimationHints;
}

function buildClaimsByNode(claims: PathVizClaim[]): Map<number, PathVizClaim[]> {
  const map = new Map<number, PathVizClaim[]>();
  for (const claim of claims) {
    const list = map.get(claim.nodeId) ?? [];
    list.push(claim);
    map.set(claim.nodeId, list);
  }
  return map;
}

export default function PathChartCanvas({
  nodes,
  edges,
  activeClaims,
  selectedNodeId,
  onSelectNode,
  presenceBeacons = [],
  animationHints,
}: PathChartCanvasProps) {
  const layout = useMemo(() => computeLaneLayout(nodes), [nodes]);
  const claimsByNode = useMemo(() => buildClaimsByNode(activeClaims), [activeClaims]);
  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const nodesByKey = useMemo(() => new Map(nodes.map((n) => [n.key, n])), [nodes]);

  const rfNodes: Node[] = useMemo(() => {
    // Not `Node<PathVizNodeData>[]` — the lane-label nodes appended below
    // carry a different (plain `{ label }`) data shape, since they're inert
    // text, not chart nodes.
    const result: Node[] = [];

    for (const node of nodes) {
      // Nested `component` chips render inside their parent ScreenNode, not
      // as their own canvas box.
      if (layout.nestedNodeIds.has(node.id)) continue;

      const childIds = layout.childrenByParent[node.id] ?? [];
      const children =
        node.kind === 'screen'
          ? (childIds.map((id) => nodesById.get(id)).filter(Boolean) as PathVizNode[])
          : undefined;

      result.push({
        id: String(node.id),
        type: node.kind,
        position: layout.positions[node.id] ?? { x: 0, y: 0 },
        selected: node.id === selectedNodeId,
        draggable: false,
        connectable: false,
        data: {
          node,
          claims: claimsByNode.get(node.id) ?? [],
          children,
          childClaims: node.kind === 'screen' ? claimsByNode : undefined,
          onSelectChild: onSelectNode,
          mounted: animationHints?.mounted.has(node.key) ?? false,
          animation: animationHints?.flashing.get(node.key),
        },
      });
    }

    // Lane labels — plain text, no border/background, positioned to the
    // left of each row so they pan/zoom with the world like the mockup's
    // `.lane-label` elements (rendered as inert reactflow nodes rather than
    // a fixed overlay, since a fixed overlay wouldn't track panning).
    LANE_LABELS.forEach((label, laneIdx) => {
      result.push({
        id: `lane-label-${laneIdx}`,
        type: 'default',
        position: { x: -18, y: DEFAULT_LANE_Y[laneIdx] + 6 },
        draggable: false,
        selectable: false,
        connectable: false,
        data: { label },
        style: {
          background: 'transparent',
          border: 'none',
          color: THEME.ink3,
          fontFamily: THEME.mono,
          fontSize: 10,
          letterSpacing: '.25em',
          textTransform: 'uppercase',
          padding: 0,
          width: 140,
          boxShadow: 'none',
        },
      });
    });

    return result;
  }, [nodes, layout, claimsByNode, nodesById, onSelectNode, selectedNodeId, animationHints]);

  const rfEdges: Edge[] = useMemo(() => {
    // An edge referencing a nested (chip) node visually lands on that
    // node's parent screen instead, since the chip has no canvas box.
    const renderIdOf = (nodeId: number): string => {
      if (layout.nestedNodeIds.has(nodeId)) {
        const parentId = nodesById.get(nodeId)?.parentNodeId;
        if (parentId != null) return String(parentId);
      }
      return String(nodeId);
    };

    const result: Edge[] = [];
    for (const edge of edges) {
      const source = renderIdOf(edge.sourceNodeId);
      const target = renderIdOf(edge.targetNodeId);
      if (source === target) continue; // self-loop after nested-node remap

      const isNav = edge.kind === 'nav';
      const sourceKey = nodesById.get(edge.sourceNodeId)?.key;
      const targetKey = nodesById.get(edge.targetNodeId)?.key;
      const isRecent =
        !!sourceKey && !!targetKey && !!animationHints?.recentEdgeKeys.has(makeEdgeKey(sourceKey, targetKey, edge.kind));
      result.push({
        id: `e${edge.id}`,
        source,
        target,
        label: edge.label ?? undefined,
        type: 'smoothstep',
        className: isRecent ? 'pv-edge-fade' : undefined,
        style: isNav
          ? { stroke: THEME.lineBright, strokeWidth: 2, strokeDasharray: '7 5' }
          : { stroke: THEME.line, strokeWidth: 1.5, strokeDasharray: '2 4' },
        markerEnd: isNav ? { type: MarkerType.ArrowClosed, color: THEME.lineBright } : undefined,
        labelStyle: { fill: THEME.ink3, fontSize: 9, fontFamily: THEME.mono },
        labelBgStyle: { fill: THEME.panel },
      });
    }
    return result;
  }, [edges, layout, nodesById, animationHints]);

  // Presence beacons — pseudo-nodes so they pan/zoom with the world. A chip
  // nested inside a screen has no canvas box of its own, so its beacon
  // anchors on the parent screen instead (same remap `edgePath` above uses).
  const beaconNodes: Node[] = useMemo(() => {
    const result: Node[] = [];
    for (const beacon of presenceBeacons) {
      const target = nodesByKey.get(beacon.nodeKey);
      if (!target) continue;
      const renderId = layout.nestedNodeIds.has(target.id) ? target.parentNodeId ?? target.id : target.id;
      const pos = layout.positions[renderId];
      if (!pos) continue;
      const { dx, dy } = beaconOffset(beacon.index);
      result.push({
        id: `beacon-${beacon.agentLabel}`,
        type: 'beacon',
        position: { x: pos.x + 12 + dx, y: pos.y - 8 + dy },
        draggable: false,
        selectable: false,
        connectable: false,
        zIndex: 1000,
        data: { agentLabel: beacon.agentLabel, action: beacon.action, color: agentColor(beacon.agentLabel) },
      });
    }
    return result;
  }, [presenceBeacons, nodesByKey, layout]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.id.startsWith('lane-label-') || node.id.startsWith('beacon-')) return;
      onSelectNode(Number(node.id));
    },
    [onSelectNode],
  );

  const handlePaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  return (
    <div data-testid="pathviz-canvas" className="w-full h-full" style={{ minHeight: 480, background: THEME.surface }}>
      <ReactFlow
        nodes={beaconNodes.length > 0 ? [...rfNodes, ...beaconNodes] : rfNodes}
        edges={rfEdges}
        nodeTypes={NODE_TYPES}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color={THEME.line} gap={26} />
        <Controls showInteractive={false} />
        <MiniMap
          maskColor={`${THEME.surface}CC`}
          nodeColor={(n) => {
            const data = n.data as PathVizNodeData | undefined;
            return data?.node ? STATUS_INFO[data.node.status].hex : THEME.lineBright;
          }}
          style={{ background: THEME.panel }}
        />
      </ReactFlow>
    </div>
  );
}
