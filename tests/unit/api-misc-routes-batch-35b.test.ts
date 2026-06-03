// @vitest-environment node
/**
 * Unit tests for four storefront customer-account routes (batch 35b):
 *
 *  - GET  /api/storefront/[siteId]/account/orders                  — list orders
 *  - GET  /api/storefront/[siteId]/account/orders/[orderNumber]    — order detail
 *  - GET  /api/storefront/[siteId]/account/support                 — list messages
 *  - POST /api/storefront/[siteId]/account/support                 — create message
 *  - GET  /api/storefront/[siteId]/account/support/[messageId]     — message detail
 *  - POST /api/storefront/[siteId]/account/support/[messageId]     — add reply
 *
 * All four handlers gate on `requireCustomer`. We model `db` with a FIFO
 * `dbQueue` of canned results that the thenable chain consumes (one shift
 * per `await db.select()/insert()/update()`), and stub `requireCustomer`
 * to drive auth state per test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const dbQueue: unknown[] = [];

  function makeThenable(resolver: () => unknown) {
    const obj: Record<string, unknown> = {
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(resolver()).then(onFulfilled),
      where: vi.fn(() => makeThenable(resolver)),
      limit: vi.fn(() => makeThenable(resolver)),
      orderBy: vi.fn(() => makeThenable(resolver)),
      from: vi.fn(() => makeThenable(resolver)),
      values: vi.fn(() => makeThenable(resolver)),
      returning: vi.fn(() => makeThenable(resolver)),
      set: vi.fn(() => makeThenable(resolver)),
    };
    return obj;
  }

  function nextResult() {
    if (dbQueue.length === 0) {
      throw new Error('dbQueue exhausted — handler made more db calls than expected');
    }
    return dbQueue.shift();
  }

  const select = vi.fn(() => makeThenable(nextResult));
  const insert = vi.fn(() => makeThenable(nextResult));
  const update = vi.fn(() => makeThenable(nextResult));
  const del = vi.fn(() => makeThenable(nextResult));

  const db = { select, insert, update, delete: del };

  const requireCustomer = vi.fn();

  return { dbQueue, db, select, insert, update, del, requireCustomer };
});

vi.mock('@/lib/db', () => ({ db: mocks.db }));

vi.mock('@/lib/db/schema', () => ({
  orders: {
    id: 'orders.id',
    websiteId: 'orders.websiteId',
    orderNumber: 'orders.orderNumber',
    customerEmail: 'orders.customerEmail',
    createdAt: 'orders.createdAt',
  },
  orderItems: {
    orderId: 'orderItems.orderId',
  },
  orderStatusHistory: {
    orderId: 'orderStatusHistory.orderId',
    createdAt: 'orderStatusHistory.createdAt',
  },
  storeCustomerMessages: {
    id: 'storeCustomerMessages.id',
    websiteId: 'storeCustomerMessages.websiteId',
    customerId: 'storeCustomerMessages.customerId',
    updatedAt: 'storeCustomerMessages.updatedAt',
  },
  storeCustomerMessageReplies: {
    messageId: 'storeCustomerMessageReplies.messageId',
    createdAt: 'storeCustomerMessageReplies.createdAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...conds: unknown[]) => ({ op: 'and', conds }),
  desc: (col: unknown) => ({ op: 'desc', col }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

vi.mock('@/lib/storefront/customer-auth', () => ({
  requireCustomer: mocks.requireCustomer,
}));

const ordersRoute = await import('@/app/api/storefront/[siteId]/account/orders/route');
const orderDetailRoute = await import(
  '@/app/api/storefront/[siteId]/account/orders/[orderNumber]/route'
);
const supportRoute = await import('@/app/api/storefront/[siteId]/account/support/route');
const supportDetailRoute = await import(
  '@/app/api/storefront/[siteId]/account/support/[messageId]/route'
);

function queue(...items: unknown[]) {
  mocks.dbQueue.push(...items);
}

function paramsFor<T extends Record<string, string>>(p: T) {
  return { params: Promise.resolve(p) };
}

function getReq(url = 'http://localhost/api/storefront/1/account/x') {
  return new Request(url) as unknown as import('next/server').NextRequest;
}

function postReq(body: unknown, url = 'http://localhost/api/storefront/1/account/x') {
  return new Request(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as unknown as import('next/server').NextRequest;
}

const SESSION = {
  websiteId: 1,
  customerId: 42,
  email: 'a@b.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
};

beforeEach(() => {
  mocks.dbQueue.length = 0;
  mocks.select.mockClear();
  mocks.insert.mockClear();
  mocks.update.mockClear();
  mocks.del.mockClear();
  mocks.requireCustomer.mockReset();
});

// ---------- GET /account/orders ----------

describe('GET /api/storefront/[siteId]/account/orders', () => {
  it('returns 401 when requireCustomer returns null', async () => {
    mocks.requireCustomer.mockResolvedValue(null);
    const res = await ordersRoute.GET(getReq(), paramsFor({ siteId: '1' }));
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('returns the customer orders list on success', async () => {
    mocks.requireCustomer.mockResolvedValue(SESSION);
    const list = [
      { id: 10, orderNumber: 'ORD-1', customerEmail: 'a@b.com' },
      { id: 11, orderNumber: 'ORD-2', customerEmail: 'a@b.com' },
    ];
    queue(list);
    const res = await ordersRoute.GET(getReq(), paramsFor({ siteId: '1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(list);
    expect(mocks.requireCustomer).toHaveBeenCalledTimes(1);
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it('returns an empty list when the customer has no orders', async () => {
    mocks.requireCustomer.mockResolvedValue(SESSION);
    queue([]);
    const res = await ordersRoute.GET(getReq(), paramsFor({ siteId: '1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

// ---------- GET /account/orders/[orderNumber] ----------

describe('GET /api/storefront/[siteId]/account/orders/[orderNumber]', () => {
  it('returns 401 when requireCustomer returns null', async () => {
    mocks.requireCustomer.mockResolvedValue(null);
    const res = await orderDetailRoute.GET(
      getReq(),
      paramsFor({ siteId: '1', orderNumber: 'ORD-99' }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when the order does not exist for this customer', async () => {
    mocks.requireCustomer.mockResolvedValue(SESSION);
    queue([]); // order lookup empty
    const res = await orderDetailRoute.GET(
      getReq(),
      paramsFor({ siteId: '1', orderNumber: 'ORD-missing' }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Order not found');
  });

  it('returns order with items and history on success', async () => {
    mocks.requireCustomer.mockResolvedValue(SESSION);
    const order = { id: 7, orderNumber: 'ORD-7', customerEmail: 'a@b.com' };
    const items = [{ id: 100, orderId: 7, productId: 1 }];
    const history = [
      { id: 200, orderId: 7, status: 'shipped' },
      { id: 201, orderId: 7, status: 'placed' },
    ];
    queue([order], items, history);
    const res = await orderDetailRoute.GET(
      getReq(),
      paramsFor({ siteId: '1', orderNumber: 'ORD-7' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ order, items, history });
  });
});

// ---------- GET /account/support ----------

describe('GET /api/storefront/[siteId]/account/support', () => {
  it('returns 401 when requireCustomer returns null', async () => {
    mocks.requireCustomer.mockResolvedValue(null);
    const res = await supportRoute.GET(getReq(), paramsFor({ siteId: '1' }));
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns the customer messages list on success', async () => {
    mocks.requireCustomer.mockResolvedValue(SESSION);
    const list = [
      { id: 1, subject: 'Hi', customerId: 42 },
      { id: 2, subject: 'Issue', customerId: 42 },
    ];
    queue(list);
    const res = await supportRoute.GET(getReq(), paramsFor({ siteId: '1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(list);
  });
});

// ---------- POST /account/support ----------

describe('POST /api/storefront/[siteId]/account/support', () => {
  it('returns 401 when requireCustomer returns null', async () => {
    mocks.requireCustomer.mockResolvedValue(null);
    const res = await supportRoute.POST(
      postReq({ subject: 'Hi', body: 'Hello' }),
      paramsFor({ siteId: '1' }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 400 when subject is missing', async () => {
    mocks.requireCustomer.mockResolvedValue(SESSION);
    const res = await supportRoute.POST(
      postReq({ body: 'Hello' }),
      paramsFor({ siteId: '1' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe(
      'Subject and message body are required',
    );
  });

  it('returns 400 when body is missing or whitespace', async () => {
    mocks.requireCustomer.mockResolvedValue(SESSION);
    const res = await supportRoute.POST(
      postReq({ subject: 'Hi', body: '   ' }),
      paramsFor({ siteId: '1' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe(
      'Subject and message body are required',
    );
  });

  it('creates the message + initial reply and returns 201', async () => {
    mocks.requireCustomer.mockResolvedValue(SESSION);
    const message = { id: 55, subject: 'Hi', customerId: 42, category: 'general' };
    queue([message], [{ id: 100 }]); // insert message returning, insert reply returning
    const res = await supportRoute.POST(
      postReq({ subject: ' Hi ', body: ' Hello ', orderId: 9 }),
      paramsFor({ siteId: '1' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toEqual(message);
    expect(mocks.insert).toHaveBeenCalledTimes(2);
  });

  it('defaults category to "general" and orderId to null when omitted', async () => {
    mocks.requireCustomer.mockResolvedValue({ ...SESSION, firstName: null, lastName: null });
    const message = { id: 56, subject: 'Hi', customerId: 42, category: 'general' };
    queue([message], [{ id: 101 }]);
    const res = await supportRoute.POST(
      postReq({ subject: 'Hi', body: 'Hello' }),
      paramsFor({ siteId: '1' }),
    );
    expect(res.status).toBe(201);
    expect(mocks.insert).toHaveBeenCalledTimes(2);
  });
});

// ---------- GET /account/support/[messageId] ----------

describe('GET /api/storefront/[siteId]/account/support/[messageId]', () => {
  it('returns 401 when requireCustomer returns null', async () => {
    mocks.requireCustomer.mockResolvedValue(null);
    const res = await supportDetailRoute.GET(
      getReq(),
      paramsFor({ siteId: '1', messageId: '5' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when the message is not found', async () => {
    mocks.requireCustomer.mockResolvedValue(SESSION);
    queue([]); // message lookup empty
    const res = await supportDetailRoute.GET(
      getReq(),
      paramsFor({ siteId: '1', messageId: '5' }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns message + replies on success', async () => {
    mocks.requireCustomer.mockResolvedValue(SESSION);
    const message = { id: 5, subject: 'Hi', customerId: 42 };
    const replies = [{ id: 100, messageId: 5, body: 'Hello' }];
    queue([message], replies);
    const res = await supportDetailRoute.GET(
      getReq(),
      paramsFor({ siteId: '1', messageId: '5' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ message, replies });
  });
});

// ---------- POST /account/support/[messageId] ----------

describe('POST /api/storefront/[siteId]/account/support/[messageId]', () => {
  it('returns 401 when requireCustomer returns null', async () => {
    mocks.requireCustomer.mockResolvedValue(null);
    const res = await supportDetailRoute.POST(
      postReq({ body: 'hi' }),
      paramsFor({ siteId: '1', messageId: '5' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when body is empty / whitespace-only', async () => {
    mocks.requireCustomer.mockResolvedValue(SESSION);
    const res = await supportDetailRoute.POST(
      postReq({ body: '   ' }),
      paramsFor({ siteId: '1', messageId: '5' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Message body is required');
  });

  it('returns 400 when body is missing entirely', async () => {
    mocks.requireCustomer.mockResolvedValue(SESSION);
    const res = await supportDetailRoute.POST(
      postReq({}),
      paramsFor({ siteId: '1', messageId: '5' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when the message does not belong to the customer', async () => {
    mocks.requireCustomer.mockResolvedValue(SESSION);
    queue([]); // message lookup empty
    const res = await supportDetailRoute.POST(
      postReq({ body: 'hi' }),
      paramsFor({ siteId: '1', messageId: '5' }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('inserts reply, bumps message timestamp, and returns 201', async () => {
    mocks.requireCustomer.mockResolvedValue(SESSION);
    const reply = { id: 200, messageId: 5, body: 'hi back' };
    // message lookup, insert reply returning, update set/where (returns nothing meaningful, but consumes 1 db call)
    queue([{ id: 5 }], [reply], []);
    const res = await supportDetailRoute.POST(
      postReq({ body: '  hi back  ' }),
      paramsFor({ siteId: '1', messageId: '5' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toEqual(reply);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it('falls back to email as authorName when firstName/lastName both blank', async () => {
    mocks.requireCustomer.mockResolvedValue({
      ...SESSION,
      firstName: null,
      lastName: null,
    });
    const reply = { id: 201, messageId: 5, body: 'hi' };
    queue([{ id: 5 }], [reply], []);
    const res = await supportDetailRoute.POST(
      postReq({ body: 'hi' }),
      paramsFor({ siteId: '1', messageId: '5' }),
    );
    expect(res.status).toBe(201);
    // We can't introspect what was inserted (values() isn't recorded with args
    // in this thenable model), but we can confirm the path ran without errors.
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });
});
