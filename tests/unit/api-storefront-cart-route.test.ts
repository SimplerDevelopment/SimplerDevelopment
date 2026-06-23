// @vitest-environment node
/**
 * Unit tests for the storefront cart route handlers
 * (GET, POST, PUT, DELETE).
 *
 * Strategy: each handler chains drizzle query-builder calls
 * (`db.select().from().where().limit()`, etc.). We model the db as a
 * collection of vi.fn()s where every chain-step returns a thenable that
 * resolves to the next queued result. A `dbQueue` of results is consumed
 * in FIFO order — one entry per terminal db call in the handler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist db queue + mock so vi.mock can capture them.
const mocks = vi.hoisted(() => {
  const dbQueue: unknown[] = [];

  function makeThenable(resolver: () => unknown) {
    const obj: Record<string, unknown> = {
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(resolver()).then(onFulfilled),
      where: vi.fn(() => makeThenable(resolver)),
      limit: vi.fn(() => makeThenable(resolver)),
      orderBy: vi.fn(() => makeThenable(resolver)),
      innerJoin: vi.fn(() => makeThenable(resolver)),
      leftJoin: vi.fn(() => makeThenable(resolver)),
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

  return { dbQueue, db, select, insert, update, del };
});

vi.mock('@/lib/db', () => ({ db: mocks.db }));

vi.mock('@/lib/db/schema', () => ({
  storeSettings: { websiteId: 'storeSettings.websiteId', enabled: 'storeSettings.enabled' },
  carts: {
    id: 'carts.id',
    websiteId: 'carts.websiteId',
    sessionId: 'carts.sessionId',
    status: 'carts.status',
  },
  cartItems: {
    id: 'cartItems.id',
    cartId: 'cartItems.cartId',
    productId: 'cartItems.productId',
    variantId: 'cartItems.variantId',
    quantity: 'cartItems.quantity',
    unitPrice: 'cartItems.unitPrice',
    updatedAt: 'cartItems.updatedAt',
  },
  products: {
    id: 'products.id',
    websiteId: 'products.websiteId',
    name: 'products.name',
    slug: 'products.slug',
    status: 'products.status',
  },
  productImages: {
    productId: 'productImages.productId',
    url: 'productImages.url',
    order: 'productImages.order',
  },
  productVariants: {
    id: 'productVariants.id',
    productId: 'productVariants.productId',
    active: 'productVariants.active',
    name: 'productVariants.name',
  },
  designs: {
    id: 'designs.id',
    name: 'designs.name',
    thumbnailUrl: 'designs.thumbnailUrl',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...conds: unknown[]) => ({ op: 'and', conds }),
  asc: (col: unknown) => ({ op: 'asc', col }),
  sql: Object.assign(
    function sqlTag(strings: TemplateStringsArray, ...values: unknown[]) {
      return { op: 'sql', strings: Array.from(strings), values };
    },
    {},
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

const { GET, POST, PUT, DELETE } = await import(
  '@/app/api/storefront/[siteId]/cart/route'
);

const STORE = { id: 1, websiteId: 1, enabled: true };

function queue(...items: unknown[]) {
  mocks.dbQueue.push(...items);
}

function paramsFor(siteId: string) {
  return { params: Promise.resolve({ siteId }) };
}

beforeEach(() => {
  mocks.dbQueue.length = 0;
  mocks.select.mockClear();
  mocks.insert.mockClear();
  mocks.update.mockClear();
  mocks.del.mockClear();
});

// ---------- GET ----------

describe('GET /api/storefront/[siteId]/cart', () => {
  it('rejects an invalid (non-numeric) siteId with 400', async () => {
    const req = new Request('http://localhost/api/storefront/abc/cart?sessionId=s1');
    const res = await GET(req, paramsFor('abc'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Invalid site ID' });
  });

  it('returns 404 when the store does not exist or is disabled', async () => {
    queue([]); // verifyStore returns no row
    const req = new Request('http://localhost/api/storefront/1/cart?sessionId=s1');
    const res = await GET(req, paramsFor('1'));
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Store not found');
  });

  it('returns 400 when sessionId is missing', async () => {
    queue([STORE]);
    const req = new Request('http://localhost/api/storefront/1/cart');
    const res = await GET(req, paramsFor('1'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('sessionId is required');
  });

  it('returns an empty cart when no active cart exists', async () => {
    queue([STORE], []); // store ok, getActiveCart returns nothing
    const req = new Request('http://localhost/api/storefront/1/cart?sessionId=s1');
    const res = await GET(req, paramsFor('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: { items: [], subtotal: 0 } });
  });

  it('returns an enriched cart with items, images, variants, subtotal, itemCount', async () => {
    const cart = { id: 100 };
    const items = [
      {
        id: 1, productId: 10, variantId: 20, quantity: 2, unitPrice: 500,
        productName: 'Widget', productSlug: 'widget', productStatus: 'active',
      },
      {
        id: 2, productId: 11, variantId: null, quantity: 3, unitPrice: 100,
        productName: 'Gadget', productSlug: 'gadget', productStatus: 'active',
      },
    ];
    const images = [
      { productId: 10, url: 'https://img/10-a.jpg' },
      { productId: 10, url: 'https://img/10-b.jpg' }, // duplicate, should be ignored
      { productId: 11, url: 'https://img/11.jpg' },
    ];
    const variants = [{ id: 20, name: 'Large' }];

    queue([STORE], [cart], items, images, variants);

    const req = new Request('http://localhost/api/storefront/1/cart?sessionId=s1');
    const res = await GET(req, paramsFor('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.cartId).toBe(100);
    expect(body.data.items).toHaveLength(2);

    const first = body.data.items[0];
    expect(first.lineTotal).toBe(1000);
    expect(first.variantName).toBe('Large');
    expect(first.image).toBe('https://img/10-a.jpg'); // first image wins

    const second = body.data.items[1];
    expect(second.variantName).toBeNull();
    expect(second.image).toBe('https://img/11.jpg');
    expect(second.lineTotal).toBe(300);

    expect(body.data.subtotal).toBe(1300);
    expect(body.data.itemCount).toBe(5);
  });

  it('handles a cart with items but no images and no variant rows', async () => {
    const cart = { id: 101 };
    const items = [
      {
        id: 1, productId: 10, variantId: null, quantity: 1, unitPrice: 50,
        productName: 'Bare', productSlug: 'bare', productStatus: 'active',
      },
    ];

    // images fetch happens (productIds > 0), variants fetch skipped (no variantIds)
    queue([STORE], [cart], items, [] /* images */);

    const req = new Request('http://localhost/api/storefront/1/cart?sessionId=s1');
    const res = await GET(req, paramsFor('1'));
    const body = await res.json();
    expect(body.data.items[0].image).toBeNull();
    expect(body.data.items[0].variantName).toBeNull();
    expect(body.data.subtotal).toBe(50);
  });

  it('returns 500 when the db throws', async () => {
    // No queue items → first db call throws "exhausted" → caught by try/catch.
    const req = new Request('http://localhost/api/storefront/1/cart?sessionId=s1');
    const res = await GET(req, paramsFor('1'));
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('Internal server error');
  });
});

