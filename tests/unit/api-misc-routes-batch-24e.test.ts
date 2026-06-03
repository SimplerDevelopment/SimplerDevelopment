// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 24e):
 *   - app/api/storefront/[siteId]/categories/route.ts             (GET)
 *   - app/api/storefront/[siteId]/shipping/route.ts               (GET)
 *   - app/api/portal/websites/[siteId]/status/route.ts            (GET)
 *   - app/api/portal/websites/[siteId]/logs/route.ts              (GET)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    op: 'sql',
    strings: Array.from(strings),
    values,
  }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
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
    storeSettings: wrap('storeSettings'),
    productCategories: wrap('productCategories'),
    products: wrap('products'),
    shippingZones: wrap('shippingZones'),
    shippingRates: wrap('shippingRates'),
    clientWebsites: wrap('clientWebsites'),
    httpRequestLogs: wrap('httpRequestLogs'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// DB mock: thenable select chain
// ---------------------------------------------------------------------------

let selectQueue: Array<Array<Record<string, unknown>>> = [];

function shiftNext(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
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
    for (const m of ['from', 'leftJoin', 'innerJoin', 'groupBy']) {
      chain[m] = passthrough;
    }
    chain.where = () => {
      // Make `where` thenable so `await db.select().from(...).where(...)` resolves.
      materialize();
      const thenableChain = { ...chain };
      thenableChain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
        materializedPromise!.then(onF, onR);
      thenableChain.orderBy = chain.orderBy;
      thenableChain.limit = chain.limit;
      return thenableChain;
    };
    chain.orderBy = () => {
      materialize();
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
        limit(_n: number) {
          return {
            then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
              return materializedPromise!.then(onF, onR);
            },
          };
        },
      };
    };
    chain.limit = () => {
      materialize();
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
      };
    };
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
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

// ---- modules under test ----
const categoriesRoute = await import('@/app/api/storefront/[siteId]/categories/route');
const shippingRoute = await import('@/app/api/storefront/[siteId]/shipping/route');
const statusRoute = await import('@/app/api/portal/websites/[siteId]/status/route');
const logsRoute = await import('@/app/api/portal/websites/[siteId]/logs/route');

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

const SESSION = { user: { id: '7', name: 'Bob' } };

beforeEach(() => {
  selectQueue = [];
  authMock.mockReset();
  getPortalClientMock.mockReset();
  vi.restoreAllMocks();
});

// ===========================================================================
// storefront [siteId] categories
// ===========================================================================

