-- Brain Phase 6 — Review-item routing by expertise
--
-- Extends brain_ai_review_items with three SUGGESTION columns populated by
-- lib/brain/review-routing.ts. These are suggestions only — the actual reviewer
-- on approve is recorded in `reviewed_by`. The new index supports the common
-- "show me items routed to me" query.
--
-- Mirrors lib/db/schema/brain.ts (brainAiReviewItems).

ALTER TABLE "brain_ai_review_items"
  ADD COLUMN IF NOT EXISTS "suggested_reviewer_person_id" integer
    REFERENCES "brain_people"("id") ON DELETE SET NULL;

ALTER TABLE "brain_ai_review_items"
  ADD COLUMN IF NOT EXISTS "suggested_reviewer_score" integer;

ALTER TABLE "brain_ai_review_items"
  ADD COLUMN IF NOT EXISTS "suggested_reviewer_reason" text;

CREATE INDEX IF NOT EXISTS "brain_ai_review_items_suggested_reviewer_idx"
  ON "brain_ai_review_items" ("suggested_reviewer_person_id");
