// Cron / scheduled-job health tracking. One row per job (keyed by `name`),
// upserted at start and again at end. Powers /admin/system-health.
//
// Intentionally lightweight: not a full run-history log — just enough state
// to answer "is this job alive, and when did it last error?" in a dashboard.
// If we later need per-run drill-down we'll add a sibling `cron_runs` table.

import { pgTable, serial, varchar, timestamp, integer, text } from 'drizzle-orm/pg-core';

export const cronHealth = pgTable('cron_health', {
  id: serial('id').primaryKey(),
  /** Stable job identifier, e.g. "api-cron:process-embeddings" or
   *  "routine:embeddings-backlog". Unique. */
  name: varchar('name', { length: 200 }).notNull().unique(),
  /** "api-cron" | "routine" | "brain-12" (free-form for now). */
  area: varchar('area', { length: 40 }).notNull(),
  /** Set on every invocation when the handler enters. */
  lastRunAt: timestamp('last_run_at'),
  /** Set when the handler returns successfully. */
  lastSuccessAt: timestamp('last_success_at'),
  /** Truncated error message from the most recent failure. NULL after a
   *  subsequent success. */
  lastError: text('last_error'),
  /** Set when lastError was last written. */
  lastErrorAt: timestamp('last_error_at'),
  /** Monotonic counter — total times the job has started. */
  runCount: integer('run_count').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type CronHealth = typeof cronHealth.$inferSelect;
export type NewCronHealth = typeof cronHealth.$inferInsert;
