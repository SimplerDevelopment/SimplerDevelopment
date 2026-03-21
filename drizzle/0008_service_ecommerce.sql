-- Add Stripe product ID to services for full product/price sync
ALTER TABLE services ADD COLUMN IF NOT EXISTS stripe_product_id varchar(255);
