// @vitest-environment node
/**
 * Unit tests for three high-value routes (parallel coverage-climb worker):
 *
 *   1. GET    /api/portal/websites/[siteId]/store/analytics
 *   2. GET|POST|PUT|DELETE /api/portal/websites/[siteId]/store/products/[productId]/bulk-pricing
 *   3. GET    /api/cron/surveys-zero-responses  (complementary cases only —
 *      base coverage is in tests/unit/cron-surveys-zero-responses.test.ts)
 *
 * Every external dependency is mocked: auth, resolveClientSite, the Drizzle db
 * fluent builder, schema column refs, drizzle-orm helpers, and the CRM helper.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// drizzle-orm helpers (shared across all three routes)
// ---------------------------------------------------------------------------

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  gte: (a: unknown, b: unknown) => ({ op: 'gte', a, b }),
  lte: (a: unknown, b: unknown) => ({ op: 'lte', a, b }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  count: () => ({ __agg: 'count' }),
  sum: (col: unknown) => ({ __agg: 'sum', col }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const tag = {
        __sql: true,
        strings: Array.from(strings),
        values,
        as(alias: string) {
          return { ...tag, __alias: alias };
        },
      };
      return tag;
    },
    {
      join: (parts: unknown[], sep: unknown) => ({ __sqlJoin: true, parts, sep }),
    },
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ---------------------------------------------------------------------------
// Schema mocks — proxied table objects so `table.col` returns `{ __col, __table }`
// ---------------------------------------------------------------------------

function makeTableProxy(name: string) {
  const target: Record<string, unknown> = {
    __table: name,
    __isTable: true,
    $inferSelect: {},
  };
  return new Proxy(target, {
    get(t: Record<string, unknown>, prop: string | symbol) {
      if (prop === '__table') return name;
      if (prop === '__isTable') return true;
      if (prop === '$inferSelect') return t.$inferSelect;
      if (prop === 'then') return undefined;
      if (typeof prop === 'symbol') return undefined;
      return { __col: prop, __table: name };
    },
  });
}

vi.mock('@/lib/db/schema', () => ({
  orders: makeTableProxy('orders'),
  orderItems: makeTableProxy('orderItems'),
  products: makeTableProxy('products'),
  bulkPricingRules: makeTableProxy('bulkPricingRules'),
}));

vi.mock('@/lib/db/schema/surveys', () => ({
  surveys: makeTableProxy('surveys'),
  surveyResponses: makeTableProxy('surveyResponses'),
}));

vi.mock('@/lib/db/schema/crm', () => ({
  crmNotifications: makeTableProxy('crmNotifications'),
}));

// ---------------------------------------------------------------------------
// Auth + site resolver mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const resolveClientSiteMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  resolveClientSite: (...args: unknown[]) => resolveClientSiteMock(...args),
}));

const createCrmNotificationMock = vi.fn().mockResolvedValue({ id: 1 });
vi.mock('@/lib/crm/notifications', () => ({
  createCrmNotification: (...args: unknown[]) => createCrmNotificationMock(...args),
}));

// ---------------------------------------------------------------------------
// Generic queue-based db mock
//
// Routes use chained query-builder calls that end in `await`. We model the
// builder as a thenable that yields the next entry from `selectQueue`,
// `insertQueue`, etc. when awaited. For ergonomic test setup, each test pushes
// the expected result-rows for each `await db.<verb>(...)` call in order.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

const selectQueue: Row[][] = [];
const insertQueue: Row[][] = [];
const updateQueue: Row[][] = [];
const deleteQueue: Row[][] = [];

vi.mock('@/lib/db', () => {
  function makeSelectChain() {
    const chain: Record<string, unknown> = {
      from: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      where: () => chain,
      groupBy: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then(resolve: (v: Row[]) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(selectQueue.shift() ?? []).then(resolve, reject);
      },
    };
    return chain;
  }

  function makeInsertChain() {
    const chain: Record<string, unknown> = {
      values: () => chain,
      returning() {
        return Promise.resolve(insertQueue.shift() ?? []);
      },
      then(resolve: (v: Row[]) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(insertQueue.shift() ?? []).then(resolve, reject);
      },
    };
    return chain;
  }

  function makeUpdateChain() {
    const chain: Record<string, unknown> = {
      set: () => chain,
      where: () => chain,
      returning() {
        return Promise.resolve(updateQueue.shift() ?? []);
      },
      then(resolve: (v: Row[]) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(updateQueue.shift() ?? []).then(resolve, reject);
      },
    };
    return chain;
  }

  function makeDeleteChain() {
    const chain: Record<string, unknown> = {
      where: () => chain,
      then(resolve: (v: Row[]) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(deleteQueue.shift() ?? []).then(resolve, reject);
      },
    };
    return chain;
  }

  return {
    db: {
      select: (..._args: unknown[]) => makeSelectChain(),
      insert: (..._args: unknown[]) => makeInsertChain(),
      update: (..._args: unknown[]) => makeUpdateChain(),
      delete: (..._args: unknown[]) => makeDeleteChain(),
    },
  };
});

beforeEach(() => {
  selectQueue.length = 0;
  insertQueue.length = 0;
  updateQueue.length = 0;
  deleteQueue.length = 0;
  authMock.mockReset();
  resolveClientSiteMock.mockReset();
  createCrmNotificationMock.mockClear();
  authMock.mockResolvedValue({ user: { id: '7' } });
  resolveClientSiteMock.mockResolvedValue({ id: 10 });
});

// ---------------------------------------------------------------------------
// 1. GET /api/portal/websites/[siteId]/store/analytics
// ---------------------------------------------------------------------------

describe('GET /api/portal/websites/[siteId]/store/analytics', () => {
  function makeReq(period?: string): Request {
    const qs = period ? `?period=${period}` : '';
    return new Request(`http://x/api/portal/websites/1/store/analytics${qs}`);
  }
  function ctx(siteId = '1') {
    return { params: Promise.resolve({ siteId }) };
  }

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValueOnce(null);
    const { GET } = await import(
      '@/app/api/portal/websites/[siteId]/store/analytics/route'
    );
    const res = await GET(makeReq(), ctx());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const { GET } = await import(
      '@/app/api/portal/websites/[siteId]/store/analytics/route'
    );
    const res = await GET(makeReq(), ctx());
    expect(res.status).toBe(401);
  });

  it('returns 404 when client site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const { GET } = await import(
      '@/app/api/portal/websites/[siteId]/store/analytics/route'
    );
    const res = await GET(makeReq(), ctx());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Not found');
  });

  it('returns empty/zero analytics when no orders exist (default 30d period)', async () => {
    // 4 select calls: revenue, topProducts, revenueByDay, ordersByStatus
    selectQueue.push([{ totalRevenue: null, totalOrders: 0 }]);
    selectQueue.push([]);
    selectQueue.push([]);
    selectQueue.push([]);

    const { GET } = await import(
      '@/app/api/portal/websites/[siteId]/store/analytics/route'
    );
    const res = await GET(makeReq(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.totalRevenue).toBe(0);
    expect(body.data.totalOrders).toBe(0);
    expect(body.data.averageOrderValue).toBe(0);
    expect(body.data.topProducts).toEqual([]);
    expect(body.data.revenueByDay).toEqual([]);
    expect(body.data.ordersByStatus).toEqual({});
    expect(body.data.period).toBe('30d');
  });

  it('computes averageOrderValue and projects topProducts + revenueByDay', async () => {
    selectQueue.push([{ totalRevenue: '1000', totalOrders: 4 }]);
    selectQueue.push([
      { productId: 1, productName: 'Hat', totalRevenue: '500', totalQuantity: '5' },
      { productId: 2, productName: 'Cap', totalRevenue: '300', totalQuantity: '3' },
    ]);
    selectQueue.push([
      { date: '2026-05-01', revenue: '600', orderCount: 2 },
      { date: '2026-05-02', revenue: '400', orderCount: 2 },
    ]);
    selectQueue.push([
      { status: 'pending', count: 1 },
      { status: 'fulfilled', count: 3 },
    ]);

    const { GET } = await import(
      '@/app/api/portal/websites/[siteId]/store/analytics/route'
    );
    const res = await GET(makeReq('30d'), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.totalRevenue).toBe(1000);
    expect(body.data.totalOrders).toBe(4);
    expect(body.data.averageOrderValue).toBe(250);
    expect(body.data.topProducts).toHaveLength(2);
    expect(body.data.topProducts[0]).toMatchObject({
      productId: 1,
      productName: 'Hat',
      totalRevenue: 500,
      totalQuantity: 5,
    });
    expect(body.data.revenueByDay).toEqual([
      { date: '2026-05-01', revenue: 600, orderCount: 2 },
      { date: '2026-05-02', revenue: 400, orderCount: 2 },
    ]);
    expect(body.data.ordersByStatus).toEqual({ pending: 1, fulfilled: 3 });
    expect(body.data.period).toBe('30d');
  });

  it('handles null/missing totalRevenue and totalQuantity in topProducts', async () => {
    selectQueue.push([{ totalRevenue: null, totalOrders: 0 }]);
    selectQueue.push([
      { productId: 3, productName: 'Free', totalRevenue: null, totalQuantity: null },
    ]);
    selectQueue.push([]);
    selectQueue.push([]);

    const { GET } = await import(
      '@/app/api/portal/websites/[siteId]/store/analytics/route'
    );
    const res = await GET(makeReq(), ctx());
    const body = await res.json();
    expect(body.data.topProducts[0]).toMatchObject({
      productId: 3,
      totalRevenue: 0,
      totalQuantity: 0,
    });
  });

  it('echoes the requested period back when 7d', async () => {
    selectQueue.push([{ totalRevenue: '0', totalOrders: 0 }]);
    selectQueue.push([]);
    selectQueue.push([]);
    selectQueue.push([]);

    const { GET } = await import(
      '@/app/api/portal/websites/[siteId]/store/analytics/route'
    );
    const res = await GET(makeReq('7d'), ctx());
    const body = await res.json();
    expect(body.data.period).toBe('7d');
  });

  it('echoes the requested period back when 90d', async () => {
    selectQueue.push([{ totalRevenue: '0', totalOrders: 0 }]);
    selectQueue.push([]);
    selectQueue.push([]);
    selectQueue.push([]);
    const { GET } = await import(
      '@/app/api/portal/websites/[siteId]/store/analytics/route'
    );
    const res = await GET(makeReq('90d'), ctx());
    const body = await res.json();
    expect(body.data.period).toBe('90d');
  });

  it('echoes the requested period back when 12m', async () => {
    selectQueue.push([{ totalRevenue: '0', totalOrders: 0 }]);
    selectQueue.push([]);
    selectQueue.push([]);
    selectQueue.push([]);
    const { GET } = await import(
      '@/app/api/portal/websites/[siteId]/store/analytics/route'
    );
    const res = await GET(makeReq('12m'), ctx());
    const body = await res.json();
    expect(body.data.period).toBe('12m');
  });

  it('falls back to 30d when period is an unknown value', async () => {
    selectQueue.push([{ totalRevenue: '0', totalOrders: 0 }]);
    selectQueue.push([]);
    selectQueue.push([]);
    selectQueue.push([]);
    const { GET } = await import(
      '@/app/api/portal/websites/[siteId]/store/analytics/route'
    );
    const res = await GET(makeReq('garbage'), ctx());
    const body = await res.json();
    expect(body.data.period).toBe('garbage');
  });

  it('rounds averageOrderValue (integer math)', async () => {
    selectQueue.push([{ totalRevenue: '100', totalOrders: 3 }]);
    selectQueue.push([]);
    selectQueue.push([]);
    selectQueue.push([]);
    const { GET } = await import(
      '@/app/api/portal/websites/[siteId]/store/analytics/route'
    );
    const res = await GET(makeReq(), ctx());
    const body = await res.json();
    // 100 / 3 = 33.33 → Math.round → 33
    expect(body.data.averageOrderValue).toBe(33);
  });
});

// ---------------------------------------------------------------------------
// 2. /api/portal/websites/[siteId]/store/products/[productId]/bulk-pricing
// ---------------------------------------------------------------------------

describe('bulk-pricing route', () => {
  function ctx(siteId = '1', productId = '1') {
    return { params: Promise.resolve({ siteId, productId }) };
  }
  function makeReq(method: string, body?: unknown, query = ''): Request {
    return new Request(
      `http://x/api/portal/websites/1/store/products/1/bulk-pricing${query}`,
      {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      },
    );
  }

  describe('GET', () => {
    it('returns 401 when unauthenticated', async () => {
      authMock.mockResolvedValueOnce(null);
      const { GET } = await import(
        '@/app/api/portal/websites/[siteId]/store/products/[productId]/bulk-pricing/route'
      );
      const res = await GET(makeReq('GET'), ctx());
      expect(res.status).toBe(401);
    });

    it('returns 404 when site cannot be resolved', async () => {
      resolveClientSiteMock.mockResolvedValueOnce(null);
      const { GET } = await import(
        '@/app/api/portal/websites/[siteId]/store/products/[productId]/bulk-pricing/route'
      );
      const res = await GET(makeReq('GET'), ctx());
      expect(res.status).toBe(404);
    });

    it('returns 404 when product does not exist for the site', async () => {
      // resolveProduct: product lookup → empty
      selectQueue.push([]);
      const { GET } = await import(
        '@/app/api/portal/websites/[siteId]/store/products/[productId]/bulk-pricing/route'
      );
      const res = await GET(makeReq('GET'), ctx());
      expect(res.status).toBe(404);
    });

    it('lists rules for the product when authorized', async () => {
      selectQueue.push([{ id: 1, websiteId: 10, name: 'Hat' }]); // product
      selectQueue.push([
        { id: 11, productId: 1, minQuantity: 5, amount: 90 },
        { id: 12, productId: 1, minQuantity: 10, amount: 80 },
      ]); // rules
      const { GET } = await import(
        '@/app/api/portal/websites/[siteId]/store/products/[productId]/bulk-pricing/route'
      );
      const res = await GET(makeReq('GET'), ctx());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].minQuantity).toBe(5);
    });
  });

  describe('POST', () => {
    it('returns 401 when unauthenticated', async () => {
      authMock.mockResolvedValueOnce(null);
      const { POST } = await import(
        '@/app/api/portal/websites/[siteId]/store/products/[productId]/bulk-pricing/route'
      );
      const res = await POST(makeReq('POST', { minQuantity: 5, amount: 90 }), ctx());
      expect(res.status).toBe(401);
    });

    it('returns 404 when product does not exist', async () => {
      selectQueue.push([]); // product lookup fails
      const { POST } = await import(
        '@/app/api/portal/websites/[siteId]/store/products/[productId]/bulk-pricing/route'
      );
      const res = await POST(makeReq('POST', { minQuantity: 5, amount: 90 }), ctx());
      expect(res.status).toBe(404);
    });

    it('returns 400 when minQuantity is missing', async () => {
      selectQueue.push([{ id: 1, websiteId: 10 }]);
      const { POST } = await import(
        '@/app/api/portal/websites/[siteId]/store/products/[productId]/bulk-pricing/route'
      );
      const res = await POST(makeReq('POST', { amount: 90 }), ctx());
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/minQuantity and amount/);
    });

    it('returns 400 when amount is missing', async () => {
      selectQueue.push([{ id: 1, websiteId: 10 }]);
      const { POST } = await import(
        '@/app/api/portal/websites/[siteId]/store/products/[productId]/bulk-pricing/route'
      );
      const res = await POST(makeReq('POST', { minQuantity: 5 }), ctx());
      expect(res.status).toBe(400);
    });

    it('inserts a rule and returns 201 with defaults applied', async () => {
      selectQueue.push([{ id: 1, websiteId: 10 }]); // product
      insertQueue.push([
        {
          id: 100,
          productId: 1,
          variantId: null,
          minQuantity: 5,
          maxQuantity: null,
          priceType: 'fixed',
          amount: 90,
        },
      ]);
      const { POST } = await import(
        '@/app/api/portal/websites/[siteId]/store/products/[productId]/bulk-pricing/route'
      );
      const res = await POST(makeReq('POST', { minQuantity: 5, amount: 90 }), ctx());
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(100);
      expect(body.data.priceType).toBe('fixed');
    });

    it('inserts a rule with optional variantId/maxQuantity/priceType coerced from strings', async () => {
      selectQueue.push([{ id: 1, websiteId: 10 }]);
      insertQueue.push([
        {
          id: 101,
          productId: 1,
          variantId: 7,
          minQuantity: 5,
          maxQuantity: 10,
          priceType: 'percent',
          amount: 15,
        },
      ]);
      const { POST } = await import(
        '@/app/api/portal/websites/[siteId]/store/products/[productId]/bulk-pricing/route'
      );
      const res = await POST(
        makeReq('POST', {
          variantId: '7',
          minQuantity: '5',
          maxQuantity: '10',
          priceType: 'percent',
          amount: '15',
        }),
        ctx(),
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.variantId).toBe(7);
      expect(body.data.maxQuantity).toBe(10);
      expect(body.data.priceType).toBe('percent');
    });
  });

  describe('PUT', () => {
    it('returns 401 when unauthenticated', async () => {
      authMock.mockResolvedValueOnce(null);
      const { PUT } = await import(
        '@/app/api/portal/websites/[siteId]/store/products/[productId]/bulk-pricing/route'
      );
      const res = await PUT(makeReq('PUT', { amount: 50 }, '?id=1'), ctx());
      expect(res.status).toBe(401);
    });

    it('returns 404 when product does not exist', async () => {
      selectQueue.push([]);
      const { PUT } = await import(
        '@/app/api/portal/websites/[siteId]/store/products/[productId]/bulk-pricing/route'
      );
      const res = await PUT(makeReq('PUT', { amount: 50 }, '?id=1'), ctx());
      expect(res.status).toBe(404);
    });

    it('returns 400 when id query param is missing', async () => {
      selectQueue.push([{ id: 1, websiteId: 10 }]);
      const { PUT } = await import(
        '@/app/api/portal/websites/[siteId]/store/products/[productId]/bulk-pricing/route'
      );
      const res = await PUT(makeReq('PUT', { amount: 50 }), ctx());
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/id query param/);
    });

    it('returns 404 when the rule does not belong to the product', async () => {
      selectQueue.push([{ id: 1, websiteId: 10 }]); // product
      selectQueue.push([]); // rule lookup misses
      const { PUT } = await import(
        '@/app/api/portal/websites/[siteId]/store/products/[productId]/bulk-pricing/route'
      );
      const res = await PUT(makeReq('PUT', { amount: 50 }, '?id=999'), ctx());
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.message).toBe('Rule not found');
    });

    it('updates only the fields provided in the body', async () => {
      selectQueue.push([{ id: 1, websiteId: 10 }]); // product
      selectQueue.push([{ id: 11, productId: 1, minQuantity: 5, amount: 90 }]); // existing
      updateQueue.push([
        {
          id: 11,
          productId: 1,
          variantId: 2,
          minQuantity: 6,
          maxQuantity: 12,
          priceType: 'fixed',
          amount: 70,
        },
      ]);
      const { PUT } = await import(
        '@/app/api/portal/websites/[siteId]/store/products/[productId]/bulk-pricing/route'
      );
      const res = await PUT(
        makeReq(
          'PUT',
          {
            variantId: '2',
            minQuantity: '6',
            maxQuantity: '12',
            priceType: 'fixed',
            amount: '70',
          },
          '?id=11',
        ),
        ctx(),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.minQuantity).toBe(6);
      expect(body.data.amount).toBe(70);
    });

    it('accepts null for nullable variantId/maxQuantity', async () => {
      selectQueue.push([{ id: 1, websiteId: 10 }]);
      selectQueue.push([{ id: 12, productId: 1 }]);
      updateQueue.push([
        { id: 12, productId: 1, variantId: null, maxQuantity: null, amount: 80 },
      ]);
      const { PUT } = await import(
        '@/app/api/portal/websites/[siteId]/store/products/[productId]/bulk-pricing/route'
      );
      const res = await PUT(
        makeReq('PUT', { variantId: null, maxQuantity: null }, '?id=12'),
        ctx(),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.variantId).toBeNull();
      expect(body.data.maxQuantity).toBeNull();
    });
  });

  describe('DELETE', () => {
    it('returns 401 when unauthenticated', async () => {
      authMock.mockResolvedValueOnce(null);
      const { DELETE } = await import(
        '@/app/api/portal/websites/[siteId]/store/products/[productId]/bulk-pricing/route'
      );
      const res = await DELETE(makeReq('DELETE', undefined, '?id=1'), ctx());
      expect(res.status).toBe(401);
    });

    it('returns 404 when product does not exist', async () => {
      selectQueue.push([]);
      const { DELETE } = await import(
        '@/app/api/portal/websites/[siteId]/store/products/[productId]/bulk-pricing/route'
      );
      const res = await DELETE(makeReq('DELETE', undefined, '?id=1'), ctx());
      expect(res.status).toBe(404);
    });

    it('returns 400 when id query param is missing', async () => {
      selectQueue.push([{ id: 1, websiteId: 10 }]);
      const { DELETE } = await import(
        '@/app/api/portal/websites/[siteId]/store/products/[productId]/bulk-pricing/route'
      );
      const res = await DELETE(makeReq('DELETE'), ctx());
      expect(res.status).toBe(400);
    });

    it('returns 404 when the rule does not exist for this product', async () => {
      selectQueue.push([{ id: 1, websiteId: 10 }]); // product
      selectQueue.push([]); // rule lookup misses
      const { DELETE } = await import(
        '@/app/api/portal/websites/[siteId]/store/products/[productId]/bulk-pricing/route'
      );
      const res = await DELETE(makeReq('DELETE', undefined, '?id=999'), ctx());
      expect(res.status).toBe(404);
    });

    it('deletes the rule and returns success', async () => {
      selectQueue.push([{ id: 1, websiteId: 10 }]); // product
      selectQueue.push([{ id: 11, productId: 1 }]); // existing rule
      deleteQueue.push([]); // delete completes
      const { DELETE } = await import(
        '@/app/api/portal/websites/[siteId]/store/products/[productId]/bulk-pricing/route'
      );
      const res = await DELETE(makeReq('DELETE', undefined, '?id=11'), ctx());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ success: true, message: 'Rule deleted' });
    });
  });
});

// ---------------------------------------------------------------------------
// 3. GET /api/cron/surveys-zero-responses — complementary cases
// ---------------------------------------------------------------------------

describe('GET /api/cron/surveys-zero-responses (complementary)', () => {
  const ORIGINAL_ENV = process.env.CRON_SECRET;

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_ENV;
  });

  it('accepts unauthenticated calls when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    selectQueue.push([]); // candidate query
    const { GET } = await import('@/app/api/cron/surveys-zero-responses/route');
    const res = await GET(new Request('http://x/api/cron/surveys-zero-responses'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.scanned).toBe(0);
  });

  it('rejects mismatched bearer token when CRON_SECRET is set', async () => {
    process.env.CRON_SECRET = 'right';
    const { GET } = await import('@/app/api/cron/surveys-zero-responses/route');
    const res = await GET(
      new Request('http://x/api/cron/surveys-zero-responses', {
        headers: { authorization: 'Bearer wrong' },
      }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('processes a mix of skip-dup, skip-no-owner, and notify candidates', async () => {
    delete process.env.CRON_SECRET;
    selectQueue.push([
      { id: 1, title: 'Alpha', clientId: 100, createdBy: 11, createdAt: new Date() },
      { id: 2, title: 'Beta', clientId: 100, createdBy: null, createdAt: new Date() },
      { id: 3, title: 'Gamma', clientId: 200, createdBy: 22, createdAt: new Date() },
    ]);
    // Candidate 1 → dedupe lookup hits (skipped as dup)
    selectQueue.push([{ id: 9999 }]);
    // Candidate 2 → skipped without dedupe lookup (null owner)
    // Candidate 3 → dedupe lookup misses → notification fires
    selectQueue.push([]);

    const { GET } = await import('@/app/api/cron/surveys-zero-responses/route');
    const res = await GET(new Request('http://x/api/cron/surveys-zero-responses'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({
      scanned: 3,
      matched: 3,
      notified: 1,
      skippedDup: 1,
      skippedNoOwner: 1,
    });
    expect(createCrmNotificationMock).toHaveBeenCalledTimes(1);
    expect(createCrmNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 200,
        userId: 22,
        entityId: 3,
        type: 'survey_zero_responses',
        entityType: 'survey',
      }),
    );
  });

  it('returns a numeric durationMs field on success', async () => {
    delete process.env.CRON_SECRET;
    selectQueue.push([]);
    const { GET } = await import('@/app/api/cron/surveys-zero-responses/route');
    const res = await GET(new Request('http://x/api/cron/surveys-zero-responses'));
    const body = await res.json();
    expect(typeof body.data.durationMs).toBe('number');
    expect(body.data.durationMs).toBeGreaterThanOrEqual(0);
  });
});
