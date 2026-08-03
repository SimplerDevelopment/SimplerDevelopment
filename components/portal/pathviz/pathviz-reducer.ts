// Path Visualizations ("Dev Paths") — Phase 5/6 pure event reducer.
//
// This is the ONE reducer shared by the live view and the replay scrubber
// (docs/design/path-visualizations-mockup-v3.html §4 `stateAt(T)` is the
// reference — this is its production translation). Same events applied in
// the same order always produce the same GraphState (see
// tests/unit/pathviz-reducer.test.ts's determinism test) — no wall-clock
// reads, no randomness, no DB calls in here.
//
// Two callers, one function set:
//   - LIVE:   seedGraphStateFromSnapshot(snapshot) once, then applyEvent()
//             per SSE message as it arrives (usePathChartStream.ts).
//   - REPLAY: foldEvents(fullLog, uptoId) from empty every time the scrubber
//             cursor moves (ReplayScrubber.tsx / usePathVizLiveReplay.ts).
//
// Wire vocabulary (from lib/mcp/tools/pathviz*.ts — the payload shapes are
// intentionally slim; see the per-branch comments below for what each event
// type does NOT carry and how that's handled):
//   chart.created {title, appLabel} · chart.updated {..patch} ·
//   chart.archived {..patch} · node.upserted {key,kind,label,status,parentKey} ·
//   node.status {key,status,note} · node.removed {key} ·
//   edge.upserted {id,sourceKey,targetKey,kind,label} · edge.removed {id,sourceKey,targetKey,kind} ·
//   agent.touch {nodeKey,action} · claim {nodeKey,intent,files,ttlMinutes} ·
//   release {nodeKey,note} · conflict {nodeKeys,agents,files} ·
//   note {nodeKey,text}

import type {
  PathVizEdgeKind,
  PathVizNodeKind,
  PathVizNodeMeta,
  PathVizNodeStatus,
  PathVizPosition,
  PathVizSnapshot,
} from './types';

// ─── Wire event shape ───────────────────────────────────────────────────────
// Matches both the /events route's rows and each SSE `data:` payload — see
// app/api/portal/path-charts/[id]/{events,stream}/route.ts's `StreamedEvent`.
// `createdAt` crosses the fetch()/EventSource boundary as an ISO string, same
// reasoning as types.ts's header comment.

export interface PathVizStreamEvent {
  id: number;
  eventType: string;
  payload: unknown;
  agentLabel: string | null;
  createdAt: string;
}

// ─── GraphState node/edge/claim/presence/note shapes ───────────────────────
// Keyed by the string `key`/`nodeKey` the wire events actually use — NOT by
// the numeric DB id, which most event payloads never carry (node.upserted
// and edge.upserted in particular). `id` fields below are either the real DB
// id (known only when seeded from a snapshot) or a synthetic negative one
// assigned the first time this reducer ever sees the key/edge — good enough
// identity for canvas rendering, but see the edge.removed branch for the one
// case this can't fully resolve.

export interface GraphNodeState {
  id: number;
  key: string;
  kind: PathVizNodeKind;
  label: string;
  status: PathVizNodeStatus;
  parentKey: string | null;
  // Never carried by node.upserted/node.status events — only known when a
  // node was present in the seed snapshot. A node born purely from a live or
  // replayed event keeps these at their empty defaults until the next full
  // snapshot fetch (page reload / reconnect-from-scratch).
  routePath: string | null;
  filePath: string | null;
  meta: PathVizNodeMeta;
  position: PathVizPosition | null;
  lastVerifiedAt: string | null;
  bornAtMs: number;
  statusChangedAtMs: number;
  createdAtIso: string;
}

export interface GraphEdgeState {
  edgeKey: string; // `${sourceKey}::${targetKey}::${kind}` — matches the DB's own unique target
  id: number;
  sourceKey: string;
  targetKey: string;
  kind: PathVizEdgeKind;
  label: string | null;
  meta: Record<string, unknown> | null;
  bornAtMs: number;
  createdAtIso: string;
}

export interface ClaimState {
  id: number;
  nodeKey: string;
  agentLabel: string;
  intent: string | null;
  files: string[];
  ttlMinutes: number;
  createdAtMs: number;
  expiresAtMs: number;
  createdAtIso: string;
}

export interface PresenceState {
  agentLabel: string;
  nodeKey: string;
  action: string | null;
  atMs: number;
}

export interface NoteEntry {
  agentLabel: string | null;
  text: string;
  atMs: number;
  atIso: string;
}

