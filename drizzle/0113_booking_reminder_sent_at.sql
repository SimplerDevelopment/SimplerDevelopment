-- Add reminder_sent_at to bookings for /api/cron/booking-reminders.
--
-- NULL = no reminder sent. The cron picks rows where this is NULL and the
-- booking starts within the configured send window (~24h ahead). It then
-- sends a single reminder email and sets this column so subsequent cron
-- runs skip the row. Idempotent + safe to over-trigger.
--
-- NOTE: hand-written. The drizzle meta snapshot is stuck on a pre-existing
-- collision (project memory notes). Mirrors lib/db/schema/tools.ts.

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "reminder_sent_at" timestamp;

-- Partial index — only matters for the cron's hot-path lookup of unreminded
-- upcoming bookings. Don't index the reminded-already long tail.
CREATE INDEX IF NOT EXISTS "bookings_reminder_due_idx"
  ON "bookings" ("start_time")
  WHERE "reminder_sent_at" IS NULL AND "status" = 'confirmed';
