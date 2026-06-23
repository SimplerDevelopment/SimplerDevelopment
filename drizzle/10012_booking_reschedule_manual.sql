-- Phase 1: Booking reschedule support
-- Hand-written (manual) migration — do NOT edit with bun run db:generate.
-- Adds reschedule columns to bookings and booking_pages.

-- bookings: reschedule token + history + counter
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS reschedule_token VARCHAR(64) UNIQUE,
  ADD COLUMN IF NOT EXISTS previous_start_time TIMESTAMP,
  ADD COLUMN IF NOT EXISTS previous_end_time TIMESTAMP,
  ADD COLUMN IF NOT EXISTS reschedule_count INTEGER NOT NULL DEFAULT 0;

-- booking_pages: reschedule feature toggles
ALTER TABLE booking_pages
  ADD COLUMN IF NOT EXISTS reschedule_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS reschedule_window_hours INTEGER NOT NULL DEFAULT 24;
