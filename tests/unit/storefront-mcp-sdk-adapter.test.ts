// @vitest-environment node
/**
 * Unit tests for lib/storefront/mcp-sdk-adapter.ts.
 *
 * Adapter exports `registerStoreToolsOnSdk(server, ctx)` which registers
 * ~24 commerce-related tools. Each tool reads/writes data through `db` and
 * scopes everything to the authenticated client's websites via a shared
 * `requireSite()` helper.
 *
 * Strategy: mock `@/lib/db`, `@/lib/db/schema`, and `drizzle-orm`, plus
 * `next/cache`. Drive a fake McpServer that captures `{ name -> handler }`,
 * then call each handler with sample args and assert on the returned JSON
 * and the mocked side-effects. Covers scope gating, site-ownership checks,
 * happy paths, and error branches.
 */

process.env.DATABASE_URL ??= 'postgresql://placeholder@localhost:5432/placeholder';
process.env.NEXTAUTH_URL ??= 'http://localhost:3000';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PortalMcpContext } from '@/lib/mcp-auth';

// ── mocks ──────────────────────────────────────────────────────────────────

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

// db chain mock — handles every shape used by the adapter:
//   db.select(...).from(...).where(...).limit(...)
//   db.select(...).from(...).where(...).orderBy(...).limit(...)
//   db.select(...).from(...).where(...).orderBy(...)
//   db.insert(...).values(...).returning()
//   db.update(...).set(...).where(...).returning()
//   db.delete(...).where(...)
//   db.execute(sql`...`)
type QueryResult = unknown[];

const dbState: {
  // Per-call queue of select() results (drained in registration order).
  selectQueue: QueryResult[];
  // Default if queue is empty.
  selectDefault: QueryResult;
  // Per-call queue of insert().values().returning() results.
  insertQueue: QueryResult[];
  insertDefault: QueryResult;
  // Per-call queue of update().set().where().returning() results.
  updateQueue: QueryResult[];
  updateDefault: QueryResult;
  // Per-call queue of execute() results.
  executeQueue: QueryResult[];
  executeDefault: QueryResult;
  // Force-throw on the next insert/update if set.
  nextInsertThrow?: Error | null;
  nextUpdateThrow?: Error | null;
  // Counters
  insertCalls: number;
  updateCalls: number;
  deleteCalls: number;
} = {
  selectQueue: [],
  selectDefault: [],
  insertQueue: [],
  insertDefault: [{ id: 1 }],
  updateQueue: [],
  updateDefault: [{ id: 1 }],
  executeQueue: [],
  executeDefault: [],
  nextInsertThrow: null,
  nextUpdateThrow: null,
  insertCalls: 0,
  updateCalls: 0,
  deleteCalls: 0,
};

function takeSelect(): QueryResult {
  return dbState.selectQueue.length > 0 ? dbState.selectQueue.shift()! : dbState.selectDefault;
}
function takeInsert(): QueryResult {
  return dbState.insertQueue.length > 0 ? dbState.insertQueue.shift()! : dbState.insertDefault;
}
function takeUpdate(): QueryResult {
  return dbState.updateQueue.length > 0 ? dbState.updateQueue.shift()! : dbState.updateDefault;
}
function takeExecute(): QueryResult {
  return dbState.executeQueue.length > 0 ? dbState.executeQueue.shift()! : dbState.executeDefault;
}

function makeSelectChain(rows: QueryResult) {
  // Every method on the chain returns the chain proxy. The proxy is itself
  // thenable, so `await db.select()...` and `(await db.select(...).from(...)).orderBy(...)`
  // both work. Iterating a `for await` is not required.
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (onFulfilled: (v: QueryResult) => unknown) =>
            Promise.resolve(rows).then(onFulfilled);
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => makeSelectChain(takeSelect())),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => {
          dbState.insertCalls += 1;
          if (dbState.nextInsertThrow) {
            const err = dbState.nextInsertThrow;
            dbState.nextInsertThrow = null;
            throw err;
          }
          return takeInsert();
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            dbState.updateCalls += 1;
            if (dbState.nextUpdateThrow) {
              const err = dbState.nextUpdateThrow;
              dbState.nextUpdateThrow = null;
              throw err;
            }
            return takeUpdate();
          }),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => {
        dbState.deleteCalls += 1;
        return undefined;
      }),
    })),
    execute: vi.fn(async () => takeExecute()),
  },
}));

vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ name, table: { _: { name: 'fake' } } });
  const tbl = (cols: string[]): Record<string, unknown> =>
    Object.fromEntries(cols.map((c) => [c, col(c)]));
  return {
    clientWebsites: tbl(['id', 'clientId']),
    products: tbl([
      'id', 'websiteId', 'categoryId', 'name', 'slug', 'description', 'shortDescription',
      'price', 'compareAtPrice', 'sku', 'trackInventory', 'quantity', 'weight', 'weightUnit',
      'tags', 'featured', 'status', 'updatedAt',
    ]),
    productCategories: tbl(['id', 'websiteId', 'name', 'slug', 'description', 'parentId', 'image', 'order']),
    productImages: tbl(['id', 'productId', 'order']),
    productOptions: tbl(['id', 'productId', 'name', 'order']),
    productOptionValues: tbl(['id', 'optionId', 'value', 'label', 'order']),
    productVariants: tbl([
      'id', 'productId', 'name', 'sku', 'price', 'compareAtPrice', 'quantity',
      'optionValues', 'image', 'active', 'updatedAt',
    ]),
    orders: tbl([
      'id', 'websiteId', 'status', 'paymentStatus', 'customerEmail', 'createdAt',
      'shippedAt', 'deliveredAt', 'trackingNumber', 'trackingUrl', 'shippingMethod',
      'internalNote', 'orderNumber', 'total', 'updatedAt',
    ]),
    orderItems: tbl(['id', 'orderId']),
    orderStatusHistory: tbl(['id', 'orderId', 'status', 'note', 'changedBy', 'createdAt']),
    discountCodes: tbl([
      'id', 'websiteId', 'code', 'description', 'discountType', 'amount',
      'minOrderAmount', 'maxUses', 'startsAt', 'expiresAt', 'applicableTo',
      'active', 'createdAt', 'updatedAt',
    ]),
    storeCustomers: tbl([
      'id', 'websiteId', 'email', 'firstName', 'lastName', 'phone', 'status',
      'orderCount', 'totalSpent', 'createdAt', 'avatarUrl', 'defaultShippingAddress',
      'defaultBillingAddress', 'addressBook', 'emailVerified', 'lastLoginAt', 'notes',
    ]),
    storeCustomerMessages: tbl(['id', 'websiteId', 'status', 'createdAt', 'updatedAt']),
    storeCustomerMessageReplies: tbl(['id', 'messageId', 'body', 'isStaff', 'authorName']),
    storeProductReviews: tbl(['id', 'websiteId', 'productId', 'status', 'createdAt']),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  or: vi.fn((...args: unknown[]) => (args.length === 0 ? undefined : { _or: true })),
  desc: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  ilike: vi.fn(() => ({})),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn(() => ({})) }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// Mock portal-auth so hasServiceAccess (called via requireService → requireStore)
// does not hit the schema mock's missing `services`/`clientServices` exports.
// These tests exercise storefront adapter logic, not the entitlement gate itself.
const hasServiceAccessMock = vi.fn();
vi.mock('@/lib/portal-auth', () => ({
  hasServiceAccess: (...args: unknown[]) => hasServiceAccessMock(...args),
}));

// ── helpers ─────────────────────────────────────────────────────────────────

import { registerStoreToolsOnSdk } from '@/lib/storefront/mcp-sdk-adapter';

interface CapturedTool {
  name: string;
  config: { title?: string; description?: string; inputSchema?: Record<string, unknown> };
  handler: (
    args: Record<string, unknown>,
  ) => Promise<{ content: { text: string; type: string }[]; isError?: boolean }>;
}

function makeServer() {
  const tools = new Map<string, CapturedTool>();
  const stub = {
    registerTool: vi.fn(
      (name: string, config: CapturedTool['config'], handler: CapturedTool['handler']) => {
        tools.set(name, { name, config, handler });
        return { update: vi.fn(), enable: vi.fn(), disable: vi.fn() };
      },
    ),
    registerResource: vi.fn(),
  };
  return { stub, tools };
}

function ctxFor(scopes: string[]): PortalMcpContext {
  return {
    userId: 11,
    keyId: 1,
    scopes,
    client: { id: 1, company: 'Acme' } as PortalMcpContext['client'],
  };
}

function parseJson(res: { content: { text: string }[] }): unknown {
  return JSON.parse(res.content[0].text);
}

function registerAll(scopes: string[] = ['*', 'store:read', 'store:write']) {
  const { stub, tools } = makeServer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerStoreToolsOnSdk(stub as any, ctxFor(scopes));
  return tools;
}

// Queue a site-ownership hit so requireSite() returns the id.
function queueSiteOK() {
  dbState.selectQueue.push([{ id: 1 }]);
}
// Queue a site-ownership miss so requireSite() returns null.
function queueSiteMiss() {
  dbState.selectQueue.push([]);
}

// ── tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  dbState.selectQueue = [];
  dbState.selectDefault = [];
  dbState.insertQueue = [];
  dbState.insertDefault = [{ id: 1 }];
  dbState.updateQueue = [];
  dbState.updateDefault = [{ id: 1 }];
  dbState.executeQueue = [];
  dbState.executeDefault = [];
  dbState.nextInsertThrow = null;
  dbState.nextUpdateThrow = null;
  dbState.insertCalls = 0;
  dbState.updateCalls = 0;
  dbState.deleteCalls = 0;
  // Default: service access granted so requireStore() passes through to the adapter.
  hasServiceAccessMock.mockReset().mockResolvedValue(true);
});

