-- Daily aggregates of mcp_tool_calls. Persisted forever; the raw events
-- table has a 14-day TTL (mcp-cleanup cron) so anything older lives only
-- in this rollup. Re-runnable via UPSERT on (day, client_id, tool_name).
--
-- `p95_*` columns use percentile_cont(0.95) — that's the right friction
-- signal (avg drowns in cheap-tool count; max overstates outliers).

CREATE TABLE IF NOT EXISTS "mcp_tool_call_daily_rollups" (
  "id" serial PRIMARY KEY,
  "day" timestamp NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "tool_name" varchar(100) NOT NULL,
  "call_count" integer NOT NULL DEFAULT 0,
  "success_count" integer NOT NULL DEFAULT 0,
  "error_count" integer NOT NULL DEFAULT 0,
  "total_request_bytes" integer NOT NULL DEFAULT 0,
  "total_response_bytes" integer NOT NULL DEFAULT 0,
  "total_estimated_tokens" integer NOT NULL DEFAULT 0,
  "total_duration_ms" integer NOT NULL DEFAULT 0,
  "p95_response_bytes" integer NOT NULL DEFAULT 0,
  "p95_estimated_tokens" integer NOT NULL DEFAULT 0,
  "p95_duration_ms" integer NOT NULL DEFAULT 0,
  "max_response_bytes" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "mcp_rollups_day_client_tool_uq"
  ON "mcp_tool_call_daily_rollups" ("day", "client_id", "tool_name");
CREATE INDEX IF NOT EXISTS "mcp_rollups_day_idx"
  ON "mcp_tool_call_daily_rollups" ("day");
CREATE INDEX IF NOT EXISTS "mcp_rollups_client_day_idx"
  ON "mcp_tool_call_daily_rollups" ("client_id", "day");
