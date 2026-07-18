/**
 * Group / class booking capacity — public booking flow.
 *
 * Covers:
 *   - groupCapacity=3 admits exactly 3 attendees (each booking confirmed),
 *   - 4th attendee request returns 409 with a "spots remaining" message,
 *   - cancelling a confirmed booking row frees its seat — 4th can now book,
 *   - multi-attendee body creates one bookings row + N booking_attendees rows.
 *
 * These tests exercise lib/booking/capacity.ts via the route handler — the
 * pure seat math is covered separately in tests/unit/booking-capacity.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/email/booking-emails', () => ({
  sendGuestConfirmation: vi.fn().mockResolvedValue(undefined),
  sendHostNotification: vi.fn().mockResolvedValue(undefined),
  sendCancellationEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/google-calendar', () => ({
  createCalendarEvent: vi.fn().mockResolvedValue(null),
  deleteCalendarEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/zoom', () => ({
  createZoomMeeting: vi.fn().mockResolvedValue(null),
  deleteZoomMeeting: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/branding', () => ({
  getBrandingByBookingPageSlug: vi.fn().mockResolvedValue(null),
  brandingToCssVars: vi.fn().mockReturnValue({}),
}));

import { callHandler } from '../../../../helpers/call-handler';
import { sessionForNewClientUser } from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';

async function seedGroupPage(opts: {
  label?: string;
  groupCapacity?: number;
} = {}) {
  const ctx = await sessionForNewClientUser(opts.label ?? 'group');
  const sql = getTestSql();
  const slug = `grp-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const availability = JSON.stringify(
    [0, 1, 2, 3, 4, 5, 6].map(day => ({
      day, startTime: '00:00', endTime: '23:59', enabled: true,
    })),
  );
  const [p] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.booking_pages (
      client_id, title, slug, duration, max_advance_days, min_notice_mins,
      timezone, availability, active, price, max_guests, checkin_enabled,
      enable_discount_codes, enable_add_ons, enable_gift_certificates,
      enable_waivers, require_waiver_before_booking, allow_staff_selection,
      buffer_before, buffer_after, conference_type, google_calendar_sync,
      color, assignment_mode, booking_type, group_capacity
    )
    VALUES (
      ${ctx.client.id}, 'Yoga Class', ${slug}, 60,
      365, 0,
      'UTC', ${availability}::jsonb, true,
      0, NULL, false,
      false, false, false,
      false, false, false,
      0, 0, 'none', false,
      '#2563eb', 'fixed', 'group', ${opts.groupCapacity ?? 3}
    )
    RETURNING id
  `;
  return { pageId: p.id, slug, clientId: ctx.client.id };
}

function futureSlot(daysAhead = 3): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(15, 0, 0, 0);
  return d;
}

async function bookAttendee(slug: string, slot: Date, name: string, email: string) {
  const route = await import('@/app/api/public/booking/[slug]/book/route');
  return callHandler<{ success: boolean; data: { id: number; cancelToken?: string }; message?: string }>(
    route as unknown as Record<string, unknown>, 'POST',
    {
      params: { slug },
      body: {
        name,
        email,
        startTime: slot.toISOString(),
        seats: 1,
        attendees: [{ name, email }],
      },
    },
  );
}

describe('public booking POST — group capacity @booking @public @group', () => {
  it('groupCapacity=3: first 3 attendees succeed, 4th rejected with 409 spots_remaining', async () => {
    const { slug, pageId } = await seedGroupPage({ groupCapacity: 3 });
    const slot = futureSlot(3);

    for (let i = 0; i < 3; i++) {
      const r = await bookAttendee(slug, slot, `Attendee ${i}`, `a${i}-${Date.now()}@test.local`);
      expect(r.status, `attendee #${i} should succeed`).toBe(200);
      expect(r.data?.success).toBe(true);
    }

    const fourth = await bookAttendee(slug, slot, 'Overflow', `overflow-${Date.now()}@test.local`);
    expect(fourth.status).toBe(409);
    expect(fourth.data?.success).toBe(false);
    // Group capacity uses "seats remaining"; legacy maxGuests path used
     // "spots remaining". Either is acceptable signal of a capacity reject.
    expect(fourth.data?.message ?? '').toMatch(/seats remaining|spots remaining/i);

    // Verify three bookings landed in DB, all confirmed.
    const sql = getTestSql();
    const rows = await sql<{ id: number; status: string }[]>`
      SELECT id, status FROM ${sql(TEST_SCHEMA)}.bookings
      WHERE booking_page_id = ${pageId}
      ORDER BY id ASC
    `;
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r.status).toBe('confirmed');

    // Each parent booking persisted exactly one attendee row, all confirmed.
    const attendeeRows = await sql<{ status: string }[]>`
      SELECT a.status
      FROM ${sql(TEST_SCHEMA)}.booking_attendees a
      JOIN ${sql(TEST_SCHEMA)}.bookings b ON b.id = a.booking_id
      WHERE b.booking_page_id = ${pageId}
    `;
    expect(attendeeRows).toHaveLength(3);
    for (const a of attendeeRows) expect(a.status).toBe('confirmed');
  });

  it('cancelling a confirmed booking frees its seat — 4th attendee can then book', async () => {
    const { slug, pageId } = await seedGroupPage({ groupCapacity: 3 });
    const slot = futureSlot(3);

    const tokens: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await bookAttendee(slug, slot, `A${i}`, `a${i}-${Date.now()}-${i}@test.local`);
      expect(r.status).toBe(200);
      // Capture cancel token for the first booking — pulled directly from
      // the DB since the success response shape doesn't echo it on group
      // bookings.
      if (i === 0) {
        const sql = getTestSql();
        const [row] = await sql<{ cancel_token: string }[]>`
          SELECT cancel_token FROM ${sql(TEST_SCHEMA)}.bookings
          WHERE booking_page_id = ${pageId}
          ORDER BY id ASC LIMIT 1
        `;
        tokens.push(row.cancel_token);
      }
    }

    // Confirm 4th is rejected pre-cancel.
    const blocked = await bookAttendee(slug, slot, 'Blocked', `b-${Date.now()}@test.local`);
    expect(blocked.status).toBe(409);

    // Cancel the first booking via the public cancel endpoint. Capacity
    // helper filters on bookings.status != 'cancelled', so this should free
    // the seat (and the linked attendee).
    const cancelRoute = await import('@/app/api/public/booking/cancel/route');
    const cancelRes = await callHandler(
      cancelRoute as unknown as Record<string, unknown>, 'POST',
      { body: { token: tokens[0] } },
    );
    expect(cancelRes.status).toBe(200);

    // Now a 4th attendee can book the same slot.
    const reopened = await bookAttendee(slug, slot, 'Reopened', `r-${Date.now()}@test.local`);
    expect(reopened.status, 'after cancel, slot should accept a new booking').toBe(200);
    expect(reopened.data?.success).toBe(true);

    // Final state: 4 bookings rows total (1 cancelled + 3 confirmed).
    const sql = getTestSql();
    const rows = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.bookings
      WHERE booking_page_id = ${pageId}
    `;
    expect(rows).toHaveLength(4);
    expect(rows.filter(r => r.status === 'confirmed').length).toBe(3);
    expect(rows.filter(r => r.status === 'cancelled').length).toBe(1);
  });

  it('multi-attendee body creates one bookings row + N booking_attendees rows', async () => {
    const { slug, pageId } = await seedGroupPage({ groupCapacity: 5 });
    const slot = futureSlot(3);
    const route = await import('@/app/api/public/booking/[slug]/book/route');

    const stamp = Date.now();
    const attendees = [
      { name: 'A One', email: `a1-${stamp}@test.local` },
      { name: 'A Two', email: `a2-${stamp}@test.local` },
      { name: 'A Three', email: `a3-${stamp}@test.local` },
    ];

    const res = await callHandler<{ success: boolean; data: { id: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { slug },
        body: {
          name: 'Primary Booker',
          email: `primary-${stamp}@test.local`,
          startTime: slot.toISOString(),
          // omit seats — route should infer seats = attendees.length
          attendees,
        },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);

    const sql = getTestSql();
    const bookingRows = await sql<{ id: number; group_size: number }[]>`
      SELECT id, group_size FROM ${sql(TEST_SCHEMA)}.bookings
      WHERE booking_page_id = ${pageId}
    `;
    expect(bookingRows).toHaveLength(1);
    expect(bookingRows[0].group_size).toBe(3);

    const bookingId = bookingRows[0].id;
    const attendeeRows = await sql<{ name: string; email: string; status: string }[]>`
      SELECT name, email, status FROM ${sql(TEST_SCHEMA)}.booking_attendees
      WHERE booking_id = ${bookingId}
      ORDER BY id ASC
    `;
    expect(attendeeRows).toHaveLength(3);
    expect(attendeeRows.map(a => a.email)).toEqual(attendees.map(a => a.email));
    expect(attendeeRows.map(a => a.name)).toEqual(attendees.map(a => a.name));
    for (const a of attendeeRows) expect(a.status).toBe('confirmed');
  });

  it('multi-attendee body that exceeds remaining capacity is rejected with 409', async () => {
    const { slug, pageId } = await seedGroupPage({ groupCapacity: 3 });
    const slot = futureSlot(3);
    const route = await import('@/app/api/public/booking/[slug]/book/route');

    // First fill 2 of 3 seats.
    await bookAttendee(slug, slot, 'X', `x-${Date.now()}@test.local`);
    await bookAttendee(slug, slot, 'Y', `y-${Date.now()}@test.local`);

    // Try to book 2 more in one shot — should overflow (only 1 seat left).
    const stamp = Date.now();
    const overflow = await callHandler<{ success: boolean; message?: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { slug },
        body: {
          name: 'Overflow Primary',
          email: `op-${stamp}@test.local`,
          startTime: slot.toISOString(),
          seats: 2,
          attendees: [
            { name: 'Over A', email: `oa-${stamp}@test.local` },
            { name: 'Over B', email: `ob-${stamp}@test.local` },
          ],
        },
      },
    );
    expect(overflow.status).toBe(409);
    expect(overflow.data?.message ?? '').toMatch(/seats remaining|spots remaining/i);

    // No partial write — only the 2 successful single-seat bookings exist.
    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.bookings WHERE booking_page_id = ${pageId}
    `;
    expect(rows).toHaveLength(2);
  });
});
