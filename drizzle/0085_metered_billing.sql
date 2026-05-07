-- Metered Stripe billing for hosting + email pass-through resale.
--
-- HAND-APPLY ONLY — the drizzle migration tracker is drifted (per
-- .claude/MEMORY.md), so `bun run db:migrate` will refuse this. Apply with
-- `psql $DATABASE_URL -f drizzle/0085_metered_billing.sql`.
--
-- 1) metered_subscription_items   The bridge between an internal resource
--                                  counter (rolled up from `usage_meter_events`)
--                                  and the Stripe Subscription Item we report
--                                  `usage_records` against. One row per
--                                  (client, Stripe subscription_item_id).
--
-- 2) usage_billing_periods        Audit row written by the rollup cron each
--                                  time it pushes usage to Stripe. Unique on
--                                  (client_id, period, resource) so re-runs
--                                  are idempotent and we never double-push.

CREATE TABLE IF NOT EXISTS "metered_subscription_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL,
  "stripe_subscription_id" varchar(255) NOT NULL,
  "stripe_subscription_item_id" varchar(255) NOT NULL,
  "resource" varchar(50) NOT NULL,
  "unit_price_cents" integer NOT NULL,
  "included_quantity" numeric(18, 4) DEFAULT '0' NOT NULL,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "metered_subscription_items"
    ADD CONSTRAINT "metered_subscription_items_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metered_subscription_items_client_status_resource_idx"
  ON "metered_subscription_items" ("client_id", "status", "resource");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "usage_billing_periods" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL,
  "period" varchar(7) NOT NULL,
  "resource" varchar(50) NOT NULL,
  "total_quantity" numeric(18, 4) DEFAULT '0' NOT NULL,
  "included_quantity" numeric(18, 4) DEFAULT '0' NOT NULL,
  "billable_quantity" numeric(18, 4) DEFAULT '0' NOT NULL,
  "unit_price_cents" integer DEFAULT 0 NOT NULL,
  "billed_amount_cents" integer DEFAULT 0 NOT NULL,
  "stripe_usage_record_id" varchar(255),
  "reported_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "usage_billing_periods"
    ADD CONSTRAINT "usage_billing_periods_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "usage_billing_periods_client_period_resource_unique"
  ON "usage_billing_periods" ("client_id", "period", "resource");
