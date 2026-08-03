-- APWD-003: agent_flows — the Workflow Designer's single-table store. One row =
-- one saved reactflow graph of agent personas (nodes) + their handoffs/
-- dependencies (edges), scoped to a project. Diagram-only for now; `status` is
-- lifecycle (draft/active/archived), not execution — a future runtime adds its
-- own agent_flow_runs tables and reads the `graph` blob.
--
-- Hand-written; the drizzle tracker is out of sync in prod and db:generate
-- refuses non-interactively (same as 9004-9012). Idempotent — CREATE TABLE IF
-- NOT EXISTS / CREATE INDEX IF NOT EXISTS so re-running is a no-op.
--
-- Mirrors lib/db/schema/agentFlows.ts (agentFlows). `client_id` is denormalized
-- from the owning project for direct tenant filtering — the API stamps it from
-- project.clientId, never from the request body.

CREATE TABLE IF NOT EXISTS "agent_flows" (
  "id" serial PRIMARY KEY,
  "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "description" text,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "graph" jsonb DEFAULT '{"nodes":[],"edges":[]}'::jsonb NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "agent_flows_project_idx" ON "agent_flows" ("project_id");
CREATE INDEX IF NOT EXISTS "agent_flows_client_idx" ON "agent_flows" ("client_id");
