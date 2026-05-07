-- Self-serve / PLG brain trial column. When non-null and > now() the
-- entitlement helper (lib/brain/entitlement.ts) grants brain access without
-- requiring an explicit `client_services` row pointing at the `brain` SKU.
-- Expired trials silently fall through to the paid-subscription check.
--
-- Idempotent so reruns against partially-migrated databases are safe.

ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "brain_trial_until" timestamp;
