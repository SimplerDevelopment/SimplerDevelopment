-- #120: align metro's non-additive type drift to the code schema. Hand-written; the additive
-- prod-schema-sync only does CREATE TABLE / ADD COLUMN, never ALTER TYPE, so these can't auto-apply.
-- The drizzle tracker is out of sync in prod; db:generate refuses non-interactively (same as 9004-9009).
--
-- SAFE TO RE-RUN: every ALTER is wrapped in a guard that only fires when the column is STILL the old
-- type. This is load-bearing for the timestamptz conversions — re-running a bare
-- `USING next_run_at AT TIME ZONE 'UTC'` on an already-timestamptz column would REINTERPRET (shift) the
-- instant. The guard makes the second run a no-op.
--
-- TZ correctness: metro runs Etc/UTC, so the existing naive `timestamp` values already denote UTC
-- instants; `... AT TIME ZONE 'UTC'` converts them to timestamptz preserving the exact instant
-- (verified against a pre-migration epoch snapshot). integer→bigint is a lossless widening.
--
-- Mirrors: lib/db/schema/brain.ts (automationRules.nextRunAt withTimezone:true),
--          lib/db/schema/plugins.ts (registeredAppJobs.nextRunAt withTimezone:true),
--          lib/db/schema/tools.ts (mcpToolCallDailyRollups.total_* bigint).

-- 1. automation_rules.next_run_at : timestamp → timestamptz (interpret existing naive values as UTC)
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='automation_rules' AND column_name='next_run_at')
     = 'timestamp without time zone' THEN
    ALTER TABLE "automation_rules"
      ALTER COLUMN "next_run_at" TYPE timestamptz USING "next_run_at" AT TIME ZONE 'UTC';
  END IF;
END $$;

-- 2. registered_app_jobs.next_run_at : timestamp → timestamptz
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='registered_app_jobs' AND column_name='next_run_at')
     = 'timestamp without time zone' THEN
    ALTER TABLE "registered_app_jobs"
      ALTER COLUMN "next_run_at" TYPE timestamptz USING "next_run_at" AT TIME ZONE 'UTC';
  END IF;
END $$;

-- 3. mcp_tool_call_daily_rollups.total_* : integer → bigint (lossless widening)
DO $$
DECLARE
  col text;
BEGIN
  FOREACH col IN ARRAY ARRAY['total_duration_ms','total_estimated_tokens','total_request_bytes','total_response_bytes']
  LOOP
    IF (SELECT data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name='mcp_tool_call_daily_rollups' AND column_name=col)
       = 'integer' THEN
      EXECUTE format('ALTER TABLE "mcp_tool_call_daily_rollups" ALTER COLUMN %I TYPE bigint', col);
    END IF;
  END LOOP;
END $$;
