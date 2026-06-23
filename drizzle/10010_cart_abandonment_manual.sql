-- Migration: cart abandonment infrastructure
-- Adds three columns to the `carts` table and a partial index on recovery_token.
-- The `status` column is a varchar(20) so no enum change is required;
-- the 'abandoned' value is enforced by application logic.

ALTER TABLE "carts"
  ADD COLUMN IF NOT EXISTS "recovery_token"            varchar(100),
  ADD COLUMN IF NOT EXISTS "recovery_token_expires_at" timestamp,
  ADD COLUMN IF NOT EXISTS "recovery_email_sent_at"    timestamp;

-- Partial index: only rows that actually have a token need to be looked up by token.
CREATE UNIQUE INDEX IF NOT EXISTS "carts_recovery_token_idx"
  ON "carts" ("recovery_token")
  WHERE "recovery_token" IS NOT NULL;
