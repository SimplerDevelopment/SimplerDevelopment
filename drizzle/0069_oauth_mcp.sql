-- OAuth 2.1 for the MCP server. Lets remote clients (Claude.ai web custom
-- connector, etc.) register dynamically, walk the user through portal login +
-- scope consent, and exchange a PKCE-protected authorization code for an
-- access token that `lib/mcp-auth.ts` accepts alongside the existing
-- `sd_mcp_…` keys in `portal_api_keys`.
--
-- Three tables:
--   oauth_clients              — public clients registered via RFC 7591 DCR
--   oauth_authorization_codes  — single-use codes, PKCE-bound, short TTL
--   oauth_access_tokens        — issued bearer tokens, scoped per portal user

CREATE TABLE IF NOT EXISTS "oauth_clients" (
  "id" serial PRIMARY KEY,
  "client_id" varchar(64) NOT NULL UNIQUE,
  "client_name" varchar(200) NOT NULL,
  "redirect_uris" json NOT NULL,
  "client_uri" varchar(500),
  "logo_uri" varchar(500),
  "tos_uri" varchar(500),
  "policy_uri" varchar(500),
  "token_endpoint_auth_method" varchar(32) NOT NULL DEFAULT 'none',
  "software_id" varchar(200),
  "software_version" varchar(64),
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "oauth_authorization_codes" (
  "id" serial PRIMARY KEY,
  "code_hash" varchar(128) NOT NULL UNIQUE,
  "oauth_client_id" integer NOT NULL REFERENCES "oauth_clients"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "scopes" json NOT NULL,
  "redirect_uri" varchar(500) NOT NULL,
  "code_challenge" varchar(256) NOT NULL,
  "code_challenge_method" varchar(16) NOT NULL DEFAULT 'S256',
  "resource" varchar(500),
  "expires_at" timestamp NOT NULL,
  "consumed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "oauth_authorization_codes_expires_at_idx"
  ON "oauth_authorization_codes" ("expires_at");

CREATE TABLE IF NOT EXISTS "oauth_access_tokens" (
  "id" serial PRIMARY KEY,
  "token_hash" varchar(128) NOT NULL UNIQUE,
  "token_preview" varchar(24) NOT NULL,
  "oauth_client_id" integer NOT NULL REFERENCES "oauth_clients"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "scopes" json NOT NULL,
  "resource" varchar(500),
  "expires_at" timestamp,
  "revoked_at" timestamp,
  "last_used_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "oauth_access_tokens_client_idx"
  ON "oauth_access_tokens" ("client_id");
CREATE INDEX IF NOT EXISTS "oauth_access_tokens_oauth_client_idx"
  ON "oauth_access_tokens" ("oauth_client_id");
