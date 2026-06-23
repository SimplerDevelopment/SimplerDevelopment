// Agentic OS: persistence for admin-triggered headless `claude -p` skill runs.
//
// The Agentic OS admin dashboard fires Claude Code skills as subprocess
// invocations. Each invocation is logged here for audit + retry + UX
// (status polling, log tailing). `skillId` references a code-resident
// registry, not a DB table — skills are defined in source, not data.
// `output` is captured stdout, truncated server-side at ~256KB before
// insert/update.

import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { clients } from './sites';
import { mcpPendingChanges } from './approvals';

export const agenticOsRunStatusEnum = pgEnum('agentic_os_run_status', [
  'pending',     // row inserted, exec not started
  'running',     // child process spawned
  'succeeded',   // exit 0
  'failed',      // non-zero exit OR thrown error
  'cancelled',   // user aborted
  'unavailable', // executor disabled / claude not on path
]);

export const agenticOsRuns = pgTable('agentic_os_runs', {
  id: serial('id').primaryKey(),
  // Matches the in-code skill registry id — NOT a FK (registry lives in code).
  skillId: varchar('skill_id', { length: 128 }).notNull(),
  // Rendered prompt actually piped to `claude -p`.
  prompt: text('prompt').notNull(),
  // Raw variable inputs from the form, before rendering.
  variables: jsonb('variables').$type<Record<string, unknown>>(),
  status: agenticOsRunStatusEnum('status').notNull().default('pending'),
  // Captured stdout (truncated server-side if >256KB).
  output: text('output'),
  exitCode: integer('exit_code'),
  errorMessage: text('error_message'),
  durationMs: integer('duration_ms'),
  // Hostname where exec ran, for debugging which box owned the run.
  host: varchar('host', { length: 64 }),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  // Which tenant this run was scoped to (nullable for admin-only runs).
  clientId: integer('client_id').references(() => clients.id, { onDelete: 'set null' }),
  // UUID injected as AGENTIC_RUN_ID env var into the child process; carried into
  // PortalMcpContext so every tool call in the run can be correlated back here.
  runId: varchar('run_id', { length: 36 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
}, (table) => [
  index('agentic_os_runs_created_at_idx').on(table.createdAt),
  index('agentic_os_runs_skill_id_idx').on(table.skillId),
  index('agentic_os_runs_status_idx').on(table.status),
  index('agentic_os_runs_client_id_idx').on(table.clientId),
  index('agentic_os_runs_run_id_idx').on(table.runId),
]);

export type AgenticOsRun = typeof agenticOsRuns.$inferSelect;
export type NewAgenticOsRun = typeof agenticOsRuns.$inferInsert;

// ─── Agent-action audit log ──────────────────────────────────────────────────
//
// Durable, per-tenant log of every MCP tool invocation by an AI agent.
// Unlike mcp_tool_calls (telemetry, 14-day TTL, byte counts), this table
// captures redacted inputs + output summary and is retained indefinitely.
// runId NULL means an interactive key call (not part of an agentic run).

export const agentAuditLogs = pgTable('agent_action_logs', {
  id: serial('id').primaryKey(),
  // Tenant — NOT NULL; every row belongs to exactly one client.
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  // UUID matching agentic_os_runs.run_id; null = interactive / non-agent call.
  runId: varchar('run_id', { length: 36 }),
  // Portal API key or OAuth token that authenticated the call.
  apiKeyId: integer('api_key_id'),
  // Authenticated user (may be null for M2M API key calls).
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  toolName: varchar('tool_name', { length: 100 }).notNull(),
  // Scope the tool's requireScope() assertion used (e.g. 'posts:write').
  scopeUsed: varchar('scope_used', { length: 100 }),
  // Redacted tool inputs (secret-bearing keys replaced; >4KB truncated).
  inputsSummary: jsonb('inputs_summary'),
  // First 2KB of the tool's response text.
  outputSummary: text('output_summary'),
  // 'success' | 'denied' | 'error'
  status: varchar('status', { length: 20 }).notNull(),
  errorMessage: text('error_message'),
  durationMs: integer('duration_ms'),
  // Link to mcp_pending_changes if this call staged a write — set after the
  // pending-change row is inserted.
  pendingChangeId: integer('pending_change_id').references(() => mcpPendingChanges.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('agent_audit_logs_client_created_idx').on(table.clientId, table.createdAt),
  index('agent_audit_logs_run_id_idx').on(table.runId),
  index('agent_audit_logs_client_tool_created_idx').on(table.clientId, table.toolName, table.createdAt),
]);

export type AgentAuditLog = typeof agentAuditLogs.$inferSelect;
export type NewAgentAuditLog = typeof agentAuditLogs.$inferInsert;
