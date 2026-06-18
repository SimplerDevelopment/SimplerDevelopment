-- Admin billing overrides on `clients` — adds the three staff-set escape-hatch
-- columns from lib/db/schema/sites.ts (C1 of the Admin Billing Parity feature).
--
-- Hand-written because `db:generate` refuses (the drizzle meta snapshot tracker
-- is out of sync — see lib/db/CLAUDE.md). Additive + nullable, no defaults, no
-- backfill — safe to re-run (every statement is IF NOT EXISTS).
--
-- Apply (local / staging / prod) with plain psql:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migrations/admin-billing-overrides.sql

ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "billable_seats_override" integer;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "comp_discount_percent" integer;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "byok_eligible_override" boolean;
