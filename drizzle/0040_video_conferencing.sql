-- Add conference type to booking pages
ALTER TABLE "booking_pages" ADD COLUMN "conference_type" varchar(20) DEFAULT 'none' NOT NULL;

-- Add meeting link to bookings
ALTER TABLE "bookings" ADD COLUMN "meeting_link" varchar(500);

-- Zoom OAuth tokens
CREATE TABLE IF NOT EXISTS "zoom_tokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "access_token" text NOT NULL,
  "refresh_token" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "zoom_tokens_client_id_unique" UNIQUE("client_id")
);
