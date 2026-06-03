// @vitest-environment node
/**
 * Unit tests for app/api/portal/websites/[siteId]/store/products/[productId]/route.ts
 *
 * GET    — fetch a single product scoped to a website, with related images,
 *          options (with values), variants, and bulkPricingRules.
 * PUT    — update product fields, validate slug uniqueness when changed,
 *          optionally replace images.
 * DELETE — delete a product after ensuring it belongs to the website.
 *
 * Everything underneath the route is mocked: auth, resolveClientSite, the
 * @/lib/db fluent builder (select / update / insert / delete), schema column
 * refs, drizzle helpers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const resolveClientSiteMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  resolveClientSite: (...args: unknown[]) => resolveClientSiteMock(...args),
}));

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
  return new Proxy({
    products: wrap('products'),
    productImages: wrap('productImages'),
    productOptions: wrap('productOptions'),
    productOptionValues: wrap('productOptionValues'),
    productVariants: wrap('productVariants'),
    bulkPricingRules: wrap('bulkPricingRules'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : new Proxy({ __table: String(p) }, { get: (_x, c) => c === "__table" ? String(p) : (typeof c === "string" ? { __col: c, __table: String(p) } : undefined) })) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      __sql: true,
      strings: Array.from(strings),
      values,
    }),
    {
      join: (parts: unknown[], sep: unknown) => ({
        __sqlJoin: true,
        parts,
        sep,
      }),
    },
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ---- in-memory state ----

interface State {
  products: Array<Record<string, unknown>>;
  productImages: Array<Record<string, unknown>>;
  productOptions: Array<Record<string, unknown>>;
  productOptionValues: Array<Record<string, unknown>>;
  productVariants: Array<Record<string, unknown>>;
  bulkPricingRules: Array<Record<string, unknown>>;
  nextImageId: number;
}

const state: State = {
  products: [],
  productImages: [],
  productOptions: [],
  productOptionValues: [],
  productVariants: [],
  bulkPricingRules: [],
  nextImageId: 1,
};

function tableArray(name: string): Array<Record<string, unknown>> {
  switch (name) {
    case 'products':
      return state.products;
    case 'productImages':
      return state.productImages;
    case 'productOptions':
      return state.productOptions;
    case 'productOptionValues':
      return state.productOptionValues;
    case 'productVariants':
      return state.productVariants;
    case 'bulkPricingRules':
      return state.bulkPricingRules;
    default:
      return [];
  }
}

function collectSqlIds(filter: unknown): unknown[] {
  const ids: unknown[] = [];
  const visit = (v: unknown) => {
    if (!v) return;
    if (typeof v !== 'object') {
      ids.push(v);
      return;
    }
    if ((v as { __sqlJoin?: boolean }).__sqlJoin) {
      const parts = (v as { parts?: unknown[] }).parts ?? [];
      for (const p of parts) visit(p);
    } else if ((v as { __sql?: boolean }).__sql) {
      const inner = (v as { values?: unknown[] }).values ?? [];
      for (const p of inner) visit(p);
    } else {
      ids.push(v);
    }
  };
  const root = filter as { values?: unknown[] } | undefined;
  for (const v of root?.values ?? []) visit(v);
  return ids;
}

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as {
    op?: string;
    a?: unknown;
    b?: unknown;
    args?: unknown[];
    __sql?: boolean;
  };
  if (f.__sql) {
    const ids = collectSqlIds(filter);
    if (ids.length === 0) return true;
    // Used for option values IN (...): match against optionId.
    if ('optionId' in row) return ids.includes(row.optionId);
    if ('productId' in row) return ids.includes(row.productId);
    return true;
  }
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

    function project(row: Record<string, unknown>): Record<string, unknown> {
      if (!projection) return { ...row };
      const out: Record<string, unknown> = {};
      for (const [outKey, ref] of Object.entries(projection)) {
        const colRef = ref as
          | { __col?: string; __table?: string; __isTable?: boolean }
          | undefined;
        if (colRef && colRef.__isTable) {
          Object.assign(out, row);
        } else if (colRef?.__col) {
          out[outKey] = row[colRef.__col] ?? null;
        } else {
          out[outKey] = null;
        }
      }
      return out;
    }

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      let rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      rows = rows.map(project);
      if (typeof limitVal === 'number') rows = rows.slice(0, limitVal);
      return Promise.resolve(rows.map((r) => ({ ...r })));
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

  function buildInsert(table: { __table: string }) {
    return {
      values(payload: unknown) {
        const arr = tableArray(table.__table);
        const list = Array.isArray(payload) ? payload : [payload];
        const inserted: Array<Record<string, unknown>> = [];
        for (const v of list) {
          const row: Record<string, unknown> = { ...(v as Record<string, unknown>) };
          if (table.__table === 'productImages') {
            row.id = state.nextImageId++;
          }
          arr.push(row);
          inserted.push(row);
        }
        return Promise.resolve(inserted.map((r) => ({ ...r })));
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    let setData: Record<string, unknown> = {};
    let filter: unknown = null;
    const chain: Record<string, unknown> = {
      set(data: Record<string, unknown>) {
        setData = data;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      returning() {
        const arr = tableArray(table.__table);
        const updated: Array<Record<string, unknown>> = [];
        for (const r of arr) {
          if (evalPredicate(filter, r)) {
            Object.assign(r, setData);
            updated.push({ ...r });
          }
        }
        return Promise.resolve(updated);
      },
      then(
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        const arr = tableArray(table.__table);
        for (const r of arr) {
          if (evalPredicate(filter, r)) Object.assign(r, setData);
        }
        return Promise.resolve(undefined).then(onFulfilled, onRejected);
      },
    };
    return chain;
  }

  function buildDelete(table: { __table: string }) {
    let filter: unknown = null;
    const chain: Record<string, unknown> = {
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      then(
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        const arr = tableArray(table.__table);
        for (let i = arr.length - 1; i >= 0; i--) {
          if (evalPredicate(filter, arr[i])) arr.splice(i, 1);
        }
        return Promise.resolve(undefined).then(onFulfilled, onRejected);
      },
    };
    return chain;
  }

  return {
    db: {
      select(projection?: Record<string, unknown>) {
        return buildSelect(projection);
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
      delete(table: { __table: string }) {
        return buildDelete(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

const { GET, PUT, DELETE } = await import(
  '@/app/api/portal/websites/[siteId]/store/products/[productId]/route'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGet(): Request {
  return new Request('http://x/api/portal/websites/1/store/products/1', {
    method: 'GET',
  });
}

function makePut(body: unknown): Request {
  return new Request('http://x/api/portal/websites/1/store/products/1', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeDelete(): Request {
  return new Request('http://x/api/portal/websites/1/store/products/1', {
    method: 'DELETE',
  });
}

function ctx(siteId = '1', productId = '1') {
  return { params: Promise.resolve({ siteId, productId }) };
}

beforeEach(() => {
  state.products.length = 0;
  state.productImages.length = 0;
  state.productOptions.length = 0;
  state.productOptionValues.length = 0;
  state.productVariants.length = 0;
  state.bulkPricingRules.length = 0;
  state.nextImageId = 1;

  authMock.mockReset();
  resolveClientSiteMock.mockReset();

  authMock.mockResolvedValue({ user: { id: '7' } });
  resolveClientSiteMock.mockResolvedValue({ id: 10 });
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/portal/websites/[siteId]/store/products/[productId]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await GET(makeGet(), ctx());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await GET(makeGet(), ctx());
    expect(res.status).toBe(401);
  });

  it('returns 404 when client site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await GET(makeGet(), ctx());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Not found');
  });

  it('returns 404 when product does not exist', async () => {
    const res = await GET(makeGet(), ctx());
    expect(res.status).toBe(404);
  });

  it('returns 404 when product belongs to a different website', async () => {
    state.products.push({
      id: 1,
      websiteId: 999,
      name: 'Other',
      slug: 'other',
    });
    const res = await GET(makeGet(), ctx());
    expect(res.status).toBe(404);
  });

  it('returns product with empty related lists when no related data', async () => {
    state.products.push({
      id: 1,
      websiteId: 10,
      name: 'Hat',
      slug: 'hat',
      price: 100,
    });
    const res = await GET(makeGet(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(body.data.name).toBe('Hat');
    expect(body.data.images).toEqual([]);
    expect(body.data.options).toEqual([]);
    expect(body.data.variants).toEqual([]);
    expect(body.data.bulkPricingRules).toEqual([]);
  });

  it('returns product with related images, variants, and bulk rules', async () => {
    state.products.push({
      id: 1,
      websiteId: 10,
      name: 'Hat',
      slug: 'hat',
      price: 100,
    });
    state.productImages.push({ id: 1, productId: 1, url: 'a.png', order: 0 });
    state.productImages.push({ id: 2, productId: 1, url: 'b.png', order: 1 });
    state.productVariants.push({ id: 1, productId: 1, sku: 'V1' });
    state.bulkPricingRules.push({ id: 1, productId: 1, minQuantity: 10, price: 90 });

    const res = await GET(makeGet(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.images).toHaveLength(2);
    expect(body.data.variants).toHaveLength(1);
    expect(body.data.bulkPricingRules).toHaveLength(1);
    expect(body.data.bulkPricingRules[0].minQuantity).toBe(10);
  });

  it('returns product with options that include their values (single option)', async () => {
    state.products.push({
      id: 1,
      websiteId: 10,
      name: 'Hat',
      slug: 'hat',
    });
    state.productOptions.push({ id: 100, productId: 1, name: 'Size', order: 0 });
    state.productOptionValues.push({
      id: 1,
      optionId: 100,
      value: 'Small',
      order: 0,
    });
    state.productOptionValues.push({
      id: 2,
      optionId: 100,
      value: 'Large',
      order: 1,
    });

    const res = await GET(makeGet(), ctx());
    const body = await res.json();
    expect(body.data.options).toHaveLength(1);
    expect(body.data.options[0].name).toBe('Size');
    expect(body.data.options[0].values).toHaveLength(2);
  });

  it('returns product with options that include their values (multiple options)', async () => {
    state.products.push({
      id: 1,
      websiteId: 10,
      name: 'Hat',
      slug: 'hat',
    });
    state.productOptions.push({ id: 100, productId: 1, name: 'Size', order: 0 });
    state.productOptions.push({ id: 101, productId: 1, name: 'Color', order: 1 });
    state.productOptionValues.push({ id: 1, optionId: 100, value: 'Small', order: 0 });
    state.productOptionValues.push({ id: 2, optionId: 100, value: 'Large', order: 1 });
    state.productOptionValues.push({ id: 3, optionId: 101, value: 'Red', order: 0 });
    state.productOptionValues.push({ id: 4, optionId: 101, value: 'Blue', order: 1 });

    const res = await GET(makeGet(), ctx());
    const body = await res.json();
    expect(body.data.options).toHaveLength(2);
    const sizeOpt = body.data.options.find((o: { name: string }) => o.name === 'Size');
    const colorOpt = body.data.options.find((o: { name: string }) => o.name === 'Color');
    expect(sizeOpt.values).toHaveLength(2);
    expect(colorOpt.values).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// PUT
// ---------------------------------------------------------------------------

describe('PUT /api/portal/websites/[siteId]/store/products/[productId]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await PUT(makePut({ name: 'X' }), ctx());
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await PUT(makePut({ name: 'X' }), ctx());
    expect(res.status).toBe(401);
  });

  it('returns 404 when client site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await PUT(makePut({ name: 'X' }), ctx());
    expect(res.status).toBe(404);
  });

  it('returns 404 when product does not exist', async () => {
    const res = await PUT(makePut({ name: 'X' }), ctx());
    expect(res.status).toBe(404);
  });

  it('updates basic string fields', async () => {
    state.products.push({
      id: 1,
      websiteId: 10,
      name: 'Hat',
      slug: 'hat',
      description: 'old',
    });
    const res = await PUT(
      makePut({
        name: 'Cool Hat',
        description: 'new desc',
        shortDescription: 'short',
        sku: 'SKU-1',
        barcode: 'BAR-1',
        weightUnit: 'kg',
        status: 'active',
        seoTitle: 'SEO',
        seoDescription: 'SEO Desc',
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Cool Hat');
    expect(body.data.description).toBe('new desc');
    expect(body.data.shortDescription).toBe('short');
    expect(body.data.sku).toBe('SKU-1');
    expect(body.data.barcode).toBe('BAR-1');
    expect(body.data.weightUnit).toBe('kg');
    expect(body.data.status).toBe('active');
    expect(body.data.seoTitle).toBe('SEO');
    expect(body.data.seoDescription).toBe('SEO Desc');
  });

  it('coerces int fields from strings', async () => {
    state.products.push({
      id: 1,
      websiteId: 10,
      name: 'Hat',
      slug: 'hat',
      price: 100,
    });
    const res = await PUT(
      makePut({
        price: '500',
        compareAtPrice: '700',
        costPrice: '250',
        quantity: '12',
        categoryId: '5',
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.price).toBe(500);
    expect(body.data.compareAtPrice).toBe(700);
    expect(body.data.costPrice).toBe(250);
    expect(body.data.quantity).toBe(12);
    expect(body.data.categoryId).toBe(5);
  });

  it('passes null through for nullable int fields', async () => {
    state.products.push({
      id: 1,
      websiteId: 10,
      name: 'Hat',
      slug: 'hat',
      compareAtPrice: 200,
    });
    const res = await PUT(
      makePut({ compareAtPrice: null, costPrice: null, categoryId: null }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.compareAtPrice).toBeNull();
    expect(body.data.costPrice).toBeNull();
    expect(body.data.categoryId).toBeNull();
  });

  it('updates boolean fields trackInventory and featured', async () => {
    state.products.push({
      id: 1,
      websiteId: 10,
      name: 'Hat',
      slug: 'hat',
      trackInventory: true,
      featured: false,
    });
    const res = await PUT(
      makePut({ trackInventory: false, featured: true }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.trackInventory).toBe(false);
    expect(body.data.featured).toBe(true);
  });

  it('stringifies weight and accepts null weight', async () => {
    state.products.push({
      id: 1,
      websiteId: 10,
      name: 'Hat',
      slug: 'hat',
    });
    const res = await PUT(makePut({ weight: 250 }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.weight).toBe('250');

    const res2 = await PUT(makePut({ weight: null }), ctx());
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.data.weight).toBeNull();
  });

  it('updates tags and metadata when provided', async () => {
    state.products.push({
      id: 1,
      websiteId: 10,
      name: 'Hat',
      slug: 'hat',
      tags: ['old'],
    });
    const res = await PUT(
      makePut({ tags: ['new', 'shiny'], metadata: { foo: 'bar' } }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.tags).toEqual(['new', 'shiny']);
    expect(body.data.metadata).toEqual({ foo: 'bar' });
  });

  it('returns 409 when changing slug to one that already exists for the site', async () => {
    state.products.push({
      id: 1,
      websiteId: 10,
      name: 'Hat',
      slug: 'hat',
    });
    state.products.push({
      id: 2,
      websiteId: 10,
      name: 'Cap',
      slug: 'cap',
    });
    const res = await PUT(makePut({ slug: 'cap' }), ctx());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.message).toBe('A product with this slug already exists');
  });

  it('allows updating slug to its current value (no uniqueness check)', async () => {
    state.products.push({
      id: 1,
      websiteId: 10,
      name: 'Hat',
      slug: 'hat',
    });
    const res = await PUT(makePut({ slug: 'hat', name: 'Hat 2' }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe('Hat 2');
  });

  it('allows updating slug to a new unique value', async () => {
    state.products.push({
      id: 1,
      websiteId: 10,
      name: 'Hat',
      slug: 'hat',
    });
    const res = await PUT(makePut({ slug: 'fancy-hat' }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.slug).toBe('fancy-hat');
  });

  it('allows the same slug on a different website without conflict', async () => {
    state.products.push({
      id: 1,
      websiteId: 10,
      name: 'Hat',
      slug: 'hat',
    });
    state.products.push({
      id: 2,
      websiteId: 999,
      name: 'Other',
      slug: 'taken',
    });
    const res = await PUT(makePut({ slug: 'taken' }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.slug).toBe('taken');
  });

  it('replaces images when provided as an array', async () => {
    state.products.push({
      id: 1,
      websiteId: 10,
      name: 'Hat',
      slug: 'hat',
    });
    state.productImages.push({
      id: 50,
      productId: 1,
      url: 'old.png',
      alt: 'Old',
      order: 0,
    });
    const res = await PUT(
      makePut({
        images: [
          { url: 'a.png', alt: 'A' },
          { url: 'b.png' },
        ],
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(state.productImages).toHaveLength(2);
    expect(state.productImages[0]).toMatchObject({
      url: 'a.png',
      alt: 'A',
      order: 0,
      productId: 1,
    });
    expect(state.productImages[1]).toMatchObject({
      url: 'b.png',
      alt: null,
      order: 1,
      productId: 1,
    });
  });

  it('clears all images when given an empty array', async () => {
    state.products.push({
      id: 1,
      websiteId: 10,
      name: 'Hat',
      slug: 'hat',
    });
    state.productImages.push({
      id: 50,
      productId: 1,
      url: 'old.png',
      order: 0,
    });
    const res = await PUT(makePut({ images: [] }), ctx());
    expect(res.status).toBe(200);
    expect(state.productImages).toHaveLength(0);
  });

  it('does not touch images when images is not an array', async () => {
    state.products.push({
      id: 1,
      websiteId: 10,
      name: 'Hat',
      slug: 'hat',
    });
    state.productImages.push({
      id: 50,
      productId: 1,
      url: 'keeper.png',
      order: 0,
    });
    const res = await PUT(makePut({ images: 'nope' }), ctx());
    expect(res.status).toBe(200);
    expect(state.productImages).toHaveLength(1);
  });

  it('does not update product fields when body is empty (only updatedAt)', async () => {
    state.products.push({
      id: 1,
      websiteId: 10,
      name: 'Original',
      slug: 'orig',
      price: 100,
    });
    const res = await PUT(makePut({}), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe('Original');
    expect(body.data.slug).toBe('orig');
    expect(body.data.price).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe('DELETE /api/portal/websites/[siteId]/store/products/[productId]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await DELETE(makeDelete(), ctx());
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await DELETE(makeDelete(), ctx());
    expect(res.status).toBe(401);
  });

  it('returns 404 when client site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await DELETE(makeDelete(), ctx());
    expect(res.status).toBe(404);
  });

  it('returns 404 when product does not exist', async () => {
    const res = await DELETE(makeDelete(), ctx());
    expect(res.status).toBe(404);
  });

  it('returns 404 when product belongs to a different website', async () => {
    state.products.push({
      id: 1,
      websiteId: 999,
      name: 'Other',
      slug: 'other',
    });
    const res = await DELETE(makeDelete(), ctx());
    expect(res.status).toBe(404);
    // still present
    expect(state.products).toHaveLength(1);
  });

  it('deletes product and returns success', async () => {
    state.products.push({
      id: 1,
      websiteId: 10,
      name: 'Hat',
      slug: 'hat',
    });
    state.products.push({
      id: 2,
      websiteId: 10,
      name: 'Cap',
      slug: 'cap',
    });
    const res = await DELETE(makeDelete(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, message: 'Product deleted' });
    expect(state.products).toHaveLength(1);
    expect(state.products[0].id).toBe(2);
  });
});
