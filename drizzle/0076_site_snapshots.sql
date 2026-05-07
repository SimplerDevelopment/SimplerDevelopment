-- Site snapshots — portable export/import of an entire client website.
-- See lib/db/schema/snapshots.ts. Hand-applied (tracker is drifted; do not
-- run `bun run db:migrate` on this file).

CREATE TABLE IF NOT EXISTS "site_snapshots" (
  "id" serial PRIMARY KEY,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "description" text,
  "source_site_id" integer REFERENCES "client_websites"("id") ON DELETE SET NULL,
  "payload" json NOT NULL,
  "version" integer NOT NULL DEFAULT 1,
  "is_public" boolean NOT NULL DEFAULT false,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "site_snapshots_client_idx"
  ON "site_snapshots" ("client_id");

CREATE INDEX IF NOT EXISTS "site_snapshots_source_site_idx"
  ON "site_snapshots" ("source_site_id");
