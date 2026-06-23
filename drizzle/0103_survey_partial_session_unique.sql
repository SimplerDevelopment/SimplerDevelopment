-- Add unique index on (survey_id, session_id) for survey_partial_responses.
--
-- Run manually:
--   psql "$DATABASE_URL" -f drizzle/0103_survey_partial_session_unique.sql
--
-- Context (RESP-02):
--   The partial-response capture endpoint upserts by (survey_id, session_id).
--   Postgres ON CONFLICT requires a unique constraint to target; without it,
--   concurrent saves from the same session could create duplicate partial rows
--   for one survey. This index makes the upsert deterministic.
--
-- Idempotent: safe to re-run.

CREATE UNIQUE INDEX IF NOT EXISTS "survey_partial_responses_survey_session_idx"
  ON "survey_partial_responses" ("survey_id", "session_id");
