-- Media versioning — every replace bumps `media.version` and snapshots the
-- prior state into `media_versions`. Restore makes a snapshot row current and
-- pushes the just-replaced state as a new snapshot, so any version is round-
-- trippable. Snapshots cascade-delete with their media row.

ALTER TABLE "media"
  ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "media_versions" (
  "id" serial PRIMARY KEY,
  "media_id" integer NOT NULL REFERENCES "media"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "filename" varchar(255) NOT NULL,
  "stored_filename" varchar(255) NOT NULL,
  "mime_type" varchar(100) NOT NULL,
  "file_size" integer NOT NULL,
  "url" varchar(500) NOT NULL,
  "uploaded_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "media_versions_media_idx"
  ON "media_versions" ("media_id");

CREATE UNIQUE INDEX IF NOT EXISTS "media_versions_media_version_idx"
  ON "media_versions" ("media_id", "version");
