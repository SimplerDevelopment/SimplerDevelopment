-- Phase 1: card numbering, activity log, labels

-- projects.project_key: short identifier unique per client
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "project_key" varchar(10);

-- Backfill: first 4 letters of name (alnum only) + project id, uppercase
UPDATE "projects"
SET "project_key" = UPPER(
  CASE
    WHEN regexp_replace(COALESCE(name, ''), '[^A-Za-z0-9]', '', 'g') = '' THEN 'PRJ'
    ELSE LEFT(regexp_replace(COALESCE(name, ''), '[^A-Za-z0-9]', '', 'g'), 4)
  END
) || id::text
WHERE "project_key" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_projects_client_key"
  ON "projects" ("client_id", "project_key")
  WHERE "project_key" IS NOT NULL;

-- kanban_cards.number: unique per-project card number
ALTER TABLE "kanban_cards" ADD COLUMN IF NOT EXISTS "number" integer;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at, id) AS n
  FROM "kanban_cards"
  WHERE "number" IS NULL
)
UPDATE "kanban_cards" SET "number" = numbered.n
FROM numbered
WHERE "kanban_cards".id = numbered.id;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_kanban_cards_project_number"
  ON "kanban_cards" ("project_id", "number")
  WHERE "number" IS NOT NULL;

-- kanban_labels
CREATE TABLE IF NOT EXISTS "kanban_labels" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "name" varchar(50) NOT NULL,
  "color" varchar(7) NOT NULL DEFAULT '#6366f1',
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_kanban_labels_project" ON "kanban_labels" ("project_id");

-- kanban_card_labels (junction)
CREATE TABLE IF NOT EXISTS "kanban_card_labels" (
  "card_id" integer NOT NULL REFERENCES "kanban_cards"("id") ON DELETE CASCADE,
  "label_id" integer NOT NULL REFERENCES "kanban_labels"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("card_id", "label_id")
);

-- kanban_card_activities
CREATE TABLE IF NOT EXISTS "kanban_card_activities" (
  "id" serial PRIMARY KEY NOT NULL,
  "card_id" integer NOT NULL REFERENCES "kanban_cards"("id") ON DELETE CASCADE,
  "user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "type" varchar(50) NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_kanban_card_activities_card"
  ON "kanban_card_activities" ("card_id", "created_at" DESC);
