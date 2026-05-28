// @vitest-environment node
/**
 * Unit tests for 4 store-area portal routes (batch 34a).
 *
 * Routes covered:
 *   1. app/api/portal/websites/[siteId]/store/discounts/[discountId]/route.ts
 *        - PUT updates a discount code (with code-uniqueness re-check on rename)
 *        - DELETE removes the discount
 *   2. app/api/portal/websites/[siteId]/store/discounts/route.ts
 *        - GET lists all discount codes for the website
 *        - POST creates a discount code with code-uniqueness check
 *   3. app/api/portal/websites/[siteId]/store/orders/route.ts
 *        - GET lists orders with status/search filters, pagination, and items
 *          attached via an IN-clause subquery
 *   4. app/api/portal/websites/[siteId]/store/products/[productId]/options/route.ts
 *        - GET lists product options + their values
 *        - POST creates a product option (auto-incrementing order) with values
 *
 * All externals (auth, resolveClientSite, drizzle helpers, schema, @/lib/db)
 * are mocked. The DB mock is an in-memory Proxy-driven fluent builder that
 * supports select / insert / update / delete chains for these tables.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks: auth + portal-client
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const resolveClientSiteMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  resolveClientSite: (...args: unknown[]) => resolveClientSiteMock(...args),
}));

// ---------------------------------------------------------------------------
// Mocks: schema (Proxy column refs)
// ---------------------------------------------------------------------------

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
    discountCodes: wrap('discountCodes'),
    orders: wrap('orders'),
    orderItems: wrap('orderItems'),
    products: wrap('products'),
    productOptions: wrap('productOptions'),
    productOptionValues: wrap('productOptionValues'),
  };
});

// ---------------------------------------------------------------------------
// Mocks: drizzle-orm
// ---------------------------------------------------------------------------

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
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
}));

// ---------------------------------------------------------------------------
// In-memory DB
// ---------------------------------------------------------------------------

interface State {
  discountCodes: Array<Record<string, unknown>>;
  orders: Array<Record<string, unknown>>;
  orderItems: Array<Record<string, unknown>>;
  products: Array<Record<string, unknown>>;
  productOptions: Array<Record<string, unknown>>;
  productOptionValues: Array<Record<string, unknown>>;
  nextDiscountId: number;
  nextOrderId: number;
  nextOrderItemId: number;
  nextProductId: number;
  nextOptionId: number;
  nextOptionValueId: number;
}

const state: State = {
  discountCodes: [],
  orders: [],
  orderItems: [],
  products: [],
  productOptions: [],
  productOptionValues: [],
  nextDiscountId: 1,
  nextOrderId: 1,
  nextOrderItemId: 1,
  nextProductId: 1,
  nextOptionId: 1,
  nextOptionValueId: 1,
};

function tableArray(name: string): Array<Record<string, unknown>> {
  switch (name) {
    case 'discountCodes':
      return state.discountCodes;
    case 'orders':
      return state.orders;
    case 'orderItems':
      return state.orderItems;
    case 'products':
      return state.products;
    case 'productOptions':
      return state.productOptions;
    case 'productOptionValues':
      return state.productOptionValues;
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

  // IN(...) subquery via sql`${col} IN (${sql.join(ids)})` — extract scalars
  // from the nested sql tagged-template and check if the row's id-ish column
  // is among them. We detect the target column from the first __col seen in
  // the template values.
  if (f.__sql) {
    const values = (filter as { values?: unknown[] }).values ?? [];
    let targetCol: { __col?: string; __table?: string } | undefined;
    const ids: unknown[] = [];
    const walk = (v: unknown) => {
      if (v == null) return;
      if (typeof v === 'object') {
        const obj = v as Record<string, unknown>;
        if (obj.__sqlJoin) {
          const parts = (obj.parts as unknown[]) ?? [];
          for (const p of parts) walk(p);
          return;
        }
        if (obj.__sql) {
          const inner = (obj.values as unknown[]) ?? [];
          for (const p of inner) walk(p);
          return;
        }
        if (typeof obj.__col === 'string') {
          if (!targetCol) targetCol = obj as { __col: string; __table?: string };
          return;
        }
      }
      // primitive
      ids.push(v);
    };
    for (const v of values) walk(v);
    if (!targetCol || ids.length === 0) return ids.length === 0 ? false : true;
    return ids.includes(row[targetCol.__col!]);
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
    case 'or':
      return (f.args ?? []).some((arg) => evalPredicate(arg, row));
    default:
      return true;
  }
}

vi.mock('@/lib/db', () => {
  function buildSelect(projection?: Record<string, unknown>) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limitVal: number | null = null;
    let offsetVal: number | null = null;

    function isCountProjection(): boolean {
      if (!projection) return false;
      const vals = Object.values(projection);
      return (
        vals.length === 1 &&
        (vals[0] as { __agg?: string })?.__agg === 'count'
      );
    }

    function project(row: Record<string, unknown>) {
      if (!projection) return { ...row };
      const projected: Record<string, unknown> = {};
      for (const [outKey, ref] of Object.entries(projection)) {
        const colRef = ref as { __col?: string; __table?: string } | undefined;
        if (colRef?.__col) {
          projected[outKey] = row[colRef.__col] ?? null;
        } else {
          projected[outKey] = null;
        }
      }
      return projected;
    }

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);

      if (isCountProjection()) {
        const rows = tableArray(activeTable).filter((r) =>
          evalPredicate(filter, r),
        );
        const key = Object.keys(projection!)[0];
        return Promise.resolve([{ [key]: rows.length }]);
      }

      let rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      let out = rows.map(project);
      if (typeof offsetVal === 'number') out = out.slice(offsetVal);
      if (typeof limitVal === 'number') out = out.slice(0, limitVal);
      return Promise.resolve(out);
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
          if (table.__table === 'discountCodes') {
            row.id = state.nextDiscountId++;
            row.createdAt = new Date('2026-04-01');
            row.updatedAt = new Date('2026-04-01');
            // schema-level defaults: usedCount = 0 unless overridden
            if (row.usedCount === undefined) row.usedCount = 0;
          } else if (table.__table === 'orders') {
            row.id = state.nextOrderId++;
          } else if (table.__table === 'orderItems') {
            row.id = state.nextOrderItemId++;
          } else if (table.__table === 'products') {
            row.id = state.nextProductId++;
          } else if (table.__table === 'productOptions') {
            row.id = state.nextOptionId++;
          } else if (table.__table === 'productOptionValues') {
            row.id = state.nextOptionValueId++;
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
// Modules under test
// ---------------------------------------------------------------------------

const { PUT: PUT_Discount, DELETE: DELETE_Discount } = await import(
  '@/app/api/portal/websites/[siteId]/store/discounts/[discountId]/route'
);
const { GET: GET_Discounts, POST: POST_Discount } = await import(
  '@/app/api/portal/websites/[siteId]/store/discounts/route'
);
const { GET: GET_Orders } = await import(
  '@/app/api/portal/websites/[siteId]/store/orders/route'
);
const { GET: GET_Options, POST: POST_Option } = await import(
  '@/app/api/portal/websites/[siteId]/store/products/[productId]/options/route'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGet(url: string): Request {
  return new Request(url, { method: 'GET' });
}

function makeJson(method: 'POST' | 'PUT', url: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeDel(url: string): Request {
  return new Request(url, { method: 'DELETE' });
}

beforeEach(() => {
  state.discountCodes.length = 0;
  state.orders.length = 0;
  state.orderItems.length = 0;
  state.products.length = 0;
  state.productOptions.length = 0;
  state.productOptionValues.length = 0;
  state.nextDiscountId = 1;
  state.nextOrderId = 1;
  state.nextOrderItemId = 1;
  state.nextProductId = 1;
  state.nextOptionId = 1;
  state.nextOptionValueId = 1;

  authMock.mockReset();
  resolveClientSiteMock.mockReset();
  authMock.mockResolvedValue({ user: { id: '7' } });
  resolveClientSiteMock.mockResolvedValue({ id: 10 });
});

// ===========================================================================
// 1. PUT/DELETE /api/portal/websites/[siteId]/store/discounts/[discountId]
// ===========================================================================

describe('PUT /api/portal/websites/[siteId]/store/discounts/[discountId]', () => {
  const url = 'http://x/api/portal/websites/1/store/discounts/1';
  const ctx = (siteId = '1', discountId = '1') => ({
    params: Promise.resolve({ siteId, discountId }),
  });

  it('returns 401 with no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await PUT_Discount(makeJson('PUT', url, { code: 'X' }), ctx());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await PUT_Discount(makeJson('PUT', url, { code: 'X' }), ctx());
    expect(res.status).toBe(401);
  });

  it('returns 404 when client site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await PUT_Discount(makeJson('PUT', url, { code: 'X' }), ctx());
    expect(res.status).toBe(404);
  });

  it('returns 404 when discount does not exist for this site', async () => {
    state.discountCodes.push({
      id: 1,
      websiteId: 999, // different website
      code: 'SUMMER',
    });
    const res = await PUT_Discount(makeJson('PUT', url, { code: 'X' }), ctx());
    expect(res.status).toBe(404);
  });

  it('updates discount fields, uppercases code, normalizes numeric/date inputs', async () => {
    state.discountCodes.push({
      id: 1,
      websiteId: 10,
      code: 'OLD',
      description: null,
      discountType: 'percent',
      amount: 10,
      minOrderAmount: null,
      maxUses: null,
      startsAt: null,
      expiresAt: null,
      active: true,
      applicableTo: 'both',
    });
    const res = await PUT_Discount(
      makeJson('PUT', url, {
        code: 'newcode',
        description: 'updated',
        discountType: 'fixed',
        amount: '2500',
        minOrderAmount: '1000',
        maxUses: '50',
        startsAt: '2026-04-01T00:00:00Z',
        expiresAt: '2026-05-01T00:00:00Z',
        active: false,
        applicableTo: 'products',
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.code).toBe('NEWCODE');
    expect(body.data.description).toBe('updated');
    expect(body.data.discountType).toBe('fixed');
    expect(body.data.amount).toBe(2500);
    expect(body.data.minOrderAmount).toBe(1000);
    expect(body.data.maxUses).toBe(50);
    expect(new Date(body.data.startsAt as string).getUTCFullYear()).toBe(2026);
    expect(new Date(body.data.expiresAt as string).getUTCFullYear()).toBe(2026);
    expect(body.data.active).toBe(false);
    expect(body.data.applicableTo).toBe('products');
  });

  it('accepts null for minOrderAmount/maxUses/startsAt/expiresAt and stores null', async () => {
    state.discountCodes.push({
      id: 1,
      websiteId: 10,
      code: 'OLD',
      minOrderAmount: 500,
      maxUses: 10,
      startsAt: new Date('2026-01-01'),
      expiresAt: new Date('2026-02-01'),
    });
    const res = await PUT_Discount(
      makeJson('PUT', url, {
        minOrderAmount: null,
        maxUses: null,
        startsAt: null,
        expiresAt: null,
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.minOrderAmount).toBeNull();
    expect(body.data.maxUses).toBeNull();
    expect(body.data.startsAt).toBeNull();
    expect(body.data.expiresAt).toBeNull();
  });

  it('returns 409 when renaming code to one already taken on this site', async () => {
    state.discountCodes.push({ id: 1, websiteId: 10, code: 'OLD' });
    state.discountCodes.push({ id: 2, websiteId: 10, code: 'TAKEN' });
    const res = await PUT_Discount(
      makeJson('PUT', url, { code: 'taken' }),
      ctx(),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.message).toMatch(/already exists/);
  });

  it('does NOT check uniqueness when code is unchanged (case-insensitive)', async () => {
    state.discountCodes.push({ id: 1, websiteId: 10, code: 'SAME', amount: 5 });
    const res = await PUT_Discount(
      makeJson('PUT', url, { code: 'same', amount: 99 }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.code).toBe('SAME');
    expect(body.data.amount).toBe(99);
  });

  it('uniqueness check ignores collision on a different website', async () => {
    state.discountCodes.push({ id: 1, websiteId: 10, code: 'OLD' });
    state.discountCodes.push({ id: 2, websiteId: 999, code: 'TAKEN' });
    const res = await PUT_Discount(
      makeJson('PUT', url, { code: 'taken' }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.code).toBe('TAKEN');
  });

  it('partial update only sets provided fields', async () => {
    state.discountCodes.push({
      id: 1,
      websiteId: 10,
      code: 'OLD',
      description: 'orig',
      discountType: 'percent',
      amount: 10,
      active: true,
    });
    const res = await PUT_Discount(
      makeJson('PUT', url, { description: 'just desc' }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.description).toBe('just desc');
    expect(body.data.code).toBe('OLD');
    expect(body.data.discountType).toBe('percent');
    expect(body.data.amount).toBe(10);
    expect(body.data.active).toBe(true);
    expect(typeof body.data.updatedAt).toBe('string');
    expect(Number.isNaN(new Date(body.data.updatedAt as string).getTime())).toBe(false);
  });
});

describe('DELETE /api/portal/websites/[siteId]/store/discounts/[discountId]', () => {
  const url = 'http://x/api/portal/websites/1/store/discounts/1';
  const ctx = (siteId = '1', discountId = '1') => ({
    params: Promise.resolve({ siteId, discountId }),
  });

  it('returns 401 with no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await DELETE_Discount(makeDel(url), ctx());
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await DELETE_Discount(makeDel(url), ctx());
    expect(res.status).toBe(401);
  });

  it('returns 404 when client site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await DELETE_Discount(makeDel(url), ctx());
    expect(res.status).toBe(404);
  });

  it('returns 404 when discount belongs to a different site', async () => {
    state.discountCodes.push({ id: 1, websiteId: 999, code: 'X' });
    const res = await DELETE_Discount(makeDel(url), ctx());
    expect(res.status).toBe(404);
  });

  it('deletes the discount and returns success', async () => {
    state.discountCodes.push({ id: 1, websiteId: 10, code: 'X' });
    const res = await DELETE_Discount(makeDel(url), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, message: 'Discount code deleted' });
    expect(state.discountCodes).toHaveLength(0);
  });
});

// ===========================================================================
// 2. GET/POST /api/portal/websites/[siteId]/store/discounts
// ===========================================================================

describe('GET /api/portal/websites/[siteId]/store/discounts', () => {
  const url = 'http://x/api/portal/websites/1/store/discounts';
  const ctx = (siteId = '1') => ({ params: Promise.resolve({ siteId }) });

  it('returns 401 with no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await GET_Discounts(makeGet(url), ctx());
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await GET_Discounts(makeGet(url), ctx());
    expect(res.status).toBe(401);
  });

  it('returns 404 when site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await GET_Discounts(makeGet(url), ctx());
    expect(res.status).toBe(404);
  });

  it('returns empty list when no codes exist', async () => {
    const res = await GET_Discounts(makeGet(url), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: [] });
  });

  it('returns only discounts for the resolved website', async () => {
    state.discountCodes.push({
      id: 1,
      websiteId: 10,
      code: 'ALPHA',
      createdAt: new Date('2026-03-01'),
    });
    state.discountCodes.push({
      id: 2,
      websiteId: 10,
      code: 'BETA',
      createdAt: new Date('2026-03-02'),
    });
    state.discountCodes.push({
      id: 3,
      websiteId: 999,
      code: 'ALIEN',
      createdAt: new Date('2026-03-03'),
    });
    const res = await GET_Discounts(makeGet(url), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    const codes = body.data.map((d: { code: string }) => d.code).sort();
    expect(codes).toEqual(['ALPHA', 'BETA']);
  });
});

describe('POST /api/portal/websites/[siteId]/store/discounts', () => {
  const url = 'http://x/api/portal/websites/1/store/discounts';
  const ctx = (siteId = '1') => ({ params: Promise.resolve({ siteId }) });

  it('returns 401 with no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await POST_Discount(
      makeJson('POST', url, { code: 'X', discountType: 'percent', amount: 10 }),
      ctx(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await POST_Discount(
      makeJson('POST', url, { code: 'X', discountType: 'percent', amount: 10 }),
      ctx(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await POST_Discount(
      makeJson('POST', url, { code: 'X', discountType: 'percent', amount: 10 }),
      ctx(),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when code is missing', async () => {
    const res = await POST_Discount(
      makeJson('POST', url, { discountType: 'percent', amount: 10 }),
      ctx(),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/required/);
  });

  it('returns 400 when discountType is missing', async () => {
    const res = await POST_Discount(
      makeJson('POST', url, { code: 'X', amount: 10 }),
      ctx(),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when amount is undefined', async () => {
    const res = await POST_Discount(
      makeJson('POST', url, { code: 'X', discountType: 'percent' }),
      ctx(),
    );
    expect(res.status).toBe(400);
  });

  it('accepts amount=0', async () => {
    const res = await POST_Discount(
      makeJson('POST', url, { code: 'ZERO', discountType: 'fixed', amount: 0 }),
      ctx(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.amount).toBe(0);
  });

  it('returns 409 when code already exists on the website', async () => {
    state.discountCodes.push({ id: 99, websiteId: 10, code: 'DUPE' });
    const res = await POST_Discount(
      makeJson('POST', url, { code: 'dupe', discountType: 'percent', amount: 10 }),
      ctx(),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.message).toMatch(/already exists/);
  });

  it('allows the same code across different websites', async () => {
    state.discountCodes.push({ id: 99, websiteId: 555, code: 'SHARED' });
    const res = await POST_Discount(
      makeJson('POST', url, {
        code: 'shared',
        discountType: 'percent',
        amount: 5,
      }),
      ctx(),
    );
    expect(res.status).toBe(201);
  });

  it('creates a discount with defaults and uppercases the code', async () => {
    const res = await POST_Discount(
      makeJson('POST', url, {
        code: 'fall20',
        discountType: 'percent',
        amount: '20',
      }),
      ctx(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(body.data.websiteId).toBe(10);
    expect(body.data.code).toBe('FALL20');
    expect(body.data.discountType).toBe('percent');
    expect(body.data.amount).toBe(20);
    expect(body.data.description).toBeNull();
    expect(body.data.minOrderAmount).toBeNull();
    expect(body.data.maxUses).toBeNull();
    expect(body.data.startsAt).toBeNull();
    expect(body.data.expiresAt).toBeNull();
    expect(body.data.applicableTo).toBe('both');
    expect(body.data.active).toBe(true);
  });

  it('persists provided optional fields and coerces numbers/dates', async () => {
    const res = await POST_Discount(
      makeJson('POST', url, {
        code: 'SPRING',
        description: 'Spring sale',
        discountType: 'fixed',
        amount: '2500',
        minOrderAmount: '1000',
        maxUses: '50',
        startsAt: '2026-04-01T00:00:00Z',
        expiresAt: '2026-05-01T00:00:00Z',
        applicableTo: 'products',
        active: false,
      }),
      ctx(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.description).toBe('Spring sale');
    expect(body.data.amount).toBe(2500);
    expect(body.data.minOrderAmount).toBe(1000);
    expect(body.data.maxUses).toBe(50);
    expect(new Date(body.data.startsAt as string).getUTCFullYear()).toBe(2026);
    expect(new Date(body.data.expiresAt as string).getUTCFullYear()).toBe(2026);
    expect(body.data.applicableTo).toBe('products');
    expect(body.data.active).toBe(false);
  });

  it('treats null minOrderAmount/maxUses/startsAt/expiresAt as null', async () => {
    const res = await POST_Discount(
      makeJson('POST', url, {
        code: 'NULL',
        discountType: 'percent',
        amount: 10,
        minOrderAmount: null,
        maxUses: null,
        startsAt: null,
        expiresAt: null,
        description: null,
      }),
      ctx(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.minOrderAmount).toBeNull();
    expect(body.data.maxUses).toBeNull();
    expect(body.data.startsAt).toBeNull();
    expect(body.data.expiresAt).toBeNull();
    expect(body.data.description).toBeNull();
  });
});

// ===========================================================================
// 3. GET /api/portal/websites/[siteId]/store/orders
// ===========================================================================

describe('GET /api/portal/websites/[siteId]/store/orders', () => {
  const base = 'http://x/api/portal/websites/1/store/orders';
  const ctx = (siteId = '1') => ({ params: Promise.resolve({ siteId }) });

  function seedOrder(o: Partial<Record<string, unknown>>): number {
    const row = {
      id: state.nextOrderId++,
      websiteId: 10,
      status: 'pending',
      orderNumber: 'ORD-1',
      customerName: 'Anon',
      customerEmail: 'anon@example.com',
      createdAt: new Date('2026-03-01'),
      ...o,
    };
    state.orders.push(row);
    return row.id as number;
  }

  it('returns 401 with no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await GET_Orders(makeGet(base), ctx());
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await GET_Orders(makeGet(base), ctx());
    expect(res.status).toBe(401);
  });

  it('returns 404 when client site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await GET_Orders(makeGet(base), ctx());
    expect(res.status).toBe(404);
  });

  it('returns empty list with default pagination', async () => {
    const res = await GET_Orders(makeGet(base), ctx());
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

  it('returns orders scoped to the website with their items attached', async () => {
    const oid = seedOrder({
      orderNumber: 'A-1',
      customerName: 'Alice',
      customerEmail: 'a@x.com',
    });
    seedOrder({
      websiteId: 999, // different site
      orderNumber: 'X-1',
      customerName: 'Other',
      customerEmail: 'o@x.com',
    });
    state.orderItems.push({
      id: 1,
      orderId: oid,
      productName: 'Widget',
      quantity: 2,
    });
    state.orderItems.push({
      id: 2,
      orderId: oid,
      productName: 'Gadget',
      quantity: 1,
    });
    state.orderItems.push({
      id: 3,
      orderId: 9999, // unrelated order
      productName: 'Ghost',
      quantity: 1,
    });

    const res = await GET_Orders(makeGet(base), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination.total).toBe(1);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].orderNumber).toBe('A-1');
    expect(body.data[0].items).toHaveLength(2);
    expect(body.data[0].items.map((i: { productName: string }) => i.productName).sort()).toEqual(
      ['Gadget', 'Widget'],
    );
  });

  it('returns empty items array when an order has none', async () => {
    seedOrder({ orderNumber: 'EMPTY' });
    const res = await GET_Orders(makeGet(base), ctx());
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].items).toEqual([]);
  });

  it('filters by status query param', async () => {
    seedOrder({ status: 'pending', orderNumber: 'P-1' });
    seedOrder({ status: 'paid', orderNumber: 'PA-1' });
    const res = await GET_Orders(makeGet(`${base}?status=paid`), ctx());
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].orderNumber).toBe('PA-1');
  });

  it('filters by search across orderNumber/customerName/customerEmail', async () => {
    seedOrder({ orderNumber: 'AAA', customerName: 'Bob', customerEmail: 'b@x' });
    seedOrder({ orderNumber: 'BBB', customerName: 'Alice', customerEmail: 'a@x' });
    seedOrder({ orderNumber: 'CCC', customerName: 'Carol', customerEmail: 'c@special.com' });

    const byNumber = await (await GET_Orders(makeGet(`${base}?search=AAA`), ctx())).json();
    expect(byNumber.data).toHaveLength(1);
    expect(byNumber.data[0].orderNumber).toBe('AAA');

    const byName = await (await GET_Orders(makeGet(`${base}?search=alice`), ctx())).json();
    expect(byName.data).toHaveLength(1);
    expect(byName.data[0].customerName).toBe('Alice');

    const byEmail = await (
      await GET_Orders(makeGet(`${base}?search=special`), ctx())
    ).json();
    expect(byEmail.data).toHaveLength(1);
    expect(byEmail.data[0].customerEmail).toBe('c@special.com');
  });

  it('clamps page to >=1 and limit to <=100', async () => {
    const res = await GET_Orders(
      makeGet(`${base}?page=-3&limit=99999`),
      ctx(),
    );
    const body = await res.json();
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.limit).toBe(100);
  });

  it('paginates results and reports totalPages', async () => {
    for (let i = 0; i < 5; i++) {
      seedOrder({ orderNumber: `N-${i}` });
    }
    const res = await GET_Orders(makeGet(`${base}?page=2&limit=2`), ctx());
    const body = await res.json();
    expect(body.pagination).toEqual({
      page: 2,
      limit: 2,
      total: 5,
      totalPages: 3,
    });
    expect(body.data).toHaveLength(2);
  });

  it('accepts sort=oldest without erroring (sort is opaque to mock)', async () => {
    seedOrder({ orderNumber: 'ONLY' });
    const res = await GET_Orders(makeGet(`${base}?sort=oldest`), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });
});

// ===========================================================================
// 4. GET/POST /api/portal/websites/[siteId]/store/products/[productId]/options
// ===========================================================================

describe('GET /api/portal/websites/[siteId]/store/products/[productId]/options', () => {
  const url = 'http://x/api/portal/websites/1/store/products/1/options';
  const ctx = (siteId = '1', productId = '1') => ({
    params: Promise.resolve({ siteId, productId }),
  });

  it('returns 401 with no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await GET_Options(makeGet(url), ctx());
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await GET_Options(makeGet(url), ctx());
    expect(res.status).toBe(401);
  });

  it('returns 404 when site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await GET_Options(makeGet(url), ctx());
    expect(res.status).toBe(404);
  });

  it('returns 404 when the product does not belong to the site', async () => {
    state.products.push({ id: 1, websiteId: 999, name: 'Other' });
    const res = await GET_Options(makeGet(url), ctx());
    expect(res.status).toBe(404);
  });

  it('returns empty options when product has none', async () => {
    state.products.push({ id: 1, websiteId: 10, name: 'P' });
    const res = await GET_Options(makeGet(url), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: [] });
  });

  it('returns options with their values keyed by optionId', async () => {
    state.products.push({ id: 1, websiteId: 10, name: 'P' });
    state.productOptions.push({ id: 1, productId: 1, name: 'Color', order: 0 });
    state.productOptions.push({ id: 2, productId: 1, name: 'Size', order: 1 });
    state.productOptionValues.push({ id: 1, optionId: 1, value: 'red', label: 'Red', order: 0 });
    state.productOptionValues.push({ id: 2, optionId: 1, value: 'blue', label: null, order: 1 });
    state.productOptionValues.push({ id: 3, optionId: 2, value: 'L', label: null, order: 0 });
    // Unrelated option for a different product — must not appear
    state.productOptionValues.push({ id: 4, optionId: 9999, value: 'X', order: 0 });

    const res = await GET_Options(makeGet(url), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    const color = body.data.find((o: { name: string }) => o.name === 'Color');
    const size = body.data.find((o: { name: string }) => o.name === 'Size');
    expect(color.values).toHaveLength(2);
    expect(color.values.map((v: { value: string }) => v.value).sort()).toEqual([
      'blue',
      'red',
    ]);
    expect(size.values).toHaveLength(1);
    expect(size.values[0].value).toBe('L');
  });

  it('returns options with empty values array when no values exist', async () => {
    state.products.push({ id: 1, websiteId: 10, name: 'P' });
    state.productOptions.push({ id: 1, productId: 1, name: 'Material', order: 0 });
    const res = await GET_Options(makeGet(url), ctx());
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].values).toEqual([]);
  });
});

describe('POST /api/portal/websites/[siteId]/store/products/[productId]/options', () => {
  const url = 'http://x/api/portal/websites/1/store/products/1/options';
  const ctx = (siteId = '1', productId = '1') => ({
    params: Promise.resolve({ siteId, productId }),
  });

  it('returns 401 with no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await POST_Option(
      makeJson('POST', url, { name: 'Color' }),
      ctx(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await POST_Option(
      makeJson('POST', url, { name: 'Color' }),
      ctx(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await POST_Option(
      makeJson('POST', url, { name: 'Color' }),
      ctx(),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when product not under the site', async () => {
    state.products.push({ id: 1, websiteId: 999, name: 'Other' });
    const res = await POST_Option(
      makeJson('POST', url, { name: 'Color' }),
      ctx(),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when name is missing', async () => {
    state.products.push({ id: 1, websiteId: 10, name: 'P' });
    const res = await POST_Option(makeJson('POST', url, {}), ctx());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/name is required/);
  });

  it('creates a new option starting at order=0 with empty values', async () => {
    state.products.push({ id: 1, websiteId: 10, name: 'P' });
    const res = await POST_Option(
      makeJson('POST', url, { name: 'Color' }),
      ctx(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(body.data.productId).toBe(1);
    expect(body.data.name).toBe('Color');
    expect(body.data.order).toBe(0);
    expect(body.data.values).toEqual([]);
  });

  it('uses next sequential order when other options exist', async () => {
    state.products.push({ id: 1, websiteId: 10, name: 'P' });
    state.productOptions.push({ id: 1, productId: 1, name: 'Color', order: 0 });
    state.productOptions.push({ id: 2, productId: 1, name: 'Size', order: 3 });
    const res = await POST_Option(
      makeJson('POST', url, { name: 'Material' }),
      ctx(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.order).toBe(4);
  });

  it('inserts provided values with sequential order and optional labels', async () => {
    state.products.push({ id: 1, websiteId: 10, name: 'P' });
    const res = await POST_Option(
      makeJson('POST', url, {
        name: 'Color',
        values: [
          { value: 'red', label: 'Red' },
          { value: 'blue' },
        ],
      }),
      ctx(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.values).toHaveLength(2);
    expect(body.data.values[0]).toMatchObject({
      optionId: 1,
      value: 'red',
      label: 'Red',
      order: 0,
    });
    expect(body.data.values[1]).toMatchObject({
      optionId: 1,
      value: 'blue',
      label: null,
      order: 1,
    });
  });

  it('does not insert values when values is empty array', async () => {
    state.products.push({ id: 1, websiteId: 10, name: 'P' });
    const res = await POST_Option(
      makeJson('POST', url, { name: 'Color', values: [] }),
      ctx(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.values).toEqual([]);
    expect(state.productOptionValues).toHaveLength(0);
  });

  it('does not insert values when values is not an array', async () => {
    state.products.push({ id: 1, websiteId: 10, name: 'P' });
    const res = await POST_Option(
      makeJson('POST', url, { name: 'Color', values: 'nope' }),
      ctx(),
    );
    expect(res.status).toBe(201);
    expect(state.productOptionValues).toHaveLength(0);
  });
});
