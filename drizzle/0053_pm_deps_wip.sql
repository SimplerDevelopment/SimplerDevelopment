-- Phase 4: dependencies + WIP limits

-- Card dependencies ("blocked_card" is blocked by "blocker_card")
CREATE TABLE IF NOT EXISTS "kanban_card_dependencies" (
  "blocked_card_id" integer NOT NULL REFERENCES "kanban_cards"("id") ON DELETE CASCADE,
  "blocker_card_id" integer NOT NULL REFERENCES "kanban_cards"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("blocked_card_id", "blocker_card_id"),
  CHECK ("blocked_card_id" <> "blocker_card_id")
);

CREATE INDEX IF NOT EXISTS "idx_kanban_deps_blocked" ON "kanban_card_dependencies" ("blocked_card_id");
CREATE INDEX IF NOT EXISTS "idx_kanban_deps_blocker" ON "kanban_card_dependencies" ("blocker_card_id");

-- Column WIP limits (0 or null = unlimited)
ALTER TABLE "kanban_columns" ADD COLUMN IF NOT EXISTS "wip_limit" integer;
