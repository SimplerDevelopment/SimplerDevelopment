-- Printful print-on-demand fulfillment integration
-- Adds fulfillment provider config to store_settings, Printful variant ID mapping
-- to products/product_variants, POD tracking fields to orders, and a
-- printful_events table for webhook idempotency.

-- ─── store_settings: fulfillment provider + Printful credentials ─────────────

ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS fulfillment_provider varchar(20) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS printful_api_key_encrypted text,
  ADD COLUMN IF NOT EXISTS printful_store_id varchar(100);

-- ─── products: Printful catalog variant ID (for products without variants) ───

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS printful_variant_id integer;

-- ─── product_variants: Printful catalog variant ID per variant ────────────────

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS printful_variant_id integer;

-- ─── orders: POD fulfillment tracking ─────────────────────────────────────────

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS printful_order_id varchar(100),
  ADD COLUMN IF NOT EXISTS printful_fulfillment_status varchar(30),
  ADD COLUMN IF NOT EXISTS printful_fulfillment_error text,
  ADD COLUMN IF NOT EXISTS printful_submitted_at timestamp;

-- ─── printful_events: webhook idempotency + audit ─────────────────────────────

CREATE TABLE IF NOT EXISTS printful_events (
  id serial PRIMARY KEY,
  website_id integer REFERENCES client_websites(id) ON DELETE CASCADE,
  event_id varchar(255) NOT NULL,
  event_type varchar(100) NOT NULL,
  printful_order_id varchar(100),
  order_id integer REFERENCES orders(id) ON DELETE SET NULL,
  payload jsonb NOT NULL,
  processed_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS printful_events_event_id_idx ON printful_events(event_id);
CREATE INDEX IF NOT EXISTS printful_events_order_id_idx ON printful_events(order_id);
