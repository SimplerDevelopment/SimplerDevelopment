-- Drop the legacy projects.is_private column.
--
-- Run manually:
--   psql "$DATABASE_URL" -f drizzle/0100_drop_projects_is_private.sql
--
-- Context:
--   The role-based permission model (project_members + isPortalStaff()) fully
--   replaces the old isPrivate flag as of migration 0090. Backfill 0099
--   ensured every client_member of a legacy agency project (is_private=false)
--   has at least a 'viewer' row, so dropping the column does not regress
--   visibility. Run 0099 BEFORE this migration in any environment that still
--   has agency projects without member rows.
--
--   All writers of is_private have been removed:
--     - app/api/portal/projects/route.ts (POST)
--     - lib/mcp/tools/projects.ts (projects_create)
--     - lib/ai/portal-tools/projects.ts (auto-create from CRM deal)
--   No reader remains.

ALTER TABLE "projects" DROP COLUMN IF EXISTS "is_private";
