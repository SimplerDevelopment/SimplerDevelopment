// @vitest-environment node
/**
 * Batch 33c — unit tests for 4 portal booking + zoom OAuth route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/tools/booking/route.ts                       (GET, POST)
 *  - app/api/portal/tools/booking/zoom/auth/route.ts             (GET)
 *  - app/api/portal/tools/booking/zoom/callback/route.ts         (GET)
 *  - app/api/portal/tools/booking/zoom/disconnect/route.ts       (POST)
 *
 * Strategy: heavy mocking — db.select() is a queue of result rows; chain
 * methods return a thenable that materializes on `await` (or terminal
 * .limit / .orderBy / .offset). db.insert/update are mocked to capture
 * writes. auth, getPortalClient, authorizePortal, isAuthError, emitEvent,
 * exchangeZoomCode, revokeZoomTokens, and next/headers are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — declared before any route is imported.
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
const isAuthErrorMock = vi.fn((r: unknown) =>
  Boolean(r && typeof r === 'object' && 'response' in (r as Record<string, unknown>)),
);
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (r: unknown) => isAuthErrorMock(r),
}));

const emitEventMock = vi.fn();
vi.mock('@/lib/automation', () => ({
  emitEvent: (...args: unknown[]) => emitEventMock(...args),
}));

const exchangeZoomCodeMock = vi.fn();
const revokeZoomTokensMock = vi.fn();
vi.mock('@/lib/zoom', () => ({
  exchangeZoomCode: (...args: unknown[]) => exchangeZoomCodeMock(...args),
  revokeZoomTokens: (...args: unknown[]) => revokeZoomTokensMock(...args),
}));

// next/headers — host + proto come from here.
const headersMap = new Map<string, string>();
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (k: string) => headersMap.get(k.toLowerCase()) ?? null,
  }),
}));

// drizzle-orm operators — inert objects
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
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
}));

// schema — proxy tables
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
  return {
    bookingPages: wrap('bookingPages'),
    zoomTokens: wrap('zoomTokens'),
  };
});

// ---------------------------------------------------------------------------
// db mock: select-queue + write capture
// ---------------------------------------------------------------------------

interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
  onConflictDoNothing?: boolean;
}
interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
  returnedRows: Array<Record<string, unknown>>;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
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
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'groupBy', 'limit', 'offset']) {
      chain[m] = passthrough;
    }
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
      return materialize().then(onF, onR);
    };
    return chain;
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            const rows = updateReturnQueue.shift() ?? [];
            const cloned = rows.map((r) => ({ ...r }));
            updateCalls.push({ table: table.__table, patch, filter, returnedRows: cloned });
            return {
              returning() {
                return Promise.resolve(cloned);
              },
              then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                return Promise.resolve(cloned).then(onF, onR);
              },
            };
          },
        };
      },
    };
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        const call: InsertCall = { table: table.__table, values: v };
        insertCalls.push(call);
        const rows = insertReturnQueue.shift() ?? [];
        const cloned = rows.map((r) => ({ ...r }));
        const tail = {
          returning() {
            return Promise.resolve(cloned);
          },
          then(onF: (val: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(cloned).then(onF, onR);
          },
        };
        return {
          ...tail,
          onConflictDoNothing() {
            call.onConflictDoNothing = true;
            return tail;
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
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Routes under test (imported AFTER all mocks).
// ---------------------------------------------------------------------------

const bookingRoute = await import('@/app/api/portal/tools/booking/route');
const zoomAuthRoute = await import('@/app/api/portal/tools/booking/zoom/auth/route');
const zoomCallbackRoute = await import('@/app/api/portal/tools/booking/zoom/callback/route');
const zoomDisconnectRoute = await import('@/app/api/portal/tools/booking/zoom/disconnect/route');

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

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

import { NextResponse } from 'next/server';

const SESSION = { user: { id: '7' } };

function setOk(client = { id: 5 }) {
  authorizePortalMock.mockResolvedValue({ client, userId: 7, role: 'owner' });
  authMock.mockResolvedValue(SESSION);
  getPortalClientMock.mockResolvedValue(client);
}

function setAuthFail(status = 401) {
  const response = NextResponse.json({ success: false, message: 'Unauthorized' }, { status });
  authorizePortalMock.mockResolvedValue({ response });
}

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  updateReturnQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  headersMap.clear();
  authMock.mockReset();
  getPortalClientMock.mockReset();
  authorizePortalMock.mockReset();
  emitEventMock.mockReset();
  exchangeZoomCodeMock.mockReset();
  revokeZoomTokensMock.mockReset();
});

// ===========================================================================
// GET /api/portal/tools/booking
// ===========================================================================

describe('GET /api/portal/tools/booking', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await bookingRoute.GET();
    expect(res.status).toBe(401);
    expect((await res.json()).message).toMatch(/unauthorized/i);
  });

  it('returns the auth error from authorizePortal', async () => {
    authMock.mockResolvedValue(SESSION);
    setAuthFail(403);
    const res = await bookingRoute.GET();
    expect(res.status).toBe(403);
    // authorizePortal was asked specifically for booking service / read
    expect(authorizePortalMock.mock.calls[0][0]).toEqual({
      action: 'read',
      requireService: 'booking',
    });
  });

  it('returns 404 when the portal client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    getPortalClientMock.mockResolvedValue(null);
    const res = await bookingRoute.GET();
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/client not found/i);
  });

  it('returns the booking pages for this client', async () => {
    setOk();
    selectQueue.push([
      { id: 1, clientId: 5, title: 'A', slug: 'a' },
      { id: 2, clientId: 5, title: 'B', slug: 'b' },
    ]);
    const res = await bookingRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].id).toBe(1);
  });

  it('returns an empty list when no pages exist', async () => {
    setOk();
    selectQueue.push([]);
    const res = await bookingRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

// ===========================================================================
// POST /api/portal/tools/booking
// ===========================================================================

describe('POST /api/portal/tools/booking', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await bookingRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking', 'POST', { title: 'X' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns the auth error from authorizePortal', async () => {
    authMock.mockResolvedValue(SESSION);
    setAuthFail(403);
    const res = await bookingRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking', 'POST', { title: 'X' }),
    );
    expect(res.status).toBe(403);
    expect(authorizePortalMock.mock.calls[0][0]).toEqual({
      action: 'write',
      requireService: 'booking',
    });
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    getPortalClientMock.mockResolvedValue(null);
    const res = await bookingRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking', 'POST', { title: 'X' }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/client not found/i);
  });

  it('returns 400 when title is missing', async () => {
    setOk();
    const res = await bookingRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking', 'POST', {}),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/title is required/i);
  });

  it('returns 400 when title is only whitespace', async () => {
    setOk();
    const res = await bookingRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking', 'POST', { title: '   ' }),
    );
    expect(res.status).toBe(400);
  });

  it('creates a booking page with slug derived from title + defaults', async () => {
    setOk();
    insertReturnQueue.push([
      {
        id: 42,
        clientId: 5,
        title: 'My Cool Page',
        slug: 'my-cool-page-xxx',
        description: null,
        duration: 30,
        timezone: 'America/New_York',
      },
    ]);
    const res = await bookingRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking', 'POST', { title: 'My Cool Page!  ' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(42);

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('bookingPages');
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.clientId).toBe(5);
    expect(v.title).toBe('My Cool Page!');
    expect(typeof v.slug).toBe('string');
    expect(v.slug as string).toMatch(/^my-cool-page-[a-z0-9]+$/);
    expect(v.description).toBeNull();
    expect(v.duration).toBe(30);
    expect(v.timezone).toBe('America/New_York');
    expect(v.createdBy).toBe(7);

    expect(emitEventMock).toHaveBeenCalledTimes(1);
    expect(emitEventMock.mock.calls[0][0]).toBe('booking.created');
    expect(emitEventMock.mock.calls[0][1]).toBe(5);
    expect(emitEventMock.mock.calls[0][2]).toBe(7);
  });

  it('uses provided description / duration / timezone', async () => {
    setOk();
    insertReturnQueue.push([
      {
        id: 43,
        clientId: 5,
        title: 'Demo',
        slug: 'demo-yyy',
        description: 'desc',
        duration: 60,
        timezone: 'Europe/London',
      },
    ]);
    const res = await bookingRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking', 'POST', {
        title: 'Demo',
        description: '  desc  ',
        duration: 60,
        timezone: 'Europe/London',
      }),
    );
    expect(res.status).toBe(200);
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.description).toBe('desc');
    expect(v.duration).toBe(60);
    expect(v.timezone).toBe('Europe/London');
  });

  it('normalises non-alphanumeric chars in the slug and lowercases', async () => {
    setOk();
    insertReturnQueue.push([{ id: 44, title: '@@!! Foo  Bar', slug: 'foo-bar-z' }]);
    const res = await bookingRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking', 'POST', { title: '@@!! Foo  Bar @@' }),
    );
    expect(res.status).toBe(200);
    const v = insertCalls[0].values as Record<string, unknown>;
    // leading/trailing dashes removed, internal collapsed
    expect(v.slug as string).toMatch(/^foo-bar-[a-z0-9]+$/);
  });
});

// ===========================================================================
// GET /api/portal/tools/booking/zoom/auth
// ===========================================================================

describe('GET /api/portal/tools/booking/zoom/auth', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await zoomAuthRoute.GET();
    expect(res.status).toBe(401);
    expect((await res.json()).message).toMatch(/unauthorized/i);
  });

  it('returns 404 when portal client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await zoomAuthRoute.GET();
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/client not found/i);
  });

  it('redirects to Zoom OAuth with the proper params (https + host)', async () => {
    process.env.ZOOM_CLIENT_ID = 'zc-id-abc';
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    headersMap.set('host', 'app.example.com');
    headersMap.set('x-forwarded-proto', 'https');

    const res = await zoomAuthRoute.GET();
    // NextResponse.redirect → 307
    expect([302, 303, 307]).toContain(res.status);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('https://zoom.us/oauth/authorize');
    expect(location).toContain('response_type=code');
    expect(location).toContain('client_id=zc-id-abc');
    expect(location).toContain(
      encodeURIComponent('https://app.example.com/api/portal/tools/booking/zoom/callback'),
    );
  });

  it('falls back to https + localhost:3000 when headers are absent', async () => {
    process.env.ZOOM_CLIENT_ID = 'zc-fallback';
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    // headersMap is empty
    const res = await zoomAuthRoute.GET();
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('client_id=zc-fallback');
    expect(location).toContain(
      encodeURIComponent('https://localhost:3000/api/portal/tools/booking/zoom/callback'),
    );
  });
});

// ===========================================================================
// GET /api/portal/tools/booking/zoom/callback
// ===========================================================================

describe('GET /api/portal/tools/booking/zoom/callback', () => {
  it('redirects to ?zoom=error when there is no session', async () => {
    authMock.mockResolvedValue(null);
    headersMap.set('host', 'app.example.com');
    headersMap.set('x-forwarded-proto', 'https');
    const res = await zoomCallbackRoute.GET(
      makeReq('http://x/api/portal/tools/booking/zoom/callback?code=abc'),
    );
    expect([302, 303, 307]).toContain(res.status);
    expect(res.headers.get('location')).toBe(
      'https://app.example.com/portal/tools/booking?zoom=error',
    );
  });

  it('redirects to ?zoom=error when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    headersMap.set('host', 'app.example.com');
    headersMap.set('x-forwarded-proto', 'https');
    const res = await zoomCallbackRoute.GET(
      makeReq('http://x/api/portal/tools/booking/zoom/callback?code=abc'),
    );
    expect(res.headers.get('location')).toBe(
      'https://app.example.com/portal/tools/booking?zoom=error',
    );
  });

  it('redirects to ?zoom=error when code is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    headersMap.set('host', 'app.example.com');
    headersMap.set('x-forwarded-proto', 'https');
    const res = await zoomCallbackRoute.GET(
      makeReq('http://x/api/portal/tools/booking/zoom/callback'),
    );
    expect(res.headers.get('location')).toBe(
      'https://app.example.com/portal/tools/booking?zoom=error',
    );
  });

  it('redirects to ?zoom=error when exchangeZoomCode returns null', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    headersMap.set('host', 'app.example.com');
    headersMap.set('x-forwarded-proto', 'https');
    exchangeZoomCodeMock.mockResolvedValue(null);
    const res = await zoomCallbackRoute.GET(
      makeReq('http://x/api/portal/tools/booking/zoom/callback?code=abc'),
    );
    expect(res.headers.get('location')).toBe(
      'https://app.example.com/portal/tools/booking?zoom=error',
    );
  });

  it('redirects to ?zoom=error when exchangeZoomCode throws', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    headersMap.set('host', 'app.example.com');
    headersMap.set('x-forwarded-proto', 'https');
    exchangeZoomCodeMock.mockRejectedValue(new Error('zoom down'));
    const res = await zoomCallbackRoute.GET(
      makeReq('http://x/api/portal/tools/booking/zoom/callback?code=abc'),
    );
    expect(res.headers.get('location')).toBe(
      'https://app.example.com/portal/tools/booking?zoom=error',
    );
  });

  it('inserts new zoom tokens when none exist for the client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    headersMap.set('host', 'app.example.com');
    headersMap.set('x-forwarded-proto', 'https');
    exchangeZoomCodeMock.mockResolvedValue({
      accessToken: 'AT',
      refreshToken: 'RT',
      expiresIn: 3600,
    });
    selectQueue.push([]); // no existing token row

    const res = await zoomCallbackRoute.GET(
      makeReq('http://x/api/portal/tools/booking/zoom/callback?code=abc'),
    );
    expect(res.headers.get('location')).toBe(
      'https://app.example.com/portal/tools/booking?zoom=connected',
    );
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('zoomTokens');
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.clientId).toBe(5);
    expect(v.accessToken).toBe('AT');
    expect(v.refreshToken).toBe('RT');
    expect(v.expiresAt).toBeInstanceOf(Date);

    // exchangeZoomCode received the redirect URI built from headers
    expect(exchangeZoomCodeMock).toHaveBeenCalledWith(
      'abc',
      'https://app.example.com/api/portal/tools/booking/zoom/callback',
    );

    expect(updateCalls).toHaveLength(0);
  });

  it('updates existing zoom tokens when a row already exists', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    headersMap.set('host', 'app.example.com');
    headersMap.set('x-forwarded-proto', 'https');
    exchangeZoomCodeMock.mockResolvedValue({
      accessToken: 'AT2',
      refreshToken: 'RT2',
      expiresIn: 7200,
    });
    selectQueue.push([{ id: 999 }]); // existing row

    const res = await zoomCallbackRoute.GET(
      makeReq('http://x/api/portal/tools/booking/zoom/callback?code=xyz'),
    );
    expect(res.headers.get('location')).toBe(
      'https://app.example.com/portal/tools/booking?zoom=connected',
    );
    expect(insertCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('zoomTokens');
    expect(updateCalls[0].patch.accessToken).toBe('AT2');
    expect(updateCalls[0].patch.refreshToken).toBe('RT2');
    expect(updateCalls[0].patch.expiresAt).toBeInstanceOf(Date);
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
  });

  it('falls back to https://localhost:3000 when host headers are absent', async () => {
    authMock.mockResolvedValue(null);
    // no headers set → fallback values
    const res = await zoomCallbackRoute.GET(
      makeReq('http://x/api/portal/tools/booking/zoom/callback?code=abc'),
    );
    expect(res.headers.get('location')).toBe(
      'https://localhost:3000/portal/tools/booking?zoom=error',
    );
  });
});

// ===========================================================================
// POST /api/portal/tools/booking/zoom/disconnect
// ===========================================================================

describe('POST /api/portal/tools/booking/zoom/disconnect', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await zoomDisconnectRoute.POST();
    expect(res.status).toBe(401);
    expect((await res.json()).message).toMatch(/unauthorized/i);
    expect(revokeZoomTokensMock).not.toHaveBeenCalled();
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await zoomDisconnectRoute.POST();
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/client not found/i);
    expect(revokeZoomTokensMock).not.toHaveBeenCalled();
  });

  it('revokes tokens and redirects to ?zoom=disconnected with host headers', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    headersMap.set('host', 'app.example.com');
    headersMap.set('x-forwarded-proto', 'https');
    revokeZoomTokensMock.mockResolvedValue(undefined);

    const res = await zoomDisconnectRoute.POST();
    expect([302, 303, 307]).toContain(res.status);
    expect(res.headers.get('location')).toBe(
      'https://app.example.com/portal/tools/booking?zoom=disconnected',
    );
    expect(revokeZoomTokensMock).toHaveBeenCalledWith(5);
  });

  it('falls back to https://localhost:3000 when headers absent', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    revokeZoomTokensMock.mockResolvedValue(undefined);

    const res = await zoomDisconnectRoute.POST();
    expect(res.headers.get('location')).toBe(
      'https://localhost:3000/portal/tools/booking?zoom=disconnected',
    );
  });
});
