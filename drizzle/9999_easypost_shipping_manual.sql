-- EasyPost carrier-integration schema foundation (hand-written; tracker is out of sync, db:generate refuses).
-- Safe to re-run: every statement uses IF NOT EXISTS. No drops, no NOT NULL on existing data without a default, no type changes.

-- ─── store_settings: provider + EasyPost credentials + ship-from + parcel defaults ───
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "shipping_provider" varchar(20) NOT NULL DEFAULT 'manual';
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "easypost_api_key_encrypted" text;
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "easypost_mode" varchar(10) DEFAULT 'test';
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "easypost_webhook_secret" varchar(255);
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "ship_from_address" jsonb;
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "default_parcel_length_in" numeric(8,2);
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "default_parcel_width_in" numeric(8,2);
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "default_parcel_height_in" numeric(8,2);
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "default_parcel_weight_oz" numeric(8,2);
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "live_rates_fallback" boolean NOT NULL DEFAULT true;

-- ─── products: physical dimensions for live-rate quoting ───
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "length_in" numeric(8,2);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "width_in" numeric(8,2);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "height_in" numeric(8,2);

-- ─── product_variants: physical dimensions (override product defaults) ───
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "length_in" numeric(8,2);
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "width_in" numeric(8,2);
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "height_in" numeric(8,2);

-- ─── shipping_rates: provider-aware (manual fixed rate vs. EasyPost service filter) ───
ALTER TABLE "shipping_rates" ADD COLUMN IF NOT EXISTS "provider" varchar(20) NOT NULL DEFAULT 'manual';
ALTER TABLE "shipping_rates" ADD COLUMN IF NOT EXISTS "carrier_code" varchar(30);
ALTER TABLE "shipping_rates" ADD COLUMN IF NOT EXISTS "service_code" varchar(60);
ALTER TABLE "shipping_rates" ADD COLUMN IF NOT EXISTS "live_rate_only" boolean NOT NULL DEFAULT false;

-- ─── orders: EasyPost shipment + label + latest tracking snapshot ───
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "carrier" varchar(50);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "easypost_shipment_id" varchar(255);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "label_url" varchar(500);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "label_cost_cents" integer;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "label_purchased_at" timestamp;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "latest_tracking_status" varchar(50);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "latest_tracking_event_at" timestamp;

-- ─── easypost_events: raw webhook capture for idempotency + audit ───
CREATE TABLE IF NOT EXISTS "easypost_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "website_id" integer,
  "event_id" varchar(255) NOT NULL,
  "event_type" varchar(100) NOT NULL,
  "shipment_id" varchar(255),
  "tracker_id" varchar(255),
  "order_id" integer,
  "payload" jsonb NOT NULL,
  "processed_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "easypost_events_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "client_websites"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "easypost_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE set null ON UPDATE no action
);
CREATE UNIQUE INDEX IF NOT EXISTS "easypost_events_event_id_idx" ON "easypost_events" ("event_id");
CREATE INDEX IF NOT EXISTS "easypost_events_order_id_idx" ON "easypost_events" ("order_id");
