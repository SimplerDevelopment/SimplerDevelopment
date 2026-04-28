-- Brain email ingestion — per-client token used to route inbound email at
-- `brain+<token>@simplerdevelopment.com` to the correct brain profile.
-- Token is randomly generated; it's both a client identifier and a shared
-- secret (revoke by rotating it). 32 hex chars (128 bits).

ALTER TABLE "brain_profiles"
  ADD COLUMN IF NOT EXISTS "email_ingest_token" VARCHAR(64);

-- Backfill tokens for existing profiles. Uses pgcrypto's gen_random_bytes if
-- available; otherwise falls back to md5(random()::text || clock_timestamp()::text).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    UPDATE brain_profiles
       SET email_ingest_token = encode(gen_random_bytes(16), 'hex')
     WHERE email_ingest_token IS NULL;
  ELSE
    UPDATE brain_profiles
       SET email_ingest_token = md5(random()::text || clock_timestamp()::text || id::text)
     WHERE email_ingest_token IS NULL;
  END IF;
END $$;

-- Lookup index — every inbound email triggers a token lookup, so this is a
-- hot read path. Unique because a token must identify exactly one profile.
CREATE UNIQUE INDEX IF NOT EXISTS "brain_profiles_email_ingest_token_idx"
  ON "brain_profiles" ("email_ingest_token")
  WHERE email_ingest_token IS NOT NULL;
