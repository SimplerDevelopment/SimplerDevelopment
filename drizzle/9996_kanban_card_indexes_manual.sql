-- Kanban board/card performance indexes (hand-written; tracker is out of sync, db:generate refuses).
-- Mirrors the index() definitions added to lib/db/schema/pm.ts.
--
-- Every board load filters kanban_cards / kanban_columns by project_id and groups
-- cards by column_id; every card-detail open filters the child tables by card_id.
-- Without these, Postgres seq-scans those tables on each load. Safe to re-run:
-- every statement is CONCURRENTLY + IF NOT EXISTS, no drops, no locks of consequence.
--
-- IMPORTANT: run this OUTSIDE a transaction (plain `psql -f`), not via drizzle-kit
-- migrate — CREATE INDEX CONCURRENTLY cannot run inside a transaction block. If a
-- CONCURRENTLY build is interrupted it can leave an INVALID index; drop it and
-- re-run that one statement if so (`DROP INDEX IF EXISTS <name>;`).

-- Board load: cards/columns by project, cards by column.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "kanban_columns_project_idx" ON "kanban_columns" ("project_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "kanban_cards_project_idx" ON "kanban_cards" ("project_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "kanban_cards_column_idx" ON "kanban_cards" ("column_id");

-- Card detail open: child tables keyed by card_id.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "kanban_card_files_card_idx" ON "kanban_card_files" ("card_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "kanban_card_comments_card_idx" ON "kanban_card_comments" ("card_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "kanban_card_time_logs_card_idx" ON "kanban_card_time_logs" ("card_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "kanban_card_activities_card_idx" ON "kanban_card_activities" ("card_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "kanban_card_checklist_items_card_idx" ON "kanban_card_checklist_items" ("card_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "kanban_card_artifacts_card_idx" ON "kanban_card_artifacts" ("card_id");

-- Card detail "blocking" (reverse dependency) lookup — the composite PK only
-- serves blocked_card_id; this serves blocker_card_id.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "kanban_card_dependencies_blocker_idx" ON "kanban_card_dependencies" ("blocker_card_id");
