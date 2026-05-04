/**
 * Availability / busy-time computation —
 *   /api/public/booking/[slug]/slots (GET)
 *
 * The portal exposes "availability" through the public slots endpoint, which
 * synthesises slots from booking_pages.availability minus existing bookings,
 * minus blocked date overrides, minus the per-page buffers. There is no
 * `/api/portal/.../availability/route.ts` in this codebase — the public slots
 * route is the canonical busy-time engine.
 *
 * Coverage:
 *   - Date past maxAdvanceDays => empty slots
 *   - Blocked date override => empty slots
 *   - Available date override => slots match the override window
 *   - 1:1 mode: booking a slot excludes that exact slot from the next query
 *   - Capacity mode (maxGuests>1): slot remains until cumulative groupSize ≥ maxGuests
 */
import { describe, it, expect, vi } from 'vitest';

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

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

interface SeedOpts {
  duration?: number;
  maxAdvanceDays?: number;
  minNoticeMins?: number;
  maxGuests?: number | null;
  bufferBefore?: number;
  bufferAfter?: number;
}

async function seedPage(opts: SeedOpts = {}) {
  const ctx = await sessionForNewClientUser('avail');
  const sql = getTestSql();
  const slug = `avail-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  // 24/7 availability so slot math is entirely driven by bookings + buffers + duration.
  const availability = JSON.stringify([0, 1, 2, 3, 4, 5, 6].map(day => ({
    day, startTime: '00:00', endTime: '23:59', enabled: true,
  })));
  const [p] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.booking_pages (
      client_id, title, slug, duration, max_advance_days, min_notice_mins,
      timezone, availability, active, price, max_guests, checkin_enabled,
      enable_discount_codes, enable_add_ons, enable_gift_certificates,
      enable_waivers, require_waiver_before_booking, allow_staff_selection,
      buffer_before, buffer_after, conference_type, google_calendar_sync, color
    )
    VALUES (
      ${ctx.client.id}, 'Avail Page', ${slug},
      ${opts.duration ?? 30},
      ${opts.maxAdvanceDays ?? 60},
      ${opts.minNoticeMins ?? 60},
      'UTC', ${availability}::jsonb, true,
      0, ${opts.maxGuests ?? null}, false,
      false, false, false,
      false, false, false,
      ${opts.bufferBefore ?? 0}, ${opts.bufferAfter ?? 0}, 'none', false,
      '#2563eb'
    )
    RETURNING id
  `;
  return { pageId: p.id, slug, clientId: ctx.client.id };
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}
function daysFromNow(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

describe('Availability — empty cases @booking @availability', () => {
  it('empty array when requested date is past maxAdvanceDays', async () => {
    const { slug } = await seedPage({ maxAdvanceDays: 7 });
    const route = await import('@/app/api/public/booking/[slug]/slots/route');
    const res = await callHandler<{ success: boolean; data: unknown[] }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { slug }, query: { date: ymd(daysFromNow(60)) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data).toEqual([]);
  });

  it('empty array when an override blocks that date', async () => {
    const { pageId, slug } = await seedPage();
    const sql = getTestSql();
    const target = ymd(daysFromNow(3));
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.booking_date_overrides
        (booking_page_id, date, type, note)
      VALUES (${pageId}, ${target}, 'blocked', 'Holiday')
    `;
    const route = await import('@/app/api/public/booking/[slug]/slots/route');
    const res = await callHandler<{ success: boolean; data: unknown[] }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { slug }, query: { date: target } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data).toEqual([]);
  });

  it('available date override narrows the window', async () => {
    const { pageId, slug } = await seedPage({ duration: 60 });
    const sql = getTestSql();
    const target = ymd(daysFromNow(3));
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.booking_date_overrides
        (booking_page_id, date, type, start_time, end_time)
      VALUES (${pageId}, ${target}, 'available', '09:00', '11:00')
    `;
    const route = await import('@/app/api/public/booking/[slug]/slots/route');
    const res = await callHandler<{ success: boolean; data: { time: string }[] }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { slug }, query: { date: target } },
    );
    expect(res.status).toBe(200);
    // Two 60-minute slots fit in 09:00-11:00
    expect(res.data?.data.length).toBe(2);
    const startHours = res.data!.data.map(s => new Date(s.time).getUTCHours());
    expect(startHours).toEqual([9, 10]);
  });
});

