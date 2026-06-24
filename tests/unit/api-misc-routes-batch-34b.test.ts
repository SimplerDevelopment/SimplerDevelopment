// @vitest-environment node
/**
 * Unit tests for four portal store routes (batch 34b):
 *   - app/api/portal/websites/[siteId]/store/products/[productId]/options/[optionId]/route.ts (PUT, DELETE)
 *   - app/api/portal/websites/[siteId]/store/products/[productId]/variants/route.ts          (GET, POST)
 *   - app/api/portal/websites/[siteId]/store/products/[productId]/variants/[variantId]/route.ts (PUT, DELETE)
 *   - app/api/portal/websites/[siteId]/store/settings/route.ts                               (GET, PUT)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks (declared before importing route modules)
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const resolveClientSiteMock = vi.fn();
const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  resolveClientSite: (...args: unknown[]) => resolveClientSiteMock(...args),
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

// portal-auth — mock resolveStoreSite (delegates to resolveClientSiteMock),
// authorizePortal (uses getPortalClientMock, always grants access), and isAuthError.
vi.mock('@/lib/portal-auth', async () => {
  return {
    resolveStoreSite: async (...args: unknown[]) => resolveClientSiteMock(...args),
    authorizePortal: async () => {
      const client = await getPortalClientMock();
      if (!client) {
        const { NextResponse } = await import('next/server');
        return { response: NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 }) };
      }
      return { client, userId: client.userId ?? 7, role: 'owner' };
    },
    isAuthError: (result: unknown) => result != null && typeof result === 'object' && 'response' in (result as object),
  };
});

vi.mock('@/lib/mcp-auth', () => ({
  resolvePortalFromCurrentRequest: () => Promise.resolve(null),
}));

// drizzle-orm — stub operators
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
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
          if (prop === '$inferSelect' || prop === '$inferInsert') return undefined;
          if (prop === 'then') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    products: wrap('products'),
    productOptions: wrap('productOptions'),
    productOptionValues: wrap('productOptionValues'),
    productVariants: wrap('productVariants'),
    storeSettings: wrap('storeSettings'),
    oauthAccessTokens: wrap('oauthAccessTokens'),
    oauthClients: wrap('oauthClients'),
    portalApiKeys: wrap('portalApiKeys'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// db mock — queues + capture
// ---------------------------------------------------------------------------

interface DeleteCall {
  table: string;
  filter: unknown;
}
interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
  returnedRows: Array<Record<string, unknown>>;
}
interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
const deleteCalls: DeleteCall[] = [];
const updateCalls: UpdateCall[] = [];
const insertCalls: InsertCall[] = [];

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
            const rows = updateReturnQueue.shift() ?? [];
            updateCalls.push({ table: table.__table, patch, filter, returnedRows: rows });
            const promise = Promise.resolve(rows.map((r) => ({ ...r })));
            return {
              returning() {
                return promise;
              },
              then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                return promise.then(onF, onR);
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
        deleteCalls.push({ table: table.__table, filter });
        return Promise.resolve(undefined);
      },
    };
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        insertCalls.push({ table: table.__table, values: v });
        const rows = insertReturnQueue.shift() ?? [];
        const promise = Promise.resolve(rows.map((r) => ({ ...r })));
        return {
          returning() {
            return promise;
          },
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(undefined).then(onF, onR);
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
// Import routes after mocks
// ---------------------------------------------------------------------------

const optionRoute = await import(
  '@/app/api/portal/websites/[siteId]/store/products/[productId]/options/[optionId]/route'
);
const variantsRoute = await import(
  '@/app/api/portal/websites/[siteId]/store/products/[productId]/variants/route'
);
const variantRoute = await import(
  '@/app/api/portal/websites/[siteId]/store/products/[productId]/variants/[variantId]/route'
);
const settingsRoute = await import(
  '@/app/api/portal/websites/[siteId]/store/settings/route'
);

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const SESSION = { user: { id: '7' } };

function makeJsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeBareRequest(url: string, method = 'GET'): Request {
  return new Request(url, { method });
}

function makeOptionParams(siteId: string, productId: string, optionId: string) {
  return { params: Promise.resolve({ siteId, productId, optionId }) };
}

function makeProductParams(siteId: string, productId: string) {
  return { params: Promise.resolve({ siteId, productId }) };
}

function makeVariantParams(siteId: string, productId: string, variantId: string) {
  return { params: Promise.resolve({ siteId, productId, variantId }) };
}

function makeSiteParams(siteId: string) {
  return { params: Promise.resolve({ siteId }) };
}

beforeEach(() => {
  selectQueue = [];
  updateReturnQueue = [];
  insertReturnQueue = [];
  deleteCalls.length = 0;
  updateCalls.length = 0;
  insertCalls.length = 0;
  authMock.mockReset();
  resolveClientSiteMock.mockReset();
  getPortalClientMock.mockReset();
  // userId: 7 matches SESSION.user.id → resolveRole returns 'owner' without DB
  getPortalClientMock.mockResolvedValue({ id: 33, userId: 7 });
});

// ===========================================================================
// store/products/[productId]/options/[optionId]/route.ts — PUT, DELETE
// ===========================================================================

describe('PUT /api/portal/websites/[siteId]/store/products/[productId]/options/[optionId]', () => {
  const URL = 'http://x/api/portal/websites/5/store/products/10/options/100';

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await optionRoute.PUT(
      makeJsonRequest(URL, 'PUT', { name: 'Size' }),
      makeOptionParams('5', '10', '100'),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await optionRoute.PUT(
      makeJsonRequest(URL, 'PUT', { name: 'Size' }),
      makeOptionParams('5', '10', '100'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when site is not resolvable', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue(null);
    const res = await optionRoute.PUT(
      makeJsonRequest(URL, 'PUT', { name: 'Size' }),
      makeOptionParams('5', '10', '100'),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns 404 when product is not found', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([]); // product lookup empty
    const res = await optionRoute.PUT(
      makeJsonRequest(URL, 'PUT', { name: 'Size' }),
      makeOptionParams('5', '10', '100'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when option is not found', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([{ id: 10, websiteId: 5 }]); // product
    selectQueue.push([]); // option lookup empty
    const res = await optionRoute.PUT(
      makeJsonRequest(URL, 'PUT', { name: 'Size' }),
      makeOptionParams('5', '10', '100'),
    );
    expect(res.status).toBe(404);
  });

  it('updates the option name when provided and returns updated option with values', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([{ id: 10, websiteId: 5 }]); // product
    selectQueue.push([{ id: 100, productId: 10, name: 'OldName' }]); // option resolve
    selectQueue.push([{ id: 100, productId: 10, name: 'Size' }]); // re-select updated option
    selectQueue.push([
      { id: 200, optionId: 100, value: 'S', label: 'Small', order: 0 },
      { id: 201, optionId: 100, value: 'M', label: 'Medium', order: 1 },
    ]); // values lookup

    const res = await optionRoute.PUT(
      makeJsonRequest(URL, 'PUT', { name: 'Size' }),
      makeOptionParams('5', '10', '100'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Size');
    expect(body.data.values).toHaveLength(2);
    expect(body.data.values[0].value).toBe('S');
    const upd = updateCalls.find((u) => u.table === 'productOptions');
    expect(upd).toBeDefined();
    expect(upd!.patch).toEqual({ name: 'Size' });
  });

  it('replaces option values when array provided (deletes and inserts)', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([{ id: 10, websiteId: 5 }]);
    selectQueue.push([{ id: 100, productId: 10, name: 'Size' }]);
    selectQueue.push([{ id: 100, productId: 10, name: 'Size' }]);
    selectQueue.push([
      { id: 300, optionId: 100, value: 'L', label: 'Large', order: 0 },
    ]);

    const res = await optionRoute.PUT(
      makeJsonRequest(URL, 'PUT', {
        values: [
          { value: 'L', label: 'Large' },
          { value: 'XL' }, // no label
        ],
      }),
      makeOptionParams('5', '10', '100'),
    );
    expect(res.status).toBe(200);
    expect(deleteCalls.some((d) => d.table === 'productOptionValues')).toBe(true);
    const ins = insertCalls.find((c) => c.table === 'productOptionValues');
    expect(ins).toBeDefined();
    expect(Array.isArray(ins!.values)).toBe(true);
    const valuesArr = ins!.values as Array<Record<string, unknown>>;
    expect(valuesArr).toHaveLength(2);
    expect(valuesArr[0]).toMatchObject({ optionId: 100, value: 'L', label: 'Large', order: 0 });
    expect(valuesArr[1]).toMatchObject({ optionId: 100, value: 'XL', label: null, order: 1 });
  });

  it('does not insert when values array is empty (only deletes)', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([{ id: 10, websiteId: 5 }]);
    selectQueue.push([{ id: 100, productId: 10, name: 'Size' }]);
    selectQueue.push([{ id: 100, productId: 10, name: 'Size' }]);
    selectQueue.push([]);

    const res = await optionRoute.PUT(
      makeJsonRequest(URL, 'PUT', { values: [] }),
      makeOptionParams('5', '10', '100'),
    );
    expect(res.status).toBe(200);
    expect(deleteCalls.some((d) => d.table === 'productOptionValues')).toBe(true);
    expect(insertCalls.some((c) => c.table === 'productOptionValues')).toBe(false);
  });

  it('does nothing when body has neither name nor values (returns current option + values)', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([{ id: 10, websiteId: 5 }]);
    selectQueue.push([{ id: 100, productId: 10, name: 'Size' }]);
    selectQueue.push([{ id: 100, productId: 10, name: 'Size' }]);
    selectQueue.push([]);

    const res = await optionRoute.PUT(
      makeJsonRequest(URL, 'PUT', {}),
      makeOptionParams('5', '10', '100'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(updateCalls.length).toBe(0);
    expect(deleteCalls.length).toBe(0);
    expect(insertCalls.length).toBe(0);
  });
});

describe('DELETE /api/portal/websites/[siteId]/store/products/[productId]/options/[optionId]', () => {
  const URL = 'http://x/api/portal/websites/5/store/products/10/options/100';

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await optionRoute.DELETE(
      makeBareRequest(URL, 'DELETE'),
      makeOptionParams('5', '10', '100'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when option is not found', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([{ id: 10, websiteId: 5 }]); // product
    selectQueue.push([]); // option missing
    const res = await optionRoute.DELETE(
      makeBareRequest(URL, 'DELETE'),
      makeOptionParams('5', '10', '100'),
    );
    expect(res.status).toBe(404);
  });

  it('deletes the option and returns success', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([{ id: 10, websiteId: 5 }]);
    selectQueue.push([{ id: 100, productId: 10 }]);
    const res = await optionRoute.DELETE(
      makeBareRequest(URL, 'DELETE'),
      makeOptionParams('5', '10', '100'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe('Option deleted');
    expect(deleteCalls.some((d) => d.table === 'productOptions')).toBe(true);
  });
});

// ===========================================================================
// store/products/[productId]/variants/route.ts — GET, POST
// ===========================================================================

describe('GET /api/portal/websites/[siteId]/store/products/[productId]/variants', () => {
  const URL = 'http://x/api/portal/websites/5/store/products/10/variants';

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await variantsRoute.GET(makeBareRequest(URL), makeProductParams('5', '10'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when site not resolvable', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue(null);
    const res = await variantsRoute.GET(makeBareRequest(URL), makeProductParams('5', '10'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when product not found', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([]); // product missing
    const res = await variantsRoute.GET(makeBareRequest(URL), makeProductParams('5', '10'));
    expect(res.status).toBe(404);
  });

  it('returns variants list for the product', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([{ id: 10, websiteId: 5 }]); // product
    selectQueue.push([
      { id: 1, productId: 10, name: 'Red / S', price: 100 },
      { id: 2, productId: 10, name: 'Red / M', price: 100 },
    ]);
    const res = await variantsRoute.GET(makeBareRequest(URL), makeProductParams('5', '10'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].name).toBe('Red / S');
  });
});

describe('POST /api/portal/websites/[siteId]/store/products/[productId]/variants', () => {
  const URL = 'http://x/api/portal/websites/5/store/products/10/variants';

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await variantsRoute.POST(
      makeJsonRequest(URL, 'POST', { name: 'A', price: 100 }),
      makeProductParams('5', '10'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when product not found', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([]);
    const res = await variantsRoute.POST(
      makeJsonRequest(URL, 'POST', { name: 'A', price: 100 }),
      makeProductParams('5', '10'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when name is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([{ id: 10, websiteId: 5 }]);
    const res = await variantsRoute.POST(
      makeJsonRequest(URL, 'POST', { price: 100 }),
      makeProductParams('5', '10'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/name and price are required/i);
  });

  it('returns 400 when price is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([{ id: 10, websiteId: 5 }]);
    const res = await variantsRoute.POST(
      makeJsonRequest(URL, 'POST', { name: 'A' }),
      makeProductParams('5', '10'),
    );
    expect(res.status).toBe(400);
  });

  it('creates variant with optional fields nulled when omitted', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([{ id: 10, websiteId: 5 }]);
    insertReturnQueue.push([
      { id: 99, productId: 10, name: 'Red / S', price: 100 },
    ]);
    const res = await variantsRoute.POST(
      makeJsonRequest(URL, 'POST', { name: 'Red / S', price: 100 }),
      makeProductParams('5', '10'),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(99);
    const ins = insertCalls.find((c) => c.table === 'productVariants')!;
    expect(ins.values).toMatchObject({
      productId: 10,
      name: 'Red / S',
      sku: null,
      barcode: null,
      price: 100,
      compareAtPrice: null,
      costPrice: null,
      quantity: 0,
      weight: null,
      image: null,
      optionValues: [],
    });
  });

  it('creates variant with all optional fields parsed', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([{ id: 10, websiteId: 5 }]);
    insertReturnQueue.push([{ id: 100 }]);
    const res = await variantsRoute.POST(
      makeJsonRequest(URL, 'POST', {
        name: 'Big',
        sku: 'SKU-1',
        barcode: 'B-1',
        price: '199',
        compareAtPrice: '299',
        costPrice: '50',
        quantity: 25,
        weight: 1.5,
        image: 'https://img/x.png',
        optionValues: [{ optionId: 1, value: 'L' }],
      }),
      makeProductParams('5', '10'),
    );
    expect(res.status).toBe(201);
    const ins = insertCalls.find((c) => c.table === 'productVariants')!;
    expect(ins.values).toMatchObject({
      productId: 10,
      name: 'Big',
      sku: 'SKU-1',
      barcode: 'B-1',
      price: 199,
      compareAtPrice: 299,
      costPrice: 50,
      quantity: 25,
      weight: '1.5',
      image: 'https://img/x.png',
      optionValues: [{ optionId: 1, value: 'L' }],
    });
  });

  it('treats price === 0 as valid (not missing)', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([{ id: 10, websiteId: 5 }]);
    insertReturnQueue.push([{ id: 101, price: 0 }]);
    const res = await variantsRoute.POST(
      makeJsonRequest(URL, 'POST', { name: 'Free', price: 0 }),
      makeProductParams('5', '10'),
    );
    expect(res.status).toBe(201);
    const ins = insertCalls.find((c) => c.table === 'productVariants')!;
    expect((ins.values as Record<string, unknown>).price).toBe(0);
  });
});

// ===========================================================================
// store/products/[productId]/variants/[variantId]/route.ts — PUT, DELETE
// ===========================================================================

describe('PUT /api/portal/websites/[siteId]/store/products/[productId]/variants/[variantId]', () => {
  const URL = 'http://x/api/portal/websites/5/store/products/10/variants/99';

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await variantRoute.PUT(
      makeJsonRequest(URL, 'PUT', { name: 'X' }),
      makeVariantParams('5', '10', '99'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when site not resolvable', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue(null);
    const res = await variantRoute.PUT(
      makeJsonRequest(URL, 'PUT', { name: 'X' }),
      makeVariantParams('5', '10', '99'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when product not found', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([]);
    const res = await variantRoute.PUT(
      makeJsonRequest(URL, 'PUT', { name: 'X' }),
      makeVariantParams('5', '10', '99'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when variant not found', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([{ id: 10, websiteId: 5 }]); // product
    selectQueue.push([]); // variant missing
    const res = await variantRoute.PUT(
      makeJsonRequest(URL, 'PUT', { name: 'X' }),
      makeVariantParams('5', '10', '99'),
    );
    expect(res.status).toBe(404);
  });

  it('applies provided fields and parses numerics', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([{ id: 10, websiteId: 5 }]);
    selectQueue.push([{ id: 99, productId: 10, name: 'Old' }]);
    updateReturnQueue.push([{ id: 99, name: 'New', price: 150 }]);

    const res = await variantRoute.PUT(
      makeJsonRequest(URL, 'PUT', {
        name: 'New',
        sku: 'S',
        barcode: 'B',
        price: '150',
        compareAtPrice: '200',
        costPrice: '40',
        quantity: 10,
        weight: 2.5,
        image: 'https://x',
        optionValues: [{ id: 1 }],
        active: true,
        unknownField: 'ignored',
      }),
      makeVariantParams('5', '10', '99'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(99);
    const upd = updateCalls.find((u) => u.table === 'productVariants')!;
    expect(upd.patch).toMatchObject({
      name: 'New',
      sku: 'S',
      barcode: 'B',
      price: 150,
      compareAtPrice: 200,
      costPrice: 40,
      quantity: 10,
      weight: '2.5',
      image: 'https://x',
      optionValues: [{ id: 1 }],
      active: true,
    });
    expect(upd.patch.updatedAt).toBeInstanceOf(Date);
    expect((upd.patch as Record<string, unknown>).unknownField).toBeUndefined();
  });

  it('handles explicit nulls for nullable compareAtPrice, costPrice, weight', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([{ id: 10, websiteId: 5 }]);
    selectQueue.push([{ id: 99, productId: 10 }]);
    updateReturnQueue.push([{ id: 99 }]);

    const res = await variantRoute.PUT(
      makeJsonRequest(URL, 'PUT', {
        compareAtPrice: null,
        costPrice: null,
        weight: null,
      }),
      makeVariantParams('5', '10', '99'),
    );
    expect(res.status).toBe(200);
    const upd = updateCalls.find((u) => u.table === 'productVariants')!;
    expect(upd.patch.compareAtPrice).toBeNull();
    expect(upd.patch.costPrice).toBeNull();
    expect(upd.patch.weight).toBeNull();
  });

  it('only sets updatedAt when body is empty', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([{ id: 10, websiteId: 5 }]);
    selectQueue.push([{ id: 99, productId: 10 }]);
    updateReturnQueue.push([{ id: 99 }]);

    const res = await variantRoute.PUT(
      makeJsonRequest(URL, 'PUT', {}),
      makeVariantParams('5', '10', '99'),
    );
    expect(res.status).toBe(200);
    const upd = updateCalls.find((u) => u.table === 'productVariants')!;
    expect(Object.keys(upd.patch)).toEqual(['updatedAt']);
  });
});

describe('DELETE /api/portal/websites/[siteId]/store/products/[productId]/variants/[variantId]', () => {
  const URL = 'http://x/api/portal/websites/5/store/products/10/variants/99';

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await variantRoute.DELETE(
      makeBareRequest(URL, 'DELETE'),
      makeVariantParams('5', '10', '99'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when variant not found', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([{ id: 10, websiteId: 5 }]);
    selectQueue.push([]);
    const res = await variantRoute.DELETE(
      makeBareRequest(URL, 'DELETE'),
      makeVariantParams('5', '10', '99'),
    );
    expect(res.status).toBe(404);
  });

  it('deletes the variant', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([{ id: 10, websiteId: 5 }]);
    selectQueue.push([{ id: 99, productId: 10 }]);
    const res = await variantRoute.DELETE(
      makeBareRequest(URL, 'DELETE'),
      makeVariantParams('5', '10', '99'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe('Variant deleted');
    expect(deleteCalls.some((d) => d.table === 'productVariants')).toBe(true);
  });
});

// ===========================================================================
// store/settings/route.ts — GET, PUT
// ===========================================================================

describe('GET /api/portal/websites/[siteId]/store/settings', () => {
  const URL = 'http://x/api/portal/websites/5/store/settings';

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await settingsRoute.GET(makeBareRequest(URL), makeSiteParams('5'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await settingsRoute.GET(makeBareRequest(URL), makeSiteParams('5'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when site not resolvable', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue(null);
    const res = await settingsRoute.GET(makeBareRequest(URL), makeSiteParams('5'));
    expect(res.status).toBe(404);
  });

  it('returns existing settings when row present', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([{ id: 1, websiteId: 5, storeName: 'My Store', currency: 'USD' }]);
    const res = await settingsRoute.GET(makeBareRequest(URL), makeSiteParams('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.storeName).toBe('My Store');
    expect(insertCalls.length).toBe(0);
  });

  it('creates default row when no settings exist', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([]); // no settings
    insertReturnQueue.push([{ id: 7, websiteId: 5 }]);
    const res = await settingsRoute.GET(makeBareRequest(URL), makeSiteParams('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(7);
    const ins = insertCalls.find((c) => c.table === 'storeSettings');
    expect(ins).toBeDefined();
    expect(ins!.values).toMatchObject({ websiteId: 5 });
  });
});

describe('PUT /api/portal/websites/[siteId]/store/settings', () => {
  const URL = 'http://x/api/portal/websites/5/store/settings';

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await settingsRoute.PUT(
      makeJsonRequest(URL, 'PUT', { storeName: 'X' }),
      makeSiteParams('5'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when site not resolvable', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue(null);
    const res = await settingsRoute.PUT(
      makeJsonRequest(URL, 'PUT', { storeName: 'X' }),
      makeSiteParams('5'),
    );
    expect(res.status).toBe(404);
  });

  it('updates existing settings row with all known fields', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([{ id: 1, websiteId: 5 }]); // existing
    updateReturnQueue.push([
      { id: 1, websiteId: 5, storeName: 'Updated' },
    ]);
    const res = await settingsRoute.PUT(
      makeJsonRequest(URL, 'PUT', {
        storeName: 'Updated',
        currency: 'EUR',
        taxRate: 0.21,
        taxInclusive: true,
        requiresShipping: false,
        lowStockThreshold: 5,
        orderPrefix: 'ORD-',
        enableReviews: true,
        enabled: true,
        enableCustomerAccounts: true,
        enableGuestCheckout: true,
        enableWishlist: false,
        enableOrderTracking: true,
        enableCustomerSupport: false,
        customerPortalWelcomeMessage: 'Hi',
        supportEmail: 's@x.com',
        returnPolicyUrl: 'https://x/return',
        shippingPolicyUrl: 'https://x/ship',
        unknownField: 'ignored',
      }),
      makeSiteParams('5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    const upd = updateCalls.find((u) => u.table === 'storeSettings')!;
    expect(upd.patch).toMatchObject({
      storeName: 'Updated',
      currency: 'EUR',
      taxRate: '0.21', // string-coerced
      taxInclusive: true,
      requiresShipping: false,
      lowStockThreshold: 5,
      orderPrefix: 'ORD-',
      enableReviews: true,
      enabled: true,
      enableCustomerAccounts: true,
      enableGuestCheckout: true,
      enableWishlist: false,
      enableOrderTracking: true,
      enableCustomerSupport: false,
      customerPortalWelcomeMessage: 'Hi',
      supportEmail: 's@x.com',
      returnPolicyUrl: 'https://x/return',
      shippingPolicyUrl: 'https://x/ship',
    });
    expect(upd.patch.updatedAt).toBeInstanceOf(Date);
    expect((upd.patch as Record<string, unknown>).unknownField).toBeUndefined();
    expect(insertCalls.length).toBe(0);
  });

  it('inserts settings row when none exists (upsert path)', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([]); // no existing
    insertReturnQueue.push([{ id: 99, websiteId: 5, storeName: 'New' }]);
    const res = await settingsRoute.PUT(
      makeJsonRequest(URL, 'PUT', { storeName: 'New', currency: 'USD' }),
      makeSiteParams('5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(99);
    const ins = insertCalls.find((c) => c.table === 'storeSettings')!;
    expect(ins.values).toMatchObject({
      websiteId: 5,
      storeName: 'New',
      currency: 'USD',
    });
    expect(updateCalls.length).toBe(0);
  });

  it('only sets updatedAt when body is empty (and row exists)', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([{ id: 1, websiteId: 5 }]);
    updateReturnQueue.push([{ id: 1, websiteId: 5 }]);
    const res = await settingsRoute.PUT(
      makeJsonRequest(URL, 'PUT', {}),
      makeSiteParams('5'),
    );
    expect(res.status).toBe(200);
    const upd = updateCalls.find((u) => u.table === 'storeSettings')!;
    expect(Object.keys(upd.patch)).toEqual(['updatedAt']);
  });
});