export interface StatusHistoryEntry {
  atMs: number;
  atIso: string;
  status: PathVizNodeStatus;
  agentLabel: string | null;
  note: string | null;
}

export interface ChartMetaState {
  title: string | null;
  appLabel: string | null;
  status: 'active' | 'archived';
}

export interface GraphState {
  nodes: Map<string, GraphNodeState>;
  edges: Map<string, GraphEdgeState>;
  /** Real edge DB id -> edgeKey, populated only from a snapshot seed (see edge.removed below). */
  edgeIdToKey: Map<number, string>;
  /** nodeKey -> every currently-active claim on it (2+ entries = contested). */
  claims: Map<string, ClaimState[]>;
  /** agentLabel -> that agent's most recent touch. */
  presence: Map<string, PresenceState>;
  /** nodeKey -> its note thread, chronological. */
  notes: Map<string, NoteEntry[]>;
  /** nodeKey -> its status transitions, chronological. */
  statusHistory: Map<string, StatusHistoryEntry[]>;
  chart: ChartMetaState | null;
  /** Highest event id applied so far — also this state's "resume point." */
  lastEventId: number;
  eventsApplied: number;
  conflictsSeen: number;
  /** Internal monotonic counter for synthesizing ids; always <= -1. */
  nextSyntheticId: number;
}

export function createEmptyGraphState(): GraphState {
  return {
    nodes: new Map(),
    edges: new Map(),
    edgeIdToKey: new Map(),
    claims: new Map(),
    presence: new Map(),
    notes: new Map(),
    statusHistory: new Map(),
    chart: null,
    lastEventId: 0,
    eventsApplied: 0,
    conflictsSeen: 0,
    nextSyntheticId: -1,
  };
}

/**
 * Seeds a GraphState from the Phase 3/4 snapshot API response — the LIVE
 * path's starting point ("state at lastEventId"). Preserves every field the
 * event stream itself can never carry (routePath, filePath, meta, position,
 * lastVerifiedAt, real DB ids) so a node that already existed before the
 * client connected renders exactly as Phase 4 already does.
 */
export function seedGraphStateFromSnapshot(snapshot: PathVizSnapshot): GraphState {
  const state = createEmptyGraphState();
  const nodes = new Map<string, GraphNodeState>();
  for (const n of snapshot.nodes) {
    const bornAtMs = new Date(n.createdAt).getTime();
    nodes.set(n.key, {
      id: n.id,
      key: n.key,
      kind: n.kind,
      label: n.label,
      status: n.status,
      parentKey: null, // resolved lazily at projection time by numeric parentNodeId below
      routePath: n.routePath,
      filePath: n.filePath,
      meta: n.meta,
      position: n.position,
      lastVerifiedAt: n.lastVerifiedAt,
      bornAtMs: Number.isFinite(bornAtMs) ? bornAtMs : Date.now(),
      statusChangedAtMs: Number.isFinite(bornAtMs) ? bornAtMs : Date.now(),
      createdAtIso: n.createdAt,
    });
  }
  // parentKey is stored as a key (events only ever reference parents by key),
  // so resolve each seeded node's numeric parentNodeId back to a key here.
  const idToKey = new Map(snapshot.nodes.map((n) => [n.id, n.key]));
  for (const n of snapshot.nodes) {
    if (n.parentNodeId != null) {
      const node = nodes.get(n.key);
      if (node) node.parentKey = idToKey.get(n.parentNodeId) ?? null;
    }
  }

  const edges = new Map<string, GraphEdgeState>();
  const edgeIdToKey = new Map<number, string>();
  for (const e of snapshot.edges) {
    const sourceKey = idToKey.get(e.sourceNodeId);
    const targetKey = idToKey.get(e.targetNodeId);
    if (!sourceKey || !targetKey) continue; // dangling reference — defensive, shouldn't happen
    const edgeKey = makeEdgeKey(sourceKey, targetKey, e.kind);
    const bornAtMs = new Date(e.createdAt).getTime();
    edges.set(edgeKey, {
      edgeKey,
      id: e.id,
      sourceKey,
      targetKey,
      kind: e.kind,
      label: e.label,
      meta: e.meta,
      bornAtMs: Number.isFinite(bornAtMs) ? bornAtMs : Date.now(),
      createdAtIso: e.createdAt,
    });
    edgeIdToKey.set(e.id, edgeKey);
  }

  const claims = new Map<string, ClaimState[]>();
  for (const c of snapshot.activeClaims) {
    const nodeKey = idToKey.get(c.nodeId);
    if (!nodeKey) continue;
    const list = claims.get(nodeKey) ?? [];
    const createdAtMs = new Date(c.createdAt).getTime();
    list.push({
      id: c.id,
      nodeKey,
      agentLabel: c.agentLabel,
      intent: c.intent,
      files: c.files,
      ttlMinutes: Math.max(1, Math.round((new Date(c.expiresAt).getTime() - createdAtMs) / 60_000)),
      createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
      expiresAtMs: new Date(c.expiresAt).getTime(),
      createdAtIso: c.createdAt,
    });
    claims.set(nodeKey, list);
  }

  return {
    ...state,
    nodes,
    edges,
    edgeIdToKey,
    claims,
    chart: {
      title: snapshot.chart.title,
      appLabel: snapshot.chart.appLabel,
      status: snapshot.chart.status,
    },
    lastEventId: snapshot.lastEventId ?? 0,
  };
}

