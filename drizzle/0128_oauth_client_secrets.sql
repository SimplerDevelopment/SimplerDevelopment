-- Add client_secret support to oauth_clients for confidential clients.
-- Public/PKCE clients remain the default (token_endpoint_auth_method = 'none');
-- confidential clients are minted from the admin UI and receive a one-time
-- secret whose SHA-256 is stored here. The raw secret is never persisted.
ALTER TABLE "oauth_clients" ADD COLUMN IF NOT EXISTS "client_secret_hash" varchar(128);
ALTER TABLE "oauth_clients" ADD COLUMN IF NOT EXISTS "client_secret_preview" varchar(32);
ALTER TABLE "oauth_clients" ADD COLUMN IF NOT EXISTS "client_secret_created_at" timestamp;
ALTER TABLE "oauth_clients" ADD COLUMN IF NOT EXISTS "client_secret_rotated_at" timestamp;

-- Confidential clients (server-side flow with client_secret) may legitimately
-- skip PKCE, so code_challenge and code_challenge_method become nullable.
-- Public/PKCE clients still pass these via /authorize and the token endpoint
-- still enforces S256 verification when present.
ALTER TABLE "oauth_authorization_codes" ALTER COLUMN "code_challenge" DROP NOT NULL;
ALTER TABLE "oauth_authorization_codes" ALTER COLUMN "code_challenge_method" DROP NOT NULL;
ALTER TABLE "oauth_authorization_codes" ALTER COLUMN "code_challenge_method" DROP DEFAULT;
