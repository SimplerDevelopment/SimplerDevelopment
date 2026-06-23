-- Migration: Track Gmail watch() expiration per user connection
-- Phase: post 0054 — Gmail watch lifecycle
-- Additive only.
--
-- Gmail's users.watch() returns a {historyId, expiration} pair. Expiration is
-- ~7 days out and we MUST re-watch before then or we stop receiving Pub/Sub
-- pushes for that user. The daily cron at /api/cron/renew-gmail-watches
-- consults this column to decide who needs re-watching.

ALTER TABLE "google_workspace_user_connections"
  ADD COLUMN IF NOT EXISTS "gmail_watch_expiration" timestamp;

CREATE INDEX IF NOT EXISTS "google_workspace_user_connections_watch_exp_idx"
  ON "google_workspace_user_connections" ("gmail_watch_expiration");
