-- Schema-only columns: catch up drizzle/*.sql to lib/db/schema/*.ts.
--
-- The drizzle meta tracker (`drizzle/meta/_journal.json`) is stuck on an
-- older collision, so `bun run db:generate` refuses to produce a clean
-- diff. The integration-test template builder (tests/helpers/test-db.ts)
-- replays every numbered drizzle/*.sql file into a fresh template and
-- then falls back to `drizzle-kit push --force` to heal drift. That
-- fallback silently refuses to add a column when it would create a
-- UNIQUE constraint/index on an already-populated small table — which
-- means columns like `client_websites.preview_code` and the four
-- `google_workspace_user_connections.drive_channel_*` columns never
-- made it into the test template. Any integration test that SELECTs
-- those columns explodes with `column "X" does not exist`.
--
-- This migration hand-applies the missing columns. Idempotent — every
-- statement uses IF NOT EXISTS, and the UNIQUE constraint/index adds
-- are guarded by a pg_constraint / pg_class check (PG doesn't accept
-- IF NOT EXISTS on ADD CONSTRAINT).
--
-- Mirrors lib/db/schema/sites.ts (clientWebsites.previewCode) and
-- lib/db/schema/tools.ts (googleWorkspaceUserConnections.driveChannel*).
-- On the prod-dryrun DB (where these columns were hand-applied earlier
-- via psql) this file is a no-op.

-- ─── client_websites.preview_code (UNIQUE) ────────────────────────────────
ALTER TABLE "client_websites"
  ADD COLUMN IF NOT EXISTS "preview_code" varchar(64);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_websites_preview_code_unique'
  ) THEN
    ALTER TABLE "client_websites"
      ADD CONSTRAINT "client_websites_preview_code_unique" UNIQUE ("preview_code");
  END IF;
END $$;

-- ─── google_workspace_user_connections: drive.changes.watch push channel ───
ALTER TABLE "google_workspace_user_connections"
  ADD COLUMN IF NOT EXISTS "drive_channel_id" varchar(64);
ALTER TABLE "google_workspace_user_connections"
  ADD COLUMN IF NOT EXISTS "drive_channel_resource_id" varchar(64);
ALTER TABLE "google_workspace_user_connections"
  ADD COLUMN IF NOT EXISTS "drive_channel_expiration" timestamp;
ALTER TABLE "google_workspace_user_connections"
  ADD COLUMN IF NOT EXISTS "drive_channel_token" varchar(64);

-- schema declares `uniqueIndex('google_workspace_user_connections_drive_channel_id')`
CREATE UNIQUE INDEX IF NOT EXISTS "google_workspace_user_connections_drive_channel_id"
  ON "google_workspace_user_connections" ("drive_channel_id");
