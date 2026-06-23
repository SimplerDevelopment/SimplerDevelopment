/**
 * Backward compatibility — public booking flow.
 *
 * A booking page that pre-dates the round-robin / group columns (i.e.
 * defaults: bookingType='individual', assignmentMode='fixed', no
 * groupCapacity, no roundRobinPool, no booking_page_members) must still
 * work via the public flow:
 *   - GET / slots / book all return 200,
 *   - exactly one booking row is created per request,
 *   - assignedUserId is null (fixed → no auto-assigner),
 *   - no booking_attendees rows are created (individual → bookings IS the
 *     attendee).
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

/**
 * Seed a "legacy" page — only the columns that existed before the
 * round-robin/group migration. The new columns fall back to their schema
 * defaults (assignmentMode='fixed', bookingType='individual',
 * groupCapacity=null, roundRobinPool=null) which is exactly what we want
 * to verify here.
 */
async function seedLegacyPage(label = 'legacy') {
  const ctx = await sessionForNewClientUser(label);
  const sql = getTestSql();
  const slug = `legacy-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const availability = JSON.stringify(
    [0, 1, 2, 3, 4, 5, 6].map(day => ({
      day, startTime: '00:00', endTime: '23:59', enabled: true,
    })),
  );
  // Deliberately omit assignment_mode, round_robin_pool, booking_type,
  // group_capacity, assigned_members so they pick up the schema defaults.
  const [p] = await sql<{
    id: number; assignment_mode: string; booking_type: string;
    group_capacity: number | null; round_robin_pool: unknown;
  }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.booking_pages (
      client_id, title, slug, duration, max_advance_days, min_notice_mins,
      timezone, availability, active, price, max_guests, checkin_enabled,
      enable_discount_codes, enable_add_ons, enable_gift_certificates,
      enable_waivers, require_waiver_before_booking, allow_staff_selection,
      buffer_before, buffer_after, conference_type, google_calendar_sync,
      color
    )
    VALUES (
      ${ctx.client.id}, 'Legacy Page', ${slug}, 30,
      365, 0,
      'UTC', ${availability}::jsonb, true,
      0, NULL, false,
      false, false, false,
      false, false, false,
      0, 0, 'none', false,
      '#2563eb'
    )
    RETURNING id, assignment_mode, booking_type, group_capacity, round_robin_pool
  `;
  return {
    pageId: p.id, slug, clientId: ctx.client.id, ownerUserId: ctx.user.id,
    defaults: p,
  };
}

function futureSlot(daysAhead = 3): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(11, 0, 0, 0);
  return d;
}

describe('public booking — backward compat (individual + fixed defaults) @booking @public', () => {
  it('schema defaults are individual + fixed + no pool / capacity', async () => {
    const { defaults } = await seedLegacyPage('legacy-defaults');
    expect(defaults.assignment_mode).toBe('fixed');
    expect(defaults.booking_type).toBe('individual');
    expect(defaults.group_capacity).toBeNull();
    expect(defaults.round_robin_pool).toBeNull();
  });

  it('legacy individual page accepts a single guest booking — confirmed, no attendee rows', async () => {
    const { slug, pageId, clientId } = await seedLegacyPage('legacy-book');
    const slot = futureSlot(3);

    const route = await import('@/app/api/public/booking/[slug]/book/route');
    const res = await callHandler<{ success: boolean; data: { id: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { slug },
        body: {
          name: 'Solo Guest', email: 'solo@test.local',
          startTime: slot.toISOString(),
        },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);

    const sql = getTestSql();
    const bookings = await sql<{
      id: number; client_id: number; booking_page_id: number;
      assigned_to: number | null; assigned_user_id: number | null;
      group_size: number; status: string; payment_status: string;
    }[]>`
      SELECT id, client_id, booking_page_id, assigned_to, assigned_user_id,
             group_size, status, payment_status
      FROM ${sql(TEST_SCHEMA)}.bookings
      WHERE booking_page_id = ${pageId}
    `;
    expect(bookings).toHaveLength(1);
    const b = bookings[0];
    expect(b.client_id).toBe(clientId);
    expect(b.group_size).toBe(1);
    expect(b.status).toBe('confirmed');
    expect(b.payment_status).toBe('free');
    // 'fixed' → no auto-assigner; with no assigned_members fallback either,
    // both columns stay null.
    expect(b.assigned_user_id).toBeNull();
    expect(b.assigned_to).toBeNull();

    // Individual bookings must NOT create booking_attendees rows.
    const atts = await sql<{ id: number }[]>`
      SELECT a.id FROM ${sql(TEST_SCHEMA)}.booking_attendees a
      JOIN ${sql(TEST_SCHEMA)}.bookings b ON b.id = a.booking_id
      WHERE b.booking_page_id = ${pageId}
    `;
    expect(atts).toHaveLength(0);
  });

  it('GET / slots / book on a legacy page all return 200', async () => {
    const { slug } = await seedLegacyPage('legacy-endpoints');
    const slot = futureSlot(3);
    const ymd = slot.toISOString().slice(0, 10);

    const getRoute = await import('@/app/api/public/booking/[slug]/route');
    const slotsRoute = await import('@/app/api/public/booking/[slug]/slots/route');
    const bookRoute = await import('@/app/api/public/booking/[slug]/book/route');

    const getRes = await callHandler<{ success: boolean; data: { duration: number; bookingType: string } }>(
      getRoute as unknown as Record<string, unknown>, 'GET',
      { params: { slug } },
    );
    expect(getRes.status).toBe(200);
    expect(getRes.data?.success).toBe(true);
    expect(getRes.data?.data.duration).toBe(30);
    expect(getRes.data?.data.bookingType).toBe('individual');

    const slotsRes = await callHandler<{ success: boolean; data: unknown[] }>(
      slotsRoute as unknown as Record<string, unknown>, 'GET',
      { params: { slug }, query: { date: ymd } },
    );
    expect(slotsRes.status).toBe(200);
    expect(Array.isArray(slotsRes.data?.data)).toBe(true);

    const bookRes = await callHandler<{ success: boolean }>(
      bookRoute as unknown as Record<string, unknown>, 'POST',
      {
        params: { slug },
        body: {
          name: 'Legacy Guest', email: 'legacy@test.local',
          startTime: slot.toISOString(),
        },
      },
    );
    expect(bookRes.status).toBe(200);
    expect(bookRes.data?.success).toBe(true);
  });

  it('legacy 1:1 conflict guard still rejects a second guest at the same slot', async () => {
    const { slug, pageId } = await seedLegacyPage('legacy-1to1');
    const slot = futureSlot(3);
    const route = await import('@/app/api/public/booking/[slug]/book/route');

    const first = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { slug }, body: { name: 'Jane', email: 'jane@t.l', startTime: slot.toISOString() } },
    );
    expect(first.status).toBe(200);

    const second = await callHandler<{ success: boolean; message?: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { slug }, body: { name: 'Bob', email: 'bob@t.l', startTime: slot.toISOString() } },
    );
    expect(second.status).toBe(409);
    expect(second.data?.message ?? '').toMatch(/no longer available/i);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.bookings WHERE booking_page_id = ${pageId}
    `;
    expect(rows).toHaveLength(1);
  });
});
