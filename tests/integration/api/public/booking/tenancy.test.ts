/**
 * Multi-tenant isolation — public booking flow. @tenancy
 *
 * The public booking endpoints look up by global slug (booking_pages.slug
 * is unique system-wide), but every write the route makes MUST stamp the
 * booking + attendees with the page's clientId so two tenants' data never
 * cross-contaminate.
 *
 * What this spec proves:
 *   1. A slug from tenant A returns 200 with A's clientId; a slug that
 *      simply does not exist returns 404 (no leak across the global
 *      namespace via guessing).
 *   2. Bookings created via slug-A persist under client A only — no rows
 *      land under client B.
 *   3. booking_attendees rows are reachable from tenant A's parent booking
 *      and never appear under tenant B's bookings.
 *   4. A booking row in tenant A cannot be cancelled by a guess at
 *      tenant B's cancel-token namespace (cancelToken is per-row UUID).
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

interface SeedOpts {
  label: string;
  groupCapacity?: number;
  bookingType?: 'individual' | 'group';
}

async function seedPage(opts: SeedOpts) {
  const ctx = await sessionForNewClientUser(opts.label);
  const sql = getTestSql();
  const slug = `${opts.label}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
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
      ${ctx.client.id}, 'Tenant Page', ${slug}, 30,
      365, 0,
      'UTC', ${availability}::jsonb, true,
      0, NULL, false,
      false, false, false,
      false, false, false,
      0, 0, 'none', false,
      '#2563eb', 'fixed', ${opts.bookingType ?? 'individual'},
      ${opts.groupCapacity ?? null}
    )
    RETURNING id
  `;
  return { pageId: p.id, slug, clientId: ctx.client.id };
}

function futureSlot(daysAhead = 3): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(10, 0, 0, 0);
  return d;
}

describe('public booking — tenant isolation @booking @public @tenancy', () => {
  it('a slug that does not exist anywhere returns 404 from GET / slots / book', async () => {
    // First, prove the public endpoints are alive by creating one tenant.
    await seedPage({ label: 'tenant-alive' });

    const phantomSlug = `nonexistent-${Date.now()}`;
    const getRoute = await import('@/app/api/public/booking/[slug]/route');
    const slotsRoute = await import('@/app/api/public/booking/[slug]/slots/route');
    const bookRoute = await import('@/app/api/public/booking/[slug]/book/route');

    const getRes = await callHandler(
      getRoute as unknown as Record<string, unknown>, 'GET',
      { params: { slug: phantomSlug } },
    );
    expect(getRes.status).toBe(404);

    const slotsRes = await callHandler(
      slotsRoute as unknown as Record<string, unknown>, 'GET',
      { params: { slug: phantomSlug }, query: { date: '2027-01-15' } },
    );
    expect(slotsRes.status).toBe(404);

    const bookRes = await callHandler(
      bookRoute as unknown as Record<string, unknown>, 'POST',
      { params: { slug: phantomSlug }, body: { name: 'Z', email: 'z@t.l', startTime: futureSlot().toISOString() } },
    );
    expect(bookRes.status).toBe(404);
  });

  it('GET /[slug] returns the page owned by tenant A, not contaminated by tenant B', async () => {
    const A = await seedPage({ label: 'tenant-a' });
    const B = await seedPage({ label: 'tenant-b' });
    expect(A.clientId).not.toBe(B.clientId);

    const route = await import('@/app/api/public/booking/[slug]/route');

    const resA = await callHandler<{ success: boolean; data: { slug: string } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { slug: A.slug } },
    );
    expect(resA.status).toBe(200);
    expect(resA.data?.data.slug).toBe(A.slug);

    const resB = await callHandler<{ success: boolean; data: { slug: string } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { slug: B.slug } },
    );
    expect(resB.status).toBe(200);
    expect(resB.data?.data.slug).toBe(B.slug);

    // Probing A's slug must never return B's record (and vice-versa). The
    // GET payload doesn't echo clientId publicly, so we re-confirm by DB
    // lookup that each row is still scoped to the correct tenant.
    const sql = getTestSql();
    const [rowA] = await sql<{ client_id: number }[]>`
      SELECT client_id FROM ${sql(TEST_SCHEMA)}.booking_pages WHERE slug = ${A.slug}
    `;
    const [rowB] = await sql<{ client_id: number }[]>`
      SELECT client_id FROM ${sql(TEST_SCHEMA)}.booking_pages WHERE slug = ${B.slug}
    `;
    expect(rowA.client_id).toBe(A.clientId);
    expect(rowB.client_id).toBe(B.clientId);
    expect(rowA.client_id).not.toBe(rowB.client_id);
  });

  it('a booking made on tenant A persists with clientId=A and is not visible under tenant B', async () => {
    const A = await seedPage({ label: 'tenant-a-write' });
    const B = await seedPage({ label: 'tenant-b-write' });
    const slot = futureSlot(3);

    const bookRoute = await import('@/app/api/public/booking/[slug]/book/route');
    const stamp = Date.now();
    const r = await callHandler<{ success: boolean; data: { id: number } }>(
      bookRoute as unknown as Record<string, unknown>, 'POST',
      {
        params: { slug: A.slug },
        body: { name: 'Tenant A Guest', email: `taguest-${stamp}@test.local`, startTime: slot.toISOString() },
      },
    );
    expect(r.status).toBe(200);

    const sql = getTestSql();
    // Booking row exists under A.
    const aRows = await sql<{ client_id: number; booking_page_id: number }[]>`
      SELECT client_id, booking_page_id FROM ${sql(TEST_SCHEMA)}.bookings
      WHERE client_id = ${A.clientId}
    `;
    expect(aRows).toHaveLength(1);
    expect(aRows[0].booking_page_id).toBe(A.pageId);

    // No bookings landed under B.
    const bRows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.bookings WHERE client_id = ${B.clientId}
    `;
    expect(bRows).toHaveLength(0);
  });

  it('booking_attendees from tenant A are never reachable via tenant B bookings', async () => {
    const A = await seedPage({ label: 'tenant-a-grp', bookingType: 'group', groupCapacity: 3 });
    const B = await seedPage({ label: 'tenant-b-grp', bookingType: 'group', groupCapacity: 3 });
    const slot = futureSlot(3);
    const stamp = Date.now();

    const bookRoute = await import('@/app/api/public/booking/[slug]/book/route');

    // Book under A with two attendees.
    const aRes = await callHandler(
      bookRoute as unknown as Record<string, unknown>, 'POST',
      {
        params: { slug: A.slug },
        body: {
          name: 'A Primary',
          email: `aprim-${stamp}@test.local`,
          startTime: slot.toISOString(),
          attendees: [
            { name: 'A1', email: `a1-${stamp}@test.local` },
            { name: 'A2', email: `a2-${stamp}@test.local` },
          ],
        },
      },
    );
    expect(aRes.status).toBe(200);

    // Book under B with one attendee.
    const bRes = await callHandler(
      bookRoute as unknown as Record<string, unknown>, 'POST',
      {
        params: { slug: B.slug },
        body: {
          name: 'B Primary',
          email: `bprim-${stamp}@test.local`,
          startTime: slot.toISOString(),
          attendees: [{ name: 'B1', email: `b1-${stamp}@test.local` }],
        },
      },
    );
    expect(bRes.status).toBe(200);

    const sql = getTestSql();
    // Attendees under A's bookings (joined through clientId).
    const aAttendees = await sql<{ name: string; email: string }[]>`
      SELECT a.name, a.email
      FROM ${sql(TEST_SCHEMA)}.booking_attendees a
      JOIN ${sql(TEST_SCHEMA)}.bookings b ON b.id = a.booking_id
      WHERE b.client_id = ${A.clientId}
      ORDER BY a.id ASC
    `;
    expect(aAttendees).toHaveLength(2);
    expect(aAttendees.map(a => a.name)).toEqual(['A1', 'A2']);

    const bAttendees = await sql<{ name: string }[]>`
      SELECT a.name
      FROM ${sql(TEST_SCHEMA)}.booking_attendees a
      JOIN ${sql(TEST_SCHEMA)}.bookings b ON b.id = a.booking_id
      WHERE b.client_id = ${B.clientId}
    `;
    expect(bAttendees).toHaveLength(1);
    expect(bAttendees[0].name).toBe('B1');

    // Cross-tenant query returns no rows: no attendee from A should be
    // joinable to a booking row owned by B (and vice-versa).
    const cross = await sql<{ id: number }[]>`
      SELECT a.id
      FROM ${sql(TEST_SCHEMA)}.booking_attendees a
      JOIN ${sql(TEST_SCHEMA)}.bookings b ON b.id = a.booking_id
      WHERE a.email IN (${`a1-${stamp}@test.local`}, ${`a2-${stamp}@test.local`})
        AND b.client_id = ${B.clientId}
    `;
    expect(cross).toHaveLength(0);
  });

  it('cancel-token namespace is per-row — guessing token from another tenant returns 404', async () => {
    // Create one booking under each of two tenants.
    const A = await seedPage({ label: 'tenant-a-cancel' });
    const B = await seedPage({ label: 'tenant-b-cancel' });
    const slot = futureSlot(3);
    const stamp = Date.now();

    const bookRoute = await import('@/app/api/public/booking/[slug]/book/route');
    await callHandler(bookRoute as unknown as Record<string, unknown>, 'POST', {
      params: { slug: A.slug },
      body: { name: 'A', email: `a-${stamp}@t.l`, startTime: slot.toISOString() },
    });
    await callHandler(bookRoute as unknown as Record<string, unknown>, 'POST', {
      params: { slug: B.slug },
      body: { name: 'B', email: `b-${stamp}@t.l`, startTime: slot.toISOString() },
    });

    const sql = getTestSql();
    const [aRow] = await sql<{ id: number; cancel_token: string }[]>`
      SELECT id, cancel_token FROM ${sql(TEST_SCHEMA)}.bookings
      WHERE client_id = ${A.clientId} ORDER BY id ASC LIMIT 1
    `;
    const [bRow] = await sql<{ id: number; cancel_token: string }[]>`
      SELECT id, cancel_token FROM ${sql(TEST_SCHEMA)}.bookings
      WHERE client_id = ${B.clientId} ORDER BY id ASC LIMIT 1
    `;
    expect(aRow.cancel_token).not.toBe(bRow.cancel_token);

    const cancelRoute = await import('@/app/api/public/booking/cancel/route');

    // A made-up token (neither A's nor B's) → 404.
    const phantom = await callHandler(
      cancelRoute as unknown as Record<string, unknown>, 'POST',
      { body: { token: '00000000-0000-0000-0000-000000000000' } },
    );
    expect(phantom.status).toBe(404);

    // Cancelling B's booking with B's own token must NOT touch A's booking.
    const cancelB = await callHandler(
      cancelRoute as unknown as Record<string, unknown>, 'POST',
      { body: { token: bRow.cancel_token } },
    );
    expect(cancelB.status).toBe(200);

    const [aAfter] = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.bookings WHERE id = ${aRow.id}
    `;
    const [bAfter] = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.bookings WHERE id = ${bRow.id}
    `;
    expect(aAfter.status).toBe('confirmed');
    expect(bAfter.status).toBe('cancelled');
  });
});
