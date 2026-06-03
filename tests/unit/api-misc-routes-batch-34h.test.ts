// @vitest-environment node
/**
 * Batch 34h — unit tests for 4 public route.ts files.
 *
 * Routes covered:
 *  - app/api/public/booking/cancel/route.ts                       (POST, GET)
 *  - app/api/public/booking/quote/[slug]/pay/route.ts             (POST)
 *  - app/api/public/booking/quote/[slug]/route.ts                 (GET)
 *  - app/api/public/chat/messages/route.ts                        (POST)
 *
 * Strategy: heavy mocking — db.select() returns a per-call result via a
 * shared queue; db.insert/update return thenables that capture writes.
 * External integrations (Stripe, Resend, Google Calendar, Zoom, chat token,
 * realtime publish, rate-limiter, booking emails) are all mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — declared before any route is imported.
// ---------------------------------------------------------------------------

// drizzle-orm operators — inert objects
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  ne: (a: unknown, b: unknown) => ({ op: 'ne', a, b }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// schema — proxy tables, every property access returns a { __col, __table }.
vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          if (prop === '$inferSelect') return undefined;
          if (prop === 'then') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    bookings: wrap('bookings'),
    bookingPages: wrap('bookingPages'),
    bookingQuotes: wrap('bookingQuotes'),
    clients: wrap('clients'),
    users: wrap('users'),
    clientWebsites: wrap('clientWebsites'),
    storeSettings: wrap('storeSettings'),
    chatConversations: wrap('chatConversations'),
    chatMessages: wrap('chatMessages'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// Booking emails
const sendCancellationEmailMock = vi.fn();
vi.mock('@/lib/email/booking-emails', () => ({
  sendCancellationEmail: (...args: unknown[]) => sendCancellationEmailMock(...args),
  loadBookingBrand: (..._args: unknown[]) => Promise.resolve(null),
}));

// Google Calendar
const deleteCalendarEventMock = vi.fn();
vi.mock('@/lib/google-calendar', () => ({
  deleteCalendarEvent: (...args: unknown[]) => deleteCalendarEventMock(...args),
}));

// Zoom
const deleteZoomMeetingMock = vi.fn();
vi.mock('@/lib/zoom', () => ({
  deleteZoomMeeting: (...args: unknown[]) => deleteZoomMeetingMock(...args),
}));

// Email index — dynamically imported by cancel route
const resendSendMock = vi.fn();
vi.mock('@/lib/email/index', () => ({
  resend: { emails: { send: (...args: unknown[]) => resendSendMock(...args) } },
}));

// Stripe — the pay route does `(await import('stripe')).default`.
const stripePaymentIntentsCreateMock = vi.fn();
class StripeMock {
  paymentIntents = { create: (...args: unknown[]) => stripePaymentIntentsCreateMock(...args) };
  constructor(public _key: string) {}
}
vi.mock('stripe', () => ({
  default: StripeMock,
}));

// Chat token verification
const verifyVisitorTokenMock = vi.fn();
vi.mock('@/lib/chat/token', () => ({
  verifyVisitorToken: (...args: unknown[]) => verifyVisitorTokenMock(...args),
}));

// Chat realtime
const publishMessageMock = vi.fn();
vi.mock('@/lib/chat/realtime', () => ({
  publishMessage: (...args: unknown[]) => publishMessageMock(...args),
}));

// Chat rate-limit
const checkVisitorRateLimitMock = vi.fn();
vi.mock('@/lib/chat/rate-limit', () => ({
  checkVisitorRateLimit: (...args: unknown[]) => checkVisitorRateLimitMock(...args),
}));

// ---------------------------------------------------------------------------
// db mock: select-queue + insert/update capture
// ---------------------------------------------------------------------------

interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
}
interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
const insertCalls: InsertCall[] = [];
const updateCalls: UpdateCall[] = [];

function shiftNext(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;

    const materialize = () => {
      if (!materializedPromise) materializedPromise = Promise.resolve(shiftNext());
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of [
      'from',
      'leftJoin',
      'innerJoin',
      'where',
      'orderBy',
      'groupBy',
      'limit',
      'offset',
    ]) {
      chain[m] = passthrough;
    }
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
      return materialize().then(onF, onR);
    };
    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        insertCalls.push({ table: table.__table, values: v });
        const rows = insertReturnQueue.shift() ?? [];
        return {
          returning() {
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
          then(onF: (val: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(undefined).then(onF, onR);
          },
        };
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            updateCalls.push({ table: table.__table, patch, filter });
            return {
              returning() {
                return Promise.resolve([]);
              },
              then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                return Promise.resolve(undefined).then(onF, onR);
              },
            };
          },
        };
      },
    };
  }

  return {
    db: {
      select() {
        return buildSelect();
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Routes under test (imported AFTER all mocks)
// ---------------------------------------------------------------------------

const cancelRoute = await import('@/app/api/public/booking/cancel/route');
const quotePayRoute = await import('@/app/api/public/booking/quote/[slug]/pay/route');
const quoteRoute = await import('@/app/api/public/booking/quote/[slug]/route');
const chatMessagesRoute = await import('@/app/api/public/chat/messages/route');

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeJsonReq(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeRawReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  sendCancellationEmailMock.mockReset();
  deleteCalendarEventMock.mockReset();
  deleteZoomMeetingMock.mockReset();
  resendSendMock.mockReset();
  stripePaymentIntentsCreateMock.mockReset();
  verifyVisitorTokenMock.mockReset();
  publishMessageMock.mockReset();
  checkVisitorRateLimitMock.mockReset();

  // Default success behaviors
  sendCancellationEmailMock.mockResolvedValue(undefined);
  deleteCalendarEventMock.mockResolvedValue(undefined);
  deleteZoomMeetingMock.mockResolvedValue(undefined);
  resendSendMock.mockResolvedValue({ id: 'em_1' });
});

// ===========================================================================
// POST /api/public/booking/cancel
// ===========================================================================

describe('POST /api/public/booking/cancel', () => {
  it('returns 400 when token is missing', async () => {
    const res = await cancelRoute.POST(makeJsonReq('http://x/cancel', 'POST', {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Cancel token is required');
  });

  it('returns 404 when booking not found', async () => {
    selectQueue.push([]); // booking lookup empty
    const res = await cancelRoute.POST(
      makeJsonReq('http://x/cancel', 'POST', { token: 'abc' }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Booking not found');
  });

  it('returns 409 when booking already cancelled', async () => {
    selectQueue.push([
      {
        id: 1,
        status: 'cancelled',
        startTime: new Date(Date.now() + 60_000),
        cancelToken: 'abc',
      },
    ]);
    const res = await cancelRoute.POST(
      makeJsonReq('http://x/cancel', 'POST', { token: 'abc' }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/already been cancelled/);
  });

  it('returns 400 when booking is in the past', async () => {
    selectQueue.push([
      {
        id: 1,
        status: 'confirmed',
        startTime: new Date(Date.now() - 60_000), // past
        cancelToken: 'abc',
      },
    ]);
    const res = await cancelRoute.POST(
      makeJsonReq('http://x/cancel', 'POST', { token: 'abc' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Cannot cancel a past booking');
  });

  it('cancels future booking with page and host: sends emails, deletes calendar + zoom', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    selectQueue.push([
      {
        id: 1,
        bookingPageId: 10,
        clientId: 5,
        status: 'confirmed',
        startTime: future,
        timezone: 'America/New_York',
        guestEmail: 'g@example.com',
        guestName: 'Guest Name',
        googleEventId: 'evt_1',
        meetingLink: 'https://zoom.us/j/123',
        cancelToken: 'tok',
      },
    ]); // booking
    selectQueue.push([{ id: 10, title: 'Demo Call', slug: 'demo' }]); // page
    selectQueue.push([{ userId: 99 }]); // client
    selectQueue.push([{ email: 'host@example.com' }]); // host

    const res = await cancelRoute.POST(
      makeJsonReq('http://x/cancel', 'POST', { token: 'tok' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('Booking cancelled successfully');

    // Update set status=cancelled
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('bookings');
    expect(updateCalls[0].patch.status).toBe('cancelled');
    expect(updateCalls[0].patch.cancelledAt).toBeInstanceOf(Date);

    // Async side effects — give microtasks a tick to flush
    await new Promise((r) => setTimeout(r, 0));

    expect(deleteCalendarEventMock).toHaveBeenCalledWith(5, 'evt_1');
    expect(deleteZoomMeetingMock).toHaveBeenCalledWith(5, 'https://zoom.us/j/123');
    expect(sendCancellationEmailMock).toHaveBeenCalledWith(
      'g@example.com',
      'Guest Name',
      'Demo Call',
      future,
      'America/New_York',
      'demo',
      null, // brand — loadBookingBrand mock returns null
    );
    expect(resendSendMock).toHaveBeenCalledTimes(1);
    const sendArgs = resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect(sendArgs.to).toBe('host@example.com');
    expect(String(sendArgs.subject)).toMatch(/Booking Cancelled.*Guest Name.*Demo Call/);
  });

  it('skips calendar delete when no googleEventId', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    selectQueue.push([
      {
        id: 1,
        bookingPageId: 10,
        clientId: 5,
        status: 'confirmed',
        startTime: future,
        timezone: 'UTC',
        guestEmail: 'g@example.com',
        guestName: 'G',
        googleEventId: null,
        meetingLink: null,
        cancelToken: 'tok',
      },
    ]);
    selectQueue.push([]); // no page
    const res = await cancelRoute.POST(
      makeJsonReq('http://x/cancel', 'POST', { token: 'tok' }),
    );
    expect(res.status).toBe(200);
    expect(deleteCalendarEventMock).not.toHaveBeenCalled();
    expect(deleteZoomMeetingMock).not.toHaveBeenCalled();
    expect(sendCancellationEmailMock).not.toHaveBeenCalled();
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it('skips zoom delete when meetingLink is non-zoom', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    selectQueue.push([
      {
        id: 1,
        bookingPageId: 10,
        clientId: 5,
        status: 'confirmed',
        startTime: future,
        timezone: 'UTC',
        guestEmail: 'g@example.com',
        guestName: 'G',
        googleEventId: null,
        meetingLink: 'https://meet.google.com/abc-defg-hij',
        cancelToken: 'tok',
      },
    ]);
    selectQueue.push([{ id: 10, title: 'T', slug: 's' }]);
    selectQueue.push([]); // client lookup empty -> no host email
    const res = await cancelRoute.POST(
      makeJsonReq('http://x/cancel', 'POST', { token: 'tok' }),
    );
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 0));
    expect(deleteZoomMeetingMock).not.toHaveBeenCalled();
    // Guest email still sent
    expect(sendCancellationEmailMock).toHaveBeenCalled();
    // No host notify
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it('handles missing host: skips host notification', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    selectQueue.push([
      {
        id: 1,
        bookingPageId: 10,
        clientId: 5,
        status: 'confirmed',
        startTime: future,
        timezone: 'UTC',
        guestEmail: 'g@example.com',
        guestName: 'G',
        googleEventId: null,
        meetingLink: null,
        cancelToken: 'tok',
      },
    ]);
    selectQueue.push([{ id: 10, title: 'T', slug: 's' }]);
    selectQueue.push([{ userId: 99 }]);
    selectQueue.push([]); // host lookup empty
    const res = await cancelRoute.POST(
      makeJsonReq('http://x/cancel', 'POST', { token: 'tok' }),
    );
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 0));
    expect(sendCancellationEmailMock).toHaveBeenCalled();
    expect(resendSendMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// GET /api/public/booking/cancel
// ===========================================================================

describe('GET /api/public/booking/cancel', () => {
  it('returns 400 when token query param is missing', async () => {
    const res = await cancelRoute.GET(makeRawReq('http://x/cancel'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Token is required');
  });

  it('returns 404 when booking not found', async () => {
    selectQueue.push([]);
    const res = await cancelRoute.GET(makeRawReq('http://x/cancel?token=abc'));
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Booking not found');
  });

  it('returns booking + page details when found', async () => {
    const start = new Date('2030-01-01T12:00:00Z');
    const end = new Date('2030-01-01T13:00:00Z');
    const row = {
      id: 1,
      guestName: 'Guest',
      startTime: start,
      endTime: end,
      timezone: 'UTC',
      status: 'confirmed',
      pageTitle: 'Demo',
    };
    selectQueue.push([row]);
    const res = await cancelRoute.GET(makeRawReq('http://x/cancel?token=abc'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(body.data.guestName).toBe('Guest');
    expect(body.data.pageTitle).toBe('Demo');
  });
});

// ===========================================================================
// POST /api/public/booking/quote/[slug]/pay
// ===========================================================================

describe('POST /api/public/booking/quote/[slug]/pay', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  });

  it('returns 404 when quote not found or already paid', async () => {
    selectQueue.push([]); // quote lookup empty
    const res = await quotePayRoute.POST(
      makeRawReq('http://x/pay', { method: 'POST' }),
      { params: Promise.resolve({ slug: 'q1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/not found or already paid/);
  });

  it('returns 410 when quote has expired', async () => {
    selectQueue.push([
      {
        id: 1,
        slug: 'q1',
        clientId: 5,
        price: 1000,
        status: 'pending',
        expiresAt: new Date(Date.now() - 60_000),
      },
    ]);
    const res = await quotePayRoute.POST(
      makeRawReq('http://x/pay', { method: 'POST' }),
      { params: Promise.resolve({ slug: 'q1' }) },
    );
    expect(res.status).toBe(410);
    expect((await res.json()).message).toMatch(/expired/);
  });

  it('creates plain Stripe PI when no Stripe Connect website / store', async () => {
    selectQueue.push([
      {
        id: 1,
        slug: 'q1',
        clientId: 5,
        price: 2500,
        status: 'pending',
        expiresAt: null,
      },
    ]); // quote
    selectQueue.push([]); // no website
    stripePaymentIntentsCreateMock.mockResolvedValue({
      id: 'pi_123',
      client_secret: 'pi_123_secret',
    });

    const res = await quotePayRoute.POST(
      makeRawReq('http://x/pay', { method: 'POST' }),
      { params: Promise.resolve({ slug: 'q1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.clientSecret).toBe('pi_123_secret');
    expect(body.data.amount).toBe(2500);

    expect(stripePaymentIntentsCreateMock).toHaveBeenCalledTimes(1);
    const piArgs = stripePaymentIntentsCreateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(piArgs.amount).toBe(2500);
    expect(piArgs.currency).toBe('usd');
    expect(piArgs).not.toHaveProperty('application_fee_amount');
    expect(piArgs).not.toHaveProperty('transfer_data');
    const meta = piArgs.metadata as Record<string, unknown>;
    expect(meta.type).toBe('booking_quote');
    expect(meta.quoteId).toBe('1');
    expect(meta.clientId).toBe('5');

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('bookingQuotes');
    expect(updateCalls[0].patch.stripePaymentIntentId).toBe('pi_123');
  });

  it('uses Stripe Connect when store is enabled + onboarding complete', async () => {
    selectQueue.push([
      {
        id: 1,
        slug: 'q1',
        clientId: 5,
        price: 10_000,
        status: 'pending',
        expiresAt: null,
      },
    ]); // quote
    selectQueue.push([{ id: 77 }]); // website
    selectQueue.push([
      {
        websiteId: 77,
        stripeAccountId: 'acct_xyz',
        stripeOnboardingComplete: true,
        platformFeePercent: '10',
        currency: 'EUR',
        enabled: true,
      },
    ]); // store
    stripePaymentIntentsCreateMock.mockResolvedValue({
      id: 'pi_456',
      client_secret: 'pi_456_secret',
    });

    const res = await quotePayRoute.POST(
      makeRawReq('http://x/pay', { method: 'POST' }),
      { params: Promise.resolve({ slug: 'q1' }) },
    );
    expect(res.status).toBe(200);

    const piArgs = stripePaymentIntentsCreateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(piArgs.amount).toBe(10_000);
    expect(piArgs.currency).toBe('eur');
    expect(piArgs.application_fee_amount).toBe(1000); // 10% of 10000
    expect(piArgs.transfer_data).toEqual({ destination: 'acct_xyz' });
  });

  it('defaults to 5% platform fee + usd when store omits fee + currency', async () => {
    selectQueue.push([
      {
        id: 1,
        slug: 'q1',
        clientId: 5,
        price: 10_000,
        status: 'pending',
        expiresAt: null,
      },
    ]);
    selectQueue.push([{ id: 77 }]);
    selectQueue.push([
      {
        websiteId: 77,
        stripeAccountId: 'acct_xyz',
        stripeOnboardingComplete: true,
        platformFeePercent: null,
        currency: null,
        enabled: true,
      },
    ]);
    stripePaymentIntentsCreateMock.mockResolvedValue({
      id: 'pi_789',
      client_secret: 'pi_789_secret',
    });

    const res = await quotePayRoute.POST(
      makeRawReq('http://x/pay', { method: 'POST' }),
      { params: Promise.resolve({ slug: 'q1' }) },
    );
    expect(res.status).toBe(200);

    const piArgs = stripePaymentIntentsCreateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(piArgs.application_fee_amount).toBe(500); // 5% default
    expect(piArgs.currency).toBe('usd');
  });

  it('does NOT use Stripe Connect when onboarding incomplete', async () => {
    selectQueue.push([
      {
        id: 1,
        slug: 'q1',
        clientId: 5,
        price: 5000,
        status: 'pending',
        expiresAt: null,
      },
    ]);
    selectQueue.push([{ id: 77 }]);
    selectQueue.push([
      {
        websiteId: 77,
        stripeAccountId: 'acct_xyz',
        stripeOnboardingComplete: false,
        platformFeePercent: '10',
        currency: 'EUR',
        enabled: true,
      },
    ]);
    stripePaymentIntentsCreateMock.mockResolvedValue({
      id: 'pi_x',
      client_secret: 'pi_x_secret',
    });

    const res = await quotePayRoute.POST(
      makeRawReq('http://x/pay', { method: 'POST' }),
      { params: Promise.resolve({ slug: 'q1' }) },
    );
    expect(res.status).toBe(200);
    const piArgs = stripePaymentIntentsCreateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(piArgs).not.toHaveProperty('application_fee_amount');
    expect(piArgs).not.toHaveProperty('transfer_data');
    expect(piArgs.currency).toBe('usd');
  });

  it('returns 500 when Stripe throws', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    selectQueue.push([
      {
        id: 1,
        slug: 'q1',
        clientId: 5,
        price: 1000,
        status: 'pending',
        expiresAt: null,
      },
    ]);
    selectQueue.push([]); // no website
    stripePaymentIntentsCreateMock.mockRejectedValue(new Error('stripe boom'));

    const res = await quotePayRoute.POST(
      makeRawReq('http://x/pay', { method: 'POST' }),
      { params: Promise.resolve({ slug: 'q1' }) },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('Internal server error');
    expect(updateCalls).toHaveLength(0);
    errSpy.mockRestore();
  });
});

// ===========================================================================
// GET /api/public/booking/quote/[slug]
// ===========================================================================

describe('GET /api/public/booking/quote/[slug]', () => {
  it('returns 404 when quote not found', async () => {
    selectQueue.push([]);
    const res = await quoteRoute.GET(
      makeRawReq('http://x/quote'),
      { params: Promise.resolve({ slug: 'q1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Quote not found');
  });

  it('returns the quote with alreadyPaid=true when status is paid', async () => {
    const row = {
      id: 1,
      slug: 'q1',
      title: 'T',
      description: 'D',
      price: 1000,
      customerName: 'C',
      lineItems: [{ name: 'item', amount: 1000 }],
      startTime: null,
      endTime: null,
      status: 'paid',
      expiresAt: null,
    };
    selectQueue.push([row]);
    const res = await quoteRoute.GET(
      makeRawReq('http://x/quote'),
      { params: Promise.resolve({ slug: 'q1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.alreadyPaid).toBe(true);
    expect(body.data.id).toBe(1);
  });

  it('returns 410 when quote has expired', async () => {
    selectQueue.push([
      {
        id: 1,
        slug: 'q1',
        title: 'T',
        description: '',
        price: 1000,
        customerName: 'C',
        lineItems: [],
        startTime: null,
        endTime: null,
        status: 'pending',
        expiresAt: new Date(Date.now() - 1000),
      },
    ]);
    const res = await quoteRoute.GET(
      makeRawReq('http://x/quote'),
      { params: Promise.resolve({ slug: 'q1' }) },
    );
    expect(res.status).toBe(410);
    expect((await res.json()).message).toMatch(/expired/);
  });

  it('returns the quote when pending and not expired', async () => {
    const row = {
      id: 1,
      slug: 'q1',
      title: 'T',
      description: 'D',
      price: 2500,
      customerName: 'C',
      lineItems: [{ name: 'item', amount: 2500 }],
      startTime: null,
      endTime: null,
      status: 'pending',
      expiresAt: new Date(Date.now() + 60_000),
    };
    selectQueue.push([row]);
    const res = await quoteRoute.GET(
      makeRawReq('http://x/quote'),
      { params: Promise.resolve({ slug: 'q1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(body.data.price).toBe(2500);
    expect(body.data.alreadyPaid).toBeUndefined();
  });

  it('returns the quote when pending and expiresAt is null', async () => {
    selectQueue.push([
      {
        id: 1,
        slug: 'q1',
        title: 'T',
        description: '',
        price: 1000,
        customerName: 'C',
        lineItems: [],
        startTime: null,
        endTime: null,
        status: 'pending',
        expiresAt: null,
      },
    ]);
    const res = await quoteRoute.GET(
      makeRawReq('http://x/quote'),
      { params: Promise.resolve({ slug: 'q1' }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});

// ===========================================================================
// POST /api/public/chat/messages
// ===========================================================================

describe('POST /api/public/chat/messages', () => {
  function makeBadJsonReq(): Request {
    return new Request('http://x/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
  }

  it('returns 400 when body is invalid JSON', async () => {
    const res = await chatMessagesRoute.POST(makeBadJsonReq());
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid JSON body');
  });

  it('returns 401 when ephemeralToken does not verify', async () => {
    verifyVisitorTokenMock.mockReturnValue(null);
    const res = await chatMessagesRoute.POST(
      makeJsonReq('http://x/messages', 'POST', {
        conversationId: 1,
        ephemeralToken: 'bad',
        body: 'hi',
      }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Invalid token');
  });

  it('returns 401 when token conversationId does not match body', async () => {
    verifyVisitorTokenMock.mockReturnValue({ conversationId: 99 });
    const res = await chatMessagesRoute.POST(
      makeJsonReq('http://x/messages', 'POST', {
        conversationId: 1,
        ephemeralToken: 'tok',
        body: 'hi',
      }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toMatch(/mismatch/);
  });

  it('returns 400 when message body is empty after trim', async () => {
    verifyVisitorTokenMock.mockReturnValue({ conversationId: 1 });
    const res = await chatMessagesRoute.POST(
      makeJsonReq('http://x/messages', 'POST', {
        conversationId: 1,
        ephemeralToken: 'tok',
        body: '   ',
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Message body is required');
  });

  it('returns 413 when message body exceeds MAX_BODY', async () => {
    verifyVisitorTokenMock.mockReturnValue({ conversationId: 1 });
    const res = await chatMessagesRoute.POST(
      makeJsonReq('http://x/messages', 'POST', {
        conversationId: 1,
        ephemeralToken: 'tok',
        body: 'a'.repeat(4_001),
      }),
    );
    expect(res.status).toBe(413);
    expect((await res.json()).message).toBe('Message too long');
  });

  it('returns 404 when conversation not found', async () => {
    verifyVisitorTokenMock.mockReturnValue({ conversationId: 1 });
    selectQueue.push([]); // conversation lookup empty
    const res = await chatMessagesRoute.POST(
      makeJsonReq('http://x/messages', 'POST', {
        conversationId: 1,
        ephemeralToken: 'tok',
        body: 'hello',
      }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Conversation not found');
  });

  it('returns 409 when conversation is closed', async () => {
    verifyVisitorTokenMock.mockReturnValue({ conversationId: 1 });
    selectQueue.push([
      { id: 1, clientId: 5, visitorId: 'v1', visitorName: 'V', status: 'closed' },
    ]);
    const res = await chatMessagesRoute.POST(
      makeJsonReq('http://x/messages', 'POST', {
        conversationId: 1,
        ephemeralToken: 'tok',
        body: 'hello',
      }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).message).toBe('Conversation is closed');
  });

  it('returns 429 when rate limit is exceeded', async () => {
    verifyVisitorTokenMock.mockReturnValue({ conversationId: 1 });
    selectQueue.push([
      { id: 1, clientId: 5, visitorId: 'v1', visitorName: 'V', status: 'open' },
    ]);
    checkVisitorRateLimitMock.mockReturnValue({ ok: false, retryAfter: 7 });
    const res = await chatMessagesRoute.POST(
      makeJsonReq('http://x/messages', 'POST', {
        conversationId: 1,
        ephemeralToken: 'tok',
        body: 'hello',
      }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('7');
    expect((await res.json()).message).toMatch(/Too many messages/);
    expect(insertCalls).toHaveLength(0);
  });

  it('falls back to Retry-After=1 when rate limit returns no retryAfter', async () => {
    verifyVisitorTokenMock.mockReturnValue({ conversationId: 1 });
    selectQueue.push([
      { id: 1, clientId: 5, visitorId: 'v1', visitorName: 'V', status: 'open' },
    ]);
    checkVisitorRateLimitMock.mockReturnValue({ ok: false });
    const res = await chatMessagesRoute.POST(
      makeJsonReq('http://x/messages', 'POST', {
        conversationId: 1,
        ephemeralToken: 'tok',
        body: 'hello',
      }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('1');
  });

  it('inserts message, updates conversation, publishes, and returns row', async () => {
    verifyVisitorTokenMock.mockReturnValue({ conversationId: 1 });
    selectQueue.push([
      { id: 1, clientId: 5, visitorId: 'v1', visitorName: 'Visitor One', status: 'open' },
    ]);
    checkVisitorRateLimitMock.mockReturnValue({ ok: true });

    const insertedRow = {
      id: 42,
      conversationId: 1,
      clientId: 5,
      authorKind: 'visitor',
      authorName: 'Visitor One',
      body: 'hello world',
      occurredAt: new Date('2030-01-01T00:00:00Z'),
    };
    insertReturnQueue.push([insertedRow]);
    publishMessageMock.mockResolvedValue(undefined);

    const res = await chatMessagesRoute.POST(
      makeJsonReq('http://x/messages', 'POST', {
        conversationId: 1,
        ephemeralToken: 'tok',
        body: '  hello world  ', // trimmed by route
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(42);
    expect(body.data.body).toBe('hello world');

    // Insert called with trimmed text + visitor authorship
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('chatMessages');
    expect(insertCalls[0].values).toMatchObject({
      conversationId: 1,
      clientId: 5,
      authorKind: 'visitor',
      authorName: 'Visitor One',
      body: 'hello world',
    });

    // Update bumps lastMessageAt
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('chatConversations');
    expect(updateCalls[0].patch.lastMessageAt).toBeInstanceOf(Date);
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);

    // Publish
    expect(publishMessageMock).toHaveBeenCalledTimes(1);
    const [pubConvId, pubClientId, pubPayload] = publishMessageMock.mock.calls[0];
    expect(pubConvId).toBe(1);
    expect(pubClientId).toBe(5);
    expect(pubPayload).toMatchObject({
      id: 42,
      conversationId: 1,
      authorKind: 'visitor',
      authorName: 'Visitor One',
      body: 'hello world',
    });
  });

  it('uses fallback authorName="Visitor" when visitorName is null', async () => {
    verifyVisitorTokenMock.mockReturnValue({ conversationId: 1 });
    selectQueue.push([
      { id: 1, clientId: 5, visitorId: 'v1', visitorName: null, status: 'open' },
    ]);
    checkVisitorRateLimitMock.mockReturnValue({ ok: true });
    insertReturnQueue.push([
      {
        id: 1,
        conversationId: 1,
        clientId: 5,
        authorKind: 'visitor',
        authorName: 'Visitor',
        body: 'hi',
        occurredAt: new Date(),
      },
    ]);
    publishMessageMock.mockResolvedValue(undefined);

    const res = await chatMessagesRoute.POST(
      makeJsonReq('http://x/messages', 'POST', {
        conversationId: 1,
        ephemeralToken: 'tok',
        body: 'hi',
      }),
    );
    expect(res.status).toBe(200);
    expect(insertCalls[0].values).toMatchObject({ authorName: 'Visitor' });
  });
});
