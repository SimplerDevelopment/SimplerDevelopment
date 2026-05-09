-- Polymorphic project ↔ artifact link table.
--
-- Run manually:
--   psql "$DATABASE_URL" -f drizzle/0101_project_artifacts.sql
--
-- Mirrors kanban_card_artifacts and crm_deal_artifacts. The artifact_type
-- vocabulary stays consistent across all three tables (website,
-- email_campaign, pitch_deck, proposal, booking, survey, post, brain_note),
-- and the linker routes share a lookup dictionary that resolves each
-- artifact's owning client + display title before insert.

CREATE TABLE IF NOT EXISTS "project_artifacts" (
    "id" serial PRIMARY KEY NOT NULL,
    "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
    "artifact_type" varchar(50) NOT NULL,
    "artifact_id" integer NOT NULL,
    "display_title" varchar(255) NOT NULL,
    "pinned" boolean DEFAULT false NOT NULL,
    "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "project_artifacts_project_idx"
    ON "project_artifacts" ("project_id", "pinned", "created_at");
