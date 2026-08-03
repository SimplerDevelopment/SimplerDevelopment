-- PVIZ-001: Path Visualizations / "Dev Paths" — live, agent-authored node-graph
-- charts of dev paths (screens/components/APIs/schema/services/tests/jobs/infra)
-- attached 1:N to portal projects, with an append-only event log (SSE feed +
-- audit + replay) and soft/advisory claims for cross-agent coordination.
-- Spec: vault/05 - Feature Specs/Path Visualizations.md
--
-- Hand-written; the drizzle tracker is out of sync and db:generate refuses
-- non-interactively (same as 9004-9012). Idempotent — guarded CREATE TYPE,
-- CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS; re-running is a no-op.
-- Purely additive — safe for the additive prod schema-sync workflow.
--
-- Mirrors lib/db/schema/pathviz.ts.

DO $$ BEGIN
  CREATE TYPE "path_chart_status" AS ENUM ('active', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "path_chart_node_kind" AS ENUM
    ('screen', 'component', 'api', 'schema', 'service', 'test', 'job', 'infra');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "path_chart_node_status" AS ENUM
    ('planned', 'scaffolded', 'wired', 'styled', 'tested', 'shipped', 'blocked', 'error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "path_chart_edge_kind" AS ENUM ('nav', 'data');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "path_charts" (
  "id" serial PRIMARY KEY,
  "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "title" varchar(200) NOT NULL,
  "description" text,
  "app_label" varchar(120),
  "status" "path_chart_status" DEFAULT 'active' NOT NULL,
  "created_by_agent" varchar(120),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "path_charts_project_status_idx"
  ON "path_charts" ("project_id", "status");
CREATE INDEX IF NOT EXISTS "path_charts_project_updated_idx"
  ON "path_charts" ("project_id", "updated_at");

CREATE TABLE IF NOT EXISTS "path_chart_nodes" (
  "id" serial PRIMARY KEY,
  "chart_id" integer NOT NULL REFERENCES "path_charts"("id") ON DELETE CASCADE,
  "key" varchar(120) NOT NULL,
  "parent_node_id" integer,
  "kind" "path_chart_node_kind" NOT NULL,
  "label" varchar(200) NOT NULL,
  "route_path" varchar(300),
  "file_path" varchar(500),
  "status" "path_chart_node_status" DEFAULT 'planned' NOT NULL,
  "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "position" jsonb,
  "last_verified_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "path_chart_nodes_chart_key_idx"
  ON "path_chart_nodes" ("chart_id", "key");
CREATE INDEX IF NOT EXISTS "path_chart_nodes_chart_parent_idx"
  ON "path_chart_nodes" ("chart_id", "parent_node_id");

CREATE TABLE IF NOT EXISTS "path_chart_edges" (
  "id" serial PRIMARY KEY,
  "chart_id" integer NOT NULL REFERENCES "path_charts"("id") ON DELETE CASCADE,
  "source_node_id" integer NOT NULL REFERENCES "path_chart_nodes"("id") ON DELETE CASCADE,
  "target_node_id" integer NOT NULL REFERENCES "path_chart_nodes"("id") ON DELETE CASCADE,
  "kind" "path_chart_edge_kind" NOT NULL,
  "label" varchar(120),
  "meta" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "path_chart_edges_chart_source_target_kind_idx"
  ON "path_chart_edges" ("chart_id", "source_node_id", "target_node_id", "kind");

CREATE TABLE IF NOT EXISTS "path_chart_events" (
  "id" bigserial PRIMARY KEY,
  "chart_id" integer NOT NULL REFERENCES "path_charts"("id") ON DELETE CASCADE,
  "event_type" varchar(50) NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "agent_label" varchar(120),
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "path_chart_events_chart_id_idx"
  ON "path_chart_events" ("chart_id", "id");

CREATE TABLE IF NOT EXISTS "path_chart_claims" (
  "id" serial PRIMARY KEY,
  "chart_id" integer NOT NULL REFERENCES "path_charts"("id") ON DELETE CASCADE,
  "node_id" integer NOT NULL REFERENCES "path_chart_nodes"("id") ON DELETE CASCADE,
  "agent_label" varchar(120) NOT NULL,
  "intent" text,
  "files" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "released_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "path_chart_claims_chart_released_idx"
  ON "path_chart_claims" ("chart_id", "released_at");
CREATE INDEX IF NOT EXISTS "path_chart_claims_files_gin_idx"
  ON "path_chart_claims" USING gin ("files");
