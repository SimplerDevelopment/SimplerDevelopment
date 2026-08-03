// Path Visualizations / "Dev Paths" — client-side types shared across
// components/portal/pathviz/*.
//
// These mirror the JSON shapes returned by the Phase 3 API routes
// (app/api/portal/projects/[id]/path-charts, app/api/portal/path-charts/[id])
// and lib/db/schema/pathviz.ts's column set — but hand-written rather than
// imported from the Drizzle schema, since timestamp columns come back over
// JSON as ISO strings, not `Date` instances, once they cross the fetch()
// boundary.

export type PathVizNodeKind =
  | 'screen'
  | 'component'
  | 'api'
  | 'schema'
  | 'service'
  | 'test'
  | 'job'
  | 'infra';

export type PathVizNodeStatus =
  | 'planned'
  | 'scaffolded'
  | 'wired'
  | 'styled'
  | 'tested'
  | 'shipped'
  | 'blocked'
  | 'error';

export type PathVizEdgeKind = 'nav' | 'data';

export type PathVizChartStatus = 'active' | 'archived';

// Free-shape declared state shown in the node inspector — the inspector
// renders whichever of these keys an agent populated; unknown extra keys are
// preserved but not specially rendered. Matches PathChartNodeMeta in
// lib/db/schema/pathviz.ts.
export interface PathVizNodeMeta {
  state?: unknown;
  stores?: unknown;
  props?: unknown;
  calls?: unknown;
  tests?: unknown;
  notes?: string;
  [key: string]: unknown;
}

export interface PathVizPosition {
  x: number;
  y: number;
}

export interface PathVizNode {
  id: number;
  chartId: number;
  key: string;
  parentNodeId: number | null;
  kind: PathVizNodeKind;
  label: string;
  routePath: string | null;
  filePath: string | null;
  status: PathVizNodeStatus;
  meta: PathVizNodeMeta;
  position: PathVizPosition | null;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PathVizEdge {
  id: number;
  chartId: number;
  sourceNodeId: number;
  targetNodeId: number;
  kind: PathVizEdgeKind;
  label: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

export interface PathVizClaim {
  id: number;
  chartId: number;
  nodeId: number;
  agentLabel: string;
  intent: string | null;
  files: string[];
  expiresAt: string;
  releasedAt: string | null;
  createdAt: string;
}

// GET /api/portal/projects/:id/path-charts — list row (no nodes/edges, just
// counts + freshness so the gallery can render without a follow-up fetch).
export interface PathVizChartSummary {
  id: number;
  title: string;
  description: string | null;
  appLabel: string | null;
  status: PathVizChartStatus;
  createdByAgent: string | null;
  updatedAt: string;
  nodeCount: number;
  edgeCount: number;
  lastEventAt: string | null;
}

// The `chart` row inside GET /api/portal/path-charts/:id's full snapshot.
export interface PathVizChart {
  id: number;
  projectId: number;
  title: string;
  description: string | null;
  appLabel: string | null;
  status: PathVizChartStatus;
  createdByAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PathVizSnapshot {
  chart: PathVizChart;
  nodes: PathVizNode[];
  edges: PathVizEdge[];
  activeClaims: PathVizClaim[];
  lastEventId: number | null;
}
