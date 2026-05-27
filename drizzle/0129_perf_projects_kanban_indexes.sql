-- 0129_perf_projects_kanban_indexes.sql
-- Phase-1 perf indexes for the projects / kanban hot path. Adds covering
-- indexes for list-page and detail-page queries that previously fell back to
-- sequential scans on the cards/comments/files/activities tables.
--
-- IMPORTANT: drizzle-kit migrations are NOT run automatically in production
-- (the tracker is drifted vs. disk). Hand-apply this file against the metro
-- Railway DB BEFORE merging staging->main, or the new lib/db/schema/pm.ts
-- index declarations will be authoritative-but-unenforced and the query
-- planner will keep doing seq scans.
--
-- All statements use CREATE INDEX IF NOT EXISTS so the file is idempotent and
-- can be re-run safely.

-- projects
CREATE INDEX IF NOT EXISTS "projects_client_idx" ON "projects" ("client_id");
CREATE INDEX IF NOT EXISTS "projects_client_status_idx" ON "projects" ("client_id", "status");
CREATE INDEX IF NOT EXISTS "projects_client_updated_idx" ON "projects" ("client_id", "updated_at");

-- sprints
CREATE INDEX IF NOT EXISTS "sprints_project_idx" ON "sprints" ("project_id");
CREATE INDEX IF NOT EXISTS "sprints_project_order_idx" ON "sprints" ("project_id", "order");

-- kanban_columns
CREATE INDEX IF NOT EXISTS "kanban_columns_project_idx" ON "kanban_columns" ("project_id");
CREATE INDEX IF NOT EXISTS "kanban_columns_project_order_idx" ON "kanban_columns" ("project_id", "order");

-- kanban_cards
CREATE INDEX IF NOT EXISTS "kanban_cards_sprint_idx" ON "kanban_cards" ("sprint_id");
CREATE INDEX IF NOT EXISTS "kanban_cards_sprint_order_idx" ON "kanban_cards" ("sprint_id", "sprint_order");

-- kanban_card_files
CREATE INDEX IF NOT EXISTS "kanban_card_files_card_idx" ON "kanban_card_files" ("card_id");

-- kanban_card_comments
CREATE INDEX IF NOT EXISTS "kanban_card_comments_card_idx" ON "kanban_card_comments" ("card_id");
CREATE INDEX IF NOT EXISTS "kanban_card_comments_card_created_idx" ON "kanban_card_comments" ("card_id", "created_at");

-- kanban_card_time_logs
CREATE INDEX IF NOT EXISTS "kanban_card_time_logs_card_idx" ON "kanban_card_time_logs" ("card_id");

-- kanban_labels
CREATE INDEX IF NOT EXISTS "kanban_labels_project_idx" ON "kanban_labels" ("project_id");

-- kanban_card_activities
CREATE INDEX IF NOT EXISTS "kanban_card_activities_card_created_idx" ON "kanban_card_activities" ("card_id", "created_at");

-- kanban_card_checklist_items
CREATE INDEX IF NOT EXISTS "kanban_card_checklist_items_card_idx" ON "kanban_card_checklist_items" ("card_id");

-- kanban_card_dependencies (PK is (blocked_card_id, blocker_card_id);
-- this adds the reverse-lookup index on blocker_card_id alone)
CREATE INDEX IF NOT EXISTS "kanban_card_dependencies_blocker_idx" ON "kanban_card_dependencies" ("blocker_card_id");

-- project_artifacts (existing project_artifacts_project_idx already covers
-- the project_id-only filter via its (project_id, pinned, created_at)
-- prefix; this adds the project+type lookup used by the artifact-by-type
-- panels.)
CREATE INDEX IF NOT EXISTS "project_artifacts_project_type_idx" ON "project_artifacts" ("project_id", "artifact_type");
