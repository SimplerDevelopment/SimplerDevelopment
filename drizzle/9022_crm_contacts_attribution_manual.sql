-- First-touch attribution on CRM contacts.
--
-- Stores the campaign / referrer that brought a lead in, captured once at
-- their first meaningful visit (lib/attribution.ts) and copied here when they
-- convert. Answers "which campaign produced this client" — the question that
-- decides where marketing spend goes — without a pageview table or any write
-- on ordinary traffic.
--
-- On crm_contacts rather than crm_deals because first touch belongs to the
-- PERSON: deals inherit it via contact_id instead of duplicating a fact that
-- can only ever have one value per lead.
--
-- jsonb rather than columns-per-utm-param: the shape is a small closed set we
-- read whole and never filter inside SQL, and a future field (gclid, an
-- affiliate id) then costs no migration at all.
--
-- Additive and idempotent: the "Prod schema sync (additive)" workflow applies
-- this automatically on merge to main. Nothing reads the column until a lead
-- converts with an attribution cookie set, so it is safe to apply before or
-- after the deploy, in either order.
--
-- Written by hand rather than generated because `drizzle-kit generate` needs
-- DATABASE_URL and an interactive TTY, which are not available here. This
-- matches how 9016-9021 shipped. The matching schema edit is in
-- lib/db/schema/crm.ts in this same commit.

ALTER TABLE "crm_contacts"
  ADD COLUMN IF NOT EXISTS "attribution" jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'crm_contacts'
       AND column_name = 'attribution'
  ) THEN
    RAISE EXCEPTION 'crm_contacts.attribution was not created';
  END IF;
  RAISE NOTICE 'crm_contacts.attribution present';
END$$;
