-- Plugin registry — installable remote applications proxied under
-- /portal/apps/<slug>/*. The portal stays the source of truth for auth,
-- billing/entitlement, nav, and audit; the remote plugin owns its own UI
-- and deploy cadence.
--
-- Six tables in two groups:
--   1. Plugin core: registered_apps, registered_app_signing_keys,
--      registered_app_callbacks_audit (jti UNIQUE for replay dedup),
--      registered_app_runs (also acts as the work queue),
--      registered_app_jobs (weekly schedules).
--   2. Plugin-specific result tables for the first plugin (postcaptain-tools):
--      postcaptain_briefs, postcaptain_drafts. Cross-referenced from
--      registered_app_runs.result_id via the `kind` discriminator (no FK so
--      a single run column can point at either table).
--
-- NOTE: hand-written. The drizzle meta snapshot is stuck on a pre-existing
-- collision (project memory: feedback_drizzle_correlated_subqueries +
-- project_sd2026_drizzle_tracker_drift). Mirrors lib/db/schema/plugins.ts.

-- ── registered_apps ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "registered_apps" (
  "id" serial PRIMARY KEY NOT NULL,
  "slug" varchar(64) NOT NULL,
  "name" varchar(255) NOT NULL,
  "icon" varchar(64),
  "host_url" varchar(500) NOT NULL,
  "manifest_url" varchar(500) NOT NULL,
  "nav_label" varchar(64),
  "nav_position" integer DEFAULT 50 NOT NULL,
  "default_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "billing_service_id" integer,
  "visibility" varchar(20) DEFAULT 'allowlist' NOT NULL,
  "allowed_client_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "registered_apps_slug_unique" UNIQUE("slug")
);

DO $$ BEGIN
  ALTER TABLE "registered_apps"
    ADD CONSTRAINT "registered_apps_billing_service_id_services_id_fk"
    FOREIGN KEY ("billing_service_id") REFERENCES "services"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ── registered_app_signing_keys ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "registered_app_signing_keys" (
  "id" serial PRIMARY KEY NOT NULL,
  "app_id" integer NOT NULL,
  "kid" varchar(32) NOT NULL,
  "secret_hash" varchar(255) NOT NULL,
  "secret_encrypted" text NOT NULL,
  "algo" varchar(16) DEFAULT 'HS256' NOT NULL,
  "status" varchar(16) DEFAULT 'active' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "rotated_at" timestamp
);

DO $$ BEGIN
  ALTER TABLE "registered_app_signing_keys"
    ADD CONSTRAINT "registered_app_signing_keys_app_id_registered_apps_id_fk"
    FOREIGN KEY ("app_id") REFERENCES "registered_apps"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "registered_app_signing_keys_app_kid_uq"
  ON "registered_app_signing_keys" ("app_id", "kid");
CREATE INDEX IF NOT EXISTS "registered_app_signing_keys_app_status_idx"
  ON "registered_app_signing_keys" ("app_id", "status");

-- ── registered_app_callbacks_audit ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "registered_app_callbacks_audit" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "app_id" integer NOT NULL,
  "client_id" integer NOT NULL,
  "user_id" integer,
  "jti" varchar(64) NOT NULL,
  "route" varchar(255) NOT NULL,
  "method" varchar(8) NOT NULL,
  "status" integer NOT NULL,
  "request_id" varchar(64),
  "ts" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "registered_app_callbacks_audit_jti_unique" UNIQUE("jti")
);

DO $$ BEGIN
  ALTER TABLE "registered_app_callbacks_audit"
    ADD CONSTRAINT "registered_app_callbacks_audit_app_id_registered_apps_id_fk"
    FOREIGN KEY ("app_id") REFERENCES "registered_apps"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "registered_app_callbacks_audit"
    ADD CONSTRAINT "registered_app_callbacks_audit_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "registered_app_callbacks_audit"
    ADD CONSTRAINT "registered_app_callbacks_audit_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "registered_app_callbacks_audit_app_client_idx"
  ON "registered_app_callbacks_audit" ("app_id", "client_id");
CREATE INDEX IF NOT EXISTS "registered_app_callbacks_audit_ts_idx"
  ON "registered_app_callbacks_audit" ("ts");

-- ── registered_app_runs ────────────────────────────────────────────────────
-- Acts as the work queue: rows start status='queued', the per-minute drain
-- cron CAS-claims to 'running', then transitions to terminal status.
-- result_id is NOT a FK because it can reference either postcaptain_briefs
-- or postcaptain_drafts depending on the `kind` discriminator.

CREATE TABLE IF NOT EXISTS "registered_app_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "app_id" integer NOT NULL,
  "client_id" integer NOT NULL,
  "job_id" integer,
  "kind" varchar(64) NOT NULL,
  "args" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" varchar(16) DEFAULT 'queued' NOT NULL,
  "started_at" timestamp,
  "finished_at" timestamp,
  "exit_code" integer,
  "log_tail" text,
  "error_summary" text,
  "result_id" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "registered_app_runs"
    ADD CONSTRAINT "registered_app_runs_app_id_registered_apps_id_fk"
    FOREIGN KEY ("app_id") REFERENCES "registered_apps"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "registered_app_runs"
    ADD CONSTRAINT "registered_app_runs_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "registered_app_runs_app_client_idx"
  ON "registered_app_runs" ("app_id", "client_id");
CREATE INDEX IF NOT EXISTS "registered_app_runs_status_idx"
  ON "registered_app_runs" ("status");
CREATE INDEX IF NOT EXISTS "registered_app_runs_job_idx"
  ON "registered_app_runs" ("job_id");

-- ── registered_app_jobs ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "registered_app_jobs" (
  "id" serial PRIMARY KEY NOT NULL,
  "app_id" integer NOT NULL,
  "client_id" integer NOT NULL,
  "name" varchar(255) NOT NULL,
  "kind" varchar(64) NOT NULL,
  "args" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "day_of_week" integer NOT NULL,
  "time_utc" varchar(5) NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "next_run_at" timestamp NOT NULL,
  "last_run_at" timestamp,
  "created_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "registered_app_jobs"
    ADD CONSTRAINT "registered_app_jobs_app_id_registered_apps_id_fk"
    FOREIGN KEY ("app_id") REFERENCES "registered_apps"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "registered_app_jobs"
    ADD CONSTRAINT "registered_app_jobs_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "registered_app_jobs"
    ADD CONSTRAINT "registered_app_jobs_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "registered_app_jobs_app_client_idx"
  ON "registered_app_jobs" ("app_id", "client_id");
CREATE INDEX IF NOT EXISTS "registered_app_jobs_next_run_at_idx"
  ON "registered_app_jobs" ("next_run_at");
CREATE INDEX IF NOT EXISTS "registered_app_jobs_enabled_next_run_at_idx"
  ON "registered_app_jobs" ("enabled", "next_run_at");

-- ── postcaptain_briefs ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "postcaptain_briefs" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL,
  "run_id" integer NOT NULL,
  "topic" varchar(255) NOT NULL,
  "focus" text,
  "body" text NOT NULL,
  "sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "postcaptain_briefs"
    ADD CONSTRAINT "postcaptain_briefs_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "postcaptain_briefs"
    ADD CONSTRAINT "postcaptain_briefs_run_id_registered_app_runs_id_fk"
    FOREIGN KEY ("run_id") REFERENCES "registered_app_runs"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "postcaptain_briefs_client_idx"
  ON "postcaptain_briefs" ("client_id");
CREATE INDEX IF NOT EXISTS "postcaptain_briefs_run_idx"
  ON "postcaptain_briefs" ("run_id");

-- ── postcaptain_drafts ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "postcaptain_drafts" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL,
  "run_id" integer NOT NULL,
  "brief_id" integer,
  "title" varchar(255) NOT NULL,
  "body" text NOT NULL,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "postcaptain_drafts"
    ADD CONSTRAINT "postcaptain_drafts_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "postcaptain_drafts"
    ADD CONSTRAINT "postcaptain_drafts_run_id_registered_app_runs_id_fk"
    FOREIGN KEY ("run_id") REFERENCES "registered_app_runs"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "postcaptain_drafts"
    ADD CONSTRAINT "postcaptain_drafts_brief_id_postcaptain_briefs_id_fk"
    FOREIGN KEY ("brief_id") REFERENCES "postcaptain_briefs"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "postcaptain_drafts_client_idx"
  ON "postcaptain_drafts" ("client_id");
CREATE INDEX IF NOT EXISTS "postcaptain_drafts_run_idx"
  ON "postcaptain_drafts" ("run_id");
