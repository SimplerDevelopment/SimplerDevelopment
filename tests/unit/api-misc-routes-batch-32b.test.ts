// @vitest-environment node
/**
 * Batch 32b — unit tests for 4 portal route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/reset-password/route.ts                (POST)
 *  - app/api/portal/service-requests/route.ts              (GET, POST)
 *  - app/api/portal/services/[id]/checkout/route.ts        (POST)
 *  - app/api/portal/settings/profile/route.ts              (GET, PATCH)
 *
 * Strategy: heavy mocking — db.select() is a queue of result rows; chain
 * methods return a thenable that materializes on `await` (or terminal
 * .limit / .orderBy). db.insert/update are mocked to capture writes and emit
 * queued rows. bcryptjs.hash, stripe.checkout.sessions.create, and auth() are
 * mocked. The portal-client resolver is also mocked so we never touch real db
 * schema joins for client lookup.
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

const bcryptHashMock = vi.fn();
vi.mock('bcryptjs', () => ({
  hash: (...args: unknown[]) => bcryptHashMock(...args),
}));

const hashTokenMock = vi.fn((s: string) => `hashed:${s}`);
vi.mock('@/lib/security/token-hash', () => ({
  hashToken: (s: string) => hashTokenMock(s),
}));

// drizzle-orm operators — inert objects
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  gt: (a: unknown, b: unknown) => ({ op: 'gt', a, b }),
  lt: (a: unknown, b: unknown) => ({ op: 'lt', a, b }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
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
    users: wrap('users'),
    clients: wrap('clients'),
    services: wrap('services'),
    serviceRequests: wrap('serviceRequests'),
    clientServices: wrap('clientServices'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// Stripe mock
// ---------------------------------------------------------------------------

interface StripeState {
  checkoutSessionsCreate: ReturnType<typeof vi.fn>;
  stripeConstructed: string[];
}

const stripeState: StripeState = {
  checkoutSessionsCreate: vi.fn(),
  stripeConstructed: [],
};

vi.mock('stripe', () => {
  class Stripe {
    constructor(key: string) {
      stripeState.stripeConstructed.push(key);
    }
    checkout = {
      sessions: {
        create: (...args: unknown[]) => stripeState.checkoutSessionsCreate(...args),
      },
    };
  }
  return { default: Stripe };
});

// ---------------------------------------------------------------------------
// db mock: select-queue + write capture
// ---------------------------------------------------------------------------

interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
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
        return {
          returning() {
            return Promise.resolve(cloned);
          },
          then(onF: (val: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(cloned).then(onF, onR);
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

const resetPasswordRoute = await import('@/app/api/portal/reset-password/route');
const serviceRequestsRoute = await import('@/app/api/portal/service-requests/route');
const checkoutRoute = await import('@/app/api/portal/services/[id]/checkout/route');
const profileRoute = await import('@/app/api/portal/settings/profile/route');

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeJsonReq(url: string, method: string, body: unknown, headers?: Record<string, string>): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
    body: JSON.stringify(body),
  });
}

const SESSION = { user: { id: '7' } };

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  updateReturnQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  bcryptHashMock.mockReset();
  bcryptHashMock.mockResolvedValue('HASHED_PW');
  stripeState.checkoutSessionsCreate.mockReset();
  stripeState.stripeConstructed.length = 0;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

// ===========================================================================
// POST /api/portal/reset-password
// ===========================================================================

describe('POST /api/portal/reset-password', () => {
  it('returns 400 when token is missing', async () => {
    const res = await resetPasswordRoute.POST(
      makeJsonReq('http://x/api/portal/reset-password', 'POST', { password: 'longenough' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Reset token is required/i);
  });

  it('returns 400 when token is not a string', async () => {
    const res = await resetPasswordRoute.POST(
      makeJsonReq('http://x/api/portal/reset-password', 'POST', { token: 123, password: 'longenough' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Reset token is required/i);
  });

  it('returns 400 when password is missing', async () => {
    const res = await resetPasswordRoute.POST(
      makeJsonReq('http://x/api/portal/reset-password', 'POST', { token: 'tok' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/at least 8 characters/i);
  });

  it('returns 400 when password is too short', async () => {
    const res = await resetPasswordRoute.POST(
      makeJsonReq('http://x/api/portal/reset-password', 'POST', { token: 'tok', password: '1234567' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/at least 8 characters/i);
  });

  it('returns 400 when password is not a string', async () => {
    const res = await resetPasswordRoute.POST(
      makeJsonReq('http://x/api/portal/reset-password', 'POST', { token: 'tok', password: 12345678 }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when token does not match any user', async () => {
    selectQueue.push([]); // no user found
    const res = await resetPasswordRoute.POST(
      makeJsonReq('http://x/api/portal/reset-password', 'POST', {
        token: 'tok',
        password: 'longenough',
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid or expired/i);
    expect(updateCalls).toHaveLength(0);
  });

  it('hashes the new password, clears the reset token, and returns success', async () => {
    selectQueue.push([{ id: 42 }]);
    bcryptHashMock.mockResolvedValue('NEW_HASH');
    const res = await resetPasswordRoute.POST(
      makeJsonReq('http://x/api/portal/reset-password', 'POST', {
        token: 'tok',
        password: 'longenough',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/Password has been reset/i);
    expect(bcryptHashMock).toHaveBeenCalledWith('longenough', 12);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('users');
    expect(updateCalls[0].patch.password).toBe('NEW_HASH');
    expect(updateCalls[0].patch.passwordResetToken).toBeNull();
    expect(updateCalls[0].patch.passwordResetExpires).toBeNull();
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
  });
});

// ===========================================================================
// GET /api/portal/service-requests
// ===========================================================================

describe('GET /api/portal/service-requests', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await serviceRequestsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 401 when getPortalClient returns null', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await serviceRequestsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns the list of service requests for the client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      {
        id: 1,
        serviceId: 10,
        serviceName: 'Website',
        status: 'pending',
        answers: { q1: 'a' },
        message: 'hi',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 2,
        serviceId: 11,
        serviceName: 'SEO',
        status: 'approved',
        answers: null,
        message: null,
        createdAt: new Date('2026-01-02T00:00:00Z'),
      },
    ]);
    const res = await serviceRequestsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].serviceName).toBe('Website');
  });

  it('returns empty array when no requests exist', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]);
    const res = await serviceRequestsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

// ===========================================================================
// POST /api/portal/service-requests
// ===========================================================================

describe('POST /api/portal/service-requests', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await serviceRequestsRoute.POST(
      makeJsonReq('http://x/api/portal/service-requests', 'POST', { serviceId: 10 }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when getPortalClient returns null', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await serviceRequestsRoute.POST(
      makeJsonReq('http://x/api/portal/service-requests', 'POST', { serviceId: 10 }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when serviceId is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await serviceRequestsRoute.POST(
      makeJsonReq('http://x/api/portal/service-requests', 'POST', {}),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/serviceId is required/i);
  });

  it('returns 404 when service does not exist', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // service lookup → none
    const res = await serviceRequestsRoute.POST(
      makeJsonReq('http://x/api/portal/service-requests', 'POST', { serviceId: 99 }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/Service not available/i);
  });

  it('returns 404 when service exists but is inactive', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 99, active: false, name: 'X' }]);
    const res = await serviceRequestsRoute.POST(
      makeJsonReq('http://x/api/portal/service-requests', 'POST', { serviceId: 99 }),
    );
    expect(res.status).toBe(404);
  });

  it('creates a service request with answers and message', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 10, active: true, name: 'Website' }]);
    insertReturnQueue.push([
      { id: 1, serviceId: 10, clientId: 5, status: 'pending', answers: { q1: 'a' }, message: 'hi' },
    ]);
    const res = await serviceRequestsRoute.POST(
      makeJsonReq('http://x/api/portal/service-requests', 'POST', {
        serviceId: 10,
        answers: { q1: 'a' },
        message: 'hi',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('serviceRequests');
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.serviceId).toBe(10);
    expect(v.clientId).toBe(5);
    expect(v.status).toBe('pending');
    expect(v.answers).toEqual({ q1: 'a' });
    expect(v.message).toBe('hi');
  });

  it('creates a service request with null answers and null message when not provided', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 10, active: true, name: 'Website' }]);
    insertReturnQueue.push([{ id: 2 }]);
    const res = await serviceRequestsRoute.POST(
      makeJsonReq('http://x/api/portal/service-requests', 'POST', { serviceId: 10 }),
    );
    expect(res.status).toBe(200);
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.answers).toBeNull();
    expect(v.message).toBeNull();
  });
});

// ===========================================================================
// POST /api/portal/services/[id]/checkout
// ===========================================================================

describe('POST /api/portal/services/[id]/checkout', () => {
  function buildReq(body: unknown = {}, origin?: string): Request {
    return makeJsonReq(
      'http://x/api/portal/services/10/checkout',
      'POST',
      body,
      origin ? { origin } : undefined,
    );
  }

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await checkoutRoute.POST(buildReq(), { params: Promise.resolve({ id: '10' }) });
    expect(res.status).toBe(401);
  });

  it('returns 404 when getPortalClient returns null', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await checkoutRoute.POST(buildReq(), { params: Promise.resolve({ id: '10' }) });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/Client not found/i);
  });

  it('returns 404 when service does not exist', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // service lookup → none
    const res = await checkoutRoute.POST(buildReq(), { params: Promise.resolve({ id: '10' }) });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/Service not available/i);
  });

  it('returns 404 when service is inactive', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 10, active: false }]);
    const res = await checkoutRoute.POST(buildReq(), { params: Promise.resolve({ id: '10' }) });
    expect(res.status).toBe(404);
  });

  it('returns 409 when client already has an active subscription', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 10, active: true, price: 1000, name: 'Svc', billingCycle: 'monthly' }]);
    selectQueue.push([{ status: 'active' }]); // existing clientServices
    const res = await checkoutRoute.POST(buildReq(), { params: Promise.resolve({ id: '10' }) });
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/already have this service/i);
  });

  it('returns 500 when STRIPE_SECRET_KEY is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 10, active: true, price: 1000, name: 'Svc', billingCycle: 'one-time' }]);
    selectQueue.push([]); // no existing
    const res = await checkoutRoute.POST(buildReq(), { params: Promise.resolve({ id: '10' }) });
    expect(res.status).toBe(500);
    expect((await res.json()).message).toMatch(/Payments not configured/i);
  });

  it('creates a one-time checkout session using price_data when no stripePriceId', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5, stripeCustomerId: null });
    selectQueue.push([
      {
        id: 10,
        active: true,
        price: 2500,
        name: 'One-time',
        description: 'desc',
        billingCycle: 'one-time',
        stripePriceId: null,
      },
    ]);
    selectQueue.push([]); // no existing
    stripeState.checkoutSessionsCreate.mockResolvedValue({ url: 'https://stripe.example/checkout/1' });

    const res = await checkoutRoute.POST(buildReq({}, 'https://my-portal.test'), {
      params: Promise.resolve({ id: '10' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.url).toBe('https://stripe.example/checkout/1');
    expect(stripeState.stripeConstructed).toEqual(['sk_test_123']);
    const callArg = stripeState.checkoutSessionsCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.mode).toBe('payment');
    const lineItems = callArg.line_items as Array<Record<string, unknown>>;
    expect(lineItems[0].price_data).toMatchObject({
      currency: 'usd',
      unit_amount: 2500,
      product_data: { name: 'One-time', description: 'desc' },
    });
    expect((lineItems[0].price_data as Record<string, unknown>).recurring).toBeUndefined();
    expect(callArg.success_url).toBe('https://my-portal.test/portal/services?purchased=1');
    expect(callArg.cancel_url).toBe('https://my-portal.test/portal/services');
    expect(callArg.metadata).toEqual({ serviceId: '10', clientId: '5' });
    // No stripeCustomerId on client + payment mode → customer_creation always
    expect(callArg.customer_creation).toBe('always');
    expect(callArg.customer).toBeUndefined();
  });

  it('creates a subscription checkout with recurring monthly when billingCycle=monthly', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_abc';
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5, stripeCustomerId: 'cus_123' });
    selectQueue.push([
      {
        id: 10,
        active: true,
        price: 999,
        name: 'Monthly',
        description: null,
        billingCycle: 'monthly',
        stripePriceId: null,
      },
    ]);
    selectQueue.push([]);
    stripeState.checkoutSessionsCreate.mockResolvedValue({ url: 'https://stripe.example/sub/1' });

    const res = await checkoutRoute.POST(buildReq({}), { params: Promise.resolve({ id: '10' }) });
    expect(res.status).toBe(200);
    const callArg = stripeState.checkoutSessionsCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.mode).toBe('subscription');
    const lineItems = callArg.line_items as Array<Record<string, unknown>>;
    expect((lineItems[0].price_data as Record<string, unknown>).recurring).toEqual({ interval: 'month' });
    // Recurring with no origin → falls back to NEXT_PUBLIC_APP_URL or localhost
    expect(callArg.success_url).toBe('http://localhost:3000/portal/services?purchased=1');
    // Existing stripeCustomerId is reused
    expect(callArg.customer).toBe('cus_123');
    expect(callArg.customer_creation).toBeUndefined();
  });

  it('creates an annual subscription using recurring year interval', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_y';
    process.env.NEXT_PUBLIC_APP_URL = 'https://prod.example';
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5, stripeCustomerId: null });
    selectQueue.push([
      {
        id: 10,
        active: true,
        price: 9999,
        name: 'Yearly',
        description: null,
        billingCycle: 'annually',
        stripePriceId: null,
      },
    ]);
    selectQueue.push([]);
    stripeState.checkoutSessionsCreate.mockResolvedValue({ url: 'https://stripe.example/year/1' });

    const res = await checkoutRoute.POST(buildReq({}), { params: Promise.resolve({ id: '10' }) });
    expect(res.status).toBe(200);
    const callArg = stripeState.checkoutSessionsCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.mode).toBe('subscription');
    const lineItems = callArg.line_items as Array<Record<string, unknown>>;
    expect((lineItems[0].price_data as Record<string, unknown>).recurring).toEqual({ interval: 'year' });
    expect(callArg.success_url).toBe('https://prod.example/portal/services?purchased=1');
    // No stripeCustomerId AND subscription mode → no customer_creation flag (only valid for payment)
    expect(callArg.customer_creation).toBeUndefined();
  });

  it('uses existing stripePriceId line item when service has one', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_pp';
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5, stripeCustomerId: null });
    selectQueue.push([
      {
        id: 10,
        active: true,
        price: 1000,
        name: 'X',
        description: null,
        billingCycle: 'one-time',
        stripePriceId: 'price_existing_xyz',
      },
    ]);
    selectQueue.push([]);
    stripeState.checkoutSessionsCreate.mockResolvedValue({ url: 'https://stripe.example/pp/1' });

    const res = await checkoutRoute.POST(buildReq({}), { params: Promise.resolve({ id: '10' }) });
    expect(res.status).toBe(200);
    const callArg = stripeState.checkoutSessionsCreate.mock.calls[0][0] as Record<string, unknown>;
    const lineItems = callArg.line_items as Array<Record<string, unknown>>;
    expect(lineItems).toEqual([{ price: 'price_existing_xyz', quantity: 1 }]);
  });
});

// ===========================================================================
// GET /api/portal/settings/profile
// ===========================================================================

describe('GET /api/portal/settings/profile', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await profileRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when getPortalClient returns null', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await profileRoute.GET();
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/Client not found/i);
  });

  it('returns 404 when user is not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5, company: 'Co', phone: '555', website: 'w', address: 'a', emailPrefix: 'p' });
    selectQueue.push([]); // users lookup empty
    const res = await profileRoute.GET();
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/User not found/i);
  });

  it('returns merged user + client profile data', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({
      id: 5,
      company: 'Acme',
      phone: '555',
      website: 'https://acme.test',
      address: '1 Main St',
      emailPrefix: 'acme',
    });
    selectQueue.push([{ name: 'Alice', email: 'a@b.com' }]);
    const res = await profileRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      name: 'Alice',
      email: 'a@b.com',
      company: 'Acme',
      phone: '555',
      website: 'https://acme.test',
      address: '1 Main St',
      emailPrefix: 'acme',
    });
  });

  it('coerces nullish client fields to empty strings', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({
      id: 5,
      company: null,
      phone: null,
      website: null,
      address: null,
      emailPrefix: null,
    });
    selectQueue.push([{ name: 'Bob', email: 'b@x.com' }]);
    const res = await profileRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.company).toBe('');
    expect(body.data.phone).toBe('');
    expect(body.data.website).toBe('');
    expect(body.data.address).toBe('');
    expect(body.data.emailPrefix).toBe('');
  });
});

// ===========================================================================
// PATCH /api/portal/settings/profile
// ===========================================================================

describe('PATCH /api/portal/settings/profile', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await profileRoute.PATCH(
      makeJsonReq('http://x/api/portal/settings/profile', 'PATCH', { name: 'A', email: 'a@b.com' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when getPortalClient returns null', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await profileRoute.PATCH(
      makeJsonReq('http://x/api/portal/settings/profile', 'PATCH', { name: 'A', email: 'a@b.com' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when name is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await profileRoute.PATCH(
      makeJsonReq('http://x/api/portal/settings/profile', 'PATCH', { email: 'a@b.com' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/Name is required/i);
  });

  it('returns 400 when name is whitespace only', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await profileRoute.PATCH(
      makeJsonReq('http://x/api/portal/settings/profile', 'PATCH', { name: '   ', email: 'a@b.com' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when email is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await profileRoute.PATCH(
      makeJsonReq('http://x/api/portal/settings/profile', 'PATCH', { name: 'Alice' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/Email is required/i);
  });

  it('returns 400 when email is changed and conflicts with another user', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ email: 'old@x.com' }]); // current user email
    selectQueue.push([{ id: 999 }]); // conflict found
    const res = await profileRoute.PATCH(
      makeJsonReq('http://x/api/portal/settings/profile', 'PATCH', {
        name: 'Alice',
        email: 'new@x.com',
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/Email already in use/i);
    expect(updateCalls).toHaveLength(0);
  });

  it('updates user + client when email is unchanged (skips conflict check)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ email: 'same@x.com' }]); // current user email
    // No second select for conflict because emails match
    const res = await profileRoute.PATCH(
      makeJsonReq('http://x/api/portal/settings/profile', 'PATCH', {
        name: '  Alice  ',
        email: '  same@x.com  ',
        company: '  Acme  ',
        phone: '  555  ',
        website: '  https://acme.test  ',
        address: '  1 Main  ',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/Profile updated/i);
    expect(updateCalls).toHaveLength(2);
    const userUpdate = updateCalls.find((u) => u.table === 'users');
    expect(userUpdate?.patch.name).toBe('Alice');
    expect(userUpdate?.patch.email).toBe('same@x.com');
    expect(userUpdate?.patch.updatedAt).toBeInstanceOf(Date);
    const clientUpdate = updateCalls.find((u) => u.table === 'clients');
    expect(clientUpdate?.patch.company).toBe('Acme');
    expect(clientUpdate?.patch.phone).toBe('555');
    expect(clientUpdate?.patch.website).toBe('https://acme.test');
    expect(clientUpdate?.patch.address).toBe('1 Main');
    // emailPrefix was NOT provided → patch should NOT include the key
    expect(clientUpdate?.patch).not.toHaveProperty('emailPrefix');
  });

  it('normalizes emailPrefix to lowercase a-z/0-9/hyphen', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ email: 'same@x.com' }]);
    const res = await profileRoute.PATCH(
      makeJsonReq('http://x/api/portal/settings/profile', 'PATCH', {
        name: 'Alice',
        email: 'same@x.com',
        emailPrefix: '  My-Co_77!  ',
      }),
    );
    expect(res.status).toBe(200);
    const clientUpdate = updateCalls.find((u) => u.table === 'clients');
    expect(clientUpdate?.patch.emailPrefix).toBe('my-co77');
  });

  it('sets emailPrefix to null when an empty string is provided', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ email: 'same@x.com' }]);
    const res = await profileRoute.PATCH(
      makeJsonReq('http://x/api/portal/settings/profile', 'PATCH', {
        name: 'Alice',
        email: 'same@x.com',
        emailPrefix: '   ',
      }),
    );
    expect(res.status).toBe(200);
    const clientUpdate = updateCalls.find((u) => u.table === 'clients');
    expect(clientUpdate?.patch.emailPrefix).toBeNull();
  });

  it('sets company/phone/website/address to null when only whitespace', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ email: 'same@x.com' }]);
    const res = await profileRoute.PATCH(
      makeJsonReq('http://x/api/portal/settings/profile', 'PATCH', {
        name: 'Alice',
        email: 'same@x.com',
        company: '   ',
        phone: '   ',
        website: '   ',
        address: '   ',
      }),
    );
    expect(res.status).toBe(200);
    const clientUpdate = updateCalls.find((u) => u.table === 'clients');
    expect(clientUpdate?.patch.company).toBeNull();
    expect(clientUpdate?.patch.phone).toBeNull();
    expect(clientUpdate?.patch.website).toBeNull();
    expect(clientUpdate?.patch.address).toBeNull();
  });

  it('updates user + client when email is changed and no conflict', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ email: 'old@x.com' }]); // current user email
    selectQueue.push([]); // no conflict
    const res = await profileRoute.PATCH(
      makeJsonReq('http://x/api/portal/settings/profile', 'PATCH', {
        name: 'Alice',
        email: 'new@x.com',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const userUpdate = updateCalls.find((u) => u.table === 'users');
    expect(userUpdate?.patch.email).toBe('new@x.com');
  });
});
