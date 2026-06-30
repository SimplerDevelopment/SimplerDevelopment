// @vitest-environment node
/**
 * Unit tests for four booking-related portal routes (batch 33b):
 *   - app/api/portal/tools/booking/google/callback/route.ts        (GET)
 *   - app/api/portal/tools/booking/google/disconnect/route.ts      (POST)
 *   - app/api/portal/tools/booking/quotes/[quoteId]/route.ts       (GET, PUT, DELETE)
 *   - app/api/portal/tools/booking/quotes/route.ts                 (GET, POST)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks
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
const isAuthErrorMock = vi.fn(
  (r: unknown) => !!(r as { response?: unknown })?.response,
);
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (r: unknown) => isAuthErrorMock(r),
}));

const headersMock = vi.fn();
const TEST_STATE = 'abcd';
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === 'booking_google_oauth_state' ? { value: TEST_STATE } : undefined,
  })),
  headers: () => headersMock(),
}));

// googleapis — the callback route does `new google.auth.OAuth2(...)`
const getTokenMock = vi.fn();
const oauth2ConstructorCalls: Array<unknown[]> = [];
function OAuth2Stub(this: unknown, ...args: unknown[]) {
  oauth2ConstructorCalls.push(args);
  (this as Record<string, unknown>).getToken = (...a: unknown[]) =>
    getTokenMock(...a);
}
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: OAuth2Stub,
    },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          if (prop === '$inferSelect') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    googleCalendarTokens: wrap('googleCalendarTokens'),
    bookingQuotes: wrap('bookingQuotes'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// DB mock — captures select results from a queue and records writes.
// ---------------------------------------------------------------------------

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let returningQueue: Array<Array<Record<string, unknown>>> = [];

const dbCalls: {
  insert: Array<{ table: string; values: Record<string, unknown> }>;
  update: Array<{ table: string; set: Record<string, unknown> }>;
  delete: Array<{ table: string }>;
} = { insert: [], update: [], delete: [] };

function shiftSelect(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

function shiftReturning(): Array<Record<string, unknown>> {
  return returningQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materialized: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = () => {
      if (!materialized) materialized = Promise.resolve(shiftSelect());
      return materialized;
    };
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'groupBy']) {
      chain[m] = passthrough;
    }
    chain.orderBy = () => {
      materialize();
      return {
        then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
          materialized!.then(onF, onR),
      };
    };
    chain.limit = () => {
      materialize();
      return {
        then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
          materialized!.then(onF, onR),
      };
    };
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(vals: Record<string, unknown>) {
        dbCalls.insert.push({ table: table.__table, values: vals });
        const rows = shiftReturning();
        return {
          returning: () => Promise.resolve(rows),
          then: (
            onF: (v: unknown) => unknown,
            onR?: (e: unknown) => unknown,
          ) => Promise.resolve(rows).then(onF, onR),
        };
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    let setVals: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {
      set(vals: Record<string, unknown>) {
        setVals = vals;
        return chain;
      },
      where() {
        dbCalls.update.push({ table: table.__table, set: setVals });
        const rows = shiftReturning();
        return {
          returning: () => Promise.resolve(rows),
          then: (
            onF: (v: unknown) => unknown,
            onR?: (e: unknown) => unknown,
          ) => Promise.resolve(rows).then(onF, onR),
        };
      },
    };
    return chain;
  }

  function buildDelete(table: { __table: string }) {
    return {
      where() {
        dbCalls.delete.push({ table: table.__table });
        return Promise.resolve();
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
      delete(table: { __table: string }) {
        return buildDelete(table);
      },
    },
  };
});

// ---- modules under test ----
const googleCallbackRoute = await import(
  '@/app/api/portal/tools/booking/google/callback/route'
);
const googleDisconnectRoute = await import(
  '@/app/api/portal/tools/booking/google/disconnect/route'
);
const quotesIdRoute = await import(
  '@/app/api/portal/tools/booking/quotes/[quoteId]/route'
);
const quotesRoute = await import('@/app/api/portal/tools/booking/quotes/route');

// ---- helpers ----
const SESSION = { user: { id: '7', name: 'Bob' } };
const OK_AUTH = { client: { id: 33 }, userId: 7 };

function fakeHeaders(host = 'example.com', proto = 'https') {
  return {
    get(key: string) {
      const k = key.toLowerCase();
      if (k === 'host') return host;
      if (k === 'x-forwarded-proto') return proto;
      return null;
    },
  };
}

function quoteParams(quoteId: string): { params: Promise<{ quoteId: string }> } {
  return { params: Promise.resolve({ quoteId }) };
}

beforeEach(() => {
  selectQueue = [];
  returningQueue = [];
  dbCalls.insert.length = 0;
  dbCalls.update.length = 0;
  dbCalls.delete.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  authorizePortalMock.mockReset();
  isAuthErrorMock.mockClear();
  headersMock.mockReset();
  getTokenMock.mockReset();
  oauth2ConstructorCalls.length = 0;
});

// ===========================================================================
// GET /api/portal/tools/booking/google/callback
// ===========================================================================

describe('GET /api/portal/tools/booking/google/callback', () => {
  function makeReq(qs: Record<string, string> = {}) {
    const u = new URL(
      'https://example.com/api/portal/tools/booking/google/callback',
    );
    if (qs.code && !qs.state) u.searchParams.set('state', TEST_STATE);
    for (const [k, v] of Object.entries(qs)) u.searchParams.set(k, v);
    return new Request(u.toString());
  }

  it('redirects to error when there is no session', async () => {
    headersMock.mockResolvedValue(fakeHeaders());
    authMock.mockResolvedValue(null);
    const res = await googleCallbackRoute.GET(makeReq({ code: 'c' }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(
      'https://example.com/portal/tools/booking?google=error',
    );
  });

  it('redirects to error when portal client lookup fails', async () => {
    headersMock.mockResolvedValue(fakeHeaders());
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await googleCallbackRoute.GET(makeReq({ code: 'c' }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('google=error');
  });

  it('redirects to error when ?code is missing', async () => {
    headersMock.mockResolvedValue(fakeHeaders());
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await googleCallbackRoute.GET(makeReq({}));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('google=error');
  });

  it('redirects to error when access_token or refresh_token are absent', async () => {
    headersMock.mockResolvedValue(fakeHeaders());
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    getTokenMock.mockResolvedValue({
      tokens: { access_token: null, refresh_token: 'r' },
    });
    const res = await googleCallbackRoute.GET(makeReq({ code: 'c' }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('google=error');
  });

  it('redirects to error when getToken throws', async () => {
    headersMock.mockResolvedValue(fakeHeaders());
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    getTokenMock.mockRejectedValue(new Error('bad code'));
    const res = await googleCallbackRoute.GET(makeReq({ code: 'c' }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('google=error');
  });

  it('inserts new token row when no existing record and redirects connected', async () => {
    headersMock.mockResolvedValue(fakeHeaders());
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    getTokenMock.mockResolvedValue({
      tokens: {
        access_token: 'at',
        refresh_token: 'rt',
        expiry_date: Date.now() + 60_000,
      },
    });
    selectQueue.push([]); // no existing row

    const res = await googleCallbackRoute.GET(makeReq({ code: 'good' }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('google=connected');

    expect(dbCalls.insert).toHaveLength(1);
    expect(dbCalls.insert[0].table).toBe('googleCalendarTokens');
    expect(dbCalls.insert[0].values.clientId).toBe(33);
    expect(dbCalls.insert[0].values.accessToken).toBe('at');
    expect(dbCalls.insert[0].values.refreshToken).toBe('rt');
    expect(dbCalls.update).toHaveLength(0);

    // OAuth2 client constructed with the request-derived redirect URI
    expect(oauth2ConstructorCalls).toHaveLength(1);
    const args = oauth2ConstructorCalls[0] as [string, string, string];
    expect(args[2]).toBe(
      'https://example.com/api/portal/tools/booking/google/callback',
    );
  });

  it('updates existing token row when one already exists', async () => {
    headersMock.mockResolvedValue(fakeHeaders('myhost.test', 'http'));
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    getTokenMock.mockResolvedValue({
      tokens: {
        access_token: 'at2',
        refresh_token: 'rt2',
        // no expiry_date — exercises the fallback Date.now() branch
      },
    });
    selectQueue.push([{ id: 999 }]); // existing row

    const res = await googleCallbackRoute.GET(makeReq({ code: 'good' }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(
      'http://myhost.test/portal/tools/booking?google=connected',
    );
    expect(dbCalls.update).toHaveLength(1);
    expect(dbCalls.update[0].table).toBe('googleCalendarTokens');
    expect(dbCalls.update[0].set.accessToken).toBe('at2');
    expect(dbCalls.update[0].set.refreshToken).toBe('rt2');
    expect(dbCalls.insert).toHaveLength(0);
  });

  it('falls back to localhost host when no host header is set', async () => {
    // Build a header bag whose `get` returns null for everything
    headersMock.mockResolvedValue({ get: () => null });
    authMock.mockResolvedValue(null); // shortcut: redirects to error
    const res = await googleCallbackRoute.GET(makeReq({ code: 'c' }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(
      'https://localhost:3000/portal/tools/booking?google=error',
    );
  });
});

// ===========================================================================
// POST /api/portal/tools/booking/google/disconnect
// ===========================================================================

describe('POST /api/portal/tools/booking/google/disconnect', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await googleDisconnectRoute.POST();
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when portal client lookup fails', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await googleDisconnectRoute.POST();
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('deletes the token row and redirects to disconnected', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    headersMock.mockResolvedValue(fakeHeaders('app.test', 'https'));

    const res = await googleDisconnectRoute.POST();
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(
      'https://app.test/portal/tools/booking?google=disconnected',
    );
    expect(dbCalls.delete).toEqual([{ table: 'googleCalendarTokens' }]);
  });

  it('falls back to localhost when no host header is present', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    headersMock.mockResolvedValue({ get: () => null });
    const res = await googleDisconnectRoute.POST();
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(
      'https://localhost:3000/portal/tools/booking?google=disconnected',
    );
  });
});

// ===========================================================================
// /api/portal/tools/booking/quotes/[quoteId]  (GET / PUT / DELETE)
// ===========================================================================

describe('GET /api/portal/tools/booking/quotes/[quoteId]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await quotesIdRoute.GET(
      new Request('http://x'),
      quoteParams('5'),
    );
    expect(res.status).toBe(401);
  });

  it('returns the authorize error response when authorization fails', async () => {
    authMock.mockResolvedValue(SESSION);
    const denied = new Response('nope', { status: 403 });
    authorizePortalMock.mockResolvedValue({ response: denied });
    const res = await quotesIdRoute.GET(
      new Request('http://x'),
      quoteParams('5'),
    );
    expect(res).toBe(denied);
  });

  it('returns 404 when portal client lookup fails', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue(null);
    const res = await quotesIdRoute.GET(
      new Request('http://x'),
      quoteParams('5'),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns 404 when the quote does not exist for the client', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // resolveQuote -> [] -> null
    const res = await quotesIdRoute.GET(
      new Request('http://x'),
      quoteParams('5'),
    );
    expect(res.status).toBe(404);
  });

  it('returns the quote when found', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 5, clientId: 33, title: 'Hello' }]);
    const res = await quotesIdRoute.GET(
      new Request('http://x'),
      quoteParams('5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(5);
  });
});

describe('PUT /api/portal/tools/booking/quotes/[quoteId]', () => {
  function jsonReq(body: unknown): Request {
    return new Request('http://x', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await quotesIdRoute.PUT(jsonReq({}), quoteParams('5'));
    expect(res.status).toBe(401);
  });

  it('returns the authorize error response when authorization fails', async () => {
    authMock.mockResolvedValue(SESSION);
    const denied = new Response('nope', { status: 403 });
    authorizePortalMock.mockResolvedValue({ response: denied });
    const res = await quotesIdRoute.PUT(jsonReq({}), quoteParams('5'));
    expect(res).toBe(denied);
  });

  it('returns 404 when the quote is not found', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]);
    const res = await quotesIdRoute.PUT(jsonReq({}), quoteParams('5'));
    expect(res.status).toBe(404);
  });

  it('updates only the fields provided in the body', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 5, clientId: 33, title: 'Old' }]);
    returningQueue.push([{ id: 5, clientId: 33, title: 'New', price: 4200 }]);

    const res = await quotesIdRoute.PUT(
      jsonReq({ title: 'New', price: '4200', description: 'd' }),
      quoteParams('5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('New');
    expect(dbCalls.update).toHaveLength(1);
    const set = dbCalls.update[0].set;
    expect(set.title).toBe('New');
    expect(set.price).toBe(4200);
    expect(set.description).toBe('d');
    // Fields not in the body should not be present in the set object
    expect(Object.prototype.hasOwnProperty.call(set, 'customerName')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(set, 'startTime')).toBe(false);
  });

  it('handles every supported field including date parsing and null fall-throughs', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 5, clientId: 33 }]);
    returningQueue.push([{ id: 5 }]);

    const res = await quotesIdRoute.PUT(
      jsonReq({
        title: 't',
        description: 'd',
        price: 100,
        customerName: 'Ana',
        customerEmail: 'a@x.test',
        customerPhone: '555',
        lineItems: [{ name: 'x' }],
        startTime: '2026-01-01T00:00:00Z',
        endTime: null,
        status: 'accepted',
        expiresAt: '2026-02-01T00:00:00Z',
      }),
      quoteParams('5'),
    );
    expect(res.status).toBe(200);
    const set = dbCalls.update[0].set;
    expect(set.customerName).toBe('Ana');
    expect(set.lineItems).toEqual([{ name: 'x' }]);
    expect(set.startTime).toBeInstanceOf(Date);
    expect(set.endTime).toBeNull();
    expect(set.expiresAt).toBeInstanceOf(Date);
    expect(set.status).toBe('accepted');
  });
});

describe('DELETE /api/portal/tools/booking/quotes/[quoteId]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await quotesIdRoute.DELETE(
      new Request('http://x', { method: 'DELETE' }),
      quoteParams('5'),
    );
    expect(res.status).toBe(401);
  });

  it('returns the authorize error response when authorization fails', async () => {
    authMock.mockResolvedValue(SESSION);
    const denied = new Response('nope', { status: 403 });
    authorizePortalMock.mockResolvedValue({ response: denied });
    const res = await quotesIdRoute.DELETE(
      new Request('http://x', { method: 'DELETE' }),
      quoteParams('5'),
    );
    expect(res).toBe(denied);
  });

  it('returns 404 when the quote is not found', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]);
    const res = await quotesIdRoute.DELETE(
      new Request('http://x', { method: 'DELETE' }),
      quoteParams('5'),
    );
    expect(res.status).toBe(404);
  });

  it('deletes the quote when found', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 5, clientId: 33 }]);
    const res = await quotesIdRoute.DELETE(
      new Request('http://x', { method: 'DELETE' }),
      quoteParams('5'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(dbCalls.delete).toEqual([{ table: 'bookingQuotes' }]);
  });
});

// ===========================================================================
// /api/portal/tools/booking/quotes  (GET / POST)
// ===========================================================================

describe('GET /api/portal/tools/booking/quotes', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await quotesRoute.GET(new Request('http://x'));
    expect(res.status).toBe(401);
  });

  it('returns the authorize error response when authorization fails', async () => {
    authMock.mockResolvedValue(SESSION);
    const denied = new Response('nope', { status: 403 });
    authorizePortalMock.mockResolvedValue({ response: denied });
    const res = await quotesRoute.GET(new Request('http://x'));
    expect(res).toBe(denied);
  });

  it('returns 401 when portal client lookup fails', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue(null);
    const res = await quotesRoute.GET(new Request('http://x'));
    expect(res.status).toBe(401);
  });

  it('returns the list of quotes for the client', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([
      { id: 1, clientId: 33, title: 'A' },
      { id: 2, clientId: 33, title: 'B' },
    ]);
    const res = await quotesRoute.GET(new Request('http://x'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].id).toBe(1);
  });
});

describe('POST /api/portal/tools/booking/quotes', () => {
  function jsonReq(body: unknown): Request {
    return new Request('http://x', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  const validBody = {
    title: 'Quote',
    price: 1000,
    customerName: 'Ana',
    customerEmail: 'a@x.test',
  };

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await quotesRoute.POST(jsonReq(validBody));
    expect(res.status).toBe(401);
  });

  it('returns the authorize error response when authorization fails', async () => {
    authMock.mockResolvedValue(SESSION);
    const denied = new Response('nope', { status: 403 });
    authorizePortalMock.mockResolvedValue({ response: denied });
    const res = await quotesRoute.POST(jsonReq(validBody));
    expect(res).toBe(denied);
  });

  it('returns 401 when portal client lookup fails', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue(null);
    const res = await quotesRoute.POST(jsonReq(validBody));
    expect(res.status).toBe(401);
  });

  it('returns 400 when title is missing or blank', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await quotesRoute.POST(jsonReq({ ...validBody, title: '   ' }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain('required');
  });

  it('returns 400 when price is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await quotesRoute.POST(
      jsonReq({ ...validBody, price: undefined }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when customerName is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await quotesRoute.POST(
      jsonReq({ ...validBody, customerName: '' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when customerEmail is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await quotesRoute.POST(
      jsonReq({ ...validBody, customerEmail: '' }),
    );
    expect(res.status).toBe(400);
  });

  it('inserts a new quote and returns 201 with the created row', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    returningQueue.push([
      { id: 99, slug: 'quote-abcdef12', title: 'Quote', price: 1000 },
    ]);
    const res = await quotesRoute.POST(
      jsonReq({
        title: '  Quote  ',
        description: '  desc  ',
        price: '1000',
        customerName: ' Ana ',
        customerEmail: ' a@x.test ',
        customerPhone: ' 555 ',
        lineItems: [{ x: 1 }],
        bookingPageId: 7,
        startTime: '2026-01-01T00:00:00Z',
        endTime: '2026-01-02T00:00:00Z',
        expiresAt: '2026-02-01T00:00:00Z',
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(99);
    expect(dbCalls.insert).toHaveLength(1);
    const values = dbCalls.insert[0].values;
    expect(values.clientId).toBe(33);
    expect(values.title).toBe('Quote');
    expect(values.description).toBe('desc');
    expect(values.customerName).toBe('Ana');
    expect(values.customerEmail).toBe('a@x.test');
    expect(values.customerPhone).toBe('555');
    expect(values.price).toBe(1000);
    expect(values.bookingPageId).toBe(7);
    expect(values.lineItems).toEqual([{ x: 1 }]);
    expect(values.startTime).toBeInstanceOf(Date);
    expect(values.endTime).toBeInstanceOf(Date);
    expect(values.expiresAt).toBeInstanceOf(Date);
    expect(typeof values.slug).toBe('string');
    expect((values.slug as string).startsWith('quote-')).toBe(true);
  });

  it('falls back to null/empty values when optional fields are absent', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    returningQueue.push([{ id: 100 }]);

    const res = await quotesRoute.POST(jsonReq(validBody));
    expect(res.status).toBe(201);
    const values = dbCalls.insert[0].values;
    expect(values.bookingPageId).toBeNull();
    expect(values.description).toBeNull();
    expect(values.customerPhone).toBeNull();
    expect(values.lineItems).toEqual([]);
    expect(values.startTime).toBeNull();
    expect(values.endTime).toBeNull();
    expect(values.expiresAt).toBeNull();
  });
});
