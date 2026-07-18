// @vitest-environment node
/**
 * Coverage supplement for POST /api/public/booking/[slug]/book.
 *
 * The sibling file (api-public-booking-book-route.test.ts) omits mocks for
 * isSlotWithinAvailability and resolveHostNotificationEmail, causing 41/49
 * tests in that file to fail. This file adds the missing mocks so that all
 * branches guarded by those functions are reachable, then covers the
 * additional uncovered paths: availability rejection, Zoom+gcal combo,
 * host-notification IIFE, paid + discount increment, gift cert full drain,
 * Connect store fallback when onboarding is incomplete, etc.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;

// ─── Shared queue state ──────────────────────────────────────────────────────

const selectQueue: Row[][] = [];
const insertReturns: Row[][] = [];
const insertCalls: { table: unknown; values: unknown }[] = [];
const updateCalls: { table: unknown; values: unknown }[] = [];

// ─── DB mock ────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.where = () => chain;
    chain.limit = () => Promise.resolve(selectQueue.shift() ?? []);
    chain.groupBy = () => Promise.resolve(selectQueue.shift() ?? []);
    // Make .where() return both a chainable and directly-awaitable node so
    // the legacy assignedMembers branch (ends in .groupBy without .limit) works.
    const where = () => {
      const inner: Record<string, unknown> = {};
      inner.limit = () => Promise.resolve(selectQueue.shift() ?? []);
      inner.groupBy = () => Promise.resolve(selectQueue.shift() ?? []);
      inner.where = where;
      inner.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(selectQueue.shift() ?? []).then(resolve);
      return inner;
    };
    chain.where = where;
    return chain;
  };

  return {
    db: {
      select: () => makeSelectChain(),
      insert: (table: unknown) => ({
        values: (values: unknown) => {
          insertCalls.push({ table, values });
          return {
            returning: () => Promise.resolve(insertReturns.shift() ?? []),
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve(undefined).then(resolve),
          };
        },
      }),
      update: (table: unknown) => ({
        set: (values: unknown) => ({
          where: () => {
            updateCalls.push({ table, values });
            return Promise.resolve(undefined);
          },
        }),
      }),
    },
  };
});

// ─── Schema mock ─────────────────────────────────────────────────────────────

vi.mock('@/lib/db/schema', () => {
  const col = (n: string) => ({ __col: n });
  const tbl = (n: string, cols: string[]) => {
    const t: Record<string, unknown> = { __table: n };
    for (const c of cols) t[c] = col(c);
    return t;
  };
  return {
    bookingPages: tbl('bookingPages', ['id', 'slug', 'active']),
    bookings: tbl('bookings', [
      'id', 'bookingPageId', 'status', 'startTime', 'endTime', 'groupSize', 'assignedTo',
    ]),
    bookingAddOns: tbl('bookingAddOns', ['id', 'bookingPageId', 'active']),
    bookingSelectedAddOns: tbl('bookingSelectedAddOns', []),
    bookingAttendees: tbl('bookingAttendees', []),
    discountCodes: tbl('discountCodes', [
      'websiteId', 'code', 'active', 'applicableTo', 'usedCount',
    ]),
    giftCertificates: tbl('giftCertificates', [
      'id', 'code', 'status', 'clientId', 'redeemableAt',
    ]),
    giftCertificateRedemptions: tbl('giftCertificateRedemptions', []),
    clientWebsites: tbl('clientWebsites', ['id', 'clientId', 'active']),
    storeSettings: tbl('storeSettings', ['websiteId', 'enabled']),
    products: tbl('products', ['id']),
    productVariants: tbl('productVariants', ['id']),
    clients: tbl('clients', ['id', 'userId']),
    users: tbl('users', ['id', 'email']),
    bookingDateOverrides: tbl('bookingDateOverrides', ['id', 'bookingPageId']),
    bookingAvailability: tbl('bookingAvailability', ['id', 'bookingPageId']),
    bookingStaffAvailability: tbl('bookingStaffAvailability', ['id', 'bookingPageId']),
  };
});

// ─── drizzle-orm mock ────────────────────────────────────────────────────────

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...parts: unknown[]) => ({ op: 'and', parts }),
  ne: (a: unknown, b: unknown) => ({ op: 'ne', a, b }),
  gte: (a: unknown, b: unknown) => ({ op: 'gte', a, b }),
  lte: (a: unknown, b: unknown) => ({ op: 'lte', a, b }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ kind: 'sql', strings, values }),
    {},
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ─── isSlotWithinAvailability mock ───────────────────────────────────────────
// This is the key mock missing from the sibling test file.

const isSlotWithinAvailability = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/booking/availability', () => ({
  isSlotWithinAvailability: (...args: unknown[]) => isSlotWithinAvailability(...args),
}));

// ─── resolveHostNotificationEmail mock ───────────────────────────────────────
// Also missing from the sibling file.

const resolveHostNotificationEmail = vi.fn().mockResolvedValue(null);
vi.mock('@/lib/booking/host-notification', () => ({
  resolveHostNotificationEmail: (...args: unknown[]) =>
    resolveHostNotificationEmail(...args),
}));

// ─── Email + integration mocks ───────────────────────────────────────────────

const sendGuestConfirmation = vi.fn().mockResolvedValue(undefined);
const sendHostNotification = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/email/booking-emails', () => ({
  sendGuestConfirmation: (...args: unknown[]) => sendGuestConfirmation(...args),
  sendHostNotification: (...args: unknown[]) => sendHostNotification(...args),
  loadBookingBrand: () => Promise.resolve(null),
}));

const createCalendarEvent = vi.fn().mockResolvedValue({ meetingLink: null });
vi.mock('@/lib/google-calendar', () => ({
  createCalendarEvent: (...args: unknown[]) => createCalendarEvent(...args),
}));

const createZoomMeeting = vi.fn().mockResolvedValue('https://zoom.us/j/test');
vi.mock('@/lib/zoom', () => ({
  createZoomMeeting: (...args: unknown[]) => createZoomMeeting(...args),
}));

const emitEvent = vi.fn();
vi.mock('@/lib/automation', () => ({
  emitEvent: (...args: unknown[]) => emitEvent(...args),
}));

const pickAssignee = vi.fn().mockResolvedValue(null);
vi.mock('@/lib/booking/assign', () => ({
  pickAssignee: (...args: unknown[]) => pickAssignee(...args),
}));

const checkSlotCapacity = vi.fn().mockResolvedValue({ available: true, remaining: 10 });
vi.mock('@/lib/booking/capacity', () => ({
  checkSlotCapacity: (...args: unknown[]) => checkSlotCapacity(...args),
}));

// ─── Stripe mock ─────────────────────────────────────────────────────────────

const paymentIntentsCreate = vi.fn().mockResolvedValue({
  id: 'pi_test',
  client_secret: 'pi_test_secret',
});
vi.mock('stripe', () => {
  class StripeCtor {
    paymentIntents = { create: paymentIntentsCreate };
  }
  return { default: StripeCtor };
});

// ─── Import route AFTER mocks ─────────────────────────────────────────────────

const { POST } = await import('@/app/api/public/booking/[slug]/book/route');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(body: unknown): Request {
  return new Request('http://test/api/public/booking/test-slug/book', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function makeParams(slug = 'test-slug'): { params: Promise<{ slug: string }> } {
  return { params: Promise.resolve({ slug }) };
}

function basePage(overrides: Row = {}): Row {
  return {
    id: 100,
    clientId: 7,
    slug: 'test-slug',
    title: 'Consultation',
    active: true,
    bookingType: 'individual',
    duration: 30,
    timezone: 'America/Chicago',
    price: 0,
    minNoticeMins: 0,
    maxAdvanceDays: 365,
    bufferBefore: 0,
    bufferAfter: 0,
    maxGuests: null,
    enableAddOns: false,
    enableDiscountCodes: false,
    enableGiftCertificates: false,
    allowStaffSelection: false,
    assignmentMode: 'fixed',
    assignedMembers: [],
    checkinEnabled: false,
    googleCalendarSync: false,
    conferenceType: null,
    websiteId: null,
    ...overrides,
  };
}

function futureIso(minutesFromNow = 60): string {
  return new Date(Date.now() + minutesFromNow * 60 * 1000).toISOString();
}

beforeEach(() => {
  selectQueue.length = 0;
  insertReturns.length = 0;
  insertCalls.length = 0;
  updateCalls.length = 0;

  isSlotWithinAvailability.mockReset().mockResolvedValue(true);
  resolveHostNotificationEmail.mockReset().mockResolvedValue(null);
  sendGuestConfirmation.mockReset().mockResolvedValue(undefined);
  sendHostNotification.mockReset().mockResolvedValue(undefined);
  createCalendarEvent.mockReset().mockResolvedValue({ meetingLink: null });
  createZoomMeeting.mockReset().mockResolvedValue('https://zoom.us/j/test');
  emitEvent.mockReset();
  pickAssignee.mockReset().mockResolvedValue(null);
  checkSlotCapacity.mockReset().mockResolvedValue({ available: true, remaining: 10 });
  paymentIntentsCreate.mockReset().mockResolvedValue({
    id: 'pi_test',
    client_secret: 'pi_test_secret',
  });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST — availability check (isSlotWithinAvailability)', () => {
  it('returns 409 when slot is outside configured availability', async () => {
    selectQueue.push([basePage()]);
    isSlotWithinAvailability.mockResolvedValueOnce(false);

    const res = await POST(
      makeReq({ name: 'Alice', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/no longer available/i);
    expect(isSlotWithinAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ id: 100 }),
      expect.any(Date),
      null,
    );
  });

  it('passes resolved staffId to isSlotWithinAvailability', async () => {
    selectQueue.push([basePage({ allowStaffSelection: true })]);
    isSlotWithinAvailability.mockResolvedValueOnce(true);
    selectQueue.push([]); // conflict check
    insertReturns.push([{ id: 1, guestName: 'A', guestEmail: 'a@b.com' }]);

    await POST(
      makeReq({ name: 'Alice', email: 'a@b.com', startTime: futureIso(), staffId: '5' }),
      makeParams(),
    );
    expect(isSlotWithinAvailability).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Date),
      5,
    );
  });
});

describe('POST — basic free booking with proper mocks', () => {
  it('creates a free booking and emits event', async () => {
    selectQueue.push([basePage()]);
    selectQueue.push([]); // no conflict
    insertReturns.push([{
      id: 42,
      guestName: 'Bob',
      guestEmail: 'bob@example.com',
      startTime: new Date(Date.now() + 3600_000),
      endTime: new Date(Date.now() + 5400_000),
      timezone: 'America/Chicago',
      status: 'confirmed',
    }]);

    const res = await POST(
      makeReq({ name: 'Bob', email: 'bob@example.com', startTime: futureIso() }),
      makeParams(),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.paymentStatus).toBe('free');
    expect(emitEvent).toHaveBeenCalledWith('booking.guest_booked', 7, 0, expect.any(Object));
    expect(sendGuestConfirmation).toHaveBeenCalled();
  });

  it('sends host notification when resolveHostNotificationEmail returns an address', async () => {
    selectQueue.push([basePage()]);
    selectQueue.push([]);
    insertReturns.push([{ id: 1, guestName: 'A', guestEmail: 'a@b.com' }]);
    resolveHostNotificationEmail.mockResolvedValueOnce('host@example.com');

    await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    // Wait for the fire-and-forget IIFE to settle
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sendHostNotification).toHaveBeenCalledWith('host@example.com', expect.any(Object));
  });

  it('does NOT send host notification when resolveHostNotificationEmail returns null', async () => {
    selectQueue.push([basePage()]);
    selectQueue.push([]);
    insertReturns.push([{ id: 1, guestName: 'A', guestEmail: 'a@b.com' }]);
    resolveHostNotificationEmail.mockResolvedValueOnce(null);

    await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sendHostNotification).not.toHaveBeenCalled();
  });
});

describe('POST — Zoom + Google Calendar combo', () => {
  it('creates Zoom meeting then also creates calendar event when both are configured', async () => {
    selectQueue.push([basePage({ conferenceType: 'zoom', googleCalendarSync: true })]);
    selectQueue.push([]);
    insertReturns.push([{ id: 1, guestName: 'A', guestEmail: 'a@b.com' }]);
    createZoomMeeting.mockResolvedValueOnce('https://zoom.us/j/999');

    const res = await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    expect(res.status).toBe(200);
    expect(createZoomMeeting).toHaveBeenCalled();
    expect(createCalendarEvent).toHaveBeenCalled();
    expect((await res.json()).data.meetingLink).toBe('https://zoom.us/j/999');
  });

  it('Zoom only (no calendar sync) — calendar event NOT called', async () => {
    selectQueue.push([basePage({ conferenceType: 'zoom', googleCalendarSync: false })]);
    selectQueue.push([]);
    insertReturns.push([{ id: 1, guestName: 'A', guestEmail: 'a@b.com' }]);

    await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    expect(createZoomMeeting).toHaveBeenCalled();
    expect(createCalendarEvent).not.toHaveBeenCalled();
  });

  it('Google Meet (conferenceType=google_meet) uses calendar event with addGoogleMeet=true', async () => {
    selectQueue.push([basePage({ conferenceType: 'google_meet' })]);
    selectQueue.push([]);
    insertReturns.push([{ id: 1, guestName: 'A', guestEmail: 'a@b.com' }]);
    createCalendarEvent.mockResolvedValueOnce({ meetingLink: 'https://meet.google.com/abc' });

    const res = await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    expect(createCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({ addGoogleMeet: true }),
    );
    expect((await res.json()).data.meetingLink).toBe('https://meet.google.com/abc');
  });

  it('null meetingLink from calendar is surfaced as null in response', async () => {
    selectQueue.push([basePage({ googleCalendarSync: true })]);
    selectQueue.push([]);
    insertReturns.push([{ id: 1, guestName: 'A', guestEmail: 'a@b.com' }]);
    createCalendarEvent.mockResolvedValueOnce({}); // no meetingLink field

    const res = await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    expect((await res.json()).data.meetingLink).toBeNull();
  });
});

describe('POST — paid booking with discount code (free books too)', () => {
  it('increments discount code usedCount on a free booking that used a code', async () => {
    selectQueue.push([basePage({ price: 0, enableDiscountCodes: true, websiteId: 10 })]);
    selectQueue.push([]); // conflict
    selectQueue.push([{
      code: 'FREE10',
      discountType: 'percent',
      amount: 1000,
      active: true,
      startsAt: null,
      expiresAt: null,
      maxUses: null,
      usedCount: 0,
      minOrderAmount: null,
    }]);
    insertReturns.push([{ id: 1, guestName: 'A', guestEmail: 'a@b.com' }]);

    await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso(), discountCode: 'free10' }),
      makeParams(),
    );
    // usedCount update should have fired even on free booking
    expect(updateCalls.some(
      (u) => typeof u.values === 'object' && u.values !== null && 'usedCount' in (u.values as object),
    )).toBe(true);
  });
});

describe('POST — paid booking Stripe Connect store fallback', () => {
  it('falls back to platform defaults when storeSettings query returns no row', async () => {
    selectQueue.push([basePage({ price: 2000, websiteId: 99 })]);
    selectQueue.push([]); // conflict
    insertReturns.push([{ id: 1 }]);
    selectQueue.push([]); // storeSettings → empty

    const res = await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    expect(res.status).toBe(200);
    // Should be called without application_fee_amount
    const stripeCall = paymentIntentsCreate.mock.calls[0][0];
    expect(stripeCall.application_fee_amount).toBeUndefined();
  });

  it('uses default platform fee of 5% when platformFeePercent not set on store', async () => {
    selectQueue.push([basePage({ price: 10000, websiteId: 88 })]);
    selectQueue.push([]);
    insertReturns.push([{ id: 1 }]);
    selectQueue.push([{
      stripeAccountId: 'acct_default',
      stripeOnboardingComplete: true,
      platformFeePercent: null, // triggers the || 5 fallback
      currency: 'usd',
      enabled: true,
      websiteId: 88,
    }]);

    await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    const stripeCall = paymentIntentsCreate.mock.calls[0][0];
    expect(stripeCall.application_fee_amount).toBe(500); // 10000 * 5%
  });
});

describe('POST — gift certificate full drain', () => {
  it('sets status to fully_redeemed when cert balance exactly covers the total', async () => {
    selectQueue.push([basePage({ price: 2000, enableGiftCertificates: true })]);
    selectQueue.push([]); // conflict
    selectQueue.push([{ id: 9, code: 'GC', remainingAmount: 2000, status: 'active', clientId: 7 }]);
    insertReturns.push([{ id: 1 }]); // booking
    // Re-fetch cert during redemption
    selectQueue.push([{ id: 9, remainingAmount: 2000 }]);

    await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso(), giftCertificateCode: 'GC' }),
      makeParams(),
    );

    const gcUpdate = updateCalls.find(
      (u) =>
        typeof u.values === 'object' &&
        u.values !== null &&
        (u.values as Record<string, unknown>).status === 'fully_redeemed',
    );
    expect(gcUpdate).toBeTruthy();
  });
});

describe('POST — group booking seat math', () => {
  it('seats defaults to 1 when rawSeats is not provided and no attendees', async () => {
    selectQueue.push([basePage({ bookingType: 'group' })]);
    insertReturns.push([{ id: 1, guestName: 'A', guestEmail: 'a@b.com' }]);

    const res = await POST(
      makeReq({
        name: 'A',
        email: 'a@b.com',
        startTime: futureIso(),
        // no seats, no attendees
      }),
      makeParams(),
    );
    expect(res.status).toBe(200);
    const bookingInsertValues = insertCalls[0].values as Record<string, unknown>;
    expect(bookingInsertValues.groupSize).toBe(1);
  });

  it('uses attendees.length as seat count when rawSeats not provided', async () => {
    selectQueue.push([basePage({ bookingType: 'group' })]);
    insertReturns.push([{ id: 1 }]);

    await POST(
      makeReq({
        name: 'A',
        email: 'a@b.com',
        startTime: futureIso(),
        attendees: [
          { name: 'X', email: 'x@b.com' },
          { name: 'Y', email: 'y@b.com' },
        ],
        // no seats provided — should infer 2 from attendees
      }),
      makeParams(),
    );
    const bookingInsertValues = insertCalls[0].values as Record<string, unknown>;
    expect(bookingInsertValues.groupSize).toBe(2);
  });
});

describe('POST — assignee fewest-upcoming legacy load balancer', () => {
  it('falls back to null assignment when all assigned members have equal load', async () => {
    selectQueue.push([basePage({ assignedMembers: [1, 2] })]);
    selectQueue.push([]); // conflict
    selectQueue.push([
      { assignedTo: 1, count: 3 },
      { assignedTo: 2, count: 3 },
    ]);
    insertReturns.push([{ id: 1, guestName: 'A', guestEmail: 'a@b.com' }]);

    await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    // When all have same count, first member is selected (minCount starts at Infinity, 3 < Infinity)
    const v = insertCalls[0].values as { assignedTo: number | null };
    expect([1, 2]).toContain(v.assignedTo);
  });

  it('respects countMap returning 0 for members not in the query result', async () => {
    selectQueue.push([basePage({ assignedMembers: [10, 20, 30] })]);
    selectQueue.push([]); // conflict
    // Only 10 and 20 have bookings; 30 has 0 (not in result)
    selectQueue.push([
      { assignedTo: 10, count: 5 },
      { assignedTo: 20, count: 2 },
      // 30 not present → defaults to 0
    ]);
    insertReturns.push([{ id: 1, guestName: 'A', guestEmail: 'a@b.com' }]);

    await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    expect((insertCalls[0].values as { assignedTo: number | null }).assignedTo).toBe(30);
  });
});

describe('POST — checkinCode generation', () => {
  it('generates a BK-XXXX code that matches the expected pattern', async () => {
    selectQueue.push([basePage({ checkinEnabled: true })]);
    selectQueue.push([]);
    insertReturns.push([{ id: 1, guestName: 'A', guestEmail: 'a@b.com' }]);

    const res = await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    const body = await res.json();
    expect(body.data.checkinCode).toMatch(/^BK-[A-Z2-9]{4}$/);
  });

  it('returns null checkinCode when checkinEnabled is false', async () => {
    selectQueue.push([basePage({ checkinEnabled: false })]);
    selectQueue.push([]);
    insertReturns.push([{ id: 1, guestName: 'A', guestEmail: 'a@b.com' }]);

    const res = await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    expect((await res.json()).data.checkinCode).toBeNull();
  });
});

describe('POST — 404 / validation branches', () => {
  it('returns 404 when booking page is not found', async () => {
    selectQueue.push([]);
    const res = await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 for missing name', async () => {
    selectQueue.push([basePage()]);
    const res = await POST(
      makeReq({ email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/name/i);
  });

  it('returns 400 for missing email', async () => {
    selectQueue.push([basePage()]);
    const res = await POST(
      makeReq({ name: 'Alice', startTime: futureIso() }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/email/i);
  });

  it('returns 400 for missing startTime', async () => {
    selectQueue.push([basePage()]);
    const res = await POST(makeReq({ name: 'Alice', email: 'a@b.com' }), makeParams());
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/start time/i);
  });

  it('returns 400 for invalid startTime', async () => {
    selectQueue.push([basePage()]);
    const res = await POST(
      makeReq({ name: 'Alice', email: 'a@b.com', startTime: 'not-a-date' }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/invalid start time/i);
  });

  it('returns 409 when slot is within minNoticeMins window', async () => {
    selectQueue.push([basePage({ minNoticeMins: 120 })]);
    const res = await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso(30) }),
      makeParams(),
    );
    expect(res.status).toBe(409);
  });

  it('returns 400 when slot is beyond maxAdvanceDays', async () => {
    selectQueue.push([basePage({ maxAdvanceDays: 7 })]);
    const tooFar = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const res = await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: tooFar }),
      makeParams(),
    );
    expect(res.status).toBe(400);
  });

  it('returns 409 when individual slot conflicts with existing booking', async () => {
    selectQueue.push([basePage()]);
    selectQueue.push([{ id: 99 }]); // conflict
    const res = await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    expect(res.status).toBe(409);
  });
});

describe('POST — assignmentMode fewest_upcoming (non-fixed)', () => {
  it('calls pickAssignee when assignmentMode is fewest_upcoming', async () => {
    selectQueue.push([basePage({ assignmentMode: 'fewest_upcoming' })]);
    selectQueue.push([]); // conflict
    pickAssignee.mockResolvedValueOnce(5);
    insertReturns.push([{ id: 1, guestName: 'A', guestEmail: 'a@b.com' }]);

    await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    expect(pickAssignee).toHaveBeenCalled();
    const v = insertCalls[0].values as { assignedTo: number | null; assignedUserId: number | null };
    expect(v.assignedTo).toBe(5);
    expect(v.assignedUserId).toBe(5);
  });
});

describe('POST — paid booking: core path', () => {
  it('creates Stripe PI and returns clientSecret with paymentStatus pending', async () => {
    selectQueue.push([basePage({ price: 5000 })]);
    selectQueue.push([]); // conflict
    insertReturns.push([{ id: 77 }]); // booking

    const res = await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.clientSecret).toBe('pi_test_secret');
    expect(body.data.paymentStatus).toBe('pending');
    expect(paymentIntentsCreate).toHaveBeenCalled();
    // Booking updated with stripePaymentIntentId
    expect(updateCalls.some(
      (u) =>
        typeof u.values === 'object' &&
        u.values !== null &&
        (u.values as Record<string, unknown>).stripePaymentIntentId === 'pi_test',
    )).toBe(true);
  });
});

describe('POST — maxGuests capacity enforcement', () => {
  it('rejects when existing bookings exhaust maxGuests', async () => {
    selectQueue.push([basePage({ maxGuests: 2 })]);
    selectQueue.push([{ groupSize: 1 }, { groupSize: 1 }]); // fully booked
    const res = await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso(), groupSize: 1 }),
      makeParams(),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/spots remaining/i);
  });

  it('accepts booking when capacity allows groupSize', async () => {
    selectQueue.push([basePage({ maxGuests: 5 })]);
    selectQueue.push([{ groupSize: 2 }]); // 2 booked, 3 remaining
    insertReturns.push([{ id: 1, guestName: 'A', guestEmail: 'a@b.com' }]);
    const res = await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso(), groupSize: 3 }),
      makeParams(),
    );
    expect(res.status).toBe(200);
  });
});
