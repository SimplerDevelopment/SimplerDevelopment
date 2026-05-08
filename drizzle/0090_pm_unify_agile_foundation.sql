-- Unify project flavors + agile foundation (Wave 1).
-- Hand-applied SQL because the Drizzle meta tracker is out of sync (see
-- memory: project_sd2026_drizzle_tracker_drift). Apply with:
--   psql "$DATABASE_URL" -f drizzle/0090_pm_unify_agile_foundation.sql

-- 1. Per-project member roles (replaces the boolean isPrivate gate)
CREATE TABLE IF NOT EXISTS "project_members" (
    "id" serial PRIMARY KEY NOT NULL,
    "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
    "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "role" varchar(20) DEFAULT 'viewer' NOT NULL,
    "added_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
    "added_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "project_members_project_user_idx"
    ON "project_members" ("project_id", "user_id");

CREATE INDEX IF NOT EXISTS "project_members_user_idx"
    ON "project_members" ("user_id");

-- 2. Agile fields on kanban_cards
ALTER TABLE "kanban_cards"
    ADD COLUMN IF NOT EXISTS "story_points" integer,
    ADD COLUMN IF NOT EXISTS "card_type" varchar(20) DEFAULT 'task' NOT NULL,
    ADD COLUMN IF NOT EXISTS "parent_card_id" integer,
    ADD COLUMN IF NOT EXISTS "workflow_state" varchar(20) DEFAULT 'todo' NOT NULL;

-- parent_card_id is intentionally not a hard FK (self-referential, cascade
-- semantics are messy when an epic is deleted but its stories should survive
-- as orphans). App code is responsible for validating the reference.

-- 3. Sprint scope history (powers burndown / velocity)
CREATE TABLE IF NOT EXISTS "sprint_scope_history" (
    "id" serial PRIMARY KEY NOT NULL,
    "sprint_id" integer NOT NULL REFERENCES "sprints"("id") ON DELETE CASCADE,
    "card_id" integer REFERENCES "kanban_cards"("id") ON DELETE SET NULL,
    "action" varchar(20) NOT NULL,
    "points" integer,
    "occurred_at" timestamp DEFAULT now() NOT NULL,
    "occurred_by" integer REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "sprint_scope_history_sprint_idx"
    ON "sprint_scope_history" ("sprint_id", "occurred_at");

-- 4. Backfill project_members from existing isPrivate state.
--   - Every project's createdBy user becomes the project owner.
--   - For agency-managed projects (isPrivate=false), staff/admin/employee
--     users are NOT inserted: the runtime `isPortalStaff` check still grants
--     them implicit owner-equivalent access without a row. Only the
--     non-staff createdBy gets a row to carry the historical client linkage.
INSERT INTO "project_members" ("project_id", "user_id", "role", "added_at")
SELECT p.id, p.created_by, 'owner', p.created_at
FROM "projects" p
WHERE p.created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "project_members" pm
    WHERE pm.project_id = p.id AND pm.user_id = p.created_by
  );

-- For projects where createdBy is null (legacy data), grant ownership to the
-- earliest client_members row of that project's client (best-effort).
INSERT INTO "project_members" ("project_id", "user_id", "role", "added_at")
SELECT DISTINCT ON (p.id) p.id, cm.user_id, 'owner', p.created_at
FROM "projects" p
JOIN "client_members" cm ON cm.client_id = p.client_id
WHERE p.created_by IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "project_members" pm
    WHERE pm.project_id = p.id AND pm.user_id = cm.user_id
  )
ORDER BY p.id, cm.created_at ASC;
