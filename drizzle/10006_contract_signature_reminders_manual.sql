-- E-sign signature-reminder tracking on crm_contracts (for the
-- process-contract-signature-reminders cron). Mirrors lib/db/schema/crm.ts.
-- Hand-written (db:generate blocked by the meta-snapshot collision); apply
-- out-of-band: push on dev, psql on staging/prod.
ALTER TABLE "crm_contracts" ADD COLUMN IF NOT EXISTS "esign_last_reminder_at" timestamp;
ALTER TABLE "crm_contracts" ADD COLUMN IF NOT EXISTS "esign_reminder_count" integer DEFAULT 0 NOT NULL;
