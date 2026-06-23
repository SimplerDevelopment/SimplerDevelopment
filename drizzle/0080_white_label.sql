-- White-label / SaaS Mode foundation for the Tier 3 ("Scale") plan.
-- Agencies can map their own apex/subdomain to the portal, override the
-- "Simpler Development" brand chrome with their own name + logo + colors, and
-- (in a later phase) resell sub-accounts under their own brand. The custom
-- domain must be DNS-verified before white-label can be toggled on.
--
-- Idempotent: every clause uses IF NOT EXISTS / IF EXISTS guards. Repeated
-- runs are no-ops, which matters because tracker drift in production means
-- this SQL is applied by hand rather than via `bun run db:migrate`.

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "custom_domain" varchar(255);

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "custom_domain_verified_at" timestamp;

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "custom_domain_verification_token" varchar(64);

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "white_label_enabled" boolean NOT NULL DEFAULT false;

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "agency_name" varchar(255);

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "agency_logo_url" varchar(500);

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "agency_primary_color" varchar(20);

-- Unique index on custom_domain (DDL idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'clients'
      AND indexname = 'clients_custom_domain_unique'
  ) THEN
    CREATE UNIQUE INDEX "clients_custom_domain_unique"
      ON "clients" ("custom_domain")
      WHERE "custom_domain" IS NOT NULL;
  END IF;
END $$;

-- Audit history for custom-domain mutations.
CREATE TABLE IF NOT EXISTS "custom_domain_history" (
  "id" serial PRIMARY KEY,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "domain" varchar(255) NOT NULL,
  "action" varchar(20) NOT NULL,
  "by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "occurred_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "custom_domain_history_client_idx"
  ON "custom_domain_history" ("client_id");
