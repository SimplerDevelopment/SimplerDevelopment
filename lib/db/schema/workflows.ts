// Visual workflow builder (HighLevel-style trigger → action canvas).
//
// `automation_rules` (in brain.ts) is a single-shot rules engine — given an
// event, run a flat list of actions. `workflows` is the visual layer: a graph
// of typed trigger / action / condition nodes that can branch, wait, and
// chain. The two engines coexist; workflows do not yet listen to live CRM
// events (see lib/workflows/trigger.ts for the shim).

import { pgTable, serial, varchar, text, timestamp, integer, json, index } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { clients } from './sites';
import type {
  WorkflowTriggerConfig,
  WorkflowGraph,
  WorkflowRunContext,
  WorkflowStepInput,
  WorkflowStepOutput,
} from '@/lib/workflows/types';

export const workflows = pgTable('workflows', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  // 'draft' | 'active' | 'paused'
  status: varchar('status', { length: 20 }).default('draft').notNull(),
  trigger: json('trigger').$type<WorkflowTriggerConfig>().notNull(),
  graph: json('graph').$type<WorkflowGraph>().notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const workflowRuns = pgTable('workflow_runs', {
  id: serial('id').primaryKey(),
  workflowId: integer('workflow_id').notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  triggeredBy: text('triggered_by'), // free-form: 'test-run', 'cron', 'webhook:abc', etc.
  // 'pending' | 'running' | 'completed' | 'failed'
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  context: json('context').$type<WorkflowRunContext>().default({}).notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  error: text('error'),
});

export const workflowStepLogs = pgTable('workflow_step_logs', {
  id: serial('id').primaryKey(),
  runId: integer('run_id').notNull().references(() => workflowRuns.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull(),
  action: text('action').notNull(),
  // 'success' | 'failed' | 'skipped'
  status: varchar('status', { length: 20 }).notNull(),
  input: json('input').$type<WorkflowStepInput>(),
  output: json('output').$type<WorkflowStepOutput>(),
  durationMs: integer('duration_ms'),
  occurredAt: timestamp('occurred_at').defaultNow().notNull(),
});

// Mutable step queue — one row per node per run, updated on each attempt.
// Drained by the process-workflow-runs cron (CAS-claim + backoff). The
// append-only audit trail stays in workflowStepLogs above.
export const workflowRunSteps = pgTable('workflow_run_steps', {
  id: serial('id').primaryKey(),
  runId: integer('run_id').notNull().references(() => workflowRuns.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull(), // matches WorkflowNode.id in graph JSON
  action: text('action').notNull(), // WorkflowAction.kind
  // 'pending' | 'running' | 'completed' | 'failed' | 'dead_letter'
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  attemptCount: integer('attempt_count').default(0).notNull(),
  nextRetryAt: timestamp('next_retry_at'), // null = ready immediately
  idempotencyKey: text('idempotency_key'), // set for send_email; format 'wf:{runId}:{nodeId}'
  input: json('input').$type<WorkflowStepInput>(),
  result: json('result').$type<WorkflowStepOutput>(),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  // Cron scan: pending/failed steps due for execution, per tenant, oldest first.
  index('workflow_run_steps_pending_idx').on(t.clientId, t.status, t.nextRetryAt),
]);
