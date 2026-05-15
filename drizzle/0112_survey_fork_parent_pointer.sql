-- Add parent_survey_id to surveys for the `surveys_fork` MCP tool.
--
-- Informational pointer only — no FK constraint (matches posts/decks/email
-- campaigns / block_templates parent_*_id columns). When the parent is
-- deleted the fork stands on its own.
--
-- NOTE: hand-written. The repo's drizzle meta snapshots have a pre-existing
-- collision documented in CLAUDE.md / project memory; `drizzle-kit generate`
-- refuses to run until that resolves. Mirrors lib/db/schema/surveys.ts.

ALTER TABLE "surveys"
  ADD COLUMN IF NOT EXISTS "parent_survey_id" integer;
