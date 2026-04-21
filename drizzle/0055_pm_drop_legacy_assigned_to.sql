-- Phase 6 cleanup: drop legacy single-assignee column from kanban_cards.
-- The canonical source for card assignees is the kanban_card_assignees junction
-- (seeded from this column by migration 0051). All reads and writes now go
-- through the junction, so the scalar column is dead.

-- Final sync: any writes through the old PATCH path between 0051 and now could
-- have set "assigned_to" without mirroring into the junction. Reconcile before drop.
INSERT INTO "kanban_card_assignees" ("card_id", "user_id")
SELECT "id", "assigned_to"
FROM "kanban_cards"
WHERE "assigned_to" IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE "kanban_cards" DROP CONSTRAINT IF EXISTS "kanban_cards_assigned_to_users_id_fk";
ALTER TABLE "kanban_cards" DROP COLUMN IF EXISTS "assigned_to";
