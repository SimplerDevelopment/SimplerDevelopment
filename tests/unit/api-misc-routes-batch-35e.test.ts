// @vitest-environment node
/**
 * Batch 35e — unit tests for 4 v1 site-scoped route.ts files.
 *
 * Routes covered:
 *  - app/api/v1/sites/[siteId]/config/route.ts        (GET)
 *  - app/api/v1/sites/[siteId]/media/route.ts         (GET)
 *  - app/api/v1/sites/[siteId]/navigation/route.ts    (GET)
 *  - app/api/v1/sites/[siteId]/pages/route.ts         (GET)
 *
 * Strategy: each route is wrapped by `withApiKeyAndCors`. When no auth
 * header is present, the middleware passes through to the inner handler.
 * We mock the data helpers (`getSiteConfig`, `verifySiteActive`,
 * `listPosts`, `getNavigation`) and the db (for the media route which
 * queries Drizzle directly).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — declared before any route is imported.
// ---------------------------------------------------------------------------

const getSiteConfigMock = vi.fn();
vi.mock('@/lib/data/site-config', () => ({
  getSiteConfig: (...args: unknown[]) => getSiteConfigMock(...args),
}));

const verifySiteActiveMock = vi.fn();
const listPostsMock = vi.fn();
vi.mock('@/lib/data/posts', () => ({
  verifySiteActive: (...args: unknown[]) => verifySiteActiveMock(...args),
  listPosts: (...args: unknown[]) => listPostsMock(...args),
}));

const getNavigationMock = vi.fn();
vi.mock('@/lib/data/navigation', () => ({
  getNavigation: (...args: unknown[]) => getNavigationMock(...args),
}));

// drizzle-orm operators — inert objects (used by media route).
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  like: (a: unknown, b: unknown) => ({ op: 'like', a, b }),
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

// schema — proxy tables.
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
    media: wrap('media'),
    apiKeys: wrap('apiKeys'),
  };
});

// api-keys mock — so the middleware never hits the real db even if a key
// is supplied.
vi.mock('@/lib/api-keys', () => ({
  validateApiKey: vi.fn(async () => null),
  checkRateLimit: vi.fn(() => ({
    allowed: true,
    remaining: 60,
    resetAt: new Date(Date.now() + 60_000),
  })),
}));

// ---------------------------------------------------------------------------
// db mock: select-queue for media route's parallel Promise.all queries.
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
    for (const m of [
      'from',
      'leftJoin',
      'innerJoin',
      'where',
      'orderBy',
      'groupBy',
      'limit',
      'offset',
    ]) {
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
// Routes under test (imported AFTER all mocks)
// ---------------------------------------------------------------------------

const configRoute = await import('@/app/api/v1/sites/[siteId]/config/route');
const mediaRoute = await import('@/app/api/v1/sites/[siteId]/media/route');
const navigationRoute = await import('@/app/api/v1/sites/[siteId]/navigation/route');
const pagesRoute = await import('@/app/api/v1/sites/[siteId]/pages/route');

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

function ctx(siteId: string) {
  return { params: Promise.resolve({ siteId }) };
}

beforeEach(() => {
  selectQueue = [];
  getSiteConfigMock.mockReset();
  verifySiteActiveMock.mockReset();
  listPostsMock.mockReset();
  getNavigationMock.mockReset();
});

// ===========================================================================
// GET /api/v1/sites/[siteId]/config
// ===========================================================================

describe('GET /api/v1/sites/[siteId]/config', () => {
  it('returns 400 when siteId is not numeric', async () => {
    const res = await configRoute.GET(makeReq('http://x/config'), ctx('abc'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Invalid site ID');
    expect(getSiteConfigMock).not.toHaveBeenCalled();
  });

  it('returns 404 when site config not found', async () => {
    getSiteConfigMock.mockResolvedValue(null);
    const res = await configRoute.GET(makeReq('http://x/config'), ctx('42'));
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
    expect(getSiteConfigMock).toHaveBeenCalledWith(42);
  });

  it('returns 200 with site config when found', async () => {
    const config = { id: 42, name: 'Site A', logoUrl: '/logo.png' };
    getSiteConfigMock.mockResolvedValue(config);
    const res = await configRoute.GET(makeReq('http://x/config'), ctx('42'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(config);
  });

  it('responds with CORS preflight on OPTIONS without invoking data layer', async () => {
    const res = await configRoute.GET(
      makeReq('http://x/config', { method: 'OPTIONS' }),
      ctx('42'),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(getSiteConfigMock).not.toHaveBeenCalled();
  });

  it('sets CORS headers on the success response', async () => {
    getSiteConfigMock.mockResolvedValue({ id: 1 });
    const res = await configRoute.GET(makeReq('http://x/config'), ctx('1'));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });
});

// ===========================================================================
// GET /api/v1/sites/[siteId]/media
// ===========================================================================

describe('GET /api/v1/sites/[siteId]/media', () => {
  it('returns 400 when siteId is not numeric', async () => {
    const res = await mediaRoute.GET(makeReq('http://x/media'), ctx('not-a-num'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid site ID');
    expect(verifySiteActiveMock).not.toHaveBeenCalled();
  });

  it('returns 404 when site is not active', async () => {
    verifySiteActiveMock.mockResolvedValue(null);
    const res = await mediaRoute.GET(makeReq('http://x/media'), ctx('42'));
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
    expect(verifySiteActiveMock).toHaveBeenCalledWith(42);
  });

  it('returns data + pagination when site is active', async () => {
    verifySiteActiveMock.mockResolvedValue({ id: 42, status: 'active' });
    const rows = [
      {
        id: 1,
        filename: 'a.png',
        mimeType: 'image/png',
        url: '/a.png',
        thumbnailUrl: null,
        alt: 'A',
        caption: null,
        width: 100,
        height: 100,
      },
    ];
    selectQueue.push(rows); // data query
    selectQueue.push([{ count: 1 }]); // count query

    const res = await mediaRoute.GET(makeReq('http://x/media?limit=20&offset=0'), ctx('42'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(rows);
    expect(body.pagination).toEqual({ limit: 20, offset: 0, total: 1 });
  });

  it('caps limit at 100', async () => {
    verifySiteActiveMock.mockResolvedValue({ id: 1 });
    selectQueue.push([]);
    selectQueue.push([{ count: 0 }]);

    const res = await mediaRoute.GET(makeReq('http://x/media?limit=9999'), ctx('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination.limit).toBe(100);
  });

  it('defaults limit=20 and offset=0 when query params absent', async () => {
    verifySiteActiveMock.mockResolvedValue({ id: 1 });
    selectQueue.push([]);
    selectQueue.push([{ count: 0 }]);

    const res = await mediaRoute.GET(makeReq('http://x/media'), ctx('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination).toEqual({ limit: 20, offset: 0, total: 0 });
  });

  it('passes a mimeType filter through to where conditions (smoke test)', async () => {
    verifySiteActiveMock.mockResolvedValue({ id: 1 });
    selectQueue.push([]);
    selectQueue.push([{ count: 0 }]);

    const res = await mediaRoute.GET(
      makeReq('http://x/media?mimeType=image'),
      ctx('1'),
    );
    expect(res.status).toBe(200);
    // The route should not crash with the like() condition added.
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('ignores mimeType=all (no like condition added)', async () => {
    verifySiteActiveMock.mockResolvedValue({ id: 1 });
    selectQueue.push([]);
    selectQueue.push([{ count: 0 }]);

    const res = await mediaRoute.GET(makeReq('http://x/media?mimeType=all'), ctx('1'));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('respects custom offset', async () => {
    verifySiteActiveMock.mockResolvedValue({ id: 1 });
    selectQueue.push([]);
    selectQueue.push([{ count: 0 }]);

    const res = await mediaRoute.GET(
      makeReq('http://x/media?limit=10&offset=30'),
      ctx('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination).toEqual({ limit: 10, offset: 30, total: 0 });
  });
});

// ===========================================================================
// GET /api/v1/sites/[siteId]/navigation
// ===========================================================================

describe('GET /api/v1/sites/[siteId]/navigation', () => {
  it('returns 400 when siteId is not numeric', async () => {
    const res = await navigationRoute.GET(makeReq('http://x/nav'), ctx('xyz'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid site ID');
    expect(verifySiteActiveMock).not.toHaveBeenCalled();
    expect(getNavigationMock).not.toHaveBeenCalled();
  });

  it('returns 404 when site not active', async () => {
    verifySiteActiveMock.mockResolvedValue(null);
    const res = await navigationRoute.GET(makeReq('http://x/nav'), ctx('5'));
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
    expect(getNavigationMock).not.toHaveBeenCalled();
  });

  it('returns navigation data when site active', async () => {
    verifySiteActiveMock.mockResolvedValue({ id: 5 });
    const nav = [
      { id: 1, label: 'Home', url: '/' },
      { id: 2, label: 'About', url: '/about' },
    ];
    getNavigationMock.mockResolvedValue(nav);

    const res = await navigationRoute.GET(makeReq('http://x/nav'), ctx('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(nav);
    expect(verifySiteActiveMock).toHaveBeenCalledWith(5);
    expect(getNavigationMock).toHaveBeenCalledWith(5);
  });

  it('returns empty navigation array when nothing configured', async () => {
    verifySiteActiveMock.mockResolvedValue({ id: 5 });
    getNavigationMock.mockResolvedValue([]);

    const res = await navigationRoute.GET(makeReq('http://x/nav'), ctx('5'));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });

  it('sets CORS headers on success', async () => {
    verifySiteActiveMock.mockResolvedValue({ id: 5 });
    getNavigationMock.mockResolvedValue([]);

    const res = await navigationRoute.GET(makeReq('http://x/nav'), ctx('5'));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

// ===========================================================================
// GET /api/v1/sites/[siteId]/pages
// ===========================================================================

describe('GET /api/v1/sites/[siteId]/pages', () => {
  it('returns 400 when siteId is not numeric', async () => {
    const res = await pagesRoute.GET(makeReq('http://x/pages'), ctx('nope'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid site ID');
    expect(verifySiteActiveMock).not.toHaveBeenCalled();
    expect(listPostsMock).not.toHaveBeenCalled();
  });

  it('returns 404 when site not active', async () => {
    verifySiteActiveMock.mockResolvedValue(null);
    const res = await pagesRoute.GET(makeReq('http://x/pages'), ctx('7'));
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
    expect(listPostsMock).not.toHaveBeenCalled();
  });

  it('returns list of pages with default pagination', async () => {
    verifySiteActiveMock.mockResolvedValue({ id: 7 });
    const result = {
      data: [
        { id: 1, title: 'Home', slug: 'home' },
        { id: 2, title: 'About', slug: 'about' },
      ],
      pagination: { limit: 20, offset: 0, total: 2 },
    };
    listPostsMock.mockResolvedValue(result);

    const res = await pagesRoute.GET(makeReq('http://x/pages'), ctx('7'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(result.data);
    expect(body.pagination).toEqual(result.pagination);
    expect(listPostsMock).toHaveBeenCalledWith(7, {
      limit: 20,
      offset: 0,
      postType: 'page',
      search: null,
    });
  });

  it('passes query params through to listPosts', async () => {
    verifySiteActiveMock.mockResolvedValue({ id: 7 });
    listPostsMock.mockResolvedValue({
      data: [],
      pagination: { limit: 5, offset: 10, total: 0 },
    });

    const res = await pagesRoute.GET(
      makeReq('http://x/pages?limit=5&offset=10&search=hello'),
      ctx('7'),
    );
    expect(res.status).toBe(200);
    expect(listPostsMock).toHaveBeenCalledWith(7, {
      limit: 5,
      offset: 10,
      postType: 'page',
      search: 'hello',
    });
  });

  it('returns empty data array when no pages match', async () => {
    verifySiteActiveMock.mockResolvedValue({ id: 7 });
    listPostsMock.mockResolvedValue({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0 },
    });

    const res = await pagesRoute.GET(makeReq('http://x/pages'), ctx('7'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.pagination.total).toBe(0);
  });

  it('sets CORS headers on success', async () => {
    verifySiteActiveMock.mockResolvedValue({ id: 7 });
    listPostsMock.mockResolvedValue({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0 },
    });
    const res = await pagesRoute.GET(makeReq('http://x/pages'), ctx('7'));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});
