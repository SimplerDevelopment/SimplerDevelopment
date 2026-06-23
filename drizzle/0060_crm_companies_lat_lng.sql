-- crm_companies: GPS coordinates (WGS84). 7 decimal places ≈ 1cm precision.
-- Backfills the columns already present in lib/db/schema.ts but missing from
-- the SQL migration history.
ALTER TABLE "crm_companies" ADD COLUMN IF NOT EXISTS "latitude" numeric(10, 7);
ALTER TABLE "crm_companies" ADD COLUMN IF NOT EXISTS "longitude" numeric(10, 7);
