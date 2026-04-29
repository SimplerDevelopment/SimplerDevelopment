-- Brain profile: opt-in to the AI CRM-linking step that runs after the
-- transcript AI on inbound brain emails. When enabled, the pipeline upserts
-- the sender as a crm_contact, links the meeting to a crm_company on
-- unambiguous domain match, and proposes contact classification, deal
-- links, and brain-aware action items via the brain_ai_review_items queue.

ALTER TABLE "brain_profiles"
  ADD COLUMN IF NOT EXISTS "auto_link_crm" boolean NOT NULL DEFAULT false;
