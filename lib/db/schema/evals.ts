// Prompt registry + eval runs — the data plane behind the Prompt Eval Dashboard.
//
// Prompts become versioned data: `promptRegistry` is one row per prompt
// (keyed by the stable suite/prompt id), `promptVersions` holds the history,
// and production resolves the ACTIVE version at call time (cached, with the
// in-code constant as fallback — see lib/ai/prompt-registry.ts).
//
// Datasets/cases are DB-editable test inputs; runs + case results are the
// time-series the dashboard charts. ADMIN-PLANE ONLY — these are global
// platform tables, never exposed to portal tenants.

import { pgTable, serial, varchar, text, timestamp, boolean, integer, real, json, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { users } from './auth';

// ─── Prompt registry + versions ─────────────────────────────────────────────

export const promptRegistry = pgTable('prompt_registry', {
  id: serial('id').primaryKey(),
  // Stable key, matches the eval suite id / code prompt id (e.g. 'meeting-extractor').
  key: varchar('key', { length: 100 }).notNull().unique(),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  // Soft reference to prompt_versions.id (FK omitted to avoid a definition
  // cycle; the active version is always one of this prompt's versions).
  activeVersionId: integer('active_version_id'),
  // Opt-in scheduled eval cadence (cron expr); null = no schedule.
  scheduleCron: varchar('schedule_cron', { length: 120 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type PromptVersionStatus = 'draft' | 'active' | 'archived';

export const promptVersions = pgTable('prompt_versions', {
  id: serial('id').primaryKey(),
  promptId: integer('prompt_id').notNull().references(() => promptRegistry.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  body: text('body').notNull(),
  notes: text('notes'),
  status: varchar('status', { length: 20 }).$type<PromptVersionStatus>().default('draft').notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Body is immutable; `status` (draft→active→archived) mutates on promote, so
  // track when that last happened for the version-history view.
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('prompt_versions_prompt_version_idx').on(t.promptId, t.version),
  index('prompt_versions_prompt_idx').on(t.promptId),
]);

// ─── Datasets + cases (DB-editable test inputs) ─────────────────────────────

export const evalDatasets = pgTable('eval_datasets', {
  id: serial('id').primaryKey(),
  // Code suite id this dataset feeds (e.g. 'meeting-extractor').
  suiteId: varchar('suite_id', { length: 100 }).notNull(),
  name: varchar('name', { length: 200 }).default('default').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('eval_datasets_suite_idx').on(t.suiteId),
]);

export const evalCases = pgTable('eval_cases', {
  id: serial('id').primaryKey(),
  datasetId: integer('dataset_id').notNull().references(() => evalDatasets.id, { onDelete: 'cascade' }),
  caseKey: varchar('case_key', { length: 200 }).notNull(),
  input: json('input').notNull(),
  expected: json('expected'),
  // Optional canned output so a case can score under --mock without a model call.
  mockOutput: json('mock_output'),
  enabled: boolean('enabled').default(true).notNull(),
  order: integer('order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('eval_cases_dataset_key_idx').on(t.datasetId, t.caseKey),
  index('eval_cases_dataset_idx').on(t.datasetId),
]);

// ─── Runs + per-case results (the charted time-series) ──────────────────────

export type EvalRunTrigger = 'manual' | 'promote' | 'schedule' | 'cli';
export type EvalRunStatus = 'queued' | 'running' | 'done' | 'failed';

export const evalRuns = pgTable('eval_runs', {
  id: serial('id').primaryKey(),
  suiteId: varchar('suite_id', { length: 100 }).notNull(),
  promptId: integer('prompt_id').references(() => promptRegistry.id, { onDelete: 'set null' }),
  promptVersionId: integer('prompt_version_id').references(() => promptVersions.id, { onDelete: 'set null' }),
  datasetId: integer('dataset_id').references(() => evalDatasets.id, { onDelete: 'set null' }),
  trigger: varchar('trigger', { length: 20 }).$type<EvalRunTrigger>().default('manual').notNull(),
  status: varchar('status', { length: 20 }).$type<EvalRunStatus>().default('queued').notNull(),
  // Rollup metrics (populated on completion).
  total: integer('total').default(0).notNull(),
  passed: integer('passed').default(0).notNull(),
  passRate: real('pass_rate').default(0).notNull(),
  aggregate: real('aggregate').default(0).notNull(),
  avgLatencyMs: integer('avg_latency_ms').default(0).notNull(),
  totalTokens: integer('total_tokens').default(0).notNull(),
  costUsd: real('cost_usd').default(0).notNull(),
  error: text('error'),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  startedAt: timestamp('started_at'),
  finishedAt: timestamp('finished_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('eval_runs_suite_created_idx').on(t.suiteId, t.createdAt),
  index('eval_runs_version_idx').on(t.promptVersionId),
  index('eval_runs_status_idx').on(t.status),
]);

export const evalCaseResults = pgTable('eval_case_results', {
  id: serial('id').primaryKey(),
  runId: integer('run_id').notNull().references(() => evalRuns.id, { onDelete: 'cascade' }),
  caseKey: varchar('case_key', { length: 200 }).notNull(),
  passed: boolean('passed').default(false).notNull(),
  aggregate: real('aggregate').default(0).notNull(),
  latencyMs: integer('latency_ms').default(0).notNull(),
  inputTokens: integer('input_tokens').default(0).notNull(),
  outputTokens: integer('output_tokens').default(0).notNull(),
  output: json('output'),
  scores: json('scores'),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('eval_case_results_run_idx').on(t.runId),
  // Guard against double-execution of a run (Phase 2b worker without a claim
  // lock) silently duplicating per-case rows.
  uniqueIndex('eval_case_results_run_case_idx').on(t.runId, t.caseKey),
]);
