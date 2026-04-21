-- Phase 3: sprint ordering + done column marker

-- Per-sprint card ordering (independent from column order)
ALTER TABLE "kanban_cards" ADD COLUMN IF NOT EXISTS "sprint_order" integer;

-- Backfill sprint_order per (project_id, sprint_id) using existing order
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY sprint_id ORDER BY "order", id) AS n
  FROM "kanban_cards"
  WHERE sprint_id IS NOT NULL AND sprint_order IS NULL
)
UPDATE "kanban_cards" SET "sprint_order" = ordered.n FROM ordered WHERE "kanban_cards".id = ordered.id;

-- Mark a kanban column as the "done" column for the project (for sprint reports)
ALTER TABLE "kanban_columns" ADD COLUMN IF NOT EXISTS "is_done" boolean DEFAULT false NOT NULL;
