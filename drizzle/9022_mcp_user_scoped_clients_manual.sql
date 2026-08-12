-- MCP access tied to the USER rather than to one portal client.
--
-- Every credential that can drive the MCP surface gains `client_ids`: the set of
-- portal clients the grant covers. `client_id` keeps its meaning as the DEFAULT
-- within that set (used when a call omits clientId and the set has narrowed to
-- one), so nothing that reads `client_id` changes behavior.
--
-- Additive only (ADD COLUMN + backfill), so the "Prod schema sync (additive)"
-- workflow can apply it; re-runnable via IF NOT EXISTS + a WHERE-guarded update.
-- See lib/mcp/client-scope.ts for how the column is enforced (allowlist ∩ live
-- client_members, re-checked per request).

ALTER TABLE oauth_authorization_codes ADD COLUMN IF NOT EXISTS client_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE oauth_access_tokens       ADD COLUMN IF NOT EXISTS client_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE oauth_refresh_tokens      ADD COLUMN IF NOT EXISTS client_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE portal_api_keys           ADD COLUMN IF NOT EXISTS client_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill each existing credential to the single client it was bound to, so the
-- resolver has one code path instead of an empty-means-legacy special case.
UPDATE oauth_authorization_codes SET client_ids = jsonb_build_array(client_id) WHERE client_ids = '[]'::jsonb;
UPDATE oauth_access_tokens       SET client_ids = jsonb_build_array(client_id) WHERE client_ids = '[]'::jsonb;
UPDATE oauth_refresh_tokens      SET client_ids = jsonb_build_array(client_id) WHERE client_ids = '[]'::jsonb;
UPDATE portal_api_keys           SET client_ids = jsonb_build_array(client_id) WHERE client_ids = '[]'::jsonb;
