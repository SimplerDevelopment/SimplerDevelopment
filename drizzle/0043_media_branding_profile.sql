-- Add branding_profile_id to media table so files are shared across services using the same branding profile
ALTER TABLE "media" ADD COLUMN "branding_profile_id" integer;

-- Backfill: assign branding profile from the website the media was uploaded to
UPDATE "media" m
SET "branding_profile_id" = cw."branding_profile_id"
FROM "client_websites" cw
WHERE m."website_id" = cw."id"
  AND cw."branding_profile_id" IS NOT NULL
  AND m."branding_profile_id" IS NULL;

-- Add foreign key constraint
ALTER TABLE "media" ADD CONSTRAINT "media_branding_profile_id_branding_profiles_id_fk"
  FOREIGN KEY ("branding_profile_id") REFERENCES "branding_profiles"("id") ON DELETE SET NULL;

-- Index for efficient lookups by branding profile
CREATE INDEX "media_branding_profile_idx" ON "media" ("branding_profile_id") WHERE "branding_profile_id" IS NOT NULL;
