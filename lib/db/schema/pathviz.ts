// Path Visualizations / "Dev Paths": live, agent-authored node-graph charts of
// UI paths (and, per the v2 "Dev Paths" expansion, screens/APIs/schema/services/
// tests/jobs/infra) under construction in a target repo, attached 1:N to portal
// projects. Coding agents declare and update the graph via MCP
// (lib/mcp/tools/pathviz.ts, Phase 2) as they build; the portal renders it as a
// live "mission control" canvas (Phase 3+) that project members can watch
// update in real time and replay from path_chart_events.
//
// Tenancy is inherited via projectId -> projects.clientId (same model as every
// other PM satellite table in ./pm — kanban_cards, sprints, etc.). This module
// is kept separate from pm.ts (already oversized) rather than appended to it.
//
// See vault/05 - Feature Specs/Path Visualizations.md for the full spec
// (data model, MCP tool contracts, UI, v2 "Dev Paths" claims/conflict model).

import {
  pgTable,
  pgEnum,
  serial,
  bigserial,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { projects } from './pm';

// ─── Enums ────────────────────────────────────────────────────────────────

export const pathChartStatusEnum = pgEnum('path_chart_status', [
  'active',
  'archived',
]);

// Widened per the v2 "Dev Paths" expansion (generalizes beyond UI screens to
// all development: api/schema/service/test/job/infra). Kind is data — widening
// this list later is additive and never breaks existing charts.
export const pathChartNodeKindEnum = pgEnum('path_chart_node_kind', [
  'screen',
  'component',
  'api',
  'schema',
  'service',
  'test',
  'job',
  'infra',
]);

export const pathChartNodeStatusEnum = pgEnum('path_chart_node_status', [
  'planned',
  'scaffolded',
  'wired',
  'styled',
  'tested',
  'shipped',
  'blocked',
  'error',
]);

// nav = user navigation between screens; data = node -> service/data call.
export const pathChartEdgeKindEnum = pgEnum('path_chart_edge_kind', [
  'nav',
  'data',
]);

// ─── path_charts ────────────────────────────────────────────────────────────

export const pathCharts = pgTable('path_charts', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  // Which app/repo this chart maps — free text, e.g. "acme-storefront".
  appLabel: varchar('app_label', { length: 120 }),
  status: pathChartStatusEnum('status').default('active').notNull(),
  // Agent label from MCP context at creation time.
  createdByAgent: varchar('created_by_agent', { length: 120 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('path_charts_project_status_idx').on(t.projectId, t.status),
  index('path_charts_project_updated_idx').on(t.projectId, t.updatedAt),
]);

// Declared state shown in the node inspector. Free-shape — the inspector
// renders whichever of these keys an agent populates; unknown extra keys are
// preserved but not specially rendered.
export interface PathChartNodeMeta {
  state?: unknown;
  stores?: unknown;
  props?: unknown;
  calls?: unknown;
  tests?: unknown;
  notes?: string;
  [key: string]: unknown;
}

export interface PathChartNodePosition {
  x: number;
  y: number;
}

// ─── path_chart_nodes ───────────────────────────────────────────────────────

export const pathChartNodes = pgTable('path_chart_nodes', {
  id: serial('id').primaryKey(),
  chartId: integer('chart_id').notNull().references(() => pathCharts.id, { onDelete: 'cascade' }),
  // Stable agent-assigned key — agents address nodes by key, enabling batch
  // upsert. Unique per chart (see uniqueIndex below).
  key: varchar('key', { length: 120 }).notNull(),
  // Screen (superset) contains component nodes. No FK — app-enforced
  // integrity, same precedent as kanban_cards.parentCardId in ./pm.
  parentNodeId: integer('parent_node_id'),
  kind: pathChartNodeKindEnum('kind').notNull(),
  label: varchar('label', { length: 200 }).notNull(),
  // e.g. /checkout/payment (screens).
  routePath: varchar('route_path', { length: 300 }),
  // Claim-checkable code ref.
  filePath: varchar('file_path', { length: 500 }),
  status: pathChartNodeStatusEnum('status').default('planned').notNull(),
  meta: jsonb('meta').$type<PathChartNodeMeta>().default({}).notNull(),
  // Agent override {x,y}; null = auto-layout.
  position: jsonb('position').$type<PathChartNodePosition>(),
  // Reserved for a future audit pass that diffs declarations against real code.
  lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('path_chart_nodes_chart_key_idx').on(t.chartId, t.key),
  index('path_chart_nodes_chart_parent_idx').on(t.chartId, t.parentNodeId),
]);

// ─── path_chart_edges ───────────────────────────────────────────────────────

export const pathChartEdges = pgTable('path_chart_edges', {
  id: serial('id').primaryKey(),
  chartId: integer('chart_id').notNull().references(() => pathCharts.id, { onDelete: 'cascade' }),
  sourceNodeId: integer('source_node_id').notNull().references(() => pathChartNodes.id, { onDelete: 'cascade' }),
  targetNodeId: integer('target_node_id').notNull().references(() => pathChartNodes.id, { onDelete: 'cascade' }),
  kind: pathChartEdgeKindEnum('kind').notNull(),
  // e.g. "on submit", "POST".
  label: varchar('label', { length: 120 }),
  meta: jsonb('meta').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('path_chart_edges_chart_source_target_kind_idx').on(t.chartId, t.sourceNodeId, t.targetNodeId, t.kind),
]);

// ─── path_chart_events ──────────────────────────────────────────────────────
//
// Append-only log. Triple duty: SSE feed (id doubles as Last-Event-ID cursor),
// audit trail, and replay source (the UI's event-reducer folds these to
// rebuild graph state at any point in time). bigserial because agent.touch
// presence heartbeats are persisted too, so volume can grow large — same
// rationale as plugins.ts's audit log. ponytail: add a prune cron for
// agent.touch rows older than 30d when volume matters (deferred, per spec).

export const pathChartEvents = pgTable('path_chart_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  chartId: integer('chart_id').notNull().references(() => pathCharts.id, { onDelete: 'cascade' }),
  // chart.created, chart.updated, chart.archived, node.upserted, node.status,
  // node.removed, edge.upserted, edge.removed, agent.touch (v1); claim,
  // release, conflict, note (v2 "Dev Paths" additions).
  eventType: varchar('event_type', { length: 50 }).notNull(),
  // Enough to apply the event to a client-side graph reducer without refetch.
  payload: jsonb('payload').$type<Record<string, unknown>>().default({}).notNull(),
  agentLabel: varchar('agent_label', { length: 120 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('path_chart_events_chart_id_idx').on(t.chartId, t.id),
]);

// ─── path_chart_claims ──────────────────────────────────────────────────────
//
// v2 "Dev Paths" — soft/advisory file leases for cross-agent coordination.
// Active claim = releasedAt IS NULL AND expiresAt > now(). Overlapping claims
// are warned, not blocked (user-confirmed 2026-07-18); a hard-enforce mode
// stays available as a later per-project toggle.

export const pathChartClaims = pgTable('path_chart_claims', {
  id: serial('id').primaryKey(),
  chartId: integer('chart_id').notNull().references(() => pathCharts.id, { onDelete: 'cascade' }),
  nodeId: integer('node_id').notNull().references(() => pathChartNodes.id, { onDelete: 'cascade' }),
  agentLabel: varchar('agent_label', { length: 120 }).notNull(),
  intent: text('intent'),
  // Paths/globs the agent intends to touch. Conflict detection checks active
  // claims across all charts in the project for node/file overlap.
  files: jsonb('files').$type<string[]>().default([]).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  releasedAt: timestamp('released_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('path_chart_claims_chart_released_idx').on(t.chartId, t.releasedAt),
  // GIN index on the files jsonb array so "who has claims touching these
  // files" (pathviz_who_owns) can use a containment/existence operator
  // instead of a full scan. drizzle-orm 0.45.x's IndexBuilderOn.using()
  // supports arbitrary pg index methods (unlike the HNSW case in brain.ts,
  // this is a plain built-in access method with no WITH() reconciliation
  // footgun for drizzle-kit push).
  index('path_chart_claims_files_gin_idx').using('gin', t.files),
]);
