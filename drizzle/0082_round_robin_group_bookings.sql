-- Round-robin assignment + group/class bookings
--
-- Adds three concerns to the booking model:
--  1. assignmentMode + roundRobinPool on booking_pages — auto-distribute
--     incoming bookings across staff using either round-robin (fewest in
--     next 7 days) or fewest-upcoming (lowest absolute upcoming count).
--  2. bookingType + groupCapacity on booking_pages — single slot can
--     accept multiple registrants, capped per-page.
--  3. assignedUserId on bookings — audit trail for which user the
--     auto-assigner chose at create time, distinct from assignedTo
--     (which can be reassigned later).
--  4. booking_attendees — N-per-booking registrants for group bookings.
--     Only used when bookingType = 'group'; individual bookings
--     remain single-row in the bookings table.
--
-- All ADD COLUMN / CREATE TABLE statements are guarded with IF NOT
-- EXISTS so this migration is safe to apply on a database where partial
-- changes have already landed (sd2026 runs SQL by hand — see the
-- tracker-drift note in the project memory).

ALTER TABLE "booking_pages"
  ADD COLUMN IF NOT EXISTS "assignment_mode" varchar(20) DEFAULT 'fixed' NOT NULL;

ALTER TABLE "booking_pages"
  ADD COLUMN IF NOT EXISTS "round_robin_pool" json;

ALTER TABLE "booking_pages"
  ADD COLUMN IF NOT EXISTS "booking_type" varchar(20) DEFAULT 'individual' NOT NULL;

ALTER TABLE "booking_pages"
  ADD COLUMN IF NOT EXISTS "group_capacity" integer;

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "assigned_user_id" integer;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_assigned_user_id_fk'
  ) THEN
    ALTER TABLE "bookings"
      ADD CONSTRAINT "bookings_assigned_user_id_fk"
      FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "booking_attendees" (
  "id" serial PRIMARY KEY NOT NULL,
  "booking_id" integer NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "email" varchar(255) NOT NULL,
  "phone" varchar(50),
  "notes" text,
  "status" varchar(20) DEFAULT 'confirmed' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "booking_attendees_booking_id_idx"
  ON "booking_attendees" ("booking_id");
