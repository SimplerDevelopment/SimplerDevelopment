-- Phase 1: Five new survey tables for Phases 3-9
-- Additive only — no existing data modified except nullable column addition

-- 1. Partial responses (Phase 3)
CREATE TABLE IF NOT EXISTS "survey_partial_responses" (
  "id" serial PRIMARY KEY NOT NULL,
  "survey_id" integer NOT NULL REFERENCES "surveys"("id") ON DELETE CASCADE,
  "session_id" varchar(64) NOT NULL,
  "answers" json NOT NULL DEFAULT '{}',
  "last_page" integer NOT NULL DEFAULT 0,
  "respondent_email" varchar(255),
  "source" varchar(30) DEFAULT 'link',
  "source_id" varchar(255),
  "ip_address" varchar(45),
  "user_agent" text,
  "completed" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- 2. Webhooks (Phase 4)
CREATE TABLE IF NOT EXISTS "survey_webhooks" (
  "id" serial PRIMARY KEY NOT NULL,
  "survey_id" integer NOT NULL REFERENCES "surveys"("id") ON DELETE CASCADE,
  "url" varchar(500) NOT NULL,
  "secret" varchar(64),
  "events" json NOT NULL DEFAULT '["response.submitted"]',
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- 3. Email sequences (Phase 5)
CREATE TABLE IF NOT EXISTS "survey_email_sequences" (
  "id" serial PRIMARY KEY NOT NULL,
  "survey_id" integer NOT NULL REFERENCES "surveys"("id") ON DELETE CASCADE,
  "subject" varchar(255) NOT NULL,
  "body_html" text NOT NULL,
  "delay_hours" integer NOT NULL DEFAULT 0,
  "condition_field" varchar(64),
  "condition_value" varchar(255),
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- 4. A/B variants (Phase 8)
CREATE TABLE IF NOT EXISTS "survey_variants" (
  "id" serial PRIMARY KEY NOT NULL,
  "survey_id" integer NOT NULL REFERENCES "surveys"("id") ON DELETE CASCADE,
  "name" varchar(100) NOT NULL,
  "fields" json NOT NULL DEFAULT '[]',
  "weight" integer NOT NULL DEFAULT 50,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- 5. AI summaries cache (Phase 7)
CREATE TABLE IF NOT EXISTS "survey_ai_summaries" (
  "id" serial PRIMARY KEY NOT NULL,
  "survey_id" integer NOT NULL UNIQUE REFERENCES "surveys"("id") ON DELETE CASCADE,
  "summary" text NOT NULL,
  "sentiment" varchar(20),
  "themes" json,
  "per_question" json,
  "response_count_at_generation" integer,
  "generated_at" timestamp DEFAULT now() NOT NULL
);

-- Column addition to existing table (nullable — safe for existing rows)
ALTER TABLE "survey_responses" ADD COLUMN IF NOT EXISTS "variant_id" integer REFERENCES "survey_variants"("id") ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_partial_responses_survey" ON "survey_partial_responses" ("survey_id");
CREATE INDEX IF NOT EXISTS "idx_partial_responses_session" ON "survey_partial_responses" ("session_id");
CREATE INDEX IF NOT EXISTS "idx_survey_webhooks_survey" ON "survey_webhooks" ("survey_id");
CREATE INDEX IF NOT EXISTS "idx_survey_email_sequences_survey" ON "survey_email_sequences" ("survey_id");
CREATE INDEX IF NOT EXISTS "idx_survey_variants_survey" ON "survey_variants" ("survey_id");
