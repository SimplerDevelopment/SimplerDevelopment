ALTER TABLE "brain_notes" ADD COLUMN "deleted_at" timestamp;

CREATE INDEX IF NOT EXISTS "brain_notes_tags_gin_idx"
  ON "brain_notes" USING gin ((tags::jsonb) jsonb_path_ops);

CREATE INDEX IF NOT EXISTS "brain_notes_client_active_idx"
  ON "brain_notes" ("client_id", "deleted_at") WHERE "deleted_at" IS NULL;
