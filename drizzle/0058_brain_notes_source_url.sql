-- Brain Knowledge — record where a note's content came from. Required for
-- AI-driven website ingestion (MCP clients) so they can dedupe URLs before
-- re-saving them as notes. Indexed on (client_id, source_url) for fast
-- "does a note exist for this URL?" lookups.

ALTER TABLE "brain_notes"
  ADD COLUMN IF NOT EXISTS "source_url" varchar(1000);

-- Partial index — only notes with a source_url participate in dedup, so we
-- skip indexing the (huge) set of manual notes.
CREATE INDEX IF NOT EXISTS "brain_notes_source_url_idx"
  ON "brain_notes" ("client_id", "source_url")
  WHERE "source_url" IS NOT NULL;
