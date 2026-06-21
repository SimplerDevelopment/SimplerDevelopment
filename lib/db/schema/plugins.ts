// Plugin registry — installable remote applications proxied under
// /portal/apps/<slug>/*. The portal stays the source of truth for auth,
// billing/entitlement, nav, and audit; the remote plugin owns its own UI and
// deploy cadence. Each plugin row pairs with 1+ rotatable HMAC signing keys
// (registered_app_signing_keys), produces a callback audit trail
// (registered_app_callbacks_audit, jti UNIQUE for replay dedup), and queues
// work through registered_app_runs (one row per execution) and
// registered_app_jobs (weekly schedules). Plugin-specific result tables
// (postcaptain_briefs, postcaptain_drafts) are cross-referenced from
// registered_app_runs.resultId via the kind discriminator.

import {
  pgTable,
  serial,
  bigserial,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { clients, services } from './sites';

// ─── registered_apps ────────────────────────────────────────────────────────
// One row per installable plugin. status='active' is the gate the middleware
// uses to mint JWTs; visibility + allowedClientIds drive entitlement.

export const registeredApps = pgTable('registered_apps', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 64 }).notNull().unique(), // 'postcaptain-tools'
  name: varchar('name', { length: 255 }).notNull(),
  icon: varchar('icon', { length: 64 }), // material icon name, e.g. 'science'
  hostUrl: varchar('host_url', { length: 500 }).notNull(), // https://postcaptain-tools.simplerdevelopment.com
  manifestUrl: varchar('manifest_url', { length: 500 }).notNull(), // <hostUrl>/sd-manifest.json
  navLabel: varchar('nav_label', { length: 64 }), // optional sidebar override
  navPosition: integer('nav_position').default(50).notNull(),
  defaultScopes: jsonb('default_scopes').$type<string[]>().default([]).notNull(),
  billingServiceId: integer('billing_service_id').references(() => services.id, { onDelete: 'set null' }),
  visibility: varchar('visibility', { length: 20 }).default('allowlist').notNull(), // 'allowlist' | 'entitled' | 'global'
  allowedClientIds: jsonb('allowed_client_ids').$type<number[]>().default([]).notNull(),
  status: varchar('status', { length: 20 }).default('draft').notNull(), // 'draft' | 'active' | 'disabled'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── registered_app_signing_keys ────────────────────────────────────────────
// Rotatable HMAC keys per plugin. The active key signs; all non-revoked keys
// verify (the JWT header carries `kid` so we can pick the right one). The
// raw secret is never persisted — `secretEncrypted` holds AES-GCM ciphertext
// keyed by env PORTAL_KMS_KEY; `secretHash` is a fingerprint for rotation
// auditing.

export const registeredAppSigningKeys = pgTable('registered_app_signing_keys', {
  id: serial('id').primaryKey(),
  appId: integer('app_id').notNull().references(() => registeredApps.id, { onDelete: 'cascade' }),
  kid: varchar('kid', { length: 32 }).notNull(),
  secretHash: varchar('secret_hash', { length: 255 }).notNull(),
  secretEncrypted: text('secret_encrypted').notNull(),
  algo: varchar('algo', { length: 16 }).default('HS256').notNull(),
  status: varchar('status', { length: 16 }).default('active').notNull(), // 'active' | 'retiring' | 'revoked'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  rotatedAt: timestamp('rotated_at'),
}, (t) => [
  uniqueIndex('registered_app_signing_keys_app_kid_uq').on(t.appId, t.kid),
  index('registered_app_signing_keys_app_status_idx').on(t.appId, t.status),
]);

// ─── registered_app_callbacks_audit ─────────────────────────────────────────
// Every cross-origin callback persisted. `jti` is UNIQUE to dedup replays —
// a conflict on insert means the JWT has already been seen, and the handler
// must respond 409. Uses bigserial because audit volume can grow large.

