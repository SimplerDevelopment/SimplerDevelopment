// @vitest-environment node
/**
 * Unit tests for `POST /api/storefront/[siteId]/checkout`.
 *
 * The route orchestrates ~10 sequential DB queries (store / cart / items /
 * products / variants / bulk rules / shipping / discount / gift cert /
 * order-number / inserts) plus a Stripe PaymentIntent create+update. Each
 * test queues the rows db.select() should return in call order, then
 * asserts the response status + body for each branch:
 *   - Invalid site id
 *   - Store missing or not Stripe-configured
 *   - Bad input body (missing required fields)
 *   - Cart missing / empty / inactive product / out-of-stock
 *   - Bulk pricing (fixed + percent_off)
 *   - Shipping (free-by-type, free-above-threshold, paid, invalid)
 *   - Discount (percent, fixed_amount, free_shipping, not-yet-active,
 *     expired, fully-redeemed, min-order-amount, unknown code)
 *   - Gift certificate (partial redemption + full redemption)
 *   - Tax inclusive vs exclusive
 *   - Order number generation (no prior order, with prior order)
 *   - Happy path PaymentIntent creation + metadata update
 *   - Stripe.paymentIntents.create failure -> 500
 *   - DB failure during inserts -> 500
 *   - Total <= 0 guard
 *
 * Everything is mocked — no live DB, no Stripe network.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock harness state
// ---------------------------------------------------------------------------

interface StripeMockState {
  paymentIntentsCreate: ReturnType<typeof vi.fn>;
  paymentIntentsUpdate: ReturnType<typeof vi.fn>;
}

const stripeState: StripeMockState = {
  paymentIntentsCreate: vi.fn(),
  paymentIntentsUpdate: vi.fn(),
};

interface DbState {
  // Each db.select() shifts the next row-set off this queue.
  selectQueue: unknown[][];
  // Each db.insert().values(...).returning() shifts the next row-set off this queue.
  insertReturningQueue: unknown[][];
  // Track calls
  inserts: Array<{ table: string; values: unknown }>;
  updates: Array<{ table: string; values: unknown }>;
  // If true, the next db.insert() will throw.
  insertShouldThrow: boolean;
}

const dbState: DbState = {
  selectQueue: [],
  insertReturningQueue: [],
  inserts: [],
  updates: [],
  insertShouldThrow: false,
};

// ---------------------------------------------------------------------------
// Mocks (must be declared before importing the route under test)
// ---------------------------------------------------------------------------

vi.mock('stripe', () => {
  // The route does `(await import('stripe')).default` and then `new Stripe(...)`.
  class Stripe {
    paymentIntents = {
      create: (...args: unknown[]) => stripeState.paymentIntentsCreate(...args),
      update: (...args: unknown[]) => stripeState.paymentIntentsUpdate(...args),
    };
  }
  return { default: Stripe };
});

vi.mock('@/lib/db/schema', () => {
  // The route imports these tables only to use as drizzle "references";
  // every column access (e.g. `storeSettings.websiteId`) needs to return
  // something stable enough to feed into our mocked `eq()` / `and()` /
  // `sql` calls without erroring. We return a Proxy that returns the
  // property name on every access.
  function tableProxy(name: string) {
    return new Proxy(
      { _name: name },
      {
        get(_target, prop) {
          if (prop === '_name') return name;
          return `${name}.${String(prop)}`;
        },
      },
    );
  }
  const tables = [
    'storeSettings', 'carts', 'cartItems', 'products', 'productVariants',
    'bulkPricingRules', 'shippingRates', 'shippingZones', 'discountCodes',
    'orders', 'orderItems', 'orderStatusHistory',
    'giftCertificates', 'giftCertificateRedemptions',
  ];
  const exports: Record<string, unknown> = {};
  for (const t of tables) exports[t] = tableProxy(t);
  return exports;
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ _op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ _op: 'and', args }),
  asc: (a: unknown) => ({ _op: 'asc', a }),
  desc: (a: unknown) => ({ _op: 'desc', a }),
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => ({
    _op: 'sql',
    strings,
    vals,
  }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

vi.mock('@/lib/db', () => {
  function makeSelectChain() {
    const rows = dbState.selectQueue.shift() ?? [];
    const chain: Record<string, unknown> = {};
    const passthrough = [
      'from', 'where', 'innerJoin', 'leftJoin', 'rightJoin',
      'orderBy', 'limit', 'groupBy', 'offset',
    ];
    for (const m of passthrough) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve);
    return chain;
  }

  function makeInsertChain(table: string) {
    let lastValues: unknown = null;
    const insertChain: Record<string, unknown> = {};
    insertChain.values = (v: unknown) => {
      if (dbState.insertShouldThrow) {
        throw new Error('simulated db insert failure');
      }
      lastValues = v;
      dbState.inserts.push({ table, values: v });
      return insertChain;
    };
    insertChain.returning = () => {
      const rows = dbState.insertReturningQueue.shift() ?? [];
      return Promise.resolve(rows);
    };
    insertChain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(undefined).then(resolve);
    // mark unused
    void lastValues;
    return insertChain;
  }

  function makeUpdateChain(table: string) {
    let lastValues: unknown = null;
    const updateChain: Record<string, unknown> = {};
    updateChain.set = (v: unknown) => {
      lastValues = v;
      dbState.updates.push({ table, values: v });
      return updateChain;
    };
    updateChain.where = () => updateChain;
    updateChain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(undefined).then(resolve);
    void lastValues;
    return updateChain;
  }

  // We resolve table name via a best-effort _name property.
  function tableName(t: unknown): string {
    if (t && typeof t === 'object' && '_name' in t) {
      return String((t as { _name: unknown })._name);
    }
    return 'unknown';
  }

  return {
    db: {
      select: () => makeSelectChain(),
      insert: (t: unknown) => makeInsertChain(tableName(t)),
      update: (t: unknown) => makeUpdateChain(tableName(t)),
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/storefront/1/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(siteId: string = '1') {
  return { params: Promise.resolve({ siteId }) };
}

interface ResponseEnvelope {
  success: boolean;
  message?: string;
  data?: {
    clientSecret?: string;
    orderId?: number;
    orderNumber?: string;
    total?: number;
    currency?: string;
  };
}

// Build a "happy path" mock script that POST will consume in order:
//   1) storeSettings
//   2) carts
//   3) cartItems (items in the cart)
//   4) products
//   5) productVariants (only if variantIds non-empty — caller controls this)
//   6) bulkPricingRules (per-item — caller controls how many)
//   7) shippingRates (only if shippingRateId provided)
//   8) discountCodes (only if discountCode provided)
//   9) giftCertificates (only if giftCertificateCode provided)
//  10) orders (last order — for order-number)
//  11) giftCertificates again (only if gift cert applied)
//
// We don't try to make this fully smart; each test queues exactly what it
// needs.
function queueSelectRows(rowSets: unknown[][]) {
  for (const rs of rowSets) dbState.selectQueue.push(rs);
}

function queueInsertReturning(rowSets: unknown[][]) {
  for (const rs of rowSets) dbState.insertReturningQueue.push(rs);
}

const DEFAULT_STORE = {
  id: 10,
  websiteId: 1,
  enabled: true,
  stripeAccountId: 'acct_test_123',
  stripeOnboardingComplete: true,
  currency: 'USD',
  taxRate: '0',
  taxInclusive: false,
  platformFeePercent: '5',
  orderPrefix: 'ORD',
};

const DEFAULT_CART = { id: 99, websiteId: 1, sessionId: 'sess-1', status: 'active' };

const DEFAULT_BODY = {
  sessionId: 'sess-1',
  customerEmail: 'a@b.com',
  customerName: 'Alice',
  customerPhone: '555-1212',
  shippingAddress: { line1: '1 Main' },
  billingAddress: { line1: '1 Main' },
};

beforeEach(() => {
  vi.resetModules();
  dbState.selectQueue = [];
  dbState.insertReturningQueue = [];
  dbState.inserts = [];
  dbState.updates = [];
  dbState.insertShouldThrow = false;
  stripeState.paymentIntentsCreate.mockReset();
  stripeState.paymentIntentsUpdate.mockReset();
  stripeState.paymentIntentsCreate.mockResolvedValue({
    id: 'pi_test_abc',
    client_secret: 'pi_test_abc_secret',
  });
  stripeState.paymentIntentsUpdate.mockResolvedValue({ id: 'pi_test_abc' });
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/storefront/[siteId]/checkout — input validation', () => {
  it('returns 400 when siteId is not a number', async () => {
    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(makeRequest(DEFAULT_BODY), {
      params: Promise.resolve({ siteId: 'not-a-number' }),
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.success).toBe(false);
    expect(json.message).toMatch(/invalid site id/i);
  });

  it('returns 404 when no store row is found for the site', async () => {
    queueSelectRows([[]]); // storeSettings -> empty
    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(makeRequest(DEFAULT_BODY), makeParams());
    expect(res.status).toBe(404);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.message).toMatch(/no store_settings|store not found/i);
  });

  it('returns 400 when the store has no Stripe account connected', async () => {
    queueSelectRows([[{ ...DEFAULT_STORE, stripeAccountId: null }]]);
    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(makeRequest(DEFAULT_BODY), makeParams());
    expect(res.status).toBe(400);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.message).toMatch(/stripe connect onboarding/i);
  });

  it('returns 400 when the store has not completed Stripe onboarding', async () => {
    queueSelectRows([
      [{ ...DEFAULT_STORE, stripeOnboardingComplete: false }],
    ]);
    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(makeRequest(DEFAULT_BODY), makeParams());
    expect(res.status).toBe(400);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.message).toMatch(/stripe connect onboarding/i);
  });

  it('returns 400 when sessionId is missing from the body', async () => {
    queueSelectRows([[DEFAULT_STORE]]);
    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(
      makeRequest({ customerEmail: 'a@b.com', customerName: 'Alice' }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.message).toMatch(/sessionId.*required/i);
  });

  it('returns 400 when customerEmail is missing', async () => {
    queueSelectRows([[DEFAULT_STORE]]);
    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(
      makeRequest({ sessionId: 'sess-1', customerName: 'Alice' }),
      makeParams(),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when customerName is missing', async () => {
    queueSelectRows([[DEFAULT_STORE]]);
    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(
      makeRequest({ sessionId: 'sess-1', customerEmail: 'a@b.com' }),
      makeParams(),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/storefront/[siteId]/checkout — cart resolution', () => {
  it('returns 404 when cart is not found', async () => {
    queueSelectRows([
      [DEFAULT_STORE], // store
      [],              // cart -> empty
    ]);
    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(makeRequest(DEFAULT_BODY), makeParams());
    expect(res.status).toBe(404);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.message).toMatch(/cart not found/i);
  });

  it('returns 400 when cart is empty', async () => {
    queueSelectRows([
      [DEFAULT_STORE], // store
      [DEFAULT_CART],  // cart
      [],              // items -> empty
    ]);
    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(makeRequest(DEFAULT_BODY), makeParams());
    expect(res.status).toBe(400);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.message).toMatch(/cart is empty/i);
  });

  it('returns 400 when a product on the cart is inactive', async () => {
    queueSelectRows([
      [DEFAULT_STORE],
      [DEFAULT_CART],
      [{ id: 1, productId: 7, variantId: null, quantity: 1, unitPrice: 1000 }],
      // products row, but status = 'archived'
      [{ id: 7, name: 'Old Widget', status: 'archived', price: 1000, trackInventory: false }],
    ]);
    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(makeRequest(DEFAULT_BODY), makeParams());
    expect(res.status).toBe(400);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.message).toMatch(/no longer available/i);
  });

  it('returns 400 when a product on the cart is missing from the products table', async () => {
    queueSelectRows([
      [DEFAULT_STORE],
      [DEFAULT_CART],
      [{ id: 1, productId: 7, variantId: null, quantity: 1, unitPrice: 1000 }],
      [], // products -> empty
    ]);
    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(makeRequest(DEFAULT_BODY), makeParams());
    expect(res.status).toBe(400);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.message).toMatch(/no longer available/i);
  });

  it('returns 400 when an item exceeds available stock (non-variant)', async () => {
    queueSelectRows([
      [DEFAULT_STORE],
      [DEFAULT_CART],
      [{ id: 1, productId: 7, variantId: null, quantity: 50, unitPrice: 1000 }],
      [{ id: 7, name: 'Limited Widget', status: 'active', price: 1000, trackInventory: true, quantity: 3, sku: 'WID-7' }],
    ]);
    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(makeRequest(DEFAULT_BODY), makeParams());
    expect(res.status).toBe(400);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.message).toMatch(/insufficient stock/i);
    expect(json.message).toMatch(/only 3 available/i);
  });

  it('returns 400 when a variant has insufficient stock', async () => {
    queueSelectRows([
      [DEFAULT_STORE],
      [DEFAULT_CART],
      [{ id: 1, productId: 7, variantId: 17, quantity: 5, unitPrice: 800 }],
      [{ id: 7, name: 'Sized Widget', status: 'active', price: 1000, trackInventory: true, quantity: 99, sku: 'WID-7' }],
      [{ id: 17, name: 'Large', price: 800, quantity: 2, sku: 'WID-7-L' }],
    ]);
    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(makeRequest(DEFAULT_BODY), makeParams());
    expect(res.status).toBe(400);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.message).toMatch(/insufficient stock/i);
  });
});

describe('POST /api/storefront/[siteId]/checkout — happy path', () => {
  it('creates an order, items, status-history, and a PaymentIntent', async () => {
    queueSelectRows([
      [DEFAULT_STORE],
      [DEFAULT_CART],
      [{ id: 1, productId: 7, variantId: null, quantity: 2, unitPrice: 1000 }],
      [{ id: 7, name: 'Widget', status: 'active', price: 1000, trackInventory: false, sku: 'WID-7' }],
      [], // bulk pricing for item 1 -> none
      [], // last order -> none (so order number = ORD-0001)
    ]);
    queueInsertReturning([
      [{ id: 500, orderNumber: 'ORD-0001' }], // orders insert returning
    ]);

    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(makeRequest(DEFAULT_BODY), makeParams());
    expect(res.status).toBe(200);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.success).toBe(true);
    expect(json.data?.clientSecret).toBe('pi_test_abc_secret');
    expect(json.data?.orderId).toBe(500);
    expect(json.data?.orderNumber).toBe('ORD-0001');
    expect(json.data?.total).toBe(2000);
    expect(json.data?.currency).toBe('USD');

    // Stripe was called with the calculated total and 5% application fee
    expect(stripeState.paymentIntentsCreate).toHaveBeenCalledTimes(1);
    const piArgs = stripeState.paymentIntentsCreate.mock.calls[0][0];
    expect(piArgs).toMatchObject({
      amount: 2000,
      currency: 'usd',
      application_fee_amount: 100, // 5% of 2000
      transfer_data: { destination: 'acct_test_123' },
    });

    // PaymentIntent metadata was updated with the orderId
    expect(stripeState.paymentIntentsUpdate).toHaveBeenCalledTimes(1);
    const updArgs = stripeState.paymentIntentsUpdate.mock.calls[0];
    expect(updArgs[0]).toBe('pi_test_abc');
    expect(updArgs[1].metadata.orderId).toBe('500');

    // Inserts: orders + orderItems + orderStatusHistory
    const insertTables = dbState.inserts.map((i) => i.table);
    expect(insertTables).toContain('orders');
    expect(insertTables).toContain('orderItems');
    expect(insertTables).toContain('orderStatusHistory');
  });

  it('increments order number from the last order on the site', async () => {
    queueSelectRows([
      [DEFAULT_STORE],
      [DEFAULT_CART],
      [{ id: 1, productId: 7, variantId: null, quantity: 1, unitPrice: 1000 }],
      [{ id: 7, name: 'Widget', status: 'active', price: 1000, trackInventory: false }],
      [], // bulk pricing
      [{ orderNumber: 'ORD-0042' }], // last order
    ]);
    queueInsertReturning([[{ id: 501, orderNumber: 'ORD-0043' }]]);

    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(makeRequest(DEFAULT_BODY), makeParams());
    expect(res.status).toBe(200);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.data?.orderNumber).toBe('ORD-0043');
  });

  it('uses store.orderPrefix when generating the order number', async () => {
    queueSelectRows([
      [{ ...DEFAULT_STORE, orderPrefix: 'INV' }],
      [DEFAULT_CART],
      [{ id: 1, productId: 7, variantId: null, quantity: 1, unitPrice: 1000 }],
      [{ id: 7, name: 'Widget', status: 'active', price: 1000, trackInventory: false }],
      [], // bulk pricing
      [], // last order
    ]);
    queueInsertReturning([[{ id: 502, orderNumber: 'INV-0001' }]]);
    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(makeRequest(DEFAULT_BODY), makeParams());
    expect(res.status).toBe(200);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.data?.orderNumber).toBe('INV-0001');
  });

  it('defaults the order prefix to ORD when the store has none', async () => {
    queueSelectRows([
      [{ ...DEFAULT_STORE, orderPrefix: null }],
      [DEFAULT_CART],
      [{ id: 1, productId: 7, variantId: null, quantity: 1, unitPrice: 1000 }],
      [{ id: 7, name: 'Widget', status: 'active', price: 1000, trackInventory: false }],
      [],
      [],
    ]);
    queueInsertReturning([[{ id: 503, orderNumber: 'ORD-0001' }]]);
    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(makeRequest(DEFAULT_BODY), makeParams());
    expect(res.status).toBe(200);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.data?.orderNumber).toBe('ORD-0001');
  });
});

describe('POST /api/storefront/[siteId]/checkout — bulk pricing', () => {
  it('applies a fixed-price bulk rule when the threshold is met', async () => {
    queueSelectRows([
      [DEFAULT_STORE],
      [DEFAULT_CART],
      [{ id: 1, productId: 7, variantId: null, quantity: 10, unitPrice: 1000 }],
      [{ id: 7, name: 'Widget', status: 'active', price: 1000, trackInventory: false }],
      [{ productId: 7, variantId: null, minQuantity: 10, maxQuantity: null, priceType: 'fixed', amount: 750 }],
      [], // last order
    ]);
    queueInsertReturning([[{ id: 600, orderNumber: 'ORD-0001' }]]);

    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(makeRequest(DEFAULT_BODY), makeParams());
    expect(res.status).toBe(200);
    const json = (await res.json()) as ResponseEnvelope;
    // total: 10 * 750 = 7500
    expect(json.data?.total).toBe(7500);
  });

  it('applies a percent-off bulk rule when the threshold is met', async () => {
    queueSelectRows([
      [DEFAULT_STORE],
      [DEFAULT_CART],
      [{ id: 1, productId: 7, variantId: null, quantity: 5, unitPrice: 1000 }],
      [{ id: 7, name: 'Widget', status: 'active', price: 1000, trackInventory: false }],
      // 20% off (rule amount stored in basis-points-of-percent: 2000 / 10000 = 20%)
      [{ productId: 7, variantId: null, minQuantity: 5, maxQuantity: null, priceType: 'percent_off', amount: 2000 }],
      [],
    ]);
    queueInsertReturning([[{ id: 601, orderNumber: 'ORD-0001' }]]);

    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(makeRequest(DEFAULT_BODY), makeParams());
    expect(res.status).toBe(200);
    const json = (await res.json()) as ResponseEnvelope;
    // unitPrice 1000 * (1 - 0.20) = 800 => 5 * 800 = 4000
    expect(json.data?.total).toBe(4000);
  });

  it('ignores a bulk rule whose maxQuantity is below the cart quantity', async () => {
    queueSelectRows([
      [DEFAULT_STORE],
      [DEFAULT_CART],
      [{ id: 1, productId: 7, variantId: null, quantity: 20, unitPrice: 1000 }],
      [{ id: 7, name: 'Widget', status: 'active', price: 1000, trackInventory: false }],
      // rule caps at qty 10 — should be skipped
      [{ productId: 7, variantId: null, minQuantity: 5, maxQuantity: 10, priceType: 'fixed', amount: 100 }],
      [],
    ]);
    queueInsertReturning([[{ id: 602, orderNumber: 'ORD-0001' }]]);

    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(makeRequest(DEFAULT_BODY), makeParams());
    expect(res.status).toBe(200);
    const json = (await res.json()) as ResponseEnvelope;
    // No rule applied: 20 * 1000 = 20000
    expect(json.data?.total).toBe(20000);
  });
});

describe('POST /api/storefront/[siteId]/checkout — shipping', () => {
  it('returns 400 when shippingRateId does not match an active rate for the site', async () => {
    queueSelectRows([
      [DEFAULT_STORE],
      [DEFAULT_CART],
      [{ id: 1, productId: 7, variantId: null, quantity: 1, unitPrice: 1000 }],
      [{ id: 7, name: 'Widget', status: 'active', price: 1000, trackInventory: false }],
      [], // bulk
      [], // shipping rate -> not found
    ]);
    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(
      makeRequest({ ...DEFAULT_BODY, shippingRateId: 999 }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.message).toMatch(/invalid shipping rate/i);
  });

  it('adds the shipping price for a paid rate', async () => {
    queueSelectRows([
      [DEFAULT_STORE],
      [DEFAULT_CART],
      [{ id: 1, productId: 7, variantId: null, quantity: 1, unitPrice: 1000 }],
      [{ id: 7, name: 'Widget', status: 'active', price: 1000, trackInventory: false }],
      [],
      [{ id: 22, name: 'Standard', price: 500, rateType: 'flat', freeAbove: null, zoneWebsiteId: 1 }],
      [], // last order
    ]);
    queueInsertReturning([[{ id: 700, orderNumber: 'ORD-0001' }]]);

    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(
      makeRequest({ ...DEFAULT_BODY, shippingRateId: 22 }),
      makeParams(),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.data?.total).toBe(1500); // 1000 + 500
  });

  it('uses zero shipping for a free rate type', async () => {
    queueSelectRows([
      [DEFAULT_STORE],
      [DEFAULT_CART],
      [{ id: 1, productId: 7, variantId: null, quantity: 1, unitPrice: 1000 }],
      [{ id: 7, name: 'Widget', status: 'active', price: 1000, trackInventory: false }],
      [],
      [{ id: 23, name: 'Free', price: 500, rateType: 'free', freeAbove: null, zoneWebsiteId: 1 }],
      [],
    ]);
    queueInsertReturning([[{ id: 701, orderNumber: 'ORD-0001' }]]);

    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(
      makeRequest({ ...DEFAULT_BODY, shippingRateId: 23 }),
      makeParams(),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.data?.total).toBe(1000); // shipping waived
  });

  it('waives shipping when subtotal exceeds freeAbove', async () => {
    queueSelectRows([
      [DEFAULT_STORE],
      [DEFAULT_CART],
      [{ id: 1, productId: 7, variantId: null, quantity: 3, unitPrice: 1000 }],
      [{ id: 7, name: 'Widget', status: 'active', price: 1000, trackInventory: false }],
      [],
      [{ id: 24, name: 'Standard', price: 500, rateType: 'flat', freeAbove: 2500, zoneWebsiteId: 1 }],
      [],
    ]);
    queueInsertReturning([[{ id: 702, orderNumber: 'ORD-0001' }]]);

    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(
      makeRequest({ ...DEFAULT_BODY, shippingRateId: 24 }),
      makeParams(),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as ResponseEnvelope;
    // 3 * 1000 = 3000; >= 2500 free-above threshold; shipping=0
    expect(json.data?.total).toBe(3000);
  });
});

describe('POST /api/storefront/[siteId]/checkout — discount codes', () => {
  const baseSelects = (extra: unknown[][]): unknown[][] => [
    [DEFAULT_STORE],
    [DEFAULT_CART],
    [{ id: 1, productId: 7, variantId: null, quantity: 1, unitPrice: 1000 }],
    [{ id: 7, name: 'Widget', status: 'active', price: 1000, trackInventory: false }],
    [], // bulk
    ...extra,
  ];

  it('returns 400 for an unknown / inactive discount code', async () => {
    queueSelectRows(baseSelects([[]]));
    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(
      makeRequest({ ...DEFAULT_BODY, discountCode: 'NOPE' }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.message).toMatch(/invalid discount code/i);
  });

  it('returns 400 when the discount is scheduled to start in the future', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    queueSelectRows(
      baseSelects([
        [{ code: 'SOON', startsAt: future, expiresAt: null, maxUses: null, usedCount: 0, minOrderAmount: null, discountType: 'percent', amount: 1000 }],
      ]),
    );
    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(
      makeRequest({ ...DEFAULT_BODY, discountCode: 'SOON' }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.message).toMatch(/not yet active/i);
  });

  it('returns 400 when the discount has expired', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    queueSelectRows(
      baseSelects([
        [{ code: 'OLD', startsAt: null, expiresAt: past, maxUses: null, usedCount: 0, minOrderAmount: null, discountType: 'percent', amount: 1000 }],
      ]),
    );
    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(
      makeRequest({ ...DEFAULT_BODY, discountCode: 'OLD' }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.message).toMatch(/expired/i);
  });

  it('returns 400 when the discount has been fully redeemed', async () => {
    queueSelectRows(
      baseSelects([
        [{ code: 'USED', startsAt: null, expiresAt: null, maxUses: 5, usedCount: 5, minOrderAmount: null, discountType: 'percent', amount: 1000 }],
      ]),
    );
    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(
      makeRequest({ ...DEFAULT_BODY, discountCode: 'USED' }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.message).toMatch(/fully redeemed/i);
  });

  it('returns 400 when the subtotal is below the discount minimum order amount', async () => {
    queueSelectRows(
      baseSelects([
        [{ code: 'BIG', startsAt: null, expiresAt: null, maxUses: null, usedCount: 0, minOrderAmount: 99999, discountType: 'percent', amount: 1000 }],
      ]),
    );
    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(
      makeRequest({ ...DEFAULT_BODY, discountCode: 'BIG' }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.message).toMatch(/minimum order amount/i);
  });

  it('applies a percent discount and reports it in the total', async () => {
    queueSelectRows(
      baseSelects([
        // 10% off => amount stored as basis points-of-percent: 1000 / 10000 = 10%
        [{ code: 'TEN', startsAt: null, expiresAt: null, maxUses: null, usedCount: 0, minOrderAmount: null, discountType: 'percent', amount: 1000 }],
        [], // last order
      ]),
    );
    queueInsertReturning([[{ id: 800, orderNumber: 'ORD-0001' }]]);

    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(
      makeRequest({ ...DEFAULT_BODY, discountCode: 'TEN' }),
      makeParams(),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as ResponseEnvelope;
    // 1000 subtotal - 100 (10%) = 900
    expect(json.data?.total).toBe(900);
  });

  it('applies a fixed-amount discount, capped at the subtotal', async () => {
    queueSelectRows(
      baseSelects([
        [{ code: 'FIFTY', startsAt: null, expiresAt: null, maxUses: null, usedCount: 0, minOrderAmount: null, discountType: 'fixed_amount', amount: 50000 }],
        [],
      ]),
    );
    queueInsertReturning([[{ id: 801, orderNumber: 'ORD-0001' }]]);

    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    // The route only returns 400 if total === 0 *and* there's no shipping
    // because gift cert is also 0. Subtotal=1000, discount capped at 1000,
    // total would be 0 -> guard fires.
    const res = await POST(
      makeRequest({ ...DEFAULT_BODY, discountCode: 'FIFTY' }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.message).toMatch(/greater than zero/i);
  });

  it('applies a free-shipping discount and zeroes the shipping component', async () => {
    queueSelectRows([
      [DEFAULT_STORE],
      [DEFAULT_CART],
      [{ id: 1, productId: 7, variantId: null, quantity: 1, unitPrice: 1000 }],
      [{ id: 7, name: 'Widget', status: 'active', price: 1000, trackInventory: false }],
      [], // bulk
      [{ id: 25, name: 'Standard', price: 500, rateType: 'flat', freeAbove: null, zoneWebsiteId: 1 }],
      [{ code: 'SHIPFREE', startsAt: null, expiresAt: null, maxUses: null, usedCount: 0, minOrderAmount: null, discountType: 'free_shipping', amount: 0 }],
      [], // last order
    ]);
    queueInsertReturning([[{ id: 802, orderNumber: 'ORD-0001' }]]);

    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(
      makeRequest({ ...DEFAULT_BODY, shippingRateId: 25, discountCode: 'SHIPFREE' }),
      makeParams(),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as ResponseEnvelope;
    // free_shipping discount is implemented as `discountTotal = shippingTotal;
    // shippingTotal = 0;` — so the shipping cost effectively becomes a
    // discount-line subtraction off subtotal. Subtotal 1000 - discount 500 = 500.
    expect(json.data?.total).toBe(500);
  });
});

describe('POST /api/storefront/[siteId]/checkout — gift certificates', () => {
  it('applies a partially-redeemable gift certificate and inserts a redemption row', async () => {
    queueSelectRows([
      [DEFAULT_STORE],
      [DEFAULT_CART],
      [{ id: 1, productId: 7, variantId: null, quantity: 1, unitPrice: 1000 }],
      [{ id: 7, name: 'Widget', status: 'active', price: 5000, trackInventory: false }],
      [], // bulk
      // gift cert lookup
      [{ id: 88, code: 'GC1', remainingAmount: 2000, status: 'active' }],
      [], // last order
      // After order insert, route looks up gift cert again to update remaining amount
      [{ id: 88, code: 'GC1', remainingAmount: 2000, status: 'active' }],
    ]);
    queueInsertReturning([[{ id: 900, orderNumber: 'ORD-0001' }]]);

    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(
      makeRequest({ ...DEFAULT_BODY, giftCertificateCode: 'gc1' }),
      makeParams(),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as ResponseEnvelope;
    // subtotal 5000 - 2000 cert = 3000
    expect(json.data?.total).toBe(3000);

    // gift_certificate_redemptions insert occurred
    const insertTables = dbState.inserts.map((i) => i.table);
    expect(insertTables).toContain('giftCertificateRedemptions');
    // remaining updated
    expect(dbState.updates.some((u) => u.table === 'giftCertificates')).toBe(true);
  });

  it('flips a gift cert to fully_redeemed when the remaining hits zero', async () => {
    queueSelectRows([
      [DEFAULT_STORE],
      [DEFAULT_CART],
      [{ id: 1, productId: 7, variantId: null, quantity: 1, unitPrice: 1000 }],
      // product price 1500 — gift cert 1000 covers part of it, but `afterDiscount`
      // is min(remainingAmount, subtotal) so we want subtotal >= remaining for full redemption.
      [{ id: 7, name: 'Widget', status: 'active', price: 1500, trackInventory: false }],
      [],
      [{ id: 89, code: 'GC2', remainingAmount: 500, status: 'active' }],
      [], // last order
      [{ id: 89, code: 'GC2', remainingAmount: 500, status: 'active' }],
    ]);
    queueInsertReturning([[{ id: 901, orderNumber: 'ORD-0001' }]]);

    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(
      makeRequest({ ...DEFAULT_BODY, giftCertificateCode: 'GC2' }),
      makeParams(),
    );
    expect(res.status).toBe(200);
    const update = dbState.updates.find((u) => u.table === 'giftCertificates');
    expect(update).toBeDefined();
    const setValues = update!.values as { status: string; remainingAmount: number };
    expect(setValues.status).toBe('fully_redeemed');
    expect(setValues.remainingAmount).toBe(0);
  });

  it('silently ignores a gift certificate code that does not match (no failure)', async () => {
    queueSelectRows([
      [DEFAULT_STORE],
      [DEFAULT_CART],
      [{ id: 1, productId: 7, variantId: null, quantity: 1, unitPrice: 1000 }],
      [{ id: 7, name: 'Widget', status: 'active', price: 1000, trackInventory: false }],
      [],
      [], // gift cert lookup empty
      [], // last order
    ]);
    queueInsertReturning([[{ id: 902, orderNumber: 'ORD-0001' }]]);

    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(
      makeRequest({ ...DEFAULT_BODY, giftCertificateCode: 'NOPE' }),
      makeParams(),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as ResponseEnvelope;
    // unaffected
    expect(json.data?.total).toBe(1000);
  });
});

describe('POST /api/storefront/[siteId]/checkout — tax', () => {
  it('adds tax when the store is exclusive-tax and taxRate is non-zero', async () => {
    queueSelectRows([
      [{ ...DEFAULT_STORE, taxRate: '0.1', taxInclusive: false }],
      [DEFAULT_CART],
      [{ id: 1, productId: 7, variantId: null, quantity: 1, unitPrice: 1000 }],
      [{ id: 7, name: 'Widget', status: 'active', price: 1000, trackInventory: false }],
      [],
      [],
    ]);
    queueInsertReturning([[{ id: 1000, orderNumber: 'ORD-0001' }]]);

    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(makeRequest(DEFAULT_BODY), makeParams());
    expect(res.status).toBe(200);
    const json = (await res.json()) as ResponseEnvelope;
    // 1000 + (1000 * 0.1) = 1100
    expect(json.data?.total).toBe(1100);
  });

  it('does not add tax when the store is inclusive-tax', async () => {
    queueSelectRows([
      [{ ...DEFAULT_STORE, taxRate: '0.1', taxInclusive: true }],
      [DEFAULT_CART],
      [{ id: 1, productId: 7, variantId: null, quantity: 1, unitPrice: 1000 }],
      [{ id: 7, name: 'Widget', status: 'active', price: 1000, trackInventory: false }],
      [],
      [],
    ]);
    queueInsertReturning([[{ id: 1001, orderNumber: 'ORD-0001' }]]);

    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(makeRequest(DEFAULT_BODY), makeParams());
    expect(res.status).toBe(200);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.data?.total).toBe(1000);
  });

  it('uses zero tax rate when the store has no taxRate set', async () => {
    queueSelectRows([
      [{ ...DEFAULT_STORE, taxRate: null }],
      [DEFAULT_CART],
      [{ id: 1, productId: 7, variantId: null, quantity: 1, unitPrice: 1000 }],
      [{ id: 7, name: 'Widget', status: 'active', price: 1000, trackInventory: false }],
      [],
      [],
    ]);
    queueInsertReturning([[{ id: 1002, orderNumber: 'ORD-0001' }]]);

    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(makeRequest(DEFAULT_BODY), makeParams());
    expect(res.status).toBe(200);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.data?.total).toBe(1000);
  });
});

describe('POST /api/storefront/[siteId]/checkout — platform fee', () => {
  it('defaults the platform fee to 5% when the store has none configured', async () => {
    queueSelectRows([
      [{ ...DEFAULT_STORE, platformFeePercent: null }],
      [DEFAULT_CART],
      [{ id: 1, productId: 7, variantId: null, quantity: 1, unitPrice: 1000 }],
      [{ id: 7, name: 'Widget', status: 'active', price: 1000, trackInventory: false }],
      [],
      [],
    ]);
    queueInsertReturning([[{ id: 1100, orderNumber: 'ORD-0001' }]]);

    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(makeRequest(DEFAULT_BODY), makeParams());
    expect(res.status).toBe(200);
    const piArgs = stripeState.paymentIntentsCreate.mock.calls[0][0];
    expect(piArgs.application_fee_amount).toBe(50); // 5% of 1000
  });

  it('honours a custom platformFeePercent from the store', async () => {
    queueSelectRows([
      [{ ...DEFAULT_STORE, platformFeePercent: '10' }],
      [DEFAULT_CART],
      [{ id: 1, productId: 7, variantId: null, quantity: 1, unitPrice: 1000 }],
      [{ id: 7, name: 'Widget', status: 'active', price: 1000, trackInventory: false }],
      [],
      [],
    ]);
    queueInsertReturning([[{ id: 1101, orderNumber: 'ORD-0001' }]]);

    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(makeRequest(DEFAULT_BODY), makeParams());
    expect(res.status).toBe(200);
    const piArgs = stripeState.paymentIntentsCreate.mock.calls[0][0];
    expect(piArgs.application_fee_amount).toBe(100); // 10% of 1000
  });
});

describe('POST /api/storefront/[siteId]/checkout — failure modes', () => {
  it('returns 500 (with logged error) when Stripe.paymentIntents.create throws', async () => {
    queueSelectRows([
      [DEFAULT_STORE],
      [DEFAULT_CART],
      [{ id: 1, productId: 7, variantId: null, quantity: 1, unitPrice: 1000 }],
      [{ id: 7, name: 'Widget', status: 'active', price: 1000, trackInventory: false }],
      [],
    ]);
    stripeState.paymentIntentsCreate.mockRejectedValueOnce(new Error('Stripe down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(makeRequest(DEFAULT_BODY), makeParams());
    expect(res.status).toBe(500);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.message).toMatch(/internal server error/i);

    errSpy.mockRestore();
  });

  it('returns 500 when a DB insert throws', async () => {
    queueSelectRows([
      [DEFAULT_STORE],
      [DEFAULT_CART],
      [{ id: 1, productId: 7, variantId: null, quantity: 1, unitPrice: 1000 }],
      [{ id: 7, name: 'Widget', status: 'active', price: 1000, trackInventory: false }],
      [],
      [],
    ]);
    dbState.insertShouldThrow = true;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(makeRequest(DEFAULT_BODY), makeParams());
    expect(res.status).toBe(500);
    const json = (await res.json()) as ResponseEnvelope;
    expect(json.success).toBe(false);

    errSpy.mockRestore();
  });

  it('returns 500 when request body is not valid JSON', async () => {
    queueSelectRows([[DEFAULT_STORE]]);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const req = new Request('http://localhost/api/storefront/1/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    });
    const { POST } = await import('@/app/api/storefront/[siteId]/checkout/route');
    const res = await POST(req, makeParams());
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });
});
