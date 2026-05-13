-- Per-call telemetry for the portal MCP server. One row per tool invocation —
-- raw events for friction analysis (which tool/client is most expensive,
-- which calls error, which exceed the ~8k-token Claude Code truncation cap).
--
-- High volume table. Cleanup cron drops rows older than 14 days; daily
-- aggregates land in mcp_tool_call_daily_rollups (added in Round 2).
--
-- Token estimation is content-aware (JSON ~3.0 chars/tok, hex/UUID ~2.0,
-- CJK ~1.0) but still an estimate — async reconciliation against Claude's
-- count_tokens API will self-tune the coefficients (Round 4a).

CREATE TABLE IF NOT EXISTS "mcp_tool_calls" (
  "id" serial PRIMARY KEY,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "api_key_id" integer REFERENCES "portal_api_keys"("id") ON DELETE SET NULL,
  "user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "tool_name" varchar(100) NOT NULL,
  "request_bytes" integer NOT NULL DEFAULT 0,
  "response_bytes" integer NOT NULL DEFAULT 0,
  "estimated_tokens" integer NOT NULL DEFAULT 0,
  "duration_ms" integer NOT NULL DEFAULT 0,
  "success" boolean NOT NULL DEFAULT true,
  "error_message" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "mcp_tool_calls_client_created_idx"
  ON "mcp_tool_calls" ("client_id", "created_at");
CREATE INDEX IF NOT EXISTS "mcp_tool_calls_tool_created_idx"
  ON "mcp_tool_calls" ("tool_name", "created_at");