describe('GET /api/storefront/[siteId]/categories', () => {
  it('returns 400 for non-numeric siteId', async () => {
    const res = await categoriesRoute.GET(
      makeReq('http://x/api/storefront/abc/categories'),
      { params: Promise.resolve({ siteId: 'abc' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/Invalid site ID/);
  });

  it('returns 404 when store is not enabled', async () => {
    selectQueue.push([]); // store lookup -> none
    const res = await categoriesRoute.GET(
      makeReq('http://x/api/storefront/5/categories'),
      { params: Promise.resolve({ siteId: '5' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/Store not found/);
  });

  it('returns categories with product counts on success', async () => {
    selectQueue.push([{ websiteId: 5, enabled: true }]);
    selectQueue.push([
      { id: 1, name: 'Hats', slug: 'hats', description: null, image: null, parentId: null, order: 0, productCount: 3 },
      { id: 2, name: 'Shirts', slug: 'shirts', description: null, image: null, parentId: null, order: 1, productCount: 7 },
    ]);
    const res = await categoriesRoute.GET(
      makeReq('http://x/api/storefront/5/categories'),
      { params: Promise.resolve({ siteId: '5' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].name).toBe('Hats');
  });

  it('returns 500 when the DB throws', async () => {
    // Force the store-lookup promise to reject
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Override db.select for this single call
    const { db } = await import('@/lib/db');
    const origSelect = db.select;
    (db as unknown as { select: () => unknown }).select = () => ({
      from() { return this; },
      where() { throw new Error('boom'); },
    });
    try {
      const res = await categoriesRoute.GET(
        makeReq('http://x/api/storefront/5/categories'),
        { params: Promise.resolve({ siteId: '5' }) },
      );
      expect(res.status).toBe(500);
    } finally {
      (db as unknown as { select: () => unknown }).select = origSelect;
    }
  });
});

// ===========================================================================
// storefront [siteId] shipping
// ===========================================================================

describe('GET /api/storefront/[siteId]/shipping', () => {
  it('returns 400 for non-numeric siteId', async () => {
    const res = await shippingRoute.GET(
      makeReq('http://x/api/storefront/abc/shipping?country=US'),
      { params: Promise.resolve({ siteId: 'abc' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when store is not enabled', async () => {
    selectQueue.push([]); // store lookup empty
    const res = await shippingRoute.GET(
      makeReq('http://x/api/storefront/5/shipping?country=US'),
      { params: Promise.resolve({ siteId: '5' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when country param is missing', async () => {
    selectQueue.push([{ websiteId: 5, enabled: true }]);
    const res = await shippingRoute.GET(
      makeReq('http://x/api/storefront/5/shipping'),
      { params: Promise.resolve({ siteId: '5' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/country/);
  });

  it('returns empty array when no zones match the country', async () => {
    selectQueue.push([{ websiteId: 5, enabled: true }]); // store
    selectQueue.push([
      { id: 10, websiteId: 5, active: true, name: 'CA only', countries: ['CA'], states: [] },
    ]); // zones
    const res = await shippingRoute.GET(
      makeReq('http://x/api/storefront/5/shipping?country=US'),
      { params: Promise.resolve({ siteId: '5' }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: [] });
  });

  it('returns matching rates across worldwide and country-specific zones', async () => {
    selectQueue.push([{ websiteId: 5, enabled: true }]); // store
    selectQueue.push([
      { id: 10, websiteId: 5, active: true, name: 'Worldwide', countries: [], states: [] },
      { id: 11, websiteId: 5, active: true, name: 'US East', countries: ['US'], states: ['NY', 'NJ'] },
      { id: 12, websiteId: 5, active: true, name: 'US West', countries: ['US'], states: ['CA'] },
    ]); // zones
    // rates for zone 10
    selectQueue.push([
      {
        id: 100, name: 'Standard', rateType: 'flat', price: 500, freeAbove: null,
        minDeliveryDays: 3, maxDeliveryDays: 5,
      },
    ]);
    // rates for zone 11 (NY matches)
    selectQueue.push([
      {
        id: 101, name: 'Express', rateType: 'flat', price: 1500, freeAbove: 10000,
        minDeliveryDays: 1, maxDeliveryDays: 2,
      },
    ]);
    const res = await shippingRoute.GET(
      makeReq('http://x/api/storefront/5/shipping?country=US&state=NY'),
      { params: Promise.resolve({ siteId: '5' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].zoneName).toBe('Worldwide');
    expect(body.data[1].zoneName).toBe('US East');
  });

  it('returns 500 when the DB throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { db } = await import('@/lib/db');
    const origSelect = db.select;
    (db as unknown as { select: () => unknown }).select = () => ({
      from() { return this; },
      where() { throw new Error('boom'); },
    });
    try {
      const res = await shippingRoute.GET(
        makeReq('http://x/api/storefront/5/shipping?country=US'),
        { params: Promise.resolve({ siteId: '5' }) },
      );
      expect(res.status).toBe(500);
    } finally {
      (db as unknown as { select: () => unknown }).select = origSelect;
    }
  });
});

// ===========================================================================
// portal/websites/[siteId]/status
// ===========================================================================

describe('GET /api/portal/websites/[siteId]/status', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await statusRoute.GET(
      makeReq('http://x/api/portal/websites/5/status'),
      { params: Promise.resolve({ siteId: '5' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await statusRoute.GET(
      makeReq('http://x/api/portal/websites/5/status'),
      { params: Promise.resolve({ siteId: '5' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/Client not found/);
  });

  it('returns 404 when the website does not belong to the client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // site lookup -> none
    const res = await statusRoute.GET(
      makeReq('http://x/api/portal/websites/5/status'),
      { params: Promise.resolve({ siteId: '5' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/Website not found/);
  });

  it('returns the status payload for the matching website', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const lastDeployedAt = new Date('2025-01-01T00:00:00Z');
    selectQueue.push([{
      id: 5,
      clientId: 33,
      deploymentStatus: 'deployed',
      subdomain: 'acme',
      githubRepoName: 'acme-site',
      githubRepoUrl: 'https://github.com/acme/acme-site',
      vercelProjectId: 'vp1',
      vercelProjectUrl: 'https://vercel.com/acme/p',
      vercelDomain: 'acme.vercel.app',
      lastDeployedAt,
      provisionError: null,
    }]);
    const res = await statusRoute.GET(
      makeReq('http://x/api/portal/websites/5/status'),
      { params: Promise.resolve({ siteId: '5' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.subdomain).toBe('acme');
    expect(body.data.fullDomain).toBe('acme.simplerdevelopment.com');
    expect(body.data.deploymentStatus).toBe('deployed');
  });

  it('returns null fullDomain when subdomain is null', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{
      id: 5,
      clientId: 33,
      deploymentStatus: 'pending',
      subdomain: null,
      githubRepoName: null,
      githubRepoUrl: null,
      vercelProjectId: null,
      vercelProjectUrl: null,
      vercelDomain: null,
      lastDeployedAt: null,
      provisionError: null,
    }]);
    const res = await statusRoute.GET(
      makeReq('http://x/api/portal/websites/5/status'),
      { params: Promise.resolve({ siteId: '5' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.fullDomain).toBeNull();
  });
});

// ===========================================================================
// portal/websites/[siteId]/logs
// ===========================================================================

describe('GET /api/portal/websites/[siteId]/logs', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await logsRoute.GET(
      makeReq('http://x/api/portal/websites/5/logs'),
      { params: Promise.resolve({ siteId: '5' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await logsRoute.GET(
      makeReq('http://x/api/portal/websites/5/logs'),
      { params: Promise.resolve({ siteId: '5' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/Client not found/);
  });

  it('returns 404 when the website does not belong to the client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // site lookup empty
    const res = await logsRoute.GET(
      makeReq('http://x/api/portal/websites/5/logs'),
      { params: Promise.resolve({ siteId: '5' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/Website not found/);
  });

  it('returns logs with default limit when not specified', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 5, clientId: 33 }]); // site
    selectQueue.push([
      { id: 1, websiteId: 5, method: 'GET', path: '/a', statusCode: 200 },
      { id: 2, websiteId: 5, method: 'POST', path: '/b', statusCode: 404 },
    ]); // logs
    const res = await logsRoute.GET(
      makeReq('http://x/api/portal/websites/5/logs'),
      { params: Promise.resolve({ siteId: '5' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });

  it('honors a custom limit query param', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 5, clientId: 33 }]);
    selectQueue.push([]);
    const res = await logsRoute.GET(
      makeReq('http://x/api/portal/websites/5/logs?limit=10'),
      { params: Promise.resolve({ siteId: '5' }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });
});
