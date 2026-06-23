/**
 * Gap coverage: Booking reschedule flow (Phase 1)
 *
 * Routes exercised:
 *   GET  /api/public/booking/reschedule?token=<rescheduleToken>
 *   POST /api/public/booking/reschedule  { token, newStartTime, newEndTime, timezone }
 *
 * Gaps covered:
 *   1. GET with a valid token → 200 + booking + page config returned.
 *   2. GET with an unknown token → 404.
 *   3. POST reschedule to a new valid slot → 200; psql asserts that
 *      startTime moved, previousStartTime is set, and rescheduleCount = 1.
 *   4. POST with a bad token → 404.
 *
 * GCal update and email send are best-effort fire-and-forget — not asserted here.
 *
 * Seed strategy: we INSERT a booking_pages row + a bookings row directly via
 * psql so we control the rescheduleToken and a startTime far in the future.
 * Both rows are torn down in afterAll.
 */

import { execSync } from 'child_process';
import { test, expect } from './setup/fixtures';

// ── DB seed helpers ───────────────────────────────────────────────────────────

const DB_URL =
  process.env.DATABASE_URL || 'postgresql://dancoyle@localhost:5432/simplerdev_test';

function psql(sql: string): string {
  // Collapse newlines — JSON.stringify of multi-line SQL emits literal "\n"
  // which psql -c receives as backslash-n and rejects. SQL is whitespace-
  // insensitive so a single line is equivalent.
  const oneLine = sql.replace(/\s*\n\s*/g, ' ');
  return execSync(`psql "${DB_URL}" -t -A -c ${JSON.stringify(oneLine)}`, {
    encoding: 'utf-8',
  }).trim();
}

// Client ID 1 is the seed owner in simplerdev_test (client@example.com).
const CLIENT_ID = 1;

const KNOWN_RESCHEDULE_TOKEN = `test-reschedule-token-${Date.now()}`;
// Start time 72 hours in the future — safely beyond any reschedule window.
const FUTURE_START = new Date(Date.now() + 72 * 60 * 60 * 1000);
const FUTURE_END = new Date(FUTURE_START.getTime() + 30 * 60 * 1000);

// New slot: 96 hours in the future so it passes min-notice and max-advance.
const NEW_START = new Date(Date.now() + 96 * 60 * 60 * 1000);
const NEW_END = new Date(NEW_START.getTime() + 30 * 60 * 1000);

// Align new slot to a Monday 09:00 boundary in the page's default availability
// (Mon–Fri 09:00–17:00). We pick the next Monday after NEW_START's date.
// (The availability guard only rejects if the day/window doesn't match — since
// we seed rescheduleEnabled=true and the page timezone is America/New_York, we
// need a weekday slot inside 09:00–17:00 ET. Using UTC noon on a Tuesday
// should land inside the window for most test runs; if the CI clock is in
// another timezone we have flexibility because the page timezone is set to UTC
// here.)
const ALIGNED_START = (() => {
  // Snap to Wednesday, 14:00 UTC (clearly within Mon–Fri 09–17 for UTC tz page)
  const d = new Date(Date.now() + 96 * 60 * 60 * 1000);
  // Advance to next Wednesday
  while (d.getUTCDay() !== 3) { d.setUTCDate(d.getUTCDate() + 1); }
  d.setUTCHours(14, 0, 0, 0);
  return d;
})();
const ALIGNED_END = new Date(ALIGNED_START.getTime() + 30 * 60 * 1000);

let PAGE_ID: number;
let BOOKING_ID: number;

