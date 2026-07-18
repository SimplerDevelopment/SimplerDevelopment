-- Per-domain SaaS billing foundation. Hand-applied (drizzle-kit generate is
-- blocked by the pre-existing meta snapshot collision; follows the
-- scripts/catalog/001_catalog_schema.sql precedent). Matches schema in
-- lib/db/schema/sites.ts and lib/db/schema/billing.ts.
--
-- Apply: psql "$DATABASE_URL" -f scripts/billing/001_domain_saas_billing.sql

-- clients.billing_mode: 'agency' (legacy, gating bypassed) | 'saas' | 'byok'
ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "billing_mode" varchar(20) DEFAULT 'agency' NOT NULL;

-- Stripe Subscription backing a self-serve module purchase (null for
-- admin-assigned / legacy rows).
ALTER TABLE "client_services"
  ADD COLUMN IF NOT EXISTS "stripe_subscription_id" varchar(255);

-- Per-client, per-resource alert configuration (absent row = warn at 80%, no
-- hard limit).
CREATE TABLE IF NOT EXISTS "usage_thresholds" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "resource" varchar(50) NOT NULL,
  "warn_at_pct" integer DEFAULT 80 NOT NULL,
  "hard_limit_quantity" numeric(18, 4),
  "notify_email" boolean DEFAULT true NOT NULL,
  "notify_portal" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "usage_thresholds_client_resource_unique"
  ON "usage_thresholds" ("client_id", "resource");

-- Alert audit/dedupe log — each level fires at most once per period.
CREATE TABLE IF NOT EXISTS "usage_alert_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "resource" varchar(50) NOT NULL,
  "period" varchar(7) NOT NULL,
  "level" varchar(20) NOT NULL,
  "usage_at_alert" numeric(18, 4) NOT NULL,
  "included_quantity" numeric(18, 4) NOT NULL,
  "notified_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "usage_alert_events_client_resource_period_level_unique"
  ON "usage_alert_events" ("client_id", "resource", "period", "level");
