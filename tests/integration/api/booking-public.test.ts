/**
 * Public booking flow — /api/public/booking/[slug]/*
 *
 * Covered:
 *   - GET /[slug] — public page payload, 404 on unknown/inactive
 *   - GET /[slug]/slots — date validation, maxAdvanceDays gate
 *   - POST /[slug]/book:
 *       • 400 for missing name / email / startTime
 *       • 400 when past maxAdvanceDays
 *       • 409 when inside minNoticeMins (or during buffer conflict)
 *       • 200 + booking row for free bookings (no Stripe hit)
 *       • Capacity mode: rejects once maxGuests is reached
 *
 * Stripe / Google / Zoom / Resend are mocked via MSW + explicit vi.mocks so
 * the test exercises our logic without dialling out.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/email/booking-emails', () => ({
  sendGuestConfirmation: vi.fn().mockResolvedValue(undefined),
  sendHostNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/google-calendar', () => ({
  createCalendarEvent: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/zoom', () => ({
  createZoomMeeting: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/branding', () => ({
  getBrandingByBookingPageSlug: vi.fn().mockResolvedValue(null),
  brandingToCssVars: vi.fn().mockReturnValue({}),
}));

import { sendGuestConfirmation } from '@/lib/email/booking-emails';
const mockedGuestEmail = sendGuestConfirmation as unknown as Mock;

import { callHandler } from '../../helpers/call-handler';
import { sessionForNewClientUser } from '../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../helpers/test-db';

async function seedBookingPage(opts: {
  label?: string;
  active?: boolean;
  price?: number;
  maxGuests?: number | null;
  maxAdvanceDays?: number;
  minNoticeMins?: number;
  duration?: number;
  checkinEnabled?: boolean;
  enableDiscountCodes?: boolean;
} = {}): Promise<{ pageId: number; slug: string; clientId: number }> {
  const ctx = await sessionForNewClientUser(opts.label ?? 'booking');
  const sql = getTestSql();
  const slug = `page-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  // Always-on 7-day availability so slot math is simple to reason about
  const availability = JSON.stringify([0, 1, 2, 3, 4, 5, 6].map(day => ({
    day, startTime: '00:00', endTime: '23:59', enabled: true,
  })));

  const [p] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.booking_pages (
      client_id, title, slug, duration, max_advance_days, min_notice_mins,
      timezone, availability, active, price, max_guests, checkin_enabled,
      enable_discount_codes, enable_add_ons, enable_gift_certificates,
      enable_waivers, require_waiver_before_booking, allow_staff_selection,
      buffer_before, buffer_after, conference_type, google_calendar_sync,
      color
    )
    VALUES (
      ${ctx.client.id}, 'Test Booking', ${slug}, ${opts.duration ?? 30},
      ${opts.maxAdvanceDays ?? 60}, ${opts.minNoticeMins ?? 60},
      'UTC', ${availability}::jsonb, ${opts.active ?? true},
      ${opts.price ?? 0}, ${opts.maxGuests ?? null}, ${opts.checkinEnabled ?? false},
      ${opts.enableDiscountCodes ?? false}, false, false,
      false, false, false,
      0, 0, 'none', false,
      '#2563eb'
    )
    RETURNING id
  `;
  return { pageId: p.id, slug, clientId: ctx.client.id };
}

// Pick a date ~3 days ahead so we're past minNoticeMins (default 60) but inside
// maxAdvanceDays (default 60). Using an hour-boundary time in UTC.
function futureSlot(daysAhead = 3): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

describe('GET /api/public/booking/[slug] @booking @public', () => {
  it('404 for unknown slug', async () => {
    const route = await import('@/app/api/public/booking/[slug]/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { slug: 'does-not-exist' } },
    );
    expect(res.status).toBe(404);
    expect(res.data?.success).toBe(false);
  });

  it('404 when booking page exists but is inactive', async () => {
    const { slug } = await seedBookingPage({ active: false });
    const route = await import('@/app/api/public/booking/[slug]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { slug } },
    );
    expect(res.status).toBe(404);
  });

  it('returns page payload for an active slug', async () => {
    const { slug } = await seedBookingPage();
    const route = await import('@/app/api/public/booking/[slug]/route');
    const res = await callHandler<{ success: boolean; data: { slug: string; duration: number } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { slug } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.slug).toBe(slug);
    expect(res.data?.data.duration).toBeGreaterThan(0);
  });
});

describe('GET /api/public/booking/[slug]/slots @booking @public', () => {
  it('400 when date param is missing', async () => {
    const { slug } = await seedBookingPage();
    const route = await import('@/app/api/public/booking/[slug]/slots/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { slug } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/date/i);
  });

  it('400 when date param is malformed', async () => {
    const { slug } = await seedBookingPage();
    const route = await import('@/app/api/public/booking/[slug]/slots/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { slug }, query: { date: '2026/04/22' } },
    );
    expect(res.status).toBe(400);
  });

  it('404 when slug is unknown', async () => {
    const route = await import('@/app/api/public/booking/[slug]/slots/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { slug: 'nope' }, query: { date: '2026-04-22' } },
    );
    expect(res.status).toBe(404);
  });

  it('returns empty slots when date is past maxAdvanceDays', async () => {
    const { slug } = await seedBookingPage({ maxAdvanceDays: 7 });
    const faraway = new Date();
    faraway.setDate(faraway.getDate() + 60);
    const ymd = faraway.toISOString().slice(0, 10);

    const route = await import('@/app/api/public/booking/[slug]/slots/route');
    const res = await callHandler<{ success: boolean; data: unknown[] }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { slug }, query: { date: ymd } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data).toEqual([]);
  });
});

describe('POST /api/public/booking/[slug]/book @booking @public', () => {
  beforeEach(() => { mockedGuestEmail.mockClear(); });

  it('404 when slug is unknown', async () => {
    const route = await import('@/app/api/public/booking/[slug]/book/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { slug: 'nope' }, body: { name: 'A', email: 'a@b.c', startTime: futureSlot().toISOString() } },
    );
    expect(res.status).toBe(404);
  });

  it('400 when name is missing', async () => {
    const { slug } = await seedBookingPage();
    const route = await import('@/app/api/public/booking/[slug]/book/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { slug }, body: { email: 'a@b.c', startTime: futureSlot().toISOString() } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/name/i);
  });

  it('400 when email is missing', async () => {
    const { slug } = await seedBookingPage();
    const route = await import('@/app/api/public/booking/[slug]/book/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { slug }, body: { name: 'A', startTime: futureSlot().toISOString() } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/email/i);
  });

  it('400 when startTime is invalid', async () => {
    const { slug } = await seedBookingPage();
    const route = await import('@/app/api/public/booking/[slug]/book/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { slug }, body: { name: 'A', email: 'a@b.c', startTime: 'not-a-date' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/invalid start/i);
  });

  it('409 when startTime is inside minNoticeMins', async () => {
    const { slug } = await seedBookingPage({ minNoticeMins: 24 * 60 }); // 24h notice
    const soon = new Date(Date.now() + 5 * 60 * 1000);                  // 5 min from now
    const route = await import('@/app/api/public/booking/[slug]/book/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { slug }, body: { name: 'A', email: 'a@b.c', startTime: soon.toISOString() } },
    );
    expect(res.status).toBe(409);
    expect(res.data?.message).toMatch(/no longer available/i);
  });

  it('400 when startTime is past maxAdvanceDays', async () => {
    const { slug } = await seedBookingPage({ maxAdvanceDays: 7 });
    const tooFar = new Date();
    tooFar.setDate(tooFar.getDate() + 30);

    const route = await import('@/app/api/public/booking/[slug]/book/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { slug }, body: { name: 'A', email: 'a@b.c', startTime: tooFar.toISOString() } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/too far/i);
  });

  it('creates a free booking, returns 200, and persists expected row fields', async () => {
    const { slug, pageId, clientId } = await seedBookingPage({ price: 0 });
    const start = futureSlot(3);

    const route = await import('@/app/api/public/booking/[slug]/book/route');
    const res = await callHandler<{ success: boolean; data: { id: number; cancelToken: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { slug }, body: {
        name: 'Jane', email: 'jane@test.local',
        startTime: start.toISOString(),
      } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);

    const sql = getTestSql();
    const [booking] = await sql<{
      booking_page_id: number; client_id: number; guest_name: string;
      guest_email: string; payment_status: string; total: number; status: string;
    }[]>`
      SELECT booking_page_id, client_id, guest_name, guest_email, payment_status, total, status
      FROM ${sql(TEST_SCHEMA)}.bookings ORDER BY id DESC LIMIT 1
    `;
    expect(booking.booking_page_id).toBe(pageId);
    expect(booking.client_id).toBe(clientId);
    expect(booking.guest_name).toBe('Jane');
    expect(booking.guest_email).toBe('jane@test.local');
    expect(booking.payment_status).toBe('free');
    expect(booking.total).toBe(0);
    expect(booking.status).toBe('confirmed');
  });

  it('returns 409 on a second booking that overlaps the same slot (1:1 mode)', async () => {
    const { slug } = await seedBookingPage({ price: 0, maxGuests: null });
    const start = futureSlot(3);
    const route = await import('@/app/api/public/booking/[slug]/book/route');

    const first = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { slug }, body: { name: 'Jane', email: 'jane@test.local', startTime: start.toISOString() } },
    );
    expect(first.status).toBe(200);

    const second = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { slug }, body: { name: 'Bob', email: 'bob@test.local', startTime: start.toISOString() } },
    );
    expect(second.status).toBe(409);
    expect(second.data?.message).toMatch(/no longer available/i);
  });

  it('capacity mode: rejects once booked >= maxGuests at that slot', async () => {
    const { slug } = await seedBookingPage({ price: 0, maxGuests: 2 });
    const start = futureSlot(3);
    const route = await import('@/app/api/public/booking/[slug]/book/route');

    await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { slug }, body: { name: 'A', email: 'a@t.l', startTime: start.toISOString(), groupSize: 1 } },
    );
    await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { slug }, body: { name: 'B', email: 'b@t.l', startTime: start.toISOString(), groupSize: 1 } },
    );
    const overflow = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { slug }, body: { name: 'C', email: 'c@t.l', startTime: start.toISOString(), groupSize: 1 } },
    );
    expect(overflow.status).toBe(409);
    expect(overflow.data?.message).toMatch(/spots remaining/i);
  });

  it('capacity mode: groupSize that exceeds remaining capacity is rejected', async () => {
    const { slug } = await seedBookingPage({ price: 0, maxGuests: 3 });
    const start = futureSlot(3);
    const route = await import('@/app/api/public/booking/[slug]/book/route');

    await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { slug }, body: { name: 'A', email: 'a@t.l', startTime: start.toISOString(), groupSize: 2 } },
    );
    const overflow = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { slug }, body: { name: 'B', email: 'b@t.l', startTime: start.toISOString(), groupSize: 2 } },
    );
    expect(overflow.status).toBe(409);
  });

  it('generates a cancelToken (UUID-length) on successful booking', async () => {
    const { slug } = await seedBookingPage({ price: 0 });
    const start = futureSlot(3);
    const route = await import('@/app/api/public/booking/[slug]/book/route');
    await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { slug }, body: { name: 'T', email: 't@t.l', startTime: start.toISOString() } },
    );

    const sql = getTestSql();
    const [row] = await sql<{ cancel_token: string }[]>`
      SELECT cancel_token FROM ${sql(TEST_SCHEMA)}.bookings ORDER BY id DESC LIMIT 1
    `;
    expect(row.cancel_token.length).toBeGreaterThanOrEqual(32);
  });
});
