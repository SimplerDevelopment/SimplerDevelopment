-- Pitch-deck viewer analytics. One row per tracked event from the public
-- presenter (deck open + per-slide dwell). Mirrors lib/db/schema/tools.ts
-- pitchDeckViews. Hand-written (db:generate blocked by the meta collision).
CREATE TABLE IF NOT EXISTS "pitch_deck_views" (
  "id" serial PRIMARY KEY NOT NULL,
  "deck_id" integer NOT NULL,
  "session_id" varchar(100),
  "slide_index" integer,
  "dwell_ms" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE "pitch_deck_views" ADD CONSTRAINT "pitch_deck_views_deck_id_fk"
    FOREIGN KEY ("deck_id") REFERENCES "pitch_decks"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE INDEX IF NOT EXISTS "pitch_deck_views_deck_idx" ON "pitch_deck_views" ("deck_id", "created_at");
