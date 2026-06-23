-- CRM email sequences / cadences (Phase 2 of [[Spec - CRM Email Sync + Sequences]]).
-- Mirrors lib/db/schema/crm.ts crmSequences / crmSequenceSteps /
-- crmSequenceEnrollments / crmSequenceSends.
--
-- NOTE: hand-written (db:generate blocked by the meta-snapshot collision).
-- Apply out-of-band: push on dev, psql on staging/prod.

CREATE TABLE IF NOT EXISTS "crm_sequences" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL,
  "name" varchar(255) NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "crm_sequence_steps" (
  "id" serial PRIMARY KEY NOT NULL,
  "sequence_id" integer NOT NULL,
  "step_order" integer NOT NULL,
  "delay_hours" integer DEFAULT 0 NOT NULL,
  "subject" varchar(500) NOT NULL,
  "body_html" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "crm_sequence_enrollments" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL,
  "sequence_id" integer NOT NULL,
  "contact_id" integer NOT NULL,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "current_step" integer DEFAULT 0 NOT NULL,
  "enrolled_at" timestamp DEFAULT now() NOT NULL,
  "last_sent_at" timestamp,
  "halted_reason" varchar(50)
);

CREATE TABLE IF NOT EXISTS "crm_sequence_sends" (
  "id" serial PRIMARY KEY NOT NULL,
  "enrollment_id" integer NOT NULL,
  "step_id" integer NOT NULL,
  "sent_at" timestamp DEFAULT now() NOT NULL,
  "resend_email_id" varchar(255),
  "error" text
);

DO $$ BEGIN
  ALTER TABLE "crm_sequences" ADD CONSTRAINT "crm_sequences_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "crm_sequences" ADD CONSTRAINT "crm_sequences_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "crm_sequence_steps" ADD CONSTRAINT "crm_sequence_steps_sequence_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "crm_sequences"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "crm_sequence_enrollments" ADD CONSTRAINT "crm_sequence_enrollments_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "crm_sequence_enrollments" ADD CONSTRAINT "crm_sequence_enrollments_sequence_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "crm_sequences"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "crm_sequence_enrollments" ADD CONSTRAINT "crm_sequence_enrollments_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "crm_sequence_sends" ADD CONSTRAINT "crm_sequence_sends_enrollment_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "crm_sequence_enrollments"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "crm_sequence_sends" ADD CONSTRAINT "crm_sequence_sends_step_id_fk" FOREIGN KEY ("step_id") REFERENCES "crm_sequence_steps"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "crm_sequence_steps_seq_order_idx" ON "crm_sequence_steps" ("sequence_id", "step_order");
CREATE UNIQUE INDEX IF NOT EXISTS "crm_sequence_enrollments_seq_contact_idx" ON "crm_sequence_enrollments" ("sequence_id", "contact_id");
CREATE UNIQUE INDEX IF NOT EXISTS "crm_sequence_sends_enrollment_step_idx" ON "crm_sequence_sends" ("enrollment_id", "step_id");
