-- Company Brain — Phase 2
-- Meetings, AI processing jobs, review queue, audit log, and brain tasks.
-- See .planning/audits/companyBrain-adjusted.md sections 3 + 7 + 9.

-- Meetings — paste/upload/google_doc/etc all funnel here.
CREATE TABLE IF NOT EXISTS "brain_meetings" (
  "id" serial PRIMARY KEY,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "company_id" integer REFERENCES "crm_companies"("id") ON DELETE SET NULL,
  "deal_id" integer REFERENCES "crm_deals"("id") ON DELETE SET NULL,
  "title" varchar(255) NOT NULL,
  "meeting_date" timestamp,
  "transcript" text,
  "ai_summary" text,
  "human_summary" text,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "reviewed_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp,
  "confidentiality_level" varchar(20) NOT NULL DEFAULT 'standard',
  "source" varchar(50) NOT NULL DEFAULT 'paste',
  "source_ref" varchar(500) NOT NULL,
  "source_metadata" json DEFAULT '{}'::json,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Idempotency: imports with the same client + sourceRef update rather than duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS "brain_meetings_client_source_ref_idx"
  ON "brain_meetings" ("client_id", "source_ref");

CREATE INDEX IF NOT EXISTS "brain_meetings_client_status_idx"
  ON "brain_meetings" ("client_id", "status");

-- Meeting participants — relational link to crm_contacts + free-form fallback.
CREATE TABLE IF NOT EXISTS "brain_meeting_participants" (
  "id" serial PRIMARY KEY,
  "meeting_id" integer NOT NULL REFERENCES "brain_meetings"("id") ON DELETE CASCADE,
  "contact_id" integer REFERENCES "crm_contacts"("id") ON DELETE SET NULL,
  "name" varchar(255) NOT NULL,
  "email" varchar(255),
  "role_in_meeting" varchar(100),
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "brain_meeting_participants_meeting_idx"
  ON "brain_meeting_participants" ("meeting_id");

-- Brain tasks — minimal MVP shape. Phase 3 adds links to kanban cards / CRM activities.
CREATE TABLE IF NOT EXISTS "brain_tasks" (
  "id" serial PRIMARY KEY,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "meeting_id" integer REFERENCES "brain_meetings"("id") ON DELETE SET NULL,
  "title" varchar(500) NOT NULL,
  "description" text,
  "owner_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "status" varchar(20) NOT NULL DEFAULT 'open',
  "priority" varchar(20) NOT NULL DEFAULT 'medium',
  "due_date" timestamp,
  "blocked_reason" text,
  "source" varchar(50) NOT NULL DEFAULT 'manual',
  "created_by_ai" boolean NOT NULL DEFAULT false,
  "needs_review" boolean NOT NULL DEFAULT false,
  "compliance_flag" boolean NOT NULL DEFAULT false,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "brain_tasks_client_status_idx"
  ON "brain_tasks" ("client_id", "status");

CREATE INDEX IF NOT EXISTS "brain_tasks_owner_idx"
  ON "brain_tasks" ("owner_id");

-- AI review queue — every AI proposal lands here pending human approval.
CREATE TABLE IF NOT EXISTS "brain_ai_review_items" (
  "id" serial PRIMARY KEY,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "source_type" varchar(50) NOT NULL,
  "source_id" integer NOT NULL,
  "proposed_type" varchar(50) NOT NULL,
  "proposed_payload" json NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "reviewed_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp,
  "result_entity_type" varchar(50),
  "result_entity_id" integer,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "brain_ai_review_items_client_status_idx"
  ON "brain_ai_review_items" ("client_id", "status");

CREATE INDEX IF NOT EXISTS "brain_ai_review_items_source_idx"
  ON "brain_ai_review_items" ("source_type", "source_id");

-- AI processing jobs — async tracking for long-running operations.
CREATE TABLE IF NOT EXISTS "brain_ai_jobs" (
  "id" serial PRIMARY KEY,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "job_type" varchar(50) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'queued',
  "input" json DEFAULT '{}'::json,
  "output" json DEFAULT '{}'::json,
  "error" text,
  "input_tokens" integer NOT NULL DEFAULT 0,
  "output_tokens" integer NOT NULL DEFAULT 0,
  "credits_charged" integer NOT NULL DEFAULT 0,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "started_at" timestamp,
  "completed_at" timestamp
);

CREATE INDEX IF NOT EXISTS "brain_ai_jobs_client_status_idx"
  ON "brain_ai_jobs" ("client_id", "status");

-- Audit log — every approval / reject / edit / write touches this.
CREATE TABLE IF NOT EXISTS "brain_audit_logs" (
  "id" serial PRIMARY KEY,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "actor_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "action" varchar(100) NOT NULL,
  "entity_type" varchar(50),
  "entity_id" integer,
  "metadata" json DEFAULT '{}'::json,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "brain_audit_logs_client_idx"
  ON "brain_audit_logs" ("client_id", "created_at");
