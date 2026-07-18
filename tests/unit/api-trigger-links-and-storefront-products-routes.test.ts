// @vitest-environment node
/**
 * Unit tests for TWO routes in one file:
 *
 *   1) app/api/portal/trigger-links/route.ts (GET, POST)
 *   2) app/api/storefront/[siteId]/products/route.ts (GET)
 *
 * Strategy: mock drizzle-orm operators to plain objects, mock the schema
 * tables, and back db.select/insert with a FIFO queue of result rows. Each
 * chained step on the query builder (.from / .where / .orderBy / .limit /
 * .offset / .values / .returning) returns a thenable that resolves to the
 * next queued result. We share a single queue across both describes —
 * `beforeEach` clears it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------- shared mocks (hoisted so vi.mock can capture them) ----------

const mocks = vi.hoisted(() => {
  const dbQueue: unknown[] = [];

  function nextResult() {
    if (dbQueue.length === 0) {
      throw new Error('dbQueue exhausted — handler made more db calls than expected');
    }
    return dbQueue.shift();
  }

  function makeThenable(resolver: () => unknown) {
    const obj: Record<string, unknown> = {
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(resolver()).then(onFulfilled),
      where: vi.fn(() => makeThenable(resolver)),
      limit: vi.fn(() => makeThenable(resolver)),
      offset: vi.fn(() => makeThenable(resolver)),
      orderBy: vi.fn(() => makeThenable(resolver)),
      from: vi.fn(() => makeThenable(resolver)),
      values: vi.fn(() => makeThenable(resolver)),
      returning: vi.fn(() => makeThenable(resolver)),
      set: vi.fn(() => makeThenable(resolver)),
    };
    return obj;
  }

  const select = vi.fn(() => makeThenable(nextResult));
  const insert = vi.fn(() => makeThenable(nextResult));
  const update = vi.fn(() => makeThenable(nextResult));
  const del = vi.fn(() => makeThenable(nextResult));

  const db = { select, insert, update, delete: del };

  const authMock = vi.fn();
  const getPortalClientMock = vi.fn();
  const authorizePortalMock = vi.fn();

  return {
    dbQueue,
    db,
    select,
    insert,
    update,
    del,
    authMock,
    getPortalClientMock,
    authorizePortalMock,
  };
});

vi.mock('@/lib/db', () => ({ db: mocks.db }));

vi.mock('@/lib/auth', () => ({
  auth: () => mocks.authMock(),
}));

vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => mocks.getPortalClientMock(...args),
}));

vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => mocks.authorizePortalMock(...args),
  isAuthError: (v: unknown): v is { response: unknown } =>
    !!v && typeof v === 'object' && 'response' in (v as Record<string, unknown>),
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
    triggerLinks: wrap('triggerLinks'),
    storeSettings: wrap('storeSettings'),
    products: wrap('products'),
    productImages: wrap('productImages'),
    productCategories: wrap('productCategories'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...conds: unknown[]) => ({ op: 'and', conds }),
  or: (...conds: unknown[]) => ({ op: 'or', conds }),
  asc: (col: unknown) => ({ op: 'asc', col }),
  desc: (col: unknown) => ({ op: 'desc', col }),
  like: (a: unknown, b: unknown) => ({ op: 'like', a, b }),
  sql: Object.assign(
    function sqlTag(strings: TemplateStringsArray, ...values: unknown[]) {
      return { op: 'sql', strings: Array.from(strings), values };
    },
    {},
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ---------- import the routes AFTER mocks ----------

const triggerLinksRoute = await import('@/app/api/portal/trigger-links/route');
const productsRoute = await import('@/app/api/storefront/[siteId]/products/route');

function queue(...items: unknown[]) {
  mocks.dbQueue.push(...items);
}

beforeEach(() => {
  mocks.dbQueue.length = 0;
  mocks.select.mockClear();
  mocks.insert.mockClear();
  mocks.update.mockClear();
  mocks.del.mockClear();
  mocks.authMock.mockReset();
  mocks.getPortalClientMock.mockReset();
  mocks.authorizePortalMock.mockReset();
});

// ============================================================
// 1) /api/portal/trigger-links
// ============================================================

describe('GET /api/portal/trigger-links', () => {
  it('returns 401 when there is no session', async () => {
    mocks.authMock.mockResolvedValue(null);
    const res = await triggerLinksRoute.GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false });
  });

  it('returns 401 when session has no user id', async () => {
    mocks.authMock.mockResolvedValue({ user: {} });
    const res = await triggerLinksRoute.GET();
    expect(res.status).toBe(401);
  });

  it('short-circuits with the authorizePortal error response', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    const errResponse = new Response(JSON.stringify({ success: false, error: 'forbidden' }), {
      status: 403,
    });
    mocks.authorizePortalMock.mockResolvedValue({ response: errResponse });
    const res = await triggerLinksRoute.GET();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('forbidden');
  });

  it('returns 404 when no client is found for the user', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue(null);

    const res = await triggerLinksRoute.GET();
    expect(res.status).toBe(404);
    expect((await res.json()).success).toBe(false);
  });

  it('returns the list of links with click counts when authorized', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 42 });

    const links = [
      { id: 1, slug: 'abc12345', destinationUrl: 'https://example.com', clickCount: 3 },
      { id: 2, slug: 'xyz67890', destinationUrl: '/internal', clickCount: 0 },
    ];
    queue(links);

    const res = await triggerLinksRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.links).toEqual(links);
    expect(mocks.getPortalClientMock).toHaveBeenCalledWith(7);
  });
});

describe('POST /api/portal/trigger-links', () => {
  function req(body: unknown) {
    return new Request('http://localhost/api/portal/trigger-links', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });
  }

  function reqRaw(raw: string) {
    return new Request('http://localhost/api/portal/trigger-links', {
      method: 'POST',
      body: raw,
      headers: { 'content-type': 'application/json' },
    });
  }

  it('returns 401 with no session', async () => {
    mocks.authMock.mockResolvedValue(null);
    const res = await triggerLinksRoute.POST(req({}));
    expect(res.status).toBe(401);
  });

  it('returns the authorize error response when not authorized to write', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '3' } });
    mocks.authorizePortalMock.mockResolvedValue({
      response: new Response(JSON.stringify({ success: false }), { status: 403 }),
    });
    const res = await triggerLinksRoute.POST(req({}));
    expect(res.status).toBe(403);
  });

  it('returns 404 when no client matches the user', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '3' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue(null);
    const res = await triggerLinksRoute.POST(req({ destinationUrl: 'https://example.com' }));
    expect(res.status).toBe(404);
  });

  it('returns 400 when destinationUrl is missing', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '3' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });

    const res = await triggerLinksRoute.POST(req({ label: 'no url' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('destinationUrl is required');
  });

  it('treats invalid JSON body as empty and returns 400', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '3' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });

    const res = await triggerLinksRoute.POST(reqRaw('not-json'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when destinationUrl is non-string', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '3' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });

    const res = await triggerLinksRoute.POST(req({ destinationUrl: 12345 }));
    expect(res.status).toBe(400);
  });

  it('rejects a non-http(s) absolute URL', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '3' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });

    const res = await triggerLinksRoute.POST(req({ destinationUrl: 'ftp://example.com/x' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/http\(s\)/);
  });

  it('rejects an unparseable destinationUrl', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '3' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });

    const res = await triggerLinksRoute.POST(req({ destinationUrl: 'definitely not a url' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not a valid URL/);
  });

  it('accepts relative paths starting with /', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '3' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });

    queue([{ id: 100, slug: 'abc12345', destinationUrl: '/dashboard' }]);
    const res = await triggerLinksRoute.POST(req({ destinationUrl: '/dashboard' }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.link.id).toBe(100);
  });

  it('rejects an invalid requested slug', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '3' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });

    const res = await triggerLinksRoute.POST(
      req({ destinationUrl: 'https://example.com', slug: 'bad!slug' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/slug must be/);
  });

  it('inserts with the requested slug when valid', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '3' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });

    const row = { id: 99, slug: 'custom-slug', destinationUrl: 'https://example.com' };
    queue([row]);
    const res = await triggerLinksRoute.POST(
      req({ destinationUrl: 'https://example.com', slug: 'CUSTOM-SLUG' }), // gets lowercased
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.link).toEqual(row);
  });

  it('returns 409 with detail when requested slug collides', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '3' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });

    // Force the first (and only — requested slug) insert attempt to throw.
    mocks.insert.mockImplementationOnce(() => ({
      values: () => ({
        returning: () => Promise.reject(new Error('duplicate key value violates unique constraint')),
      }),
    }));

    const res = await triggerLinksRoute.POST(
      req({ destinationUrl: 'https://example.com', slug: 'taken' }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('slug already in use');
    expect(body.detail).toMatch(/duplicate key/);
  });

  it('returns 500 after exhausting retries on auto-generated slug collisions', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '3' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });

    // Each of the 5 attempts throws a unique-violation.
    mocks.insert.mockImplementation(() => ({
      values: () => ({
        returning: () => Promise.reject(new Error('unique constraint failed')),
      }),
    }));

    const res = await triggerLinksRoute.POST(req({ destinationUrl: 'https://example.com' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to allocate a unique slug/);
    expect(mocks.insert).toHaveBeenCalledTimes(5);
  });

  it('breaks out immediately on a non-unique-violation error and returns 500', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '3' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });

    mocks.insert.mockImplementationOnce(() => ({
      values: () => ({
        returning: () => Promise.reject(new Error('connection refused')),
      }),
    }));

    const res = await triggerLinksRoute.POST(req({ destinationUrl: 'https://example.com' }));
    expect(res.status).toBe(500);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });

  it('handles a non-Error throw value and stringifies the detail', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '3' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });

    mocks.insert.mockImplementationOnce(() => ({
      values: () => ({
        returning: () => Promise.reject('plain string error'),
      }),
    }));

    const res = await triggerLinksRoute.POST(
      req({ destinationUrl: 'https://example.com', slug: 'mine' }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).detail).toBe('plain string error');
  });

  it('persists label and contactFieldKey when provided', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '3' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });

    const captured: Record<string, unknown> = {};
    mocks.insert.mockImplementationOnce(() => ({
      values: (v: Record<string, unknown>) => {
        Object.assign(captured, v);
        return {
          returning: () => Promise.resolve([{ id: 5, slug: 'ok', ...v }]),
        };
      },
    }));

    const res = await triggerLinksRoute.POST(
      req({
        destinationUrl: 'https://example.com',
        label: 'My Link',
        contactFieldKey: 'utm_source',
        slug: 'okay-slug',
      }),
    );
    expect(res.status).toBe(200);
    expect(captured.label).toBe('My Link');
    expect(captured.contactFieldKey).toBe('utm_source');
    expect(captured.createdBy).toBe(3);
  });
});

// ============================================================
// 2) /api/storefront/[siteId]/products
// ============================================================

const STORE = { id: 1, websiteId: 1, enabled: true };

function paramsFor(siteId: string) {
  return { params: Promise.resolve({ siteId }) };
}

describe('GET /api/storefront/[siteId]/products', () => {
  it('returns 400 on a non-numeric siteId', async () => {
    const req = new Request('http://localhost/api/storefront/abc/products');
    const res = await productsRoute.GET(req, paramsFor('abc'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid site ID');
  });

  it('returns 404 when the store is missing or disabled', async () => {
    queue([]); // store lookup
    const req = new Request('http://localhost/api/storefront/1/products');
    const res = await productsRoute.GET(req, paramsFor('1'));
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Store not found');
  });

  it('returns an empty data array and zero totals when no products match', async () => {
    queue([STORE], [{ total: 0 }], []);
    const req = new Request('http://localhost/api/storefront/1/products');
    const res = await productsRoute.GET(req, paramsFor('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.pagination).toEqual({
      page: 1,
      limit: 24,
      total: 0,
      totalPages: 0,
    });
  });

  it('returns enriched products with first image and category name', async () => {
    const rows = [
      { id: 10, name: 'Widget', slug: 'widget', price: 500, categoryId: 7, createdAt: '2026-01-01' },
      { id: 11, name: 'Gadget', slug: 'gadget', price: 200, categoryId: null, createdAt: '2026-01-02' },
    ];
    const images = [
      { productId: 10, url: 'https://img/10-a.jpg' },
      { productId: 10, url: 'https://img/10-b.jpg' }, // duplicate, ignored
      { productId: 11, url: 'https://img/11.jpg' },
    ];
    const cats = [{ id: 7, name: 'Tools' }];

    queue([STORE], [{ total: 2 }], rows, images, cats);

    const req = new Request('http://localhost/api/storefront/1/products?page=1&limit=24');
    const res = await productsRoute.GET(req, paramsFor('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0].image).toBe('https://img/10-a.jpg');
    expect(body.data[0].categoryName).toBe('Tools');
    expect(body.data[1].image).toBe('https://img/11.jpg');
    expect(body.data[1].categoryName).toBeNull();
    expect(body.pagination.total).toBe(2);
    expect(body.pagination.totalPages).toBe(1);
  });

  it('applies the category filter when slug exists', async () => {
    const category = { id: 99 };
    const rows = [{ id: 1, name: 'X', slug: 'x', price: 1, categoryId: 99, createdAt: 'now' }];

    // store, category lookup, count, products, images (empty), categories
    queue([STORE], [category], [{ total: 1 }], rows, [], [{ id: 99, name: 'Cat' }]);

    const req = new Request('http://localhost/api/storefront/1/products?category=tools');
    const res = await productsRoute.GET(req, paramsFor('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].id).toBe(1);
  });

  it('ignores a category filter that does not resolve', async () => {
    queue([STORE], [] /* no category match */, [{ total: 0 }], []);
    const req = new Request('http://localhost/api/storefront/1/products?category=does-not-exist');
    const res = await productsRoute.GET(req, paramsFor('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('honors search and sort=price_asc', async () => {
    queue([STORE], [{ total: 1 }], [{ id: 1, name: 'searched', slug: 's', price: 1, categoryId: null, createdAt: 'now' }], []);
    const req = new Request('http://localhost/api/storefront/1/products?search=Widget&sort=price_asc');
    const res = await productsRoute.GET(req, paramsFor('1'));
    expect(res.status).toBe(200);
  });

  it('honors sort=price_desc', async () => {
    queue([STORE], [{ total: 0 }], []);
    const req = new Request('http://localhost/api/storefront/1/products?sort=price_desc');
    const res = await productsRoute.GET(req, paramsFor('1'));
    expect(res.status).toBe(200);
  });

  it('honors sort=featured', async () => {
    queue([STORE], [{ total: 0 }], []);
    const req = new Request('http://localhost/api/storefront/1/products?sort=featured');
    const res = await productsRoute.GET(req, paramsFor('1'));
    expect(res.status).toBe(200);
  });

  it('falls back to newest on unknown sort values', async () => {
    queue([STORE], [{ total: 0 }], []);
    const req = new Request('http://localhost/api/storefront/1/products?sort=bogus');
    const res = await productsRoute.GET(req, paramsFor('1'));
    expect(res.status).toBe(200);
  });

  it('clamps limit to 100 and page to >=1', async () => {
    queue([STORE], [{ total: 0 }], []);
    const req = new Request('http://localhost/api/storefront/1/products?limit=999&page=-3');
    const res = await productsRoute.GET(req, paramsFor('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination.limit).toBe(100);
    expect(body.pagination.page).toBe(1);
  });

  it('computes pagination.totalPages correctly with limit and total', async () => {
    queue([STORE], [{ total: 25 }], []);
    const req = new Request('http://localhost/api/storefront/1/products?limit=10');
    const res = await productsRoute.GET(req, paramsFor('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination.totalPages).toBe(3);
  });

  it('returns 500 when an unexpected error is thrown', async () => {
    // No queue → first db call throws "exhausted" → caught → 500.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const req = new Request('http://localhost/api/storefront/1/products');
    const res = await productsRoute.GET(req, paramsFor('1'));
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('Internal server error');
    errSpy.mockRestore();
  });
});