describe('registerStoreToolsOnSdk — tool registration', () => {
  it('registers a large set of tools when scopes=*', () => {
    const tools = registerAll();
    expect(tools.size).toBeGreaterThanOrEqual(20);
  });

  it('registers the canonical read tools', () => {
    const tools = registerAll();
    for (const name of [
      'store_products_list',
      'store_products_get',
      'store_categories_list',
      'store_orders_list',
      'store_orders_get',
      'store_customers_list',
      'store_customers_get',
      'store_discounts_list',
      'store_reviews_list',
      'store_customer_messages_list',
      'store_settings_get',
    ]) {
      expect(tools.has(name), `should register ${name}`).toBe(true);
    }
  });

  it('registers the canonical write tools', () => {
    const tools = registerAll();
    for (const name of [
      'store_products_create',
      'store_products_update',
      'store_products_delete',
      'store_products_adjust_inventory',
      'store_product_options_create',
      'store_product_option_values_create',
      'store_product_variants_create',
      'store_product_variants_update',
      'store_categories_create',
      'store_orders_update_status',
      'store_orders_add_note',
      'store_discounts_create',
      'store_discounts_toggle',
      'store_discounts_delete',
      'store_reviews_moderate',
      'store_customer_messages_reply',
    ]) {
      expect(tools.has(name), `should register ${name}`).toBe(true);
    }
  });

  it('skips write tools when ctx lacks store:write', () => {
    const tools = registerAll(['store:read']);
    expect(tools.has('store_products_list')).toBe(true);
    expect(tools.has('store_products_create')).toBe(false);
    expect(tools.has('store_orders_update_status')).toBe(false);
  });

  it('skips read tools when ctx lacks store:read', () => {
    const tools = registerAll(['store:write']);
    expect(tools.has('store_products_list')).toBe(false);
    expect(tools.has('store_products_create')).toBe(true);
  });

  it('registers no store tools when ctx has no store scopes', () => {
    const tools = registerAll(['other:read']);
    expect(tools.size).toBe(0);
  });

  it('every tool has a non-empty title + description', () => {
    const tools = registerAll();
    for (const t of tools.values()) {
      expect(t.config.title, `${t.name} title`).toBeTruthy();
      expect((t.config.description ?? '').length, `${t.name} description`).toBeGreaterThan(5);
    }
  });

  it('every tool registers an inputSchema', () => {
    const tools = registerAll();
    for (const t of tools.values()) {
      expect(t.config.inputSchema, `${t.name}.inputSchema`).toBeDefined();
    }
  });
});

// ── PRODUCTS ────────────────────────────────────────────────────────────────

