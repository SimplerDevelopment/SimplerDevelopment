-- Backfill missing project_members rows for clients of legacy agency projects.
--
-- Run manually:
--   psql "$DATABASE_URL" -f drizzle/0099_backfill_project_members_for_clients.sql
--
-- Context:
--   The unify migration 0090 seeded project_members.created_by → 'owner'. For
--   agency projects (originally isPrivate=false), created_by is typically an
--   SD staff user, so the *client* the project belongs to was never granted a
--   row. After 0090, the new GET /api/portal/projects gate filters non-staff
--   to projects where they have a row — those clients silently lost visibility
--   into their existing agency projects.
--
--   This backfill inserts a 'viewer' row for every client_members.user_id of
--   each agency project's client_id, preserving the old behavior where clients
--   on agency projects had read-only access (canEdit = staff || isPrivate had
--   evaluated to false for them). Skips rows that already exist so it is safe
--   to re-run.
--
--   Filtered to is_private = false because:
--     - Private projects already received an owner row via 0090 (their creator
--       is the client themselves).
--     - Future projects create their member rows in the API handler.

INSERT INTO "project_members" ("project_id", "user_id", "role", "added_at")
SELECT p.id, cm.user_id, 'viewer', p.created_at
FROM "projects" p
JOIN "client_members" cm ON cm.client_id = p.client_id
WHERE p.is_private = false
  AND NOT EXISTS (
    SELECT 1 FROM "project_members" pm
    WHERE pm.project_id = p.id AND pm.user_id = cm.user_id
  );
