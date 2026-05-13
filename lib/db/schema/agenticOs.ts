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
  createdAt: timestamp('created_at').defaultNow().notNull(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
}, (table) => [
  index('agentic_os_runs_created_at_idx').on(table.createdAt),
  index('agentic_os_runs_skill_id_idx').on(table.skillId),
  index('agentic_os_runs_status_idx').on(table.status),
]);

export type AgenticOsRun = typeof agenticOsRuns.$inferSelect;
export type NewAgenticOsRun = typeof agenticOsRuns.$inferInsert;
