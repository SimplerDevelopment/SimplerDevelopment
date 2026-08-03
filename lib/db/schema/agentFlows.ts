// Workflow Designer: a single-table store for agent orchestration flows.
//
// One row = one saved reactflow graph of agent personas (nodes) and their
// handoffs/dependencies (edges), scoped to a project. `clientId` is
// denormalized from the owning project so tenant queries can filter
// directly without a join — it must be stamped from `project.clientId` by
// the API at create time, never taken from the request body. `status` here
// is the flow's lifecycle (draft/active/archived), not an execution state —
// there is no runtime yet (that's a future unit).

import { pgTable, pgEnum, serial, varchar, text, timestamp, integer, jsonb, index, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { clients } from './sites';
import { projects } from './pm';
import type { AgentFlowGraph } from '@/lib/agent-flows/types';

export const agentFlows = pgTable('agent_flows', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 20 }).default('draft').notNull(), // draft | active | archived — lifecycle, NOT execution
  graph: jsonb('graph').$type<AgentFlowGraph>().default({ nodes: [], edges: [] }).notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('agent_flows_project_idx').on(t.projectId),
  index('agent_flows_client_idx').on(t.clientId),
]);

// ─── Executions ─────────────────────────────────────────────────────────────
//
// One row per execution of a flow. Runs are driven by a Claude Code session
// (the runner) reporting progress through MCP write tools — the portal is a
// live VIEWER, not the executor. The columns are deliberately runner-agnostic
// so a future server-side runner can write the same tables without a
// migration; nothing here assumes who is doing the work.
//
// `waiting` is a first-class status, not a flavour of running: a flow parked on
// a human-in-the-loop node is the one state a person actually needs surfacing.

export const agentFlowRunStatusEnum = pgEnum('agent_flow_run_status', [
  'running',    // advancing
  'waiting',    // parked on a human node, needs a person
  'succeeded',  // reached a terminal node
  'failed',     // a node failed and the run stopped
  'abandoned',  // runner went away (session closed) — NOT the same as failed
]);

export const agentFlowRuns = pgTable('agent_flow_runs', {
  id: serial('id').primaryKey(),
  flowId: integer('flow_id').notNull().references(() => agentFlows.id, { onDelete: 'cascade' }),
  // projectId/clientId are denormalized from the flow so the executions list
  // and the SSE channel can filter without a join. clientId is what makes a
  // future portal-wide rollup additive rather than a migration.
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  status: agentFlowRunStatusEnum('status').notNull().default('running'),

  // The graph AS IT WAS at launch. Flows are editable mid-run and runs only
  // advance while their session is alive, so viewing a stalled run later is
  // the normal case — without this it would render against a graph that has
  // since changed and node ids in the event log would stop resolving.
  graph: jsonb('graph').$type<AgentFlowGraph>().notNull(),

  // Sub-flow handoff. A `flow` node starts a child run; the parent node blocks
  // until it finishes. `depth` is denormalized so the start guard can reject a
  // too-deep chain without walking every ancestor.
  parentRunId: integer('parent_run_id').references((): AnyPgColumn => agentFlowRuns.id, { onDelete: 'cascade' }),
  parentNodeId: varchar('parent_node_id', { length: 64 }),
  depth: integer('depth').notNull().default(0),

  // Rollups, so the executions list never has to aggregate the event log.
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),

  startedBy: integer('started_by').references(() => users.id, { onDelete: 'set null' }),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  // Every event bumps this, so a stalled run is detectable by staleness.
  lastEventAt: timestamp('last_event_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('agent_flow_runs_flow_idx').on(t.flowId),
  index('agent_flow_runs_project_idx').on(t.projectId, t.startedAt),
  index('agent_flow_runs_client_idx').on(t.clientId),
  index('agent_flow_runs_parent_idx').on(t.parentRunId),
]);

// Append-only log. This is the source of truth for the live stream: the SSE
// route replays rows newer than a Last-Event-ID and then tails NOTIFY, so ids
// must be monotonic per run. There is deliberately NO per-node state table —
// the client folds this log to derive which node is where (see the run stream
// route for why, and the ceiling that fold has).
export const agentFlowRunEvents = pgTable('agent_flow_run_events', {
  id: serial('id').primaryKey(),
  runId: integer('run_id').notNull().references(() => agentFlowRuns.id, { onDelete: 'cascade' }),
  // run.started | node.status | run.waiting | note | run.finished
  type: varchar('type', { length: 32 }).notNull(),
  // Which node this concerns. Null for run-scoped events.
  nodeId: varchar('node_id', { length: 64 }),
  // For node.status: started | finished | failed | skipped.
  // For run.finished: succeeded | failed | abandoned.
  status: varchar('status', { length: 16 }),
  // Capped hard at the write path — this is pushed to EVERY connected viewer
  // on every event, so full agent output does not belong here.
  summary: text('summary'),
  // Per-node execution facts. `model` is worth storing even though the graph
  // declares one: a run that used a different tier than the node asked for is
  // a real discrepancy, and burying it in prose would hide it.
  model: varchar('model', { length: 32 }),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  durationMs: integer('duration_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // The stream's hot path: everything for one run newer than an id.
  index('agent_flow_run_events_run_idx').on(t.runId, t.id),
]);
