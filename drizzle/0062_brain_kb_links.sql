-- Obsidian-style link graph for imported KB notes. Each row is one [[link]]
-- (or ![[embed]]) found in a source note. Backlinks come for free — query
-- the same table the other way.
--
-- to_note_id is nullable because Obsidian links can point to notes that
-- don't exist yet (or that we filtered out during import). The raw_target
-- is preserved so we can resolve later if the target lands.

CREATE TABLE IF NOT EXISTS "brain_kb_links" (
  "id" serial PRIMARY KEY,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "from_note_id" integer NOT NULL REFERENCES "brain_notes"("id") ON DELETE CASCADE,
  "to_note_id" integer REFERENCES "brain_notes"("id") ON DELETE SET NULL,
  "raw_target" varchar(500) NOT NULL,
  "anchor" varchar(255),
  "display_text" varchar(500),
  "link_type" varchar(20) NOT NULL DEFAULT 'wikilink',
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "brain_kb_links_from_idx"
  ON "brain_kb_links" ("from_note_id");

CREATE INDEX IF NOT EXISTS "brain_kb_links_to_idx"
  ON "brain_kb_links" ("to_note_id");

CREATE INDEX IF NOT EXISTS "brain_kb_links_client_idx"
  ON "brain_kb_links" ("client_id");
