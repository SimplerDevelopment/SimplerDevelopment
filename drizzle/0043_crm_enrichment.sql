-- Phase 31: CRM Enrichment Schema Foundation
-- SCHEMA-01: New columns on crm_contacts
ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "linkedin_url" varchar(500);
ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "seniority" varchar(100);
ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "department" varchar(100);

-- SCHEMA-02: New columns on crm_companies
ALTER TABLE "crm_companies" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "crm_companies" ADD COLUMN IF NOT EXISTS "logo_url" varchar(500);
ALTER TABLE "crm_companies" ADD COLUMN IF NOT EXISTS "revenue" varchar(100);
ALTER TABLE "crm_companies" ADD COLUMN IF NOT EXISTS "employee_count" integer;
ALTER TABLE "crm_companies" ADD COLUMN IF NOT EXISTS "founded_year" integer;
ALTER TABLE "crm_companies" ADD COLUMN IF NOT EXISTS "linkedin_url" varchar(500);
ALTER TABLE "crm_companies" ADD COLUMN IF NOT EXISTS "twitter_url" varchar(500);
ALTER TABLE "crm_companies" ADD COLUMN IF NOT EXISTS "facebook_url" varchar(500);

-- SCHEMA-03: Per-tenant enrichment configuration
CREATE TABLE IF NOT EXISTS "crm_enrichment_config" (
  "client_id" integer PRIMARY KEY REFERENCES "clients"("id") ON DELETE CASCADE,
  "enabled" boolean NOT NULL DEFAULT false,
  "key_source" varchar(20) NOT NULL DEFAULT 'platform',
  "own_api_key" varchar(500),
  "platform_credit_balance" integer NOT NULL DEFAULT 0,
  "cost_per_enrichment" integer NOT NULL DEFAULT 1,
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- SCHEMA-04: Enrichment event log
CREATE TABLE IF NOT EXISTS "crm_enrichment_log" (
  "id" serial PRIMARY KEY,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "entity_type" varchar(20) NOT NULL,
  "entity_id" integer NOT NULL,
  "provider" varchar(50) NOT NULL,
  "fields_populated" json DEFAULT '[]',
  "field_changes" json DEFAULT '{}',
  "cost" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Index for enrichment log queries by tenant (prevents full table scans)
CREATE INDEX IF NOT EXISTS "idx_crm_enrichment_log_client" ON "crm_enrichment_log" ("client_id");

-- Composite index for entity-level history queries (Phase 34 history tab)
CREATE INDEX IF NOT EXISTS "idx_crm_enrichment_log_entity" ON "crm_enrichment_log" ("entity_type", "entity_id");
