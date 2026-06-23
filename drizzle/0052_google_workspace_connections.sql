-- Migration: Google Workspace integration — connection tables + crm_activities.via_user_id
-- Phase: 01-gcp-foundation-and-schema (google-workspace milestone)
-- Additive only. No data loss.

-- ─── Per-client connection (shared org-level Google account) ──────────────

CREATE TABLE "google_workspace_client_connections" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL UNIQUE REFERENCES "clients"("id") ON DELETE cascade,
  "google_account_email" varchar(320) NOT NULL,
  "google_account_id" varchar(64) NOT NULL,
  "access_token" text NOT NULL,
  "refresh_token" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "sync_settings" jsonb NOT NULL DEFAULT '{"aggressiveness":"moderate","storeBodies":true}'::jsonb,
  "gmail_history_id" varchar(64),
  "drive_start_page_token" varchar(128),
  "calendar_sync_token" text,
  "contacts_sync_token" text,
  "last_sync_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "google_workspace_client_connections_account_email_idx"
  ON "google_workspace_client_connections" ("google_account_email");

-- ─── Per-user connection (personal Google account scoped to one client) ───

CREATE TABLE "google_workspace_user_connections" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE cascade,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "google_account_email" varchar(320) NOT NULL,
  "google_account_id" varchar(64) NOT NULL,
  "access_token" text NOT NULL,
  "refresh_token" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "sync_settings" jsonb NOT NULL DEFAULT '{"aggressiveness":"passive","storeBodies":false}'::jsonb,
  "gmail_history_id" varchar(64),
  "drive_start_page_token" varchar(128),
  "calendar_sync_token" text,
  "contacts_sync_token" text,
  "last_sync_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "google_workspace_user_connections_client_user_unique" UNIQUE ("client_id", "user_id")
);

CREATE INDEX "google_workspace_user_connections_user_idx"
  ON "google_workspace_user_connections" ("user_id");

-- ─── crm_activities: provenance column ────────────────────────────────────

ALTER TABLE "crm_activities"
  ADD COLUMN "via_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL;

CREATE INDEX "crm_activities_via_user_idx"
  ON "crm_activities" ("via_user_id");
