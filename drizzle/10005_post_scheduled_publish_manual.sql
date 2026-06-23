-- Scheduled post auto-publish (CMS). Adds posts.scheduled_publish_at; the
-- process-scheduled-posts cron publishes due rows. Mirrors lib/db/schema/cms.ts.
-- Hand-written (db:generate blocked by the meta-snapshot collision); apply
-- out-of-band: push on dev, psql on staging/prod.
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "scheduled_publish_at" timestamp;
CREATE INDEX IF NOT EXISTS "posts_scheduled_publish_idx"
  ON "posts" ("scheduled_publish_at") WHERE "scheduled_publish_at" IS NOT NULL;