export const registeredAppCallbacksAudit = pgTable('registered_app_callbacks_audit', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  appId: integer('app_id').notNull().references(() => registeredApps.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  jti: varchar('jti', { length: 64 }).notNull().unique(),
  route: varchar('route', { length: 255 }).notNull(),
  method: varchar('method', { length: 8 }).notNull(),
  status: integer('status').notNull(),
  requestId: varchar('request_id', { length: 64 }),
  ts: timestamp('ts').defaultNow().notNull(),
}, (t) => [
  index('registered_app_callbacks_audit_app_client_idx').on(t.appId, t.clientId),
  index('registered_app_callbacks_audit_ts_idx').on(t.ts),
]);

// ─── registered_app_runs ────────────────────────────────────────────────────
// Execution log. Doubles as the work queue: rows start `status='queued'`,
// the per-minute drain cron CAS-claims to `running`, then transitions to
// `succeeded`/`failed`/`cancelled`. `resultId` cross-references the
// kind-specific result table (postcaptain_briefs / postcaptain_drafts) via
// the `kind` discriminator. `logTail` is capped at 64 KB by the runner and
// redacted before persist.

export const registeredAppRuns = pgTable('registered_app_runs', {
  id: serial('id').primaryKey(),
  appId: integer('app_id').notNull().references(() => registeredApps.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  jobId: integer('job_id'), // FK to registered_app_jobs added below at job-table level to avoid circular ref
  kind: varchar('kind', { length: 64 }).notNull(), // 'research-brief' | 'draft-blog-post'
  args: jsonb('args').$type<Record<string, unknown>>().default({}).notNull(),
  status: varchar('status', { length: 16 }).default('queued').notNull(), // 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  startedAt: timestamp('started_at'),
  finishedAt: timestamp('finished_at'),
  exitCode: integer('exit_code'),
  logTail: text('log_tail'),
  errorSummary: text('error_summary'),
  resultId: integer('result_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('registered_app_runs_app_client_idx').on(t.appId, t.clientId),
  index('registered_app_runs_status_idx').on(t.status),
  index('registered_app_runs_job_idx').on(t.jobId),
]);

// ─── registered_app_jobs ────────────────────────────────────────────────────
// Recurring schedules. Two mutually-exclusive modes:
//   weekly mode: `dayOfWeek` (0..6, Sun=0) + `timeUtc` (HH:mm)
//   cron mode:   `cronExpr` (5-field UTC cron expression, parsed via
//                cron-parser — the same lib `lib/automation/schedule.ts` uses)
// Exactly one mode is populated per row; jobs.ts enforces this at write
// time. The per-minute jobs-tick cron CAS-claims jobs where enabled=true AND
// nextRunAt<=now(), enqueues a run, then bumps nextRunAt to the next slot
// computed from whichever mode is set.

export const registeredAppJobs = pgTable('registered_app_jobs', {
  id: serial('id').primaryKey(),
  appId: integer('app_id').notNull().references(() => registeredApps.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  kind: varchar('kind', { length: 64 }).notNull(), // mirrors registered_app_runs.kind
  args: jsonb('args').$type<Record<string, unknown>>().default({}).notNull(),
  // Weekly mode (nullable when cronExpr is set).
  dayOfWeek: integer('day_of_week'), // 0..6 (Sun=0)
  timeUtc: varchar('time_utc', { length: 5 }), // 'HH:mm'
  // Cron mode (nullable when weekly mode is set).
  cronExpr: varchar('cron_expr', { length: 64 }), // 5-field cron, UTC
  enabled: boolean('enabled').default(true).notNull(),
  // timestamptz so reads round-trip to the correct UTC epoch regardless of PG
  // session timezone — lets fire-due-jobs' exact-match CAS claim work reliably.
  nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull(),
  lastRunAt: timestamp('last_run_at'),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('registered_app_jobs_app_client_idx').on(t.appId, t.clientId),
  index('registered_app_jobs_next_run_at_idx').on(t.nextRunAt),
  index('registered_app_jobs_enabled_next_run_at_idx').on(t.enabled, t.nextRunAt),
]);

// ─── postcaptain_briefs ─────────────────────────────────────────────────────
// Research brief output — produced by `research-brief` and
// `competitor-research` runs. `body` is markdown; `sources` are citations
// returned by Anthropic's web_search_20250305 tool. `meta` is a free-form
// jsonb bag for kind-specific structured data — e.g. `competitor-research`
// stores a `vulnerability: { score: HIGH|MED|LOW, dims: {...} }` block here
// so Wave 4 can detect score changes between two consecutive briefs.

export type CompetitorVulnerability = {
  score: 'HIGH' | 'MED' | 'LOW';
  dims?: {
    clarity?: 'HIGH' | 'MED' | 'LOW';
    differentiation?: 'HIGH' | 'MED' | 'LOW';
    proof?: 'HIGH' | 'MED' | 'LOW';
    consistency?: 'HIGH' | 'MED' | 'LOW';
    specificity?: 'HIGH' | 'MED' | 'LOW';
  };
  rationale?: string;
};

export type PostcaptainBriefMeta = {
  competitorSlug?: string;
  depth?: 'news' | 'deep';
  lookbackDays?: number;
  vulnerability?: CompetitorVulnerability;
  // Open-ended — handlers can write additional structured signal as they
  // see fit. Wave 4 reads vulnerability; other consumers should be defensive.
  [key: string]: unknown;
};

export const postcaptainBriefs = pgTable('postcaptain_briefs', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  runId: integer('run_id').notNull().references(() => registeredAppRuns.id, { onDelete: 'cascade' }),
  topic: varchar('topic', { length: 255 }).notNull(),
  focus: text('focus'),
  body: text('body').notNull(),
  sources: jsonb('sources').$type<{ url: string; title: string }[]>().default([]).notNull(),
  meta: jsonb('meta').$type<PostcaptainBriefMeta>().default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('postcaptain_briefs_client_idx').on(t.clientId),
  index('postcaptain_briefs_run_idx').on(t.runId),
]);

// ─── postcaptain_drafts ─────────────────────────────────────────────────────
// Blog post draft — the result row produced by a 'draft-blog-post' run.
// Optionally references the brief that seeded it.

export const postcaptainDrafts = pgTable('postcaptain_drafts', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  runId: integer('run_id').notNull().references(() => registeredAppRuns.id, { onDelete: 'cascade' }),
  briefId: integer('brief_id').references(() => postcaptainBriefs.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body').notNull(),
  status: varchar('status', { length: 20 }).default('draft').notNull(), // 'draft' | 'published-elsewhere'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('postcaptain_drafts_client_idx').on(t.clientId),
  index('postcaptain_drafts_run_idx').on(t.runId),
]);

// ─── Inferred types ─────────────────────────────────────────────────────────

export type RegisteredApp = typeof registeredApps.$inferSelect;
export type NewRegisteredApp = typeof registeredApps.$inferInsert;

export type RegisteredAppSigningKey = typeof registeredAppSigningKeys.$inferSelect;
export type NewRegisteredAppSigningKey = typeof registeredAppSigningKeys.$inferInsert;

export type RegisteredAppCallbackAudit = typeof registeredAppCallbacksAudit.$inferSelect;
export type NewRegisteredAppCallbackAudit = typeof registeredAppCallbacksAudit.$inferInsert;

export type RegisteredAppRun = typeof registeredAppRuns.$inferSelect;
export type NewRegisteredAppRun = typeof registeredAppRuns.$inferInsert;

export type RegisteredAppJob = typeof registeredAppJobs.$inferSelect;
export type NewRegisteredAppJob = typeof registeredAppJobs.$inferInsert;

export type PostcaptainBrief = typeof postcaptainBriefs.$inferSelect;
export type NewPostcaptainBrief = typeof postcaptainBriefs.$inferInsert;

export type PostcaptainDraft = typeof postcaptainDrafts.$inferSelect;
export type NewPostcaptainDraft = typeof postcaptainDrafts.$inferInsert;
