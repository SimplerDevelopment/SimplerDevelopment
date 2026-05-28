// @vitest-environment node
/**
 * Unit tests for misc API routes (batch 35g).
 *
 * Routes under test:
 *   1. app/api/test/email-events/route.ts
 *        - POST  trigger transactional email events (dev/secret-gated)
 *        - GET   list event types
 *   2. app/api/v1/sites/[siteId]/products/[slug]/route.ts
 *        - GET   product by slug (api-key/CORS-wrapped)
 *   3. app/api/v1/sites/[siteId]/product-categories/route.ts
 *        - GET   list product categories (api-key/CORS-wrapped)
 *   4. app/api/public/websites/[siteId]/categories/route.ts
 *        - GET   list active site categories
 *
 * All collaborators are mocked: auth/api-key middleware, db, schema, drizzle
 * helpers, transactional email send + helpers, and the @/lib/data/products
 * accessors.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// api-key middleware — pass-through wrapper to keep handler logic isolated.
vi.mock('@/lib/api-key-middleware', () => ({
  withApiKeyAndCors: (handler: any) => handler,
}));

// Transactional email helpers (used by the test/email-events route).
const sendTransactionalEmailMock = vi.fn();
vi.mock('@/lib/email/send-transactional', () => ({
  sendTransactionalEmail: (...args: unknown[]) =>
    sendTransactionalEmailMock(...args),
  formatCents: (n: number) => `$${(n / 100).toFixed(2)}`,
  formatAddress: (a: { line1?: string; city?: string }) =>
    `${a.line1 || ''}, ${a.city || ''}`,
  formatEmailDate: (d: Date | string | null) =>
    d ? new Date(d as any).toISOString() : '',
  buildItemsHtml: (items: Array<{ productName: string }>) =>
    `<ul>${items.map((i) => `<li>${i.productName}</li>`).join('')}</ul>`,
}));

// Schema — proxy-based fake tables that expose column refs.
vi.mock('@/lib/db/schema', () => {
  const wrap = (name: string) => {
    const target: Record<string, unknown> = {
      __table: name,
      __isTable: true,
      $inferSelect: {},
    };
    return new Proxy(target, {
      get(t: Record<string, unknown>, prop: string) {
        if (prop === '__table') return name;
        if (prop === '__isTable') return true;
        if (prop === '$inferSelect') return t.$inferSelect;
        if (prop === 'then') return undefined;
        if (typeof prop === 'symbol') return undefined;
        return { __col: prop, __table: name };
      },
    });
  };
  return {
    clientWebsites: wrap('clientWebsites'),
    categories: wrap('categories'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
}));

// ---- in-memory state ----

interface State {
  clientWebsites: Array<Record<string, unknown>>;
  categories: Array<Record<string, unknown>>;
}

const state: State = {
  clientWebsites: [],
  categories: [],
};

function tableArray(name: string): Array<Record<string, unknown>> {
  switch (name) {
    case 'clientWebsites':
      return state.clientWebsites;
    case 'categories':
      return state.categories;
    default:
      return [];
  }
}

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as {
    op?: string;
    a?: unknown;
    b?: unknown;
    args?: unknown[];
  };
  switch (f.op) {
    case 'eq': {
      const col = f.a as { __col?: string; __table?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === f.b;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    default:
      return true;
  }
}

vi.mock('@/lib/db', () => {
  function buildSelect(projection?: Record<string, unknown>) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limitVal: number | null = null;

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      let rows = tableArray(activeTable).filter((r) =>
        evalPredicate(filter, r),
      );
      if (typeof limitVal === 'number') rows = rows.slice(0, limitVal);
      // Apply projection if provided
      if (projection) {
        rows = rows.map((r) => {
          const out: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(projection)) {
            const col = v as { __col?: string } | undefined;
            if (col?.__col) {
              out[k] = r[col.__col];
            }
          }
          return out;
        });
      } else {
        rows = rows.map((r) => ({ ...r }));
      }
      return Promise.resolve(rows);
    }

    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      orderBy() {
        return chain;
      },
      limit(n: number) {
        limitVal = n;
        return chain;
      },
      then(
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    return chain;
  }

  return {
    db: {
      select(projection?: Record<string, unknown>) {
        return buildSelect(projection);
      },
    },
  };
});

// @/lib/data/products — accessors used by v1 sites routes.
const getProductBySlugMock = vi.fn();
const listProductCategoriesMock = vi.fn();
vi.mock('@/lib/data/products', () => ({
  getProductBySlug: (...args: unknown[]) => getProductBySlugMock(...args),
  listProductCategories: (...args: unknown[]) =>
    listProductCategoriesMock(...args),
}));

// ---------------------------------------------------------------------------
// Modules under test
// ---------------------------------------------------------------------------

const emailEventsMod = await import('@/app/api/test/email-events/route');
const productBySlugMod = await import(
  '@/app/api/v1/sites/[siteId]/products/[slug]/route'
);
const productCategoriesMod = await import(
  '@/app/api/v1/sites/[siteId]/product-categories/route'
);
const publicCategoriesMod = await import(
  '@/app/api/public/websites/[siteId]/categories/route'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(method: string, url: string, body?: unknown, headers?: Record<string, string>): Request {
  const init: RequestInit = { method };
  init.headers = { 'content-type': 'application/json', ...(headers || {}) };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

function siteCtx(siteId = '1') {
  return { params: Promise.resolve({ siteId }) };
}

function siteSlugCtx(siteId = '1', slug = 'widget') {
  return { params: Promise.resolve({ siteId, slug }) };
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  state.clientWebsites.length = 0;
  state.categories.length = 0;
  sendTransactionalEmailMock.mockReset();
  getProductBySlugMock.mockReset();
  listProductCategoriesMock.mockReset();
  // Restore env between tests
  process.env = { ...ORIGINAL_ENV };
  delete process.env.NODE_ENV;
  process.env.TEST_EMAIL_SECRET = 'test-secret';
});

// ---------------------------------------------------------------------------
// /api/test/email-events
// ---------------------------------------------------------------------------

describe('GET /api/test/email-events', () => {
  it('lists the available event types', async () => {
    const res = await emailEventsMod.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events).toContain('order.confirmed');
    expect(body.events).toContain('booking.confirmed');
    expect(typeof body.usage).toBe('string');
  });
});

describe('POST /api/test/email-events', () => {
  it('returns 404 in production regardless of secret', async () => {
    process.env.NODE_ENV = 'production';
    const res = await emailEventsMod.POST(
      makeReq(
        'POST',
        'http://x/test/email-events',
        { event: 'order.confirmed' },
        { 'x-test-secret': 'test-secret' },
      ),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('not_found');
  });

  it('returns 403 when the x-test-secret header is missing or wrong', async () => {
    const res = await emailEventsMod.POST(
      makeReq('POST', 'http://x/test/email-events', {
        event: 'order.confirmed',
      }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });

  it('returns 403 when secret env var is unset', async () => {
    delete process.env.TEST_EMAIL_SECRET;
    const res = await emailEventsMod.POST(
      makeReq(
        'POST',
        'http://x/test/email-events',
        { event: 'order.confirmed' },
        { 'x-test-secret': 'whatever' },
      ),
    );
    expect(res.status).toBe(403);
  });

  it('reports an error result when the event name is unknown', async () => {
    state.clientWebsites.push({
      id: 5,
      domain: 'example.com',
      subdomain: 'ex',
    });
    const res = await emailEventsMod.POST(
      makeReq(
        'POST',
        'http://x/test/email-events',
        { event: 'no.such.event' },
        { 'x-test-secret': 'test-secret' },
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error).toContain('Unknown event');
    expect(body.summary).toEqual({ total: 1, sent: 0, failed: 1 });
  });

  it('looks up the first website when websiteId is omitted and sends a known event', async () => {
    state.clientWebsites.push({
      id: 7,
      domain: 'shop.example.com',
      subdomain: null,
    });
    sendTransactionalEmailMock.mockResolvedValue({
      success: true,
      messageId: 'msg-1',
    });
    const res = await emailEventsMod.POST(
      makeReq(
        'POST',
        'http://x/test/email-events',
        { event: 'order.confirmed' },
        { 'x-test-secret': 'test-secret' },
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].event).toBe('order.confirmed');
    expect(body.results[0].success).toBe(true);
    expect(body.results[0].messageId).toBe('msg-1');
    expect(body.summary).toEqual({ total: 1, sent: 1, failed: 0 });
    // Should have called sendTransactionalEmail with the resolved websiteId
    expect(sendTransactionalEmailMock).toHaveBeenCalledTimes(1);
    const call = sendTransactionalEmailMock.mock.calls[0][0] as {
      websiteId: number;
      event: string;
      to: string;
    };
    expect(call.websiteId).toBe(7);
    expect(call.event).toBe('order.confirmed');
    expect(call.to).toContain('order_confirmed');
  });

  it('throws when no websites exist and no websiteId is provided', async () => {
    await expect(
      emailEventsMod.POST(
        makeReq(
          'POST',
          'http://x/test/email-events',
          { event: 'order.confirmed' },
          { 'x-test-secret': 'test-secret' },
        ),
      ),
    ).rejects.toThrow(/No website found/);
  });

  it('uses the provided websiteId when present', async () => {
    state.clientWebsites.push({
      id: 42,
      domain: null,
      subdomain: 'demo',
    });
    sendTransactionalEmailMock.mockResolvedValue({
      success: true,
      messageId: 'msg-42',
    });
    const res = await emailEventsMod.POST(
      makeReq(
        'POST',
        'http://x/test/email-events',
        { event: 'account.welcome', websiteId: 42 },
        { 'x-test-secret': 'test-secret' },
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(sendTransactionalEmailMock).toHaveBeenCalledTimes(1);
    const call = sendTransactionalEmailMock.mock.calls[0][0] as {
      websiteId: number;
      event: string;
      fromName: string;
    };
    expect(call.websiteId).toBe(42);
    expect(call.event).toBe('account.welcome');
    expect(call.fromName).toBe('Welcome');
  });

  it('processes all events when event="all"', async () => {
    state.clientWebsites.push({
      id: 1,
      domain: 'a.com',
      subdomain: null,
    });
    sendTransactionalEmailMock.mockResolvedValue({
      success: true,
      messageId: 'mm',
    });
    const res = await emailEventsMod.POST(
      makeReq(
        'POST',
        'http://x/test/email-events',
        { event: 'all' },
        { 'x-test-secret': 'test-secret' },
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.summary.total).toBeGreaterThanOrEqual(10);
    expect(body.summary.failed).toBe(0);
    expect(sendTransactionalEmailMock.mock.calls.length).toBe(
      body.summary.total,
    );
  });

  it('reports failed results when sendTransactionalEmail returns success=false', async () => {
    state.clientWebsites.push({ id: 1, domain: 'a.com', subdomain: null });
    sendTransactionalEmailMock.mockResolvedValue({
      success: false,
      error: 'boom',
    });
    const res = await emailEventsMod.POST(
      makeReq(
        'POST',
        'http://x/test/email-events',
        { event: 'order.shipped' },
        { 'x-test-secret': 'test-secret' },
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error).toBe('boom');
    expect(body.summary).toEqual({ total: 1, sent: 0, failed: 1 });
  });

  it('falls back to subdomain when domain is null', async () => {
    state.clientWebsites.push({ id: 8, domain: null, subdomain: 'subby' });
    sendTransactionalEmailMock.mockResolvedValue({
      success: true,
      messageId: 'x',
    });
    const res = await emailEventsMod.POST(
      makeReq(
        'POST',
        'http://x/test/email-events',
        { event: 'order.confirmed', websiteId: 8 },
        { 'x-test-secret': 'test-secret' },
      ),
    );
    expect(res.status).toBe(200);
    const call = sendTransactionalEmailMock.mock.calls[0][0] as {
      variables: { orderUrl: string };
    };
    expect(call.variables.orderUrl).toContain('/sites/subby/');
  });
});

// ---------------------------------------------------------------------------
// /api/v1/sites/[siteId]/products/[slug]
// ---------------------------------------------------------------------------

describe('GET /api/v1/sites/[siteId]/products/[slug]', () => {
  it('returns 400 when siteId is not a number', async () => {
    const res = await productBySlugMod.GET(
      makeReq('GET', 'http://x/v1/sites/abc/products/foo'),
      siteSlugCtx('abc', 'foo'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Invalid site ID' });
    expect(getProductBySlugMock).not.toHaveBeenCalled();
  });

  it('returns 404 when product is not found', async () => {
    getProductBySlugMock.mockResolvedValueOnce(null);
    const res = await productBySlugMod.GET(
      makeReq('GET', 'http://x/v1/sites/1/products/missing'),
      siteSlugCtx('1', 'missing'),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Not found' });
    expect(getProductBySlugMock).toHaveBeenCalledWith(1, 'missing');
  });

  it('returns the product when found', async () => {
    const product = { id: 9, slug: 'widget', name: 'Widget' };
    getProductBySlugMock.mockResolvedValueOnce(product);
    const res = await productBySlugMod.GET(
      makeReq('GET', 'http://x/v1/sites/1/products/widget'),
      siteSlugCtx('1', 'widget'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: product });
    expect(getProductBySlugMock).toHaveBeenCalledWith(1, 'widget');
  });

  it('parses numeric site IDs correctly', async () => {
    getProductBySlugMock.mockResolvedValueOnce({ id: 1 });
    await productBySlugMod.GET(
      makeReq('GET', 'http://x/v1/sites/42/products/x'),
      siteSlugCtx('42', 'x'),
    );
    expect(getProductBySlugMock).toHaveBeenCalledWith(42, 'x');
  });
});

// ---------------------------------------------------------------------------
// /api/v1/sites/[siteId]/product-categories
// ---------------------------------------------------------------------------

describe('GET /api/v1/sites/[siteId]/product-categories', () => {
  it('returns 400 when siteId is not a number', async () => {
    const res = await productCategoriesMod.GET(
      makeReq('GET', 'http://x/v1/sites/nope/product-categories'),
      siteCtx('nope'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Invalid site ID' });
    expect(listProductCategoriesMock).not.toHaveBeenCalled();
  });

  it('returns 404 when listProductCategories returns null (store not found)', async () => {
    listProductCategoriesMock.mockResolvedValueOnce(null);
    const res = await productCategoriesMod.GET(
      makeReq('GET', 'http://x/v1/sites/1/product-categories'),
      siteCtx('1'),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Store not found' });
    expect(listProductCategoriesMock).toHaveBeenCalledWith(1);
  });

  it('returns categories when found', async () => {
    const cats = [
      { id: 1, name: 'Tops', slug: 'tops' },
      { id: 2, name: 'Pants', slug: 'pants' },
    ];
    listProductCategoriesMock.mockResolvedValueOnce(cats);
    const res = await productCategoriesMod.GET(
      makeReq('GET', 'http://x/v1/sites/3/product-categories'),
      siteCtx('3'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: cats });
    expect(listProductCategoriesMock).toHaveBeenCalledWith(3);
  });

  it('treats an empty array as success (not null)', async () => {
    listProductCategoriesMock.mockResolvedValueOnce([]);
    const res = await productCategoriesMod.GET(
      makeReq('GET', 'http://x/v1/sites/1/product-categories'),
      siteCtx('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: [] });
  });
});

// ---------------------------------------------------------------------------
// /api/public/websites/[siteId]/categories
// ---------------------------------------------------------------------------

describe('GET /api/public/websites/[siteId]/categories', () => {
  it('returns 404 when website is not found or inactive', async () => {
    // state.clientWebsites is empty — site lookup fails
    const res = await publicCategoriesMod.GET(
      new Request('http://x/public/websites/1/categories'),
      siteCtx('1'),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Not found' });
  });

  it('returns 404 when website exists but is inactive', async () => {
    state.clientWebsites.push({ id: 1, active: false });
    const res = await publicCategoriesMod.GET(
      new Request('http://x/public/websites/1/categories'),
      siteCtx('1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns the categories for an active website', async () => {
    state.clientWebsites.push({ id: 1, active: true });
    state.categories.push({
      id: 10,
      websiteId: 1,
      name: 'News',
      slug: 'news',
      description: 'news desc',
      color: '#fff',
    });
    state.categories.push({
      id: 11,
      websiteId: 1,
      name: 'Blog',
      slug: 'blog',
      description: 'blog desc',
      color: '#000',
    });
    // Other website's categories — should be excluded
    state.categories.push({
      id: 20,
      websiteId: 2,
      name: 'Other',
      slug: 'other',
      description: null,
      color: null,
    });

    const res = await publicCategoriesMod.GET(
      new Request('http://x/public/websites/1/categories'),
      siteCtx('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    const names = body.data.map((c: { name: string }) => c.name).sort();
    expect(names).toEqual(['Blog', 'News']);
    // Projection should only include the selected columns
    for (const cat of body.data) {
      expect(Object.keys(cat).sort()).toEqual(
        ['color', 'description', 'id', 'name', 'slug'].sort(),
      );
    }
  });

  it('returns an empty array when active site has no categories', async () => {
    state.clientWebsites.push({ id: 5, active: true });
    const res = await publicCategoriesMod.GET(
      new Request('http://x/public/websites/5/categories'),
      siteCtx('5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: [] });
  });
});
