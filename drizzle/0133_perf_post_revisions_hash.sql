-- 0133_perf_post_revisions_hash.sql
--
-- Adds post_revisions.content_hash so autosave PUTs can skip writing a new
-- revision row when the block tree hasn't changed since the last revision.
-- See app/api/portal/cms/websites/[siteId]/posts/[postId]/route.ts and
-- E3 perf work.
--
-- Backfill is intentionally skipped — a null hash never matches an incoming
-- hash, so old rows simply never deduplicate.

ALTER TABLE "post_revisions" ADD COLUMN IF NOT EXISTS "content_hash" varchar(16);

-- Index supports the "look up most recent revision for this post" query path.
CREATE INDEX IF NOT EXISTS "post_revisions_post_id_created_at_idx"
  ON "post_revisions" ("post_id", "created_at" DESC);
