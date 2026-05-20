-- Plugin registry — extend registered_app_jobs to support cron expressions.
--
-- Adds the `cron_expr` column for sub-weekly cadences (daily/hourly) and
-- relaxes `day_of_week` + `time_utc` to nullable so a row can be in either
-- mode but not both. Application-level validation (lib/plugins/handlers/
-- postcaptain-tools/schedule.ts: assertExactlyOneMode) enforces the
-- exactly-one rule; no CHECK constraint here so we keep this migration
-- additive and reversible.
--
-- Mirrors lib/db/schema/plugins.ts. Hand-written for the same reason as
-- 0114_plugin_registry.sql — the drizzle meta snapshot is stuck on an
-- earlier collision (see project memory: project_sd2026_drizzle_tracker_drift).

ALTER TABLE "registered_app_jobs"
  ALTER COLUMN "day_of_week" DROP NOT NULL;

ALTER TABLE "registered_app_jobs"
  ALTER COLUMN "time_utc" DROP NOT NULL;

ALTER TABLE "registered_app_jobs"
  ADD COLUMN IF NOT EXISTS "cron_expr" varchar(64);
