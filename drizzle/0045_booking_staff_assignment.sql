-- Add staff assignment support to booking system

-- Booking pages: allow customers to pick staff, track assigned members
ALTER TABLE "booking_pages" ADD COLUMN "allow_staff_selection" boolean DEFAULT false NOT NULL;
ALTER TABLE "booking_pages" ADD COLUMN "assigned_members" json DEFAULT '[]'::json;

-- Bookings: track which staff member is assigned
ALTER TABLE "bookings" ADD COLUMN "assigned_to" integer;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_assigned_to_users_id_fk"
  FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL;

-- Per-member settings and availability overrides for booking pages
CREATE TABLE IF NOT EXISTS "booking_page_members" (
  "id" serial PRIMARY KEY NOT NULL,
  "booking_page_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "display_name" varchar(255),
  "color" varchar(7),
  "availability" json,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "booking_page_members" ADD CONSTRAINT "booking_page_members_booking_page_id_booking_pages_id_fk"
  FOREIGN KEY ("booking_page_id") REFERENCES "booking_pages"("id") ON DELETE CASCADE;
ALTER TABLE "booking_page_members" ADD CONSTRAINT "booking_page_members_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
CREATE UNIQUE INDEX "booking_page_members_page_user_idx" ON "booking_page_members" ("booking_page_id", "user_id");
