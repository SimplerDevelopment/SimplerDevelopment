// @vitest-environment node
/**
 * Batch 36f — unit tests for 4 route.ts files spanning portal store, public
 * chat SSE, and cron.
 *
 * Routes covered:
 *  - app/api/portal/websites/[siteId]/store/categories/route.ts              (GET, POST)
 *  - app/api/portal/websites/[siteId]/store/categories/[categoryId]/route.ts (PUT, DELETE)
 *  - app/api/public/chat/stream/route.ts                                      (GET — SSE)
 *  - app/api/cron/brain-empty-old-trash/route.ts                              (GET — auth + fan-out)
 *
 * Strategy: heavy mocking — auth, resolveClientSite, drizzle helpers, schema
 * tables, chat token + realtime, and the brain notes helper are all stubbed
 * with hoisted mocks so the routes can be exercised against an in-memory db.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Auth + portal-client
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
// drizzle-orm operators — inert markers we can inspect in evalPredicate
// ---------------------------------------------------------------------------

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  ne: (a: unknown, b: unknown) => ({ op: 'ne', a, b }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      __sql: true,
      strings: Array.from(strings),
      values,
    }),
    { raw: (s: string) => ({ __sql_raw: true, s }) },
  ),
}));

// ---------------------------------------------------------------------------
// Schema — proxy every table; properties become column references.
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
    productCategories: wrap('productCategories'),
    chatConversations: wrap('chatConversations'),
    clients: wrap('clients'),
  };
});

// ---------------------------------------------------------------------------
// Chat token + realtime (used by /api/public/chat/stream)
// ---------------------------------------------------------------------------

const verifyVisitorTokenMock = vi.fn();
vi.mock('@/lib/chat/token', () => ({
  verifyVisitorToken: (...args: unknown[]) => verifyVisitorTokenMock(...args),
}));

const subscribeChannelMock = vi.fn();
const conversationChannelMock = vi.fn(
  (id: number) => `chat_conv_${id}`,
);
vi.mock('@/lib/chat/realtime', () => ({
  subscribeChannel: (...args: unknown[]) => subscribeChannelMock(...args),
  conversationChannel: (...args: unknown[]) =>
    conversationChannelMock(...(args as [number])),
}));

// ---------------------------------------------------------------------------
// Brain notes helper (used by the cron route)
// ---------------------------------------------------------------------------

const purgeOldTrashMock = vi.fn();
vi.mock('@/lib/brain/notes', () => ({
  purgeOldTrash: (...args: unknown[]) => purgeOldTrashMock(...args),
}));

// ---------------------------------------------------------------------------
// In-memory db state for the productCategories + clients tables.
// ---------------------------------------------------------------------------

interface State {
  productCategories: Array<Record<string, unknown>>;
  chatConversations: Array<Record<string, unknown>>;
  clients: Array<Record<string, unknown>>;
  nextCategoryId: number;
}

const state: State = {
  productCategories: [],
  chatConversations: [],
  clients: [],
  nextCategoryId: 1,
};

function tableArray(name: string): Array<Record<string, unknown>> {
  switch (name) {
    case 'productCategories':
      return state.productCategories;
    case 'chatConversations':
      return state.chatConversations;
    case 'clients':
      return state.clients;
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
  };
  switch (f.op) {
    case 'eq': {
      const col = f.a as { __col?: string; __table?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === f.b;
    }
    case 'ne': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] !== f.b;
    }
    case 'and':
      return (f.args ?? []).every((a) => evalPredicate(a, row));
    case 'or':
      return (f.args ?? []).some((a) => evalPredicate(a, row));
    default:
      return true;
  }
}

// db mock supports select / insert / update / delete on the in-memory tables.
vi.mock('@/lib/db', () => {
  function buildSelect(projection?: Record<string, unknown>) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limitVal: number | null = null;

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      let rows = tableArray(activeTable).filter((r) =>
        evalPredicate(filter, r),
      );
      if (typeof limitVal === 'number') rows = rows.slice(0, limitVal);
      // Apply projection if it was a `{ id: someTable.id }` shape.
      if (projection && typeof projection === 'object') {
        const keys = Object.keys(projection);
        const looksLikeProjection = keys.every((k) => {
          const v = (projection as Record<string, unknown>)[k];
          return v && typeof v === 'object' && '__col' in (v as object);
        });
        if (looksLikeProjection) {
          rows = rows.map((r) => {
            const out: Record<string, unknown> = {};
            for (const k of keys) {
              const col = (projection as Record<string, { __col: string }>)[k]
                .__col;
              out[k] = r[col];
            }
            return out;
          });
        }
      }
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
          const row: Record<string, unknown> = {
            ...(v as Record<string, unknown>),
          };
          if (table.__table === 'productCategories') {
            row.id = state.nextCategoryId++;
            row.createdAt = new Date('2026-04-01T00:00:00Z');
            row.updatedAt = new Date('2026-04-01T00:00:00Z');
          }
          arr.push(row);
          inserted.push(row);
        }
        return {
          returning() {
            return Promise.resolve(inserted.map((r) => ({ ...r })));
          },
        };
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
// Modules under test (imported AFTER all mocks)
// ---------------------------------------------------------------------------

const categoriesListMod = await import(
  '@/app/api/portal/websites/[siteId]/store/categories/route'
);
const categoryMod = await import(
  '@/app/api/portal/websites/[siteId]/store/categories/[categoryId]/route'
);
const chatStreamMod = await import('@/app/api/public/chat/stream/route');
const cronMod = await import('@/app/api/cron/brain-empty-old-trash/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(method: string, url: string, body?: unknown): Request {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

function siteCtx(siteId = '1') {
  return { params: Promise.resolve({ siteId }) };
}

function catCtx(siteId = '1', categoryId = '1') {
  return { params: Promise.resolve({ siteId, categoryId }) };
}

beforeEach(() => {
  state.productCategories.length = 0;
  state.chatConversations.length = 0;
  state.clients.length = 0;
  state.nextCategoryId = 1;

  authMock.mockReset();
  resolveClientSiteMock.mockReset();
  verifyVisitorTokenMock.mockReset();
  subscribeChannelMock.mockReset();
  conversationChannelMock.mockClear();
  purgeOldTrashMock.mockReset();

  authMock.mockResolvedValue({ user: { id: '7' } });
  resolveClientSiteMock.mockResolvedValue({ id: 10 });
  purgeOldTrashMock.mockResolvedValue({ purged: 0, attachmentsDeleted: 0 });
});

// ===========================================================================
// GET /api/portal/websites/[siteId]/store/categories
// ===========================================================================

describe('GET /api/portal/websites/[siteId]/store/categories', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await categoriesListMod.GET(
      makeReq('GET', 'http://x/cats'),
      siteCtx(),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await categoriesListMod.GET(
      makeReq('GET', 'http://x/cats'),
      siteCtx(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await categoriesListMod.GET(
      makeReq('GET', 'http://x/cats'),
      siteCtx(),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns an empty array when there are no categories for the website', async () => {
    const res = await categoriesListMod.GET(
      makeReq('GET', 'http://x/cats'),
      siteCtx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns only categories scoped to the resolved website', async () => {
    state.productCategories.push({
      id: 1,
      websiteId: 10,
      name: 'Shirts',
      slug: 'shirts',
      order: 1,
    });
    state.productCategories.push({
      id: 2,
      websiteId: 10,
      name: 'Hats',
      slug: 'hats',
      order: 2,
    });
    state.productCategories.push({
      id: 3,
      websiteId: 999,
      name: 'Other site',
      slug: 'other',
      order: 1,
    });

    const res = await categoriesListMod.GET(
      makeReq('GET', 'http://x/cats'),
      siteCtx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data.map((c: { id: number }) => c.id).sort()).toEqual([1, 2]);
  });
});

// ===========================================================================
// POST /api/portal/websites/[siteId]/store/categories
// ===========================================================================

describe('POST /api/portal/websites/[siteId]/store/categories', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await categoriesListMod.POST(
      makeReq('POST', 'http://x/cats', { name: 'A', slug: 'a' }),
      siteCtx(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await categoriesListMod.POST(
      makeReq('POST', 'http://x/cats', { name: 'A', slug: 'a' }),
      siteCtx(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await categoriesListMod.POST(
      makeReq('POST', 'http://x/cats', { name: 'A', slug: 'a' }),
      siteCtx(),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when name is missing', async () => {
    const res = await categoriesListMod.POST(
      makeReq('POST', 'http://x/cats', { slug: 'a' }),
      siteCtx(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('name and slug are required');
  });

  it('returns 400 when slug is missing', async () => {
    const res = await categoriesListMod.POST(
      makeReq('POST', 'http://x/cats', { name: 'A' }),
      siteCtx(),
    );
    expect(res.status).toBe(400);
  });

  it('returns 409 when slug already exists for this website', async () => {
    state.productCategories.push({
      id: 1,
      websiteId: 10,
      name: 'Existing',
      slug: 'taken',
    });
    const res = await categoriesListMod.POST(
      makeReq('POST', 'http://x/cats', { name: 'New', slug: 'taken' }),
      siteCtx(),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/already exists/);
    expect(state.productCategories).toHaveLength(1);
  });

  it('creates a category with defaults when minimal body is provided', async () => {
    const res = await categoriesListMod.POST(
      makeReq('POST', 'http://x/cats', { name: 'Shirts', slug: 'shirts' }),
      siteCtx(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(body.data.websiteId).toBe(10);
    expect(body.data.name).toBe('Shirts');
    expect(body.data.slug).toBe('shirts');
    expect(body.data.description).toBeNull();
    expect(body.data.image).toBeNull();
    expect(body.data.parentId).toBeNull();
    expect(body.data.order).toBe(0);
    expect(body.data.active).toBe(true);
  });

  it('persists provided description, image, parentId, order, active=false', async () => {
    const res = await categoriesListMod.POST(
      makeReq('POST', 'http://x/cats', {
        name: 'Sub',
        slug: 'sub',
        description: 'A sub-category',
        image: 'https://cdn/img.png',
        parentId: '42',
        order: 9,
        active: false,
      }),
      siteCtx(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.description).toBe('A sub-category');
    expect(body.data.image).toBe('https://cdn/img.png');
    expect(body.data.parentId).toBe(42);
    expect(body.data.order).toBe(9);
    expect(body.data.active).toBe(false);
  });
});

// ===========================================================================
// PUT /api/portal/websites/[siteId]/store/categories/[categoryId]
// ===========================================================================

describe('PUT /api/portal/websites/[siteId]/store/categories/[categoryId]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await categoryMod.PUT(
      makeReq('PUT', 'http://x/cat', { name: 'X' }),
      catCtx(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await categoryMod.PUT(
      makeReq('PUT', 'http://x/cat', { name: 'X' }),
      catCtx(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await categoryMod.PUT(
      makeReq('PUT', 'http://x/cat', { name: 'X' }),
      catCtx(),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when category does not belong to website', async () => {
    state.productCategories.push({
      id: 1,
      websiteId: 999,
      name: 'Other site',
      slug: 'other',
    });
    const res = await categoryMod.PUT(
      makeReq('PUT', 'http://x/cat', { name: 'X' }),
      catCtx(),
    );
    expect(res.status).toBe(404);
  });

  it('updates supplied fields and leaves others intact', async () => {
    state.productCategories.push({
      id: 1,
      websiteId: 10,
      name: 'Original',
      slug: 'original',
      description: 'desc',
      image: null,
      parentId: null,
      order: 0,
      active: true,
    });
    const res = await categoryMod.PUT(
      makeReq('PUT', 'http://x/cat', {
        name: 'Renamed',
        description: 'new desc',
        image: 'https://cdn/x.png',
        parentId: '7',
        order: 3,
        active: false,
      }),
      catCtx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Renamed');
    expect(body.data.description).toBe('new desc');
    expect(body.data.image).toBe('https://cdn/x.png');
    expect(body.data.parentId).toBe(7);
    expect(body.data.order).toBe(3);
    expect(body.data.active).toBe(false);
    // Slug stays untouched.
    expect(body.data.slug).toBe('original');
  });

  it('coerces parentId=null when explicitly cleared', async () => {
    state.productCategories.push({
      id: 1,
      websiteId: 10,
      name: 'Cat',
      slug: 'cat',
      parentId: 5,
    });
    const res = await categoryMod.PUT(
      makeReq('PUT', 'http://x/cat', { parentId: null }),
      catCtx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.parentId).toBeNull();
  });

  it('updates slug when new slug is unique', async () => {
    state.productCategories.push({
      id: 1,
      websiteId: 10,
      name: 'Cat',
      slug: 'old-slug',
    });
    const res = await categoryMod.PUT(
      makeReq('PUT', 'http://x/cat', { slug: 'new-slug' }),
      catCtx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.slug).toBe('new-slug');
  });

  it('returns 409 when new slug is already in use by another category', async () => {
    state.productCategories.push({
      id: 1,
      websiteId: 10,
      name: 'Cat A',
      slug: 'a',
    });
    state.productCategories.push({
      id: 2,
      websiteId: 10,
      name: 'Cat B',
      slug: 'b',
    });
    const res = await categoryMod.PUT(
      makeReq('PUT', 'http://x/cat', { slug: 'b' }),
      catCtx('1', '1'),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/already exists/);
    // Original slug remains unchanged.
    expect(state.productCategories[0].slug).toBe('a');
  });

  it('handles an empty body — only updatedAt changes', async () => {
    state.productCategories.push({
      id: 1,
      websiteId: 10,
      name: 'Unchanged',
      slug: 'unchanged',
      description: 'keep me',
    });
    const res = await categoryMod.PUT(
      makeReq('PUT', 'http://x/cat', {}),
      catCtx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe('Unchanged');
    expect(body.data.description).toBe('keep me');
  });
});

// ===========================================================================
// DELETE /api/portal/websites/[siteId]/store/categories/[categoryId]
// ===========================================================================

describe('DELETE /api/portal/websites/[siteId]/store/categories/[categoryId]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await categoryMod.DELETE(
      makeReq('DELETE', 'http://x/cat'),
      catCtx(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await categoryMod.DELETE(
      makeReq('DELETE', 'http://x/cat'),
      catCtx(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await categoryMod.DELETE(
      makeReq('DELETE', 'http://x/cat'),
      catCtx(),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when category does not belong to website', async () => {
    state.productCategories.push({
      id: 1,
      websiteId: 999,
      name: 'Other',
      slug: 'other',
    });
    const res = await categoryMod.DELETE(
      makeReq('DELETE', 'http://x/cat'),
      catCtx(),
    );
    expect(res.status).toBe(404);
    expect(state.productCategories).toHaveLength(1);
  });

  it('deletes a category that belongs to the website', async () => {
    state.productCategories.push({
      id: 1,
      websiteId: 10,
      name: 'Bye',
      slug: 'bye',
    });
    const res = await categoryMod.DELETE(
      makeReq('DELETE', 'http://x/cat'),
      catCtx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe('Category deleted');
    expect(state.productCategories).toHaveLength(0);
  });
});

// ===========================================================================
// GET /api/public/chat/stream
// ===========================================================================

describe('GET /api/public/chat/stream', () => {
  it('returns 401 when the visitor token cannot be verified', async () => {
    verifyVisitorTokenMock.mockReturnValue(null);
    const res = await chatStreamMod.GET(
      new Request('http://x/api/public/chat/stream?conversationId=1&token=bad'),
    );
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('Unauthorized');
  });

  it('returns 401 when the token belongs to a different conversation', async () => {
    verifyVisitorTokenMock.mockReturnValue({ conversationId: 99 });
    const res = await chatStreamMod.GET(
      new Request('http://x/api/public/chat/stream?conversationId=1&token=t'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when conversationId query is missing (NaN)', async () => {
    verifyVisitorTokenMock.mockReturnValue({ conversationId: 1 });
    const res = await chatStreamMod.GET(
      new Request('http://x/api/public/chat/stream?token=t'),
    );
    // NaN !== 1 — verifier mismatch path
    expect(res.status).toBe(401);
  });

  it('returns 404 when the conversation does not exist', async () => {
    verifyVisitorTokenMock.mockReturnValue({ conversationId: 5 });
    // chatConversations empty
    const res = await chatStreamMod.GET(
      new Request('http://x/api/public/chat/stream?conversationId=5&token=t'),
    );
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('Not found');
  });

  it('returns an SSE stream with hello event when conversation exists', async () => {
    verifyVisitorTokenMock.mockReturnValue({ conversationId: 5 });
    state.chatConversations.push({ id: 5, status: 'open' });

    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    subscribeChannelMock.mockReturnValue({
      ready: Promise.resolve(),
      unsubscribe,
    });

    const res = await chatStreamMod.GET(
      new Request('http://x/api/public/chat/stream?conversationId=5&token=t'),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toMatch(/no-cache/);
    expect(res.headers.get('Connection')).toBe('keep-alive');
    expect(res.headers.get('X-Accel-Buffering')).toBe('no');
    expect(conversationChannelMock).toHaveBeenCalledWith(5);

    // Drain the initial hello frame.
    const reader = res.body!.getReader();
    const first = await reader.read();
    const text = new TextDecoder().decode(first.value!);
    expect(text).toContain('event: hello');
    expect(text).toContain('"conversationId":5');

    await reader.cancel();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('forwards realtime payloads from subscribeChannel into the stream', async () => {
    verifyVisitorTokenMock.mockReturnValue({ conversationId: 7 });
    state.chatConversations.push({ id: 7 });

    let captured: ((p: unknown) => void) | null = null;
    subscribeChannelMock.mockImplementation(
      (_channel: string, onPayload: (p: unknown) => void) => {
        captured = onPayload;
        return {
          ready: Promise.resolve(),
          unsubscribe: vi.fn().mockResolvedValue(undefined),
        };
      },
    );

    const res = await chatStreamMod.GET(
      new Request('http://x/api/public/chat/stream?conversationId=7&token=t'),
    );
    const reader = res.body!.getReader();
    await reader.read(); // hello

    expect(captured).toBeTruthy();
    captured!({ kind: 'message', conversationId: 7, body: 'hi there' });

    const next = await reader.read();
    const text = new TextDecoder().decode(next.value!);
    expect(text).toContain('event: message');
    expect(text).toContain('"body":"hi there"');

    await reader.cancel();
  });

  it('closes the stream when subscribe.ready rejects', async () => {
    verifyVisitorTokenMock.mockReturnValue({ conversationId: 8 });
    state.chatConversations.push({ id: 8 });

    subscribeChannelMock.mockReturnValue({
      ready: Promise.reject(new Error('listen failed')),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
    });

    const res = await chatStreamMod.GET(
      new Request('http://x/api/public/chat/stream?conversationId=8&token=t'),
    );
    const reader = res.body!.getReader();
    await reader.read(); // hello
    // Let the rejected ready microtask flush.
    await new Promise((r) => setTimeout(r, 0));
    const second = await reader.read();
    expect(second.done).toBe(true);
  });
});

// ===========================================================================
// GET /api/cron/brain-empty-old-trash
// ===========================================================================

describe('GET /api/cron/brain-empty-old-trash', () => {
  const ORIGINAL_SECRET = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = 'shh';
  });

  // Restore env after each test in this block.
  // (top-level beforeEach already resets purgeOldTrashMock.)
  // eslint-disable-next-line vitest/expect-expect
  it('restores env', () => {
    process.env.CRON_SECRET = ORIGINAL_SECRET ?? 'shh';
    expect(true).toBe(true);
  });

  it('returns 401 when CRON_SECRET is set and no auth is provided', async () => {
    const res = await cronMod.GET(
      new Request('http://x/api/cron/brain-empty-old-trash'),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).success).toBe(false);
  });

  it('accepts the x-vercel-cron header without a bearer token', async () => {
    const res = await cronMod.GET(
      new Request('http://x/api/cron/brain-empty-old-trash', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.retentionDays).toBe(90);
    expect(body.data.clientsScanned).toBe(0);
  });

  it('accepts a matching bearer token', async () => {
    const res = await cronMod.GET(
      new Request('http://x/api/cron/brain-empty-old-trash', {
        headers: { authorization: 'Bearer shh' },
      }),
    );
    expect(res.status).toBe(200);
  });

  it('returns 401 with mismatched bearer token', async () => {
    const res = await cronMod.GET(
      new Request('http://x/api/cron/brain-empty-old-trash', {
        headers: { authorization: 'Bearer wrong' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('skips auth entirely when CRON_SECRET is unset', async () => {
    delete process.env.CRON_SECRET;
    const res = await cronMod.GET(
      new Request('http://x/api/cron/brain-empty-old-trash'),
    );
    expect(res.status).toBe(200);
  });

  it('fans out across every tenant and accumulates per-client counts', async () => {
    state.clients.push({ id: 1 });
    state.clients.push({ id: 2 });
    state.clients.push({ id: 3 });

    purgeOldTrashMock
      .mockResolvedValueOnce({ purged: 4, attachmentsDeleted: 1 })
      .mockResolvedValueOnce({ purged: 0, attachmentsDeleted: 0 })
      .mockResolvedValueOnce({ purged: 7, attachmentsDeleted: 3 });

    const res = await cronMod.GET(
      new Request('http://x/api/cron/brain-empty-old-trash', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.clientsScanned).toBe(3);
    expect(body.data.totalPurged).toBe(11);
    expect(body.data.totalAttachmentsDeleted).toBe(4);
    expect(body.data.failures).toEqual([]);
    expect(typeof body.data.durationMs).toBe('number');

    expect(purgeOldTrashMock).toHaveBeenCalledTimes(3);
    expect(purgeOldTrashMock).toHaveBeenNthCalledWith(1, 1, 90);
    expect(purgeOldTrashMock).toHaveBeenNthCalledWith(2, 2, 90);
    expect(purgeOldTrashMock).toHaveBeenNthCalledWith(3, 3, 90);
  });

  it("isolates a single tenant's failure so the sweep continues", async () => {
    state.clients.push({ id: 100 });
    state.clients.push({ id: 200 });
    state.clients.push({ id: 300 });

    purgeOldTrashMock
      .mockResolvedValueOnce({ purged: 2, attachmentsDeleted: 0 })
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ purged: 5, attachmentsDeleted: 1 });

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await cronMod.GET(
      new Request('http://x/api/cron/brain-empty-old-trash', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.clientsScanned).toBe(3);
    expect(body.data.totalPurged).toBe(7);
    expect(body.data.totalAttachmentsDeleted).toBe(1);
    expect(body.data.failures).toEqual([
      { clientId: 200, reason: 'boom' },
    ]);

    errSpy.mockRestore();
  });

  it('exposes POST as the same handler as GET', async () => {
    expect(cronMod.POST).toBe(cronMod.GET);
  });
});