test.beforeAll(async () => {
  // Insert a minimal booking_page for this spec run.
  // Uses UTC as the timezone so day-of-week math is deterministic.
  const pageRow = psql(
    `INSERT INTO booking_pages (
       client_id, title, slug, duration, buffer_before, buffer_after,
       max_advance_days, min_notice_mins, timezone, active,
       google_calendar_sync, conference_type, assignment_mode,
       booking_type, enable_add_ons, enable_gift_certificates,
       enable_discount_codes, enable_waivers, require_waiver_before_booking,
       checkin_enabled, allow_staff_selection, reschedule_enabled,
       reschedule_window_hours,
       availability
     ) VALUES (
       ${CLIENT_ID},
       'E2E Reschedule Test Page',
       'e2e-reschedule-${Date.now()}',
       30, 0, 15,
       90, 60, 'UTC', true,
       false, 'none', 'fixed',
       'individual', false, false,
       false, false, false,
       false, false, true,
       24,
       '[{"day":1,"startTime":"09:00","endTime":"17:00","enabled":true},{"day":2,"startTime":"09:00","endTime":"17:00","enabled":true},{"day":3,"startTime":"09:00","endTime":"17:00","enabled":true},{"day":4,"startTime":"09:00","endTime":"17:00","enabled":true},{"day":5,"startTime":"09:00","endTime":"17:00","enabled":true},{"day":0,"startTime":"09:00","endTime":"17:00","enabled":false},{"day":6,"startTime":"09:00","endTime":"17:00","enabled":false}]'
     ) RETURNING id;`
  );
  PAGE_ID = parseInt(pageRow, 10);
  if (!PAGE_ID) throw new Error(`Failed to seed booking_page. psql output: "${pageRow}"`);

  // Insert a confirmed booking with a known rescheduleToken.
  const bookingRow = psql(
    `INSERT INTO bookings (
       booking_page_id, client_id, guest_name, guest_email,
       start_time, end_time, timezone, status,
       cancel_token, reschedule_token,
       group_size, subtotal, discount_total, total,
       gift_certificate_amount, payment_status, reschedule_count
     ) VALUES (
       ${PAGE_ID}, ${CLIENT_ID},
       'E2E Reschedule Guest', 'e2e-reschedule@example.com',
       '${FUTURE_START.toISOString()}',
       '${FUTURE_END.toISOString()}',
       'UTC', 'confirmed',
       'cancel-tok-reschedule-${Date.now()}',
       '${KNOWN_RESCHEDULE_TOKEN}',
       1, 0, 0, 0, 0, 'free', 0
     ) RETURNING id;`
  );
  BOOKING_ID = parseInt(bookingRow, 10);
  if (!BOOKING_ID) throw new Error(`Failed to seed booking. psql output: "${bookingRow}"`);
});

test.afterAll(async () => {
  // Remove seeded rows — bookings CASCADE-deletes from booking_pages automatically.
  if (BOOKING_ID) psql(`DELETE FROM bookings WHERE id = ${BOOKING_ID};`);
  if (PAGE_ID) psql(`DELETE FROM booking_pages WHERE id = ${PAGE_ID};`);
});

// ── Gap 1: GET with a valid token → 200 + booking + page config ──────────────

test.describe('Reschedule GET @gap @bookings-reschedule', () => {
  test('returns 200 + booking details for a valid reschedule token', async ({ unauthApi }) => {
    const res = await unauthApi.get(
      `/api/public/booking/reschedule?token=${KNOWN_RESCHEDULE_TOKEN}`,
    );
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    const d = res.data.data;
    expect(d.id).toBe(BOOKING_ID);
    expect(d.guestEmail).toBe('e2e-reschedule@example.com');
    expect(d.status).toBe('confirmed');
    expect(d.page).toBeDefined();
    expect(d.page.id).toBe(PAGE_ID);
    expect(d.page.rescheduleEnabled).toBe(true);
    expect(typeof d.page.rescheduleWindowHours).toBe('number');
  });

  test('returns 404 for an unknown reschedule token', async ({ unauthApi }) => {
    const res = await unauthApi.get(
      '/api/public/booking/reschedule?token=does-not-exist-token-xyz',
    );
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });
});

// ── Gap 2: POST reschedule to a new valid slot ────────────────────────────────

test.describe('Reschedule POST @gap @bookings-reschedule', () => {
  test('moves booking to new slot and sets previousStartTime + rescheduleCount=1', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/public/booking/reschedule', {
      token: KNOWN_RESCHEDULE_TOKEN,
      newStartTime: ALIGNED_START.toISOString(),
      newEndTime: ALIGNED_END.toISOString(),
      timezone: 'UTC',
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    const d = res.data.data;
    expect(d.rescheduleCount).toBe(1);
    expect(d.previousStartTime).toBeTruthy();
    expect(new Date(d.startTime).getTime()).toBeCloseTo(ALIGNED_START.getTime(), -3);

    // Verify via direct DB read that the row was mutated correctly.
    const row = psql(
      `SELECT start_time, previous_start_time, reschedule_count
         FROM bookings
        WHERE id = ${BOOKING_ID};`
    );
    // row format: "2026-...|2026-...|1"
    const [dbStart, dbPrevStart, dbCount] = row.split('|');
    expect(dbPrevStart).toBeTruthy(); // previous_start_time set
    expect(dbCount.trim()).toBe('1');  // reschedule_count incremented
    // New startTime should differ from the original FUTURE_START
    expect(new Date(dbStart.trim()).getTime()).not.toBe(FUTURE_START.getTime());
  });

  test('returns 404 for a bad token', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/public/booking/reschedule', {
      token: 'completely-fake-token-000',
      newStartTime: ALIGNED_START.toISOString(),
      newEndTime: ALIGNED_END.toISOString(),
      timezone: 'UTC',
    });
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });
});
