-- Add surveys.publish_results: opt-in flag for the public aggregated-results page.
--
-- Run manually:
--   psql "$DATABASE_URL" -f drizzle/0102_survey_publish_results.sql
--
-- Context (DIST-03 / DIST-04):
--   /api/surveys/[slug]/results was previously open to any caller that knew
--   the slug. The route now requires this flag to be true before responding,
--   and the new /s/[slug]/results page renders the aggregated data behind the
--   same gate. Default is false — owners must explicitly opt in via the
--   survey Settings tab. Existing surveys keep results private (no behavior
--   change) until an owner flips the toggle.
--
-- Idempotent: safe to re-run.

ALTER TABLE "surveys"
  ADD COLUMN IF NOT EXISTS "publish_results" boolean NOT NULL DEFAULT false;
