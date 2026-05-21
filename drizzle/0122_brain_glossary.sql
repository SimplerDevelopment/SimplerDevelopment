-- Brain Phase 5 — Glossary
--
-- One table: brain_glossary_terms. Tenant-specific terminology — acronyms,
-- product codenames, customer segments, internal jargon. Flat (no hierarchy);
-- terms carry `aliases` (JSON string array, substring-matched on lookup) and
-- `related_term_ids` (JSON int array of "see also" pointers, NOT FK-enforced
-- because the user may reorder or delete — the app layer prunes broken refs).
--
-- Future Ask-query embedder will read this table to inject definitions into
-- prompts so acronyms resolve. This branch ships only the storage + lookup
-- surface; embedder integration is a separate branch.
--
-- Mirrors lib/db/schema/brain.ts (brainGlossaryTerms).

CREATE TABLE "brain_glossary_terms" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE cascade,
  "term" varchar(200) NOT NULL,
  "slug" varchar(200) NOT NULL,
  "definition" text NOT NULL,
  "short_definition" varchar(500),
  "aliases" json DEFAULT '[]'::json NOT NULL,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "category" varchar(100),
  "owner_id" integer REFERENCES "users"("id") ON DELETE set null,
  "related_term_ids" json DEFAULT '[]'::json NOT NULL,
  "source" varchar(50) DEFAULT 'manual' NOT NULL,
  "review_item_id" integer,
  "created_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "brain_glossary_client_slug_idx"
  ON "brain_glossary_terms" ("client_id", "slug");

CREATE INDEX IF NOT EXISTS "brain_glossary_client_status_idx"
  ON "brain_glossary_terms" ("client_id", "status");

CREATE INDEX IF NOT EXISTS "brain_glossary_category_idx"
  ON "brain_glossary_terms" ("category");
