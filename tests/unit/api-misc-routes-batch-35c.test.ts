// @vitest-environment node
/**
 * Batch 35c — unit tests for 4 route.ts files.
 *
 * Routes covered:
 *  - app/api/storefront/[siteId]/discount/validate/route.ts        (POST)
 *  - app/api/storefront/[siteId]/orders/[orderNumber]/route.ts     (GET)
 *  - app/api/storefront/[siteId]/products/[slug]/route.ts          (GET)
 *  - app/api/stripe/webhook/route.ts                               (POST)
 *
 * Strategy: heavy mocking — db.select() consumes from a FIFO `selectQueue`,
 * db.insert/update capture writes into shared arrays. Stripe SDK and credit
 * helpers (`addPurchasedCredits` / `grantMonthlyCredits`) are mocked. No
 * network or DB I/O.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------

interface DbState {
  selectQueue: unknown[][];
  inserts: Array<{ table: string; values: unknown }>;
  updates: Array<{ table: string; values: unknown }>;
}

const dbState: DbState = {
  selectQueue: [],
  inserts: [],
  updates: [],
};

const stripeState = {
  constructEvent: vi.fn(),
};

const aiCreditState = {
  addPurchasedCredits: vi.fn(),
  grantMonthlyCredits: vi.fn(),
};

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ _op: 'eq', a, b }),
  and: (...conds: unknown[]) => ({ _op: 'and', conds }),
  or: (...conds: unknown[]) => ({ _op: 'or', conds }),
  asc: (col: unknown) => ({ _op: 'asc', col }),
  desc: (col: unknown) => ({ _op: 'desc', col }),
  sql: Object.assign(
    function sqlTag(strings: TemplateStringsArray, ...values: unknown[]) {
      return { _op: 'sql', strings: Array.from(strings), values };
    },
    {},
  ),
}));

vi.mock('@/lib/db/schema', () => {
  function tableProxy(name: string) {
    return new Proxy(
      { _name: name },
      {
        get(_t, prop) {
          if (prop === '_name') return name;
          if (prop === 'then') return undefined;
          return `${name}.${String(prop)}`;
        },
      },
    );
  }
  const tables = [
    'storeSettings', 'discountCodes',
    'orders', 'orderItems',
    'products', 'productImages', 'productOptions', 'productOptionValues',
    'productVariants', 'bulkPricingRules', 'productCategories',
    'invoices', 'clients', 'clientServices',
  ];
  const out: Record<string, unknown> = {};
  for (const t of tables) out[t] = tableProxy(t);
  return out;
});

vi.mock('@/lib/db', () => {
  function tableName(t: unknown): string {
    if (t && typeof t === 'object' && '_name' in t) {
      return String((t as { _name: unknown })._name);
    }
    return 'unknown';
  }

  function makeSelectChain() {
    if (dbState.selectQueue.length === 0) {
      throw new Error('dbState.selectQueue exhausted — handler made more db.select calls than expected');
    }
    const rows = dbState.selectQueue.shift() ?? [];
    const chain: Record<string, unknown> = {};
    const passthrough = ['from', 'where', 'innerJoin', 'leftJoin', 'orderBy', 'limit', 'groupBy', 'offset'];
    for (const m of passthrough) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve);
    return chain;
  }

  function makeInsertChain(table: string) {
    const chain: Record<string, unknown> = {};
    chain.values = (v: unknown) => {
      dbState.inserts.push({ table, values: v });
      return chain;
    };
    chain.returning = () => Promise.resolve([]);
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(undefined).then(resolve);
    return chain;
  }

  function makeUpdateChain(table: string) {
    const chain: Record<string, unknown> = {};
    chain.set = (v: unknown) => {
      dbState.updates.push({ table, values: v });
      return chain;
    };
    chain.where = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(undefined).then(resolve);
    return chain;
  }

  return {
    db: {
      select: () => makeSelectChain(),
      insert: (t: unknown) => makeInsertChain(tableName(t)),
      update: (t: unknown) => makeUpdateChain(tableName(t)),
    },
  };
});

vi.mock('stripe', () => {
  class StripeMock {
    webhooks = {
      constructEvent: (...args: unknown[]) => stripeState.constructEvent(...args),
    };
    constructor(public _key: string) {}
  }
  return { default: StripeMock };
});

vi.mock('@/lib/ai-credits', () => ({
  addPurchasedCredits: (...args: unknown[]) => aiCreditState.addPurchasedCredits(...args),
  grantMonthlyCredits: (...args: unknown[]) => aiCreditState.grantMonthlyCredits(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function paramsFor<T extends Record<string, string>>(p: T) {
  return { params: Promise.resolve(p) };
}

const STORE = { id: 1, websiteId: 1, enabled: true };

beforeEach(() => {
  dbState.selectQueue = [];
  dbState.inserts = [];
  dbState.updates = [];
  stripeState.constructEvent.mockReset();
  aiCreditState.addPurchasedCredits.mockReset();
  aiCreditState.addPurchasedCredits.mockResolvedValue(undefined);
  aiCreditState.grantMonthlyCredits.mockReset();
  aiCreditState.grantMonthlyCredits.mockResolvedValue(undefined);
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

// ---------------------------------------------------------------------------
// 1) POST /api/storefront/[siteId]/discount/validate
// ---------------------------------------------------------------------------

describe('POST /api/storefront/[siteId]/discount/validate', () => {
  function makeReq(body: unknown) {
    return new Request('http://localhost/api/storefront/1/discount/validate', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });
  }

  it('returns 400 on non-numeric siteId', async () => {
    const { POST } = await import(
      '@/app/api/storefront/[siteId]/discount/validate/route'
    );
    const res = await POST(makeReq({ code: 'X' }), paramsFor({ siteId: 'abc' }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid site ID');
  });

  it('returns 404 when store is missing or disabled', async () => {
    dbState.selectQueue.push([]); // store lookup
    const { POST } = await import(
      '@/app/api/storefront/[siteId]/discount/validate/route'
    );
    const res = await POST(makeReq({ code: 'X' }), paramsFor({ siteId: '1' }));
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Store not found');
  });

  it('returns 400 when code is missing', async () => {
    dbState.selectQueue.push([STORE]);
    const { POST } = await import(
      '@/app/api/storefront/[siteId]/discount/validate/route'
    );
    const res = await POST(makeReq({}), paramsFor({ siteId: '1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Discount code is required');
  });

  it('returns 400 when discount code is not found', async () => {
    dbState.selectQueue.push([STORE]);
    dbState.selectQueue.push([]); // discount lookup
    const { POST } = await import(
      '@/app/api/storefront/[siteId]/discount/validate/route'
    );
    const res = await POST(makeReq({ code: 'NOPE' }), paramsFor({ siteId: '1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid discount code');
  });

  it('returns 400 when discount is not yet active (startsAt in future)', async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24);
    dbState.selectQueue.push([STORE]);
    dbState.selectQueue.push([{
      code: 'SOON', discountType: 'percent', amount: 1000,
      active: true, applicableTo: 'store',
      startsAt: future, expiresAt: null,
      maxUses: null, usedCount: 0, minOrderAmount: null,
    }]);
    const { POST } = await import(
      '@/app/api/storefront/[siteId]/discount/validate/route'
    );
    const res = await POST(makeReq({ code: 'SOON' }), paramsFor({ siteId: '1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/not yet active/i);
  });

  it('returns 400 when discount has expired', async () => {
    const past = new Date(Date.now() - 1000 * 60 * 60);
    dbState.selectQueue.push([STORE]);
    dbState.selectQueue.push([{
      code: 'GONE', discountType: 'percent', amount: 1000,
      active: true, applicableTo: 'both',
      startsAt: null, expiresAt: past,
      maxUses: null, usedCount: 0, minOrderAmount: null,
    }]);
    const { POST } = await import(
      '@/app/api/storefront/[siteId]/discount/validate/route'
    );
    const res = await POST(makeReq({ code: 'GONE' }), paramsFor({ siteId: '1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/expired/i);
  });

  it('returns 400 when maxUses has been reached', async () => {
    dbState.selectQueue.push([STORE]);
    dbState.selectQueue.push([{
      code: 'FULL', discountType: 'percent', amount: 1000,
      active: true, applicableTo: 'store',
      startsAt: null, expiresAt: null,
      maxUses: 5, usedCount: 5, minOrderAmount: null,
    }]);
    const { POST } = await import(
      '@/app/api/storefront/[siteId]/discount/validate/route'
    );
    const res = await POST(makeReq({ code: 'FULL' }), paramsFor({ siteId: '1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/fully redeemed/i);
  });

  it('returns 400 when subtotal is below minOrderAmount', async () => {
    dbState.selectQueue.push([STORE]);
    dbState.selectQueue.push([{
      code: 'BIG', discountType: 'percent', amount: 1000,
      active: true, applicableTo: 'store',
      startsAt: null, expiresAt: null,
      maxUses: null, usedCount: 0, minOrderAmount: 5000,
    }]);
    const { POST } = await import(
      '@/app/api/storefront/[siteId]/discount/validate/route'
    );
    const res = await POST(makeReq({ code: 'BIG', subtotal: 1000 }), paramsFor({ siteId: '1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/minimum order amount/i);
  });

  it('computes a percent discount when subtotal is provided', async () => {
    dbState.selectQueue.push([STORE]);
    dbState.selectQueue.push([{
      code: 'P10', description: '10% off', discountType: 'percent',
      amount: 1000, // basis points / 10000 ratio
      active: true, applicableTo: 'store',
      startsAt: null, expiresAt: null,
      maxUses: null, usedCount: 0, minOrderAmount: null,
    }]);
    const { POST } = await import(
      '@/app/api/storefront/[siteId]/discount/validate/route'
    );
    const res = await POST(makeReq({ code: 'P10', subtotal: 10000 }), paramsFor({ siteId: '1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.code).toBe('P10');
    // 10000 * (1000 / 10000) = 1000
    expect(body.data.discountAmount).toBe(1000);
    expect(body.data.discountType).toBe('percent');
  });

  it('computes a fixed_amount discount capped at subtotal', async () => {
    dbState.selectQueue.push([STORE]);
    dbState.selectQueue.push([{
      code: 'F500', description: '$5 off', discountType: 'fixed_amount',
      amount: 500,
      active: true, applicableTo: 'both',
      startsAt: null, expiresAt: null,
      maxUses: null, usedCount: 0, minOrderAmount: null,
    }]);
    const { POST } = await import(
      '@/app/api/storefront/[siteId]/discount/validate/route'
    );
    const res = await POST(makeReq({ code: 'F500', subtotal: 300 }), paramsFor({ siteId: '1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.discountAmount).toBe(300); // min(500, 300)
  });

  it('returns 0 discountAmount for free_shipping type', async () => {
    dbState.selectQueue.push([STORE]);
    dbState.selectQueue.push([{
      code: 'SHIP', description: 'Free shipping', discountType: 'free_shipping',
      amount: 0,
      active: true, applicableTo: 'store',
      startsAt: null, expiresAt: null,
      maxUses: null, usedCount: 0, minOrderAmount: null,
    }]);
    const { POST } = await import(
      '@/app/api/storefront/[siteId]/discount/validate/route'
    );
    const res = await POST(makeReq({ code: 'SHIP', subtotal: 5000 }), paramsFor({ siteId: '1' }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.discountAmount).toBe(0);
  });

  it('returns success with discountAmount=null when no subtotal is provided', async () => {
    dbState.selectQueue.push([STORE]);
    dbState.selectQueue.push([{
      code: 'P10', discountType: 'percent', amount: 1000,
      active: true, applicableTo: 'store',
      startsAt: null, expiresAt: null,
      maxUses: null, usedCount: 0, minOrderAmount: null,
    }]);
    const { POST } = await import(
      '@/app/api/storefront/[siteId]/discount/validate/route'
    );
    const res = await POST(makeReq({ code: 'P10' }), paramsFor({ siteId: '1' }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.discountAmount).toBeNull();
  });

  it('returns 500 when the db throws unexpectedly', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // no queue items -> select throws -> caught -> 500
    const { POST } = await import(
      '@/app/api/storefront/[siteId]/discount/validate/route'
    );
    const res = await POST(makeReq({ code: 'X' }), paramsFor({ siteId: '1' }));
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('Internal server error');
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 2) GET /api/storefront/[siteId]/orders/[orderNumber]
// ---------------------------------------------------------------------------

describe('GET /api/storefront/[siteId]/orders/[orderNumber]', () => {
  function makeReq(siteId: string, orderNumber: string, email: string | null) {
    const qs = email !== null ? `?email=${encodeURIComponent(email)}` : '';
    return new Request(
      `http://localhost/api/storefront/${siteId}/orders/${orderNumber}${qs}`,
    );
  }

  it('returns 400 on non-numeric siteId', async () => {
    const { GET } = await import(
      '@/app/api/storefront/[siteId]/orders/[orderNumber]/route'
    );
    const res = await GET(
      makeReq('abc', 'ORD-1', 'a@b.co'),
      paramsFor({ siteId: 'abc', orderNumber: 'ORD-1' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid site ID');
  });

  it('returns 404 when store is missing or disabled', async () => {
    dbState.selectQueue.push([]);
    const { GET } = await import(
      '@/app/api/storefront/[siteId]/orders/[orderNumber]/route'
    );
    const res = await GET(
      makeReq('1', 'ORD-1', 'a@b.co'),
      paramsFor({ siteId: '1', orderNumber: 'ORD-1' }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Store not found');
  });

  it('returns 400 when email query param is missing', async () => {
    dbState.selectQueue.push([STORE]);
    const { GET } = await import(
      '@/app/api/storefront/[siteId]/orders/[orderNumber]/route'
    );
    const res = await GET(
      makeReq('1', 'ORD-1', null),
      paramsFor({ siteId: '1', orderNumber: 'ORD-1' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/email is required/i);
  });

  it('returns 404 when order cannot be matched on siteId+orderNumber+email', async () => {
    dbState.selectQueue.push([STORE]);
    dbState.selectQueue.push([]); // order lookup
    const { GET } = await import(
      '@/app/api/storefront/[siteId]/orders/[orderNumber]/route'
    );
    const res = await GET(
      makeReq('1', 'ORD-1', 'wrong@b.co'),
      paramsFor({ siteId: '1', orderNumber: 'ORD-1' }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Order not found');
  });

  it('returns the full order detail plus items on a match', async () => {
    const order = {
      id: 7,
      websiteId: 1,
      orderNumber: 'ORD-1',
      status: 'fulfilled',
      paymentStatus: 'paid',
      customerName: 'Alice',
      customerEmail: 'a@b.co',
      shippingAddress: { line1: '1 Main' },
      billingAddress: { line1: '1 Main' },
      subtotal: 4500,
      shippingTotal: 500,
      taxTotal: 0,
      discountTotal: 0,
      total: 5000,
      shippingMethod: 'standard',
      trackingNumber: 'TRK-9',
      trackingUrl: 'https://track.example/9',
      customerNote: 'gift-wrap',
      paidAt: new Date('2026-01-01'),
      shippedAt: new Date('2026-01-02'),
      deliveredAt: null,
      createdAt: new Date('2026-01-01'),
    };
    const items = [
      { id: 11, orderId: 7, productId: 100, quantity: 1, unitPrice: 4500 },
    ];
    dbState.selectQueue.push([STORE]);
    dbState.selectQueue.push([order]);
    dbState.selectQueue.push(items);

    const { GET } = await import(
      '@/app/api/storefront/[siteId]/orders/[orderNumber]/route'
    );
    const res = await GET(
      makeReq('1', 'ORD-1', 'a@b.co'),
      paramsFor({ siteId: '1', orderNumber: 'ORD-1' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.orderNumber).toBe('ORD-1');
    expect(body.data.total).toBe(5000);
    expect(body.data.trackingNumber).toBe('TRK-9');
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].productId).toBe(100);
    expect(body.data.deliveredAt).toBeNull();
  });

  it('returns 500 when an unexpected db error occurs', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // no queue -> select throws -> 500
    const { GET } = await import(
      '@/app/api/storefront/[siteId]/orders/[orderNumber]/route'
    );
    const res = await GET(
      makeReq('1', 'ORD-1', 'a@b.co'),
      paramsFor({ siteId: '1', orderNumber: 'ORD-1' }),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('Internal server error');
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 3) GET /api/storefront/[siteId]/products/[slug]
// ---------------------------------------------------------------------------

describe('GET /api/storefront/[siteId]/products/[slug]', () => {
  function makeReq(siteId: string, slug: string) {
    return new Request(
      `http://localhost/api/storefront/${siteId}/products/${slug}`,
    );
  }

  it('returns 400 on non-numeric siteId', async () => {
    const { GET } = await import(
      '@/app/api/storefront/[siteId]/products/[slug]/route'
    );
    const res = await GET(
      makeReq('abc', 'widget'),
      paramsFor({ siteId: 'abc', slug: 'widget' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid site ID');
  });

  it('returns 404 when store is missing or disabled', async () => {
    dbState.selectQueue.push([]);
    const { GET } = await import(
      '@/app/api/storefront/[siteId]/products/[slug]/route'
    );
    const res = await GET(
      makeReq('1', 'widget'),
      paramsFor({ siteId: '1', slug: 'widget' }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Store not found');
  });

  it('returns 404 when no active product matches the slug', async () => {
    dbState.selectQueue.push([STORE]);
    dbState.selectQueue.push([]); // product lookup
    const { GET } = await import(
      '@/app/api/storefront/[siteId]/products/[slug]/route'
    );
    const res = await GET(
      makeReq('1', 'widget'),
      paramsFor({ siteId: '1', slug: 'widget' }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Product not found');
  });

  it('returns full product with images, options(+values), variants, bulkPricing, category=null when no categoryId', async () => {
    const product = {
      id: 50, websiteId: 1, slug: 'widget', name: 'Widget',
      status: 'active', categoryId: null, price: 1000,
    };
    const images = [{ productId: 50, url: 'img/a.jpg', order: 0 }];
    const options = [
      { id: 300, productId: 50, name: 'Size', order: 0 },
      { id: 301, productId: 50, name: 'Color', order: 1 },
    ];
    const variants = [{ id: 400, productId: 50, active: true, price: 1099 }];
    const bulkRules = [
      { id: 500, productId: 50, minQuantity: 10, discountPercent: 5 },
    ];
    const opt300Values = [{ id: 1, optionId: 300, value: 'S' }];
    const opt301Values = [{ id: 2, optionId: 301, value: 'Red' }];

    dbState.selectQueue.push([STORE]);
    dbState.selectQueue.push([product]);
    // Parallel block (Promise.all): images, options, variants, bulkRules
    dbState.selectQueue.push(images);
    dbState.selectQueue.push(options);
    dbState.selectQueue.push(variants);
    dbState.selectQueue.push(bulkRules);
    // Then per-option value lookups
    dbState.selectQueue.push(opt300Values);
    dbState.selectQueue.push(opt301Values);

    const { GET } = await import(
      '@/app/api/storefront/[siteId]/products/[slug]/route'
    );
    const res = await GET(
      makeReq('1', 'widget'),
      paramsFor({ siteId: '1', slug: 'widget' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(50);
    expect(body.data.images).toHaveLength(1);
    expect(body.data.options).toHaveLength(2);
    expect(body.data.options[0].values).toEqual(opt300Values);
    expect(body.data.options[1].values).toEqual(opt301Values);
    expect(body.data.variants).toEqual(variants);
    expect(body.data.bulkPricing).toEqual(bulkRules);
    expect(body.data.category).toBeNull();
  });

  it('skips option-value lookups entirely when product has no options', async () => {
    const product = {
      id: 51, websiteId: 1, slug: 'plain', name: 'Plain',
      status: 'active', categoryId: null, price: 500,
    };
    dbState.selectQueue.push([STORE]);
    dbState.selectQueue.push([product]);
    dbState.selectQueue.push([] /* images */);
    dbState.selectQueue.push([] /* options - empty */);
    dbState.selectQueue.push([] /* variants */);
    dbState.selectQueue.push([] /* bulkRules */);
    // no further queue items needed — no option-value lookups

    const { GET } = await import(
      '@/app/api/storefront/[siteId]/products/[slug]/route'
    );
    const res = await GET(
      makeReq('1', 'plain'),
      paramsFor({ siteId: '1', slug: 'plain' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.options).toEqual([]);
  });

  it('includes the category when product has a categoryId', async () => {
    const product = {
      id: 52, websiteId: 1, slug: 'cat-w', name: 'Cat Widget',
      status: 'active', categoryId: 9, price: 700,
    };
    const category = { id: 9, name: 'Gadgets', slug: 'gadgets' };
    dbState.selectQueue.push([STORE]);
    dbState.selectQueue.push([product]);
    dbState.selectQueue.push([] /* images */);
    dbState.selectQueue.push([] /* options */);
    dbState.selectQueue.push([] /* variants */);
    dbState.selectQueue.push([] /* bulkRules */);
    dbState.selectQueue.push([category]); // category lookup

    const { GET } = await import(
      '@/app/api/storefront/[siteId]/products/[slug]/route'
    );
    const res = await GET(
      makeReq('1', 'cat-w'),
      paramsFor({ siteId: '1', slug: 'cat-w' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.category).toEqual(category);
  });

  it('returns category=null when product has a categoryId but the row is missing', async () => {
    const product = {
      id: 53, websiteId: 1, slug: 'orphan', name: 'Orphan',
      status: 'active', categoryId: 99, price: 100,
    };
    dbState.selectQueue.push([STORE]);
    dbState.selectQueue.push([product]);
    dbState.selectQueue.push([] /* images */);
    dbState.selectQueue.push([] /* options */);
    dbState.selectQueue.push([] /* variants */);
    dbState.selectQueue.push([] /* bulkRules */);
    dbState.selectQueue.push([] /* category lookup -> empty */);

    const { GET } = await import(
      '@/app/api/storefront/[siteId]/products/[slug]/route'
    );
    const res = await GET(
      makeReq('1', 'orphan'),
      paramsFor({ siteId: '1', slug: 'orphan' }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.category).toBeNull();
  });

  it('returns 500 when an unexpected db error occurs', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // no queue items -> 500
    const { GET } = await import(
      '@/app/api/storefront/[siteId]/products/[slug]/route'
    );
    const res = await GET(
      makeReq('1', 'widget'),
      paramsFor({ siteId: '1', slug: 'widget' }),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('Internal server error');
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 4) POST /api/stripe/webhook
// ---------------------------------------------------------------------------

describe('POST /api/stripe/webhook', () => {
  function makeReq(body: string, sig: string | null = 't=1,v1=sig') {
    const headers: Record<string, string> = {};
    if (sig !== null) headers['stripe-signature'] = sig;
    return new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      headers,
      body,
    });
  }

  it('returns 500 when STRIPE_SECRET_KEY is missing', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    const { POST } = await import('@/app/api/stripe/webhook/route');
    const res = await POST(makeReq('{}'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/stripe not configured/i);
  });

  it('returns 500 when STRIPE_WEBHOOK_SECRET is missing', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    const { POST } = await import('@/app/api/stripe/webhook/route');
    const res = await POST(makeReq('{}'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/stripe not configured/i);
  });

  it('returns 400 (webhook_error) when stripe.constructEvent throws', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy';
    stripeState.constructEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { POST } = await import('@/app/api/stripe/webhook/route');
    const res = await POST(makeReq('{}', 'bad'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('webhook_error');
    errSpy.mockRestore();
  });

  it('acknowledges unhandled event types with received=true and no db writes', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy';
    stripeState.constructEvent.mockReturnValue({
      type: 'customer.created',
      data: { object: {} },
    });

    const { POST } = await import('@/app/api/stripe/webhook/route');
    const res = await POST(makeReq('{}'));
    expect(res.status).toBe(200);
    expect((await res.json()).received).toBe(true);
    expect(dbState.updates).toHaveLength(0);
    expect(dbState.inserts).toHaveLength(0);
    expect(aiCreditState.addPurchasedCredits).not.toHaveBeenCalled();
    expect(aiCreditState.grantMonthlyCredits).not.toHaveBeenCalled();
  });

  it('credit_purchase: calls addPurchasedCredits and short-circuits', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy';
    stripeState.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_credit_1',
          metadata: {
            type: 'credit_purchase',
            clientId: '42',
            tokens: '1000',
            packageName: 'Starter Pack',
          },
        },
      },
    });

    const { POST } = await import('@/app/api/stripe/webhook/route');
    const res = await POST(makeReq('{}'));
    expect(res.status).toBe(200);
    expect((await res.json()).received).toBe(true);
    expect(aiCreditState.addPurchasedCredits).toHaveBeenCalledTimes(1);
    expect(aiCreditState.addPurchasedCredits).toHaveBeenCalledWith(
      42,
      1000,
      'cs_credit_1',
      'Starter Pack',
    );
    // Did not fall through to invoice/service branches
    expect(dbState.updates).toHaveLength(0);
    expect(dbState.inserts).toHaveLength(0);
    expect(aiCreditState.grantMonthlyCredits).not.toHaveBeenCalled();
  });

  it('credit_purchase with zero tokens does not call addPurchasedCredits', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy';
    stripeState.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_credit_zero',
          metadata: {
            type: 'credit_purchase',
            clientId: '42',
            tokens: '0',
          },
        },
      },
    });

    const { POST } = await import('@/app/api/stripe/webhook/route');
    const res = await POST(makeReq('{}'));
    expect(res.status).toBe(200);
    expect(aiCreditState.addPurchasedCredits).not.toHaveBeenCalled();
  });

  it('credit_purchase uses default package name when not provided', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy';
    stripeState.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_credit_dn',
          metadata: {
            type: 'credit_purchase',
            clientId: '7',
            tokens: '500',
          },
        },
      },
    });

    const { POST } = await import('@/app/api/stripe/webhook/route');
    const res = await POST(makeReq('{}'));
    expect(res.status).toBe(200);
    expect(aiCreditState.addPurchasedCredits).toHaveBeenCalledWith(
      7,
      500,
      'cs_credit_dn',
      'Credit Package',
    );
  });

  it('invoice payment: marks invoice as paid when invoiceId metadata is present', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy';
    stripeState.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_inv_1',
          metadata: { invoiceId: '888' },
        },
      },
    });

    const { POST } = await import('@/app/api/stripe/webhook/route');
    const res = await POST(makeReq('{}'));
    expect(res.status).toBe(200);

    const invUpdate = dbState.updates.find((u) => u.table === 'invoices');
    expect(invUpdate).toBeDefined();
    const vals = invUpdate!.values as { status?: string; stripeCheckoutSessionId?: string };
    expect(vals.status).toBe('paid');
    expect(vals.stripeCheckoutSessionId).toBe('cs_inv_1');

    // No service/credit work
    expect(aiCreditState.addPurchasedCredits).not.toHaveBeenCalled();
    expect(aiCreditState.grantMonthlyCredits).not.toHaveBeenCalled();
  });

  it('service purchase: upserts (inserts new) clientServices row and grants monthly credits', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy';
    stripeState.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_svc_1',
          customer: 'cus_xyz',
          metadata: { serviceId: '11', clientId: '22' },
        },
      },
    });
    dbState.selectQueue.push([]); // existing clientServices lookup -> none

    const { POST } = await import('@/app/api/stripe/webhook/route');
    const res = await POST(makeReq('{}'));
    expect(res.status).toBe(200);

    // clients.stripeCustomerId persisted
    const clientUpdate = dbState.updates.find((u) => u.table === 'clients');
    expect(clientUpdate).toBeDefined();
    expect((clientUpdate!.values as { stripeCustomerId?: string }).stripeCustomerId).toBe('cus_xyz');

    // clientServices INSERT (not update)
    const csInsert = dbState.inserts.find((i) => i.table === 'clientServices');
    expect(csInsert).toBeDefined();
    expect((csInsert!.values as { status: string }).status).toBe('active');
    expect((csInsert!.values as { clientId: number }).clientId).toBe(22);
    expect((csInsert!.values as { serviceId: number }).serviceId).toBe(11);

    expect(dbState.updates.find((u) => u.table === 'clientServices')).toBeUndefined();

    // monthly credits granted
    expect(aiCreditState.grantMonthlyCredits).toHaveBeenCalledWith(22);
  });

  it('service purchase: updates existing clientServices row when one exists', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy';
    stripeState.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_svc_2',
          customer: 'cus_abc',
          metadata: { serviceId: '11', clientId: '22' },
        },
      },
    });
    dbState.selectQueue.push([{ id: 555, clientId: 22, serviceId: 11, status: 'inactive' }]);

    const { POST } = await import('@/app/api/stripe/webhook/route');
    const res = await POST(makeReq('{}'));
    expect(res.status).toBe(200);

    // No insert this time, just an update on clientServices
    expect(dbState.inserts.find((i) => i.table === 'clientServices')).toBeUndefined();
    const csUpdate = dbState.updates.find((u) => u.table === 'clientServices');
    expect(csUpdate).toBeDefined();
    expect((csUpdate!.values as { status: string }).status).toBe('active');

    expect(aiCreditState.grantMonthlyCredits).toHaveBeenCalledWith(22);
  });

  it('service purchase: does NOT persist stripeCustomerId when session.customer is absent', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy';
    stripeState.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_svc_nocust',
          metadata: { serviceId: '11', clientId: '22' },
          // no customer field
        },
      },
    });
    dbState.selectQueue.push([]); // no existing clientServices

    const { POST } = await import('@/app/api/stripe/webhook/route');
    const res = await POST(makeReq('{}'));
    expect(res.status).toBe(200);

    // No clients.stripeCustomerId update
    expect(dbState.updates.find((u) => u.table === 'clients')).toBeUndefined();
    // But the clientServices insert and grant still ran
    expect(dbState.inserts.find((i) => i.table === 'clientServices')).toBeDefined();
    expect(aiCreditState.grantMonthlyCredits).toHaveBeenCalledWith(22);
  });

  it('invoice + service combo: marks invoice paid AND processes the service', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy';
    stripeState.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_combo',
          customer: 'cus_combo',
          metadata: { invoiceId: '301', serviceId: '11', clientId: '22' },
        },
      },
    });
    dbState.selectQueue.push([]); // existing clientServices lookup

    const { POST } = await import('@/app/api/stripe/webhook/route');
    const res = await POST(makeReq('{}'));
    expect(res.status).toBe(200);

    expect(dbState.updates.find((u) => u.table === 'invoices')).toBeDefined();
    expect(dbState.inserts.find((i) => i.table === 'clientServices')).toBeDefined();
    expect(aiCreditState.grantMonthlyCredits).toHaveBeenCalledWith(22);
  });
});
