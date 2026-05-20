-- Plugin registry — postcaptain_briefs.meta jsonb for structured signal.
--
-- The Wave 3 competitor-research kind writes a vulnerability assessment
-- (HIGH/MED/LOW + per-dimension scores + rationale) into this column so
-- Wave 4 can diff two consecutive briefs and post a card comment only when
-- the score actually changes. Existing research-brief rows are left with
-- meta = '{}' (default), so nothing in the v1 read paths needs to special-
-- case nulls.
--
-- Mirrors lib/db/schema/plugins.ts. Hand-written for the same reason as
-- 0114_plugin_registry.sql and 0116_plugin_jobs_cron_expr.sql — the
-- drizzle meta snapshot is stuck on an earlier collision.

ALTER TABLE "postcaptain_briefs"
  ADD COLUMN IF NOT EXISTS "meta" jsonb NOT NULL DEFAULT '{}'::jsonb;
