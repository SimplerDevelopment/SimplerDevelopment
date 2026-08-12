-- internal_jobs: durable queue for internal background work (lib/jobs).
--
-- First consumer is POD fulfillment. The Stripe eCommerce webhook used to call
-- submitPODOrder fire-and-forget, so a Printful outage — or the lambda freezing
-- once the webhook had responded — meant a PAID order never reached the printer
-- and the only trace was a console line. This table gives that work the same
-- lease/backoff/dead-letter machinery automation_jobs already has.
--
-- Kept separate from automation_jobs on purpose: those rows are keyed by an
-- AUTOMATION_EVENTS name, and site_webhooks may subscribe with '*', so putting
-- internal job types on that bus would ship their payloads to tenant webhook
-- endpoints. See lib/db/schema/jobs.ts.
--
-- Additive and idempotent: the "Prod schema sync (additive)" workflow applies
-- this automatically on merge to main.
--
-- Written by hand rather than generated because `drizzle-kit generate` needs an
-- interactive TTY to resolve a pre-existing rename-vs-new-column prompt on this
-- branch, which is not available here. This matches how 9016-9021 shipped.

CREATE TABLE IF NOT EXISTS "internal_jobs" (
  "id"            serial PRIMARY KEY NOT NULL,
  "client_id"     integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "type"          varchar(60) NOT NULL,
  "payload"       json NOT NULL,
  "status"        varchar(20) DEFAULT 'pending' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "next_retry_at" timestamp with time zone,
  "error"         text,
  "dedupe_key"    varchar(200),
  "created_at"    timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at"  timestamp with time zone
);

-- Idempotency. NULL dedupe_key rows are exempt (Postgres allows many NULLs in a
-- unique index), so callers that genuinely don't need dedupe can omit it. Named
-- to match what drizzle's `.unique()` emits, so `drizzle-kit push` won't fight
-- this constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'internal_jobs_dedupe_key_unique'
  ) THEN
    ALTER TABLE "internal_jobs"
      ADD CONSTRAINT "internal_jobs_dedupe_key_unique" UNIQUE ("dedupe_key");
  END IF;
END$$;

-- Drives the drain query: due pending jobs, oldest first.
CREATE INDEX IF NOT EXISTS "internal_jobs_due_idx"
  ON "internal_jobs" ("status", "next_retry_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'internal_jobs'
  ) THEN
    RAISE EXCEPTION 'internal_jobs was not created';
  END IF;
  RAISE NOTICE 'internal_jobs present';
END$$;
