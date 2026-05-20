-- Approval links + lightweight forks.
--
-- New table: `mcp_approval_links` — public-shareable tokens that point at
-- either an entity (post / pitch_deck / email_campaign / block_template) or
-- a staged `mcp_pending_changes` row. Public `/approve/[token]` route loads
-- by token and lets a non-authenticated reviewer approve/reject. Companion
-- helper `lib/mcp/approval-links.ts` mints rows; the MCP create/update tools
-- now return `{ approval: { url, previewUrl, token, ... } }`.
--
-- New columns: parent_*_id pointers for the fork tools (posts_fork,
-- decks_fork, email_campaigns_fork, block_templates_fork). No FK constraint
-- on self-referencing columns to keep nullability + circular references
-- simple — informational only.
--
-- NOTE: hand-written. The repo's drizzle meta snapshots have a pre-existing
-- collision (drizzle/meta/0004_snapshot.json / 0070 / 0072), documented in
-- project memory; `drizzle-kit generate` refuses to run until that resolves.
-- Mirrors lib/db/schema/approvals.ts + cms.ts + tools.ts + email.ts exactly.

-- ──────────────────────────────────────────────────────────────────────────
-- mcp_approval_links
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mcp_approval_links" (
  "id" serial PRIMARY KEY,
  "token" varchar(64) NOT NULL UNIQUE,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "link_type" varchar(20) NOT NULL,
  "entity_type" varchar(50) NOT NULL,
  "entity_id" integer,
  "pending_change_id" integer REFERENCES "mcp_pending_changes"("id") ON DELETE CASCADE,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "summary" varchar(500),
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "key_id" integer REFERENCES "portal_api_keys"("id") ON DELETE SET NULL,
  "reviewer_name" varchar(255),
  "reviewer_email" varchar(255),
  "review_note" text,
  "reviewed_at" timestamp,
  "expires_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT NOW()
);

-- Token lookup is the hot path for the public route. Single-column unique
-- index already exists via the UNIQUE constraint above; add a status + client
-- composite for the portal-side list view.
CREATE INDEX IF NOT EXISTS "mcp_approval_links_client_status_idx"
  ON "mcp_approval_links" ("client_id", "status", "created_at");

-- ──────────────────────────────────────────────────────────────────────────
-- Fork pointer columns
-- ──────────────────────────────────────────────────────────────────────────
-- All four are informational, nullable, no FK constraint — self-references
-- plus on-delete behavior get hairy and the parent pointer is purely for
-- traceability. If the parent is deleted, the fork stands on its own.

ALTER TABLE "posts"
  ADD COLUMN IF NOT EXISTS "parent_post_id" integer;

ALTER TABLE "pitch_decks"
  ADD COLUMN IF NOT EXISTS "parent_deck_id" integer;

ALTER TABLE "email_campaigns"
  ADD COLUMN IF NOT EXISTS "parent_campaign_id" integer;

ALTER TABLE "block_templates"
  ADD COLUMN IF NOT EXISTS "parent_template_id" integer;
