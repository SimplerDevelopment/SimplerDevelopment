// @vitest-environment node
/**
 * Unit tests for THREE routes in one file:
 *
 *   1) app/api/storefront/[siteId]/account/wishlist/route.ts (GET, POST, DELETE)
 *   2) app/api/portal/trigger-links/[id]/route.ts (GET, PATCH, DELETE)
 *   3) app/api/portal/html-uploads/route.ts (POST)
 *
 * Strategy: mock drizzle-orm operators to plain objects, mock the schema
 * tables, and back db.select/insert/update/delete with a FIFO queue of result
 * rows. Each chained step on the query builder (.from / .where / .orderBy /
 * .limit / .values / .returning / .set / .innerJoin) returns a thenable that
 * resolves to the next queued result. `beforeEach` clears the queue + mocks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===========================================================================
// Shared hoisted mocks
// ===========================================================================

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
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve()
          .then(() => resolver())
          .then(onFulfilled, onRejected),
      where: vi.fn(() => makeThenable(resolver)),
      limit: vi.fn(() => makeThenable(resolver)),
      offset: vi.fn(() => makeThenable(resolver)),
      orderBy: vi.fn(() => makeThenable(resolver)),
      from: vi.fn(() => makeThenable(resolver)),
      values: vi.fn(() => makeThenable(resolver)),
      returning: vi.fn(() => makeThenable(resolver)),
      set: vi.fn(() => makeThenable(resolver)),
      innerJoin: vi.fn(() => makeThenable(resolver)),
      leftJoin: vi.fn(() => makeThenable(resolver)),
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
  const resolveClientSiteMock = vi.fn();
  const authorizePortalMock = vi.fn();
  const requireCustomerMock = vi.fn();
  const uploadToS3Mock = vi.fn();
  const cleanEmbedHtmlMock = vi.fn((s: string) => s);
  const importHtmlAssetsMock = vi.fn();

  return {
    dbQueue,
    db,
    select,
    insert,
    update,
    del,
    authMock,
    getPortalClientMock,
    resolveClientSiteMock,
    authorizePortalMock,
    requireCustomerMock,
    uploadToS3Mock,
    cleanEmbedHtmlMock,
    importHtmlAssetsMock,
  };
});

vi.mock('@/lib/db', () => ({ db: mocks.db }));

vi.mock('@/lib/auth', () => ({
  auth: () => mocks.authMock(),
}));

vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => mocks.getPortalClientMock(...args),
  resolveClientSite: (...args: unknown[]) => mocks.resolveClientSiteMock(...args),
}));

vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => mocks.authorizePortalMock(...args),
  isAuthError: (v: unknown): v is { response: unknown } =>
    !!v && typeof v === 'object' && 'response' in (v as Record<string, unknown>),
}));

vi.mock('@/lib/storefront/customer-auth', () => ({
  requireCustomer: (...args: unknown[]) => mocks.requireCustomerMock(...args),
}));

vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: (...args: unknown[]) => mocks.uploadToS3Mock(...args),
}));

vi.mock('@/lib/html-embed-clean', () => ({
  cleanEmbedHtml: (s: string) => mocks.cleanEmbedHtmlMock(s),
}));

vi.mock('@/lib/html-asset-import', () => ({
  importHtmlAssets: (...args: unknown[]) => mocks.importHtmlAssetsMock(...args),
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
  return {
    storeWishlists: wrap('storeWishlists'),
    storeWishlistItems: wrap('storeWishlistItems'),
    products: wrap('products'),
    productImages: wrap('productImages'),
    triggerLinks: wrap('triggerLinks'),
    triggerLinkClicks: wrap('triggerLinkClicks'),
    media: wrap('media'),
  };
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
}));

// ===========================================================================
// Import routes after mocks
// ===========================================================================

const wishlistRoute = await import(
  '@/app/api/storefront/[siteId]/account/wishlist/route'
);
const triggerLinkIdRoute = await import(
  '@/app/api/portal/trigger-links/[id]/route'
);
const htmlUploadsRoute = await import('@/app/api/portal/html-uploads/route');

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
  mocks.resolveClientSiteMock.mockReset();
  mocks.authorizePortalMock.mockReset();
  mocks.requireCustomerMock.mockReset();
  mocks.uploadToS3Mock.mockReset();
  mocks.cleanEmbedHtmlMock.mockReset().mockImplementation((s: string) => s);
  mocks.importHtmlAssetsMock.mockReset();
});

// ===========================================================================
// 1) /api/storefront/[siteId]/account/wishlist
// ===========================================================================

function siteParams(siteId: string) {
  return { params: Promise.resolve({ siteId }) };
}

function makeReq(url: string, init?: RequestInit): import('next/server').NextRequest {
  return new Request(url, init) as unknown as import('next/server').NextRequest;
}

describe('GET /api/storefront/[siteId]/account/wishlist', () => {
  it('returns 401 when not signed in', async () => {
    mocks.requireCustomerMock.mockResolvedValue(null);
    const res = await wishlistRoute.GET(
      makeReq('http://x/api/storefront/1/account/wishlist'),
      siteParams('1'),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('reuses existing wishlist and returns enriched items with images', async () => {
    mocks.requireCustomerMock.mockResolvedValue({ customerId: 7 });
    const wishlist = { id: 100, customerId: 7, websiteId: 1, name: 'My Wishlist', isDefault: true };
    const items = [
      {
        id: 1,
        productId: 50,
        variantId: null,
        addedAt: '2026-01-01',
        productName: 'A',
        productSlug: 'a',
        productPrice: 100,
        productCompareAtPrice: null,
        productStatus: 'active',
      },
      {
        id: 2,
        productId: 51,
        variantId: 9,
        addedAt: '2026-01-02',
        productName: 'B',
        productSlug: 'b',
        productPrice: 200,
        productCompareAtPrice: 250,
        productStatus: 'active',
      },
    ];
    const images = [{ productId: 50, url: 'https://img/50.jpg', alt: 'alt' }];

    queue([wishlist], items, images);
    const res = await wishlistRoute.GET(
      makeReq('http://x/api/storefront/1/account/wishlist'),
      siteParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.wishlist.id).toBe(100);
    expect(body.data.items).toHaveLength(2);
    expect(body.data.items[0].image).toEqual({ productId: 50, url: 'https://img/50.jpg', alt: 'alt' });
    expect(body.data.items[1].image).toBeNull();
  });

  it('creates a new wishlist when none exists', async () => {
    mocks.requireCustomerMock.mockResolvedValue({ customerId: 7 });
    const newWishlist = { id: 200, customerId: 7, websiteId: 1, name: 'My Wishlist', isDefault: true };
    // 1: empty select for existing wishlist, 2: insert returning new wishlist, 3: empty items
    queue([], [newWishlist], []);
    const res = await wishlistRoute.GET(
      makeReq('http://x/api/storefront/1/account/wishlist'),
      siteParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.wishlist.id).toBe(200);
    expect(body.data.items).toEqual([]);
    expect(mocks.insert).toHaveBeenCalled();
  });

  it('skips image lookup when there are no items', async () => {
    mocks.requireCustomerMock.mockResolvedValue({ customerId: 7 });
    const wishlist = { id: 100 };
    queue([wishlist], []); // no third call because productIds is empty
    const res = await wishlistRoute.GET(
      makeReq('http://x/api/storefront/1/account/wishlist'),
      siteParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toEqual([]);
  });
});

describe('POST /api/storefront/[siteId]/account/wishlist', () => {
  function req(body: unknown) {
    return makeReq('http://x/api/storefront/1/account/wishlist', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });
  }

  it('returns 401 when not signed in', async () => {
    mocks.requireCustomerMock.mockResolvedValue(null);
    const res = await wishlistRoute.POST(req({ productId: 1 }), siteParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when productId is missing', async () => {
    mocks.requireCustomerMock.mockResolvedValue({ customerId: 7 });
    const res = await wishlistRoute.POST(req({}), siteParams('1'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('productId is required');
  });

  it('adds new item to existing wishlist when not already present', async () => {
    mocks.requireCustomerMock.mockResolvedValue({ customerId: 7 });
    const wishlist = { id: 100 };
    const newItem = { id: 1, wishlistId: 100, productId: 50, variantId: null };
    // 1: existing wishlist, 2: existing item check (empty), 3: insert returning new item
    queue([wishlist], [], [newItem]);
    const res = await wishlistRoute.POST(req({ productId: 50 }), siteParams('1'));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
  });

  it('returns existing data when item already in wishlist', async () => {
    mocks.requireCustomerMock.mockResolvedValue({ customerId: 7 });
    const wishlist = { id: 100 };
    const existing = { id: 5 };
    queue([wishlist], [existing]);
    const res = await wishlistRoute.POST(req({ productId: 50 }), siteParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('Already in wishlist');
    expect(body.data).toEqual(existing);
  });

  it('creates wishlist when none exists then inserts item', async () => {
    mocks.requireCustomerMock.mockResolvedValue({ customerId: 7 });
    const newWishlist = { id: 300 };
    const newItem = { id: 11 };
    // 1: empty existing wishlist, 2: insert wishlist, 3: empty existing item, 4: insert item
    queue([], [newWishlist], [], [newItem]);
    const res = await wishlistRoute.POST(
      req({ productId: 50, variantId: 8 }),
      siteParams('1'),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe(11);
  });
});

describe('DELETE /api/storefront/[siteId]/account/wishlist', () => {
  function req(body: unknown) {
    return makeReq('http://x/api/storefront/1/account/wishlist', {
      method: 'DELETE',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });
  }

  it('returns 401 when not signed in', async () => {
    mocks.requireCustomerMock.mockResolvedValue(null);
    const res = await wishlistRoute.DELETE(req({ productId: 1 }), siteParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when productId is missing', async () => {
    mocks.requireCustomerMock.mockResolvedValue({ customerId: 7 });
    const res = await wishlistRoute.DELETE(req({}), siteParams('1'));
    expect(res.status).toBe(400);
  });

  it('returns success without deleting when no wishlist exists', async () => {
    mocks.requireCustomerMock.mockResolvedValue({ customerId: 7 });
    queue([]); // empty wishlist lookup
    const res = await wishlistRoute.DELETE(req({ productId: 50 }), siteParams('1'));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it('deletes the item when wishlist exists', async () => {
    mocks.requireCustomerMock.mockResolvedValue({ customerId: 7 });
    queue([{ id: 100 }], []); // wishlist lookup, then delete
    const res = await wishlistRoute.DELETE(req({ productId: 50 }), siteParams('1'));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(mocks.del).toHaveBeenCalled();
  });
});

// ===========================================================================
// 2) /api/portal/trigger-links/[id]
// ===========================================================================

function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/portal/trigger-links/[id]', () => {
  it('returns 401 when no session', async () => {
    mocks.authMock.mockResolvedValue(null);
    const res = await triggerLinkIdRoute.GET(new Request('http://x'), idParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    mocks.authMock.mockResolvedValue({ user: {} });
    const res = await triggerLinkIdRoute.GET(new Request('http://x'), idParams('1'));
    expect(res.status).toBe(401);
  });

  it('short-circuits with authorizePortal error response', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    const errResponse = new Response(JSON.stringify({ success: false }), { status: 403 });
    mocks.authorizePortalMock.mockResolvedValue({ response: errResponse });
    const res = await triggerLinkIdRoute.GET(new Request('http://x'), idParams('1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when no client matches the user', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue(null);
    const res = await triggerLinkIdRoute.GET(new Request('http://x'), idParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 on non-numeric id', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });
    const res = await triggerLinkIdRoute.GET(new Request('http://x'), idParams('abc'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid id');
  });

  it('returns 404 when link not found', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });
    queue([]); // empty link lookup
    const res = await triggerLinkIdRoute.GET(new Request('http://x'), idParams('5'));
    expect(res.status).toBe(404);
  });

  it('returns link, recent clicks, and click count when found', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });
    const link = { id: 5, slug: 'abc', destinationUrl: 'https://example.com', clientId: 1 };
    const recentClicks = [
      { id: 1, ip: '1.2.3.4', userAgent: 'ua', referer: null, occurredAt: '2026-01-01' },
    ];
    queue([link], recentClicks, [{ count: 7 }]);
    const res = await triggerLinkIdRoute.GET(new Request('http://x'), idParams('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.link).toEqual(link);
    expect(body.data.recentClicks).toEqual(recentClicks);
    expect(body.data.clickCount).toBe(7);
  });

  it('defaults clickCount to 0 when count row is missing', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });
    const link = { id: 5 };
    queue([link], [], []); // count returns empty -> default { count: 0 }
    const res = await triggerLinkIdRoute.GET(new Request('http://x'), idParams('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.clickCount).toBe(0);
  });
});

describe('PATCH /api/portal/trigger-links/[id]', () => {
  function req(body: unknown, raw?: string) {
    return new Request('http://x/api/portal/trigger-links/5', {
      method: 'PATCH',
      body: raw ?? JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });
  }

  it('returns 401 when no session', async () => {
    mocks.authMock.mockResolvedValue(null);
    const res = await triggerLinkIdRoute.PATCH(req({}), idParams('5'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when authorizePortal denies', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.authorizePortalMock.mockResolvedValue({
      response: new Response(JSON.stringify({}), { status: 403 }),
    });
    const res = await triggerLinkIdRoute.PATCH(req({}), idParams('5'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when no client', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue(null);
    const res = await triggerLinkIdRoute.PATCH(req({}), idParams('5'));
    expect(res.status).toBe(404);
  });

  it('returns 400 on non-numeric id', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });
    const res = await triggerLinkIdRoute.PATCH(req({}), idParams('not-num'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when destinationUrl is empty string', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });
    const res = await triggerLinkIdRoute.PATCH(req({ destinationUrl: '' }), idParams('5'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/destinationUrl/);
  });

  it('returns 400 when destinationUrl is not a string', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });
    const res = await triggerLinkIdRoute.PATCH(req({ destinationUrl: 42 }), idParams('5'));
    expect(res.status).toBe(400);
  });

  it('treats invalid JSON body as empty patch and still updates updatedAt', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });
    queue([{ id: 5, destinationUrl: 'https://example.com' }]);
    const res = await triggerLinkIdRoute.PATCH(req({}, 'not-json'), idParams('5'));
    expect(res.status).toBe(200);
  });

  it('returns 404 when update affects no rows', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });
    queue([]); // update returning empty
    const res = await triggerLinkIdRoute.PATCH(
      req({ destinationUrl: 'https://example.com' }),
      idParams('5'),
    );
    expect(res.status).toBe(404);
  });

  it('updates label + contactFieldKey + destinationUrl successfully', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });
    const updated = { id: 5, destinationUrl: 'https://new.example.com', label: 'L', contactFieldKey: 'k' };
    queue([updated]);
    const res = await triggerLinkIdRoute.PATCH(
      req({ destinationUrl: 'https://new.example.com', label: 'L', contactFieldKey: 'k' }),
      idParams('5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.link).toEqual(updated);
  });

  it('coerces falsy label and contactFieldKey to null', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });
    queue([{ id: 5, label: null, contactFieldKey: null }]);
    const res = await triggerLinkIdRoute.PATCH(
      req({ label: '', contactFieldKey: '' }),
      idParams('5'),
    );
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/portal/trigger-links/[id]', () => {
  it('returns 401 when no session', async () => {
    mocks.authMock.mockResolvedValue(null);
    const res = await triggerLinkIdRoute.DELETE(new Request('http://x'), idParams('5'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when authorizePortal denies', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.authorizePortalMock.mockResolvedValue({
      response: new Response(JSON.stringify({}), { status: 403 }),
    });
    const res = await triggerLinkIdRoute.DELETE(new Request('http://x'), idParams('5'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when no client', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue(null);
    const res = await triggerLinkIdRoute.DELETE(new Request('http://x'), idParams('5'));
    expect(res.status).toBe(404);
  });

  it('returns 400 on non-numeric id', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });
    const res = await triggerLinkIdRoute.DELETE(new Request('http://x'), idParams('abc'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when delete affects no rows', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });
    queue([]); // empty returning
    const res = await triggerLinkIdRoute.DELETE(new Request('http://x'), idParams('5'));
    expect(res.status).toBe(404);
  });

  it('returns success when delete succeeds', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.authorizePortalMock.mockResolvedValue({ ok: true });
    mocks.getPortalClientMock.mockResolvedValue({ id: 1 });
    queue([{ id: 5 }]);
    const res = await triggerLinkIdRoute.DELETE(new Request('http://x'), idParams('5'));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});

// ===========================================================================
// 3) /api/portal/html-uploads
// ===========================================================================

function makeFormReq(formData: FormData): import('next/server').NextRequest {
  return new Request('http://x/api/portal/html-uploads', {
    method: 'POST',
    body: formData,
  }) as unknown as import('next/server').NextRequest;
}

function makeJsonReq(): import('next/server').NextRequest {
  return new Request('http://x/api/portal/html-uploads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"not":"multipart"}',
  }) as unknown as import('next/server').NextRequest;
}

describe('POST /api/portal/html-uploads', () => {
  it('returns 401 when no session', async () => {
    mocks.authMock.mockResolvedValue(null);
    const fd = new FormData();
    fd.append('file', new File(['<html/>'], 'a.html', { type: 'text/html' }));
    const res = await htmlUploadsRoute.POST(makeFormReq(fd));
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    mocks.authMock.mockResolvedValue({ user: {} });
    const fd = new FormData();
    fd.append('file', new File(['<html/>'], 'a.html', { type: 'text/html' }));
    const res = await htmlUploadsRoute.POST(makeFormReq(fd));
    expect(res.status).toBe(401);
  });

  it('returns 403 when no portal client is found', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.getPortalClientMock.mockResolvedValue(null);
    const fd = new FormData();
    fd.append('file', new File(['<html/>'], 'a.html', { type: 'text/html' }));
    const res = await htmlUploadsRoute.POST(makeFormReq(fd));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('No portal client found');
  });

  it('returns 400 when body is not multipart form-data', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.getPortalClientMock.mockResolvedValue({ id: 10 });
    const res = await htmlUploadsRoute.POST(makeJsonReq());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/multipart/);
  });

  it('returns 400 when no file is provided', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.getPortalClientMock.mockResolvedValue({ id: 10 });
    const fd = new FormData();
    const res = await htmlUploadsRoute.POST(makeFormReq(fd));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('No file provided');
  });

  it('rejects non-html extensions', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.getPortalClientMock.mockResolvedValue({ id: 10 });
    const fd = new FormData();
    fd.append('file', new File(['data'], 'malware.exe', { type: 'text/html' }));
    const res = await htmlUploadsRoute.POST(makeFormReq(fd));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/\.html, \.htm, or \.xhtml/);
  });

  it('rejects disallowed reported mime type', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.getPortalClientMock.mockResolvedValue({ id: 10 });
    const fd = new FormData();
    fd.append('file', new File(['<html/>'], 'a.html', { type: 'application/pdf' }));
    const res = await htmlUploadsRoute.POST(makeFormReq(fd));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/MIME type/);
  });

  it('rejects file exceeding 1MB', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.getPortalClientMock.mockResolvedValue({ id: 10 });
    const big = 'x'.repeat(1_000_001);
    const fd = new FormData();
    fd.append('file', new File([big], 'big.html', { type: 'text/html' }));
    const res = await htmlUploadsRoute.POST(makeFormReq(fd));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/exceeds/);
  });

  it('uploads and inserts a media row, returns 201 (without websiteId)', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.getPortalClientMock.mockResolvedValue({ id: 10 });
    mocks.uploadToS3Mock.mockResolvedValue({
      storedFilename: 'media/abc/file.html',
      fileSize: 24,
      url: 'https://cdn.example/media/abc/file.html',
    });
    queue([
      { id: 99, url: 'https://cdn.example/media/abc/file.html', filename: 'page.html', fileSize: 24 },
    ]);

    const fd = new FormData();
    fd.append('file', new File(['<html/>'], 'page.html', { type: 'text/html' }));
    const res = await htmlUploadsRoute.POST(makeFormReq(fd));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(99);
    expect(mocks.cleanEmbedHtmlMock).toHaveBeenCalledTimes(1);
    expect(mocks.importHtmlAssetsMock).not.toHaveBeenCalled();
    expect(mocks.resolveClientSiteMock).not.toHaveBeenCalled();
  });

  it('imports html assets when websiteId resolves successfully', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.getPortalClientMock.mockResolvedValue({ id: 10 });
    mocks.resolveClientSiteMock.mockResolvedValue({ id: 55 });
    mocks.importHtmlAssetsMock.mockResolvedValue({ html: '<html>processed</html>' });
    mocks.uploadToS3Mock.mockResolvedValue({
      storedFilename: 'media/abc/page.html',
      fileSize: 20,
      url: 'https://cdn.example/media/abc/page.html',
    });
    queue([{ id: 99, url: 'https://cdn.example/media/abc/page.html', filename: 'page.html', fileSize: 20 }]);

    const fd = new FormData();
    fd.append('file', new File(['<html/>'], 'page.html', { type: 'text/html' }));
    fd.append('websiteId', '55');
    fd.append('sourceUrl', 'https://orig.example/page');

    const res = await htmlUploadsRoute.POST(makeFormReq(fd));
    expect(res.status).toBe(201);
    expect(mocks.importHtmlAssetsMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        websiteId: 55,
        clientId: 10,
        uploadedBy: 7,
        baseUrl: 'https://orig.example/page',
      }),
    );
  });

  it('skips asset import when websiteId does not resolve to a site', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.getPortalClientMock.mockResolvedValue({ id: 10 });
    mocks.resolveClientSiteMock.mockResolvedValue(null);
    mocks.uploadToS3Mock.mockResolvedValue({
      storedFilename: 'media/abc/page.html',
      fileSize: 20,
      url: 'https://cdn.example/media/abc/page.html',
    });
    queue([{ id: 99, url: 'https://cdn.example/media/abc/page.html', filename: 'page.html', fileSize: 20 }]);

    const fd = new FormData();
    fd.append('file', new File(['<html/>'], 'page.html', { type: 'text/html' }));
    fd.append('websiteId', '55');

    const res = await htmlUploadsRoute.POST(makeFormReq(fd));
    expect(res.status).toBe(201);
    expect(mocks.importHtmlAssetsMock).not.toHaveBeenCalled();
  });

  it('ignores non-finite websiteId values', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.getPortalClientMock.mockResolvedValue({ id: 10 });
    mocks.uploadToS3Mock.mockResolvedValue({
      storedFilename: 'media/abc/page.html',
      fileSize: 20,
      url: 'https://cdn.example/media/abc/page.html',
    });
    queue([{ id: 99, url: 'https://cdn.example/media/abc/page.html', filename: 'page.html', fileSize: 20 }]);

    const fd = new FormData();
    fd.append('file', new File(['<html/>'], 'page.html', { type: 'text/html' }));
    fd.append('websiteId', 'not-a-number');

    const res = await htmlUploadsRoute.POST(makeFormReq(fd));
    expect(res.status).toBe(201);
    expect(mocks.resolveClientSiteMock).not.toHaveBeenCalled();
    expect(mocks.importHtmlAssetsMock).not.toHaveBeenCalled();
  });

  it('returns 500 when uploadToS3 throws', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.getPortalClientMock.mockResolvedValue({ id: 10 });
    mocks.uploadToS3Mock.mockRejectedValue(new Error('s3 boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const fd = new FormData();
    fd.append('file', new File(['<html/>'], 'page.html', { type: 'text/html' }));
    const res = await htmlUploadsRoute.POST(makeFormReq(fd));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/s3 boom/);

    errSpy.mockRestore();
  });

  it('returns 500 with "Unknown error" when a non-Error is thrown', async () => {
    mocks.authMock.mockResolvedValue({ user: { id: '7' } });
    mocks.getPortalClientMock.mockResolvedValue({ id: 10 });
    mocks.uploadToS3Mock.mockRejectedValue('plain string');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const fd = new FormData();
    fd.append('file', new File(['<html/>'], 'page.html', { type: 'text/html' }));
    const res = await htmlUploadsRoute.POST(makeFormReq(fd));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/Unknown error/);

    errSpy.mockRestore();
  });
});
