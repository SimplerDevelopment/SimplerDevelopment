-- DropboxSign (formerly HelloSign) e-signature integration for crm_contracts.
--
-- Two changes:
--   1. Augment `crm_contracts` with provider-tracking columns. The provider
--      column is varchar so we can swap providers later without a schema
--      change ('dropboxsign' for now; could be 'docusign', 'adobesign', etc.).
--   2. Add `crm_contract_signing_events` for an append-only audit log of
--      every signing-flow event we receive (send, view, sign, decline,
--      cancel, raw webhook). Drives the audit-trail panel in the portal UI.
--
-- Idempotent — safe to re-run. Hand-applied SQL (per repo convention,
-- the Drizzle migration tracker is out of sync in prod).

ALTER TABLE "crm_contracts" ADD COLUMN IF NOT EXISTS "esign_provider" varchar(20);
ALTER TABLE "crm_contracts" ADD COLUMN IF NOT EXISTS "esign_provider_request_id" varchar(255);
ALTER TABLE "crm_contracts" ADD COLUMN IF NOT EXISTS "esign_signer_email" varchar(255);
ALTER TABLE "crm_contracts" ADD COLUMN IF NOT EXISTS "esign_signer_name" varchar(255);
ALTER TABLE "crm_contracts" ADD COLUMN IF NOT EXISTS "esign_status" varchar(20) DEFAULT 'not_sent';
ALTER TABLE "crm_contracts" ADD COLUMN IF NOT EXISTS "esign_sent_at" timestamp;
ALTER TABLE "crm_contracts" ADD COLUMN IF NOT EXISTS "esign_signed_at" timestamp;
ALTER TABLE "crm_contracts" ADD COLUMN IF NOT EXISTS "esign_declined_at" timestamp;
ALTER TABLE "crm_contracts" ADD COLUMN IF NOT EXISTS "esign_audit_file_url" text;
ALTER TABLE "crm_contracts" ADD COLUMN IF NOT EXISTS "esign_webhook_events" json DEFAULT '[]'::json;

-- Lookup index: webhook handler resolves contracts by provider request id.
CREATE INDEX IF NOT EXISTS "crm_contracts_esign_request_idx"
  ON "crm_contracts" ("esign_provider_request_id");

CREATE TABLE IF NOT EXISTS "crm_contract_signing_events" (
  "id" serial PRIMARY KEY,
  "contract_id" integer NOT NULL REFERENCES "crm_contracts"("id") ON DELETE CASCADE,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "kind" varchar(50) NOT NULL,
  "actor_email" varchar(255),
  "payload" json DEFAULT '{}'::json,
  "occurred_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "crm_contract_signing_events_contract_idx"
  ON "crm_contract_signing_events" ("contract_id");
CREATE INDEX IF NOT EXISTS "crm_contract_signing_events_client_idx"
  ON "crm_contract_signing_events" ("client_id");
