-- Brain profile: opt-in to running the full AI pipeline (attachment
-- analysis, link OG previews, transcript summarization) automatically when
-- email lands in the brain — no manual Process click required.

ALTER TABLE "brain_profiles"
  ADD COLUMN IF NOT EXISTS "auto_process_email" boolean NOT NULL DEFAULT false;
