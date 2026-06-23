// @vitest-environment node
/**
 * Unit tests for two CRM API routes:
 *
 *  - app/api/portal/crm/proposals/[id]/route.ts  (GET / PUT / DELETE)
 *  - app/api/portal/crm/analytics/route.ts       (GET)
 *
 * Both routes share the same external surface — `@/lib/auth`,
 * `@/lib/portal-client`, `@/lib/db`, drizzle helpers — so we mock that
 * surface ONCE at the top of the file and then exercise each route inside
 * its own describe block.
 *
 * The DB mock is a programmable queue: each call to `db.select().…` /
 * `db.update().…` / `db.delete().…` / `db.execute(...)` returns whatever
 * the test queued via the helper arrays. This is sufficient for the simple
 * chains both routes use.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock collaborators (vi.mock is hoisted above the route imports)
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

// ---- schema — wrap so column refs round-trip safely through our DB mock ---
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
  return new Proxy({
    crmProposals: wrap('crmProposals'),
    crmContacts: wrap('crmContacts'),
    crmCompanies: wrap('crmCompanies'),
    crmDeals: wrap('crmDeals'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  // The analytics route imports `sql` and uses it as a tagged template — we
  // capture the raw template fragments + values so tests can inspect intent
  // if needed (but most tests just rely on db.execute mocking).
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    __sql: true,
    strings: Array.from(strings),
    values,
  }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ---- DB mock — programmable per-test ---------------------------------------

const selectQueue: Array<Array<Record<string, unknown>>> = [];
const updateQueue: Array<Array<Record<string, unknown>>> = [];
const deleteQueue: Array<Array<Record<string, unknown>>> = [];
const executeQueue: Array<Array<Record<string, unknown>>> = [];

vi.mock('@/lib/db', () => {
  function buildSelect() {
    const chain: Record<string, unknown> = {
      from() {
        return chain;
      },
      leftJoin() {
        return chain;
      },
      where() {
        return Promise.resolve(selectQueue.shift() ?? []);
      },
      limit() {
        return Promise.resolve(selectQueue.shift() ?? []);
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled, onRejected);
      },
    };
    return chain;
  }

  function buildUpdate() {
    return {
      set() {
        return {
          where() {
            return {
              returning() {
                return Promise.resolve(updateQueue.shift() ?? []);
              },
            };
          },
        };
      },
    };
  }

  function buildDelete() {
    return {
      where() {
        return {
          returning() {
            return Promise.resolve(deleteQueue.shift() ?? []);
          },
        };
      },
    };
  }

  return {
    db: {
      select() {
        return {
          from(table: { __table: string }) {
            return buildSelect().from(table);
          },
        };
      },
      update() {
        return buildUpdate();
      },
      delete() {
        return buildDelete();
      },
      execute() {
        // Queue may be pre-loaded with results, or with an Error sentinel to
        // simulate a thrown SQL failure (used by the analytics 500 path).
        const next = executeQueue.shift();
        if (next instanceof Error) {
          return Promise.reject(next);
        }
        return Promise.resolve(next ?? []);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Modules under test (dynamic imports AFTER mocks)
// ---------------------------------------------------------------------------

const proposalsRoute = await import('@/app/api/portal/crm/proposals/[id]/route');
const analyticsRoute = await import('@/app/api/portal/crm/analytics/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makePutRequest(body: unknown): Request {
  return new Request('http://localhost/api/portal/crm/proposals/1', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue.length = 0;
  updateQueue.length = 0;
  deleteQueue.length = 0;
  executeQueue.length = 0;
});

// ===========================================================================
// proposals/[id] — GET
// ===========================================================================

describe('GET /api/portal/crm/proposals/[id]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await proposalsRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Unauthorized');
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await proposalsRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await proposalsRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns 400 for a non-numeric id', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await proposalsRoute.GET(new Request('http://x'), makeParams('not-a-number'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid ID');
  });

  it('returns 404 when the proposal is not found', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([]); // proposal lookup empty
    const res = await proposalsRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Proposal not found');
  });

  it('returns the joined proposal on success', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([
      {
        id: 1,
        clientId: 10,
        title: 'Proposal A',
        status: 'draft',
        contactFirstName: 'Jane',
        contactLastName: 'Doe',
        contactEmail: 'jane@example.com',
        companyName: 'Acme',
        dealTitle: 'Big Deal',
      },
    ]);
    const res = await proposalsRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(body.data.title).toBe('Proposal A');
    expect(body.data.contactEmail).toBe('jane@example.com');
    expect(body.data.companyName).toBe('Acme');
  });
});

// ===========================================================================
// proposals/[id] — PUT
// ===========================================================================

describe('PUT /api/portal/crm/proposals/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await proposalsRoute.PUT(makePutRequest({ title: 'x' }), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await proposalsRoute.PUT(makePutRequest({ title: 'x' }), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid id', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await proposalsRoute.PUT(makePutRequest({ title: 'x' }), makeParams('abc'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid ID');
  });

  it('returns 404 when the existing proposal is missing', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([]); // existing lookup empty
    const res = await proposalsRoute.PUT(makePutRequest({ title: 'x' }), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Proposal not found');
  });

  it('updates a proposal and returns the updated row (broad field coverage)', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1 }]); // existing
    updateQueue.push([
      {
        id: 1,
        title: 'Trimmed Title',
        summary: 'Summary text',
        sections: [{ heading: 'Scope' }],
        lineItems: [{ description: 'Item', qty: 1, price: '100' }],
        fees: { setup: 50 },
        currency: 'USD',
        validUntil: new Date('2026-12-31'),
        accentColor: '#123456',
        logoUrl: 'https://example.com/logo.png',
        coverImageUrl: 'https://example.com/cover.png',
        footerText: 'Footer text',
        contactId: 300,
        companyId: 400,
        dealId: 500,
      },
    ]);

    const res = await proposalsRoute.PUT(
      makePutRequest({
        title: '  Trimmed Title  ',
        summary: '  Summary text  ',
        sections: [{ heading: 'Scope' }],
        lineItems: [{ description: 'Item', qty: 1, price: '100' }],
        fees: { setup: 50 },
        contactId: 300,
        companyId: 400,
        dealId: 500,
        currency: 'USD',
        validUntil: '2026-12-31',
        accentColor: '#123456',
        logoUrl: 'https://example.com/logo.png',
        coverImageUrl: 'https://example.com/cover.png',
        footerText: '  Footer text  ',
      }),
      makeParams('1'),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(body.data.title).toBe('Trimmed Title');
  });

  it('treats blank optional string fields as null (summary, logoUrl, coverImageUrl, footerText)', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1 }]);
    updateQueue.push([
      {
        id: 1,
        summary: null,
        logoUrl: null,
        coverImageUrl: null,
        footerText: null,
        contactId: null,
        companyId: null,
        dealId: null,
        validUntil: null,
      },
    ]);

    const res = await proposalsRoute.PUT(
      makePutRequest({
        summary: '   ',
        logoUrl: '',
        coverImageUrl: '',
        footerText: '   ',
        contactId: 0,
        companyId: 0,
        dealId: 0,
        validUntil: '',
      }),
      makeParams('1'),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.summary).toBeNull();
    expect(body.data.logoUrl).toBeNull();
    expect(body.data.coverImageUrl).toBeNull();
    expect(body.data.footerText).toBeNull();
    expect(body.data.contactId).toBeNull();
    expect(body.data.companyId).toBeNull();
    expect(body.data.dealId).toBeNull();
    expect(body.data.validUntil).toBeNull();
  });

  it('ignores undefined fields (touches only updatedAt)', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1 }]);
    updateQueue.push([{ id: 1 }]);
    const res = await proposalsRoute.PUT(makePutRequest({}), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
  });
});

// ===========================================================================
// proposals/[id] — DELETE
// ===========================================================================

describe('DELETE /api/portal/crm/proposals/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await proposalsRoute.DELETE(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await proposalsRoute.DELETE(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid id', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await proposalsRoute.DELETE(new Request('http://x'), makeParams('xyz'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when there is nothing to delete', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    deleteQueue.push([]);
    const res = await proposalsRoute.DELETE(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Proposal not found');
  });

  it('deletes the proposal and returns it on success', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    deleteQueue.push([{ id: 1, title: 'Bye Proposal' }]);
    const res = await proposalsRoute.DELETE(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(body.data.title).toBe('Bye Proposal');
  });
});

// ===========================================================================
// analytics — GET
// ===========================================================================

describe('GET /api/portal/crm/analytics', () => {
  function makeReq(qs = ''): import('next/server').NextRequest {
    const url = `http://localhost/api/portal/crm/analytics${qs}`;
    // Cast — only `.url` is exercised by the route.
    return new Request(url) as unknown as import('next/server').NextRequest;
  }

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await analyticsRoute.GET(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toBe('Unauthorized');
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await analyticsRoute.GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await analyticsRoute.GET(makeReq());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns aggregated analytics on the happy path (default period, no pipelineId — resolves default pipeline)', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });

    // Order of db.execute() calls inside the route:
    // 1) winLoss
    // 2) revenueByMonth
    // 3) defaultPipeline lookup (because pipelineId was not supplied)
    // 4) pipelineFunnel (because we returned a pipeline id above)
    // 5) velocity
    // 6) activitySummary
    // 7) mrr
    // 8) topDeals
    executeQueue.push([{ won: 5, lost: 2, open: 3 }]);
    executeQueue.push([{ month: '2026-01', won_value: '5000', won_count: 2 }]);
    executeQueue.push([{ id: 99 }]); // default pipeline
    executeQueue.push([
      { stage_name: 'Discovery', color: '#aaa', sort_order: 0, deal_count: 4, total_value: '1000' },
      { stage_name: 'Closing', color: '#bbb', sort_order: 1, deal_count: 1, total_value: '5000' },
    ]);
    executeQueue.push([{ avg_days_to_close: 42.6 }]);
    executeQueue.push([
      { type: 'call', count: 7 },
      { type: 'email', count: 12 },
    ]);
    executeQueue.push([{ mrr: '1200' }]);
    executeQueue.push([
      { id: 1, title: 'Deal A', value: '5000', status: 'open' },
      { id: 2, title: 'Deal B', value: '4000', status: 'open' },
    ]);

    const res = await analyticsRoute.GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.winLoss).toEqual({ won: 5, lost: 2, open: 3 });
    expect(body.data.pipelineId).toBe(99);
    expect(body.data.pipelineFunnel).toHaveLength(2);
    // 42.6 → round → 43
    expect(body.data.avgDaysToClose).toBe(43);
    expect(body.data.mrr).toBe(1200);
    expect(body.data.arr).toBe(1200 * 12);
    expect(body.data.topDeals).toHaveLength(2);
    expect(body.data.activitySummary).toHaveLength(2);
  });

  it('uses pipelineId from query string and skips the default-pipeline lookup', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });

    // With pipelineId supplied, the route's call order is:
    // 1) winLoss
    // 2) revenueByMonth
    // 3) pipelineFunnel
    // 4) velocity
    // 5) activitySummary
    // 6) mrr
    // 7) topDeals
    executeQueue.push([{ won: 1, lost: 0, open: 0 }]);
    executeQueue.push([]); // revenueByMonth
    executeQueue.push([
      { stage_name: 'Solo', color: '#000', sort_order: 0, deal_count: 1, total_value: '100' },
    ]);
    executeQueue.push([{ avg_days_to_close: null }]);
    executeQueue.push([]);
    executeQueue.push([{ mrr: 0 }]);
    executeQueue.push([]);

    const res = await analyticsRoute.GET(makeReq('?pipelineId=77&period=30d'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.pipelineId).toBe(77);
    expect(body.data.avgDaysToClose).toBeNull();
    expect(body.data.mrr).toBe(0);
    expect(body.data.arr).toBe(0);
  });

  it('handles unknown period values by falling back to 12 months interval (still succeeds)', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    // No pipelineId → 8 execute calls including default-pipeline lookup.
    executeQueue.push([{ won: 0, lost: 0, open: 0 }]);
    executeQueue.push([]);
    executeQueue.push([]); // default pipeline lookup returns empty → no funnel query
    executeQueue.push([{ avg_days_to_close: null }]);
    executeQueue.push([]);
    executeQueue.push([{ mrr: null }]);
    executeQueue.push([]);
    const res = await analyticsRoute.GET(makeReq('?period=bogus'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.pipelineId).toBeNull();
    expect(body.data.pipelineFunnel).toEqual([]);
    expect(body.data.mrr).toBe(0);
  });

  it('returns 500 with a friendly message when a DB call throws', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    executeQueue.push(new Error('boom') as unknown as Array<Record<string, unknown>>);
    const res = await analyticsRoute.GET(makeReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Failed to load analytics');
    errSpy.mockRestore();
  });

  it('handles the "all" period mapping (covers the 100-year interval branch)', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    // With pipelineId given, skip default-pipeline lookup.
    executeQueue.push([{ won: 10, lost: 0, open: 0 }]);
    executeQueue.push([]);
    executeQueue.push([]); // funnel
    executeQueue.push([{ avg_days_to_close: 30 }]);
    executeQueue.push([]);
    executeQueue.push([{ mrr: '600' }]);
    executeQueue.push([]);
    const res = await analyticsRoute.GET(makeReq('?period=all&pipelineId=1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.avgDaysToClose).toBe(30);
    expect(body.data.mrr).toBe(600);
    expect(body.data.arr).toBe(7200);
  });
});