// ---------- POST ----------

describe('POST /api/storefront/[siteId]/cart', () => {
  function postReq(body: unknown) {
    return new Request('http://localhost/api/storefront/1/cart', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });
  }

  it('returns 400 on invalid siteId', async () => {
    const res = await POST(postReq({}), paramsFor('foo'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid site ID');
  });

  it('returns 404 when the store is missing', async () => {
    queue([]);
    const res = await POST(postReq({ sessionId: 's', productId: 1 }), paramsFor('1'));
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Store not found');
  });

  it('returns 400 when sessionId or productId missing', async () => {
    queue([STORE]);
    const res = await POST(postReq({ productId: 1 }), paramsFor('1'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('sessionId and productId are required');
  });

  it('returns 404 when product is not found / not active', async () => {
    queue([STORE], []);
    const res = await POST(
      postReq({ sessionId: 's1', productId: 99 }),
      paramsFor('1'),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Product not found');
  });

  it('returns 404 when a variantId is supplied but no matching variant exists', async () => {
    const product = { id: 10, price: 500, trackInventory: true, quantity: 5 };
    queue([STORE], [product], [] /* variant lookup */);

    const res = await POST(
      postReq({ sessionId: 's1', productId: 10, variantId: 20 }),
      paramsFor('1'),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Variant not found');
  });

  it('returns 400 when requested quantity exceeds tracked stock', async () => {
    const product = { id: 10, price: 500, trackInventory: true, quantity: 2 };
    queue([STORE], [product]);
    const res = await POST(
      postReq({ sessionId: 's1', productId: 10, quantity: 5 }),
      paramsFor('1'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Only 2 available in stock');
  });

  it('creates a new cart and inserts a new item when no cart and no existing line', async () => {
    const product = { id: 10, price: 500, trackInventory: false, quantity: 0 };
    const newCart = { id: 200 };
    const newItem = { id: 1, cartId: 200, productId: 10, variantId: null, quantity: 1, unitPrice: 500 };

    queue(
      [STORE], // verifyStore
      [product], // product fetch
      [], // getActiveCart → no cart
      [newCart], // insert cart returning
      [], // existing item lookup → none
      [newItem], // insert cartItems returning
    );

    const res = await POST(
      postReq({ sessionId: 's1', productId: 10 }),
      paramsFor('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(newItem);
    expect(mocks.insert).toHaveBeenCalledTimes(2); // cart + cartItem
  });

  it('reuses an existing cart and updates an existing line, summing quantity', async () => {
    const product = { id: 10, price: 500, trackInventory: true, quantity: 10 };
    const cart = { id: 200 };
    const existing = { id: 50, quantity: 2 };
    const updated = { id: 50, quantity: 5 };

    queue([STORE], [product], [cart], [existing], [updated]);

    const res = await POST(
      postReq({ sessionId: 's1', productId: 10, quantity: 3 }),
      paramsFor('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(updated);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it('rejects when sum (existing + new) would exceed tracked stock on update path', async () => {
    const product = { id: 10, price: 500, trackInventory: true, quantity: 4 };
    const cart = { id: 200 };
    const existing = { id: 50, quantity: 3 };

    queue([STORE], [product], [cart], [existing]);

    const res = await POST(
      postReq({ sessionId: 's1', productId: 10, quantity: 2 }),
      paramsFor('1'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Only 4 available in stock');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('uses variant price + variant stock when variantId is supplied', async () => {
    const product = { id: 10, price: 500, trackInventory: true, quantity: 0 };
    const variant = { id: 20, productId: 10, active: true, price: 999, quantity: 2 };
    const cart = { id: 200 };
    const newItem = { id: 1, productId: 10, variantId: 20, quantity: 1, unitPrice: 999 };

    queue([STORE], [product], [variant], [cart], [], [newItem]);

    const res = await POST(
      postReq({ sessionId: 's1', productId: 10, variantId: 20, quantity: 1 }),
      paramsFor('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.unitPrice).toBe(999);
  });

  it('returns 500 when the db throws unexpectedly', async () => {
    // No queue → verifyStore throws → caught → 500.
    const res = await POST(
      postReq({ sessionId: 's', productId: 1 }),
      paramsFor('1'),
    );
    expect(res.status).toBe(500);
  });
});

// ---------- PUT ----------

describe('PUT /api/storefront/[siteId]/cart', () => {
  function putReq(body: unknown) {
    return new Request('http://localhost/api/storefront/1/cart', {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });
  }

  it('returns 400 on invalid siteId', async () => {
    const res = await PUT(putReq({}), paramsFor('xx'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when store missing', async () => {
    queue([]);
    const res = await PUT(putReq({ cartItemId: 1, quantity: 1 }), paramsFor('1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when cartItemId or quantity is missing', async () => {
    queue([STORE]);
    const res = await PUT(putReq({ cartItemId: 1 }), paramsFor('1'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('cartItemId and quantity are required');
  });

  it('returns 404 when cart item cannot be matched to this store', async () => {
    queue([STORE], []);
    const res = await PUT(putReq({ cartItemId: 99, quantity: 2 }), paramsFor('1'));
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Cart item not found');
  });

  it('removes the item when quantity <= 0', async () => {
    const item = { id: 50, cartId: 200, productId: 10, variantId: null };
    queue([STORE], [item], undefined /* db.delete chain end */);

    const res = await PUT(putReq({ cartItemId: 50, quantity: 0 }), paramsFor('1'));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ removed: true });
    expect(mocks.del).toHaveBeenCalledTimes(1);
  });

  it('rejects when new quantity exceeds tracked product stock (no variant)', async () => {
    const item = { id: 50, cartId: 200, productId: 10, variantId: null };
    const product = { id: 10, trackInventory: true, quantity: 3 };

    queue([STORE], [item], [product]);

    const res = await PUT(putReq({ cartItemId: 50, quantity: 5 }), paramsFor('1'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Only 3 available in stock');
  });

  it('rejects based on variant stock when item has a variantId', async () => {
    const item = { id: 50, cartId: 200, productId: 10, variantId: 20 };
    const product = { id: 10, trackInventory: true, quantity: 100 };
    const variant = { id: 20, quantity: 1 };

    queue([STORE], [item], [product], [variant]);

    const res = await PUT(putReq({ cartItemId: 50, quantity: 4 }), paramsFor('1'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Only 1 available in stock');
  });

  it('updates quantity when valid and tracked stock is sufficient', async () => {
    const item = { id: 50, cartId: 200, productId: 10, variantId: null };
    const product = { id: 10, trackInventory: true, quantity: 50 };
    const updated = { id: 50, quantity: 7 };

    queue([STORE], [item], [product], [updated]);

    const res = await PUT(putReq({ cartItemId: 50, quantity: 7 }), paramsFor('1'));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual(updated);
  });

  it('updates quantity without a stock check when product does not track inventory', async () => {
    const item = { id: 50, cartId: 200, productId: 10, variantId: null };
    const product = { id: 10, trackInventory: false, quantity: 0 };
    const updated = { id: 50, quantity: 999 };

    queue([STORE], [item], [product], [updated]);

    const res = await PUT(putReq({ cartItemId: 50, quantity: 999 }), paramsFor('1'));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual(updated);
  });

  it('returns 500 when an unexpected db error occurs', async () => {
    const res = await PUT(putReq({ cartItemId: 1, quantity: 1 }), paramsFor('1'));
    expect(res.status).toBe(500);
  });
});

// ---------- DELETE ----------

describe('DELETE /api/storefront/[siteId]/cart', () => {
  it('returns 400 on invalid siteId', async () => {
    const req = new Request('http://localhost/api/storefront/zz/cart?sessionId=s');
    const res = await DELETE(req, paramsFor('zz'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the store is missing', async () => {
    queue([]);
    const req = new Request('http://localhost/api/storefront/1/cart?sessionId=s');
    const res = await DELETE(req, paramsFor('1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when sessionId is missing', async () => {
    queue([STORE]);
    const req = new Request('http://localhost/api/storefront/1/cart');
    const res = await DELETE(req, paramsFor('1'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('sessionId is required');
  });

  it('returns cleared=true even when no active cart exists', async () => {
    queue([STORE], []);
    const req = new Request('http://localhost/api/storefront/1/cart?sessionId=s');
    const res = await DELETE(req, paramsFor('1'));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ cleared: true });
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it('deletes all cart items and returns cleared=true', async () => {
    const cart = { id: 200 };
    queue([STORE], [cart], undefined);

    const req = new Request('http://localhost/api/storefront/1/cart?sessionId=s');
    const res = await DELETE(req, paramsFor('1'));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ cleared: true });
    expect(mocks.del).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when an unexpected db error occurs', async () => {
    const req = new Request('http://localhost/api/storefront/1/cart?sessionId=s');
    const res = await DELETE(req, paramsFor('1'));
    expect(res.status).toBe(500);
  });
});
