-- OAuth client tenant ownership (hand-written; tracker is out of sync, db:generate refuses).
-- Safe to re-run: ADD COLUMN IF NOT EXISTS, no drops, no NOT NULL on existing data, no type changes.
--
-- Adds two nullable columns to oauth_clients so a confidential client (client_id + client_secret)
-- can be minted self-service from /portal/settings/api-keys and owned by a single tenant.
--   owner_client_id  NULL = global/admin registration (e.g. the Claude.ai connector) — existing behavior.
--                    set  = the portal client (tenant) that minted it. Scopes list/rotate/delete to that
--                           tenant, and restricts who may authorize it (enforced in /oauth/authorize/decision).
--   owner_user_id    the portal user who minted it (audit only).
ALTER TABLE "oauth_clients" ADD COLUMN IF NOT EXISTS "owner_client_id" integer REFERENCES "clients"("id") ON DELETE cascade;
ALTER TABLE "oauth_clients" ADD COLUMN IF NOT EXISTS "owner_user_id" integer REFERENCES "users"("id") ON DELETE set null;
