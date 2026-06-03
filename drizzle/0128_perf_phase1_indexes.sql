-- Phase 1 performance indexes
-- HAND-APPLY ONLY against metro before merging staging→main
-- See .planning/perf/phase1.md for context
--
-- All indexes use IF NOT EXISTS so this file is idempotent.
-- The two uniqueIndex declarations (client_members_client_user_idx, posts_website_slug_idx)
-- are written here as NON-UNIQUE indexes for safety — if existing data has duplicates,
-- CREATE UNIQUE INDEX would fail at apply time. Promote to UNIQUE in a follow-up
-- migration once data is verified clean.

-- ─── CRM ──────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS crm_companies_client_idx ON crm_companies (client_id);
CREATE INDEX IF NOT EXISTS crm_companies_client_updated_idx ON crm_companies (client_id, updated_at);
CREATE INDEX IF NOT EXISTS crm_companies_client_name_idx ON crm_companies (client_id, name);

CREATE INDEX IF NOT EXISTS crm_contacts_client_idx ON crm_contacts (client_id);
CREATE INDEX IF NOT EXISTS crm_contacts_client_company_idx ON crm_contacts (client_id, company_id);
CREATE INDEX IF NOT EXISTS crm_contacts_client_email_idx ON crm_contacts (client_id, email);
CREATE INDEX IF NOT EXISTS crm_contacts_client_updated_idx ON crm_contacts (client_id, updated_at);

CREATE INDEX IF NOT EXISTS crm_deals_client_idx ON crm_deals (client_id);
CREATE INDEX IF NOT EXISTS crm_deals_client_stage_idx ON crm_deals (client_id, stage_id);
CREATE INDEX IF NOT EXISTS crm_deals_client_owner_idx ON crm_deals (client_id, owner_id);
CREATE INDEX IF NOT EXISTS crm_deals_client_updated_idx ON crm_deals (client_id, updated_at);

-- crm_activities has no occurred_at column; index on created_at (the row's
-- timestamp) instead — same access pattern.
CREATE INDEX IF NOT EXISTS crm_activities_client_deal_idx ON crm_activities (client_id, deal_id);
CREATE INDEX IF NOT EXISTS crm_activities_client_contact_idx ON crm_activities (client_id, contact_id);
CREATE INDEX IF NOT EXISTS crm_activities_client_created_idx ON crm_activities (client_id, created_at);

-- ─── BRAIN ────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS brain_notes_client_updated_idx ON brain_notes (client_id, updated_at);
CREATE INDEX IF NOT EXISTS brain_notes_client_company_idx ON brain_notes (client_id, company_id);
CREATE INDEX IF NOT EXISTS brain_notes_client_deal_idx ON brain_notes (client_id, deal_id);
CREATE INDEX IF NOT EXISTS brain_notes_client_pinned_idx ON brain_notes (client_id, pinned);

-- brain_tasks uses owner_id (no assignee_id column).
CREATE INDEX IF NOT EXISTS brain_tasks_client_status_due_idx ON brain_tasks (client_id, status, due_date);
CREATE INDEX IF NOT EXISTS brain_tasks_client_owner_idx ON brain_tasks (client_id, owner_id);

-- brain_meetings uses meeting_date (no scheduled_at column).
CREATE INDEX IF NOT EXISTS brain_meetings_client_meeting_date_idx ON brain_meetings (client_id, meeting_date);

-- brain_relationship_overlays has no contact_id column; indexed by deal_id instead.
CREATE INDEX IF NOT EXISTS brain_relationship_overlays_client_company_idx ON brain_relationship_overlays (client_id, company_id);
CREATE INDEX IF NOT EXISTS brain_relationship_overlays_client_deal_idx ON brain_relationship_overlays (client_id, deal_id);

-- ─── CMS / POSTS ──────────────────────────────────────────────────────────────
-- posts has no client_id column (tenanted via website_id → client_websites).

CREATE INDEX IF NOT EXISTS posts_website_published_idx ON posts (website_id, published, published_at);
CREATE INDEX IF NOT EXISTS posts_website_slug_idx ON posts (website_id, slug);

-- ─── AUTH ─────────────────────────────────────────────────────────────────────
-- users.email is already UNIQUE via column-level .unique() — no action.

-- ─── SITES ────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS client_members_user_idx ON client_members (user_id);
CREATE INDEX IF NOT EXISTS client_members_client_user_idx ON client_members (client_id, user_id);

CREATE INDEX IF NOT EXISTS client_websites_client_idx ON client_websites (client_id);
CREATE INDEX IF NOT EXISTS client_websites_subdomain_idx ON client_websites (subdomain);

-- ─── PM / KANBAN ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS kanban_cards_project_idx ON kanban_cards (project_id);
CREATE INDEX IF NOT EXISTS kanban_cards_project_column_order_idx ON kanban_cards (project_id, column_id, "order");
