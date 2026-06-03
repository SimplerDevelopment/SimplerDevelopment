// @vitest-environment node
/**
 * Unit tests for app/api/portal/websites/[siteId]/store/products/route.ts
 *
 * GET   — list products scoped to a website with optional status/category/search
 *         filters, pagination, image attachment and variant count aggregation.
 * POST  — create a product, validate required fields, enforce slug uniqueness
 *         per website, optionally insert images.
 *
 * Everything underneath the route is mocked: auth, resolveClientSite, the
 * @/lib/db fluent builder (select / insert), schema column refs, drizzle
 * helpers.
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
    productCategories: wrap('productCategories'),
    productImages: wrap('productImages'),
    productVariants: wrap('productVariants'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : new Proxy({ __table: String(p) }, { get: (_x, c) => c === "__table" ? String(p) : (typeof c === "string" ? { __col: c, __table: String(p) } : undefined) })) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  ilike: (a: unknown, b: unknown) => ({ op: 'ilike', a, b }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  count: () => ({ __agg: 'count' }),
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
  productCategories: Array<Record<string, unknown>>;
  productImages: Array<Record<string, unknown>>;
  productVariants: Array<Record<string, unknown>>;
  nextProductId: number;
  nextImageId: number;
}

const state: State = {
  products: [],
  productCategories: [],
  productImages: [],
  productVariants: [],
  nextProductId: 1,
  nextImageId: 1,
};

function tableArray(name: string): Array<Record<string, unknown>> {
  switch (name) {
    case 'products':
      return state.products;
    case 'productCategories':
      return state.productCategories;
    case 'productImages':
      return state.productImages;
    case 'productVariants':
      return state.productVariants;
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
    __sql?: boolean;
  };
  if (f.__sql) {
    // IN (...) clause used for image / variant count queries — extract ids
    // from the joined sql fragment and match against the row.
    const values = (filter as { values?: unknown[] }).values ?? [];
    const ids: unknown[] = [];
    const collectIds = (v: unknown) => {
      if (!v) return;
      if (typeof v === 'object' && (v as { __sqlJoin?: boolean }).__sqlJoin) {
        const parts = (v as { parts?: unknown[] }).parts ?? [];
        for (const p of parts) collectIds(p);
      } else if (
        typeof v === 'object' &&
        (v as { __sql?: boolean }).__sql
      ) {
        const inner = (v as { values?: unknown[] }).values ?? [];
        for (const p of inner) collectIds(p);
      } else {
        ids.push(v);
      }
    };
    for (const v of values) collectIds(v);
    if (ids.length === 0) return true;
    // Field is whichever id-ish column the row has (productId for images,
    // productId for variants).
    if ('productId' in row) return ids.includes(row.productId);
    return true;
  }
  switch (f.op) {
    case 'eq': {
      const col = f.a as { __col?: string; __table?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === f.b;
    }
    case 'ilike': {
      const col = f.a as { __col?: string; __table?: string } | undefined;
      const pat = String(f.b ?? '').replace(/%/g, '');
      if (!col?.__col) return true;
      const val = String(row[col.__col] ?? '');
      return val.toLowerCase().includes(pat.toLowerCase());
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
    const joins: Array<{ kind: 'left' | 'inner'; table: string; on: unknown }> = [];
    let limitVal: number | null = null;
    let offsetVal: number | null = null;
    let groupByCol: { __col?: string; __table?: string } | null = null;

    function isCountProjection(): boolean {
      if (!projection) return false;
      const vals = Object.values(projection);
      return (
        vals.length === 1 &&
        (vals[0] as { __agg?: string })?.__agg === 'count'
      );
    }

    function isGroupCount(): boolean {
      if (!projection) return false;
      const vals = Object.values(projection);
      return vals.some((v) => (v as { __agg?: string })?.__agg === 'count');
    }

    function project(
      combined: Record<string, Record<string, unknown> | undefined>,
    ) {
      if (!projection) {
        return { ...(combined[activeTable!] || {}) };
      }
      const projected: Record<string, unknown> = {};
      for (const [outKey, ref] of Object.entries(projection)) {
        const colRef = ref as
          | {
              __col?: string;
              __table?: string;
              __sql?: boolean;
              __agg?: string;
              __isTable?: boolean;
            }
          | undefined;
        if (colRef && (colRef as { __isTable?: boolean }).__isTable) {
          // Whole-table projection like `product: products`
          projected[outKey] = combined[(colRef as { __table: string }).__table];
        } else if (colRef?.__col && colRef.__table) {
          projected[outKey] = combined[colRef.__table]?.[colRef.__col] ?? null;
        } else {
          projected[outKey] = null;
        }
      }
      return projected;
    }

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);

      // count(*) shortcut: { total: count() }
      if (isCountProjection()) {
        const rows = tableArray(activeTable).filter((r) =>
          evalPredicate(filter, r),
        );
        const key = Object.keys(projection!)[0];
        return Promise.resolve([{ [key]: rows.length }]);
      }

      const rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));

      // group by column with count()
      if (isGroupCount() && groupByCol?.__col) {
        const groups = new Map<unknown, number>();
        for (const r of rows) {
          const key = r[groupByCol.__col];
          groups.set(key, (groups.get(key) ?? 0) + 1);
        }
        const out: Array<Record<string, unknown>> = [];
        for (const [k, c] of groups.entries()) {
          const row: Record<string, unknown> = {};
          for (const [outKey, ref] of Object.entries(projection!)) {
            const colRef = ref as { __agg?: string; __col?: string };
            if (colRef?.__agg === 'count') row[outKey] = c;
            else if (colRef?.__col) row[outKey] = k;
            else row[outKey] = null;
          }
          out.push(row);
        }
        return Promise.resolve(out);
      }

      // Joins
      const joined: Array<Record<string, Record<string, unknown> | undefined>> = [];
      for (const r of rows) {
        const combined: Record<string, Record<string, unknown> | undefined> = {
          [activeTable]: r,
        };
        let dropped = false;
        for (const j of joins) {
          const eqClauses: Array<{
            a: { __col?: string; __table?: string };
            b: unknown;
          }> = [];
          const collectEqs = (node: unknown) => {
            const n = node as
              | { op?: string; a?: unknown; b?: unknown; args?: unknown[] }
              | undefined;
            if (!n) return;
            if (n.op === 'eq') {
              eqClauses.push({
                a: n.a as { __col?: string; __table?: string },
                b: n.b,
              });
            } else if (n.op === 'and' && Array.isArray(n.args)) {
              n.args.forEach(collectEqs);
            }
          };
          collectEqs(j.on);
          const match = tableArray(j.table).find((jr) => {
            return eqClauses.every((clause) => {
              const aRef = clause.a;
              const bRef = clause.b as
                | { __col?: string; __table?: string }
                | unknown;
              if (!aRef?.__col) return true;
              let leftVal: unknown;
              if (aRef.__table === j.table) leftVal = jr[aRef.__col];
              else leftVal = combined[aRef.__table!]?.[aRef.__col];
              let rightVal: unknown;
              const bAsRef = bRef as
                | { __col?: string; __table?: string }
                | undefined;
              if (bAsRef && typeof bAsRef === 'object' && bAsRef.__col) {
                if (bAsRef.__table === j.table) rightVal = jr[bAsRef.__col];
                else rightVal = combined[bAsRef.__table!]?.[bAsRef.__col];
              } else {
                rightVal = bRef;
              }
              return leftVal === rightVal;
            });
          });
          combined[j.table] = match;
          if (j.kind === 'inner' && !match) {
            dropped = true;
            break;
          }
        }
        if (!dropped) joined.push(combined);
      }

      let out = joined.map(project);

      if (typeof offsetVal === 'number') out = out.slice(offsetVal);
      if (typeof limitVal === 'number') out = out.slice(0, limitVal);

      return Promise.resolve(out);
    }

    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      leftJoin(table: { __table: string }, on: unknown) {
        joins.push({ kind: 'left', table: table.__table, on });
        return chain;
      },
      innerJoin(table: { __table: string }, on: unknown) {
        joins.push({ kind: 'inner', table: table.__table, on });
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      orderBy() {
        return chain;
      },
      groupBy(col: { __col?: string; __table?: string }) {
        groupByCol = col;
        return chain;
      },
      limit(n: number) {
        limitVal = n;
        return chain;
      },
      offset(n: number) {
        offsetVal = n;
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
          if (table.__table === 'products') {
            row.id = state.nextProductId++;
            row.createdAt = new Date('2026-03-01');
            row.updatedAt = new Date('2026-03-01');
          } else if (table.__table === 'productImages') {
            row.id = state.nextImageId++;
          }
          arr.push(row);
          inserted.push(row);
        }
        const thenable = {
          returning() {
            return Promise.resolve(inserted.map((r) => ({ ...r })));
          },
          then(
            onFulfilled: (v: unknown) => unknown,
            onRejected?: (e: unknown) => unknown,
          ) {
            return Promise.resolve(inserted.map((r) => ({ ...r }))).then(
              onFulfilled,
              onRejected,
            );
          },
        };
        return thenable;
      },
    };
  }

  return {
    db: {
      select(projection?: Record<string, unknown>) {
        return buildSelect(projection);
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

const { GET, POST } = await import(
  '@/app/api/portal/websites/[siteId]/store/products/route'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGet(qs = ''): Request {
  const url = `http://x/api/portal/websites/1/store/products${qs ? '?' + qs : ''}`;
  return new Request(url, { method: 'GET' });
}

function makePost(body: unknown): Request {
  return new Request('http://x/api/portal/websites/1/store/products', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function ctx(siteId = '1') {
  return { params: Promise.resolve({ siteId }) };
}

beforeEach(() => {
  state.products.length = 0;
  state.productCategories.length = 0;
  state.productImages.length = 0;
  state.productVariants.length = 0;
  state.nextProductId = 1;
  state.nextImageId = 1;

  authMock.mockReset();
  resolveClientSiteMock.mockReset();

  authMock.mockResolvedValue({ user: { id: '7' } });
  resolveClientSiteMock.mockResolvedValue({ id: 10 });
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/portal/websites/[siteId]/store/products', () => {
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

  it('returns 200 with empty list and default pagination when no products', async () => {
    const res = await GET(makeGet(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.pagination).toEqual({
      page: 1,
      limit: 25,
      total: 0,
      totalPages: 0,
    });
  });

  it('returns products scoped to website with categoryName from leftJoin', async () => {
    state.productCategories.push({ id: 5, name: 'Widgets' });
    state.products.push({
      id: 1,
      websiteId: 10,
      name: 'Thing',
      slug: 'thing',
      price: 100,
      status: 'active',
      categoryId: 5,
      createdAt: new Date('2026-02-01'),
    });
    // Different website — should be excluded
    state.products.push({
      id: 2,
      websiteId: 999,
      name: 'Other',
      slug: 'other',
      price: 50,
      status: 'active',
      categoryId: null,
      createdAt: new Date('2026-02-02'),
    });

    const res = await GET(makeGet(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination.total).toBe(1);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(1);
    expect(body.data[0].categoryName).toBe('Widgets');
    expect(body.data[0].images).toEqual([]);
    expect(body.data[0].variantsCount).toBe(0);
  });

  it('returns null categoryName when product has no category', async () => {
    state.products.push({
      id: 1,
      websiteId: 10,
      name: 'NoCat',
      slug: 'nocat',
      price: 1,
      status: 'active',
      categoryId: null,
      createdAt: new Date('2026-02-01'),
    });
    const res = await GET(makeGet(), ctx());
    const body = await res.json();
    expect(body.data[0].categoryName).toBeNull();
  });

  it('attaches images ordered and variant counts to each product', async () => {
    state.products.push({
      id: 1,
      websiteId: 10,
      name: 'P1',
      slug: 'p1',
      price: 10,
      status: 'active',
      categoryId: null,
      createdAt: new Date('2026-02-01'),
    });
    state.products.push({
      id: 2,
      websiteId: 10,
      name: 'P2',
      slug: 'p2',
      price: 20,
      status: 'active',
      categoryId: null,
      createdAt: new Date('2026-02-02'),
    });
    state.productImages.push({
      id: 1,
      productId: 1,
      url: 'a.png',
      alt: 'A',
      order: 0,
    });
    state.productImages.push({
      id: 2,
      productId: 1,
      url: 'b.png',
      alt: 'B',
      order: 1,
    });
    state.productVariants.push({ id: 1, productId: 1 });
    state.productVariants.push({ id: 2, productId: 1 });
    state.productVariants.push({ id: 3, productId: 2 });

    const res = await GET(makeGet(), ctx());
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    const p1 = body.data.find((p: { id: number }) => p.id === 1);
    const p2 = body.data.find((p: { id: number }) => p.id === 2);
    expect(p1.images).toHaveLength(2);
    expect(p1.variantsCount).toBe(2);
    expect(p2.images).toHaveLength(0);
    expect(p2.variantsCount).toBe(1);
  });

  it('applies status filter', async () => {
    state.products.push({
      id: 1,
      websiteId: 10,
      name: 'A',
      slug: 'a',
      status: 'active',
      categoryId: null,
      createdAt: new Date(),
    });
    state.products.push({
      id: 2,
      websiteId: 10,
      name: 'B',
      slug: 'b',
      status: 'draft',
      categoryId: null,
      createdAt: new Date(),
    });
    const res = await GET(makeGet('status=active'), ctx());
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('A');
  });

  it('applies category filter (parses to int)', async () => {
    state.products.push({
      id: 1,
      websiteId: 10,
      name: 'A',
      slug: 'a',
      status: 'active',
      categoryId: 5,
      createdAt: new Date(),
    });
    state.products.push({
      id: 2,
      websiteId: 10,
      name: 'B',
      slug: 'b',
      status: 'active',
      categoryId: 6,
      createdAt: new Date(),
    });
    const res = await GET(makeGet('category=5'), ctx());
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].categoryId).toBe(5);
  });

  it('applies search filter via ilike', async () => {
    state.products.push({
      id: 1,
      websiteId: 10,
      name: 'Apple Pie',
      slug: 'a',
      status: 'active',
      categoryId: null,
      createdAt: new Date(),
    });
    state.products.push({
      id: 2,
      websiteId: 10,
      name: 'Banana',
      slug: 'b',
      status: 'active',
      categoryId: null,
      createdAt: new Date(),
    });
    const res = await GET(makeGet('search=apple'), ctx());
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Apple Pie');
  });

  it('clamps page+limit and reports totalPages', async () => {
    for (let i = 1; i <= 5; i++) {
      state.products.push({
        id: i,
        websiteId: 10,
        name: `P${i}`,
        slug: `p${i}`,
        status: 'active',
        categoryId: null,
        createdAt: new Date(),
      });
    }
    const res = await GET(makeGet('page=2&limit=2'), ctx());
    const body = await res.json();
    expect(body.pagination).toEqual({
      page: 2,
      limit: 2,
      total: 5,
      totalPages: 3,
    });
    expect(body.data).toHaveLength(2);
  });

  it('clamps page below 1 up to 1, and limit above 100 down to 100', async () => {
    const res = await GET(makeGet('page=-5&limit=9999'), ctx());
    const body = await res.json();
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.limit).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

describe('POST /api/portal/websites/[siteId]/store/products', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await POST(makePost({ name: 'X', slug: 'x', price: 1 }), ctx());
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await POST(makePost({ name: 'X', slug: 'x', price: 1 }), ctx());
    expect(res.status).toBe(401);
  });

  it('returns 404 when client site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await POST(makePost({ name: 'X', slug: 'x', price: 1 }), ctx());
    expect(res.status).toBe(404);
  });

  it('returns 400 when name is missing', async () => {
    const res = await POST(makePost({ slug: 'x', price: 1 }), ctx());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('name, slug, and price are required');
  });

  it('returns 400 when slug is missing', async () => {
    const res = await POST(makePost({ name: 'X', price: 1 }), ctx());
    expect(res.status).toBe(400);
  });

  it('returns 400 when price is undefined', async () => {
    const res = await POST(makePost({ name: 'X', slug: 'x' }), ctx());
    expect(res.status).toBe(400);
  });

  it('accepts price=0', async () => {
    const res = await POST(makePost({ name: 'X', slug: 'x', price: 0 }), ctx());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.price).toBe(0);
  });

  it('returns 409 when slug already exists for the website', async () => {
    state.products.push({
      id: 99,
      websiteId: 10,
      name: 'Existing',
      slug: 'dupe',
      price: 100,
    });
    const res = await POST(
      makePost({ name: 'New', slug: 'dupe', price: 50 }),
      ctx(),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.message).toBe('A product with this slug already exists');
  });

  it('allows the same slug across different websites', async () => {
    state.products.push({
      id: 99,
      websiteId: 555,
      name: 'Other site',
      slug: 'shared',
      price: 100,
    });
    const res = await POST(
      makePost({ name: 'Mine', slug: 'shared', price: 50 }),
      ctx(),
    );
    expect(res.status).toBe(201);
  });

  it('creates a product with defaults and returns 201', async () => {
    const res = await POST(
      makePost({ name: 'Hat', slug: 'hat', price: '1500' }),
      ctx(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(body.data.websiteId).toBe(10);
    expect(body.data.name).toBe('Hat');
    expect(body.data.slug).toBe('hat');
    expect(body.data.price).toBe(1500);
    expect(body.data.description).toBeNull();
    expect(body.data.shortDescription).toBeNull();
    expect(body.data.compareAtPrice).toBeNull();
    expect(body.data.costPrice).toBeNull();
    expect(body.data.sku).toBeNull();
    expect(body.data.barcode).toBeNull();
    expect(body.data.trackInventory).toBe(true);
    expect(body.data.quantity).toBe(0);
    expect(body.data.weight).toBeNull();
    expect(body.data.weightUnit).toBe('g');
    expect(body.data.status).toBe('draft');
    expect(body.data.featured).toBe(false);
    expect(body.data.categoryId).toBeNull();
    expect(body.data.tags).toEqual([]);
    expect(body.data.seoTitle).toBeNull();
    expect(body.data.seoDescription).toBeNull();
    expect(body.data.images).toEqual([]);
  });

  it('coerces numeric fields from strings and weight to string', async () => {
    const res = await POST(
      makePost({
        name: 'Hat',
        slug: 'hat',
        price: '1500',
        compareAtPrice: '2000',
        costPrice: '500',
        categoryId: '7',
        weight: 250,
        trackInventory: false,
        quantity: 12,
        weightUnit: 'kg',
        featured: true,
      }),
      ctx(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.compareAtPrice).toBe(2000);
    expect(body.data.costPrice).toBe(500);
    expect(body.data.categoryId).toBe(7);
    expect(body.data.weight).toBe('250');
    expect(body.data.trackInventory).toBe(false);
    expect(body.data.quantity).toBe(12);
    expect(body.data.weightUnit).toBe('kg');
    expect(body.data.featured).toBe(true);
  });

  it('persists provided optional string fields and tag list', async () => {
    const res = await POST(
      makePost({
        name: 'Hat',
        slug: 'hat',
        price: 100,
        description: 'desc',
        shortDescription: 'short',
        sku: 'SKU-1',
        barcode: 'BAR-1',
        status: 'active',
        tags: ['summer', 'sale'],
        seoTitle: 'Buy Hat',
        seoDescription: 'Best hat',
      }),
      ctx(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.description).toBe('desc');
    expect(body.data.shortDescription).toBe('short');
    expect(body.data.sku).toBe('SKU-1');
    expect(body.data.barcode).toBe('BAR-1');
    expect(body.data.status).toBe('active');
    expect(body.data.tags).toEqual(['summer', 'sale']);
    expect(body.data.seoTitle).toBe('Buy Hat');
    expect(body.data.seoDescription).toBe('Best hat');
  });

  it('inserts images when provided and returns them ordered', async () => {
    const res = await POST(
      makePost({
        name: 'Hat',
        slug: 'hat',
        price: 100,
        images: [
          { url: 'a.png', alt: 'A' },
          { url: 'b.png' },
        ],
      }),
      ctx(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.images).toHaveLength(2);
    expect(body.data.images[0]).toMatchObject({
      url: 'a.png',
      alt: 'A',
      order: 0,
      productId: 1,
    });
    expect(body.data.images[1]).toMatchObject({
      url: 'b.png',
      alt: null,
      order: 1,
      productId: 1,
    });
  });

  it('does not insert images when images is empty array', async () => {
    const res = await POST(
      makePost({ name: 'Hat', slug: 'hat', price: 100, images: [] }),
      ctx(),
    );
    expect(res.status).toBe(201);
    expect(state.productImages).toHaveLength(0);
  });

  it('does not insert images when images is not an array', async () => {
    const res = await POST(
      makePost({ name: 'Hat', slug: 'hat', price: 100, images: 'nope' }),
      ctx(),
    );
    expect(res.status).toBe(201);
    expect(state.productImages).toHaveLength(0);
  });

  it('handles compareAtPrice/costPrice/categoryId null gracefully', async () => {
    const res = await POST(
      makePost({
        name: 'Hat',
        slug: 'hat',
        price: 100,
        compareAtPrice: null,
        costPrice: null,
        categoryId: null,
      }),
      ctx(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.compareAtPrice).toBeNull();
    expect(body.data.costPrice).toBeNull();
    expect(body.data.categoryId).toBeNull();
  });
});
