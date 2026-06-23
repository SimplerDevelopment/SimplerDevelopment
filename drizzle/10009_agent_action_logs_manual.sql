-- Phase 1: Agentic OS audit trail
--
-- 1. Extend agentic_os_runs with clientId (tenant scoping) + runId (UUID
--    injected into the child process as AGENTIC_RUN_ID).
-- 2. Create agent_action_logs — durable per-tenant audit of every MCP tool
--    call; no TTL (unlike mcp_tool_calls which expires after 14 days).
--
-- All statements are idempotent (IF NOT EXISTS / IF EXISTS guards).

-- ── agentic_os_runs additions ────────────────────────────────────────────────

ALTER TABLE "agentic_os_runs"
  ADD COLUMN IF NOT EXISTS "client_id" integer
    REFERENCES "clients"("id") ON DELETE SET NULL;

ALTER TABLE "agentic_os_runs"
  ADD COLUMN IF NOT EXISTS "run_id" varchar(36);

CREATE INDEX IF NOT EXISTS "agentic_os_runs_client_id_idx"
  ON "agentic_os_runs" ("client_id");

CREATE INDEX IF NOT EXISTS "agentic_os_runs_run_id_idx"
  ON "agentic_os_runs" ("run_id");

-- ── agent_action_logs (new) ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "agent_action_logs" (
  "id"               serial PRIMARY KEY,
  "client_id"        integer NOT NULL
                       REFERENCES "clients"("id") ON DELETE CASCADE,
  "run_id"           varchar(36),
  "api_key_id"       integer,
  "user_id"          integer
                       REFERENCES "users"("id") ON DELETE SET NULL,
  "tool_name"        varchar(100) NOT NULL,
  "scope_used"       varchar(100),
  "inputs_summary"   jsonb,
  "output_summary"   text,
  "status"           varchar(20) NOT NULL,
  "error_message"    text,
  "duration_ms"      integer,
  "pending_change_id" integer
                       REFERENCES "mcp_pending_changes"("id") ON DELETE SET NULL,
  "created_at"       timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "agent_audit_logs_client_created_idx"
  ON "agent_action_logs" ("client_id", "created_at");

CREATE INDEX IF NOT EXISTS "agent_audit_logs_run_id_idx"
  ON "agent_action_logs" ("run_id");

CREATE INDEX IF NOT EXISTS "agent_audit_logs_client_tool_created_idx"
  ON "agent_action_logs" ("client_id", "tool_name", "created_at");
