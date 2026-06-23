-- Company Brain — Phase 1
-- Relationships overlay: Brain-only fields layered onto crm_companies or
-- crm_deals. Exactly one of (company_id, deal_id) is non-null per row.
-- Also adds optional CRM links to brain_tasks so the relationship detail
-- page can show "open tasks for this relationship."

ALTER TABLE "brain_tasks"
  ADD COLUMN IF NOT EXISTS "company_id" integer
  REFERENCES "crm_companies"("id") ON DELETE SET NULL;

ALTER TABLE "brain_tasks"
  ADD COLUMN IF NOT EXISTS "deal_id" integer
  REFERENCES "crm_deals"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "brain_tasks_company_idx"
  ON "brain_tasks" ("company_id") WHERE "company_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "brain_tasks_deal_idx"
  ON "brain_tasks" ("deal_id") WHERE "deal_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "brain_relationship_overlays" (
  "id" serial PRIMARY KEY,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "company_id" integer REFERENCES "crm_companies"("id") ON DELETE CASCADE,
  "deal_id" integer REFERENCES "crm_deals"("id") ON DELETE CASCADE,
  "relationship_type" varchar(50) NOT NULL DEFAULT 'generic',
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "owner_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "secondary_owner_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "priority" varchar(20) NOT NULL DEFAULT 'medium',
  "service_lines" json NOT NULL DEFAULT '[]'::json,
  "summary" text,
  "current_priorities" text,
  "open_loops" text,
  "last_touch_at" timestamp,
  "next_review_at" timestamp,
  "confidentiality_level" varchar(20) NOT NULL DEFAULT 'standard',
  "compliance_flags" json NOT NULL DEFAULT '[]'::json,
  "source_system" varchar(100),
  "external_url" varchar(1000),
  "stale_after_days" integer,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  -- Exactly one of company_id / deal_id must be non-null.
  CONSTRAINT "brain_overlay_one_target" CHECK (
    ("company_id" IS NOT NULL AND "deal_id" IS NULL)
    OR ("company_id" IS NULL AND "deal_id" IS NOT NULL)
  )
);

-- Idempotency: at most one overlay per (client, company) and (client, deal).
CREATE UNIQUE INDEX IF NOT EXISTS "brain_overlay_company_uniq"
  ON "brain_relationship_overlays" ("client_id", "company_id")
  WHERE "company_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "brain_overlay_deal_uniq"
  ON "brain_relationship_overlays" ("client_id", "deal_id")
  WHERE "deal_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "brain_overlay_client_priority_idx"
  ON "brain_relationship_overlays" ("client_id", "priority", "status");

CREATE INDEX IF NOT EXISTS "brain_overlay_owner_idx"
  ON "brain_relationship_overlays" ("owner_id");

CREATE INDEX IF NOT EXISTS "brain_overlay_next_review_idx"
  ON "brain_relationship_overlays" ("client_id", "next_review_at")
  WHERE "next_review_at" IS NOT NULL;
