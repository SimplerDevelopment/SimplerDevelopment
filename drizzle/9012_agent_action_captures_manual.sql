-- AAF-001: agent_action_captures — encrypted, access-controlled, 90-day-retained
-- full-argument capture for HIGH-RISK agent tools (see the internal ADR log,
-- not part of this public release). Additive to the
-- existing hash log (agent_action_log) and redacted summary log
-- (agent_action_logs) — never replaces either.
--
-- Hand-written; the drizzle tracker is out of sync in prod and db:generate
-- refuses non-interactively (same as 9004-9011). Idempotent — CREATE TABLE IF
-- NOT EXISTS / CREATE INDEX IF NOT EXISTS so re-running is a no-op.
--
-- Mirrors lib/db/schema/audit.ts (agentActionCaptures).

CREATE TABLE IF NOT EXISTS "agent_action_captures" (
  "id" serial PRIMARY KEY,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "audit_log_id" integer REFERENCES "agent_action_logs"("id") ON DELETE SET NULL,
  "tool_name" varchar(120) NOT NULL,
  "key_id" integer,
  "user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "ciphertext" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "agent_action_captures_client_created_idx"
  ON "agent_action_captures" ("client_id", "created_at");
