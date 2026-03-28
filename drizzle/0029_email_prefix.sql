-- Add email prefix to clients for AI email gateway
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "email_prefix" varchar(50);

-- Unique index so no two companies share the same prefix
CREATE UNIQUE INDEX IF NOT EXISTS "clients_email_prefix_idx" ON "clients" ("email_prefix") WHERE "email_prefix" IS NOT NULL;
