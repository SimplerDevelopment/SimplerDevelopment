-- Activation deltas for the 21/21-roast feature work — hand-written; tracker is out of sync, db:generate refuses.
-- Safe to re-run: every statement uses IF NOT EXISTS. No drops, no NOT NULL on existing data without a default.
-- Must be hand-applied to prod + staging before the staging→main merge, same as 9003/9999.
-- Mirrors lib/db/schema/tools.ts (bookings.slotExclusive), lib/db/schema/auth.ts (users.mfaEnabled/totpSecret),
-- and lib/db/schema/brain.ts (automationJobs). Already applied to the dev DB and verified.
--
-- Adds:
--   1. bookings.slot_exclusive + bookings_exclusive_slot_idx — DB-enforced 1:1 double-booking guard (23505 → 409)
--   2. users.mfa_enabled + users.totp_secret — TOTP MFA on the credentials path (totp_secret AES-256-GCM at rest)
--   3. automation_jobs (+ pending index) — durable at-least-once automation queue (cron: process-automation-jobs)

-- ─── bookings: 1:1 double-booking guard ────────────────────────────────────
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "slot_exclusive" boolean NOT NULL DEFAULT false;

-- Partial unique index: at most one non-cancelled booking per (page, start_time)
-- on exclusive (1:1) slots. Group slots (slot_exclusive=false) are excluded.
CREATE UNIQUE INDEX IF NOT EXISTS "bookings_exclusive_slot_idx"
  ON "bookings" ("booking_page_id", "start_time")
  WHERE "status" <> 'cancelled' AND "slot_exclusive";

-- ─── users: TOTP MFA ───────────────────────────────────────────────────────
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfa_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_secret" text;

-- ─── automation_jobs: durable at-least-once queue ──────────────────────────
CREATE TABLE IF NOT EXISTS "automation_jobs" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "event" varchar(100) NOT NULL,
  "user_id" integer NOT NULL DEFAULT 0,
  "payload" json NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "next_retry_at" timestamp with time zone,
  "error" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "processed_at" timestamp
);

CREATE INDEX IF NOT EXISTS "automation_jobs_pending_idx"
  ON "automation_jobs" ("status", "created_at");
