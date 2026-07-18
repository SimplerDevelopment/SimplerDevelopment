-- Self-serve signup funnel (hand-applied; follows 001_domain_saas_billing.sql
-- precedent — drizzle-kit generate blocked by meta snapshot collision).
-- Matches lib/db/schema/auth.ts (users) and lib/db/schema/sites.ts (clients).
--
-- Apply: psql "$DATABASE_URL" -f scripts/billing/002_signup_funnel.sql

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp,
  ADD COLUMN IF NOT EXISTS "email_verification_token" varchar(64),
  ADD COLUMN IF NOT EXISTS "email_verification_expires" timestamp,
  ADD COLUMN IF NOT EXISTS "google_id" varchar(64);

-- Partial-safe unique constraint on google_id (NULLs allowed, values unique).
CREATE UNIQUE INDEX IF NOT EXISTS "users_google_id_unique" ON "users" ("google_id");

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "trial_used_at" timestamp;
