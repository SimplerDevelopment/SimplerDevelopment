-- Stripe BYOK (Bring Your Own Key) schema foundation (hand-written; tracker is out of sync, db:generate refuses).
-- Safe to re-run: every statement uses IF NOT EXISTS. No drops, no NOT NULL on existing data without a default, no type changes.
--
-- Adds five columns to store_settings so a tenant's ecommerce store can either keep using the platform's
-- Stripe Connect flow ('connect', the existing behavior) or switch to its own Stripe account ('byok').
-- The 'byok' path stores the secret key + webhook signing secret as AES-256-GCM ciphertext via
-- lib/crypto/api-key.ts; the publishable key is plaintext (it ships to the browser anyway).
-- stripe_byok_allowed is admin-gated so tenants cannot self-serve BYOK until SimplerDevelopment opts them in.

-- ─── store_settings: BYOK mode + admin gate + credentials ───
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "stripe_mode" varchar(20) NOT NULL DEFAULT 'connect';
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "stripe_byok_allowed" boolean NOT NULL DEFAULT false;
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "stripe_secret_key_encrypted" text;
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "stripe_publishable_key" varchar(255);
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "stripe_webhook_secret_encrypted" text;
