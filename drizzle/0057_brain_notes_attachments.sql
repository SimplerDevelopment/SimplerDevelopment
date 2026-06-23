-- Brain Knowledge — file attachments. One file per note. The note's body
-- still holds commentary; the file is the primary artifact. Files are stored
-- in S3 via lib/s3/upload and accessed through the existing /api/media/proxy
-- route. attachment_stored_key is kept so DELETE can clean up the S3 object
-- best-effort.

ALTER TABLE "brain_notes"
  ADD COLUMN IF NOT EXISTS "attachment_url"         varchar(1000),
  ADD COLUMN IF NOT EXISTS "attachment_filename"    varchar(500),
  ADD COLUMN IF NOT EXISTS "attachment_mime_type"   varchar(200),
  ADD COLUMN IF NOT EXISTS "attachment_file_size"   integer,
  ADD COLUMN IF NOT EXISTS "attachment_stored_key"  varchar(500);

-- Index lets us answer "which notes have files?" cheaply (e.g. for a future
-- "Files" filter or a knowledge-search-with-files-only mode).
CREATE INDEX IF NOT EXISTS "brain_notes_has_attachment_idx"
  ON "brain_notes" ("client_id", "updated_at" DESC)
  WHERE "attachment_stored_key" IS NOT NULL;
