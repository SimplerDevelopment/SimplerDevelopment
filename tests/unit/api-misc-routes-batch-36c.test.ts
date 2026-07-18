// @vitest-environment node
/**
 * Unit tests for four booking API routes (batch 36c):
 *   - app/api/portal/tools/booking/[id]/date-overrides/[overrideId]/route.ts  (PUT, DELETE)
 *   - app/api/portal/tools/booking/[id]/date-overrides/route.ts               (GET, POST)
 *   - app/api/portal/tools/booking/[id]/route.ts                              (GET, PUT, DELETE)
 *   - app/api/portal/tools/booking/[id]/waivers/route.ts                      (GET)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

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
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (r: unknown) =>
    typeof r === 'object' && r !== null && 'response' in (r as Record<string, unknown>),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  gte: (a: unknown, b: unknown) => ({ op: 'gte', a, b }),
  lte: (a: unknown, b: unknown) => ({ op: 'lte', a, b }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings: Array.from(strings),
      values,
    }),
    {
      raw: (s: string) => ({ op: 'sql.raw', value: s }),
    },
  ),
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
    bookingPages: wrap('booking_pages'),
    bookingDateOverrides: wrap('booking_date_overrides'),
    bookingWaivers: wrap('booking_waivers'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// DB mock: thenable select / update / delete / insert chains
// ---------------------------------------------------------------------------

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturningQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturningQueue: Array<Array<Record<string, unknown>>> = [];
const updateCalls: Array<{
  table: string;
  setValues: Record<string, unknown>;
  whereArg: unknown;
  returning: boolean;
}> = [];
const insertCalls: Array<{
  table: string;
  values: Record<string, unknown> | Array<Record<string, unknown>>;
  returning: boolean;
}> = [];
const deleteCalls: Array<{ table: string; whereArg: unknown }> = [];

function shiftNext(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}
function shiftUpdateReturning(): Array<Record<string, unknown>> {
  return updateReturningQueue.shift() ?? [];
}
function shiftInsertReturning(): Array<Record<string, unknown>> {
  return insertReturningQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) materializedPromise = Promise.resolve(shiftNext());
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'groupBy']) {
      chain[m] = passthrough;
    }
    const terminalChain = () => {
      materialize();
      const term: Record<string, unknown> = {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
        limit: () => term,
        offset: () => term,
      };
      return term;
    };
    chain.limit = terminalChain;
    chain.offset = terminalChain;
    chain.orderBy = terminalChain;
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  function buildUpdate(tableRef: unknown) {
    const tableName =
      (tableRef as { __table?: string } | null | undefined)?.__table ?? 'unknown';
    let stagedValues: Record<string, unknown> = {};
    let stagedWhere: unknown = undefined;

    function makeReturning() {
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          updateCalls.push({
            table: tableName,
            setValues: stagedValues,
            whereArg: stagedWhere,
            returning: true,
          });
          return Promise.resolve(shiftUpdateReturning()).then(onF, onR);
        },
      };
    }

    const chain: Record<string, unknown> = {
      set(v: Record<string, unknown>) {
        stagedValues = v;
        return chain;
      },
      where(arg: unknown) {
        stagedWhere = arg;
        return {
          returning: (_cols?: unknown) => makeReturning(),
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            updateCalls.push({
              table: tableName,
              setValues: stagedValues,
              whereArg: stagedWhere,
              returning: false,
            });
            return Promise.resolve().then(onF, onR);
          },
        };
      },
    };
    return chain;
  }

  function buildDelete(tableRef: unknown) {
    const tableName =
      (tableRef as { __table?: string } | null | undefined)?.__table ?? 'unknown';
    return {
      where(arg: unknown) {
        deleteCalls.push({ table: tableName, whereArg: arg });
        return Promise.resolve();
      },
    };
  }

  function buildInsert(tableRef: unknown) {
    const tableName =
      (tableRef as { __table?: string } | null | undefined)?.__table ?? 'unknown';
    let stagedValues: Record<string, unknown> | Array<Record<string, unknown>> = {};
    return {
      values(v: Record<string, unknown> | Array<Record<string, unknown>>) {
        stagedValues = v;
        return {
          returning: (_cols?: unknown) => ({
            then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
              insertCalls.push({
                table: tableName,
                values: stagedValues,
                returning: true,
              });
              return Promise.resolve(shiftInsertReturning()).then(onF, onR);
            },
          }),
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            insertCalls.push({
              table: tableName,
              values: stagedValues,
              returning: false,
            });
            return Promise.resolve().then(onF, onR);
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
      update(tableRef: unknown) {
        return buildUpdate(tableRef);
      },
      delete(tableRef: unknown) {
        return buildDelete(tableRef);
      },
      insert(tableRef: unknown) {
        return buildInsert(tableRef);
      },
    },
  };
});

// ---- modules under test ----
const overrideByIdRoute = await import(
  '@/app/api/portal/tools/booking/[id]/date-overrides/[overrideId]/route'
);
const overridesRoute = await import(
  '@/app/api/portal/tools/booking/[id]/date-overrides/route'
);
const bookingPageRoute = await import('@/app/api/portal/tools/booking/[id]/route');
const waiversRoute = await import('@/app/api/portal/tools/booking/[id]/waivers/route');

// ---- helpers ----
const SESSION = { user: { id: '7' } };

function paramsP(id: string) {
  return { params: Promise.resolve({ id }) };
}
function paramsPP(id: string, overrideId: string) {
  return { params: Promise.resolve({ id, overrideId }) };
}
function jsonReq(url: string, body: unknown, method = 'POST'): Request {
  return new Request(url, {
    method,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

beforeEach(() => {
  selectQueue = [];
  updateReturningQueue = [];
  insertReturningQueue = [];
  updateCalls.length = 0;
  insertCalls.length = 0;
  deleteCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  authorizePortalMock.mockReset();
  // Default: portal auth grants access
  authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'admin' });
});

// ===========================================================================
// PUT /api/portal/tools/booking/[id]/date-overrides/[overrideId]
// ===========================================================================

describe('PUT /api/portal/tools/booking/[id]/date-overrides/[overrideId]', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await overrideByIdRoute.PUT(
      jsonReq('http://x/api/portal/tools/booking/1/date-overrides/5', {}, 'PUT'),
      paramsPP('1', '5'),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await overrideByIdRoute.PUT(
      jsonReq('http://x/api/portal/tools/booking/1/date-overrides/5', {}, 'PUT'),
      paramsPP('1', '5'),
    );
    expect(res.status).toBe(401);
  });

  it('returns the auth-error response from authorizePortal', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({
      response: NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 }),
    });
    const res = await overrideByIdRoute.PUT(
      jsonReq('http://x/api/portal/tools/booking/1/date-overrides/5', {}, 'PUT'),
      paramsPP('1', '5'),
    );
    expect(res.status).toBe(403);
  });

  it('returns 404 when portal client is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await overrideByIdRoute.PUT(
      jsonReq('http://x/api/portal/tools/booking/1/date-overrides/5', {}, 'PUT'),
      paramsPP('1', '5'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when the booking page does not belong to the client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // booking page lookup miss
    const res = await overrideByIdRoute.PUT(
      jsonReq('http://x/api/portal/tools/booking/1/date-overrides/5', {}, 'PUT'),
      paramsPP('1', '5'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when the override does not exist', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1 }]); // page found
    selectQueue.push([]); // override miss
    const res = await overrideByIdRoute.PUT(
      jsonReq('http://x/api/portal/tools/booking/1/date-overrides/5', {}, 'PUT'),
      paramsPP('1', '5'),
    );
    expect(res.status).toBe(404);
  });

  it('updates only the fields provided in the body and returns the updated row', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1 }]); // page
    selectQueue.push([{ id: 5, bookingPageId: 1 }]); // override
    updateReturningQueue.push([
      { id: 5, date: '2026-06-01', type: 'available' },
    ]);

    const res = await overrideByIdRoute.PUT(
      jsonReq(
        'http://x/api/portal/tools/booking/1/date-overrides/5',
        {
          date: '2026-06-01',
          type: 'available',
          startTime: '09:00',
          endTime: '17:00',
          note: 'special hours',
        },
        'PUT',
      ),
      paramsPP('1', '5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(5);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('booking_date_overrides');
    expect(updateCalls[0].setValues).toEqual({
      date: '2026-06-01',
      type: 'available',
      startTime: '09:00',
      endTime: '17:00',
      note: 'special hours',
    });
    expect(updateCalls[0].returning).toBe(true);
  });

  it('passes an empty set when body has no recognised fields', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 5 }]);
    updateReturningQueue.push([{ id: 5 }]);

    const res = await overrideByIdRoute.PUT(
      jsonReq('http://x/api/portal/tools/booking/1/date-overrides/5', { foo: 'bar' }, 'PUT'),
      paramsPP('1', '5'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].setValues).toEqual({});
  });
});

// ===========================================================================
// DELETE /api/portal/tools/booking/[id]/date-overrides/[overrideId]
// ===========================================================================

describe('DELETE /api/portal/tools/booking/[id]/date-overrides/[overrideId]', () => {
  function delReq() {
    return new Request('http://x/api/portal/tools/booking/1/date-overrides/5', {
      method: 'DELETE',
    });
  }

  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await overrideByIdRoute.DELETE(delReq(), paramsPP('1', '5'));
    expect(res.status).toBe(401);
  });

  it('returns the auth-error response from authorizePortal', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({
      response: NextResponse.json({ success: false }, { status: 403 }),
    });
    const res = await overrideByIdRoute.DELETE(delReq(), paramsPP('1', '5'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when override cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1 }]); // page
    selectQueue.push([]); // override miss
    const res = await overrideByIdRoute.DELETE(delReq(), paramsPP('1', '5'));
    expect(res.status).toBe(404);
  });

  it('deletes the override and returns success', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 5 }]);
    const res = await overrideByIdRoute.DELETE(delReq(), paramsPP('1', '5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('booking_date_overrides');
  });
});

// ===========================================================================
// GET /api/portal/tools/booking/[id]/date-overrides
// ===========================================================================

describe('GET /api/portal/tools/booking/[id]/date-overrides', () => {
  function getReq() {
    return new Request('http://x/api/portal/tools/booking/1/date-overrides');
  }

  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await overridesRoute.GET(getReq(), paramsP('1'));
    expect(res.status).toBe(401);
  });

  it('returns the auth-error response from authorizePortal', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({
      response: NextResponse.json({ success: false }, { status: 403 }),
    });
    const res = await overridesRoute.GET(getReq(), paramsP('1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await overridesRoute.GET(getReq(), paramsP('1'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when the booking page is not found for the client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // page miss
    const res = await overridesRoute.GET(getReq(), paramsP('1'));
    expect(res.status).toBe(404);
  });

  it('returns the list of overrides for the booking page', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    selectQueue.push([
      { id: 10, date: '2026-06-01', type: 'available' },
      { id: 11, date: '2026-06-02', type: 'blocked' },
    ]);
    const res = await overridesRoute.GET(getReq(), paramsP('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].id).toBe(10);
  });
});

// ===========================================================================
// POST /api/portal/tools/booking/[id]/date-overrides
// ===========================================================================

describe('POST /api/portal/tools/booking/[id]/date-overrides', () => {
  function postReq(body: unknown) {
    return jsonReq('http://x/api/portal/tools/booking/1/date-overrides', body);
  }

  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await overridesRoute.POST(postReq({}), paramsP('1'));
    expect(res.status).toBe(401);
  });

  it('returns the auth-error response from authorizePortal', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({
      response: NextResponse.json({ success: false }, { status: 403 }),
    });
    const res = await overridesRoute.POST(postReq({}), paramsP('1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await overridesRoute.POST(postReq({}), paramsP('1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when date and type are missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    const res = await overridesRoute.POST(postReq({}), paramsP('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/date and type/);
  });

  it('returns 400 when type is not "available" or "blocked"', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    const res = await overridesRoute.POST(
      postReq({ date: '2026-06-01', type: 'maybe' }),
      paramsP('1'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/type must be/);
  });

  it('returns 400 when type=available and startTime or endTime are missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    const res = await overridesRoute.POST(
      postReq({ date: '2026-06-01', type: 'available' }),
      paramsP('1'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/startTime and endTime/);
  });

  it('inserts a blocked override successfully', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    insertReturningQueue.push([
      { id: 99, bookingPageId: 1, date: '2026-06-01', type: 'blocked' },
    ]);
    const res = await overridesRoute.POST(
      postReq({ date: '2026-06-01', type: 'blocked', note: 'closed' }),
      paramsP('1'),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(99);

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('booking_date_overrides');
    const values = insertCalls[0].values as Record<string, unknown>;
    expect(values.bookingPageId).toBe(1);
    expect(values.type).toBe('blocked');
    expect(values.startTime).toBeNull();
    expect(values.endTime).toBeNull();
    expect(values.note).toBe('closed');
  });

  it('inserts an available override with start/end times', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    insertReturningQueue.push([
      { id: 100, bookingPageId: 1, date: '2026-06-02', type: 'available' },
    ]);
    const res = await overridesRoute.POST(
      postReq({
        date: '2026-06-02',
        type: 'available',
        startTime: '08:00',
        endTime: '12:00',
      }),
      paramsP('1'),
    );
    expect(res.status).toBe(201);
    const values = insertCalls[0].values as Record<string, unknown>;
    expect(values.startTime).toBe('08:00');
    expect(values.endTime).toBe('12:00');
    expect(values.note).toBeNull();
  });
});

// ===========================================================================
// GET /api/portal/tools/booking/[id]
// ===========================================================================

describe('GET /api/portal/tools/booking/[id]', () => {
  function getReq() {
    return new Request('http://x/api/portal/tools/booking/1');
  }

  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await bookingPageRoute.GET(getReq(), paramsP('1'));
    expect(res.status).toBe(401);
  });

  it('returns the auth-error response from authorizePortal', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({
      response: NextResponse.json({ success: false }, { status: 403 }),
    });
    const res = await bookingPageRoute.GET(getReq(), paramsP('1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await bookingPageRoute.GET(getReq(), paramsP('1'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when booking page not found for client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // page miss
    const res = await bookingPageRoute.GET(getReq(), paramsP('1'));
    expect(res.status).toBe(404);
  });

  it('returns the booking page when found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, title: 'Hello' }]);
    const res = await bookingPageRoute.GET(getReq(), paramsP('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Hello');
  });
});

// ===========================================================================
// PUT /api/portal/tools/booking/[id]
// ===========================================================================

describe('PUT /api/portal/tools/booking/[id]', () => {
  function putReq(body: unknown) {
    return jsonReq('http://x/api/portal/tools/booking/1', body, 'PUT');
  }

  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await bookingPageRoute.PUT(putReq({}), paramsP('1'));
    expect(res.status).toBe(401);
  });

  it('returns the auth-error response from authorizePortal', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({
      response: NextResponse.json({ success: false }, { status: 403 }),
    });
    const res = await bookingPageRoute.PUT(putReq({}), paramsP('1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when booking page not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // page miss
    const res = await bookingPageRoute.PUT(putReq({}), paramsP('1'));
    expect(res.status).toBe(404);
  });

  it('updates only provided fields and trims title/description', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    updateReturningQueue.push([{ id: 1, title: 'Trimmed', duration: 45 }]);

    const res = await bookingPageRoute.PUT(
      putReq({
        title: '  Trimmed  ',
        description: '  desc  ',
        duration: 45,
        bufferBefore: 5,
        active: true,
      }),
      paramsP('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('booking_pages');
    expect(updateCalls[0].setValues.title).toBe('Trimmed');
    expect(updateCalls[0].setValues.description).toBe('desc');
    expect(updateCalls[0].setValues.duration).toBe(45);
    expect(updateCalls[0].setValues.bufferBefore).toBe(5);
    expect(updateCalls[0].setValues.active).toBe(true);
    expect(updateCalls[0].setValues.updatedAt).toBeInstanceOf(Date);
  });

  it('sets description to null when blank/whitespace', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    updateReturningQueue.push([{ id: 1 }]);
    const res = await bookingPageRoute.PUT(putReq({ description: '   ' }), paramsP('1'));
    expect(res.status).toBe(200);
    expect(updateCalls[0].setValues.description).toBeNull();
  });

  it('coerces nullable fields (brandingProfileId, priceLabel, etc.) to null when falsy', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    updateReturningQueue.push([{ id: 1 }]);
    const res = await bookingPageRoute.PUT(
      putReq({
        brandingProfileId: 0,
        priceLabel: '',
        maxGuests: null,
        websiteId: 0,
        waiverContent: '',
        thumbnail: '',
      }),
      paramsP('1'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].setValues.brandingProfileId).toBeNull();
    expect(updateCalls[0].setValues.priceLabel).toBeNull();
    expect(updateCalls[0].setValues.maxGuests).toBeNull();
    expect(updateCalls[0].setValues.websiteId).toBeNull();
    expect(updateCalls[0].setValues.waiverContent).toBeNull();
    expect(updateCalls[0].setValues.thumbnail).toBeNull();
  });

  it('only allows a whitelisted assignmentMode', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    updateReturningQueue.push([{ id: 1 }]);
    const res = await bookingPageRoute.PUT(
      putReq({ assignmentMode: 'bogus' }),
      paramsP('1'),
    );
    expect(res.status).toBe(200);
    // 'bogus' isn't in the whitelist => assignmentMode key isn't set
    expect(updateCalls[0].setValues.assignmentMode).toBeUndefined();
  });

  it('accepts a whitelisted assignmentMode (round_robin)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    updateReturningQueue.push([{ id: 1 }]);
    const res = await bookingPageRoute.PUT(
      putReq({ assignmentMode: 'round_robin' }),
      paramsP('1'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].setValues.assignmentMode).toBe('round_robin');
  });

  it('normalises roundRobinPool: array stays, non-array becomes null', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    updateReturningQueue.push([{ id: 1 }]);
    const res = await bookingPageRoute.PUT(
      putReq({ roundRobinPool: [1, 2, 3] }),
      paramsP('1'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].setValues.roundRobinPool).toEqual([1, 2, 3]);

    // Reset and try again with a non-array
    updateCalls.length = 0;
    selectQueue.push([{ id: 1, clientId: 33 }]);
    updateReturningQueue.push([{ id: 1 }]);
    const res2 = await bookingPageRoute.PUT(
      putReq({ roundRobinPool: 'oops' }),
      paramsP('1'),
    );
    expect(res2.status).toBe(200);
    expect(updateCalls[0].setValues.roundRobinPool).toBeNull();
  });

  it('only allows whitelisted bookingType values', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    updateReturningQueue.push([{ id: 1 }]);
    const res = await bookingPageRoute.PUT(
      putReq({ bookingType: 'group' }),
      paramsP('1'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].setValues.bookingType).toBe('group');

    updateCalls.length = 0;
    selectQueue.push([{ id: 1, clientId: 33 }]);
    updateReturningQueue.push([{ id: 1 }]);
    const res2 = await bookingPageRoute.PUT(
      putReq({ bookingType: 'huge' }),
      paramsP('1'),
    );
    expect(res2.status).toBe(200);
    expect(updateCalls[0].setValues.bookingType).toBeUndefined();
  });

  it('parses groupCapacity: positive int set, null/zero/invalid -> null', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    updateReturningQueue.push([{ id: 1 }]);
    const res = await bookingPageRoute.PUT(
      putReq({ groupCapacity: '12' }),
      paramsP('1'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].setValues.groupCapacity).toBe(12);

    updateCalls.length = 0;
    selectQueue.push([{ id: 1, clientId: 33 }]);
    updateReturningQueue.push([{ id: 1 }]);
    const res2 = await bookingPageRoute.PUT(
      putReq({ groupCapacity: null }),
      paramsP('1'),
    );
    expect(res2.status).toBe(200);
    expect(updateCalls[0].setValues.groupCapacity).toBeNull();

    updateCalls.length = 0;
    selectQueue.push([{ id: 1, clientId: 33 }]);
    updateReturningQueue.push([{ id: 1 }]);
    const res3 = await bookingPageRoute.PUT(
      putReq({ groupCapacity: 'abc' }),
      paramsP('1'),
    );
    expect(res3.status).toBe(200);
    expect(updateCalls[0].setValues.groupCapacity).toBeNull();
  });
});

// ===========================================================================
// DELETE /api/portal/tools/booking/[id]
// ===========================================================================

describe('DELETE /api/portal/tools/booking/[id]', () => {
  function delReq() {
    return new Request('http://x/api/portal/tools/booking/1', { method: 'DELETE' });
  }

  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await bookingPageRoute.DELETE(delReq(), paramsP('1'));
    expect(res.status).toBe(401);
  });

  it('returns the auth-error response from authorizePortal', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({
      response: NextResponse.json({ success: false }, { status: 403 }),
    });
    const res = await bookingPageRoute.DELETE(delReq(), paramsP('1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when the booking page is not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]);
    const res = await bookingPageRoute.DELETE(delReq(), paramsP('1'));
    expect(res.status).toBe(404);
  });

  it('deletes the booking page and returns success', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    const res = await bookingPageRoute.DELETE(delReq(), paramsP('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('booking_pages');
  });
});

// ===========================================================================
// GET /api/portal/tools/booking/[id]/waivers
// ===========================================================================

describe('GET /api/portal/tools/booking/[id]/waivers', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await waiversRoute.GET(
      makeReq('http://x/api/portal/tools/booking/1/waivers'),
      paramsP('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns the auth-error response from authorizePortal', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({
      response: NextResponse.json({ success: false }, { status: 403 }),
    });
    const res = await waiversRoute.GET(
      makeReq('http://x/api/portal/tools/booking/1/waivers'),
      paramsP('1'),
    );
    expect(res.status).toBe(403);
  });

  it('returns 401 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await waiversRoute.GET(
      makeReq('http://x/api/portal/tools/booking/1/waivers'),
      paramsP('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when booking page not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // page miss
    const res = await waiversRoute.GET(
      makeReq('http://x/api/portal/tools/booking/1/waivers'),
      paramsP('1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns the waivers list (no date filters)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]); // page
    selectQueue.push([
      {
        id: 10,
        bookingId: 100,
        signerName: 'Alice',
        signerEmail: 'a@x.com',
        signedAt: new Date('2026-05-10'),
        ipAddress: '1.2.3.4',
      },
    ]);
    const res = await waiversRoute.GET(
      makeReq('http://x/api/portal/tools/booking/1/waivers'),
      paramsP('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].signerName).toBe('Alice');
  });

  it('accepts startDate and endDate query params', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    selectQueue.push([]);
    const res = await waiversRoute.GET(
      makeReq(
        'http://x/api/portal/tools/booking/1/waivers?startDate=2026-01-01&endDate=2026-12-31',
      ),
      paramsP('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('accepts only startDate', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    selectQueue.push([]);
    const res = await waiversRoute.GET(
      makeReq('http://x/api/portal/tools/booking/1/waivers?startDate=2026-01-01'),
      paramsP('1'),
    );
    expect(res.status).toBe(200);
  });

  it('accepts only endDate', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    selectQueue.push([]);
    const res = await waiversRoute.GET(
      makeReq('http://x/api/portal/tools/booking/1/waivers?endDate=2026-12-31'),
      paramsP('1'),
    );
    expect(res.status).toBe(200);
  });
});
