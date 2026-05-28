-- Brain Phase 3 — Initiatives + Goals + polymorphic links.
--
-- Initiatives are the multi-quarter umbrella every other brain entity hangs
-- from (per the original strategic review: "single biggest win for what's
-- going on in this company right now"). Goals are OKR-shaped children of one
-- initiative. brain_initiative_links is the polymorphic join from an
-- initiative to a task / note / meeting / decision / topic / crm_deal /
-- crm_company — entity_type + entity_id, no per-type FK, so this migration
-- lands cleanly whether the sibling brain-restructure branch (which ships
-- brain_decisions + brain_topics) has merged or not.
--
-- Mirrors lib/db/schema/brain.ts (brainInitiatives / brainGoals /
-- brainInitiativeLinks at the bottom of the file).
--
-- Run manually against switchyard (per project memory: the drizzle meta
-- tracker is desynced, so schema changes are hand-applied):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/0120_brain_initiatives_goals.sql
-- Verify with:
--   \d brain_initiatives
--   \d brain_goals
--   \d brain_initiative_links
--
-- NOT idempotent on CREATE TABLE (these are brand new). Indexes use
-- IF NOT EXISTS so the file can be partially re-applied if it errored mid-run.
--
-- IMPORTANT: this migration must be hand-applied against metro BEFORE merging
-- staging → main. Memory entry feedback_sd2026_release_hand_migrate.md is
-- authoritative.

-- ─── brain_initiatives ───────────────────────────────────────────────────────
CREATE TABLE "brain_initiatives" (
  "id"                     serial PRIMARY KEY,
  "client_id"              integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "name"                   varchar(255) NOT NULL,
  "slug"                   varchar(150) NOT NULL,
  "description"            text,
  "status"                 varchar(20) NOT NULL DEFAULT 'planned',
  "priority"               varchar(20) NOT NULL DEFAULT 'medium',
  "owner_id"               integer REFERENCES "users"("id") ON DELETE SET NULL,
  "sponsor_id"             integer REFERENCES "users"("id") ON DELETE SET NULL,
  "start_date"             timestamp,
  "target_date"            timestamp,
  "closed_at"              timestamp,
  "close_reason"           text,
  "lessons_learned"        text,
  "confidentiality_level"  varchar(20) NOT NULL DEFAULT 'standard',
  "created_by"             integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"             timestamp NOT NULL DEFAULT now(),
  "updated_at"             timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "brain_initiatives_client_slug_idx"
  ON "brain_initiatives" ("client_id", "slug");

CREATE INDEX IF NOT EXISTS "brain_initiatives_client_status_idx"
  ON "brain_initiatives" ("client_id", "status");

CREATE INDEX IF NOT EXISTS "brain_initiatives_target_idx"
  ON "brain_initiatives" ("target_date");

-- ─── brain_goals ─────────────────────────────────────────────────────────────
CREATE TABLE "brain_goals" (
  "id"                     serial PRIMARY KEY,
  "client_id"              integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "initiative_id"          integer NOT NULL REFERENCES "brain_initiatives"("id") ON DELETE CASCADE,
  "title"                  varchar(255) NOT NULL,
  "description"            text,
  "status"                 varchar(20) NOT NULL DEFAULT 'open',
  "owner_id"               integer REFERENCES "users"("id") ON DELETE SET NULL,
  "unit"                   varchar(30),
  "target_metric"          integer,
  "current_metric"         integer,
  "last_progress_note"     text,
  "last_checked_in_at"     timestamp,
  "target_date"            timestamp,
  "sort_order"             integer NOT NULL DEFAULT 0,
  "created_by"             integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"             timestamp NOT NULL DEFAULT now(),
  "updated_at"             timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "brain_goals_client_initiative_idx"
  ON "brain_goals" ("client_id", "initiative_id");

CREATE INDEX IF NOT EXISTS "brain_goals_status_idx"
  ON "brain_goals" ("status");

-- ─── brain_initiative_links ──────────────────────────────────────────────────
-- Polymorphic — (entity_type, entity_id) has no FK. App-layer resolves.
CREATE TABLE "brain_initiative_links" (
  "id"             serial PRIMARY KEY,
  "client_id"      integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "initiative_id"  integer NOT NULL REFERENCES "brain_initiatives"("id") ON DELETE CASCADE,
  "entity_type"    varchar(30) NOT NULL,
  "entity_id"      integer NOT NULL,
  "pinned"         boolean NOT NULL DEFAULT false,
  "note"           text,
  "created_by"     integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"     timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "brain_initiative_links_init_entity_idx"
  ON "brain_initiative_links" ("initiative_id", "entity_type", "entity_id");

CREATE INDEX IF NOT EXISTS "brain_initiative_links_client_entity_idx"
  ON "brain_initiative_links" ("client_id", "entity_type", "entity_id");
