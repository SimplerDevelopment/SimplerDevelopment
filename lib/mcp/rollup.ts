/**
 * Daily rollup of `mcp_tool_calls` → `mcp_tool_call_daily_rollups`.
 *
 * Idempotent. Aggregates by (day, client_id, tool_name); upserts on the
 * unique index so re-runs (e.g. backfill, manual catch-up) produce the
 * same rows. Default window is "yesterday" so the cron at 04:00 UTC has a
 * full UTC day to roll up before the cleanup cron at 04:23 UTC drops any
 * raw events older than 14 days (no overlap, but rollup-first keeps the
 * intent obvious).
 *
 * `p95_*` columns use Postgres `percentile_cont(0.95) WITHIN GROUP (...)`.
 * That's the friction signal we want — average drowns in cheap-tool count,
 * max overstates one-off outliers.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

interface RollupResult {
  day: string;
  rowsWritten: number;
  durationMs: number;
}

/**
 * Compute UTC midnight for a given offset in days from "now". `daysAgo=1` is
 * yesterday's UTC midnight. We always work in UTC because the `day` column
 * uses calendar-day buckets and everything in this codebase is UTC at rest.
 */
function utcMidnight(daysAgo: number): Date {
  const now = new Date();
  const utc = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysAgo,
  ));
  return utc;
}

/**
 * Run the rollup for a single UTC day. Defaults to yesterday — the typical
 * cron shape. Pass `daysAgo=0` to roll up today (partial; safe to re-run).
 *
 * Pass an explicit `day: Date` (UTC midnight) to backfill a specific day.
 */
export async function runDailyRollup(opts?: { day?: Date; daysAgo?: number }): Promise<RollupResult> {
  const start = performance.now();
  const day = opts?.day ?? utcMidnight(opts?.daysAgo ?? 1);

  // Bracket the day in [day, day + 1d). Use a CTE so we compute aggregates
  // once and upsert them in a single statement.
  const result = await db.execute(sql`
    INSERT INTO mcp_tool_call_daily_rollups (
      day,
      client_id,
      tool_name,
      call_count,
      success_count,
      error_count,
      total_request_bytes,
      total_response_bytes,
      total_estimated_tokens,
      total_duration_ms,
      p95_response_bytes,
      p95_estimated_tokens,
      p95_duration_ms,
      max_response_bytes
    )
    SELECT
      ${day}::timestamp AS day,
      client_id,
      tool_name,
      count(*)::int AS call_count,
      count(*) FILTER (WHERE success = true)::int AS success_count,
      count(*) FILTER (WHERE success = false)::int AS error_count,
      coalesce(sum(request_bytes), 0)::int AS total_request_bytes,
      coalesce(sum(response_bytes), 0)::int AS total_response_bytes,
      coalesce(sum(estimated_tokens), 0)::int AS total_estimated_tokens,
      coalesce(sum(duration_ms), 0)::int AS total_duration_ms,
      coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY response_bytes), 0)::int AS p95_response_bytes,
      coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY estimated_tokens), 0)::int AS p95_estimated_tokens,
      coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0)::int AS p95_duration_ms,
      coalesce(max(response_bytes), 0)::int AS max_response_bytes
    FROM mcp_tool_calls
    WHERE created_at >= ${day}::timestamp
      AND created_at < (${day}::timestamp + interval '1 day')
    GROUP BY client_id, tool_name
    ON CONFLICT (day, client_id, tool_name) DO UPDATE SET
      call_count             = EXCLUDED.call_count,
      success_count          = EXCLUDED.success_count,
      error_count            = EXCLUDED.error_count,
      total_request_bytes    = EXCLUDED.total_request_bytes,
      total_response_bytes   = EXCLUDED.total_response_bytes,
      total_estimated_tokens = EXCLUDED.total_estimated_tokens,
      total_duration_ms      = EXCLUDED.total_duration_ms,
      p95_response_bytes     = EXCLUDED.p95_response_bytes,
      p95_estimated_tokens   = EXCLUDED.p95_estimated_tokens,
      p95_duration_ms        = EXCLUDED.p95_duration_ms,
      max_response_bytes     = EXCLUDED.max_response_bytes
  `);

  // node-postgres returns rowCount on the result; older drizzle adapters
  // tucked it under a different key. Both shapes appear in this codebase
  // (see lib/mcp/server.ts:109 `extractRows`). Default to 0 if absent.
  const rowsWritten = (() => {
    const r = result as { rowCount?: number; count?: number };
    return r.rowCount ?? r.count ?? 0;
  })();

  return {
    day: day.toISOString().slice(0, 10),
    rowsWritten,
    durationMs: Math.round(performance.now() - start),
  };
}
