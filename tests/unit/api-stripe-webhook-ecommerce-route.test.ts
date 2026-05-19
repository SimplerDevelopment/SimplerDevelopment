// @vitest-environment node
/**
 * Unit tests for `POST /api/stripe/webhook/ecommerce`.
 *
 * Stripe sends webhook events to this route. The route:
 *   - Refuses to run without STRIPE_SECRET_KEY + STRIPE_ECOMMERCE_WEBHOOK_SECRET
 *   - Verifies the Stripe signature via stripe.webhooks.constructEvent
 *   - Branches on event.type:
 *       * payment_intent.succeeded  -> mark order paid, decrement inventory,
 *                                      mark cart converted, bump discount-code
 *                                      usage, send confirmation email, emit
 *                                      automation event
 *       * payment_intent.payment_failed -> mark order failed, send retry email
 *       * charge.refunded -> mark order refunded, send refund email
 *
 * Each test stubs the entire dependency surface (db, schema, drizzle-orm,
 * Stripe SDK, email + automation helpers) — no live network or DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock harness state
// ---------------------------------------------------------------------------

interface StripeMockState {
  constructEvent: ReturnType<typeof vi.fn>;
}

const stripeState: StripeMockState = {
  constructEvent: vi.fn(),
};

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

interface EmailMockState {
  sendTransactionalEmail: ReturnType<typeof vi.fn>;
  getWebsiteUrls: ReturnType<typeof vi.fn>;
}

const emailState: EmailMockState = {
  sendTransactionalEmail: vi.fn(),
  getWebsiteUrls: vi.fn(),
};

interface AutomationMockState {
  emitEvent: ReturnType<typeof vi.fn>;
}

const automationState: AutomationMockState = {
  emitEvent: vi.fn(),
};

// ---------------------------------------------------------------------------
// Mocks (must be declared before importing the route under test)
// ---------------------------------------------------------------------------

vi.mock('stripe', () => {
  class Stripe {
    webhooks = {
      constructEvent: (...args: unknown[]) => stripeState.constructEvent(...args),
    };
  }
  return { default: Stripe };
});

vi.mock('@/lib/db/schema', () => {
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
    'orders', 'orderItems', 'orderStatusHistory',
    'carts', 'products', 'productVariants', 'discountCodes',
  ];
  const exports: Record<string, unknown> = {};
  for (const t of tables) exports[t] = tableProxy(t);
  return exports;
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ _op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ _op: 'and', args }),
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => ({
    _op: 'sql',
    strings,
    vals,
  }),
}));

vi.mock('@/lib/db', () => {
  function makeSelectChain() {
    const rows = dbState.selectQueue.shift() ?? [];
    const chain: Record<string, unknown> = {};
    const passthrough = ['from', 'where', 'innerJoin', 'leftJoin', 'orderBy', 'limit', 'groupBy', 'offset'];
    for (const m of passthrough) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve);
    return chain;
  }

  function makeInsertChain(table: string) {
    const insertChain: Record<string, unknown> = {};
    insertChain.values = (v: unknown) => {
      dbState.inserts.push({ table, values: v });
      return insertChain;
    };
    insertChain.returning = () => Promise.resolve([]);
    insertChain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(undefined).then(resolve);
    return insertChain;
  }

  function makeUpdateChain(table: string) {
    const updateChain: Record<string, unknown> = {};
    updateChain.set = (v: unknown) => {
      dbState.updates.push({ table, values: v });
      return updateChain;
    };
    updateChain.where = () => updateChain;
    updateChain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(undefined).then(resolve);
    return updateChain;
  }

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

vi.mock('@/lib/email/send-transactional', () => ({
  sendTransactionalEmail: (...args: unknown[]) => emailState.sendTransactionalEmail(...args),
  getWebsiteUrls: (...args: unknown[]) => emailState.getWebsiteUrls(...args),
  formatCents: (n: number) => `$${(n / 100).toFixed(2)}`,
  formatAddress: (addr: unknown) => JSON.stringify(addr ?? {}),
  formatEmailDate: (d: unknown) => String(d ?? ''),
  buildItemsHtml: (items: unknown[]) => `<ul>${items.length}</ul>`,
}));

vi.mock('@/lib/automation/event-bus', () => ({
  emitEvent: (...args: unknown[]) => automationState.emitEvent(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: string, sig: string | null = 't=1,v1=sig'): Request {
  const headers: Record<string, string> = {};
  if (sig !== null) headers['stripe-signature'] = sig;
  return new Request('http://localhost/api/stripe/webhook/ecommerce', {
    method: 'POST',
    headers,
    body,
  });
}

interface JsonResponse {
  received?: boolean;
  error?: string;
}

const DEFAULT_ORDER = {
  id: 500,
  websiteId: 1,
  orderNumber: 'ORD-0001',
  customerEmail: 'alice@example.com',
  customerName: 'Alice Smith',
  total: 5000,
  subtotal: 4500,
  shippingTotal: 500,
  taxTotal: 0,
  discountTotal: 0,
  discountCode: null as string | null,
  shippingAddress: { line1: '1 Main' },
  billingAddress: { line1: '1 Main' },
  createdAt: new Date('2026-01-15T10:00:00Z'),
};

beforeEach(() => {
  vi.resetModules();
  dbState.selectQueue = [];
  dbState.inserts = [];
  dbState.updates = [];
  stripeState.constructEvent.mockReset();
  emailState.sendTransactionalEmail.mockReset();
  emailState.sendTransactionalEmail.mockResolvedValue(undefined);
  emailState.getWebsiteUrls.mockReset();
  emailState.getWebsiteUrls.mockResolvedValue({
    orderUrl: (orderNum: string) => `https://shop.example.com/orders/${orderNum}`,
  });
  automationState.emitEvent.mockReset();
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.STRIPE_ECOMMERCE_WEBHOOK_SECRET = 'whsec_test_dummy';
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/stripe/webhook/ecommerce — configuration guards', () => {
  it('returns 500 when STRIPE_SECRET_KEY is missing', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { POST } = await import('@/app/api/stripe/webhook/ecommerce/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(500);
    const json = (await res.json()) as JsonResponse;
    expect(json.error).toMatch(/stripe not configured/i);
  });

  it('returns 500 when STRIPE_ECOMMERCE_WEBHOOK_SECRET is missing', async () => {
    delete process.env.STRIPE_ECOMMERCE_WEBHOOK_SECRET;
    const { POST } = await import('@/app/api/stripe/webhook/ecommerce/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(500);
    const json = (await res.json()) as JsonResponse;
    expect(json.error).toMatch(/stripe not configured/i);
  });
});

describe('POST /api/stripe/webhook/ecommerce — signature verification', () => {
  it('returns 400 when constructEvent throws (invalid signature)', async () => {
    stripeState.constructEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { POST } = await import('@/app/api/stripe/webhook/ecommerce/route');
    const res = await POST(makeRequest('{}', 'bad'));
    expect(res.status).toBe(400);
    const json = (await res.json()) as JsonResponse;
    expect(json.error).toBe('webhook_error');
    expect(stripeState.constructEvent).toHaveBeenCalledTimes(1);
    errSpy.mockRestore();
  });

  it('passes raw body, signature header, and webhook secret into constructEvent', async () => {
    stripeState.constructEvent.mockReturnValue({ type: 'unhandled.event', data: { object: {} } });
    const { POST } = await import('@/app/api/stripe/webhook/ecommerce/route');
    const res = await POST(makeRequest('{"foo":"bar"}', 't=1,v1=abc'));
    expect(res.status).toBe(200);
    expect(stripeState.constructEvent).toHaveBeenCalledTimes(1);
    const args = stripeState.constructEvent.mock.calls[0];
    expect(args[0]).toBe('{"foo":"bar"}');
    expect(args[1]).toBe('t=1,v1=abc');
    expect(args[2]).toBe('whsec_test_dummy');
  });

  it('treats a missing stripe-signature header as empty string', async () => {
    stripeState.constructEvent.mockReturnValue({ type: 'unhandled.event', data: { object: {} } });
    const { POST } = await import('@/app/api/stripe/webhook/ecommerce/route');
    const res = await POST(makeRequest('{}', null));
    expect(res.status).toBe(200);
    expect(stripeState.constructEvent.mock.calls[0][1]).toBe('');
  });
});

describe('POST /api/stripe/webhook/ecommerce — unhandled event types', () => {
  it('acknowledges (received: true) without doing any DB work', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'customer.subscription.created',
      data: { object: {} },
    });
    const { POST } = await import('@/app/api/stripe/webhook/ecommerce/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as JsonResponse;
    expect(json.received).toBe(true);
    expect(dbState.updates).toHaveLength(0);
    expect(dbState.inserts).toHaveLength(0);
    expect(emailState.sendTransactionalEmail).not.toHaveBeenCalled();
    expect(automationState.emitEvent).not.toHaveBeenCalled();
  });
});

describe('POST /api/stripe/webhook/ecommerce — payment_intent.succeeded', () => {
  it('skips when paymentIntent has no orderId metadata', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_no_meta', metadata: {} } },
    });
    const { POST } = await import('@/app/api/stripe/webhook/ecommerce/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as JsonResponse;
    expect(json.received).toBe(true);
    expect(dbState.updates).toHaveLength(0);
  });

  it('skips and logs when the referenced order does not exist', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_missing', metadata: { orderId: '999' } } },
    });
    dbState.selectQueue.push([]); // orders lookup -> empty

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { POST } = await import('@/app/api/stripe/webhook/ecommerce/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as JsonResponse;
    expect(json.received).toBe(true);
    expect(errSpy).toHaveBeenCalled();
    expect(dbState.updates).toHaveLength(0);
    errSpy.mockRestore();
  });

  it('marks the order paid, decrements inventory, converts cart, sends email, emits event', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_ok',
          metadata: { orderId: '500', orderNumber: 'ORD-0001', websiteId: '1' },
        },
      },
    });
    dbState.selectQueue.push([DEFAULT_ORDER]); // order lookup
    dbState.selectQueue.push([
      { id: 1, orderId: 500, productId: 7, variantId: 17, quantity: 2 },
      { id: 2, orderId: 500, productId: 8, variantId: null, quantity: 1 },
    ]); // order items

    const { POST } = await import('@/app/api/stripe/webhook/ecommerce/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);

    // orders.update -> paymentStatus paid
    const orderUpdate = dbState.updates.find(
      (u) => u.table === 'orders' && (u.values as { paymentStatus?: string }).paymentStatus === 'paid',
    );
    expect(orderUpdate).toBeDefined();

    // orderStatusHistory insert with status=confirmed
    const histInsert = dbState.inserts.find((i) => i.table === 'orderStatusHistory');
    expect(histInsert).toBeDefined();
    expect((histInsert!.values as { status: string }).status).toBe('confirmed');

    // inventory: one variant update + one product-only update + one variant->product update for item1
    const productVariantUpdates = dbState.updates.filter((u) => u.table === 'productVariants');
    const productUpdates = dbState.updates.filter((u) => u.table === 'products');
    expect(productVariantUpdates.length).toBe(1);
    // both items have productId set, so we expect 2 product updates
    expect(productUpdates.length).toBe(2);

    // carts updated to converted
    const cartUpdate = dbState.updates.find((u) => u.table === 'carts');
    expect(cartUpdate).toBeDefined();
    expect((cartUpdate!.values as { status: string }).status).toBe('converted');

    // email
    expect(emailState.sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const emailArg = emailState.sendTransactionalEmail.mock.calls[0][0];
    expect(emailArg.event).toBe('order.confirmed');
    expect(emailArg.to).toBe('alice@example.com');
    expect(emailArg.variables.firstName).toBe('Alice');
    expect(emailArg.variables.lastName).toBe('Smith');
    expect(emailArg.variables.orderNumber).toBe('ORD-0001');

    // automation event emitted
    expect(automationState.emitEvent).toHaveBeenCalledTimes(1);
    const evArgs = automationState.emitEvent.mock.calls[0];
    expect(evArgs[0]).toBe('order.paid');
    expect(evArgs[1]).toBe(1); // websiteId
    expect(evArgs[3]).toMatchObject({
      orderId: 500,
      orderNumber: 'ORD-0001',
      customerEmail: 'alice@example.com',
      total: 5000,
    });
  });

  it('increments discountCodes.usedCount when the order used a discount code', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_disc', metadata: { orderId: '500' } } },
    });
    dbState.selectQueue.push([{ ...DEFAULT_ORDER, discountCode: 'SAVE10' }]);
    dbState.selectQueue.push([]); // no items

    const { POST } = await import('@/app/api/stripe/webhook/ecommerce/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);

    const discUpdate = dbState.updates.find((u) => u.table === 'discountCodes');
    expect(discUpdate).toBeDefined();
  });

  it('does not touch discountCodes when the order has no discount code', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_nodisc', metadata: { orderId: '500' } } },
    });
    dbState.selectQueue.push([{ ...DEFAULT_ORDER, discountCode: null }]);
    dbState.selectQueue.push([]);

    const { POST } = await import('@/app/api/stripe/webhook/ecommerce/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);

    const discUpdate = dbState.updates.find((u) => u.table === 'discountCodes');
    expect(discUpdate).toBeUndefined();
  });

  it('handles single-name customers (lastName -> empty string) without crashing', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_solo', metadata: { orderId: '500' } } },
    });
    dbState.selectQueue.push([{ ...DEFAULT_ORDER, customerName: 'Madonna' }]);
    dbState.selectQueue.push([]);

    const { POST } = await import('@/app/api/stripe/webhook/ecommerce/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    const emailArg = emailState.sendTransactionalEmail.mock.calls[0][0];
    expect(emailArg.variables.firstName).toBe('Madonna');
    expect(emailArg.variables.lastName).toBe('');
  });

  it('continues even if sendTransactionalEmail rejects (.catch swallow)', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_emailfail', metadata: { orderId: '500' } } },
    });
    dbState.selectQueue.push([DEFAULT_ORDER]);
    dbState.selectQueue.push([]);
    emailState.sendTransactionalEmail.mockRejectedValueOnce(new Error('SMTP down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { POST } = await import('@/app/api/stripe/webhook/ecommerce/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    // event was still emitted
    expect(automationState.emitEvent).toHaveBeenCalledTimes(1);
    errSpy.mockRestore();
  });

  it('does not decrement variant inventory when item has no variantId', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_novar', metadata: { orderId: '500' } } },
    });
    dbState.selectQueue.push([DEFAULT_ORDER]);
    dbState.selectQueue.push([
      { id: 1, orderId: 500, productId: 7, variantId: null, quantity: 3 },
    ]);

    const { POST } = await import('@/app/api/stripe/webhook/ecommerce/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(dbState.updates.filter((u) => u.table === 'productVariants')).toHaveLength(0);
    expect(dbState.updates.filter((u) => u.table === 'products')).toHaveLength(1);
  });
});

describe('POST /api/stripe/webhook/ecommerce — payment_intent.payment_failed', () => {
  it('is a no-op when paymentIntent has no orderId metadata', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_fail_nometa', metadata: {} } },
    });
    const { POST } = await import('@/app/api/stripe/webhook/ecommerce/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(dbState.updates).toHaveLength(0);
  });

  it('marks the order failed, inserts history, and sends a retry email', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_fail', metadata: { orderId: '500' } } },
    });
    dbState.selectQueue.push([DEFAULT_ORDER]); // lookup after update

    const { POST } = await import('@/app/api/stripe/webhook/ecommerce/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);

    const orderUpdate = dbState.updates.find(
      (u) => u.table === 'orders' && (u.values as { paymentStatus?: string }).paymentStatus === 'failed',
    );
    expect(orderUpdate).toBeDefined();

    const histInsert = dbState.inserts.find(
      (i) => i.table === 'orderStatusHistory' &&
             (i.values as { status: string }).status === 'payment_failed',
    );
    expect(histInsert).toBeDefined();

    expect(emailState.sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const emailArg = emailState.sendTransactionalEmail.mock.calls[0][0];
    expect(emailArg.event).toBe('payment.failed');
    expect(emailArg.variables.retryUrl).toContain('ORD-0001');
  });

  it('skips the failure email when the order row cannot be re-loaded', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_fail_gone', metadata: { orderId: '500' } } },
    });
    dbState.selectQueue.push([]); // lookup returns nothing

    const { POST } = await import('@/app/api/stripe/webhook/ecommerce/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(emailState.sendTransactionalEmail).not.toHaveBeenCalled();
  });
});

describe('POST /api/stripe/webhook/ecommerce — charge.refunded', () => {
  it('is a no-op when the charge has no orderId metadata', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'charge.refunded',
      data: { object: { id: 'ch_no_meta', amount_refunded: 1000, metadata: {} } },
    });
    const { POST } = await import('@/app/api/stripe/webhook/ecommerce/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(dbState.updates).toHaveLength(0);
  });

  it('is a no-op when the order cannot be found', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'charge.refunded',
      data: { object: { id: 'ch_missing', amount_refunded: 1000, metadata: { orderId: '500' } } },
    });
    dbState.selectQueue.push([]); // empty order lookup

    const { POST } = await import('@/app/api/stripe/webhook/ecommerce/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(dbState.updates).toHaveLength(0);
    expect(emailState.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it('marks the order refunded, inserts history with the refund amount, sends email', async () => {
    stripeState.constructEvent.mockReturnValue({
      type: 'charge.refunded',
      data: {
        object: { id: 'ch_ok', amount_refunded: 2500, metadata: { orderId: '500' } },
      },
    });
    dbState.selectQueue.push([DEFAULT_ORDER]);

    const { POST } = await import('@/app/api/stripe/webhook/ecommerce/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);

    const orderUpdate = dbState.updates.find(
      (u) => u.table === 'orders' && (u.values as { paymentStatus?: string }).paymentStatus === 'refunded',
    );
    expect(orderUpdate).toBeDefined();

    const histInsert = dbState.inserts.find(
      (i) => i.table === 'orderStatusHistory' &&
             (i.values as { status: string }).status === 'refunded',
    );
    expect(histInsert).toBeDefined();
    expect((histInsert!.values as { note: string }).note).toMatch(/\$25\.00/);

    expect(emailState.sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const emailArg = emailState.sendTransactionalEmail.mock.calls[0][0];
    expect(emailArg.event).toBe('order.refunded');
    expect(emailArg.variables.refundAmount).toBe('$25.00');
  });
});