describe('store_products_list', () => {
  it('returns site-not-found when website is not owned', async () => {
    queueSiteMiss();
    const tools = registerAll();
    const res = await tools.get('store_products_list')!.handler({ websiteId: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('returns rows on happy path with status/category/featured/search filters', async () => {
    queueSiteOK();
    dbState.selectQueue.push([{ id: 1, name: 'Widget' }]);
    const tools = registerAll();
    const res = await tools.get('store_products_list')!.handler({
      websiteId: 1, status: 'active', categoryId: 2, featured: true, search: 'wid', limit: 5,
    });
    expect(parseJson(res)).toEqual([{ id: 1, name: 'Widget' }]);
  });

  it('omits all optional filters when only websiteId given', async () => {
    queueSiteOK();
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('store_products_list')!.handler({ websiteId: 1 });
    expect(parseJson(res)).toEqual([]);
  });
});

describe('store_products_get', () => {
  it('returns not-found when product is missing', async () => {
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('store_products_get')!.handler({ id: 5 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Product not found/);
  });

  it('returns permission-denied when product website not owned', async () => {
    dbState.selectQueue.push([{ id: 5, websiteId: 99 }]); // product
    queueSiteMiss();                                       // requireSite miss
    const tools = registerAll();
    const res = await tools.get('store_products_get')!.handler({ id: 5 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Permission denied/);
  });

  it('returns product with images + variants on happy path', async () => {
    dbState.selectQueue.push([{ id: 5, websiteId: 1 }]); // product
    queueSiteOK();                                        // requireSite
    dbState.selectQueue.push([{ id: 10, order: 1 }]);    // images
    dbState.selectQueue.push([{ id: 20 }]);              // variants
    const tools = registerAll();
    const res = await tools.get('store_products_get')!.handler({ id: 5 });
    const out = parseJson(res) as { product: { id: number }; images: unknown[]; variants: unknown[] };
    expect(out.product.id).toBe(5);
    expect(out.images.length).toBe(1);
    expect(out.variants.length).toBe(1);
  });
});

describe('store entitlement gate (requireStore)', () => {
  it('write handlers return serviceDenied + short-circuit when the client lacks the store subscription', async () => {
    // The repaired tests default hasServiceAccess→true so they can exercise handler
    // logic; this case verifies the gate itself. requireStore() → requireService →
    // hasServiceAccess(false) must deny BEFORE any site lookup or DB write.
    hasServiceAccessMock.mockReset().mockResolvedValue(false);
    const tools = registerAll();
    const res = await tools.get('store_products_create')!.handler({
      websiteId: 1, name: 'X', price: 100,
    });
    expect((res as { isError?: boolean }).isError).toBe(true);
    expect((res as { content: { text: string }[] }).content[0].text).toMatch(/active store subscription/i);
    expect(dbState.insertCalls).toBe(0); // short-circuited at the gate, no write
  });
});

describe('store_products_create', () => {
  it('returns site-not-found if website missing', async () => {
    queueSiteMiss();
    const tools = registerAll();
    const res = await tools.get('store_products_create')!.handler({
      websiteId: 1, name: 'X', price: 100,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('creates with derived slug + applies defaults', async () => {
    queueSiteOK();
    dbState.insertQueue.push([{ id: 42, slug: 'my-product', websiteId: 1 }]);
    const tools = registerAll();
    const res = await tools.get('store_products_create')!.handler({
      websiteId: 1, name: ' My Product! ', price: 100,
    });
    expect((parseJson(res) as { id: number; slug: string }).slug).toBe('my-product');
    expect(dbState.insertCalls).toBe(1);
  });

  it('honors an explicit slug + tags + weight', async () => {
    queueSiteOK();
    dbState.insertQueue.push([{ id: 43, slug: 'custom' }]);
    const tools = registerAll();
    const res = await tools.get('store_products_create')!.handler({
      websiteId: 1, name: 'P', price: 100, slug: 'custom',
      tags: ['a', 'b'], weight: 1.5, weightUnit: 'kg', featured: true,
    });
    expect((parseJson(res) as { id: number }).id).toBe(43);
  });

  it('catches DB errors (e.g. duplicate slug) and returns a friendly message', async () => {
    queueSiteOK();
    dbState.nextInsertThrow = new Error('duplicate key value');
    const tools = registerAll();
    const res = await tools.get('store_products_create')!.handler({
      websiteId: 1, name: 'Dup', price: 100,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/duplicate/);
  });
});

describe('store_products_update', () => {
  it('returns not-found when product missing', async () => {
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('store_products_update')!.handler({ id: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Product not found/);
  });

  it('returns permission-denied if product website not owned', async () => {
    dbState.selectQueue.push([{ websiteId: 99 }]);
    queueSiteMiss();
    const tools = registerAll();
    const res = await tools.get('store_products_update')!.handler({ id: 1, name: 'New' });
    expect((parseJson(res) as { error: string }).error).toMatch(/Permission denied/);
  });

  it('updates the product on happy path with selective patch', async () => {
    dbState.selectQueue.push([{ websiteId: 1 }]);
    queueSiteOK();
    dbState.updateQueue.push([{ id: 1, name: 'New', status: 'active' }]);
    const tools = registerAll();
    const res = await tools.get('store_products_update')!.handler({
      id: 1, name: 'New', status: 'active', sku: null, // undefined fields skipped
    });
    expect((parseJson(res) as { id: number; name: string }).name).toBe('New');
    expect(dbState.updateCalls).toBe(1);
  });
});

describe('store_products_delete', () => {
  it('returns not-found when product missing', async () => {
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('store_products_delete')!.handler({ id: 7 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Product not found/);
  });

  it('returns permission-denied if product website not owned', async () => {
    dbState.selectQueue.push([{ websiteId: 99 }]);
    queueSiteMiss();
    const tools = registerAll();
    const res = await tools.get('store_products_delete')!.handler({ id: 7 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Permission denied/);
  });

  it('returns {success:true,id} on happy path and calls db.delete', async () => {
    dbState.selectQueue.push([{ websiteId: 1 }]);
    queueSiteOK();
    const tools = registerAll();
    const res = await tools.get('store_products_delete')!.handler({ id: 7 });
    expect(parseJson(res)).toEqual({ success: true, id: 7 });
    expect(dbState.deleteCalls).toBe(1);
  });
});

describe('store_products_adjust_inventory', () => {
  it('returns not-found if product missing', async () => {
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('store_products_adjust_inventory')!.handler({ id: 1, delta: -1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Product not found/);
  });

  it('refuses to drive quantity negative', async () => {
    dbState.selectQueue.push([{ websiteId: 1, quantity: 2 }]);
    queueSiteOK();
    const tools = registerAll();
    const res = await tools.get('store_products_adjust_inventory')!.handler({ id: 1, delta: -10 });
    expect((parseJson(res) as { error: string }).error).toMatch(/negative/);
  });

  it('applies a positive delta and returns updated row', async () => {
    dbState.selectQueue.push([{ websiteId: 1, quantity: 2 }]);
    queueSiteOK();
    dbState.updateQueue.push([{ id: 1, quantity: 7 }]);
    const tools = registerAll();
    const res = await tools.get('store_products_adjust_inventory')!.handler({ id: 1, delta: 5 });
    expect((parseJson(res) as { quantity: number }).quantity).toBe(7);
  });

  it('returns permission-denied when website not owned', async () => {
    dbState.selectQueue.push([{ websiteId: 99, quantity: 5 }]);
    queueSiteMiss();
    const tools = registerAll();
    const res = await tools.get('store_products_adjust_inventory')!.handler({ id: 1, delta: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Permission denied/);
  });
});

// ── PRODUCT OPTIONS / VARIANTS ──────────────────────────────────────────────

describe('store_product_options_create', () => {
  it('refuses when product not owned', async () => {
    dbState.selectQueue.push([]); // requireProductSite: product not found
    const tools = registerAll();
    const res = await tools.get('store_product_options_create')!.handler({ productId: 1, name: 'Size' });
    expect((parseJson(res) as { error: string }).error).toMatch(/Product not found or not yours/);
  });

  it('creates an option, defaults order to existing.length', async () => {
    dbState.selectQueue.push([{ websiteId: 1 }]); // requireProductSite -> products
    queueSiteOK();                                 // requireSite hit
    dbState.selectQueue.push([{ id: 1 }, { id: 2 }]); // existing options
    dbState.insertQueue.push([{ id: 99, name: 'Size', order: 2 }]);
    const tools = registerAll();
    const res = await tools.get('store_product_options_create')!.handler({ productId: 1, name: 'Size' });
    expect((parseJson(res) as { order: number }).order).toBe(2);
  });
});

describe('store_product_option_values_create', () => {
  it('returns not-found when option missing', async () => {
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('store_product_option_values_create')!.handler({ optionId: 1, value: 'Red' });
    expect((parseJson(res) as { error: string }).error).toMatch(/Option not found/);
  });

  it('returns permission-denied when option product not owned', async () => {
    dbState.selectQueue.push([{ productId: 1 }]); // option
    dbState.selectQueue.push([]);                  // requireProductSite -> product missing
    const tools = registerAll();
    const res = await tools.get('store_product_option_values_create')!.handler({ optionId: 1, value: 'Red' });
    expect((parseJson(res) as { error: string }).error).toMatch(/Permission denied/);
  });

  it('creates a value on happy path', async () => {
    dbState.selectQueue.push([{ productId: 1 }]);         // option
    dbState.selectQueue.push([{ websiteId: 1 }]);          // requireProductSite -> products
    queueSiteOK();                                          // requireSite
    dbState.selectQueue.push([]);                           // existing values
    dbState.insertQueue.push([{ id: 50, value: 'Red', order: 0 }]);
    const tools = registerAll();
    const res = await tools.get('store_product_option_values_create')!.handler({
      optionId: 1, value: 'Red', label: 'RED', order: 0,
    });
    expect((parseJson(res) as { id: number; value: string }).value).toBe('Red');
  });
});

describe('store_product_variants_create', () => {
  it('refuses when product not owned', async () => {
    dbState.selectQueue.push([]); // requireProductSite -> products miss
    const tools = registerAll();
    const res = await tools.get('store_product_variants_create')!.handler({
      productId: 1, name: 'v', price: 100,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Product not found or not yours/);
  });

  it('creates the variant on happy path with optionValues', async () => {
    dbState.selectQueue.push([{ websiteId: 1 }]);
    queueSiteOK();
    dbState.insertQueue.push([{ id: 7, name: 'v', price: 100, optionValues: [{ optionId: 1, valueId: 2 }] }]);
    const tools = registerAll();
    const res = await tools.get('store_product_variants_create')!.handler({
      productId: 1, name: 'v', price: 100,
      optionValues: [{ optionId: 1, valueId: 2 }], image: 'http://img', sku: 'SKU-1',
    });
    expect((parseJson(res) as { id: number }).id).toBe(7);
  });
});

describe('store_product_variants_update', () => {
  it('returns not-found when variant missing', async () => {
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('store_product_variants_update')!.handler({ id: 1, name: 'X' });
    expect((parseJson(res) as { error: string }).error).toMatch(/Variant not found/);
  });

  it('returns permission-denied when variant product not owned', async () => {
    dbState.selectQueue.push([{ productId: 1 }]); // variant
    dbState.selectQueue.push([]);                  // requireProductSite -> products miss
    const tools = registerAll();
    const res = await tools.get('store_product_variants_update')!.handler({ id: 1, name: 'X' });
    expect((parseJson(res) as { error: string }).error).toMatch(/Permission denied/);
  });

  it('updates on happy path', async () => {
    dbState.selectQueue.push([{ productId: 1 }]);
    dbState.selectQueue.push([{ websiteId: 1 }]);
    queueSiteOK();
    dbState.updateQueue.push([{ id: 5, name: 'X' }]);
    const tools = registerAll();
    const res = await tools.get('store_product_variants_update')!.handler({
      id: 5, name: 'X', sku: null, price: 200, active: true,
    });
    expect((parseJson(res) as { id: number; name: string }).name).toBe('X');
  });
});

// ── CATEGORIES ──────────────────────────────────────────────────────────────

describe('store_categories_list', () => {
  it('returns not-found if site missing', async () => {
    queueSiteMiss();
    const tools = registerAll();
    const res = await tools.get('store_categories_list')!.handler({ websiteId: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('lists categories on happy path', async () => {
    queueSiteOK();
    dbState.selectQueue.push([{ id: 1, name: 'Tops' }]);
    const tools = registerAll();
    const res = await tools.get('store_categories_list')!.handler({ websiteId: 1 });
    expect(parseJson(res)).toEqual([{ id: 1, name: 'Tops' }]);
  });
});

describe('store_categories_create', () => {
  it('refuses when site not owned', async () => {
    queueSiteMiss();
    const tools = registerAll();
    const res = await tools.get('store_categories_create')!.handler({ websiteId: 99, name: 'X' });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('creates with derived slug', async () => {
    queueSiteOK();
    dbState.insertQueue.push([{ id: 5, name: 'New Cat', slug: 'new-cat' }]);
    const tools = registerAll();
    const res = await tools.get('store_categories_create')!.handler({
      websiteId: 1, name: ' New Cat! ',
    });
    expect((parseJson(res) as { slug: string }).slug).toBe('new-cat');
  });

  it('catches insert errors with a friendly payload', async () => {
    queueSiteOK();
    dbState.nextInsertThrow = new Error('boom');
    const tools = registerAll();
    const res = await tools.get('store_categories_create')!.handler({ websiteId: 1, name: 'X' });
    expect((parseJson(res) as { error: string }).error).toMatch(/Could not create category/);
  });
});

// ── ORDERS ──────────────────────────────────────────────────────────────────

describe('store_orders_list', () => {
  it('refuses when site missing', async () => {
    queueSiteMiss();
    const tools = registerAll();
    const res = await tools.get('store_orders_list')!.handler({ websiteId: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('lists orders with all optional filters applied', async () => {
    queueSiteOK();
    dbState.selectQueue.push([{ id: 1, status: 'paid' }]);
    const tools = registerAll();
    const res = await tools.get('store_orders_list')!.handler({
      websiteId: 1, status: 'shipped', paymentStatus: 'paid',
      customerEmail: 'X@Example.COM', since: '2026-01-01T00:00:00Z', limit: 10,
    });
    expect(parseJson(res)).toEqual([{ id: 1, status: 'paid' }]);
  });
});

describe('store_orders_get', () => {
  it('returns not-found when order missing', async () => {
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('store_orders_get')!.handler({ id: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Order not found/);
  });

  it('returns permission-denied when site not owned', async () => {
    dbState.selectQueue.push([{ id: 1, websiteId: 99 }]);
    queueSiteMiss();
    const tools = registerAll();
    const res = await tools.get('store_orders_get')!.handler({ id: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Permission denied/);
  });

  it('returns order with items and history on happy path', async () => {
    dbState.selectQueue.push([{ id: 1, websiteId: 1 }]); // order
    queueSiteOK();                                        // requireSite
    dbState.selectQueue.push([{ id: 50, orderId: 1 }]);   // items
    dbState.selectQueue.push([{ id: 9, status: 'pending' }]); // history
    const tools = registerAll();
    const res = await tools.get('store_orders_get')!.handler({ id: 1 });
    const out = parseJson(res) as { order: { id: number }; items: unknown[]; history: unknown[] };
    expect(out.order.id).toBe(1);
    expect(out.items.length).toBe(1);
    expect(out.history.length).toBe(1);
  });
});

describe('store_orders_update_status', () => {
  it('returns not-found when order missing', async () => {
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('store_orders_update_status')!.handler({ id: 1, status: 'shipped' });
    expect((parseJson(res) as { error: string }).error).toMatch(/Order not found/);
  });

  it('returns permission-denied when site not owned', async () => {
    dbState.selectQueue.push([{ id: 1, websiteId: 99 }]);
    queueSiteMiss();
    const tools = registerAll();
    const res = await tools.get('store_orders_update_status')!.handler({ id: 1, status: 'shipped' });
    expect((parseJson(res) as { error: string }).error).toMatch(/Permission denied/);
  });

  it('stamps shippedAt on shipped transition and logs history', async () => {
    dbState.selectQueue.push([{ id: 1, websiteId: 1, shippedAt: null, deliveredAt: null }]);
    queueSiteOK();
    dbState.updateQueue.push([{ id: 1, status: 'shipped', shippedAt: 'now' }]);
    const tools = registerAll();
    const res = await tools.get('store_orders_update_status')!.handler({
      id: 1, status: 'shipped', trackingNumber: 'TN', trackingUrl: 'http://t', shippingMethod: 'usps', note: 'left at door',
    });
    expect((parseJson(res) as { status: string }).status).toBe('shipped');
  });

  it('stamps deliveredAt on delivered transition', async () => {
    dbState.selectQueue.push([{ id: 1, websiteId: 1, shippedAt: 'earlier', deliveredAt: null }]);
    queueSiteOK();
    dbState.updateQueue.push([{ id: 1, status: 'delivered' }]);
    const tools = registerAll();
    const res = await tools.get('store_orders_update_status')!.handler({ id: 1, status: 'delivered' });
    expect((parseJson(res) as { status: string }).status).toBe('delivered');
  });
});

describe('store_orders_add_note', () => {
  it('returns not-found when order missing', async () => {
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('store_orders_add_note')!.handler({ id: 1, note: 'n' });
    expect((parseJson(res) as { error: string }).error).toMatch(/Order not found/);
  });

  it('returns permission-denied when site not owned', async () => {
    dbState.selectQueue.push([{ websiteId: 99, internalNote: '' }]);
    queueSiteMiss();
    const tools = registerAll();
    const res = await tools.get('store_orders_add_note')!.handler({ id: 1, note: 'n' });
    expect((parseJson(res) as { error: string }).error).toMatch(/Permission denied/);
  });

  it('replaces note when mode=replace', async () => {
    dbState.selectQueue.push([{ websiteId: 1, internalNote: 'old' }]);
    queueSiteOK();
    dbState.updateQueue.push([{ id: 1, internalNote: 'fresh' }]);
    const tools = registerAll();
    const res = await tools.get('store_orders_add_note')!.handler({ id: 1, note: 'fresh', mode: 'replace' });
    expect((parseJson(res) as { internalNote: string }).internalNote).toBe('fresh');
  });

  it('appends to existing note when mode=append (default)', async () => {
    dbState.selectQueue.push([{ websiteId: 1, internalNote: 'first' }]);
    queueSiteOK();
    dbState.updateQueue.push([{ id: 1, internalNote: 'first\n... second' }]);
    const tools = registerAll();
    const res = await tools.get('store_orders_add_note')!.handler({ id: 1, note: 'second' });
    expect((parseJson(res) as { internalNote: string }).internalNote).toMatch(/first/);
  });

  it('writes plain note when no existing note', async () => {
    dbState.selectQueue.push([{ websiteId: 1, internalNote: null }]);
    queueSiteOK();
    dbState.updateQueue.push([{ id: 1, internalNote: 'first' }]);
    const tools = registerAll();
    const res = await tools.get('store_orders_add_note')!.handler({ id: 1, note: 'first' });
    expect((parseJson(res) as { internalNote: string }).internalNote).toBe('first');
  });
});

// ── CUSTOMERS ───────────────────────────────────────────────────────────────

describe('store_customers_list', () => {
  it('refuses when site missing', async () => {
    queueSiteMiss();
    const tools = registerAll();
    const res = await tools.get('store_customers_list')!.handler({ websiteId: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('lists customers with status + search filters', async () => {
    queueSiteOK();
    dbState.selectQueue.push([{ id: 1, email: 'a@b.com', firstName: 'A', lastName: 'B' }]);
    const tools = registerAll();
    const res = await tools.get('store_customers_list')!.handler({
      websiteId: 1, status: 'active', search: 'a', limit: 20,
    });
    expect(parseJson(res)).toEqual([{ id: 1, email: 'a@b.com', firstName: 'A', lastName: 'B' }]);
  });
});

describe('store_customers_get', () => {
  it('returns not-found when customer missing', async () => {
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('store_customers_get')!.handler({ id: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Customer not found/);
  });

  it('returns permission-denied when website not owned', async () => {
    dbState.selectQueue.push([{ id: 1, websiteId: 99, email: 'c@x.com' }]);
    queueSiteMiss();
    const tools = registerAll();
    const res = await tools.get('store_customers_get')!.handler({ id: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Permission denied/);
  });

  it('returns customer + recent orders on happy path', async () => {
    dbState.selectQueue.push([{ id: 1, websiteId: 1, email: 'c@x.com' }]); // customer
    queueSiteOK();                                                          // requireSite
    dbState.selectQueue.push([{ id: 50, orderNumber: 'ABC' }]);            // orders
    const tools = registerAll();
    const res = await tools.get('store_customers_get')!.handler({ id: 1 });
    const out = parseJson(res) as { customer: { id: number }; recentOrders: { id: number }[] };
    expect(out.customer.id).toBe(1);
    expect(out.recentOrders[0].id).toBe(50);
  });
});

// ── DISCOUNTS ───────────────────────────────────────────────────────────────

describe('store_discounts_list', () => {
  it('refuses when site missing', async () => {
    queueSiteMiss();
    const tools = registerAll();
    const res = await tools.get('store_discounts_list')!.handler({ websiteId: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('lists discounts with activeOnly filter', async () => {
    queueSiteOK();
    dbState.selectQueue.push([{ id: 1, code: 'SAVE10', active: true }]);
    const tools = registerAll();
    const res = await tools.get('store_discounts_list')!.handler({ websiteId: 1, activeOnly: true });
    expect(parseJson(res)).toEqual([{ id: 1, code: 'SAVE10', active: true }]);
  });

  it('lists discounts without activeOnly filter (default)', async () => {
    queueSiteOK();
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('store_discounts_list')!.handler({ websiteId: 1 });
    expect(parseJson(res)).toEqual([]);
  });
});

describe('store_discounts_create', () => {
  it('refuses when site missing', async () => {
    queueSiteMiss();
    const tools = registerAll();
    const res = await tools.get('store_discounts_create')!.handler({
      websiteId: 99, code: 'X', discountType: 'percent', amount: 1000,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('creates with optional fields normalized', async () => {
    queueSiteOK();
    dbState.insertQueue.push([{ id: 5, code: 'SAVE10' }]);
    const tools = registerAll();
    const res = await tools.get('store_discounts_create')!.handler({
      websiteId: 1, code: ' save10 ', discountType: 'percent', amount: 1000,
      startsAt: '2026-01-01', expiresAt: '2026-12-31', maxUses: 100, minOrderAmount: 500,
      applicableTo: 'both',
    });
    expect((parseJson(res) as { id: number }).id).toBe(5);
  });

  it('catches insert errors as friendly text', async () => {
    queueSiteOK();
    dbState.nextInsertThrow = new Error('duplicate code');
    const tools = registerAll();
    const res = await tools.get('store_discounts_create')!.handler({
      websiteId: 1, code: 'X', discountType: 'fixed_amount', amount: 100,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/duplicate/);
  });
});

describe('store_discounts_toggle', () => {
  it('returns not-found when discount missing', async () => {
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('store_discounts_toggle')!.handler({ id: 1, active: true });
    expect((parseJson(res) as { error: string }).error).toMatch(/Discount not found/);
  });

  it('returns permission-denied when website not owned', async () => {
    dbState.selectQueue.push([{ websiteId: 99 }]);
    queueSiteMiss();
    const tools = registerAll();
    const res = await tools.get('store_discounts_toggle')!.handler({ id: 1, active: true });
    expect((parseJson(res) as { error: string }).error).toMatch(/Permission denied/);
  });

  it('flips active flag on happy path', async () => {
    dbState.selectQueue.push([{ websiteId: 1 }]);
    queueSiteOK();
    dbState.updateQueue.push([{ id: 1, active: false }]);
    const tools = registerAll();
    const res = await tools.get('store_discounts_toggle')!.handler({ id: 1, active: false });
    expect((parseJson(res) as { active: boolean }).active).toBe(false);
  });
});

describe('store_discounts_delete', () => {
  it('returns not-found when discount missing', async () => {
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('store_discounts_delete')!.handler({ id: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Discount not found/);
  });

  it('returns permission-denied when website not owned', async () => {
    dbState.selectQueue.push([{ websiteId: 99 }]);
    queueSiteMiss();
    const tools = registerAll();
    const res = await tools.get('store_discounts_delete')!.handler({ id: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Permission denied/);
  });

  it('returns success echo and calls db.delete', async () => {
    dbState.selectQueue.push([{ websiteId: 1 }]);
    queueSiteOK();
    const tools = registerAll();
    const res = await tools.get('store_discounts_delete')!.handler({ id: 1 });
    expect(parseJson(res)).toEqual({ success: true, id: 1 });
    expect(dbState.deleteCalls).toBe(1);
  });
});

// ── REVIEWS ─────────────────────────────────────────────────────────────────

describe('store_reviews_list', () => {
  it('refuses when site missing', async () => {
    queueSiteMiss();
    const tools = registerAll();
    const res = await tools.get('store_reviews_list')!.handler({ websiteId: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('lists reviews with status + product filter', async () => {
    queueSiteOK();
    dbState.selectQueue.push([{ id: 1, status: 'pending' }]);
    const tools = registerAll();
    const res = await tools.get('store_reviews_list')!.handler({
      websiteId: 1, status: 'pending', productId: 5, limit: 25,
    });
    expect(parseJson(res)).toEqual([{ id: 1, status: 'pending' }]);
  });
});

describe('store_reviews_moderate', () => {
  it('returns not-found when review missing', async () => {
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('store_reviews_moderate')!.handler({ id: 1, action: 'approve' });
    expect((parseJson(res) as { error: string }).error).toMatch(/Review not found/);
  });

  it('returns permission-denied when site not owned', async () => {
    dbState.selectQueue.push([{ id: 1, websiteId: 99 }]);
    queueSiteMiss();
    const tools = registerAll();
    const res = await tools.get('store_reviews_moderate')!.handler({ id: 1, action: 'approve' });
    expect((parseJson(res) as { error: string }).error).toMatch(/Permission denied/);
  });

  it('approves a review on happy path', async () => {
    dbState.selectQueue.push([{ id: 1, websiteId: 1 }]);
    queueSiteOK();
    dbState.updateQueue.push([{ id: 1, status: 'approved' }]);
    const tools = registerAll();
    const res = await tools.get('store_reviews_moderate')!.handler({ id: 1, action: 'approve' });
    expect((parseJson(res) as { status: string }).status).toBe('approved');
  });

  it('rejects a review on happy path', async () => {
    dbState.selectQueue.push([{ id: 1, websiteId: 1 }]);
    queueSiteOK();
    dbState.updateQueue.push([{ id: 1, status: 'rejected' }]);
    const tools = registerAll();
    const res = await tools.get('store_reviews_moderate')!.handler({ id: 1, action: 'reject' });
    expect((parseJson(res) as { status: string }).status).toBe('rejected');
  });
});

// ── CUSTOMER MESSAGES ───────────────────────────────────────────────────────

describe('store_customer_messages_list', () => {
  it('refuses when site missing', async () => {
    queueSiteMiss();
    const tools = registerAll();
    const res = await tools.get('store_customer_messages_list')!.handler({ websiteId: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('lists messages with status filter', async () => {
    queueSiteOK();
    dbState.selectQueue.push([{ id: 1, status: 'open' }]);
    const tools = registerAll();
    const res = await tools.get('store_customer_messages_list')!.handler({
      websiteId: 1, status: 'open', limit: 10,
    });
    expect(parseJson(res)).toEqual([{ id: 1, status: 'open' }]);
  });

  it('uses default limit when omitted', async () => {
    queueSiteOK();
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('store_customer_messages_list')!.handler({ websiteId: 1 });
    expect(parseJson(res)).toEqual([]);
  });
});

describe('store_customer_messages_reply', () => {
  it('returns not-found when message missing', async () => {
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('store_customer_messages_reply')!.handler({ messageId: 1, body: 'hi' });
    expect((parseJson(res) as { error: string }).error).toMatch(/Message not found/);
  });

  it('returns permission-denied when site not owned', async () => {
    dbState.selectQueue.push([{ id: 1, websiteId: 99 }]);
    queueSiteMiss();
    const tools = registerAll();
    const res = await tools.get('store_customer_messages_reply')!.handler({ messageId: 1, body: 'hi' });
    expect((parseJson(res) as { error: string }).error).toMatch(/Permission denied/);
  });

  it('inserts a reply and updates message status to replied', async () => {
    dbState.selectQueue.push([{ id: 1, websiteId: 1 }]);
    queueSiteOK();
    dbState.insertQueue.push([{ id: 10, messageId: 1, body: 'hi', isStaff: true, authorName: 'Acme' }]);
    const tools = registerAll();
    const res = await tools.get('store_customer_messages_reply')!.handler({ messageId: 1, body: 'hi' });
    expect((parseJson(res) as { id: number; isStaff: boolean }).isStaff).toBe(true);
  });
});

// ── STORE SETTINGS ──────────────────────────────────────────────────────────

describe('store_settings_get', () => {
  it('refuses when site missing', async () => {
    queueSiteMiss();
    const tools = registerAll();
    const res = await tools.get('store_settings_get')!.handler({ websiteId: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('returns error stub when settings not configured', async () => {
    queueSiteOK();
    dbState.executeQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('store_settings_get')!.handler({ websiteId: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not yet configured/);
  });

  it('returns the first row when settings exist', async () => {
    queueSiteOK();
    dbState.executeQueue.push([{ id: 1, currency: 'USD', enabled: true }]);
    const tools = registerAll();
    const res = await tools.get('store_settings_get')!.handler({ websiteId: 1 });
    expect((parseJson(res) as { currency: string }).currency).toBe('USD');
  });
});
