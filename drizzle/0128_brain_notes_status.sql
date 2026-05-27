-- BRAIN-1 taxonomy status column on brain_notes.
-- 'canonical' = gold-standard reference, 'draft' = in progress (default),
-- 'stub' = under-quality / needs work, 'duplicate' = replaced by another note.
-- Phase 2 of BRAIN-1 will migrate the legacy `pending_deletion` and
-- `short_note_review` flat tags into this column.
--
-- Non-breaking: existing rows get the default 'draft'; readers that ignore
-- `status` keep working unchanged. Drizzle generator is out of sync with disk
-- (see lib/db/CLAUDE.md), so this migration is hand-authored following the
-- pattern of 0075/0127. Idempotent guards let the same file replay safely.

ALTER TABLE "brain_notes"
  ADD COLUMN IF NOT EXISTS "status" varchar(20) DEFAULT 'draft' NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brain_notes_status_idx" ON "brain_notes" ("status");
