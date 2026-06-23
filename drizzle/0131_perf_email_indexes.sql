-- Email perf indexes (E1). Must be hand-applied to metro before staging→main
-- merge — drizzle tracker is out of sync with disk, see memory
-- project_sd2026_drizzle_tracker_drift.
--
-- Adds:
--   1. (list_id), (list_id, status), (list_id, subscribed_at), and a
--      UNIQUE (list_id, email) on email_subscribers — covers the
--      "fetch one list's subscribers, filter by status, paginate by date"
--      pattern that the new /api/portal/email/lists/[id] endpoint runs,
--      and prevents historical (list_id, email) dupes.
--   2. (client_id) on email_lists — every list endpoint scopes by client.
--   3. (client_id, created_at), (list_id), (status, scheduled_at) on
--      email_campaigns — campaigns list orders by created_at desc per client,
--      the analytics route filters by status='sent', and the scheduler scans
--      status='scheduled' AND scheduled_at <= now().
--   4. (campaign_id), (subscriber_id), UNIQUE (campaign_id, subscriber_id)
--      on email_campaign_sends — webhooks update by (campaign_id, subscriber_id)
--      and the dedupe enforces idempotency.
--   5. (client_id) on email_segments — segment list scopes by client.
--   6. (subscriber_id), (tag_id) on email_subscriber_tag_assignments — both
--      sides of the join are scanned during segment calculation.
--
-- The two UNIQUE indexes (subscribers + sends) require a dedupe pass first
-- because these constraints didn't exist historically. The dedupe + unique
-- creations are wrapped in a transaction so a partial failure rolls back.
-- All other CREATE INDEX statements use IF NOT EXISTS and run outside the
-- transaction; CONCURRENTLY isn't used so an ALTER lock during the migration
-- is acceptable (these tables aren't write-hot during a deploy window).
--
-- Idempotent — safe to re-run.

-- ─── email_lists ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "email_lists_client_id_idx"
  ON "email_lists" ("client_id");

-- ─── email_subscribers (non-unique) ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "email_subscribers_list_id_idx"
  ON "email_subscribers" ("list_id");

CREATE INDEX IF NOT EXISTS "email_subscribers_list_status_idx"
  ON "email_subscribers" ("list_id", "status");

CREATE INDEX IF NOT EXISTS "email_subscribers_list_subscribed_at_idx"
  ON "email_subscribers" ("list_id", "subscribed_at");

-- ─── email_subscribers UNIQUE (list_id, email) — dedupe + create ────────────
-- Historically there was no constraint preventing the same email being added
-- twice to the same list (e.g. CSV re-import). Delete the older duplicates
-- (lower id) before adding the unique index so the index creation succeeds.
BEGIN;

DELETE FROM "email_subscribers"
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY list_id, email
      ORDER BY id
    ) AS rn
    FROM "email_subscribers"
  ) t
  WHERE t.rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_subscribers_list_email_uniq_idx"
  ON "email_subscribers" ("list_id", "email");

COMMIT;

-- ─── email_campaigns ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "email_campaigns_client_created_at_idx"
  ON "email_campaigns" ("client_id", "created_at");

CREATE INDEX IF NOT EXISTS "email_campaigns_list_id_idx"
  ON "email_campaigns" ("list_id");

CREATE INDEX IF NOT EXISTS "email_campaigns_status_scheduled_at_idx"
  ON "email_campaigns" ("status", "scheduled_at");

-- ─── email_campaign_sends (non-unique) ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS "email_campaign_sends_campaign_idx"
  ON "email_campaign_sends" ("campaign_id");

CREATE INDEX IF NOT EXISTS "email_campaign_sends_subscriber_idx"
  ON "email_campaign_sends" ("subscriber_id");

-- ─── email_campaign_sends UNIQUE (campaign_id, subscriber_id) ───────────────
-- Same dedupe story as email_subscribers — bounce/open webhooks could insert
-- duplicate rows under a retry; the unique index enforces idempotency going
-- forward.
BEGIN;

DELETE FROM "email_campaign_sends"
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY campaign_id, subscriber_id
      ORDER BY id
    ) AS rn
    FROM "email_campaign_sends"
  ) t
  WHERE t.rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_campaign_sends_campaign_subscriber_uniq_idx"
  ON "email_campaign_sends" ("campaign_id", "subscriber_id");

COMMIT;

-- ─── email_segments ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "email_segments_client_id_idx"
  ON "email_segments" ("client_id");

-- ─── email_subscriber_tag_assignments ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS "email_subscriber_tag_assignments_subscriber_idx"
  ON "email_subscriber_tag_assignments" ("subscriber_id");

CREATE INDEX IF NOT EXISTS "email_subscriber_tag_assignments_tag_idx"
  ON "email_subscriber_tag_assignments" ("tag_id");
