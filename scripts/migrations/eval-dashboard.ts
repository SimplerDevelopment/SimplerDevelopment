/**
 * Migration + seed script: Prompt Eval Dashboard
 *
 * Creates the six eval tables (prompt_registry, prompt_versions,
 * eval_datasets, eval_cases, eval_runs, eval_case_results) if they do
 * not yet exist, then seeds the prompt registry from PROMPT_MANIFEST.
 *
 * Safe to re-run: all DDL uses IF NOT EXISTS / IF NOT EXISTS indexes,
 * and the seed upserts are guarded by existence checks.
 *
 * Phase 2 deferred: seeding eval_datasets + eval_cases is not done here
 * because those tables require curated test cases and a dataset schema
 * that has not yet been defined. Add a separate seed script when ready.
 */

import { db } from '@/lib/db';
import { sql, eq } from 'drizzle-orm';
import { promptRegistry, promptVersions } from '@/lib/db/schema/evals';
import { PROMPT_MANIFEST } from '@/lib/ai/prompt-registry-manifest';

// ─── Step 1: DDL — create all six tables + indexes ───────────────────────────
// Statements are taken verbatim from the verified /tmp/eval_dashboard.sql.
// Each uses IF NOT EXISTS so re-runs are safe.

async function createTables() {
  console.log('[eval-dashboard] Creating tables (IF NOT EXISTS)…');

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "prompt_registry" (
      "id" serial PRIMARY KEY NOT NULL,
      "key" varchar(100) NOT NULL,
      "title" varchar(200) NOT NULL,
      "description" text,
      "active_version_id" integer,
      "schedule_cron" varchar(120),
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "prompt_registry_key_unique" UNIQUE("key")
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "prompt_versions" (
      "id" serial PRIMARY KEY NOT NULL,
      "prompt_id" integer NOT NULL,
      "version" integer NOT NULL,
      "body" text NOT NULL,
      "notes" text,
      "status" varchar(20) DEFAULT 'draft' NOT NULL,
      "created_by" integer,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "eval_datasets" (
      "id" serial PRIMARY KEY NOT NULL,
      "suite_id" varchar(100) NOT NULL,
      "name" varchar(200) DEFAULT 'default' NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "eval_cases" (
      "id" serial PRIMARY KEY NOT NULL,
      "dataset_id" integer NOT NULL,
      "case_key" varchar(200) NOT NULL,
      "input" json NOT NULL,
      "expected" json,
      "mock_output" json,
      "enabled" boolean DEFAULT true NOT NULL,
      "order" integer DEFAULT 0 NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "eval_runs" (
      "id" serial PRIMARY KEY NOT NULL,
      "suite_id" varchar(100) NOT NULL,
      "prompt_id" integer,
      "prompt_version_id" integer,
      "dataset_id" integer,
      "trigger" varchar(20) DEFAULT 'manual' NOT NULL,
      "status" varchar(20) DEFAULT 'queued' NOT NULL,
      "total" integer DEFAULT 0 NOT NULL,
      "passed" integer DEFAULT 0 NOT NULL,
      "pass_rate" real DEFAULT 0 NOT NULL,
      "aggregate" real DEFAULT 0 NOT NULL,
      "avg_latency_ms" integer DEFAULT 0 NOT NULL,
      "total_tokens" integer DEFAULT 0 NOT NULL,
      "cost_usd" real DEFAULT 0 NOT NULL,
      "error" text,
      "created_by" integer,
      "started_at" timestamp,
      "finished_at" timestamp,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "eval_case_results" (
      "id" serial PRIMARY KEY NOT NULL,
      "run_id" integer NOT NULL,
      "case_key" varchar(200) NOT NULL,
      "passed" boolean DEFAULT false NOT NULL,
      "aggregate" real DEFAULT 0 NOT NULL,
      "latency_ms" integer DEFAULT 0 NOT NULL,
      "input_tokens" integer DEFAULT 0 NOT NULL,
      "output_tokens" integer DEFAULT 0 NOT NULL,
      "output" json,
      "scores" json,
      "error" text,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);

  // Indexes (all use IF NOT EXISTS)
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "prompt_versions_prompt_version_idx" ON "prompt_versions" ("prompt_id","version")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "prompt_versions_prompt_idx" ON "prompt_versions" ("prompt_id")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "eval_datasets_suite_idx" ON "eval_datasets" ("suite_id")`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "eval_cases_dataset_key_idx" ON "eval_cases" ("dataset_id","case_key")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "eval_cases_dataset_idx" ON "eval_cases" ("dataset_id")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "eval_runs_suite_created_idx" ON "eval_runs" ("suite_id","created_at")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "eval_runs_version_idx" ON "eval_runs" ("prompt_version_id")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "eval_runs_status_idx" ON "eval_runs" ("status")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "eval_case_results_run_idx" ON "eval_case_results" ("run_id")`);

  // Foreign keys — each wrapped in idempotent DO block so re-runs are safe.
  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE "prompt_versions"
        ADD CONSTRAINT "prompt_versions_prompt_id_fk"
        FOREIGN KEY ("prompt_id") REFERENCES "prompt_registry"("id") ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE "prompt_versions"
        ADD CONSTRAINT "prompt_versions_created_by_fk"
        FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE "eval_cases"
        ADD CONSTRAINT "eval_cases_dataset_id_fk"
        FOREIGN KEY ("dataset_id") REFERENCES "eval_datasets"("id") ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE "eval_runs"
        ADD CONSTRAINT "eval_runs_prompt_id_fk"
        FOREIGN KEY ("prompt_id") REFERENCES "prompt_registry"("id") ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE "eval_runs"
        ADD CONSTRAINT "eval_runs_prompt_version_id_fk"
        FOREIGN KEY ("prompt_version_id") REFERENCES "prompt_versions"("id") ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE "eval_runs"
        ADD CONSTRAINT "eval_runs_dataset_id_fk"
        FOREIGN KEY ("dataset_id") REFERENCES "eval_datasets"("id") ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE "eval_runs"
        ADD CONSTRAINT "eval_runs_created_by_fk"
        FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE "eval_case_results"
        ADD CONSTRAINT "eval_case_results_run_id_fk"
        FOREIGN KEY ("run_id") REFERENCES "eval_runs"("id") ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  console.log('[eval-dashboard] Tables, indexes, and FK constraints ready.');
}

// ─── Step 2: Seed prompt registry from PROMPT_MANIFEST ───────────────────────

async function seedPromptRegistry() {
  console.log(`[eval-dashboard] Seeding ${PROMPT_MANIFEST.length} prompts from PROMPT_MANIFEST…`);

  for (const entry of PROMPT_MANIFEST) {
    // 1. Check if the registry row already exists.
    const existing = await db
      .select({ id: promptRegistry.id, activeVersionId: promptRegistry.activeVersionId })
      .from(promptRegistry)
      .where(eq(promptRegistry.key, entry.key))
      .limit(1);

    let registryId: number;

    if (existing.length === 0) {
      // Insert a new registry row (no active_version_id yet — set below).
      const [inserted] = await db
        .insert(promptRegistry)
        .values({
          key: entry.key,
          title: entry.title,
          description: entry.description,
        })
        .returning({ id: promptRegistry.id });
      registryId = inserted.id;
      console.log(`  [insert] prompt_registry key="${entry.key}" id=${registryId}`);
    } else {
      registryId = existing[0].id;
      console.log(`  [skip]   prompt_registry key="${entry.key}" already exists (id=${registryId})`);
    }

    // 2. Check if any versions exist for this prompt.
    const versions = await db
      .select({ id: promptVersions.id })
      .from(promptVersions)
      .where(eq(promptVersions.promptId, registryId))
      .limit(1);

    if (versions.length === 0) {
      // No versions yet — insert version 1 as active and point the registry row at it.
      const [v] = await db
        .insert(promptVersions)
        .values({
          promptId: registryId,
          version: 1,
          body: entry.body,
          status: 'active',
        })
        .returning({ id: promptVersions.id });

      await db
        .update(promptRegistry)
        .set({ activeVersionId: v.id, updatedAt: new Date() })
        .where(eq(promptRegistry.id, registryId));

      console.log(`  [insert] prompt_versions id=${v.id} (v1, active) → prompt_registry.active_version_id=${v.id}`);
    } else {
      // Versions exist — but if active_version_id is null (partial seed from a prior run),
      // heal it by looking up the earliest active version for this prompt.
      const activeVersionId = existing[0]?.activeVersionId ?? null;
      if (activeVersionId === null) {
        const [v1] = await db
          .select({ id: promptVersions.id })
          .from(promptVersions)
          .where(eq(promptVersions.promptId, registryId))
          .limit(1);
        if (v1) {
          await db
            .update(promptRegistry)
            .set({ activeVersionId: v1.id, updatedAt: new Date() })
            .where(eq(promptRegistry.id, registryId));
          console.log(`  [repair] prompt_registry key="${entry.key}" active_version_id was null → set to ${v1.id}`);
        }
      } else {
        console.log(`  [skip]   prompt_versions for key="${entry.key}" already exist — leaving untouched`);
      }
    }
  }

  console.log('[eval-dashboard] Seed complete.');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function migrate() {
  await createTables();
  await seedPromptRegistry();
  console.log('[eval-dashboard] Migration + seed finished successfully.');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('[eval-dashboard] Fatal error:', err);
  process.exit(1);
});
