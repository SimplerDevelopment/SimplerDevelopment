-- Visual workflow builder MVP. Hand-applied (drizzle tracker is drifted in
-- prod). Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS "workflows" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "trigger" json NOT NULL,
  "graph" json NOT NULL,
  "created_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "workflows" ADD CONSTRAINT "workflows_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "workflows" ADD CONSTRAINT "workflows_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "workflows_client_idx" ON "workflows" ("client_id");
CREATE INDEX IF NOT EXISTS "workflows_status_idx" ON "workflows" ("status");

CREATE TABLE IF NOT EXISTS "workflow_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "workflow_id" integer NOT NULL,
  "client_id" integer NOT NULL,
  "triggered_by" text,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "context" json DEFAULT '{}'::json NOT NULL,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  "error" text
);

DO $$ BEGIN
  ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fk"
    FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "workflow_runs_workflow_idx" ON "workflow_runs" ("workflow_id");
CREATE INDEX IF NOT EXISTS "workflow_runs_client_idx" ON "workflow_runs" ("client_id");
CREATE INDEX IF NOT EXISTS "workflow_runs_status_idx" ON "workflow_runs" ("status");

CREATE TABLE IF NOT EXISTS "workflow_step_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "run_id" integer NOT NULL,
  "node_id" text NOT NULL,
  "action" text NOT NULL,
  "status" varchar(20) NOT NULL,
  "input" json,
  "output" json,
  "duration_ms" integer,
  "occurred_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "workflow_step_logs" ADD CONSTRAINT "workflow_step_logs_run_id_workflow_runs_id_fk"
    FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "workflow_step_logs_run_idx" ON "workflow_step_logs" ("run_id");
