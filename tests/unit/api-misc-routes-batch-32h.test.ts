// @vitest-environment node
/**
 * Batch 32h — unit tests for 4 portal booking route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/tools/booking/[id]/add-ons/from-products/route.ts   (POST)
 *  - app/api/portal/tools/booking/[id]/add-ons/route.ts                 (GET, POST)
 *  - app/api/portal/tools/booking/[id]/bookings/[bookingId]/refund/route.ts (POST)
 *  - app/api/portal/tools/booking/[id]/bookings/[bookingId]/route.ts    (PUT)
 *
 * Strategy: heavy mocking — db.select() is a queue of result rows; chain
 * methods return a thenable that materializes on `await` (or terminal
 * .limit / .orderBy / .offset). db.insert/update are mocked to capture
 * writes and emit the next queued return rows. authorizePortal + isAuthError
 * are mocked so service-subscription gating doesn't reach into the database.
 * stripe is mocked via vi.mock so the refund route never hits the network.
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
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
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
  return new Proxy({
    bookingPages: wrap('bookingPages'),
    bookingAddOns: wrap('bookingAddOns'),
    bookings: wrap('bookings'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// Stripe — POST refund route uses dynamic import('stripe')
const stripeRefundsCreateMock = vi.fn();
class StripeCtorMock {
  refunds = { create: stripeRefundsCreateMock };
}
vi.mock('stripe', () => ({
  default: StripeCtorMock,
}));

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

const fromProductsRoute = await import(
  '@/app/api/portal/tools/booking/[id]/add-ons/from-products/route'
);
const addOnsRoute = await import('@/app/api/portal/tools/booking/[id]/add-ons/route');
const refundRoute = await import(
  '@/app/api/portal/tools/booking/[id]/bookings/[bookingId]/refund/route'
);
const bookingDetailRoute = await import(
  '@/app/api/portal/tools/booking/[id]/bookings/[bookingId]/route'
);

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
  authMock.mockReset();
  getPortalClientMock.mockReset();
  authorizePortalMock.mockReset();
  stripeRefundsCreateMock.mockReset();
});

// ===========================================================================
// POST /api/portal/tools/booking/[id]/add-ons/from-products
// ===========================================================================

describe('POST /api/portal/tools/booking/[id]/add-ons/from-products', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await fromProductsRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/add-ons/from-products', 'POST', {
        products: [],
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns the auth error response from authorizePortal', async () => {
    authMock.mockResolvedValue(SESSION);
    setAuthFail(403);
    const res = await fromProductsRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/add-ons/from-products', 'POST', {
        products: [],
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(403);
  });

  it('returns 401 when the portal client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    getPortalClientMock.mockResolvedValue(null);
    const res = await fromProductsRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/add-ons/from-products', 'POST', {
        products: [{ productId: 1 }],
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when the booking page does not belong to this client', async () => {
    setOk();
    selectQueue.push([]); // page lookup
    const res = await fromProductsRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/add-ons/from-products', 'POST', {
        products: [{ productId: 1 }],
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when products is not an array', async () => {
    setOk();
    selectQueue.push([{ id: 1, clientId: 5 }]); // page
    const res = await fromProductsRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/add-ons/from-products', 'POST', {
        products: 'nope',
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/products array is required/i);
  });

  it('returns 400 when products is empty', async () => {
    setOk();
    selectQueue.push([{ id: 1, clientId: 5 }]);
    const res = await fromProductsRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/add-ons/from-products', 'POST', {
        products: [],
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('creates add-ons starting at order=0 when none exist, with defaults', async () => {
    setOk();
    selectQueue.push([{ id: 1, clientId: 5 }]); // page
    selectQueue.push([]); // existing order list (empty)
    insertReturnQueue.push([{ id: 100 }]);
    insertReturnQueue.push([{ id: 101 }]);

    const res = await fromProductsRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/add-ons/from-products', 'POST', {
        products: [
          { productId: 50 },
          { productId: 51, variantId: 9, maxQuantity: 3 },
        ],
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(insertCalls).toHaveLength(2);
    const v1 = insertCalls[0].values as Record<string, unknown>;
    expect(v1.bookingPageId).toBe(1);
    expect(v1.source).toBe('product');
    expect(v1.productId).toBe(50);
    expect(v1.variantId).toBeNull();
    expect(v1.maxQuantity).toBe(10); // default
    expect(v1.order).toBe(0);
    const v2 = insertCalls[1].values as Record<string, unknown>;
    expect(v2.productId).toBe(51);
    expect(v2.variantId).toBe(9);
    expect(v2.maxQuantity).toBe(3);
    expect(v2.order).toBe(1);
  });

  it('continues numbering after the current max order', async () => {
    setOk();
    selectQueue.push([{ id: 1, clientId: 5 }]); // page
    selectQueue.push([{ order: 4 }, { order: 7 }, { order: 2 }]); // existing
    insertReturnQueue.push([{ id: 100 }]);

    const res = await fromProductsRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/add-ons/from-products', 'POST', {
        products: [{ productId: 50 }],
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(201);
    expect((insertCalls[0].values as Record<string, unknown>).order).toBe(8);
  });
});

// ===========================================================================
// GET /api/portal/tools/booking/[id]/add-ons
// ===========================================================================

describe('GET /api/portal/tools/booking/[id]/add-ons', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await addOnsRoute.GET(makeReq('http://x/api/portal/tools/booking/1/add-ons'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns the auth error from authorizePortal', async () => {
    authMock.mockResolvedValue(SESSION);
    setAuthFail(403);
    const res = await addOnsRoute.GET(makeReq('http://x/api/portal/tools/booking/1/add-ons'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 404 when the page cannot be resolved (no client)', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    getPortalClientMock.mockResolvedValue(null);
    const res = await addOnsRoute.GET(makeReq('http://x/api/portal/tools/booking/1/add-ons'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 when the page is not found for this client', async () => {
    setOk();
    selectQueue.push([]); // page lookup empty
    const res = await addOnsRoute.GET(makeReq('http://x/api/portal/tools/booking/1/add-ons'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns the list of add-ons for the page', async () => {
    setOk();
    selectQueue.push([{ id: 1, clientId: 5 }]); // page
    selectQueue.push([
      { id: 11, name: 'A', order: 0 },
      { id: 12, name: 'B', order: 1 },
    ]);
    const res = await addOnsRoute.GET(makeReq('http://x/api/portal/tools/booking/1/add-ons'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });

  it('returns an empty list when no add-ons exist', async () => {
    setOk();
    selectQueue.push([{ id: 1, clientId: 5 }]); // page
    selectQueue.push([]); // add-ons
    const res = await addOnsRoute.GET(makeReq('http://x/api/portal/tools/booking/1/add-ons'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

// ===========================================================================
// POST /api/portal/tools/booking/[id]/add-ons
// ===========================================================================

describe('POST /api/portal/tools/booking/[id]/add-ons', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await addOnsRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/add-ons', 'POST', { source: 'custom' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns the auth error from authorizePortal', async () => {
    authMock.mockResolvedValue(SESSION);
    setAuthFail(403);
    const res = await addOnsRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/add-ons', 'POST', { source: 'custom' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(403);
  });

  it('returns 404 when the page is not found', async () => {
    setOk();
    selectQueue.push([]); // page empty
    const res = await addOnsRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/add-ons', 'POST', {
        source: 'custom',
        name: 'X',
        price: 100,
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when source=custom but name is missing', async () => {
    setOk();
    selectQueue.push([{ id: 1, clientId: 5 }]); // page
    const res = await addOnsRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/add-ons', 'POST', {
        source: 'custom',
        price: 100,
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/custom add-ons require name and price/i);
  });

  it('returns 400 when source=custom but price is undefined', async () => {
    setOk();
    selectQueue.push([{ id: 1, clientId: 5 }]); // page
    const res = await addOnsRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/add-ons', 'POST', {
        source: 'custom',
        name: 'X',
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when source=product but productId is missing', async () => {
    setOk();
    selectQueue.push([{ id: 1, clientId: 5 }]); // page
    const res = await addOnsRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/add-ons', 'POST', {
        source: 'product',
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/product add-ons require productId/i);
  });

  it('creates a custom add-on with name, price parsed as int', async () => {
    setOk();
    selectQueue.push([{ id: 1, clientId: 5 }]); // page
    insertReturnQueue.push([{ id: 100 }]);
    const res = await addOnsRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/add-ons', 'POST', {
        source: 'custom',
        name: 'Add water',
        description: 'desc',
        price: '250',
        image: 'http://img',
        maxQuantity: 5,
        order: 2,
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(201);
    expect(insertCalls).toHaveLength(1);
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.bookingPageId).toBe(1);
    expect(v.source).toBe('custom');
    expect(v.name).toBe('Add water');
    expect(v.description).toBe('desc');
    expect(v.price).toBe(250);
    expect(v.image).toBe('http://img');
    expect(v.maxQuantity).toBe(5);
    expect(v.order).toBe(2);
  });

  it('creates a product add-on with defaults applied', async () => {
    setOk();
    selectQueue.push([{ id: 1, clientId: 5 }]); // page
    insertReturnQueue.push([{ id: 101 }]);
    const res = await addOnsRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/add-ons', 'POST', {
        source: 'product',
        productId: 77,
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(201);
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.source).toBe('product');
    expect(v.productId).toBe(77);
    expect(v.variantId).toBeNull();
    expect(v.maxQuantity).toBe(10); // default
    expect(v.order).toBe(0); // default
    expect(v.name).toBeNull();
    expect(v.price).toBeNull();
  });

  it('defaults source to "custom" when source is omitted', async () => {
    setOk();
    selectQueue.push([{ id: 1, clientId: 5 }]); // page
    insertReturnQueue.push([{ id: 102 }]);
    // since source is undefined the productId branch is not taken; the
    // custom validation runs against the absent name/price — body fails 400
    const res = await addOnsRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/add-ons', 'POST', {
        name: 'N',
        price: 1,
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(201);
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.source).toBe('custom');
  });
});

// ===========================================================================
// POST /api/portal/tools/booking/[id]/bookings/[bookingId]/refund
// ===========================================================================

describe('POST /api/portal/tools/booking/[id]/bookings/[bookingId]/refund', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await refundRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/bookings/9/refund', 'POST', {}),
      { params: Promise.resolve({ id: '1', bookingId: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns the auth error from authorizePortal', async () => {
    authMock.mockResolvedValue(SESSION);
    setAuthFail(403);
    const res = await refundRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/bookings/9/refund', 'POST', {}),
      { params: Promise.resolve({ id: '1', bookingId: '9' }) },
    );
    expect(res.status).toBe(403);
  });

  it('returns 401 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    getPortalClientMock.mockResolvedValue(null);
    const res = await refundRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/bookings/9/refund', 'POST', {}),
      { params: Promise.resolve({ id: '1', bookingId: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when the booking page is not found', async () => {
    setOk();
    selectQueue.push([]); // page
    const res = await refundRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/bookings/9/refund', 'POST', {}),
      { params: Promise.resolve({ id: '1', bookingId: '9' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when the booking is not found', async () => {
    setOk();
    selectQueue.push([{ id: 1, clientId: 5 }]); // page
    selectQueue.push([]); // booking empty
    const res = await refundRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/bookings/9/refund', 'POST', {}),
      { params: Promise.resolve({ id: '1', bookingId: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/booking not found/i);
  });

  it('returns 400 when booking has no payment to refund (no intent)', async () => {
    setOk();
    selectQueue.push([{ id: 1, clientId: 5 }]); // page
    selectQueue.push([{ id: 9, stripePaymentIntentId: null, paymentStatus: 'paid', total: 1000 }]);
    const res = await refundRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/bookings/9/refund', 'POST', {}),
      { params: Promise.resolve({ id: '1', bookingId: '9' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/no payment to refund/i);
  });

  it('returns 400 when paymentStatus is not "paid"', async () => {
    setOk();
    selectQueue.push([{ id: 1, clientId: 5 }]); // page
    selectQueue.push([
      { id: 9, stripePaymentIntentId: 'pi_x', paymentStatus: 'unpaid', total: 1000 },
    ]);
    const res = await refundRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/bookings/9/refund', 'POST', {}),
      { params: Promise.resolve({ id: '1', bookingId: '9' }) },
    );
    expect(res.status).toBe(400);
  });

  it('processes a full refund when no amount provided', async () => {
    setOk();
    selectQueue.push([{ id: 1, clientId: 5 }]); // page
    selectQueue.push([
      {
        id: 9,
        stripePaymentIntentId: 'pi_full',
        paymentStatus: 'paid',
        total: 1000,
        status: 'confirmed',
        cancelledAt: null,
      },
    ]);
    stripeRefundsCreateMock.mockResolvedValue({
      id: 're_full',
      amount: 1000,
      status: 'succeeded',
    });

    const res = await refundRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/bookings/9/refund', 'POST', {}),
      { params: Promise.resolve({ id: '1', bookingId: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.refundId).toBe('re_full');
    expect(body.data.amount).toBe(1000);
    expect(body.data.status).toBe('succeeded');

    // No `amount` passed to stripe.refunds.create on full refund
    expect(stripeRefundsCreateMock).toHaveBeenCalledTimes(1);
    expect(stripeRefundsCreateMock.mock.calls[0][0]).toEqual({ payment_intent: 'pi_full' });

    // Update marks cancelled
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('bookings');
    expect(updateCalls[0].patch.paymentStatus).toBe('refunded');
    expect(updateCalls[0].patch.status).toBe('cancelled');
    expect(updateCalls[0].patch.cancelledAt).toBeInstanceOf(Date);
  });

  it('processes a partial refund and keeps booking status untouched', async () => {
    setOk();
    selectQueue.push([{ id: 1, clientId: 5 }]); // page
    selectQueue.push([
      {
        id: 9,
        stripePaymentIntentId: 'pi_part',
        paymentStatus: 'paid',
        total: 1000,
        status: 'confirmed',
        cancelledAt: null,
      },
    ]);
    stripeRefundsCreateMock.mockResolvedValue({
      id: 're_part',
      amount: 300,
      status: 'succeeded',
    });

    const res = await refundRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/bookings/9/refund', 'POST', { amount: 300 }),
      { params: Promise.resolve({ id: '1', bookingId: '9' }) },
    );
    expect(res.status).toBe(200);
    expect(stripeRefundsCreateMock.mock.calls[0][0]).toEqual({
      payment_intent: 'pi_part',
      amount: 300,
    });
    expect(updateCalls[0].patch.paymentStatus).toBe('refunded');
    expect(updateCalls[0].patch.status).toBe('confirmed'); // unchanged
    expect(updateCalls[0].patch.cancelledAt).toBeNull();
  });

  it('treats amount >= total as a full refund and marks the booking cancelled', async () => {
    setOk();
    selectQueue.push([{ id: 1, clientId: 5 }]); // page
    selectQueue.push([
      {
        id: 9,
        stripePaymentIntentId: 'pi_eq',
        paymentStatus: 'paid',
        total: 1000,
        status: 'confirmed',
        cancelledAt: null,
      },
    ]);
    stripeRefundsCreateMock.mockResolvedValue({
      id: 're_eq',
      amount: 1000,
      status: 'succeeded',
    });

    const res = await refundRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/bookings/9/refund', 'POST', {
        amount: 1000,
      }),
      { params: Promise.resolve({ id: '1', bookingId: '9' }) },
    );
    expect(res.status).toBe(200);
    // amount === total → not < total → omit amount in stripe call
    expect(stripeRefundsCreateMock.mock.calls[0][0]).toEqual({ payment_intent: 'pi_eq' });
    expect(updateCalls[0].patch.status).toBe('cancelled');
  });

  it('returns 500 when stripe.refunds.create throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setOk();
    selectQueue.push([{ id: 1, clientId: 5 }]); // page
    selectQueue.push([
      {
        id: 9,
        stripePaymentIntentId: 'pi_err',
        paymentStatus: 'paid',
        total: 1000,
        status: 'confirmed',
        cancelledAt: null,
      },
    ]);
    stripeRefundsCreateMock.mockRejectedValue(new Error('stripe down'));

    const res = await refundRoute.POST(
      makeJsonReq('http://x/api/portal/tools/booking/1/bookings/9/refund', 'POST', {}),
      { params: Promise.resolve({ id: '1', bookingId: '9' }) },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toMatch(/failed to process refund/i);
    expect(updateCalls).toHaveLength(0);
    consoleSpy.mockRestore();
  });
});

// ===========================================================================
// PUT /api/portal/tools/booking/[id]/bookings/[bookingId]
// ===========================================================================

describe('PUT /api/portal/tools/booking/[id]/bookings/[bookingId]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await bookingDetailRoute.PUT(
      makeJsonReq('http://x/api/portal/tools/booking/1/bookings/9', 'PUT', {}),
      { params: Promise.resolve({ id: '1', bookingId: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await bookingDetailRoute.PUT(
      makeJsonReq('http://x/api/portal/tools/booking/1/bookings/9', 'PUT', {}),
      { params: Promise.resolve({ id: '1', bookingId: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/client not found/i);
  });

  it('returns 404 when the booking page does not belong to the client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // page lookup empty
    const res = await bookingDetailRoute.PUT(
      makeJsonReq('http://x/api/portal/tools/booking/1/bookings/9', 'PUT', {}),
      { params: Promise.resolve({ id: '1', bookingId: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/booking page not found/i);
  });

  it('returns 404 when the booking does not belong to the page', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5 }]); // page
    selectQueue.push([]); // booking empty
    const res = await bookingDetailRoute.PUT(
      makeJsonReq('http://x/api/portal/tools/booking/1/bookings/9', 'PUT', {}),
      { params: Promise.resolve({ id: '1', bookingId: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/booking not found/i);
  });

  it('updates only the fields that are provided (notes)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5 }]); // page
    selectQueue.push([{ id: 9 }]); // booking
    updateReturnQueue.push([{ id: 9, notes: 'hello' }]);
    const res = await bookingDetailRoute.PUT(
      makeJsonReq('http://x/api/portal/tools/booking/1/bookings/9', 'PUT', { notes: 'hello' }),
      { params: Promise.resolve({ id: '1', bookingId: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(updateCalls).toHaveLength(1);
    const patch = updateCalls[0].patch;
    expect(patch.notes).toBe('hello');
    expect(patch.updatedAt).toBeInstanceOf(Date);
    expect(patch).not.toHaveProperty('status');
    expect(patch).not.toHaveProperty('assignedTo');
  });

  it('sets cancelledAt when status becomes "cancelled"', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5 }]);
    selectQueue.push([{ id: 9 }]);
    updateReturnQueue.push([{ id: 9, status: 'cancelled' }]);
    const res = await bookingDetailRoute.PUT(
      makeJsonReq('http://x/api/portal/tools/booking/1/bookings/9', 'PUT', { status: 'cancelled' }),
      { params: Promise.resolve({ id: '1', bookingId: '9' }) },
    );
    expect(res.status).toBe(200);
    const patch = updateCalls[0].patch;
    expect(patch.status).toBe('cancelled');
    expect(patch.cancelledAt).toBeInstanceOf(Date);
  });

  it('does not set cancelledAt when status is something other than "cancelled"', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5 }]);
    selectQueue.push([{ id: 9 }]);
    updateReturnQueue.push([{ id: 9, status: 'confirmed' }]);
    const res = await bookingDetailRoute.PUT(
      makeJsonReq('http://x/api/portal/tools/booking/1/bookings/9', 'PUT', { status: 'confirmed' }),
      { params: Promise.resolve({ id: '1', bookingId: '9' }) },
    );
    expect(res.status).toBe(200);
    const patch = updateCalls[0].patch;
    expect(patch.status).toBe('confirmed');
    expect(patch).not.toHaveProperty('cancelledAt');
  });

  it('treats empty assignedTo as null', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5 }]);
    selectQueue.push([{ id: 9 }]);
    updateReturnQueue.push([{ id: 9 }]);
    const res = await bookingDetailRoute.PUT(
      makeJsonReq('http://x/api/portal/tools/booking/1/bookings/9', 'PUT', { assignedTo: '' }),
      { params: Promise.resolve({ id: '1', bookingId: '9' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.assignedTo).toBeNull();
  });

  it('passes through a non-empty assignedTo', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5 }]);
    selectQueue.push([{ id: 9 }]);
    updateReturnQueue.push([{ id: 9 }]);
    const res = await bookingDetailRoute.PUT(
      makeJsonReq('http://x/api/portal/tools/booking/1/bookings/9', 'PUT', { assignedTo: 'me@x' }),
      { params: Promise.resolve({ id: '1', bookingId: '9' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.assignedTo).toBe('me@x');
  });
});
