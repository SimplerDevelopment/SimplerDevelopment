// @vitest-environment node
/**
 * Unit tests for lib/data/products.ts.
 *
 * The module is a thin Drizzle wrapper that:
 *   • verifies the store is enabled for a website
 *   • lists products (with paging / filtering / sorting / search / category)
 *   • fetches a single product by slug (with images, options, values, variants,
 *     bulk pricing, and category hydrated)
 *   • lists product categories with a correlated count subquery
 *
 * The mocking strategy mirrors `tests/unit/actions-blog.test.ts`: we mock
 * `@/lib/db/schema`, `drizzle-orm`, and `@/lib/db`. The fake `db.select()` chain
 * is dispatched by the active table name so each call returns the appropriate
 * fixture. Tests seed in-memory state and assert the final shape returned by
 * the module under test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Schema + drizzle-orm mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return {
    storeSettings: wrap('storeSettings'),
    products: wrap('products'),
    productImages: wrap('productImages'),
    productOptions: wrap('productOptions'),
    productOptionValues: wrap('productOptionValues'),
    productVariants: wrap('productVariants'),
    bulkPricingRules: wrap('bulkPricingRules'),
    productCategories: wrap('productCategories'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  like: (a: unknown, b: unknown) => ({ op: 'like', a, b }),
  // sql is invoked as a tagged template `sql<T>\`...\`` and also as `sql\`...\``;
  // for the IN-clauses and count(*) we just return a marker; the mock db does
  // not need to inspect it.
  sql: Object.assign(
    function sqlTag(_strings: TemplateStringsArray, ..._values: unknown[]) {
      return { __sqlTag: true };
    },
    {},
  ),
}));

// ---------------------------------------------------------------------------
// In-memory DB state + select chain
// ---------------------------------------------------------------------------

interface State {
  storeSettings: Array<Record<string, unknown>>;
  products: Array<Record<string, unknown>>;
  productImages: Array<Record<string, unknown>>;
  productOptions: Array<Record<string, unknown>>;
  productOptionValues: Array<Record<string, unknown>>;
  productVariants: Array<Record<string, unknown>>;
  bulkPricingRules: Array<Record<string, unknown>>;
  productCategories: Array<Record<string, unknown>>;
  /** When set, the next `db.select(...)` call throws this error. */
  throwOnNextSelect: Error | null;
}

const state: State = {
  storeSettings: [],
  products: [],
  productImages: [],
  productOptions: [],
  productOptionValues: [],
  productVariants: [],
  bulkPricingRules: [],
  productCategories: [],
  throwOnNextSelect: null,
};

function getCol(ref: unknown): { col: string; table: string } | null {
  const r = ref as { __col?: string; __table?: string } | undefined;
  if (!r?.__col || !r.__table) return null;
  return { col: r.__col, table: r.__table };
}

function readField(row: Record<string, unknown>, ref: unknown): unknown {
  const c = getCol(ref);
  if (!c) return undefined;
  return row[c.col];
}

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as {
    op?: string;
    a?: unknown;
    b?: unknown;
    args?: unknown[];
    __sqlTag?: boolean;
  };
  // Treat unknown sql-tag markers (e.g. `IN (...)` clauses) as already-applied;
  // the caller filters by product/category id explicitly via the seeded rows.
  if (f.__sqlTag) return true;
  switch (f.op) {
    case 'eq':
      return readField(row, f.a) === f.b;
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    case 'or':
      return (f.args ?? []).some((arg) => evalPredicate(arg, row));
    case 'like': {
      const left = readField(row, f.a);
      const pattern = String(f.b);
      const inner = pattern.replace(/^%/, '').replace(/%$/, '');
      return typeof left === 'string' && left.includes(inner);
    }
    default:
      return true;
  }
}

function projectRow(
  row: Record<string, unknown>,
  projection: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!projection) return { ...row };
  const out: Record<string, unknown> = {};
  for (const [alias, ref] of Object.entries(projection)) {
    const r = ref as { __col?: string; __sqlTag?: boolean };
    if (r?.__sqlTag) {
      // count(*) goes here — pre-computed by the chain at run time.
      out[alias] = undefined; // overwritten below if needed
    } else {
      const c = getCol(ref);
      out[alias] = c ? row[c.col] : undefined;
    }
  }
  return out;
}

