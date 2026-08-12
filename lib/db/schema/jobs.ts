// Internal background-work queue.
//
// Deliberately SEPARATE from `automation_jobs` (lib/db/schema/brain.ts), which
// looks like it could host this work but cannot: its rows are keyed by an
// `AUTOMATION_EVENTS` name, and `client_websites`-scoped `site_webhooks` may
// subscribe with '*' (lib/db/schema/sites.ts). Putting `pod.submit` on that bus
// would ship internal job payloads to tenant webhook endpoints and list them in
// the automation-rule builder's event picker. Same state machine, different
// blast radius — hence a sibling table.
//
// The state machine (pending → running → completed | pending-with-backoff |
// dead_letter) is drained by app/api/cron/process-internal-jobs. See
// lib/jobs/index.ts for the handlers and the drain loop.

import { pgTable, serial, varchar, integer, json, text, timestamp, index } from 'drizzle-orm/pg-core';
import { clients } from './sites';

/** Job types handled by lib/jobs. Adding one here without a handler entry
 *  dead-letters every row of that type — the two move together. */
export type InternalJobType = 'pod.submit';

export type InternalJobStatus = 'pending' | 'running' | 'completed' | 'dead_letter';

export const internalJobs = pgTable('internal_jobs', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 60 }).$type<InternalJobType>().notNull(),
  payload: json('payload').$type<Record<string, unknown>>().notNull(),
  status: varchar('status', { length: 20 }).$type<InternalJobStatus>().default('pending').notNull(),
  attemptCount: integer('attempt_count').default(0).notNull(),
  /** Dual-purpose, exactly as in automation_jobs: on a 'pending' row it is the
   *  earliest retry time; on a 'running' row it is the lease expiry. */
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  error: text('error'),
  /**
   * Caller-supplied idempotency key, unique across the whole table (NULLs are
   * exempt — Postgres allows many). Enqueue does ON CONFLICT DO NOTHING, so a
   * retried producer cannot create a second job for the same unit of work.
   *
   * This is load-bearing for POD, not hygiene: Stripe retries webhooks, and two
   * concurrent `pod.submit` rows for one order could both pass submitPODOrder's
   * `printfulOrderId` guard and print the garment twice. The store owner pays
   * for that. Key format is `<type>:<entity id>`.
   */
  dedupeKey: varchar('dedupe_key', { length: 200 }).unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
}, (t) => [
  // Drives the drain query: status + due-time, oldest first.
  index('internal_jobs_due_idx').on(t.status, t.nextRetryAt),
]);

export type InternalJob = typeof internalJobs.$inferSelect;
export type NewInternalJob = typeof internalJobs.$inferInsert;
