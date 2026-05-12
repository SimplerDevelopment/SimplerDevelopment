-- SCORE-01 / SCORE-02: survey scoring + CRM auto-routing.
--
-- Run manually:
--   psql "$DATABASE_URL" -f drizzle/0106_survey_scoring.sql
--
-- Context:
--   - `surveys.scoring_config` (jsonb): survey-level threshold config. Today
--     it carries `autoRouteToCrm` ({ enabled, minScore, pipelineId, stageId,
--     dealTitleTemplate }). Per-field rules live inside the existing
--     `surveys.fields` jsonb array (no SQL change for those — JSON-only).
--   - `survey_responses.score` (integer): the computed total from
--     `computeSurveyScore` (lib/surveys/score.ts). Null when the survey has
--     no scoring configured. Integer so it can be filtered/indexed cheaply.
--
-- Idempotent: safe to re-run.

ALTER TABLE "surveys"
  ADD COLUMN IF NOT EXISTS "scoring_config" jsonb;

ALTER TABLE "survey_responses"
  ADD COLUMN IF NOT EXISTS "score" integer;