describe('Availability — busy-time computation @booking @availability', () => {
  it('1:1 mode: booking a slot removes that exact slot from the next availability query', async () => {
    const { slug } = await seedPage({ duration: 30, minNoticeMins: 0 });
    const slotsRoute = await import('@/app/api/public/booking/[slug]/slots/route');
    const target = ymd(daysFromNow(3));

    const before = await callHandler<{ success: boolean; data: { time: string }[] }>(
      slotsRoute as unknown as Record<string, unknown>, 'GET',
      { params: { slug }, query: { date: target } },
    );
    expect(before.status).toBe(200);
    expect(before.data!.data.length).toBeGreaterThan(0);

    // Pick a slot ~5 hours in (well past min-notice, with no buffer skew)
    const candidate = before.data!.data.find(s => new Date(s.time).getUTCHours() === 12);
    expect(candidate).toBeTruthy();

    const bookRoute = await import('@/app/api/public/booking/[slug]/book/route');
    const booked = await callHandler(
      bookRoute as unknown as Record<string, unknown>, 'POST',
      { params: { slug }, body: { name: 'Booker', email: 'b@test.local', startTime: candidate!.time } },
    );
    expect(booked.status).toBe(200);

    const after = await callHandler<{ success: boolean; data: { time: string }[] }>(
      slotsRoute as unknown as Record<string, unknown>, 'GET',
      { params: { slug }, query: { date: target } },
    );
    expect(after.status).toBe(200);
    const afterTimes = new Set(after.data!.data.map(s => s.time));
    expect(afterTimes.has(candidate!.time)).toBe(false);
    // And length strictly decreased by 1 (no buffer).
    expect(after.data!.data.length).toBe(before.data!.data.length - 1);
  });

  it('capacity mode: slot remains while remaining capacity > 0; disappears when full', async () => {
    const { slug } = await seedPage({ duration: 30, minNoticeMins: 0, maxGuests: 2 });
    const slotsRoute = await import('@/app/api/public/booking/[slug]/slots/route');
    const target = ymd(daysFromNow(3));

    const before = await callHandler<{ success: boolean; data: { time: string; remainingCapacity: number | null }[] }>(
      slotsRoute as unknown as Record<string, unknown>, 'GET',
      { params: { slug }, query: { date: target } },
    );
    const candidate = before.data!.data.find(s => new Date(s.time).getUTCHours() === 12)!;
    expect(candidate.remainingCapacity).toBe(2);

    const bookRoute = await import('@/app/api/public/booking/[slug]/book/route');
    await callHandler(bookRoute as unknown as Record<string, unknown>, 'POST',
      { params: { slug }, body: { name: 'A', email: 'a@t.l', startTime: candidate.time, groupSize: 1 } });

    const mid = await callHandler<{ success: boolean; data: { time: string; remainingCapacity: number | null }[] }>(
      slotsRoute as unknown as Record<string, unknown>, 'GET',
      { params: { slug }, query: { date: target } },
    );
    const midSlot = mid.data!.data.find(s => s.time === candidate.time);
    expect(midSlot?.remainingCapacity).toBe(1);

    await callHandler(bookRoute as unknown as Record<string, unknown>, 'POST',
      { params: { slug }, body: { name: 'B', email: 'b@t.l', startTime: candidate.time, groupSize: 1 } });

    const after = await callHandler<{ success: boolean; data: { time: string }[] }>(
      slotsRoute as unknown as Record<string, unknown>, 'GET',
      { params: { slug }, query: { date: target } },
    );
    expect(after.data!.data.find(s => s.time === candidate.time)).toBeUndefined();
  });

  it('1:1 buffer: a 30-min booking with 30-min buffers removes the adjacent slots too', async () => {
    const { slug } = await seedPage({ duration: 30, minNoticeMins: 0, bufferBefore: 30, bufferAfter: 30 });
    const slotsRoute = await import('@/app/api/public/booking/[slug]/slots/route');
    const target = ymd(daysFromNow(3));

    const before = await callHandler<{ success: boolean; data: { time: string }[] }>(
      slotsRoute as unknown as Record<string, unknown>, 'GET',
      { params: { slug }, query: { date: target } },
    );
    const candidate = before.data!.data.find(s => new Date(s.time).getUTCHours() === 12)!;
    const adjacentBefore = before.data!.data.find(s => {
      const t = new Date(s.time);
      return t.getUTCHours() === 11 && t.getUTCMinutes() === 30;
    });
    const adjacentAfter = before.data!.data.find(s => {
      const t = new Date(s.time);
      return t.getUTCHours() === 12 && t.getUTCMinutes() === 30;
    });
    expect(adjacentBefore).toBeTruthy();
    expect(adjacentAfter).toBeTruthy();

    const bookRoute = await import('@/app/api/public/booking/[slug]/book/route');
    const r = await callHandler(bookRoute as unknown as Record<string, unknown>, 'POST',
      { params: { slug }, body: { name: 'B', email: 'b@t.l', startTime: candidate.time } });
    expect(r.status).toBe(200);

    const after = await callHandler<{ success: boolean; data: { time: string }[] }>(
      slotsRoute as unknown as Record<string, unknown>, 'GET',
      { params: { slug }, query: { date: target } },
    );
    const afterTimes = new Set(after.data!.data.map(s => s.time));
    expect(afterTimes.has(candidate.time)).toBe(false);
    expect(afterTimes.has(adjacentBefore!.time)).toBe(false);
    expect(afterTimes.has(adjacentAfter!.time)).toBe(false);
  });
});
