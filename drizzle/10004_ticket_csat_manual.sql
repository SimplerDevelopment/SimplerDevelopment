-- Ticket CSAT — client satisfaction rating on a resolved support ticket.
-- Mirrors the csat_* columns added to supportTickets in lib/db/schema/pm.ts.
-- Hand-written (db:generate blocked by the meta-snapshot collision); apply
-- out-of-band: push on dev, psql on staging/prod.

ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "csat_score" integer;
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "csat_comment" text;
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "csat_submitted_at" timestamp;
