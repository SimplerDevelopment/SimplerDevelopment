-- Add formatVersion column to pitch_decks for block editor migration
ALTER TABLE "pitch_decks" ADD COLUMN IF NOT EXISTS "format_version" integer DEFAULT 1 NOT NULL;

-- Add formatVersion column to pitch_deck_versions for version history
ALTER TABLE "pitch_deck_versions" ADD COLUMN IF NOT EXISTS "format_version" integer DEFAULT 1 NOT NULL;