// ─── Small immutable-update helpers (copy-on-write, structural sharing) ────

function setIn<K, V>(map: Map<K, V>, key: K, value: V): Map<K, V> {
  const next = new Map(map);
  next.set(key, value);
  return next;
}

function deleteIn<K, V>(map: Map<K, V>, key: K): Map<K, V> {
  if (!map.has(key)) return map;
  const next = new Map(map);
  next.delete(key);
  return next;
}

function pushIn<K, V>(map: Map<K, V[]>, key: K, value: V): Map<K, V[]> {
  const next = new Map(map);
  next.set(key, [...(next.get(key) ?? []), value]);
  return next;
}

export function makeEdgeKey(sourceKey: string, targetKey: string, kind: string): string {
  return `${sourceKey}::${targetKey}::${kind}`;
}

function eventTimeMs(event: PathVizStreamEvent): number {
  const t = new Date(event.createdAt).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

function synthId(state: GraphState): [number, GraphState] {
  const id = state.nextSyntheticId;
  return [id, { ...state, nextSyntheticId: id - 1 }];
}

function asRecord(payload: unknown): Record<string, unknown> {
  return payload != null && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
}

// ─── The reducer ────────────────────────────────────────────────────────────

/**
 * Applies one event to a GraphState, returning a NEW state (shallow top-level
 * clone; only the Map(s) actually touched are re-created — everything else
 * keeps referential identity, which is what makes this cheap to call once
 * per SSE message). Unknown event types are ignored (forward-compatible).
 *
 * Idempotent by construction: an event whose id is <= state.lastEventId is a
 * no-op, so redelivering (SSE reconnect overlap, an already-applied replay
 * page) never double-counts a claim/note/status-history entry.
 */
export function applyEvent(state: GraphState, event: PathVizStreamEvent): GraphState {
  if (event.id <= state.lastEventId) return state;

  const t = eventTimeMs(event);
  const p = asRecord(event.payload);
  let next: GraphState = { ...state, lastEventId: event.id, eventsApplied: state.eventsApplied + 1 };

  switch (event.eventType) {
    case 'chart.created': {
      next.chart = {
        title: typeof p.title === 'string' ? p.title : next.chart?.title ?? null,
        appLabel: typeof p.appLabel === 'string' ? p.appLabel : null,
        status: 'active',
      };
      break;
    }
    case 'chart.updated':
    case 'chart.archived': {
      const base: ChartMetaState = next.chart ?? { title: null, appLabel: null, status: 'active' };
      next.chart = {
        title: typeof p.title === 'string' ? p.title : base.title,
        appLabel: typeof p.appLabel === 'string' ? p.appLabel : (p.appLabel === null ? null : base.appLabel),
        status: event.eventType === 'chart.archived' ? 'archived' : base.status,
      };
      break;
    }

    case 'node.upserted': {
      const key = String(p.key ?? '');
      if (!key) break;
      const kind = p.kind as PathVizNodeKind;
      const label = String(p.label ?? key);
      const status = (p.status as PathVizNodeStatus) ?? 'planned';
      const parentKey = typeof p.parentKey === 'string' ? p.parentKey : null;
      const existing = state.nodes.get(key);

      if (existing) {
        const statusChanged = existing.status !== status;
        const updated: GraphNodeState = {
          ...existing,
          kind,
          label,
          status,
          parentKey,
          statusChangedAtMs: statusChanged ? t : existing.statusChangedAtMs,
        };
        next.nodes = setIn(state.nodes, key, updated);
        if (statusChanged) {
          next.statusHistory = pushIn(state.statusHistory, key, {
            atMs: t,
            atIso: event.createdAt,
            status,
            agentLabel: event.agentLabel,
            note: null,
          });
        }
      } else {
        let id: number;
        [id, next] = synthId(next);
        const created: GraphNodeState = {
          id,
          key,
          kind,
          label,
          status,
          parentKey,
          routePath: null,
          filePath: null,
          meta: {},
          position: null,
          lastVerifiedAt: null,
          bornAtMs: t,
          statusChangedAtMs: t,
          createdAtIso: event.createdAt,
        };
        next.nodes = setIn(next.nodes, key, created);
        next.statusHistory = pushIn(next.statusHistory, key, {
          atMs: t,
          atIso: event.createdAt,
          status,
          agentLabel: event.agentLabel,
          note: null,
        });
      }
      break;
    }

    case 'node.status': {
      const key = String(p.key ?? '');
      const node = state.nodes.get(key);
      if (!node) break;
      const status = p.status as PathVizNodeStatus;
      const note = typeof p.note === 'string' ? p.note : null;
      if (node.status !== status) {
        next.nodes = setIn(state.nodes, key, {
          ...node,
          status,
          statusChangedAtMs: t,
          // Mirrors the mockup's `n.note = e.note || n.note` — the inspector's
          // "current status note" sticks until a later status carries a new one.
          meta: note ? { ...node.meta, notes: note } : node.meta,
        });
        next.statusHistory = pushIn(state.statusHistory, key, {
          atMs: t,
          atIso: event.createdAt,
          status,
          agentLabel: event.agentLabel,
          note,
        });
      }
      break;
    }

    case 'node.removed': {
      const key = String(p.key ?? '');
      if (!state.nodes.has(key)) break;
      next.nodes = deleteIn(state.nodes, key);
      next.claims = deleteIn(state.claims, key);
      next.statusHistory = deleteIn(state.statusHistory, key);
      next.notes = deleteIn(state.notes, key);
      // Cascade: drop any edge touching the removed node — mirrors the DB's
      // own FK cascade on pathviz_remove.
      let edges = state.edges;
      let edgeIdToKey = state.edgeIdToKey;
      for (const [ek, edge] of state.edges) {
        if (edge.sourceKey === key || edge.targetKey === key) {
          edges = deleteIn(edges, ek);
          if (edgeIdToKey.get(edge.id) === ek) edgeIdToKey = deleteIn(edgeIdToKey, edge.id);
        }
      }
      next.edges = edges;
      next.edgeIdToKey = edgeIdToKey;
      break;
    }

    case 'edge.upserted': {
      const sourceKey = String(p.sourceKey ?? '');
      const targetKey = String(p.targetKey ?? '');
      const kind = String(p.kind ?? '') as PathVizEdgeKind;
      if (!sourceKey || !targetKey) break;
      const edgeKey = makeEdgeKey(sourceKey, targetKey, kind);
      const existing = state.edges.get(edgeKey);
      const label = typeof p.label === 'string' ? p.label : null;
      // Real DB id when the payload carries one (edge.upserted echoes it since
      // the PVIZ-005 payload fix); synthetic fallback for older event logs.
      const realId = typeof p.id === 'number' ? p.id : null;
      if (existing) {
        next.edges = setIn(state.edges, edgeKey, { ...existing, ...(realId != null ? { id: realId } : {}), label });
      } else {
        let id: number;
        if (realId != null) {
          id = realId;
        } else {
          [id, next] = synthId(next);
        }
        next.edges = setIn(next.edges, edgeKey, {
          edgeKey,
          id,
          sourceKey,
          targetKey,
          kind,
          label,
          meta: null,
          bornAtMs: t,
          createdAtIso: event.createdAt,
        });
      }
      if (realId != null) next.edgeIdToKey = setIn(next.edgeIdToKey, realId, edgeKey);
      break;
    }

    case 'edge.removed': {
      const id = typeof p.id === 'number' ? p.id : Number(p.id);
      // Preferred resolution: the payload's node keys + kind (carried since
      // the PVIZ-005 payload fix) — works for edges created purely from
      // live/replayed events. Fallback: the id map, populated by snapshot
      // seeds and id-carrying edge.upserted events.
      const keyFromPayload = p.sourceKey && p.targetKey
        ? makeEdgeKey(String(p.sourceKey), String(p.targetKey), String(p.kind ?? '') as PathVizEdgeKind)
        : null;
      const edgeKey = keyFromPayload && state.edges.has(keyFromPayload)
        ? keyFromPayload
        : state.edgeIdToKey.get(id);
      if (!edgeKey || !state.edges.has(edgeKey)) break;
      next.edges = deleteIn(state.edges, edgeKey);
      next.edgeIdToKey = deleteIn(state.edgeIdToKey, id);
      break;
    }

    case 'agent.touch': {
      if (!event.agentLabel) break;
      const nodeKey = String(p.nodeKey ?? '');
      if (!nodeKey) break;
      next.presence = setIn(state.presence, event.agentLabel, {
        agentLabel: event.agentLabel,
        nodeKey,
        action: typeof p.action === 'string' ? p.action : null,
        atMs: t,
      });
      break;
    }

    case 'claim': {
      if (!event.agentLabel) break;
      const nodeKey = String(p.nodeKey ?? '');
      if (!nodeKey) break;
      let id: number;
      [id, next] = synthId(next);
      const ttlMinutes = typeof p.ttlMinutes === 'number' ? p.ttlMinutes : 30;
      next.claims = pushIn(next.claims, nodeKey, {
        id,
        nodeKey,
        agentLabel: event.agentLabel,
        intent: typeof p.intent === 'string' ? p.intent : null,
        files: Array.isArray(p.files) ? p.files.filter((f): f is string => typeof f === 'string') : [],
        ttlMinutes,
        createdAtMs: t,
        expiresAtMs: t + ttlMinutes * 60_000,
        createdAtIso: event.createdAt,
      });
      break;
    }

    case 'release': {
      if (!event.agentLabel) break;
      const nodeKey = String(p.nodeKey ?? '');
      if (!nodeKey) break;
      const remaining = (state.claims.get(nodeKey) ?? []).filter((c) => c.agentLabel !== event.agentLabel);
      next.claims = remaining.length > 0 ? setIn(state.claims, nodeKey, remaining) : deleteIn(state.claims, nodeKey);
      break;
    }

    case 'note': {
      const nodeKey = String(p.nodeKey ?? '');
      if (!nodeKey) break;
      next.notes = pushIn(state.notes, nodeKey, {
        agentLabel: event.agentLabel,
        text: typeof p.text === 'string' ? p.text : '',
        atMs: t,
        atIso: event.createdAt,
      });
      break;
    }

    case 'conflict': {
      next.conflictsSeen = state.conflictsSeen + 1;
      break;
    }

    default:
      // Forward-compatible: an event type this build doesn't know about yet
      // still advances lastEventId/eventsApplied (already set above) but
      // otherwise leaves the graph untouched.
      break;
  }

  return next;
}

/**
 * REPLAY entry point — folds a full (or partial) event log into a GraphState
 * starting from empty, optionally stopping at (and including) `uptoId`.
 * Defensively sorts by id first so callers never have to guarantee order.
 */
export function foldEvents(events: PathVizStreamEvent[], uptoId?: number): GraphState {
  const ordered = [...events].sort((a, b) => a.id - b.id);
  let state = createEmptyGraphState();
  for (const event of ordered) {
    if (uptoId != null && event.id > uptoId) break;
    state = applyEvent(state, event);
  }
  return state;
}

// ─── Time-aware selectors — "checked lazily" means evaluated here, against a
// caller-supplied reference clock, never proactively pruned by a timer. LIVE
// callers pass Date.now(); REPLAY callers pass the scrubber's cursor time, so
// a claim that "expired" only after the cursor's current position still
// shows as active when scrubbed to that point in history. ─────────────────

/** Active (unexpired) claims per node at `atMs`. Nodes with 0 remaining claims are omitted. */
export function getActiveClaims(state: GraphState, atMs: number): Map<string, ClaimState[]> {
  const result = new Map<string, ClaimState[]>();
  for (const [nodeKey, claims] of state.claims) {
    const live = claims.filter((c) => c.expiresAtMs > atMs);
    if (live.length > 0) result.set(nodeKey, live);
  }
  return result;
}

/** Agents whose most recent touch is within `staleMs` of `atMs` (default 10s — the beacon fade threshold). */
export function getLivePresence(state: GraphState, atMs: number, staleMs = 10_000): Map<string, PresenceState> {
  const result = new Map<string, PresenceState>();
  for (const [agentLabel, presence] of state.presence) {
    if (atMs - presence.atMs < staleMs) result.set(agentLabel, presence);
  }
  return result;
}
