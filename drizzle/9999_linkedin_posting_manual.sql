-- LinkedIn posting integration (Phase A) — hand-written; tracker is out of sync, db:generate refuses.
-- Safe to re-run: every statement uses IF NOT EXISTS. No drops, no NOT NULL on existing data without a default.
-- Mirrors lib/db/schema/tools.ts (linkedinUserConnections + linkedinPosts).
--
-- Adds:
--   1. linkedin_user_connections — per-(client,user) OAuth grant; tokens AES-256-GCM encrypted at rest
--   2. linkedin_posts            — draft → scheduled → published pipeline (cron: process-linkedin-posts)

-- ─── linkedin_user_connections ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "linkedin_user_connections" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "member_urn" varchar(128) NOT NULL,
  "linkedin_name" varchar(320),
  "access_token_encrypted" text NOT NULL,
  "refresh_token_encrypted" text,
  "expires_at" timestamp with time zone NOT NULL,
  "refresh_token_expires_at" timestamp with time zone,
  "scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "linkedin_user_connections_client_user_unique"
  ON "linkedin_user_connections" ("client_id", "user_id");

-- ─── linkedin_posts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "linkedin_posts" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "text" varchar(3000) NOT NULL,
  "media_type" varchar(16) NOT NULL DEFAULT 'none',
  "media_url" text,
  "media_asset_urn" text,
  "link_in_comment" text,
  "status" varchar(16) NOT NULL DEFAULT 'draft',
  "scheduled_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "linkedin_post_id" text,
  "permalink" text,
  "error" text,
  "created_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "linkedin_posts_status_scheduled_idx"
  ON "linkedin_posts" ("status", "scheduled_at");

CREATE INDEX IF NOT EXISTS "linkedin_posts_client_idx"
  ON "linkedin_posts" ("client_id");
