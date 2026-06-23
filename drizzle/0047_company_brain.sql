-- Company Brain — Phase 0
-- Per-client config row that gates the feature module on/off and stores
-- industry template + module toggles. Subsequent phases add meetings, tasks,
-- review queue, audit logs, etc. (see .planning/audits/companyBrain-adjusted.md)

CREATE TABLE IF NOT EXISTS "brain_profiles" (
  "id" serial PRIMARY KEY,
  "client_id" integer NOT NULL UNIQUE REFERENCES "clients"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "industry_template" varchar(50) NOT NULL DEFAULT 'generic',
  "enabled" boolean NOT NULL DEFAULT false,
  "default_confidentiality" varchar(20) NOT NULL DEFAULT 'standard',
  "ai_provider" varchar(50) NOT NULL DEFAULT 'anthropic',
  "embedding_provider" varchar(50),
  "enabled_modules" json NOT NULL DEFAULT '{"meetings":true,"tasks":true,"prospects":false,"knowledge":false,"ask":false}'::json,
  "service_lines" json NOT NULL DEFAULT '[]'::json,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
