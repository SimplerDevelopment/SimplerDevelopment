// Turns a pathviz-reducer.ts `GraphState` (keyed by string `key`, the wire
// events' native identity) back into the numeric-id-keyed shapes Phase 4's
// PathChartCanvas/NodeInspector already consume (`PathVizNode[]` /
// `PathVizEdge[]` / `PathVizClaim[]`) — so neither of those Phase 4
// components needed to change identity model to go live. Both
// usePathVizLiveReplay.ts (live) and ReplayScrubber-driven replay call these
// same pure functions; that's what keeps "both paths produce consistent
// shapes for the canvas" true by construction rather than by convention.

import { getActiveClaims, type GraphState } from './pathviz-reducer';
import type { PathVizClaim, PathVizEdge, PathVizNode } from './types';

/** One agent's live presence, positioned relative to a node — canvas-ready. */
export interface PresenceBeaconVM {
  agentLabel: string;
  nodeKey: string;
  action: string | null;
  atMs: number;
  /** Stable per-agent ordering (sorted by agentLabel) — the "offset per agent index" the canvas uses to avoid beacon overlap. */
  index: number;
}

function isoAt(ms: number): string {
  return new Date(ms).toISOString();
}

export function projectNodes(state: GraphState, chartId: number): PathVizNode[] {
  const idByKey = new Map<string, number>();
  for (const n of state.nodes.values()) idByKey.set(n.key, n.id);

  return [...state.nodes.values()].map((n) => ({
    id: n.id,
    chartId,
    key: n.key,
    parentNodeId: n.parentKey != null ? idByKey.get(n.parentKey) ?? null : null,
    kind: n.kind,
    label: n.label,
    routePath: n.routePath,
    filePath: n.filePath,
    status: n.status,
    meta: n.meta,
    position: n.position,
    lastVerifiedAt: n.lastVerifiedAt,
    createdAt: n.createdAtIso,
    updatedAt: isoAt(n.statusChangedAtMs),
  }));
}

export function projectEdges(state: GraphState, chartId: number): PathVizEdge[] {
  const idByKey = new Map<string, number>();
  for (const n of state.nodes.values()) idByKey.set(n.key, n.id);

  const result: PathVizEdge[] = [];
  for (const e of state.edges.values()) {
    const sourceNodeId = idByKey.get(e.sourceKey);
    const targetNodeId = idByKey.get(e.targetKey);
    if (sourceNodeId == null || targetNodeId == null) continue; // dangling — defensive only
    result.push({
      id: e.id,
      chartId,
      sourceNodeId,
      targetNodeId,
      kind: e.kind,
      label: e.label,
      meta: e.meta,
      createdAt: e.createdAtIso,
    });
  }
  return result;
}

/** `atMs` is the live "now" or the replay cursor — see pathviz-reducer.ts's getActiveClaims doc. */
export function projectClaims(state: GraphState, chartId: number, atMs: number): PathVizClaim[] {
  const idByKey = new Map<string, number>();
  for (const n of state.nodes.values()) idByKey.set(n.key, n.id);

  const result: PathVizClaim[] = [];
  for (const [nodeKey, claims] of getActiveClaims(state, atMs)) {
    const nodeId = idByKey.get(nodeKey);
    if (nodeId == null) continue;
    for (const c of claims) {
      result.push({
        id: c.id,
        chartId,
        nodeId,
        agentLabel: c.agentLabel,
        intent: c.intent,
        files: c.files,
        expiresAt: isoAt(c.expiresAtMs),
        releasedAt: null,
        createdAt: c.createdAtIso,
      });
    }
  }
  return result;
}

/**
 * Live agents (touch within `staleMs` of `atMs`, default 10s), sorted by
 * agentLabel for a deterministic `index` — the canvas offsets each beacon by
 * `index` to keep multiple agents on the same node from stacking exactly.
 */
export function projectPresenceBeacons(state: GraphState, atMs: number, staleMs = 10_000): PresenceBeaconVM[] {
  const live = [...state.presence.values()].filter((p) => atMs - p.atMs < staleMs);
  live.sort((a, b) => a.agentLabel.localeCompare(b.agentLabel));
  return live.map((p, index) => ({
    agentLabel: p.agentLabel,
    nodeKey: p.nodeKey,
    action: p.action,
    atMs: p.atMs,
    index,
  }));
}
