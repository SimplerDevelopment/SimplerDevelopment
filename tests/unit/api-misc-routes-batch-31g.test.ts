// @vitest-environment node
/**
 * Batch 31g — unit tests for 4 portal route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/invoices/[id]/checkout/route.ts                       (POST)
 *  - app/api/portal/media/[id]/route.ts                                   (PUT, DELETE)
 *  - app/api/portal/media/[id]/versions/route.ts                          (GET)
 *  - app/api/portal/media/[id]/versions/[versionId]/restore/route.ts      (POST)
 *
 * Strategy: heavy mocking. The drizzle ORM, schema, db, auth, and portal-client
 * are all mocked. db.select() returns a thenable chain whose result is the next
 * row-set on `selectQueue`. db.insert/update/delete capture writes and emit
 * rows from their dedicated queues. The Stripe SDK is mocked so checkout
 * session creation can be deterministically driven.
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

// drizzle-orm operators — inert objects
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  like: (a: unknown, b: unknown) => ({ op: 'like', a, b }),
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
    invoices: wrap('invoices'),
    invoiceItems: wrap('invoiceItems'),
    media: wrap('media'),
    mediaVersions: wrap('mediaVersions'),
  };
});

// ---------------------------------------------------------------------------
// Stripe mock
// ---------------------------------------------------------------------------

interface StripeState {
  checkoutSessionsCreate: ReturnType<typeof vi.fn>;
  stripeKey: string | undefined;
  stripeConstructed: string[];
}

const stripeState: StripeState = {
  checkoutSessionsCreate: vi.fn(),
  stripeKey: undefined,
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
interface DeleteCall {
  table: string;
  filter: unknown;
  returnedRows: Array<Record<string, unknown>>;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
let deleteReturnQueue: Array<Array<Record<string, unknown>>> = [];
const insertCalls: InsertCall[] = [];
const updateCalls: UpdateCall[] = [];
const deleteCalls: DeleteCall[] = [];

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

  function buildDelete(table: { __table: string }) {
    return {
      where(filter: unknown) {
        const rows = deleteReturnQueue.shift() ?? [];
        const cloned = rows.map((r) => ({ ...r }));
        deleteCalls.push({ table: table.__table, filter, returnedRows: cloned });
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
            return Promise.resolve(rows.map((r) => ({ ...r }))).then(onF, onR);
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
      delete(table: { __table: string }) {
        return buildDelete(table);
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

const invoiceCheckoutRoute = await import(
  '@/app/api/portal/invoices/[id]/checkout/route'
);
const mediaIdRoute = await import('@/app/api/portal/media/[id]/route');
const mediaVersionsRoute = await import(
  '@/app/api/portal/media/[id]/versions/route'
);
const mediaVersionRestoreRoute = await import(
  '@/app/api/portal/media/[id]/versions/[versionId]/restore/route'
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

const CLIENT_SESSION = { user: { id: '7' } };
const STAFF_SESSION = { user: { id: '8', role: 'admin' } };
const EMPLOYEE_SESSION = { user: { id: '9', role: 'employee' } };

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  updateReturnQueue = [];
  deleteReturnQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  stripeState.checkoutSessionsCreate.mockReset();
  stripeState.stripeConstructed.length = 0;
  // Ensure a clean env per-test
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

// ===========================================================================
// POST /api/portal/invoices/[id]/checkout
// ===========================================================================

describe('POST /api/portal/invoices/[id]/checkout', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await invoiceCheckoutRoute.POST(
      makeReq('http://x/api/portal/invoices/9/checkout', { method: 'POST' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await invoiceCheckoutRoute.POST(
      makeReq('http://x/api/portal/invoices/9/checkout', { method: 'POST' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-staff when client cannot be resolved', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await invoiceCheckoutRoute.POST(
      makeReq('http://x/api/portal/invoices/9/checkout', { method: 'POST' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(403);
    expect((await res.json()).message).toBe('Forbidden');
  });

  it('returns 404 when invoice does not exist (client scope)', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // no invoice
    const res = await invoiceCheckoutRoute.POST(
      makeReq('http://x/api/portal/invoices/9/checkout', { method: 'POST' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Invoice not found');
  });

  it('returns 404 when invoice does not exist (staff scope)', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([]); // no invoice — staff path does not call getPortalClient
    const res = await invoiceCheckoutRoute.POST(
      makeReq('http://x/api/portal/invoices/9/checkout', { method: 'POST' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect(getPortalClientMock).not.toHaveBeenCalled();
  });

  it('returns 400 when invoice status is not payable (draft)', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([
      { id: 9, status: 'draft', clientId: 5 },
    ]);
    const res = await invoiceCheckoutRoute.POST(
      makeReq('http://x/api/portal/invoices/9/checkout', { method: 'POST' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invoice is not payable');
  });

  it('returns 400 when invoice status is paid', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([
      { id: 9, status: 'paid', clientId: 5 },
    ]);
    const res = await invoiceCheckoutRoute.POST(
      makeReq('http://x/api/portal/invoices/9/checkout', { method: 'POST' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 500 when STRIPE_SECRET_KEY is not configured', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 9, status: 'sent', clientId: 5 }]);
    const res = await invoiceCheckoutRoute.POST(
      makeReq('http://x/api/portal/invoices/9/checkout', { method: 'POST' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toMatch(/Stripe not configured/);
  });

  it('creates a checkout session for sent invoice (employee role)', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://app.example.com';
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    selectQueue.push([{ id: 9, status: 'sent', clientId: 5 }]); // invoice
    selectQueue.push([
      { invoiceId: 9, description: 'Service A', unitPrice: 1000, quantity: 2 },
      { invoiceId: 9, description: 'Service B', unitPrice: 500, quantity: 1 },
    ]); // line items
    stripeState.checkoutSessionsCreate.mockResolvedValue({
      id: 'cs_test_abc',
      url: 'https://stripe.example/checkout/abc',
    });
    const res = await invoiceCheckoutRoute.POST(
      makeReq('http://x/api/portal/invoices/9/checkout', { method: 'POST' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.url).toBe('https://stripe.example/checkout/abc');

    // Stripe constructed with the env key
    expect(stripeState.stripeConstructed).toEqual(['sk_test_123']);

    // Sessions.create called with correct shape
    expect(stripeState.checkoutSessionsCreate).toHaveBeenCalledTimes(1);
    const arg = stripeState.checkoutSessionsCreate.mock.calls[0][0];
    expect(arg.mode).toBe('payment');
    expect(arg.payment_method_types).toEqual(['card']);
    expect(arg.line_items).toHaveLength(2);
    expect(arg.line_items[0].price_data.currency).toBe('usd');
    expect(arg.line_items[0].price_data.unit_amount).toBe(1000);
    expect(arg.line_items[0].price_data.product_data.name).toBe('Service A');
    expect(arg.line_items[0].quantity).toBe(2);
    expect(arg.metadata).toEqual({ invoiceId: '9' });
    expect(arg.success_url).toBe('https://app.example.com/portal/invoices/9?paid=1');
    expect(arg.cancel_url).toBe('https://app.example.com/portal/invoices/9');

    // Invoice updated with checkout session id
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('invoices');
    expect(updateCalls[0].patch.stripeCheckoutSessionId).toBe('cs_test_abc');
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
  });

  it('creates checkout for overdue invoice on the client (non-staff) path', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_xyz';
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 11 });
    selectQueue.push([{ id: 9, status: 'overdue', clientId: 11 }]);
    selectQueue.push([]); // no line items
    stripeState.checkoutSessionsCreate.mockResolvedValue({
      id: 'cs_2',
      url: 'https://stripe.example/2',
    });
    const res = await invoiceCheckoutRoute.POST(
      makeReq('http://x/api/portal/invoices/9/checkout', { method: 'POST' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.url).toBe('https://stripe.example/2');

    // Client path uses getPortalClient and a different where filter
    expect(getPortalClientMock).toHaveBeenCalledWith(7);

    // Default baseUrl when NEXT_PUBLIC_SITE_URL is unset
    const arg = stripeState.checkoutSessionsCreate.mock.calls[0][0];
    expect(arg.success_url).toBe('http://localhost:3000/portal/invoices/9?paid=1');
    expect(arg.cancel_url).toBe('http://localhost:3000/portal/invoices/9');
    expect(arg.line_items).toEqual([]);
  });

  it('returns 500 when stripe.checkout.sessions.create throws Error', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_err';
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 9, status: 'sent' }]);
    selectQueue.push([]); // items
    stripeState.checkoutSessionsCreate.mockRejectedValue(new Error('Stripe blew up'));
    const res = await invoiceCheckoutRoute.POST(
      makeReq('http://x/api/portal/invoices/9/checkout', { method: 'POST' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('Stripe blew up');
  });

  it('returns 500 with default message when stripe throws a non-Error', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_err2';
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 9, status: 'sent' }]);
    selectQueue.push([]);
    stripeState.checkoutSessionsCreate.mockRejectedValue('weird non-error');
    const res = await invoiceCheckoutRoute.POST(
      makeReq('http://x/api/portal/invoices/9/checkout', { method: 'POST' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('Stripe error');
  });
});

// ===========================================================================
// PUT /api/portal/media/[id]
// ===========================================================================

describe('PUT /api/portal/media/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await mediaIdRoute.PUT(
      makeJsonReq('http://x/api/portal/media/9', 'PUT', { alt: 'a' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await mediaIdRoute.PUT(
      makeJsonReq('http://x/api/portal/media/9', 'PUT', { alt: 'a' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await mediaIdRoute.PUT(
      makeJsonReq('http://x/api/portal/media/9', 'PUT', { alt: 'a' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns 404 when media is not found / not owned by client', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    // updateReturnQueue empty -> returning() yields []
    const res = await mediaIdRoute.PUT(
      makeJsonReq('http://x/api/portal/media/9', 'PUT', { alt: 'new alt' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Media not found');
  });

  it('updates alt and caption successfully', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    updateReturnQueue.push([
      { id: 9, alt: 'new alt', caption: 'new caption', clientId: 5 },
    ]);
    const res = await mediaIdRoute.PUT(
      makeJsonReq('http://x/api/portal/media/9', 'PUT', {
        alt: 'new alt',
        caption: 'new caption',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(9);
    expect(body.data.alt).toBe('new alt');
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('media');
    expect(updateCalls[0].patch.alt).toBe('new alt');
    expect(updateCalls[0].patch.caption).toBe('new caption');
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
  });

  it('coerces empty alt/caption to null', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    updateReturnQueue.push([{ id: 9, alt: null, caption: null }]);
    const res = await mediaIdRoute.PUT(
      makeJsonReq('http://x/api/portal/media/9', 'PUT', {
        alt: '',
        caption: '',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.alt).toBeNull();
    expect(updateCalls[0].patch.caption).toBeNull();
  });

  it('omits alt/caption from patch when undefined in body', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    updateReturnQueue.push([{ id: 9 }]);
    const res = await mediaIdRoute.PUT(
      makeJsonReq('http://x/api/portal/media/9', 'PUT', {}),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    expect('alt' in updateCalls[0].patch).toBe(false);
    expect('caption' in updateCalls[0].patch).toBe(false);
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
  });
});

// ===========================================================================
// DELETE /api/portal/media/[id]
// ===========================================================================

describe('DELETE /api/portal/media/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await mediaIdRoute.DELETE(
      makeReq('http://x/api/portal/media/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await mediaIdRoute.DELETE(
      makeReq('http://x/api/portal/media/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns 404 when media row not deleted (returning empty)', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    // deleteReturnQueue empty
    const res = await mediaIdRoute.DELETE(
      makeReq('http://x/api/portal/media/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Media not found');
  });

  it('deletes the media and returns success message', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    deleteReturnQueue.push([{ id: 9, clientId: 5, filename: 'pic.png' }]);
    const res = await mediaIdRoute.DELETE(
      makeReq('http://x/api/portal/media/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe('Media deleted');
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('media');
  });
});

// ===========================================================================
// GET /api/portal/media/[id]/versions
// ===========================================================================

describe('GET /api/portal/media/[id]/versions', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await mediaVersionsRoute.GET(
      makeReq('http://x/api/portal/media/9/versions'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await mediaVersionsRoute.GET(
      makeReq('http://x/api/portal/media/9/versions'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await mediaVersionsRoute.GET(
      makeReq('http://x/api/portal/media/9/versions'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(403);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 404 when current media row is not found', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // current empty
    const res = await mediaVersionsRoute.GET(
      makeReq('http://x/api/portal/media/9/versions'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Media not found');
  });

  it('returns current + history with mapped fields', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      {
        id: 9,
        clientId: 5,
        version: 3,
        filename: 'latest.png',
        url: 'https://cdn/latest.png',
        fileSize: 12345,
        mimeType: 'image/png',
        updatedAt: '2026-05-01T00:00:00Z',
        // extra fields like storedFilename should NOT be in the response
        storedFilename: 'stored-latest.png',
      },
    ]);
    selectQueue.push([
      {
        id: 100,
        version: 2,
        filename: 'v2.png',
        url: 'https://cdn/v2.png',
        fileSize: 1000,
        mimeType: 'image/png',
        createdAt: '2026-04-01T00:00:00Z',
        storedFilename: 'stored-v2.png',
      },
      {
        id: 101,
        version: 1,
        filename: 'v1.png',
        url: 'https://cdn/v1.png',
        fileSize: 500,
        mimeType: 'image/png',
        createdAt: '2026-03-01T00:00:00Z',
      },
    ]);
    const res = await mediaVersionsRoute.GET(
      makeReq('http://x/api/portal/media/9/versions'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.current).toEqual({
      id: 9,
      version: 3,
      filename: 'latest.png',
      url: 'https://cdn/latest.png',
      fileSize: 12345,
      mimeType: 'image/png',
      updatedAt: '2026-05-01T00:00:00Z',
    });
    expect(body.data.history).toHaveLength(2);
    expect(body.data.history[0]).toEqual({
      id: 100,
      version: 2,
      filename: 'v2.png',
      url: 'https://cdn/v2.png',
      fileSize: 1000,
      mimeType: 'image/png',
      createdAt: '2026-04-01T00:00:00Z',
    });
    expect(body.data.history[1].version).toBe(1);
  });

  it('returns empty history when there are no prior versions', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      { id: 9, clientId: 5, version: 1, filename: 'only.png', url: 'u', fileSize: 1, mimeType: 'image/png' },
    ]);
    selectQueue.push([]); // no history
    const res = await mediaVersionsRoute.GET(
      makeReq('http://x/api/portal/media/9/versions'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.history).toEqual([]);
    expect(body.data.current.version).toBe(1);
  });
});

// ===========================================================================
// POST /api/portal/media/[id]/versions/[versionId]/restore
// ===========================================================================

describe('POST /api/portal/media/[id]/versions/[versionId]/restore', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await mediaVersionRestoreRoute.POST(
      makeReq('http://x/api/portal/media/9/versions/3/restore', { method: 'POST' }),
      { params: Promise.resolve({ id: '9', versionId: '3' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await mediaVersionRestoreRoute.POST(
      makeReq('http://x/api/portal/media/9/versions/3/restore', { method: 'POST' }),
      { params: Promise.resolve({ id: '9', versionId: '3' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await mediaVersionRestoreRoute.POST(
      makeReq('http://x/api/portal/media/9/versions/3/restore', { method: 'POST' }),
      { params: Promise.resolve({ id: '9', versionId: '3' }) },
    );
    expect(res.status).toBe(403);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 404 when current media is not found', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // current media
    const res = await mediaVersionRestoreRoute.POST(
      makeReq('http://x/api/portal/media/9/versions/3/restore', { method: 'POST' }),
      { params: Promise.resolve({ id: '9', versionId: '3' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Media not found');
  });

  it('returns 404 when target version is not found', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      {
        id: 9,
        clientId: 5,
        version: 4,
        filename: 'cur.png',
        storedFilename: 's-cur.png',
        mimeType: 'image/png',
        fileSize: 100,
        url: 'https://cdn/cur.png',
        uploadedBy: 7,
      },
    ]);
    selectQueue.push([]); // version not found
    const res = await mediaVersionRestoreRoute.POST(
      makeReq('http://x/api/portal/media/9/versions/3/restore', { method: 'POST' }),
      { params: Promise.resolve({ id: '9', versionId: '3' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Version not found');
  });

  it('snapshots current, restores target, bumps version, deletes restored row', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });

    // current media
    selectQueue.push([
      {
        id: 9,
        clientId: 5,
        version: 4,
        filename: 'cur.png',
        storedFilename: 's-cur.png',
        mimeType: 'image/png',
        fileSize: 100,
        url: 'https://cdn/cur.png',
        uploadedBy: 42,
      },
    ]);
    // target historical version
    selectQueue.push([
      {
        id: 33,
        mediaId: 9,
        version: 2,
        filename: 'v2.png',
        storedFilename: 's-v2.png',
        mimeType: 'image/png',
        fileSize: 50,
        url: 'https://cdn/v2.png',
        uploadedBy: 9,
      },
    ]);
    // update returning -> the new "current"
    updateReturnQueue.push([
      {
        id: 9,
        version: 5,
        filename: 'v2.png',
        storedFilename: 's-v2.png',
        url: 'https://cdn/v2.png',
        fileSize: 50,
      },
    ]);

    const res = await mediaVersionRestoreRoute.POST(
      makeReq('http://x/api/portal/media/9/versions/33/restore', { method: 'POST' }),
      { params: Promise.resolve({ id: '9', versionId: '33' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(9);
    expect(body.data.version).toBe(5);

    // Snapshot of pre-restore current is inserted into mediaVersions
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('mediaVersions');
    const snap = insertCalls[0].values as Record<string, unknown>;
    expect(snap.mediaId).toBe(9);
    expect(snap.version).toBe(4); // old current version, before bump
    expect(snap.filename).toBe('cur.png');
    expect(snap.storedFilename).toBe('s-cur.png');
    expect(snap.mimeType).toBe('image/png');
    expect(snap.fileSize).toBe(100);
    expect(snap.url).toBe('https://cdn/cur.png');
    expect(snap.uploadedBy).toBe(42);

    // media row is updated with the target's content + version+1 + new uploadedBy
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('media');
    const patch = updateCalls[0].patch;
    expect(patch.filename).toBe('v2.png');
    expect(patch.storedFilename).toBe('s-v2.png');
    expect(patch.mimeType).toBe('image/png');
    expect(patch.fileSize).toBe(50);
    expect(patch.url).toBe('https://cdn/v2.png');
    expect(patch.version).toBe(5); // current.version (4) + 1
    expect(patch.uploadedBy).toBe(7); // session.user.id
    expect(patch.updatedAt).toBeInstanceOf(Date);

    // The historical row that we just restored from is deleted
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('mediaVersions');
  });
});
