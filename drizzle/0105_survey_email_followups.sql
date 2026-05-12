-- DIST-01 / DIST-02: post-submission email follow-up sequences with opt-in gates.
--
-- Run manually:
--   psql "$DATABASE_URL" -f drizzle/0105_survey_email_followups.sql
--
-- Context:
--   surveys.consent_field — optional field id whose truthy answer represents
--     the respondent's consent to receive post-submission follow-up email
--     sequences. When NULL, presence of `survey_responses.respondent_email`
--     is treated as sufficient (back-compat with surveys created before this
--     column existed).
--
--   survey_email_sequence_sends — audit log of follow-up sends. One row per
--     (sequence, response) tuple. The UNIQUE INDEX on
--     (sequence_id, survey_response_id) is the idempotency guard for the
--     cron worker at /api/cron/process-survey-email-followups — even if two
--     ticks pick up the same eligible tuple, only the first INSERT wins
--     (the second silently no-ops via ON CONFLICT DO NOTHING).
--
--     `resend_email_id` stores Resend's message id so a future bounce/
--     complaint webhook can be correlated back to the sequence that
--     triggered it. `error` captures the resend failure message when the
--     send blew up; the row still gets inserted in that case so we don't
--     infinitely retry the same broken (sequence, response) pair.
--
-- Idempotent: safe to re-run.

ALTER TABLE "surveys"
  ADD COLUMN IF NOT EXISTS "consent_field" varchar(64);

CREATE TABLE IF NOT EXISTS "survey_email_sequence_sends" (
  "id" serial PRIMARY KEY NOT NULL,
  "sequence_id" integer NOT NULL,
  "survey_response_id" integer NOT NULL,
  "sent_at" timestamp DEFAULT now() NOT NULL,
  "resend_email_id" varchar(255),
  "error" text,
  CONSTRAINT "survey_email_sequence_sends_sequence_id_survey_email_sequences_id_fk"
    FOREIGN KEY ("sequence_id") REFERENCES "survey_email_sequences"("id") ON DELETE CASCADE,
  CONSTRAINT "survey_email_sequence_sends_survey_response_id_survey_responses_id_fk"
    FOREIGN KEY ("survey_response_id") REFERENCES "survey_responses"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "survey_email_sequence_sends_sequence_response_idx"
  ON "survey_email_sequence_sends" ("sequence_id", "survey_response_id");
