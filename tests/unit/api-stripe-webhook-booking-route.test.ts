// @vitest-environment node
/**
 * Unit tests for `POST /api/stripe/webhook/booking`.
 *
 * Stripe sends webhook events to this route. The route:
 *   - Refuses to run without STRIPE_SECRET_KEY + STRIPE_BOOKING_WEBHOOK_SECRET
 *   - Verifies the Stripe signature via stripe.webhooks.constructEvent
 *   - Branches on event.type:
 *       * payment_intent.succeeded
 *           - gift_certificate type    -> mark certificate active/paid
 *           - booking_quote type       -> mark quote paid
 *           - booking type             -> mark booking paid, create
 *                                         calendar/Zoom meeting, send guest +
 *                                         host emails
 *       * payment_intent.payment_failed (booking) -> cancel booking
 *       * charge.refunded -> mark booking refunded if matched by PI id
 *
 * Each test stubs db, schema, drizzle-orm, Stripe SDK, email + meeting
 * helpers — no live network or DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock harness state
// ---------------------------------------------------------------------------

interface StripeMockState {
  constructEvent: ReturnType<typeof vi.fn>;
}

const stripeState: StripeMockState = {
  constructEvent: vi.fn(),
};

interface DbState {
  selectQueue: unknown[][];
  inserts: Array<{ table: string; values: unknown }>;
  updates: Array<{ table: string; values: unknown; whereArg?: unknown }>;
}

const dbState: DbState = {
  selectQueue: [],
  inserts: [],
  updates: [],
};

interface EmailMockState {
  sendGuestConfirmation: ReturnType<typeof vi.fn>;
  sendHostNotification: ReturnType<typeof vi.fn>;
}

const emailState: EmailMockState = {
  sendGuestConfirmation: vi.fn(),
  sendHostNotification: vi.fn(),
};

interface MeetingMockState {
  createCalendarEvent: ReturnType<typeof vi.fn>;
  createZoomMeeting: ReturnType<typeof vi.fn>;
}

const meetingState: MeetingMockState = {
  createCalendarEvent: vi.fn(),
  createZoomMeeting: vi.fn(),
};

// ---------------------------------------------------------------------------
// Mocks (must be declared before importing the route under test)
// ---------------------------------------------------------------------------

vi.mock('stripe', () => {
  class Stripe {
    webhooks = {
      constructEvent: (...args: unknown[]) => stripeState.constructEvent(...args),
    };
  }
  return { default: Stripe };
});

vi.mock('@/lib/db/schema', () => {
  function tableProxy(name: string) {
    return new Proxy(
      { _name: name },
      {
        get(_target, prop) {
          if (prop === '_name') return name;
          return `${name}.${String(prop)}`;
        },
      },
    );
  }
  const tables = [
    'bookings', 'bookingPages', 'bookingQuotes',
    'clients', 'users', 'giftCertificates',
  ];
  const exports: Record<string, unknown> = {};
  for (const t of tables) exports[t] = tableProxy(t);
  return exports;
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ _op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ _op: 'and', args }),
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => ({
    _op: 'sql',
    strings,
    vals,
  }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

vi.mock('@/lib/db', () => {
  function makeSelectChain() {
    const rows = dbState.selectQueue.shift() ?? [];
    const chain: Record<string, unknown> = {};
    const passthrough = ['from', 'where', 'innerJoin', 'leftJoin', 'orderBy', 'limit', 'groupBy', 'offset'];
    for (const m of passthrough) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve);
    return chain;
  }

  function makeUpdateChain(table: string) {
    const updateChain: Record<string, unknown> = {};
    let captured: unknown;
    updateChain.set = (v: unknown) => {
      captured = v;
      return updateChain;
    };
    updateChain.where = (w: unknown) => {
      dbState.updates.push({ table, values: captured, whereArg: w });
      return updateChain;
    };
    updateChain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(undefined).then(resolve);
    return updateChain;
  }

  function tableName(t: unknown): string {
    if (t && typeof t === 'object' && '_name' in t) {
      return String((t as { _name: unknown })._name);
    }
    return 'unknown';
  }

  return {
    db: {
      select: () => makeSelectChain(),
      update: (t: unknown) => makeUpdateChain(tableName(t)),
    },
  };
});

vi.mock('@/lib/email/booking-emails', () => ({
  sendGuestConfirmation: (...args: unknown[]) => emailState.sendGuestConfirmation(...args),
  sendHostNotification: (...args: unknown[]) => emailState.sendHostNotification(...args),
  loadBookingBrand: (..._args: unknown[]) => Promise.resolve(null),
}));

vi.mock('@/lib/google-calendar', () => ({
  createCalendarEvent: (...args: unknown[]) => meetingState.createCalendarEvent(...args),
}));

vi.mock('@/lib/zoom', () => ({
  createZoomMeeting: (...args: unknown[]) => meetingState.createZoomMeeting(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: string, sig: string | null = 't=1,v1=sig'): Request {
  const headers: Record<string, string> = {};
  if (sig !== null) headers['stripe-signature'] = sig;
  return new Request('http://localhost/api/stripe/webhook/booking', {
    method: 'POST',
    headers,
    body,
  });
}

interface JsonResponse {
  received?: boolean;
  error?: string;
}

const DEFAULT_BOOKING = {
  id: 100,
  bookingPageId: 7,
  guestEmail: 'guest@example.com',
  guestName: 'Guest Person',
  startTime: new Date('2026-06-01T10:00:00Z'),
  endTime: new Date('2026-06-01T10:30:00Z'),
  timezone: 'America/Chicago',
  cancelToken: 'tok_abc',
  paymentStatus: 'pending',
  stripePaymentIntentId: 'pi_charge',
};

const DEFAULT_PAGE = {
  id: 7,
  clientId: 33,
  title: 'Discovery Call',
  slug: 'discovery-call',
  duration: 30,
  timezone: 'America/New_York',
  googleCalendarSync: false,
  conferenceType: 'none',
};

beforeEach(() => {
  vi.resetModules();
  dbState.selectQueue = [];
  dbState.inserts = [];
  dbState.updates = [];
  stripeState.constructEvent.mockReset();
  emailState.sendGuestConfirmation.mockReset();
  emailState.sendGuestConfirmation.mockResolvedValue(undefined);
  emailState.sendHostNotification.mockReset();
  emailState.sendHostNotification.mockResolvedValue(undefined);
  meetingState.createCalendarEvent.mockReset();
  meetingState.createCalendarEvent.mockResolvedValue(null);
  meetingState.createZoomMeeting.mockReset();
  meetingState.createZoomMeeting.mockResolvedValue(null);
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.STRIPE_BOOKING_WEBHOOK_SECRET = 'whsec_test_dummy';
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/stripe/webhook/booking — configuration guards', () => {
  it('returns 500 when STRIPE_SECRET_KEY is missing', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(500);
    const json = (await res.json()) as JsonResponse;
    expect(json.error).toMatch(/stripe not configured/i);
  });

  it('returns 500 when STRIPE_BOOKING_WEBHOOK_SECRET is missing', async () => {
    delete process.env.STRIPE_BOOKING_WEBHOOK_SECRET;
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(500);
    const json = (await res.json()) as JsonResponse;
    expect(json.error).toMatch(/stripe not configured/i);
  });
});

describe('POST /api/stripe/webhook/booking — signature verification', () => {
  it('returns 400 when constructEvent throws (invalid signature)', async () => {
    stripeState.constructEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}', 'bad'));
    expect(res.status).toBe(400);
    const json = (await res.json()) as JsonResponse;
    expect(json.error).toMatch(/webhook error/i);
    expect(stripeState.constructEvent).toHaveBeenCalledTimes(1);
    errSpy.mockRestore();
  });

  it('passes raw body, signature header, and webhook secret into constructEvent', async () => {
    stripeState.constructEvent.mockReturnValue({ type: 'unhandled.event', data: { object: {} } });
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{"foo":"bar"}', 't=1,v1=abc'));
    expect(res.status).toBe(200);
    expect(stripeState.constructEvent).toHaveBeenCalledTimes(1);
    const args = stripeState.constructEvent.mock.calls[0];
    expect(args[0]).toBe('{"foo":"bar"}');
    expect(args[1]).toBe('t=1,v1=abc');
    expect(args[2]).toBe('whsec_test_dummy');
  });

  it('treats a missing stripe-signature header as empty string', async () => {
    stripeState.constructEvent.mockReturnValue({ type: 'unhandled.event', data: { object: {} } });
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}', null));
    expect(res.status).toBe(200);
    expect(stripeState.constructEvent.mock.calls[0][1]).toBe('');
  });
});

describe('POST /api/stripe/webhook/booking — unhandled events', () => {
  it('acknowledges (received: true) without doing any DB work', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'customer.subscription.created',
      data: { object: {} },
    });
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as JsonResponse;
    expect(json.received).toBe(true);
    expect(dbState.updates).toHaveLength(0);
    expect(emailState.sendGuestConfirmation).not.toHaveBeenCalled();
  });
});

describe('POST /api/stripe/webhook/booking — payment_intent.succeeded gift_certificate', () => {
  it('marks the gift certificate active + paid', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: {
        object: { id: 'pi_gift', metadata: { type: 'gift_certificate', giftCertificateId: '42' } },
      },
    });
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    const giftUpdate = dbState.updates.find((u) => u.table === 'giftCertificates');
    expect(giftUpdate).toBeDefined();
    const v = giftUpdate!.values as { status: string; paymentStatus: string };
    expect(v.status).toBe('active');
    expect(v.paymentStatus).toBe('paid');
  });

  it('is a no-op when giftCertificateId is missing', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_gift_nomatch', metadata: { type: 'gift_certificate' } } },
    });
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(dbState.updates.filter((u) => u.table === 'giftCertificates')).toHaveLength(0);
  });
});

describe('POST /api/stripe/webhook/booking — payment_intent.succeeded booking_quote', () => {
  it('marks the booking quote as paid', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_quote', metadata: { type: 'booking_quote', quoteId: '12' } } },
    });
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    const quoteUpdate = dbState.updates.find((u) => u.table === 'bookingQuotes');
    expect(quoteUpdate).toBeDefined();
    const v = quoteUpdate!.values as { status: string; paidAt: Date };
    expect(v.status).toBe('paid');
    expect(v.paidAt).toBeInstanceOf(Date);
  });

  it('is a no-op when quoteId is missing', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_quote_nomatch', metadata: { type: 'booking_quote' } } },
    });
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(dbState.updates.filter((u) => u.table === 'bookingQuotes')).toHaveLength(0);
  });
});

describe('POST /api/stripe/webhook/booking — payment_intent.succeeded (booking)', () => {
  it('acknowledges and does nothing when metadata.type is not "booking"', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_other', metadata: { type: 'something_else' } } },
    });
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(dbState.updates).toHaveLength(0);
  });

  it('is a no-op when bookingId is missing', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_no_id', metadata: { type: 'booking' } } },
    });
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(dbState.updates).toHaveLength(0);
  });

  it('is idempotent: returns without updating when booking already paid', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_dup', metadata: { type: 'booking', bookingId: '100' } } },
    });
    dbState.selectQueue.push([{ ...DEFAULT_BOOKING, paymentStatus: 'paid' }]);
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(dbState.updates.filter((u) => u.table === 'bookings')).toHaveLength(0);
    expect(emailState.sendGuestConfirmation).not.toHaveBeenCalled();
  });

  it('is a no-op when the booking row does not exist', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_missing', metadata: { type: 'booking', bookingId: '100' } } },
    });
    dbState.selectQueue.push([]); // booking lookup empty
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(dbState.updates).toHaveLength(0);
  });

  it('marks paid then stops when the booking page is missing', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_nopage', metadata: { type: 'booking', bookingId: '100' } } },
    });
    dbState.selectQueue.push([DEFAULT_BOOKING]); // booking
    dbState.selectQueue.push([]); // booking page missing
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    const bookingUpdates = dbState.updates.filter((u) => u.table === 'bookings');
    expect(bookingUpdates.length).toBe(1);
    expect((bookingUpdates[0].values as { paymentStatus: string }).paymentStatus).toBe('paid');
    expect(emailState.sendGuestConfirmation).not.toHaveBeenCalled();
  });

  it('happy-path: marks paid, sends guest + host emails (no conference/calendar)', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_ok', metadata: { type: 'booking', bookingId: '100' } } },
    });
    dbState.selectQueue.push([DEFAULT_BOOKING]); // booking
    dbState.selectQueue.push([DEFAULT_PAGE]); // booking page
    dbState.selectQueue.push([{ userId: 555 }]); // clients
    dbState.selectQueue.push([{ email: 'host@example.com' }]); // host user
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);

    // booking marked paid
    const paidUpdate = dbState.updates.find(
      (u) =>
        u.table === 'bookings' &&
        (u.values as { paymentStatus?: string }).paymentStatus === 'paid',
    );
    expect(paidUpdate).toBeDefined();

    // no meetingLink update (no zoom/meet)
    const meetingLinkUpdate = dbState.updates.find(
      (u) => u.table === 'bookings' && (u.values as { meetingLink?: string }).meetingLink,
    );
    expect(meetingLinkUpdate).toBeUndefined();

    expect(meetingState.createCalendarEvent).not.toHaveBeenCalled();
    expect(meetingState.createZoomMeeting).not.toHaveBeenCalled();

    expect(emailState.sendGuestConfirmation).toHaveBeenCalledTimes(1);
    const guestArg = emailState.sendGuestConfirmation.mock.calls[0][0];
    expect(guestArg.guestEmail).toBe('guest@example.com');
    expect(guestArg.pageTitle).toBe('Discovery Call');
    expect(guestArg.timezone).toBe('America/Chicago'); // booking.timezone wins
    expect(guestArg.meetingLink).toBeNull();

    expect(emailState.sendHostNotification).toHaveBeenCalledTimes(1);
    expect(emailState.sendHostNotification.mock.calls[0][0]).toBe('host@example.com');
  });

  it('falls back to page timezone when booking has no timezone', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_tz', metadata: { type: 'booking', bookingId: '100' } } },
    });
    dbState.selectQueue.push([{ ...DEFAULT_BOOKING, timezone: null }]);
    dbState.selectQueue.push([DEFAULT_PAGE]);
    dbState.selectQueue.push([{ userId: 555 }]);
    dbState.selectQueue.push([{ email: 'host@example.com' }]);
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(emailState.sendGuestConfirmation.mock.calls[0][0].timezone).toBe('America/New_York');
  });

  it('creates a Google Meet calendar event and stores returned meetingLink', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_meet', metadata: { type: 'booking', bookingId: '100' } } },
    });
    dbState.selectQueue.push([DEFAULT_BOOKING]);
    dbState.selectQueue.push([{ ...DEFAULT_PAGE, conferenceType: 'google_meet' }]);
    dbState.selectQueue.push([{ userId: 555 }]);
    dbState.selectQueue.push([{ email: 'host@example.com' }]);
    meetingState.createCalendarEvent.mockResolvedValueOnce({ meetingLink: 'https://meet.example/abc' });
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(meetingState.createCalendarEvent).toHaveBeenCalledTimes(1);
    const call = meetingState.createCalendarEvent.mock.calls[0][0];
    expect(call.addGoogleMeet).toBe(true);
    expect(call.bookingId).toBe(100);

    const linkUpdate = dbState.updates.find(
      (u) =>
        u.table === 'bookings' &&
        (u.values as { meetingLink?: string }).meetingLink === 'https://meet.example/abc',
    );
    expect(linkUpdate).toBeDefined();
    expect(emailState.sendGuestConfirmation.mock.calls[0][0].meetingLink).toBe('https://meet.example/abc');
  });

  it('calls createCalendarEvent (no Meet) when only googleCalendarSync is true', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_calsync', metadata: { type: 'booking', bookingId: '100' } } },
    });
    dbState.selectQueue.push([DEFAULT_BOOKING]);
    dbState.selectQueue.push([{ ...DEFAULT_PAGE, googleCalendarSync: true, conferenceType: 'none' }]);
    dbState.selectQueue.push([{ userId: 555 }]);
    dbState.selectQueue.push([{ email: 'host@example.com' }]);
    meetingState.createCalendarEvent.mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(meetingState.createCalendarEvent).toHaveBeenCalledTimes(1);
    expect(meetingState.createCalendarEvent.mock.calls[0][0].addGoogleMeet).toBe(false);
    // no meetingLink update because resolver returned null
    const linkUpdate = dbState.updates.find(
      (u) => u.table === 'bookings' && (u.values as { meetingLink?: string }).meetingLink,
    );
    expect(linkUpdate).toBeUndefined();
  });

  it('creates a Zoom meeting and stores the link', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_zoom', metadata: { type: 'booking', bookingId: '100' } } },
    });
    dbState.selectQueue.push([DEFAULT_BOOKING]);
    dbState.selectQueue.push([{ ...DEFAULT_PAGE, conferenceType: 'zoom' }]);
    dbState.selectQueue.push([{ userId: 555 }]);
    dbState.selectQueue.push([{ email: 'host@example.com' }]);
    meetingState.createZoomMeeting.mockResolvedValueOnce('https://zoom.us/j/123');
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(meetingState.createZoomMeeting).toHaveBeenCalledTimes(1);
    expect(meetingState.createCalendarEvent).not.toHaveBeenCalled();
    const linkUpdate = dbState.updates.find(
      (u) =>
        u.table === 'bookings' &&
        (u.values as { meetingLink?: string }).meetingLink === 'https://zoom.us/j/123',
    );
    expect(linkUpdate).toBeDefined();
  });

  it('also syncs the Zoom meeting to Google Calendar when googleCalendarSync=true', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_zoom_sync', metadata: { type: 'booking', bookingId: '100' } } },
    });
    dbState.selectQueue.push([DEFAULT_BOOKING]);
    dbState.selectQueue.push([
      { ...DEFAULT_PAGE, conferenceType: 'zoom', googleCalendarSync: true },
    ]);
    dbState.selectQueue.push([{ userId: 555 }]);
    dbState.selectQueue.push([{ email: 'host@example.com' }]);
    meetingState.createZoomMeeting.mockResolvedValueOnce('https://zoom.us/j/456');
    meetingState.createCalendarEvent.mockResolvedValue(null);
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(meetingState.createZoomMeeting).toHaveBeenCalledTimes(1);
    // Both the initial googleCalendarSync branch and the post-zoom sync fire;
    // we only care that the post-zoom call carries the Zoom URL in description.
    expect(meetingState.createCalendarEvent.mock.calls.length).toBeGreaterThanOrEqual(1);
    const zoomSyncCall = meetingState.createCalendarEvent.mock.calls.find(
      (c) => typeof c[0]?.description === 'string' && c[0].description.includes('https://zoom.us/j/456'),
    );
    expect(zoomSyncCall).toBeDefined();
  });

  it('does not send host email when the client row is missing', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_noclient', metadata: { type: 'booking', bookingId: '100' } } },
    });
    dbState.selectQueue.push([DEFAULT_BOOKING]);
    dbState.selectQueue.push([DEFAULT_PAGE]);
    dbState.selectQueue.push([]); // clients lookup empty
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(emailState.sendGuestConfirmation).toHaveBeenCalledTimes(1);
    expect(emailState.sendHostNotification).not.toHaveBeenCalled();
  });

  it('does not send host email when the host user row is missing', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_nohost', metadata: { type: 'booking', bookingId: '100' } } },
    });
    dbState.selectQueue.push([DEFAULT_BOOKING]);
    dbState.selectQueue.push([DEFAULT_PAGE]);
    dbState.selectQueue.push([{ userId: 555 }]);
    dbState.selectQueue.push([]); // users lookup empty
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(emailState.sendHostNotification).not.toHaveBeenCalled();
  });

  it('swallows errors from sendGuestConfirmation (.catch)', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_emailfail', metadata: { type: 'booking', bookingId: '100' } } },
    });
    dbState.selectQueue.push([DEFAULT_BOOKING]);
    dbState.selectQueue.push([DEFAULT_PAGE]);
    dbState.selectQueue.push([{ userId: 555 }]);
    dbState.selectQueue.push([{ email: 'host@example.com' }]);
    emailState.sendGuestConfirmation.mockRejectedValueOnce(new Error('SMTP down'));
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/stripe/webhook/booking — payment_intent.payment_failed', () => {
  it('acknowledges without DB work when metadata.type is not "booking"', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_fail_other', metadata: { type: 'gift_certificate' } } },
    });
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(dbState.updates).toHaveLength(0);
  });

  it('cancels the booking when bookingId is present', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_fail', metadata: { type: 'booking', bookingId: '100' } } },
    });
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    const cancelled = dbState.updates.find((u) => u.table === 'bookings');
    expect(cancelled).toBeDefined();
    const v = cancelled!.values as { status: string; paymentStatus: string; cancelledAt: Date };
    expect(v.status).toBe('cancelled');
    expect(v.paymentStatus).toBe('free');
    expect(v.cancelledAt).toBeInstanceOf(Date);
  });

  it('does nothing when bookingId is missing', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_fail_noid', metadata: { type: 'booking' } } },
    });
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(dbState.updates).toHaveLength(0);
  });
});

describe('POST /api/stripe/webhook/booking — charge.refunded', () => {
  it('does nothing when payment_intent is not a string', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'charge.refunded',
      data: { object: { payment_intent: null, metadata: {} } },
    });
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(dbState.updates).toHaveLength(0);
  });

  it('does nothing when the booking cannot be found by PI', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'charge.refunded',
      data: { object: { payment_intent: 'pi_nomatch', metadata: {} } },
    });
    dbState.selectQueue.push([]); // no booking
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(dbState.updates).toHaveLength(0);
  });

  it('marks the booking refunded when matched by PI', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'charge.refunded',
      data: { object: { payment_intent: 'pi_charge', metadata: {} } },
    });
    dbState.selectQueue.push([DEFAULT_BOOKING]);
    const { POST } = await import('@/app/api/stripe/webhook/booking/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    const refunded = dbState.updates.find(
      (u) =>
        u.table === 'bookings' &&
        (u.values as { paymentStatus?: string }).paymentStatus === 'refunded',
    );
    expect(refunded).toBeDefined();
  });
});
