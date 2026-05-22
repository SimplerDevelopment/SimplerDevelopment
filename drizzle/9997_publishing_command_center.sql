-- Publishing Command Center — PUB-2 foundation (hand-written; tracker is out of sync, db:generate refuses).
-- Safe to re-run: every statement uses IF NOT EXISTS. No drops, no NOT NULL on existing data without a default.
--
-- Adds:
--   1. publishing_campaigns          — cross-channel groupings ("Fall 2026 outbound")
--   2. publishing_permissions        — per-user selective stage/action gating
--   3. projects.system_kind          — flags system-managed projects (hidden from /portal/projects list)
--   4. clients.publishing_project_id — per-client pointer to the Publishing board project
--   5. clients.default_timezone      — IANA tz the Publishing UI renders dates in
--   6. kanban_cards.campaign_id      — cross-channel campaign grouping
--   7. kanban_cards.scheduled_for    — when this card should publish on its channel

-- ─── publishing_campaigns ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "publishing_campaigns" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "slug" varchar(100) NOT NULL,
  "description" text,
  "color" varchar(7) NOT NULL DEFAULT '#6366f1',
  "start_date" timestamp,
  "end_date" timestamp,
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "publishing_campaigns_client_slug_idx"
  ON "publishing_campaigns" ("client_id", "slug");

CREATE INDEX IF NOT EXISTS "publishing_campaigns_client_status_idx"
  ON "publishing_campaigns" ("client_id", "status");

-- ─── publishing_permissions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "publishing_permissions" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "permission_key" varchar(40) NOT NULL,
  "granted_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "publishing_permissions_client_user_key_idx"
  ON "publishing_permissions" ("client_id", "user_id", "permission_key");

CREATE INDEX IF NOT EXISTS "publishing_permissions_client_user_idx"
  ON "publishing_permissions" ("client_id", "user_id");

-- ─── projects.system_kind ──────────────────────────────────────────────────
-- Nullable: regular user-created projects keep system_kind = NULL.
ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "system_kind" varchar(30);

-- ─── clients.publishing_project_id, clients.default_timezone ───────────────
ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "publishing_project_id" integer;

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "default_timezone" varchar(60) NOT NULL DEFAULT 'UTC';

-- ─── kanban_cards.campaign_id, kanban_cards.scheduled_for ──────────────────
-- campaign_id deliberately has no FK constraint here so the publishing board
-- can survive a campaign delete; the API enforces nullification.
ALTER TABLE "kanban_cards"
  ADD COLUMN IF NOT EXISTS "campaign_id" integer;

ALTER TABLE "kanban_cards"
  ADD COLUMN IF NOT EXISTS "scheduled_for" timestamp;

CREATE INDEX IF NOT EXISTS "kanban_cards_campaign_idx"
  ON "kanban_cards" ("campaign_id");

CREATE INDEX IF NOT EXISTS "kanban_cards_scheduled_for_idx"
  ON "kanban_cards" ("scheduled_for");
