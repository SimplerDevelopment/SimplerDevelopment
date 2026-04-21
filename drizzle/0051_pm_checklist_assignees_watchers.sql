-- Phase 2: checklists, multi-assignee, watchers

-- Checklist items
CREATE TABLE IF NOT EXISTS "kanban_card_checklist_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "card_id" integer NOT NULL REFERENCES "kanban_cards"("id") ON DELETE CASCADE,
  "text" varchar(500) NOT NULL,
  "completed" boolean DEFAULT false NOT NULL,
  "order" integer DEFAULT 0 NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "completed_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_kanban_card_checklist_card"
  ON "kanban_card_checklist_items" ("card_id", "order");

-- Multi-assignees (junction) - keep kanban_cards.assigned_to for back-compat during transition
CREATE TABLE IF NOT EXISTS "kanban_card_assignees" (
  "card_id" integer NOT NULL REFERENCES "kanban_cards"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("card_id", "user_id")
);

-- Backfill from existing single-assignee column
INSERT INTO "kanban_card_assignees" ("card_id", "user_id")
SELECT "id", "assigned_to"
FROM "kanban_cards"
WHERE "assigned_to" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Watchers
CREATE TABLE IF NOT EXISTS "kanban_card_watchers" (
  "card_id" integer NOT NULL REFERENCES "kanban_cards"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("card_id", "user_id")
);

-- Backfill: existing assignees watch their cards
INSERT INTO "kanban_card_watchers" ("card_id", "user_id")
SELECT "card_id", "user_id"
FROM "kanban_card_assignees"
ON CONFLICT DO NOTHING;

-- Backfill: card creators watch their cards
INSERT INTO "kanban_card_watchers" ("card_id", "user_id")
SELECT "id", "created_by"
FROM "kanban_cards"
WHERE "created_by" IS NOT NULL
ON CONFLICT DO NOTHING;
