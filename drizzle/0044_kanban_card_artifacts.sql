-- Kanban card artifacts: link external resources (websites, campaigns, pitch decks, proposals, bookings, surveys, projects) to a task
CREATE TABLE IF NOT EXISTS "kanban_card_artifacts" (
  "id" serial PRIMARY KEY,
  "card_id" integer NOT NULL REFERENCES "kanban_cards"("id") ON DELETE CASCADE,
  "artifact_type" varchar(50) NOT NULL,
  "artifact_id" integer NOT NULL,
  "display_title" varchar(255) NOT NULL,
  "pinned" boolean NOT NULL DEFAULT false,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_kanban_card_artifacts_card" ON "kanban_card_artifacts" ("card_id");
CREATE INDEX IF NOT EXISTS "idx_kanban_card_artifacts_lookup" ON "kanban_card_artifacts" ("artifact_type", "artifact_id");
