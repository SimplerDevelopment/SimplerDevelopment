// @vitest-environment node
/**
 * Unit tests for four portal booking routes (batch 33a):
 *   - app/api/portal/tools/booking/calendar/route.ts            (GET)
 *   - app/api/portal/tools/booking/checkin/route.ts             (POST)
 *   - app/api/portal/tools/booking/checkin/today/route.ts       (GET)
 *   - app/api/portal/tools/booking/google/auth/route.ts         (GET)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// mocks (declared before importing routes)
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const authorizePortalMock = vi.fn();
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (r: unknown) =>
    typeof r === 'object' && r !== null && 'response' in (r as Record<string, unknown>),
}));

const headersMock = vi.fn();
vi.mock('next/headers', () => ({
  headers: () => headersMock(),
}));

// googleapis — capture OAuth2 ctor + generateAuthUrl
const generateAuthUrlMock = vi.fn();
const oauth2CtorMock = vi.fn();
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: class {
        constructor(clientId?: string, clientSecret?: string, redirectUri?: string) {
          oauth2CtorMock(clientId, clientSecret, redirectUri);
        }
        generateAuthUrl(opts: Record<string, unknown>) {
          return generateAuthUrlMock(opts);
        }
      },
    },
  },
}));

// drizzle-orm — stub operators
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  ne: (a: unknown, b: unknown) => ({ op: 'ne', a, b }),
  gte: (a: unknown, b: unknown) => ({ op: 'gte', a, b }),
  lte: (a: unknown, b: unknown) => ({ op: 'lte', a, b }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings,
      values,
    }),
    {
      raw: (s: string) => ({ op: 'sql.raw', s }),
    },
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// schema — proxy tables (inert)
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
    bookingPages: wrap('bookingPages'),
    bookings: wrap('bookings'),
    bookingPageMembers: wrap('bookingPageMembers'),
    users: wrap('users'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// db mock — queue-based select; capture for update
// ---------------------------------------------------------------------------

interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
const updateCalls: UpdateCall[] = [];

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materialized: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = () => {
      if (!materialized) {
        const next = selectQueue.shift() ?? [];
        materialized = Promise.resolve(next.map((r) => ({ ...r })));
      }
      return materialized;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'groupBy']) {
      chain[m] = passthrough;
    }
    chain.orderBy = () => ({
      then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
        return materialize().then(onF, onR);
      },
    });
    chain.limit = () => ({
      then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
        return materialize().then(onF, onR);
      },
    });
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            updateCalls.push({ table: table.__table, patch, filter });
            return Promise.resolve(undefined);
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
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// import routes after all mocks
// ---------------------------------------------------------------------------

const { GET: calendarGET } = await import(
  '@/app/api/portal/tools/booking/calendar/route'
);
const { POST: checkinPOST } = await import(
  '@/app/api/portal/tools/booking/checkin/route'
);
const { GET: checkinTodayGET } = await import(
  '@/app/api/portal/tools/booking/checkin/today/route'
);
const { GET: googleAuthGET } = await import(
  '@/app/api/portal/tools/booking/google/auth/route'
);

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const SESSION = { user: { id: '7' } };

function jsonReq(body: unknown, method = 'POST', url = 'http://x/api/portal/tools/booking/checkin') {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  selectQueue = [];
  updateCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  authorizePortalMock.mockReset();
  headersMock.mockReset();
  generateAuthUrlMock.mockReset();
  oauth2CtorMock.mockReset();
  authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'admin' });
});

// ===========================================================================
// GET /api/portal/tools/booking/calendar
// ===========================================================================

describe('GET /api/portal/tools/booking/calendar', () => {
  function makeReq(qs: string) {
    return new Request(`http://x/api/portal/tools/booking/calendar?${qs}`);
  }

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await calendarGET(makeReq('start=2026-01-01&end=2026-01-02'));
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await calendarGET(makeReq('start=2026-01-01&end=2026-01-02'));
    expect(res.status).toBe(401);
  });

  it('returns the auth-error response from authorizePortal', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({
      response: NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 }),
    });
    const res = await calendarGET(makeReq('start=2026-01-01&end=2026-01-02'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when portal client not resolvable', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await calendarGET(makeReq('start=2026-01-01&end=2026-01-02'));
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 400 when start or end params are missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await calendarGET(makeReq('start=2026-01-01'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/start and end/);
  });

  it('returns 200 with enriched bookings + members map', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    // 1. pages for this client (fetched first by route)
    selectQueue.push([{ id: 10 }]);
    // 2. bookings + pages join
    selectQueue.push([
      {
        id: 1,
        bookingPageId: 10,
        guestName: 'Alice',
        guestEmail: 'a@x.com',
        startTime: new Date('2026-01-02T10:00:00Z'),
        endTime: new Date('2026-01-02T11:00:00Z'),
        timezone: 'UTC',
        status: 'confirmed',
        assignedTo: 8,
        groupSize: 2,
        total: 100,
        pageTitle: 'Discovery',
        pageColor: '#abc',
      },
      {
        id: 2,
        bookingPageId: 10,
        guestName: 'Bob',
        guestEmail: 'b@x.com',
        startTime: new Date('2026-01-03T10:00:00Z'),
        endTime: new Date('2026-01-03T11:00:00Z'),
        timezone: 'UTC',
        status: 'confirmed',
        assignedTo: null,
        groupSize: 1,
        total: 50,
        pageTitle: 'Discovery',
        pageColor: '#abc',
      },
    ]);
    // 3. members + users join
    selectQueue.push([
      {
        id: 500,
        bookingPageId: 10,
        userId: 8,
        displayName: 'Member Eight',
        color: '#0f0',
        userName: 'User Eight',
      },
    ]);
    const res = await calendarGET(makeReq('start=2026-01-01&end=2026-01-04'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.bookings).toHaveLength(2);
    expect(body.data.bookings[0].assignedMember).toEqual({ name: 'Member Eight', color: '#0f0' });
    expect(body.data.bookings[1].assignedMember).toBeNull();
    expect(body.data.members).toHaveLength(1);
    expect(body.data.members[0]).toMatchObject({ userId: 8, name: 'Member Eight', color: '#0f0' });
  });

  it('filters bookings by memberId query param', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 10 }]); // pages (fetched first by route)
    selectQueue.push([
      {
        id: 1,
        bookingPageId: 10,
        guestName: 'Alice',
        guestEmail: 'a@x.com',
        startTime: new Date('2026-01-02T10:00:00Z'),
        endTime: new Date('2026-01-02T11:00:00Z'),
        timezone: 'UTC',
        status: 'confirmed',
        assignedTo: 8,
        groupSize: 2,
        total: 100,
        pageTitle: 'Discovery',
        pageColor: '#abc',
      },
      {
        id: 2,
        bookingPageId: 10,
        guestName: 'Bob',
        guestEmail: 'b@x.com',
        startTime: new Date('2026-01-03T10:00:00Z'),
        endTime: new Date('2026-01-03T11:00:00Z'),
        timezone: 'UTC',
        status: 'confirmed',
        assignedTo: 9,
        groupSize: 1,
        total: 50,
        pageTitle: 'Discovery',
        pageColor: '#abc',
      },
    ]);
    selectQueue.push([]); // no members
    const res = await calendarGET(makeReq('start=2026-01-01&end=2026-01-04&memberId=8'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.bookings).toHaveLength(1);
    expect(body.data.bookings[0].assignedTo).toBe(8);
  });

  it('falls back to userName when displayName is empty', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 10 }]); // pages (fetched first by route)
    selectQueue.push([
      {
        id: 1,
        bookingPageId: 10,
        guestName: 'Alice',
        guestEmail: 'a@x.com',
        startTime: new Date('2026-01-02T10:00:00Z'),
        endTime: new Date('2026-01-02T11:00:00Z'),
        timezone: 'UTC',
        status: 'confirmed',
        assignedTo: 8,
        groupSize: 1,
        total: 50,
        pageTitle: 'Discovery',
        pageColor: '#abc',
      },
    ]);
    selectQueue.push([
      {
        id: 500,
        bookingPageId: 10,
        userId: 8,
        displayName: null,
        color: null,
        userName: 'Fallback Name',
      },
    ]);
    const res = await calendarGET(makeReq('start=2026-01-01&end=2026-01-04'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.members[0].name).toBe('Fallback Name');
    expect(body.data.members[0].color).toBe('#6b7280'); // default
  });

  it('skips members query entirely when no pages exist for the client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // no pages (fetched first by route) → early return
    // No further selectQueue entries consumed since pageIds is empty.
    const res = await calendarGET(makeReq('start=2026-01-01&end=2026-01-04'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.bookings).toEqual([]);
    expect(body.data.members).toEqual([]);
  });
});

// ===========================================================================
// POST /api/portal/tools/booking/checkin
// ===========================================================================

describe('POST /api/portal/tools/booking/checkin', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await checkinPOST(jsonReq({ code: 'ABC' }));
    expect(res.status).toBe(401);
  });

  it('returns the auth-error response from authorizePortal', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({
      response: NextResponse.json({ success: false }, { status: 403 }),
    });
    const res = await checkinPOST(jsonReq({ code: 'ABC' }));
    expect(res.status).toBe(403);
  });

  it('returns 401 when getPortalClient returns null', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await checkinPOST(jsonReq({ code: 'ABC' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when code is missing or blank', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await checkinPOST(jsonReq({ code: '   ' }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/required/);
  });

  it('returns 404 when no booking matches the code', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // no booking found
    const res = await checkinPOST(jsonReq({ code: 'ABC' }));
    expect(res.status).toBe(404);
  });

  it('returns 409 when guest is already checked in', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([
      {
        id: 1,
        guestName: 'Alice',
        guestEmail: 'a@x.com',
        startTime: new Date(),
        endTime: new Date(),
        groupSize: 1,
        status: 'confirmed',
        checkinCode: 'ABC',
        checkedInAt: new Date('2025-01-01'),
        bookingPageId: 10,
        clientId: 33,
      },
    ]);
    const res = await checkinPOST(jsonReq({ code: 'ABC' }));
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/already/);
  });

  it('returns 400 when booking is for a different day', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([
      {
        id: 1,
        guestName: 'Alice',
        guestEmail: 'a@x.com',
        startTime: new Date('2020-01-01T10:00:00Z'), // way in the past
        endTime: new Date('2020-01-01T11:00:00Z'),
        groupSize: 1,
        status: 'confirmed',
        checkinCode: 'ABC',
        checkedInAt: null,
        bookingPageId: 10,
        clientId: 33,
      },
    ]);
    const res = await checkinPOST(jsonReq({ code: 'ABC' }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/2020-01-01/);
  });

  it('checks in successfully and returns booking info', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([
      {
        id: 1,
        guestName: 'Alice',
        guestEmail: 'a@x.com',
        startTime: new Date(), // now
        endTime: new Date(),
        groupSize: 2,
        status: 'confirmed',
        checkinCode: 'ABC',
        checkedInAt: null,
        bookingPageId: 10,
        clientId: 33,
      },
    ]);
    selectQueue.push([{ title: 'Discovery Call' }]); // page lookup
    const res = await checkinPOST(jsonReq({ code: 'abc' })); // lowercase, should be upcased
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.bookingId).toBe(1);
    expect(body.data.guestName).toBe('Alice');
    expect(body.data.pageTitle).toBe('Discovery Call');
    expect(body.data.checkedInAt).toBeDefined();
    // Verify the update was issued against bookings
    expect(updateCalls.some((u) => u.table === 'bookings')).toBe(true);
    const upd = updateCalls.find((u) => u.table === 'bookings')!;
    expect(upd.patch.checkedInBy).toBe(7);
    expect(upd.patch.checkedInAt).toBeInstanceOf(Date);
  });

  it('falls back to "Unknown" page title when page lookup empty', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([
      {
        id: 1,
        guestName: 'Alice',
        guestEmail: 'a@x.com',
        startTime: new Date(),
        endTime: new Date(),
        groupSize: 2,
        status: 'confirmed',
        checkinCode: 'ABC',
        checkedInAt: null,
        bookingPageId: 10,
        clientId: 33,
      },
    ]);
    selectQueue.push([]); // page lookup empty
    const res = await checkinPOST(jsonReq({ code: 'ABC' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.pageTitle).toBe('Unknown');
  });
});

// ===========================================================================
// GET /api/portal/tools/booking/checkin/today
// ===========================================================================

describe('GET /api/portal/tools/booking/checkin/today', () => {
  function makeReq() {
    return new Request('http://x/api/portal/tools/booking/checkin/today');
  }

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await checkinTodayGET(makeReq());
    expect(res.status).toBe(401);
  });

  it('returns auth-error response from authorizePortal', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({
      response: NextResponse.json({ success: false }, { status: 403 }),
    });
    const res = await checkinTodayGET(makeReq());
    expect(res.status).toBe(403);
  });

  it('returns 401 when getPortalClient returns null', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await checkinTodayGET(makeReq());
    expect(res.status).toBe(401);
  });

  it('returns 200 with empty list when no bookings today', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // no bookings
    // pageIds is empty so no pages query is issued
    const res = await checkinTodayGET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.bookings).toEqual([]);
    expect(body.data.summary).toEqual({ total: 0, checkedIn: 0, pending: 0, totalGuests: 0 });
  });

  it('returns 200 with enriched bookings + summary counts', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([
      {
        id: 1,
        guestName: 'Alice',
        guestEmail: 'a@x.com',
        guestPhone: '555',
        startTime: new Date(),
        endTime: new Date(),
        groupSize: 2,
        status: 'confirmed',
        paymentStatus: 'paid',
        checkinCode: 'A1',
        checkedInAt: new Date(),
        bookingPageId: 10,
      },
      {
        id: 2,
        guestName: 'Bob',
        guestEmail: 'b@x.com',
        guestPhone: null,
        startTime: new Date(),
        endTime: new Date(),
        groupSize: 3,
        status: 'confirmed',
        paymentStatus: 'unpaid',
        checkinCode: 'B2',
        checkedInAt: null,
        bookingPageId: 11,
      },
      {
        id: 3,
        guestName: 'Carol',
        guestEmail: 'c@x.com',
        guestPhone: null,
        startTime: new Date(),
        endTime: new Date(),
        groupSize: null,
        status: 'confirmed',
        paymentStatus: 'paid',
        checkinCode: 'C3',
        checkedInAt: null,
        bookingPageId: 11,
      },
    ]);
    selectQueue.push([
      { id: 10, title: 'Discovery' },
      { id: 11, title: 'Demo' },
    ]); // page titles
    const res = await checkinTodayGET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.bookings).toHaveLength(3);
    expect(body.data.bookings[0].isCheckedIn).toBe(true);
    expect(body.data.bookings[1].isCheckedIn).toBe(false);
    expect(body.data.bookings[0].pageTitle).toBe('Discovery');
    expect(body.data.bookings[1].pageTitle).toBe('Demo');
    expect(body.data.summary.total).toBe(3);
    expect(body.data.summary.checkedIn).toBe(1);
    expect(body.data.summary.pending).toBe(2);
    // Alice 2 + Bob 3 + Carol null->1 = 6
    expect(body.data.summary.totalGuests).toBe(6);
  });

  it('falls back to "Unknown" page title when bookingPage not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([
      {
        id: 1,
        guestName: 'Alice',
        guestEmail: 'a@x.com',
        guestPhone: null,
        startTime: new Date(),
        endTime: new Date(),
        groupSize: 1,
        status: 'confirmed',
        paymentStatus: 'paid',
        checkinCode: 'A1',
        checkedInAt: null,
        bookingPageId: 999, // not in returned pages map
      },
    ]);
    selectQueue.push([]); // no matching page titles
    const res = await checkinTodayGET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.bookings[0].pageTitle).toBe('Unknown');
  });
});

// ===========================================================================
// GET /api/portal/tools/booking/google/auth
// ===========================================================================

describe('GET /api/portal/tools/booking/google/auth', () => {
  function fakeHeaders(map: Record<string, string>) {
    return {
      get(name: string) {
        return map[name.toLowerCase()] ?? null;
      },
    };
  }

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await googleAuthGET();
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await googleAuthGET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when client not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await googleAuthGET();
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('builds OAuth2 client with redirect URI from headers and redirects to Google auth URL', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    headersMock.mockResolvedValue(
      fakeHeaders({ host: 'example.com', 'x-forwarded-proto': 'https' }),
    );
    generateAuthUrlMock.mockReturnValue('https://accounts.google.com/o/oauth2/auth?stub=1');
    process.env.GOOGLE_CLIENT_ID = 'cid';
    process.env.GOOGLE_CLIENT_SECRET = 'csec';
    const res = await googleAuthGET();
    // NextResponse.redirect uses 307 by default
    expect([302, 307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toBe('https://accounts.google.com/o/oauth2/auth?stub=1');
    expect(oauth2CtorMock).toHaveBeenCalledWith(
      'cid',
      'csec',
      'https://example.com/api/portal/tools/booking/google/callback',
    );
    expect(generateAuthUrlMock).toHaveBeenCalledWith({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar'],
      prompt: 'consent',
      state: expect.any(String),
    });
  });

  it('defaults host to localhost:3000 and protocol to https when headers are missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    headersMock.mockResolvedValue(fakeHeaders({}));
    generateAuthUrlMock.mockReturnValue('https://google/auth');
    const res = await googleAuthGET();
    expect([302, 307, 308]).toContain(res.status);
    expect(oauth2CtorMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'https://localhost:3000/api/portal/tools/booking/google/callback',
    );
  });
});
