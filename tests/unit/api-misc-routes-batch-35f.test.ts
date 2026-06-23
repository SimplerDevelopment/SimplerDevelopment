// @vitest-environment node
/**
 * Batch 35f — unit tests for 4 v1 public-API route.ts files.
 *
 * Routes covered:
 *  - app/api/v1/sites/[siteId]/posts/route.ts         (GET)
 *  - app/api/v1/sites/[siteId]/posts/[slug]/route.ts  (GET)
 *  - app/api/v1/sites/[siteId]/products/route.ts      (GET)
 *  - app/api/v1/sites/[siteId]/tags/route.ts          (GET)
 *
 * Strategy: mock the data-layer functions (`@/lib/data/posts`,
 * `@/lib/data/products`) and, for the tags route which queries db directly,
 * mock `@/lib/db` with a chainable select that resolves to a per-call queue.
 *
 * The withApiKeyAndCors middleware is exercised without API-key headers, so
 * validation is skipped and CORS headers are still applied to responses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — declared before any route is imported.
// ---------------------------------------------------------------------------

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  like: (a: unknown, b: unknown) => ({ op: 'like', a, b }),
  inArray: (a: unknown, b: unknown) => ({ op: 'inArray', a, b }),
  sql: Object.assign(
    (...args: unknown[]) => ({ op: 'sql', args }),
    { raw: (s: string) => ({ op: 'sql.raw', s }) },
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
}));

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
    tags: wrap('tags'),
    posts: wrap('posts'),
    categories: wrap('categories'),
    postCategories: wrap('postCategories'),
    postTags: wrap('postTags'),
    clientWebsites: wrap('clientWebsites'),
    products: wrap('products'),
    productImages: wrap('productImages'),
    productOptions: wrap('productOptions'),
    productOptionValues: wrap('productOptionValues'),
    productVariants: wrap('productVariants'),
    productCategories: wrap('productCategories'),
    bulkPricingRules: wrap('bulkPricingRules'),
    storeSettings: wrap('storeSettings'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// data/posts mocks — used by posts list, posts [slug], and tags routes.
const listPostsMock = vi.fn();
const getPostBySlugMock = vi.fn();
const verifySiteActiveMock = vi.fn();
vi.mock('@/lib/data/posts', () => ({
  listPosts: (...args: unknown[]) => listPostsMock(...args),
  getPostBySlug: (...args: unknown[]) => getPostBySlugMock(...args),
  verifySiteActive: (...args: unknown[]) => verifySiteActiveMock(...args),
}));

// data/products mocks — used by products route.
const listProductsMock = vi.fn();
vi.mock('@/lib/data/products', () => ({
  listProducts: (...args: unknown[]) => listProductsMock(...args),
}));

// API-key middleware deps: with no auth header on the request, validateApiKey
// won't even be called, but we still need the module importable.
vi.mock('@/lib/api-keys', () => ({
  validateApiKey: vi.fn(),
  checkRateLimit: vi.fn(),
}));

// ---------------------------------------------------------------------------
// db mock — used by the tags route only.
// ---------------------------------------------------------------------------

let selectQueue: Array<Array<Record<string, unknown>>> = [];

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
    for (const m of ['from', 'where', 'orderBy', 'limit', 'offset', 'leftJoin', 'innerJoin']) {
      chain[m] = passthrough;
    }
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
      return materialize().then(onF, onR);
    };
    return chain;
  }
  return {
    db: {
      select() {
        return buildSelect();
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Routes under test (imported AFTER all mocks).
// ---------------------------------------------------------------------------

const postsListRoute = await import('@/app/api/v1/sites/[siteId]/posts/route');
const postBySlugRoute = await import('@/app/api/v1/sites/[siteId]/posts/[slug]/route');
const productsRoute = await import('@/app/api/v1/sites/[siteId]/products/route');
const tagsRoute = await import('@/app/api/v1/sites/[siteId]/tags/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

function makeCtx(params: Record<string, string>) {
  return { params: Promise.resolve(params) } as unknown as {
    params: Promise<{ siteId: string; [key: string]: string }>;
  };
}

beforeEach(() => {
  selectQueue = [];
  listPostsMock.mockReset();
  getPostBySlugMock.mockReset();
  verifySiteActiveMock.mockReset();
  listProductsMock.mockReset();
});

// ===========================================================================
// GET /api/v1/sites/[siteId]/posts
// ===========================================================================

describe('GET /api/v1/sites/[siteId]/posts', () => {
  it('returns 400 when siteId is not a number', async () => {
    const res = await postsListRoute.GET(
      makeReq('http://x/api/v1/sites/abc/posts'),
      makeCtx({ siteId: 'abc' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Invalid site ID');
    expect(verifySiteActiveMock).not.toHaveBeenCalled();
  });

  it('returns 404 when site is not active', async () => {
    verifySiteActiveMock.mockResolvedValue(null);
    const res = await postsListRoute.GET(
      makeReq('http://x/api/v1/sites/7/posts'),
      makeCtx({ siteId: '7' }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
    expect(verifySiteActiveMock).toHaveBeenCalledWith(7);
    expect(listPostsMock).not.toHaveBeenCalled();
  });

  it('returns posts + applies default pagination when no query params', async () => {
    verifySiteActiveMock.mockResolvedValue({ id: 7 });
    listPostsMock.mockResolvedValue({
      data: [{ id: 1, title: 'A', slug: 'a' }],
      pagination: { limit: 20, offset: 0, total: 1 },
    });
    const res = await postsListRoute.GET(
      makeReq('http://x/api/v1/sites/7/posts'),
      makeCtx({ siteId: '7' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([{ id: 1, title: 'A', slug: 'a' }]);
    expect(body.pagination).toEqual({ limit: 20, offset: 0, total: 1 });
    expect(listPostsMock).toHaveBeenCalledTimes(1);
    expect(listPostsMock).toHaveBeenCalledWith(7, {
      limit: 20,
      offset: 0,
      postType: null,
      category: null,
      tag: null,
      search: null,
    });
  });

  it('forwards query-string filters to listPosts', async () => {
    verifySiteActiveMock.mockResolvedValue({ id: 7 });
    listPostsMock.mockResolvedValue({
      data: [],
      pagination: { limit: 5, offset: 10, total: 0 },
    });
    const res = await postsListRoute.GET(
      makeReq(
        'http://x/api/v1/sites/7/posts?limit=5&offset=10&postType=page&category=news&tag=hot&search=hello',
      ),
      makeCtx({ siteId: '7' }),
    );
    expect(res.status).toBe(200);
    expect(listPostsMock).toHaveBeenCalledWith(7, {
      limit: 5,
      offset: 10,
      postType: 'page',
      category: 'news',
      tag: 'hot',
      search: 'hello',
    });
  });

  it('applies CORS headers to the response', async () => {
    verifySiteActiveMock.mockResolvedValue({ id: 7 });
    listPostsMock.mockResolvedValue({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0 },
    });
    const res = await postsListRoute.GET(
      makeReq('http://x/api/v1/sites/7/posts'),
      makeCtx({ siteId: '7' }),
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toMatch(/GET/);
  });

  it('returns 204 on OPTIONS preflight', async () => {
    const res = await postsListRoute.GET(
      makeReq('http://x/api/v1/sites/7/posts', { method: 'OPTIONS' }),
      makeCtx({ siteId: '7' }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(verifySiteActiveMock).not.toHaveBeenCalled();
    expect(listPostsMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// GET /api/v1/sites/[siteId]/posts/[slug]
// ===========================================================================

describe('GET /api/v1/sites/[siteId]/posts/[slug]', () => {
  it('returns 400 when siteId is not a number', async () => {
    const res = await postBySlugRoute.GET(
      makeReq('http://x/api/v1/sites/zz/posts/hello'),
      makeCtx({ siteId: 'zz', slug: 'hello' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid site ID');
    expect(verifySiteActiveMock).not.toHaveBeenCalled();
  });

  it('returns 404 when site is not active', async () => {
    verifySiteActiveMock.mockResolvedValue(null);
    const res = await postBySlugRoute.GET(
      makeReq('http://x/api/v1/sites/7/posts/hello'),
      makeCtx({ siteId: '7', slug: 'hello' }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
    expect(getPostBySlugMock).not.toHaveBeenCalled();
  });

  it('returns 404 when post not found', async () => {
    verifySiteActiveMock.mockResolvedValue({ id: 7 });
    getPostBySlugMock.mockResolvedValue(null);
    const res = await postBySlugRoute.GET(
      makeReq('http://x/api/v1/sites/7/posts/hello'),
      makeCtx({ siteId: '7', slug: 'hello' }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
    expect(getPostBySlugMock).toHaveBeenCalledWith(7, 'hello');
  });

  it('returns the post when found', async () => {
    verifySiteActiveMock.mockResolvedValue({ id: 7 });
    const postRow = {
      id: 42,
      title: 'Hello World',
      slug: 'hello-world',
      categories: [{ id: 1, name: 'News', slug: 'news', color: '#fff' }],
      tags: [{ id: 2, name: 'Hot', slug: 'hot' }],
    };
    getPostBySlugMock.mockResolvedValue(postRow);
    const res = await postBySlugRoute.GET(
      makeReq('http://x/api/v1/sites/7/posts/hello-world'),
      makeCtx({ siteId: '7', slug: 'hello-world' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(42);
    expect(body.data.slug).toBe('hello-world');
    expect(body.data.categories).toHaveLength(1);
    expect(body.data.tags).toHaveLength(1);
  });

  it('returns 204 on OPTIONS preflight', async () => {
    const res = await postBySlugRoute.GET(
      makeReq('http://x/api/v1/sites/7/posts/hello', { method: 'OPTIONS' }),
      makeCtx({ siteId: '7', slug: 'hello' }),
    );
    expect(res.status).toBe(204);
    expect(getPostBySlugMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// GET /api/v1/sites/[siteId]/products
// ===========================================================================

describe('GET /api/v1/sites/[siteId]/products', () => {
  it('returns 400 when siteId is not a number', async () => {
    const res = await productsRoute.GET(
      makeReq('http://x/api/v1/sites/xx/products'),
      makeCtx({ siteId: 'xx' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid site ID');
    expect(listProductsMock).not.toHaveBeenCalled();
  });

  it('returns 404 when store is not found / not enabled', async () => {
    listProductsMock.mockResolvedValue(null);
    const res = await productsRoute.GET(
      makeReq('http://x/api/v1/sites/7/products'),
      makeCtx({ siteId: '7' }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Store not found');
  });

  it('returns products with default page/limit + null filters', async () => {
    listProductsMock.mockResolvedValue({
      data: [{ id: 1, name: 'P1' }],
      pagination: { page: 1, limit: 24, total: 1, totalPages: 1 },
    });
    const res = await productsRoute.GET(
      makeReq('http://x/api/v1/sites/7/products'),
      makeCtx({ siteId: '7' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([{ id: 1, name: 'P1' }]);
    expect(body.pagination).toEqual({ page: 1, limit: 24, total: 1, totalPages: 1 });
    expect(listProductsMock).toHaveBeenCalledWith(7, {
      category: null,
      search: null,
      sort: null,
      page: 1,
      limit: 24,
    });
  });

  it('forwards category, search, sort, page, limit query params', async () => {
    listProductsMock.mockResolvedValue({
      data: [],
      pagination: { page: 3, limit: 12, total: 0, totalPages: 0 },
    });
    const res = await productsRoute.GET(
      makeReq(
        'http://x/api/v1/sites/7/products?category=shoes&search=red&sort=price_asc&page=3&limit=12',
      ),
      makeCtx({ siteId: '7' }),
    );
    expect(res.status).toBe(200);
    expect(listProductsMock).toHaveBeenCalledWith(7, {
      category: 'shoes',
      search: 'red',
      sort: 'price_asc',
      page: 3,
      limit: 12,
    });
  });

  it('applies CORS headers to the response', async () => {
    listProductsMock.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 24, total: 0, totalPages: 0 },
    });
    const res = await productsRoute.GET(
      makeReq('http://x/api/v1/sites/7/products'),
      makeCtx({ siteId: '7' }),
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('returns 204 on OPTIONS preflight', async () => {
    const res = await productsRoute.GET(
      makeReq('http://x/api/v1/sites/7/products', { method: 'OPTIONS' }),
      makeCtx({ siteId: '7' }),
    );
    expect(res.status).toBe(204);
    expect(listProductsMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// GET /api/v1/sites/[siteId]/tags
// ===========================================================================

describe('GET /api/v1/sites/[siteId]/tags', () => {
  it('returns 400 when siteId is not a number', async () => {
    const res = await tagsRoute.GET(
      makeReq('http://x/api/v1/sites/bad/tags'),
      makeCtx({ siteId: 'bad' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid site ID');
    expect(verifySiteActiveMock).not.toHaveBeenCalled();
  });

  it('returns 404 when site is not active', async () => {
    verifySiteActiveMock.mockResolvedValue(null);
    const res = await tagsRoute.GET(
      makeReq('http://x/api/v1/sites/7/tags'),
      makeCtx({ siteId: '7' }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
    expect(verifySiteActiveMock).toHaveBeenCalledWith(7);
  });

  it('returns tags from db when site is active', async () => {
    verifySiteActiveMock.mockResolvedValue({ id: 7 });
    selectQueue.push([
      { id: 1, name: 'News', slug: 'news' },
      { id: 2, name: 'Hot Topic', slug: 'hot-topic' },
    ]);
    const res = await tagsRoute.GET(
      makeReq('http://x/api/v1/sites/7/tags'),
      makeCtx({ siteId: '7' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([
      { id: 1, name: 'News', slug: 'news' },
      { id: 2, name: 'Hot Topic', slug: 'hot-topic' },
    ]);
  });

  it('returns empty array when no tags exist', async () => {
    verifySiteActiveMock.mockResolvedValue({ id: 7 });
    selectQueue.push([]);
    const res = await tagsRoute.GET(
      makeReq('http://x/api/v1/sites/7/tags'),
      makeCtx({ siteId: '7' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('applies CORS headers to the response', async () => {
    verifySiteActiveMock.mockResolvedValue({ id: 7 });
    selectQueue.push([]);
    const res = await tagsRoute.GET(
      makeReq('http://x/api/v1/sites/7/tags'),
      makeCtx({ siteId: '7' }),
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('returns 204 on OPTIONS preflight', async () => {
    const res = await tagsRoute.GET(
      makeReq('http://x/api/v1/sites/7/tags', { method: 'OPTIONS' }),
      makeCtx({ siteId: '7' }),
    );
    expect(res.status).toBe(204);
    expect(verifySiteActiveMock).not.toHaveBeenCalled();
  });
});
