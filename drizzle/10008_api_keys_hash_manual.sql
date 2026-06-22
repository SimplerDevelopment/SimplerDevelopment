-- Security fix: store headless-API keys hashed at rest, never plaintext.
-- Backfills key_hash (sha256 hex) + key_preview from the existing raw `key`,
-- then drops the plaintext column. Mirrors lib/db/schema/auth.ts apiKeys.
--
-- NOTE ON PROD ROLLOUT: this drops `key` in one step, which is safe for the dev
-- line (atomic deploy). For staging/production use a two-phase rollout instead:
-- (1) add key_hash/key_preview + backfill + wipe `key` to NULL, deploy the app
-- using key_hash; (2) a later migration drops the now-empty `key` column — so an
-- old app instance mid-rolling-deploy never hits a missing column.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "key_hash" varchar(64);
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "key_preview" varchar(32);

-- Backfill from any existing plaintext keys so live keys keep working.
UPDATE "api_keys"
SET "key_hash" = encode(digest("key", 'sha256'), 'hex'),
    "key_preview" = left("key", 12) || '...' || right("key", 4)
WHERE "key_hash" IS NULL AND "key" IS NOT NULL;

ALTER TABLE "api_keys" ALTER COLUMN "key_hash" SET NOT NULL;
ALTER TABLE "api_keys" ALTER COLUMN "key_preview" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_key_hash_unique" ON "api_keys" ("key_hash");

-- Remove the plaintext column.
ALTER TABLE "api_keys" DROP COLUMN IF EXISTS "key";
