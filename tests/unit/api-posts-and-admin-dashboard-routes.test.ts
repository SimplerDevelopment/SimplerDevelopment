// @vitest-environment node
/**
 * Unit tests for two unrelated routes packed into one file:
 *
 *   1. GET / POST /api/posts
 *      - Auth gate: 401 unauth, 403 wrong role, 200 for admin/editor
 *      - GET pagination + sort branches (createdAt vs publishedAt, asc/desc)
 *      - GET with published=true / published=false / no filter
 *      - GET catches db errors → 500
 *      - POST Zod validation failure → 400
 *      - POST happy path inserts post + categories + tags + custom fields
 *      - POST custom-field branches: unknown postType, no matching slugs
 *      - POST db error → 500
 *
 *   2. GET /api/admin/dashboard
 *      - 401 when no session / wrong role
 *      - happy path returns aggregated metrics shape across many tables
 *
 * All external modules (auth, db, drizzle) are mocked. The db mock uses a
 * FIFO queue keyed by the calling table so we can return predetermined rows
 * for each Promise.all branch in order.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/actions/blog', () => ({
  revalidateBlogPostsCache: vi.fn().mockResolvedValue(undefined),
}));

// ===========================================================================
// Shared schema mock
// ===========================================================================

vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          if (typeof prop === 'symbol') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    // posts route
    posts: wrap('posts'),
    postCategories: wrap('postCategories'),
    postTags: wrap('postTags'),
    postCustomFieldValues: wrap('postCustomFieldValues'),
    customFields: wrap('customFields'),
    postTypes: wrap('postTypes'),
    // admin dashboard route
    clients: wrap('clients'),
    users: wrap('users'),
    clientServices: wrap('clientServices'),
    services: wrap('services'),
    invoices: wrap('invoices'),
    supportTickets: wrap('supportTickets'),
    projects: wrap('projects'),
    clientWebsites: wrap('clientWebsites'),
    aiCreditBalances: wrap('aiCreditBalances'),
    aiConversations: wrap('aiConversations'),
    orders: wrap('orders'),
    crmDeals: wrap('crmDeals'),
    crmContacts: wrap('crmContacts'),
    crmProposals: wrap('crmProposals'),
    emailCampaigns: wrap('emailCampaigns'),
    bookingPages: wrap('bookingPages'),
    bookings: wrap('bookings'),
    automationRules: wrap('automationRules'),
    hostedSites: wrap('hostedSites'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  gte: (a: unknown, b: unknown) => ({ op: 'gte', a, b }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  desc: (col: unknown) => ({ __order: 'desc', col }),
  asc: (col: unknown) => ({ __order: 'asc', col }),
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
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ===========================================================================
// Shared auth mock
// ===========================================================================

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

// ===========================================================================
// In-memory db (FIFO queue keyed by table name)
// ===========================================================================

interface QueueEntry {
  table: string;
  rows: unknown[];
}

const selectQueue: QueueEntry[] = [];
const insertQueue: QueueEntry[] = [];

function enqueueSelect(table: string, rows: unknown[]) {
  selectQueue.push({ table, rows });
}

function dequeueSelect(table: string): unknown[] {
  const idx = selectQueue.findIndex((q) => q.table === table);
  if (idx === -1) return [];
  const [entry] = selectQueue.splice(idx, 1);
  return entry.rows;
}

function enqueueInsert(table: string, rows: unknown[]) {
  insertQueue.push({ table, rows });
}

function dequeueInsert(table: string): unknown[] {
  const idx = insertQueue.findIndex((q) => q.table === table);
  if (idx === -1) return [];
  const [entry] = insertQueue.splice(idx, 1);
  return entry.rows;
}

let selectShouldThrow: Error | null = null;
let insertShouldThrow: Error | null = null;
const insertCalls: { table: string; values: unknown }[] = [];

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let activeTable: string | null = null;
    const chain: Record<string, unknown> = {
      from(t: { __table?: string }) {
        activeTable = t?.__table ?? null;
        return chain;
      },
      innerJoin(_table: unknown, _on: unknown) {
        return chain;
      },
      leftJoin(_table: unknown, _on: unknown) {
        return chain;
      },
      where(_w: unknown) {
        return chain;
      },
      groupBy(..._args: unknown[]) {
        return chain;
      },
      orderBy(_o: unknown) {
        return chain;
      },
      limit(_n: number) {
        return chain;
      },
      offset(_n: number) {
        return chain;
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        if (selectShouldThrow) {
          return Promise.reject(selectShouldThrow).then(resolve, reject);
        }
        const rows = activeTable ? dequeueSelect(activeTable) : [];
        return Promise.resolve(rows).then(resolve, reject);
      },
    };
    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(vals: unknown) {
        insertCalls.push({ table: table.__table, values: vals });
        const finish = () => {
          if (insertShouldThrow) return Promise.reject(insertShouldThrow);
          return Promise.resolve(dequeueInsert(table.__table));
        };
        return {
          returning() {
            return finish();
          },
          then(
            resolve: (v: unknown) => unknown,
            reject?: (e: unknown) => unknown,
          ) {
            return finish().then(resolve, reject);
          },
        };
      },
    };
  }

  return {
    db: {
      select: (_projection?: unknown) => buildSelect(),
      insert: (table: { __table: string }) => buildInsert(table),
    },
  };
});

// Silence noisy logs from the route under test
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// ===========================================================================
// Modules under test
// ===========================================================================

const postsRoute = await import('@/app/api/posts/route');
const postsGET = postsRoute.GET;
const postsPOST = postsRoute.POST;

const dashboardRoute = await import('@/app/api/admin/dashboard/route');
const dashboardGET = dashboardRoute.GET;

// ===========================================================================
// Shared resets
// ===========================================================================

beforeEach(() => {
  authMock.mockReset();
  selectQueue.length = 0;
  insertQueue.length = 0;
  insertCalls.length = 0;
  selectShouldThrow = null;
  insertShouldThrow = null;
});

// ===========================================================================
// /api/posts helpers
// ===========================================================================

function makePostsGet(qs: Record<string, string> = {}): Request {
  const u = new URL('http://x/api/posts');
  for (const [k, v] of Object.entries(qs)) u.searchParams.set(k, v);
  return new Request(u.toString());
}

function makePostsPost(body: unknown): Request {
  return new Request('http://x/api/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ===========================================================================
// GET /api/posts
// ===========================================================================

describe('GET /api/posts', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    // Cast for differing NextRequest typing in route signature
    const res = await postsGET(makePostsGet() as unknown as Parameters<typeof postsGET>[0]);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await postsGET(makePostsGet() as unknown as Parameters<typeof postsGET>[0]);
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is not admin/editor', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'client' } });
    const res = await postsGET(makePostsGet() as unknown as Parameters<typeof postsGET>[0]);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });

  it('returns posts without filter (default pagination, desc createdAt)', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'admin' } });
    enqueueSelect('posts', [{ id: 1, title: 'a' }, { id: 2, title: 'b' }]);
    const res = await postsGET(makePostsGet() as unknown as Parameters<typeof postsGET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.pagination).toEqual({ limit: 10, offset: 0 });
  });

  it('filters by published=true with custom limit/offset', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'editor' } });
    enqueueSelect('posts', [{ id: 9, title: 'published' }]);
    const res = await postsGET(
      makePostsGet({
        published: 'true',
        limit: '5',
        offset: '10',
      }) as unknown as Parameters<typeof postsGET>[0],
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].id).toBe(9);
    expect(body.pagination).toEqual({ limit: 5, offset: 10 });
  });

  it('filters by published=false', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'admin' } });
    enqueueSelect('posts', [{ id: 3, title: 'draft' }]);
    const res = await postsGET(
      makePostsGet({ published: 'false' }) as unknown as Parameters<typeof postsGET>[0],
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].id).toBe(3);
  });

  it('sorts asc by publishedAt when sortBy=publishedAt&sortOrder=asc', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'admin' } });
    enqueueSelect('posts', []);
    const res = await postsGET(
      makePostsGet({ sortBy: 'publishedAt', sortOrder: 'asc' }) as unknown as Parameters<
        typeof postsGET
      >[0],
    );
    expect(res.status).toBe(200);
  });

  it('returns 500 when the db throws', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'admin' } });
    selectShouldThrow = new Error('boom');
    const res = await postsGET(makePostsGet() as unknown as Parameters<typeof postsGET>[0]);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to fetch posts');
  });
});

// ===========================================================================
// POST /api/posts
// ===========================================================================

describe('POST /api/posts', () => {
  it('returns 401 when not authenticated', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await postsPOST(
      makePostsPost({ title: 't', slug: 's', content: 'c' }) as unknown as Parameters<
        typeof postsPOST
      >[0],
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is not admin/editor', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'client' } });
    const res = await postsPOST(
      makePostsPost({ title: 't', slug: 's', content: 'c' }) as unknown as Parameters<
        typeof postsPOST
      >[0],
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 on Zod validation failure (missing title)', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'admin' } });
    const res = await postsPOST(
      makePostsPost({ slug: 's', content: 'c' }) as unknown as Parameters<
        typeof postsPOST
      >[0],
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(Array.isArray(body.details)).toBe(true);
  });

  it('inserts a minimal post and returns 201', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'admin' } });
    enqueueInsert('posts', [{ id: 500, title: 't', slug: 's' }]);
    const res = await postsPOST(
      makePostsPost({ title: 't', slug: 's', content: 'c' }) as unknown as Parameters<
        typeof postsPOST
      >[0],
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(500);
  });

  it('passes publishedAt as a Date when provided', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'admin' } });
    enqueueInsert('posts', [{ id: 501 }]);
    const res = await postsPOST(
      makePostsPost({
        title: 't',
        slug: 's',
        content: 'c',
        publishedAt: '2025-01-01T00:00:00.000Z',
      }) as unknown as Parameters<typeof postsPOST>[0],
    );
    expect(res.status).toBe(201);
    const inserted = insertCalls.find((c) => c.table === 'posts');
    expect(inserted).toBeTruthy();
    expect((inserted!.values as { publishedAt: Date }).publishedAt).toBeInstanceOf(
      Date,
    );
  });

  it('inserts categories and tags when provided', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'admin' } });
    enqueueInsert('posts', [{ id: 600 }]);
    enqueueInsert('postCategories', []);
    enqueueInsert('postTags', []);
    const res = await postsPOST(
      makePostsPost({
        title: 't',
        slug: 's',
        content: 'c',
        categoryIds: [1, 2],
        tagIds: [10, 11],
      }) as unknown as Parameters<typeof postsPOST>[0],
    );
    expect(res.status).toBe(201);
    const cats = insertCalls.find((c) => c.table === 'postCategories');
    const tags = insertCalls.find((c) => c.table === 'postTags');
    expect(cats).toBeTruthy();
    expect(tags).toBeTruthy();
    expect((cats!.values as unknown[])).toHaveLength(2);
    expect((tags!.values as unknown[])).toHaveLength(2);
  });

  it('inserts customFieldValues when postType + field slug match', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'admin' } });
    enqueueInsert('posts', [{ id: 700 }]);
    // postTypes lookup
    enqueueSelect('postTypes', [{ id: 50, slug: 'blog' }]);
    // customFields for postType
    enqueueSelect('customFields', [
      { id: 1000, slug: 'subtitle', postTypeId: 50 },
      { id: 1001, slug: 'author', postTypeId: 50 },
    ]);
    enqueueInsert('postCustomFieldValues', []);

    const res = await postsPOST(
      makePostsPost({
        title: 't',
        slug: 's',
        content: 'c',
        customFields: {
          subtitle: 'hello',
          unknown: 'ignored', // not in fieldMap → filtered
          author: '', // empty value → filtered
        },
      }) as unknown as Parameters<typeof postsPOST>[0],
    );
    expect(res.status).toBe(201);
    const cfv = insertCalls.find((c) => c.table === 'postCustomFieldValues');
    expect(cfv).toBeTruthy();
    const values = cfv!.values as Array<{ customFieldId: number; value: string }>;
    expect(values).toHaveLength(1);
    expect(values[0].customFieldId).toBe(1000);
    expect(values[0].value).toBe('hello');
  });

  it('skips customFieldValues insert when no field slugs match', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'admin' } });
    enqueueInsert('posts', [{ id: 701 }]);
    enqueueSelect('postTypes', [{ id: 51, slug: 'blog' }]);
    enqueueSelect('customFields', [{ id: 2000, slug: 'subtitle', postTypeId: 51 }]);
    const res = await postsPOST(
      makePostsPost({
        title: 't',
        slug: 's',
        content: 'c',
        customFields: { totally_unknown: 'x' },
      }) as unknown as Parameters<typeof postsPOST>[0],
    );
    expect(res.status).toBe(201);
    const cfv = insertCalls.find((c) => c.table === 'postCustomFieldValues');
    expect(cfv).toBeUndefined();
  });

  it('skips customFieldValues entirely when postType is not found', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'admin' } });
    enqueueInsert('posts', [{ id: 702 }]);
    enqueueSelect('postTypes', []); // no match
    const res = await postsPOST(
      makePostsPost({
        title: 't',
        slug: 's',
        content: 'c',
        postType: 'nonexistent',
        customFields: { foo: 'bar' },
      }) as unknown as Parameters<typeof postsPOST>[0],
    );
    expect(res.status).toBe(201);
    const cfv = insertCalls.find((c) => c.table === 'postCustomFieldValues');
    expect(cfv).toBeUndefined();
  });

  it('returns 500 when the db insert throws (non-Zod error)', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'admin' } });
    insertShouldThrow = new Error('db down');
    const res = await postsPOST(
      makePostsPost({ title: 't', slug: 's', content: 'c' }) as unknown as Parameters<
        typeof postsPOST
      >[0],
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to create post');
  });
});

// ===========================================================================
// GET /api/admin/dashboard
// ===========================================================================

describe('GET /api/admin/dashboard', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await dashboardGET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Unauthorized');
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await dashboardGET();
    expect(res.status).toBe(401);
  });

  it('returns 401 when role is not admin/employee', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '1', role: 'client' } });
    const res = await dashboardGET();
    expect(res.status).toBe(401);
  });

  it('accepts employee role and returns aggregated metrics', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'employee' } });

    // Each db.select(...).from(table) consumes one entry by table name.
    // The 19 queries (in route order) target:
    //   clients (total), clients (active), clientWebsites, clientWebsites,
    //   supportTickets, projects, invoices, clientServices, aiCreditBalances,
    //   crmDeals, crmContacts, crmProposals, emailCampaigns, bookings,
    //   automationRules, hostedSites, supportTickets (recent),
    //   invoices (recent), orders (recent).
    enqueueSelect('clients', [{ count: 10 }]);
    enqueueSelect('clients', [{ count: 7 }]);
    enqueueSelect('clientWebsites', [{ count: 5 }]);
    enqueueSelect('clientWebsites', [{ count: 4 }]);
    enqueueSelect('supportTickets', [{ count: 3 }]);
    enqueueSelect('projects', [{ count: 2 }]);
    enqueueSelect('invoices', [
      { outstanding: 1500, collected: 8000, overdueCount: 1, totalCount: 9 },
    ]);
    enqueueSelect('clientServices', [{ activeCount: 4, mrr: 999 }]);
    enqueueSelect('aiCreditBalances', [
      { totalBalance: 100, totalMonthlyGrant: 500 },
    ]);
    enqueueSelect('crmDeals', [
      { openCount: 2, wonCount: 3, totalValue: 5000, wonValue: 12000 },
    ]);
    enqueueSelect('crmContacts', [{ count: 42 }]);
    enqueueSelect('crmProposals', [
      { draftCount: 1, sentCount: 2, acceptedCount: 1 },
    ]);
    enqueueSelect('emailCampaigns', [{ count: 6 }]);
    enqueueSelect('bookings', [{ pageCount: 2, upcomingCount: 3 }]);
    enqueueSelect('automationRules', [{ count: 4 }]);
    enqueueSelect('hostedSites', [{ count: 11 }]);
    enqueueSelect('supportTickets', [
      { id: 1, number: 'T1', subject: 's', status: 'open', priority: 'low' },
    ]);
    enqueueSelect('invoices', [
      { id: 2, number: 'INV2', status: 'paid', total: 100 },
    ]);
    enqueueSelect('orders', [
      { id: 3, orderNumber: 'O3', customerName: 'a', total: 50, status: 'new' },
    ]);

    const res = await dashboardGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.clients).toEqual({ total: 10, active: 7 });
    expect(body.data.websites).toEqual({ total: 5, active: 4 });
    expect(body.data.tickets).toEqual({ open: 3 });
    expect(body.data.projects).toEqual({ active: 2 });
    expect(body.data.invoices).toEqual({
      outstanding: 1500,
      collected: 8000,
      overdueCount: 1,
      totalCount: 9,
    });
    expect(body.data.subscriptions).toEqual({ active: 4, mrr: 999 });
    expect(body.data.aiCredits).toEqual({
      totalBalance: 100,
      totalMonthlyGrant: 500,
    });
    expect(body.data.deals).toEqual({
      open: 2,
      won: 3,
      pipelineValue: 5000,
      wonValue: 12000,
    });
    expect(body.data.contacts).toBe(42);
    expect(body.data.proposals).toEqual({ draft: 1, sent: 2, accepted: 1 });
    expect(body.data.campaigns).toBe(6);
    expect(body.data.bookings).toEqual({ pages: 2, upcoming: 3 });
    expect(body.data.automations).toBe(4);
    expect(body.data.hostedSites).toBe(11);
    expect(body.data.recent.tickets).toHaveLength(1);
    expect(body.data.recent.invoices).toHaveLength(1);
    expect(body.data.recent.orders).toHaveLength(1);
  });

  it('falls back to 0 for bookings when bookingStats row is missing', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'admin' } });

    enqueueSelect('clients', [{ count: 0 }]);
    enqueueSelect('clients', [{ count: 0 }]);
    enqueueSelect('clientWebsites', [{ count: 0 }]);
    enqueueSelect('clientWebsites', [{ count: 0 }]);
    enqueueSelect('supportTickets', [{ count: 0 }]);
    enqueueSelect('projects', [{ count: 0 }]);
    enqueueSelect('invoices', [
      { outstanding: 0, collected: 0, overdueCount: 0, count: 0 },
    ]);
    enqueueSelect('clientServices', [{ activeCount: 0, mrr: 0 }]);
    enqueueSelect('aiCreditBalances', [{ totalBalance: 0, totalMonthlyGrant: 0 }]);
    enqueueSelect('crmDeals', [
      { openCount: 0, wonCount: 0, totalValue: 0, wonValue: 0 },
    ]);
    enqueueSelect('crmContacts', [{ count: 0 }]);
    enqueueSelect('crmProposals', [
      { draftCount: 0, sentCount: 0, acceptedCount: 0 },
    ]);
    enqueueSelect('emailCampaigns', [{ count: 0 }]);
    // No row for bookings → exercises the ?? 0 fallback
    enqueueSelect('bookings', []);
    enqueueSelect('automationRules', [{ count: 0 }]);
    enqueueSelect('hostedSites', [{ count: 0 }]);
    enqueueSelect('supportTickets', []);
    enqueueSelect('invoices', []);
    enqueueSelect('orders', []);

    const res = await dashboardGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.bookings).toEqual({ pages: 0, upcoming: 0 });
  });
});
