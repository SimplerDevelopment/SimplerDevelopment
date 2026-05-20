-- Add per-tenant scheduled triggers to automation_rules.
--
-- Run manually:
--   psql "$DATABASE_URL" -f drizzle/0107_automation_schedules.sql
--
-- Context (automations / scheduled triggers):
--   Until now, automation_rules has been event-driven only — rules fire when
--   the in-process event bus emits a matching event. Clients have asked for
--   time-based triggers ("run every Monday at 9am UTC", "on the 1st of each
--   month", "every 15 minutes"). This migration adds:
--
--     * `schedule` (jsonb) — AutomationSchedule config: cadence + time +
--       optional dayOfWeek / dayOfMonth / cronExpression. Null = event-driven
--       (current behavior, no migration of existing rows needed).
--     * `next_run_at` (timestamp) — pre-computed next firing time. The
--       scheduler cron (app/api/cron/process-scheduled-automations) does a
--       cheap range scan over this column once per minute and CAS-claims
--       rules atomically before firing them.
--
--   The partial index `automation_rules_next_run_at_idx` covers ONLY rows
--   where `schedule IS NOT NULL` — keeping the index tiny and the per-minute
--   scan cheap even as the table grows with event-driven rules.
--
-- v1 limitation: UTC only. No timezone column, no DST handling. Times in
-- `schedule.time` and `schedule.cronExpression` are interpreted as UTC.
--
-- Idempotent: safe to re-run.

ALTER TABLE "automation_rules"
  ADD COLUMN IF NOT EXISTS "schedule" jsonb;

ALTER TABLE "automation_rules"
  ADD COLUMN IF NOT EXISTS "next_run_at" timestamp;

CREATE INDEX IF NOT EXISTS "automation_rules_next_run_at_idx"
  ON "automation_rules" ("enabled", "next_run_at")
  WHERE "schedule" IS NOT NULL;
