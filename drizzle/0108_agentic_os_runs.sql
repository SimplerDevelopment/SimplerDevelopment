-- Agentic OS: log of admin-triggered headless `claude -p` skill runs.
--
-- Run manually:
--   psql "$DATABASE_URL" -f drizzle/0108_agentic_os_runs.sql
--
-- Context:
--   The Agentic OS admin dashboard fires Claude Code skills as subprocess
--   invocations. Each invocation gets a row here for audit + retry + UX
--   (status polling, log tailing). `skill_id` references a code-resident
--   registry, not a DB table — skills are defined in source, not data.
--   `output` is captured stdout, truncated server-side at ~256KB before
--   insert/update so a runaway skill cannot blow up the row.
--
--   Indexes:
--     * created_at — dashboard "recent runs" view
--     * skill_id   — "runs of this skill" filter
--     * status     — "pending/running" tail for the supervisor
--
-- NOTE on hand-written SQL:
--   Per CLAUDE.md the canonical workflow is `bun run db:generate`. The repo's
--   drizzle meta journal is currently desynced from disk (see project memory:
--   "tracker drift in prod; schema changes are hand-applied SQL"), so
--   drizzle-kit generate aborts with a snapshot collision. This migration
--   follows the same hand-written + idempotent pattern as 0107.
--
-- Idempotent: safe to re-run.

DO $$ BEGIN
  CREATE TYPE "agentic_os_run_status" AS ENUM (
    'pending',
    'running',
    'succeeded',
    'failed',
    'cancelled',
    'unavailable'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "agentic_os_runs" (
  "id"            serial PRIMARY KEY,
  "skill_id"      varchar(128) NOT NULL,
  "prompt"        text NOT NULL,
  "variables"     jsonb,
  "status"        "agentic_os_run_status" NOT NULL DEFAULT 'pending',
  "output"        text,
  "exit_code"     integer,
  "error_message" text,
  "duration_ms"   integer,
  "host"          varchar(64),
  "created_by"    integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"    timestamp NOT NULL DEFAULT now(),
  "started_at"    timestamp,
  "completed_at"  timestamp
);

CREATE INDEX IF NOT EXISTS "agentic_os_runs_created_at_idx"
  ON "agentic_os_runs" ("created_at");

CREATE INDEX IF NOT EXISTS "agentic_os_runs_skill_id_idx"
  ON "agentic_os_runs" ("skill_id");

CREATE INDEX IF NOT EXISTS "agentic_os_runs_status_idx"
  ON "agentic_os_runs" ("status");
