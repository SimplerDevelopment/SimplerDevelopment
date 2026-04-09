-- Add client_id to media table for proper client-level scoping
ALTER TABLE "media" ADD COLUMN "client_id" integer;

-- Backfill from website's client_id where website_id is set
UPDATE "media" m
SET "client_id" = cw."client_id"
FROM "client_websites" cw
WHERE m."website_id" = cw."id"
  AND m."client_id" IS NULL;

-- Backfill from uploaded_by user's client record where website_id is null
UPDATE "media" m
SET "client_id" = c."id"
FROM "clients" c
WHERE m."uploaded_by" = c."user_id"
  AND m."client_id" IS NULL
  AND m."website_id" IS NULL;

-- Add foreign key constraint
ALTER TABLE "media" ADD CONSTRAINT "media_client_id_clients_id_fk"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE;

-- Index for efficient client-scoped queries
CREATE INDEX "media_client_id_idx" ON "media" ("client_id") WHERE "client_id" IS NOT NULL;
