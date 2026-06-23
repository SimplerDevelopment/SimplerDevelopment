-- Draft overlay columns for CMS content that previously had no staging.
--
-- Adds parallel "draft" storage to client_websites (custom CSS/JS),
-- site_navigation, and block_templates. MCP writes from non-admin keys land
-- in the draft fields; the public renderer continues to read the live
-- columns only. Companion MCP tools (sites_publish_custom_code, nav_publish,
-- block_templates_publish) copy draft -> live and clear draft state.
--
-- NOTE: hand-written rather than `drizzle-kit generate` output because the
-- repo's drizzle meta snapshots have a pre-existing collision
-- (drizzle/meta/0004_snapshot.json / 0070 / 0072), documented in project
-- memory. Mirrors lib/db/schema/sites.ts and lib/db/schema/cms.ts exactly.

-- `custom_css` + `custom_js` were defined in 0001_lean_iron_man.sql but the
-- prod migration tracker drifted before that ran (project memory). Add them
-- defensively here so the draft cols + the existing `sites_update_custom_code`
-- read path both have something to point at.
ALTER TABLE "client_websites"
  ADD COLUMN IF NOT EXISTS "custom_css" text,
  ADD COLUMN IF NOT EXISTS "custom_js" text,
  ADD COLUMN IF NOT EXISTS "draft_custom_css" text,
  ADD COLUMN IF NOT EXISTS "draft_custom_js" text,
  ADD COLUMN IF NOT EXISTS "draft_updated_at" timestamp,
  ADD COLUMN IF NOT EXISTS "draft_updated_by" integer REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "site_navigation"
  ADD COLUMN IF NOT EXISTS "draft" json;

ALTER TABLE "block_templates"
  ADD COLUMN IF NOT EXISTS "draft" json;

-- pitch_decks.slides is JSONB-typed already; the new per-slide `draft` sub-
-- object lives inside that blob and needs no schema change.

-- Flip the DEFAULT on require_cms_approval for newly issued portal keys.
-- Existing rows keep their current values intact — Dan's "API" key (id 179)
-- stays false on purpose; "Claude Desktop" (id 178) is already true. The new
-- default protects keys we haven't issued yet.
ALTER TABLE "portal_api_keys"
  ALTER COLUMN "require_cms_approval" SET DEFAULT true;
