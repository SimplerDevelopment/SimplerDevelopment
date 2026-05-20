-- Add surveys.certificate_enabled: opt-in flag for branded completion certificates.
--
-- Run manually:
--   psql "$DATABASE_URL" -f drizzle/0104_survey_certificate_enabled.sql
--
-- Context (PDF-01 / PDF-02):
--   When enabled, the public thank-you screen renders a "Download Certificate"
--   link pointing at /api/surveys/[slug]/certificate?responseId=<n>. That
--   route generates a branded PDF (primary color, logo, fonts from the
--   survey's resolved branding profile) showing the respondent's name and
--   completion date. Default is false — existing surveys keep their current
--   behavior (no certificate offered) until an owner flips the toggle in the
--   Settings tab.
--
-- Idempotent: safe to re-run.

ALTER TABLE "surveys"
  ADD COLUMN IF NOT EXISTS "certificate_enabled" boolean NOT NULL DEFAULT false;
