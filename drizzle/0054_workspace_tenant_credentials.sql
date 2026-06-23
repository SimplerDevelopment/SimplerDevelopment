-- Migration: Per-tenant Google Workspace OAuth credentials (Enterprise tier)
-- Phase: post Phase 1 — introduces the enterprise tier
-- Additive only. Existing google_workspace_*_connections tables are unchanged.
--
-- Tiering model:
--   Standard tier (most clients) — email tracking via MX → Cloudflare Workers.
--                                  No row in this table.
--   Enterprise tier              — client provisions their own GCP project +
--                                  OAuth client. Credentials stored here, used
--                                  to mint per-tenant OAuth flows that bypass
--                                  CASA verification by relying on each tenant's
--                                  Internal consent screen in their own org.
--
-- One row per client (tenant). Per-user refresh tokens still go in
-- google_workspace_user_connections; that table is unchanged. The link is via
-- client_id.
--
-- SECURITY NOTE — credentials at rest:
--   oauth_client_secret_encrypted stores ciphertext (AES-256-GCM, app-layer
--   encryption via lib/crypto/secrets.ts). Format is base64(iv | tag | ciphertext).
--   The symmetric key lives in env var WORKSPACE_TENANT_SECRETS_KEY (32 bytes hex).
--
--   pubsub_verification_token is intentionally plaintext: the webhook receives
--   ?token=... in every push and looks up the tenant by O(1) unique-index match.
--   Treating it as a webhook shared-secret (lower-value than oauth_client_secret).
--   Future hardening: store HMAC(token) and have admins record the plaintext
--   themselves; rotation becomes the recovery path.
--
--   Pre-existing google_workspace_*_connections.refresh_token columns are still
--   plaintext — addressing those is a separate migration once this table is in
--   production use and the encryption layer is exercised.

CREATE TABLE "google_workspace_tenant_credentials" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL UNIQUE REFERENCES "clients"("id") ON DELETE cascade,

  -- Tenant's own GCP project. They own it; we never touch their billing.
  "google_project_id" varchar(64) NOT NULL,

  -- OAuth client they created in their GCP project. Client ID is non-secret
  -- (visible in OAuth flows). Client secret is encrypted at rest — see header note.
  "oauth_client_id" text NOT NULL,
  "oauth_client_secret_encrypted" text NOT NULL,

  -- The redirect URI registered in their OAuth client. Typically derived from
  -- the tenant's portal subdomain (https://<site>.simplerdevelopment.com/api/portal/integrations/google/callback)
  -- but stored explicitly so an admin can override (e.g., custom domain).
  "oauth_redirect_uri" text NOT NULL,

  -- Pub/Sub topic in their project (Gmail watch publishes here). Format:
  -- projects/<their-project-id>/topics/gmail-watch
  "pubsub_topic" text NOT NULL,

  -- Verification token in the push subscription URL (?token=...). The webhook
  -- uses this to (a) authenticate the push and (b) resolve which client the
  -- message belongs to via the unique index below. Plaintext by design (see
  -- header note); treat as a webhook shared-secret.
  "pubsub_verification_token" text NOT NULL,

  -- Compliance posture: we expect 'internal' (their consent screen is Internal
  -- to their own Workspace org, no CASA needed). 'external' is recorded only
  -- when a client explicitly opts into the harder verification path.
  "consent_screen_user_type" varchar(16) NOT NULL DEFAULT 'internal',

  -- Onboarding lifecycle:
  --   'pending'    — row created, credentials not yet supplied
  --   'configured' — credentials present, smoke test not yet run
  --   'active'     — smoke test passed, can mint OAuth flows
  --   'revoked'    — disabled by either side; do not use
  "status" varchar(16) NOT NULL DEFAULT 'pending',

  -- Audit: which SD admin filed the credentials.
  "configured_by_user_id" integer REFERENCES "users"("id") ON DELETE set null,

  -- Free-form notes (which Workspace admin we worked with, deviation reasons, etc.)
  "notes" text,

  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,

  CONSTRAINT "google_workspace_tenant_credentials_status_check"
    CHECK ("status" IN ('pending','configured','active','revoked')),
  CONSTRAINT "google_workspace_tenant_credentials_user_type_check"
    CHECK ("consent_screen_user_type" IN ('internal','external'))
);

-- The webhook resolves token → client_id on every push notification. Must be unique.
CREATE UNIQUE INDEX "google_workspace_tenant_credentials_token_idx"
  ON "google_workspace_tenant_credentials" ("pubsub_verification_token");

-- Common admin filter: list active vs pending tenants.
CREATE INDEX "google_workspace_tenant_credentials_status_idx"
  ON "google_workspace_tenant_credentials" ("status");
