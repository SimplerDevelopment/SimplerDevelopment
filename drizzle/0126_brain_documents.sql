-- Brain Phase 7 — Documents (Wave 1).
--
-- Adds five tables for versioned SOPs / policies / required-reads w/
-- acknowledgments:
--   1) brain_documents                — top-level wrapper (status, slug, owner,
--                                        soft pointers to current draft /
--                                        published version).
--   2) brain_document_versions        — immutable per-version markdown body +
--                                        publish metadata.
--   3) brain_document_required_reads  — assigns a document (optionally pinned
--                                        to a version) as required reading
--                                        for a person OR org unit.
--   4) brain_document_acknowledgments — one row per person×version ack.
--   5) brain_document_links           — polymorphic links to topic /
--                                        initiative / decision / meeting /
--                                        glossary_term / person.
--
-- Circular-FK note:
--   brain_documents has two pointer columns — current_published_version_id
--   and current_draft_version_id — that conceptually reference
--   brain_document_versions(id). But brain_document_versions.document_id
--   already references brain_documents(id), so a hard FK both ways forms a
--   cycle that complicates the migration order. We mirror the
--   brain_initiative_links.entity_id precedent: both pointer columns are
--   plain integer columns with NO FK constraint and are validated at the
--   app layer (lib/brain/documents.ts). This keeps the SQL linear.
--
-- See lib/db/schema/brain.ts for column docs. Idempotent: every CREATE is
-- guarded by IF NOT EXISTS on indexes; tables themselves are guarded by
-- CREATE TABLE IF NOT EXISTS so a re-run is a no-op. Hand-applied to
-- switchyard locally (drizzle journal is stuck on an older collision — see
-- drizzle/0119_schema_only_columns.sql header). Operator applies to metro
-- before staging→main merge.
--
-- Declaration order matters for FKs:
--   1) brain_documents               — referenced by every other table here.
--   2) brain_document_versions       — references brain_documents.
--   3) brain_document_required_reads — references brain_documents + versions.
--   4) brain_document_acknowledgments — references all of the above + people.
--   5) brain_document_links          — references brain_documents.

-- ─── brain_documents ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "brain_documents" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE cascade,
  "title" varchar(255) NOT NULL,
  "slug" varchar(255) NOT NULL,
  "category" varchar(30) DEFAULT 'reference' NOT NULL,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "owner_id" integer REFERENCES "users"("id") ON DELETE set null,
  -- Soft pointers — intentionally no FK constraint; validated at app layer.
  -- See header note about the circular FK with brain_document_versions.
  "current_published_version_id" integer,
  "current_draft_version_id" integer,
  "published_at" timestamp,
  "archived_at" timestamp,
  "archive_reason" text,
  "source_note_id" integer REFERENCES "brain_notes"("id") ON DELETE set null,
  "confidentiality_level" varchar(20) DEFAULT 'standard' NOT NULL,
  "default_topic_ids" json DEFAULT '[]'::json NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "brain_documents_client_slug_idx"
  ON "brain_documents" ("client_id", "slug");
CREATE INDEX IF NOT EXISTS "brain_documents_client_status_idx"
  ON "brain_documents" ("client_id", "status");
CREATE INDEX IF NOT EXISTS "brain_documents_category_idx"
  ON "brain_documents" ("category");

-- ─── brain_document_versions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "brain_document_versions" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE cascade,
  "document_id" integer NOT NULL REFERENCES "brain_documents"("id") ON DELETE cascade,
  "version_number" integer NOT NULL,
  "body" text NOT NULL,
  "title" varchar(255) NOT NULL,
  "summary" text,
  "change_notes" text,
  "is_draft" boolean DEFAULT true NOT NULL,
  "published_at" timestamp,
  "published_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "brain_document_versions_doc_version_idx"
  ON "brain_document_versions" ("document_id", "version_number");
CREATE INDEX IF NOT EXISTS "brain_document_versions_doc_idx"
  ON "brain_document_versions" ("document_id");
CREATE INDEX IF NOT EXISTS "brain_document_versions_draft_idx"
  ON "brain_document_versions" ("is_draft");

-- ─── brain_document_required_reads ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "brain_document_required_reads" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE cascade,
  "document_id" integer NOT NULL REFERENCES "brain_documents"("id") ON DELETE cascade,
  -- null = "always the current published version" (re-ack on each publish).
  "pinned_version_id" integer REFERENCES "brain_document_versions"("id") ON DELETE set null,
  "target_type" varchar(30) NOT NULL,
  -- Polymorphic: brain_people.id (target_type='person') or
  -- brain_org_units.id (target_type='org_unit'). NOT FK-enforced.
  "target_id" integer NOT NULL,
  "due_at" timestamp,
  "assigned_by" integer REFERENCES "users"("id") ON DELETE set null,
  "assigned_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "brain_document_required_reads_doc_target_idx"
  ON "brain_document_required_reads" ("document_id", "target_type", "target_id");
CREATE INDEX IF NOT EXISTS "brain_document_required_reads_target_idx"
  ON "brain_document_required_reads" ("target_type", "target_id");
CREATE INDEX IF NOT EXISTS "brain_document_required_reads_due_idx"
  ON "brain_document_required_reads" ("due_at");

-- ─── brain_document_acknowledgments ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "brain_document_acknowledgments" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE cascade,
  "document_id" integer NOT NULL REFERENCES "brain_documents"("id") ON DELETE cascade,
  "version_id" integer NOT NULL REFERENCES "brain_document_versions"("id") ON DELETE cascade,
  "person_id" integer NOT NULL REFERENCES "brain_people"("id") ON DELETE cascade,
  "required_read_id" integer REFERENCES "brain_document_required_reads"("id") ON DELETE set null,
  "acknowledgment_note" text,
  "acknowledged_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "brain_document_acks_doc_version_person_idx"
  ON "brain_document_acknowledgments" ("document_id", "version_id", "person_id");
CREATE INDEX IF NOT EXISTS "brain_document_acks_person_idx"
  ON "brain_document_acknowledgments" ("person_id");
CREATE INDEX IF NOT EXISTS "brain_document_acks_version_idx"
  ON "brain_document_acknowledgments" ("version_id");

-- ─── brain_document_links ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "brain_document_links" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE cascade,
  "document_id" integer NOT NULL REFERENCES "brain_documents"("id") ON DELETE cascade,
  "entity_type" varchar(30) NOT NULL,
  "entity_id" integer NOT NULL,
  "note" text,
  "created_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "brain_document_links_doc_entity_idx"
  ON "brain_document_links" ("document_id", "entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "brain_document_links_client_entity_idx"
  ON "brain_document_links" ("client_id", "entity_type", "entity_id");
