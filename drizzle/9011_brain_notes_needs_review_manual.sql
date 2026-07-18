-- UAG-004: brain_notes.needs_review — flag live agent-created notes for human review.
-- Hand-written; the drizzle tracker is out of sync in prod and db:generate refuses
-- non-interactively (same as 9004-9010).
-- Safe to re-run: ADD COLUMN IF NOT EXISTS, NOT NULL with a DEFAULT so existing rows backfill false.
-- Additive — the prod-schema-sync would also apply this on merge, but per the release rule it is
-- hand-applied to metro at/ before merge. Mirrors lib/db/schema/brain.ts (brainNotes.needsReview),
-- matching brain_tasks.needs_review.

ALTER TABLE "brain_notes" ADD COLUMN IF NOT EXISTS "needs_review" boolean DEFAULT false NOT NULL;
