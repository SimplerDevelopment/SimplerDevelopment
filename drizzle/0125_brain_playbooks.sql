-- Brain Phase 6 — Playbooks
--
-- Five tables: brain_playbooks (top-level definition), brain_playbook_steps
-- (ordered + branching steps with JSON condition + next_step_keys),
-- brain_playbook_runs (per-run state w/ context JSON), brain_playbook_run_steps
-- (per-run step state, incl. wait_until for time-based progression), and
-- brain_playbook_links (polymorphic anchor to initiative / person / crm_company
-- / crm_deal / meeting / decision).
--
-- Playbooks differ from automation_rules: automation rules are one-shot
-- ("when X happens, do Y"); playbooks are multi-step, human-paced, stateful
-- (new-hire onboarding, contract renewal countdown, incident response, etc.).
--
-- Mirrors lib/db/schema/brain.ts (brainPlaybooks, brainPlaybookSteps,
-- brainPlaybookRuns, brainPlaybookRunSteps, brainPlaybookLinks).

CREATE TABLE "brain_playbooks" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE cascade,
  "name" varchar(200) NOT NULL,
  "slug" varchar(200) NOT NULL,
  "description" text,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "trigger_kind" varchar(20) DEFAULT 'manual' NOT NULL,
  "trigger_config" json,
  "category" varchar(100),
  "owner_id" integer REFERENCES "users"("id") ON DELETE set null,
  "default_topic_ids" json DEFAULT '[]'::json NOT NULL,
  "source" varchar(50) DEFAULT 'manual' NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "brain_playbooks_client_slug_idx"
  ON "brain_playbooks" ("client_id", "slug");

CREATE INDEX IF NOT EXISTS "brain_playbooks_client_status_idx"
  ON "brain_playbooks" ("client_id", "status");

CREATE TABLE "brain_playbook_steps" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE cascade,
  "playbook_id" integer NOT NULL REFERENCES "brain_playbooks"("id") ON DELETE cascade,
  "key" varchar(100) NOT NULL,
  "name" varchar(200) NOT NULL,
  "description" text,
  "kind" varchar(30) NOT NULL,
  "config" json DEFAULT '{}'::json NOT NULL,
  "condition" json,
  "next_step_keys" json DEFAULT '[]'::json NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "brain_playbook_steps_playbook_key_idx"
  ON "brain_playbook_steps" ("playbook_id", "key");

CREATE INDEX IF NOT EXISTS "brain_playbook_steps_playbook_idx"
  ON "brain_playbook_steps" ("playbook_id");

CREATE TABLE "brain_playbook_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE cascade,
  "playbook_id" integer NOT NULL REFERENCES "brain_playbooks"("id") ON DELETE cascade,
  "label" varchar(255) NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "context" json DEFAULT '{}'::json NOT NULL,
  "started_by" integer REFERENCES "users"("id") ON DELETE set null,
  "trigger_payload" json,
  "started_at" timestamp,
  "completed_at" timestamp,
  "aborted_at" timestamp,
  "abort_reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "brain_playbook_runs_client_status_idx"
  ON "brain_playbook_runs" ("client_id", "status");

CREATE INDEX IF NOT EXISTS "brain_playbook_runs_playbook_idx"
  ON "brain_playbook_runs" ("playbook_id");

CREATE TABLE "brain_playbook_run_steps" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE cascade,
  "run_id" integer NOT NULL REFERENCES "brain_playbook_runs"("id") ON DELETE cascade,
  "step_id" integer NOT NULL REFERENCES "brain_playbook_steps"("id") ON DELETE cascade,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "result_entity_type" varchar(50),
  "result_entity_id" integer,
  "wait_until" timestamp,
  "failure_reason" text,
  "started_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "brain_playbook_run_steps_run_step_idx"
  ON "brain_playbook_run_steps" ("run_id", "step_id");

CREATE INDEX IF NOT EXISTS "brain_playbook_run_steps_status_idx"
  ON "brain_playbook_run_steps" ("status");

CREATE INDEX IF NOT EXISTS "brain_playbook_run_steps_wait_until_idx"
  ON "brain_playbook_run_steps" ("wait_until");

CREATE TABLE "brain_playbook_links" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE cascade,
  "run_id" integer NOT NULL REFERENCES "brain_playbook_runs"("id") ON DELETE cascade,
  "entity_type" varchar(30) NOT NULL,
  "entity_id" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "brain_playbook_links_run_entity_idx"
  ON "brain_playbook_links" ("run_id", "entity_type", "entity_id");

CREATE INDEX IF NOT EXISTS "brain_playbook_links_client_entity_idx"
  ON "brain_playbook_links" ("client_id", "entity_type", "entity_id");