function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect(projection: Record<string, unknown> | null) {
    if (state.throwOnNextSelect) {
      const err = state.throwOnNextSelect;
      state.throwOnNextSelect = null;
      return {
        from() {
          throw err;
        },
      };
    }

    let activeTable: string | null = null;
    let filter: unknown = null;
    let limit: number | null = null;
    let offset = 0;

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
        limit = n;
        return chain;
      },
      offset(n: number) {
        offset = n;
        return runQuery();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      const rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));

      // Detect a pure count(*) projection: a single key whose value is a __sqlTag marker.
      const projEntries = projection ? Object.entries(projection) : [];
      const isPureCountProjection =
        projEntries.length === 1 &&
        (projEntries[0][1] as { __sqlTag?: boolean })?.__sqlTag === true;

      if (isPureCountProjection) {
        const [countAlias] = projEntries[0];
        return Promise.resolve([{ [countAlias]: rows.length }]);
      }

      let out = rows.map((r) => projectRow(r, projection));
      if (limit !== null) out = out.slice(offset, offset + limit);
      else if (offset) out = out.slice(offset);
      return Promise.resolve(out);
    }

    return chain;
  }

  return {
    db: {
      select(projection?: Record<string, unknown>) {
        return {
          from(table: { __table: string }) {
            return buildSelect(projection ?? null).from(table);
          },
        };
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Lifecycle + helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  state.storeSettings.length = 0;
  state.products.length = 0;
  state.productImages.length = 0;
  state.productOptions.length = 0;
  state.productOptionValues.length = 0;
  state.productVariants.length = 0;
  state.bulkPricingRules.length = 0;
  state.productCategories.length = 0;
  state.throwOnNextSelect = null;
});

async function importModule() {
  return await import('@/lib/data/products');
}

function enableStore(websiteId = 1) {
  state.storeSettings.push({ id: 1, websiteId, enabled: true });
}

function seedProduct(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row = {
    id: 1,
    websiteId: 1,
    categoryId: null,
    name: 'Widget',
    slug: 'widget',
    shortDescription: 'A useful widget',
    description: 'Long description',
    price: 1000,
    compareAtPrice: null,
    featured: false,
    status: 'active',
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
  state.products.push(row);
  return row;
}

function seedCategory(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row = {
    id: 100,
    websiteId: 1,
    name: 'Widgets',
    slug: 'widgets',
    description: null,
    image: null,
    parentId: null,
    order: 0,
    active: true,
    ...overrides,
  };
  state.productCategories.push(row);
  return row;
}

// ---------------------------------------------------------------------------
// listProducts
// ---------------------------------------------------------------------------

describe('listProducts', () => {
  it('returns null when the store is not enabled', async () => {
    const { listProducts } = await importModule();
    const res = await listProducts(1);
    expect(res).toBeNull();
  });

  it('returns null when storeSettings row exists but enabled=false', async () => {
    state.storeSettings.push({ id: 1, websiteId: 1, enabled: false });
    const { listProducts } = await importModule();
    expect(await listProducts(1)).toBeNull();
  });

  it('returns empty data + zero totals when the store is enabled but no products exist', async () => {
    enableStore(1);
    const { listProducts } = await importModule();
    const res = await listProducts(1);
    expect(res).not.toBeNull();
    expect(res!.data).toEqual([]);
    expect(res!.pagination).toEqual({ page: 1, limit: 24, total: 0, totalPages: 0 });
  });

  it('returns only active products for the given website', async () => {
    enableStore(1);
    seedProduct({ id: 1, slug: 'a', websiteId: 1, status: 'active' });
    seedProduct({ id: 2, slug: 'draft', websiteId: 1, status: 'draft' });
    seedProduct({ id: 3, slug: 'other-site', websiteId: 2, status: 'active' });
    const { listProducts } = await importModule();
    const res = await listProducts(1);
    expect(res!.data).toHaveLength(1);
    expect(res!.data[0].slug).toBe('a');
    expect(res!.pagination.total).toBe(1);
  });

  it('hydrates product image (first by ordering) and category name', async () => {
    enableStore(1);
    seedCategory({ id: 100, websiteId: 1, name: 'Cat A', slug: 'cat-a' });
    seedProduct({ id: 1, slug: 'a', categoryId: 100 });
    seedProduct({ id: 2, slug: 'b', categoryId: null });
    state.productImages.push(
      { id: 1, productId: 1, url: '/img/a-1.jpg', order: 0 },
      { id: 2, productId: 1, url: '/img/a-2.jpg', order: 1 },
    );

    const { listProducts } = await importModule();
    const res = await listProducts(1);
    expect(res!.data).toHaveLength(2);
    const a = res!.data.find((p) => p.slug === 'a')!;
    const b = res!.data.find((p) => p.slug === 'b')!;
    expect(a.image).toBe('/img/a-1.jpg');
    expect(a.categoryName).toBe('Cat A');
    expect(b.image).toBeNull();
    expect(b.categoryName).toBeNull();
  });

  it('clamps page < 1 to page 1 and limit > 100 to 100', async () => {
    enableStore(1);
    seedProduct({ id: 1, slug: 'a' });
    const { listProducts } = await importModule();
    const res = await listProducts(1, { page: -3, limit: 500 });
    expect(res!.pagination.page).toBe(1);
    expect(res!.pagination.limit).toBe(100);
  });

  it('clamps limit < 1 to 1 (default for invalid input)', async () => {
    enableStore(1);
    seedProduct({ id: 1, slug: 'a' });
    seedProduct({ id: 2, slug: 'b' });
    const { listProducts } = await importModule();
    const res = await listProducts(1, { limit: 0 });
    // limit=0 falls through to default 24 because `?? 24` only kicks in when undefined;
    // Math.max(1, 0) => 1 — so limit becomes 1.
    expect(res!.pagination.limit).toBe(1);
    expect(res!.data).toHaveLength(1);
  });

  it('pagination math: page 2 with limit 1 returns the second row', async () => {
    enableStore(1);
    seedProduct({ id: 1, slug: 'a' });
    seedProduct({ id: 2, slug: 'b' });
    seedProduct({ id: 3, slug: 'c' });
    const { listProducts } = await importModule();
    const res = await listProducts(1, { page: 2, limit: 1 });
    expect(res!.pagination).toEqual({ page: 2, limit: 1, total: 3, totalPages: 3 });
    expect(res!.data).toHaveLength(1);
  });

  it('filters by category slug when the category exists', async () => {
    enableStore(1);
    seedCategory({ id: 100, websiteId: 1, slug: 'cat-a' });
    seedProduct({ id: 1, slug: 'a', categoryId: 100 });
    seedProduct({ id: 2, slug: 'b', categoryId: 999 });
    const { listProducts } = await importModule();
    const res = await listProducts(1, { category: 'cat-a' });
    expect(res!.data).toHaveLength(1);
    expect(res!.data[0].slug).toBe('a');
  });

  it('silently ignores a category filter when the slug does not exist', async () => {
    enableStore(1);
    seedProduct({ id: 1, slug: 'a', categoryId: 100 });
    seedProduct({ id: 2, slug: 'b', categoryId: 200 });
    const { listProducts } = await importModule();
    const res = await listProducts(1, { category: 'nope' });
    expect(res!.data).toHaveLength(2);
  });

  it('filters by search string against name OR shortDescription', async () => {
    enableStore(1);
    seedProduct({ id: 1, slug: 'a', name: 'Big widget', shortDescription: 'fast' });
    seedProduct({ id: 2, slug: 'b', name: 'Tiny thingy', shortDescription: 'cool widget' });
    seedProduct({ id: 3, slug: 'c', name: 'Sprocket', shortDescription: 'unrelated' });
    const { listProducts } = await importModule();
    const res = await listProducts(1, { search: 'widget' });
    expect(res!.data.map((d) => d.slug).sort()).toEqual(['a', 'b']);
  });

  it('accepts each sort flag without erroring (price_asc / price_desc / featured / newest)', async () => {
    enableStore(1);
    seedProduct({ id: 1, slug: 'a', price: 100, featured: false });
    seedProduct({ id: 2, slug: 'b', price: 200, featured: true });
    const { listProducts } = await importModule();
    for (const sort of ['price_asc', 'price_desc', 'featured', 'newest', 'unknown']) {
      const res = await listProducts(1, { sort });
      expect(res!.data).toHaveLength(2);
    }
  });
});

// ---------------------------------------------------------------------------
// getProductBySlug
// ---------------------------------------------------------------------------

describe('getProductBySlug', () => {
  it('returns null when the store is not enabled', async () => {
    const { getProductBySlug } = await importModule();
    expect(await getProductBySlug(1, 'whatever')).toBeNull();
  });

  it('returns null when no matching product exists', async () => {
    enableStore(1);
    const { getProductBySlug } = await importModule();
    expect(await getProductBySlug(1, 'missing')).toBeNull();
  });

  it('returns null when matching product is not status=active', async () => {
    enableStore(1);
    seedProduct({ id: 1, slug: 'draft-prod', status: 'draft' });
    const { getProductBySlug } = await importModule();
    expect(await getProductBySlug(1, 'draft-prod')).toBeNull();
  });

  it('returns null when matching product belongs to another website', async () => {
    enableStore(1);
    seedProduct({ id: 1, slug: 'mine', websiteId: 2 });
    const { getProductBySlug } = await importModule();
    expect(await getProductBySlug(1, 'mine')).toBeNull();
  });

  it('hydrates the product with images, options/values, variants, bulk pricing, and category', async () => {
    enableStore(1);
    seedCategory({ id: 100, websiteId: 1, name: 'Cat A', slug: 'cat-a' });
    seedProduct({ id: 1, slug: 'hero', categoryId: 100 });
    state.productImages.push(
      { id: 1, productId: 1, url: '/img/1.jpg', order: 0 },
      { id: 2, productId: 1, url: '/img/2.jpg', order: 1 },
      { id: 3, productId: 99, url: '/other.jpg', order: 0 },
    );
    state.productOptions.push(
      { id: 10, productId: 1, name: 'Color', order: 0 },
      { id: 11, productId: 1, name: 'Size', order: 1 },
    );
    state.productOptionValues.push(
      { id: 1000, optionId: 10, value: 'red', label: 'Red', order: 0 },
      { id: 1001, optionId: 10, value: 'blue', label: 'Blue', order: 1 },
      { id: 1002, optionId: 11, value: 'm', label: 'M', order: 0 },
    );
    state.productVariants.push(
      { id: 50, productId: 1, name: 'red-m', price: 1000, active: true },
      { id: 51, productId: 1, name: 'inactive', price: 1000, active: false },
    );
    state.bulkPricingRules.push(
      { id: 1, productId: 1, minQuantity: 10, amount: 5 },
      { id: 2, productId: 1, minQuantity: 50, amount: 10 },
    );

    const { getProductBySlug } = await importModule();
    const res = await getProductBySlug(1, 'hero');
    expect(res).not.toBeNull();
    expect(res!.slug).toBe('hero');
    expect(res!.images).toHaveLength(2);
    expect(res!.options).toHaveLength(2);
    const color = res!.options.find((o: { name: string }) => o.name === 'Color')!;
    expect(color.values.map((v: { value: string }) => v.value).sort()).toEqual(['blue', 'red']);
    expect(res!.variants).toHaveLength(1);
    expect(res!.variants[0].active).toBe(true);
    expect(res!.bulkPricing).toHaveLength(2);
    expect(res!.category).toMatchObject({ id: 100, slug: 'cat-a' });
  });

  it('returns category=null when product has no categoryId', async () => {
    enableStore(1);
    seedProduct({ id: 1, slug: 'no-cat', categoryId: null });
    const { getProductBySlug } = await importModule();
    const res = await getProductBySlug(1, 'no-cat');
    expect(res).not.toBeNull();
    expect(res!.category).toBeNull();
    expect(res!.options).toEqual([]);
    expect(res!.images).toEqual([]);
    expect(res!.variants).toEqual([]);
    expect(res!.bulkPricing).toEqual([]);
  });

  it('returns category=null when categoryId is set but the category row is missing', async () => {
    enableStore(1);
    seedProduct({ id: 1, slug: 'orphan', categoryId: 999 });
    const { getProductBySlug } = await importModule();
    const res = await getProductBySlug(1, 'orphan');
    expect(res).not.toBeNull();
    expect(res!.category).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listProductCategories
// ---------------------------------------------------------------------------

describe('listProductCategories', () => {
  it('returns null when the store is not enabled', async () => {
    const { listProductCategories } = await importModule();
    expect(await listProductCategories(1)).toBeNull();
  });

  it('returns only active categories for the given website', async () => {
    enableStore(1);
    seedCategory({ id: 1, websiteId: 1, slug: 'a', active: true });
    seedCategory({ id: 2, websiteId: 1, slug: 'b', active: false });
    seedCategory({ id: 3, websiteId: 2, slug: 'c', active: true });
    const { listProductCategories } = await importModule();
    const res = await listProductCategories(1);
    expect(res).not.toBeNull();
    expect(res).toHaveLength(1);
    expect(res![0].slug).toBe('a');
  });

  it('projects the expected columns including productCount via sql<number>``', async () => {
    enableStore(1);
    seedCategory({
      id: 1,
      websiteId: 1,
      slug: 'cat-1',
      name: 'Cat 1',
      description: 'desc',
      image: '/img.jpg',
      parentId: null,
      order: 3,
      active: true,
    });
    const { listProductCategories } = await importModule();
    const res = await listProductCategories(1);
    expect(res).not.toBeNull();
    expect(res![0]).toMatchObject({
      id: 1,
      name: 'Cat 1',
      slug: 'cat-1',
      description: 'desc',
      image: '/img.jpg',
      parentId: null,
      order: 3,
    });
    // productCount is computed via a sql tag — the mock leaves it undefined,
    // confirming the projection key exists on the returned row.
    expect(Object.prototype.hasOwnProperty.call(res![0], 'productCount')).toBe(true);
  });

  it('returns empty array when no active categories exist', async () => {
    enableStore(1);
    const { listProductCategories } = await importModule();
    const res = await listProductCategories(1);
    expect(res).toEqual([]);
  });
});
