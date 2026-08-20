-- PUX-084: choose who gets notified when a survey response arrives, and make the
-- daily/weekly digest actually send.
--
-- notify_user_ids — portal USER IDS, deliberately not email strings. Survey
-- responses can carry PII, so a free-text address list would let anyone with
-- survey-edit access forward them off-tenant. Ids are validated against
-- client_members for the survey's own client on write, so a recipient can only
-- ever be someone already on the account; revoking their membership stops the
-- notifications with no cleanup here. Keeping ids (not a copied address) also
-- means users.email stays the single source of truth and never goes stale.
--
-- DEFAULT '[]' is what preserves today's behaviour: lib/automation/survey-notifications.ts
-- falls back to the client owner when the list is empty, which is exactly who
-- every existing survey already notified. So no backfill is needed or wanted.
--
-- last_digest_sent_at — watermark for the daily/weekly digest. Before this,
-- notify_digest='daily'|'weekly' hit an early `return` that sent nothing AND
-- queued nothing, so choosing a digest silently switched notifications off.
-- The queue table that TODO imagined is unnecessary: the digest reads straight
-- off survey_responses.completed_at, the same shape as the existing
-- app/api/cron/approval-digest route. NULL means "never digested" — the first
-- run bounds its window by the digest period so enabling a digest on a
-- long-running survey doesn't dump the whole response history into one email.
--
-- Additive only (ADD COLUMN with defaults), so "Prod schema sync (additive)"
-- could apply it — but that workflow is gated on a PROD_DATABASE_URL secret that
-- is NOT set, so it silently skips. Apply this to metro BY HAND at merge:
--   psql "$METRO" -v ON_ERROR_STOP=1 -f drizzle/9024_survey_notify_recipients_manual.sql
-- Re-runnable via IF NOT EXISTS.

ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS notify_user_ids json DEFAULT '[]'::json NOT NULL;

ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS last_digest_sent_at timestamp;
