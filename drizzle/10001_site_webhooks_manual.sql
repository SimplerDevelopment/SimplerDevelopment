-- Site (tenant-level) outbound webhooks. Mirrors lib/db/schema/sites.ts
-- (siteWebhooks + siteWebhookDeliveries).
--
-- NOTE: hand-written. `drizzle-kit generate` cannot run — the meta snapshots
-- 0004/0070/0072 collide on a shared parent (project memory). Apply this file
-- out-of-band: `drizzle-kit push` on dev, manual psql on staging/prod.
--
-- Two tables: site_webhooks (one config per tenant, fired by the automation
-- event-bus) and site_webhook_deliveries (one row per HTTP attempt).

CREATE TABLE IF NOT EXISTS "site_webhooks" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL,
  "url" varchar(500) NOT NULL,
  "secret" varchar(64),
  "events" json DEFAULT '["*"]'::json NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "last_fired_at" timestamp,
  "last_status" integer,
  "failure_count" integer DEFAULT 0 NOT NULL,
  "created_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "site_webhook_deliveries" (
  "id" serial PRIMARY KEY NOT NULL,
  "webhook_id" integer NOT NULL,
  "event" varchar(50) NOT NULL,
  "attempt" integer DEFAULT 1 NOT NULL,
  "status" varchar(20) NOT NULL,
  "status_code" integer,
  "request_body" json,
  "response_body" text,
  "error" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "site_webhooks" ADD CONSTRAINT "site_webhooks_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "site_webhooks" ADD CONSTRAINT "site_webhooks_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "site_webhook_deliveries" ADD CONSTRAINT "site_webhook_deliveries_webhook_id_site_webhooks_id_fk"
    FOREIGN KEY ("webhook_id") REFERENCES "site_webhooks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
