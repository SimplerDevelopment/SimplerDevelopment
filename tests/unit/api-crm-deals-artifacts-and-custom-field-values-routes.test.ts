// @vitest-environment node
/**
 * Unit tests for:
 *   - app/api/portal/crm/deals/[id]/artifacts/route.ts   (GET, POST, PUT, DELETE)
 *   - app/api/portal/crm/custom-fields/values/route.ts   (GET, PUT)
 *
 * Both routes touch auth + getPortalClient + db. The db is mocked via a
 * programmable queue pattern: tests push the rows the route should "find"
 * in the order the route calls db.select/insert/update/delete. Schema
 * column refs are Proxy markers so any column access returns a stable
 * { __col, __table } shape. drizzle-orm helpers are stubbed to plain
 * objects — the db mock ignores the predicates.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

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
    crmDeals: wrap('crmDeals'),
    crmDealArtifacts: wrap('crmDealArtifacts'),
    clientWebsites: wrap('clientWebsites'),
    emailCampaigns: wrap('emailCampaigns'),
    pitchDecks: wrap('pitchDecks'),
    crmProposals: wrap('crmProposals'),
    bookingPages: wrap('bookingPages'),
    surveys: wrap('surveys'),
    projects: wrap('projects'),
    crmCustomFields: wrap('crmCustomFields'),
    crmCustomFieldValues: wrap('crmCustomFieldValues'),
    crmContacts: wrap('crmContacts'),
    crmCompanies: wrap('crmCompanies'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  inArray: (a: unknown, b: unknown) => ({ op: 'inArray', a, b }),
  sql: Object.assign((..._a: unknown[]) => ({ op: 'sql' }), { raw: () => ({ op: 'raw' }) }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
}));

// ---- DB mock — programmable per-test --------------------------------------
const selectQueue: Array<Array<Record<string, unknown>>> = [];
const insertQueue: Array<Array<Record<string, unknown>>> = [];
const updateQueue: Array<Array<Record<string, unknown>>> = [];
const deleteQueue: Array<Array<Record<string, unknown>>> = [];

let lastInsertValues: unknown = undefined;
let lastUpdateSet: unknown = undefined;

vi.mock('@/lib/db', () => {
  // Lazy thenable: only consumes from selectQueue when actually awaited.
  // Each chain method returns the same object so call order doesn't matter;
  // the shift happens once at await time.
  function buildSelectChain() {
    const chain: Record<string, unknown> = {
      from() {
        return chain;
      },
      innerJoin() {
        return chain;
      },
      leftJoin() {
        return chain;
      },
      where() {
        return chain;
      },
      orderBy() {
        return chain;
      },
      limit() {
        return chain;
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled, onRejected);
      },
    };
    return chain;
  }

  function buildInsert() {
    return {
      values(v: unknown) {
        lastInsertValues = v;
        return {
          returning() {
            return Promise.resolve(insertQueue.shift() ?? []);
          },
          onConflictDoUpdate(_opts: unknown) {
            return {
              returning() {
                return Promise.resolve(insertQueue.shift() ?? []);
              },
            };
          },
        };
      },
    };
  }

  function buildUpdate() {
    return {
      set(v: unknown) {
        lastUpdateSet = v;
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
      select(_proj?: unknown) {
        return {
          from() {
            return buildSelectChain();
          },
        };
      },
      insert() {
        return buildInsert();
      },
      update() {
        return buildUpdate();
      },
      delete() {
        return buildDelete();
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Modules under test (dynamic import AFTER mocks)
// ---------------------------------------------------------------------------

const artifactsRoute = await import('@/app/api/portal/crm/deals/[id]/artifacts/route');
const valuesRoute = await import('@/app/api/portal/crm/custom-fields/values/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeReq(url: string, body?: unknown, method = 'POST'): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// NextRequest-shaped wrapper that exposes `.nextUrl.searchParams` like the
// real one does. The values route imports `NextRequest` but only reads
// `req.nextUrl.searchParams` (GET) and `req.json()` (PUT), so this is enough.
function makeNextReq(url: string, body?: unknown, method = 'GET') {
  const u = new URL(url);
  const base = new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return Object.assign(base, {
    nextUrl: { searchParams: u.searchParams },
  }) as unknown as import('next/server').NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue.length = 0;
  insertQueue.length = 0;
  updateQueue.length = 0;
  deleteQueue.length = 0;
  lastInsertValues = undefined;
  lastUpdateSet = undefined;
});

// ===========================================================================
// /api/portal/crm/deals/[id]/artifacts
// ===========================================================================

describe('GET /api/portal/crm/deals/[id]/artifacts', () => {
  it('returns 400 for non-numeric id', async () => {
    const res = await artifactsRoute.GET(new Request('http://x'), makeParams('abc'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid ID');
  });

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await artifactsRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toBe('Unauthorized');
  });

  it('returns 404 when portal client cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await artifactsRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns 404 when the deal is not owned by the client', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([]); // deal lookup empty
    const res = await artifactsRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Deal not found');
  });

  it('returns the list of artifacts on success', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1 }]); // deal ok
    selectQueue.push([
      { id: 99, dealId: 1, artifactType: 'website', pinned: true, displayTitle: 'Homepage' },
      { id: 98, dealId: 1, artifactType: 'survey', pinned: false, displayTitle: 'NPS' },
    ]); // artifacts list
    const res = await artifactsRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].id).toBe(99);
  });
});

describe('POST /api/portal/crm/deals/[id]/artifacts', () => {
  it('returns 400 for non-numeric id', async () => {
    const res = await artifactsRoute.POST(makeReq('http://x', {}), makeParams('abc'));
    expect(res.status).toBe(400);
  });

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await artifactsRoute.POST(makeReq('http://x', {}), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when artifactType is missing', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1 }]); // deal ok
    const res = await artifactsRoute.POST(makeReq('http://x', { artifactId: 5 }), makeParams('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/artifactType/);
  });

  it('returns 400 when artifactType is not in the whitelist', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1 }]);
    const res = await artifactsRoute.POST(
      makeReq('http://x', { artifactType: 'bogus', artifactId: 5 }),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when the source artifact does not belong to the client', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1 }]); // deal
    selectQueue.push([]); // source lookup empty
    const res = await artifactsRoute.POST(
      makeReq('http://x', { artifactType: 'website', artifactId: 5 }),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Artifact not found');
  });

  it('creates an artifact and returns 201 with looked-up display title', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1 }]); // deal
    selectQueue.push([{ title: 'Homepage' }]); // source lookup
    insertQueue.push([
      { id: 99, dealId: 1, artifactType: 'website', artifactId: 5, displayTitle: 'Homepage', pinned: false, createdBy: 7 },
    ]);

    const res = await artifactsRoute.POST(
      makeReq('http://x', { artifactType: 'website', artifactId: 5 }),
      makeParams('1'),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(99);
    expect(body.data.displayTitle).toBe('Homepage');
    expect(lastInsertValues).toMatchObject({
      dealId: 1,
      artifactType: 'website',
      artifactId: 5,
      displayTitle: 'Homepage',
      createdBy: 7,
    });
  });

  it('falls back to body.displayTitle / "Untitled" when source title is empty', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1 }]); // deal
    selectQueue.push([{ title: null }]); // source has null title
    insertQueue.push([
      { id: 99, dealId: 1, artifactType: 'website', artifactId: 5, displayTitle: 'Custom', pinned: true, createdBy: 7 },
    ]);

    await artifactsRoute.POST(
      makeReq('http://x', { artifactType: 'website', artifactId: 5, displayTitle: 'Custom', pinned: true }),
      makeParams('1'),
    );
    expect(lastInsertValues).toMatchObject({ displayTitle: 'Custom', pinned: true });
  });

  it('defaults displayTitle to "Untitled" when neither source nor body supply one', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ title: null }]);
    insertQueue.push([{ id: 1 }]);

    await artifactsRoute.POST(
      makeReq('http://x', { artifactType: 'survey', artifactId: 9 }),
      makeParams('1'),
    );
    expect(lastInsertValues).toMatchObject({ displayTitle: 'Untitled' });
  });
});

describe('PUT /api/portal/crm/deals/[id]/artifacts', () => {
  it('returns 400 for non-numeric id', async () => {
    const res = await artifactsRoute.PUT(makeReq('http://x', {}, 'PUT'), makeParams('abc'));
    expect(res.status).toBe(400);
  });

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await artifactsRoute.PUT(makeReq('http://x', {}, 'PUT'), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when artifactDbId or pinned is missing', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1 }]); // deal ok
    const res = await artifactsRoute.PUT(makeReq('http://x', { artifactDbId: 99 }, 'PUT'), makeParams('1'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when nothing matched the update', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1 }]);
    updateQueue.push([]); // nothing updated
    const res = await artifactsRoute.PUT(
      makeReq('http://x', { artifactDbId: 99, pinned: true }, 'PUT'),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
  });

  it('updates pinned and returns the row on success', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1 }]);
    updateQueue.push([{ id: 99, dealId: 1, pinned: true }]);
    const res = await artifactsRoute.PUT(
      makeReq('http://x', { artifactDbId: 99, pinned: true }, 'PUT'),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.pinned).toBe(true);
    expect(lastUpdateSet).toMatchObject({ pinned: true });
  });

  it('accepts pinned=false (falsy but not undefined)', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1 }]);
    updateQueue.push([{ id: 99, dealId: 1, pinned: false }]);
    const res = await artifactsRoute.PUT(
      makeReq('http://x', { artifactDbId: 99, pinned: false }, 'PUT'),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/portal/crm/deals/[id]/artifacts', () => {
  it('returns 400 for non-numeric id', async () => {
    const res = await artifactsRoute.DELETE(makeReq('http://x', {}, 'DELETE'), makeParams('abc'));
    expect(res.status).toBe(400);
  });

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await artifactsRoute.DELETE(makeReq('http://x', { artifactDbId: 99 }, 'DELETE'), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when nothing was deleted', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1 }]);
    deleteQueue.push([]);
    const res = await artifactsRoute.DELETE(
      makeReq('http://x', { artifactDbId: 99 }, 'DELETE'),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
  });

  it('deletes and returns the row on success', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1 }]);
    deleteQueue.push([{ id: 99, dealId: 1, displayTitle: 'Gone' }]);
    const res = await artifactsRoute.DELETE(
      makeReq('http://x', { artifactDbId: 99 }, 'DELETE'),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(99);
  });
});

// ===========================================================================
// /api/portal/crm/custom-fields/values
// ===========================================================================

describe('GET /api/portal/crm/custom-fields/values', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await valuesRoute.GET(
      makeNextReq('http://x/api/portal/crm/custom-fields/values?entityType=contact&entityId=1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await valuesRoute.GET(
      makeNextReq('http://x/api/portal/crm/custom-fields/values?entityType=contact&entityId=1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid entityType', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await valuesRoute.GET(
      makeNextReq('http://x/api/portal/crm/custom-fields/values?entityType=bogus&entityId=1'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/entity type/i);
  });

  it('returns 400 for a missing entityType', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await valuesRoute.GET(
      makeNextReq('http://x/api/portal/crm/custom-fields/values?entityId=1'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing/invalid entityId', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await valuesRoute.GET(
      makeNextReq('http://x/api/portal/crm/custom-fields/values?entityType=contact&entityId=abc'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/entity ID/i);
  });

  it('returns 404 when the contact does not belong to this client', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([]); // entityBelongsToClient → contact lookup empty
    const res = await valuesRoute.GET(
      makeNextReq('http://x/api/portal/crm/custom-fields/values?entityType=contact&entityId=1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when the company does not belong to this client', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([]); // company lookup empty
    const res = await valuesRoute.GET(
      makeNextReq('http://x/api/portal/crm/custom-fields/values?entityType=company&entityId=1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when the deal does not belong to this client', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([]); // deal lookup empty
    const res = await valuesRoute.GET(
      makeNextReq('http://x/api/portal/crm/custom-fields/values?entityType=deal&entityId=1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns custom field values for a valid contact', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1 }]); // contact ok
    selectQueue.push([
      { id: 50, customFieldId: 11, entityId: 1, entityType: 'contact', value: 'saas', fieldName: 'industry', fieldType: 'text', options: null, required: false },
    ]);
    const res = await valuesRoute.GET(
      makeNextReq('http://x/api/portal/crm/custom-fields/values?entityType=contact&entityId=1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].fieldName).toBe('industry');
  });
});

describe('PUT /api/portal/crm/custom-fields/values', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await valuesRoute.PUT(
      makeNextReq(
        'http://x/api/portal/crm/custom-fields/values',
        { entityType: 'contact', entityId: 1, values: { '11': 'saas' } },
        'PUT',
      ),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await valuesRoute.PUT(
      makeNextReq(
        'http://x/api/portal/crm/custom-fields/values',
        { entityType: 'contact', entityId: 1, values: { '11': 'saas' } },
        'PUT',
      ),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid entityType', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await valuesRoute.PUT(
      makeNextReq(
        'http://x/api/portal/crm/custom-fields/values',
        { entityType: 'bogus', entityId: 1, values: { '11': 'x' } },
        'PUT',
      ),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid entityId', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await valuesRoute.PUT(
      makeNextReq(
        'http://x/api/portal/crm/custom-fields/values',
        { entityType: 'contact', entityId: 'abc', values: { '11': 'x' } },
        'PUT',
      ),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when values is not an object', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await valuesRoute.PUT(
      makeNextReq(
        'http://x/api/portal/crm/custom-fields/values',
        { entityType: 'contact', entityId: 1, values: 'oops' },
        'PUT',
      ),
    );
    expect(res.status).toBe(400);
  });

  it('short-circuits with empty data when values is an empty object', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await valuesRoute.PUT(
      makeNextReq(
        'http://x/api/portal/crm/custom-fields/values',
        { entityType: 'contact', entityId: 1, values: {} },
        'PUT',
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('returns 404 when the entity does not belong to this client', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([]); // entityBelongsToClient → empty
    const res = await valuesRoute.PUT(
      makeNextReq(
        'http://x/api/portal/crm/custom-fields/values',
        { entityType: 'contact', entityId: 1, values: { '11': 'saas' } },
        'PUT',
      ),
    );
    expect(res.status).toBe(404);
  });

  it('upserts only valid (client-owned) custom field ids', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1 }]); // entity ok
    selectQueue.push([{ id: 11 }, { id: 12 }]); // valid field ids — 13 is filtered out
    insertQueue.push([{ id: 100, customFieldId: 11, value: 'saas' }]);
    insertQueue.push([{ id: 101, customFieldId: 12, value: 'gold' }]);

    const res = await valuesRoute.PUT(
      makeNextReq(
        'http://x/api/portal/crm/custom-fields/values',
        {
          entityType: 'contact',
          entityId: 1,
          values: { '11': 'saas', '12': 'gold', '13': 'sneaky' },
        },
        'PUT',
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data.map((r: { id: number }) => r.id)).toEqual([100, 101]);
  });

  it('coerces null/undefined values to null and other values to strings', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1 }]); // entity ok
    selectQueue.push([{ id: 11 }, { id: 12 }]); // valid fields
    insertQueue.push([{ id: 100, customFieldId: 11, value: null }]);
    insertQueue.push([{ id: 101, customFieldId: 12, value: '42' }]);

    const res = await valuesRoute.PUT(
      makeNextReq(
        'http://x/api/portal/crm/custom-fields/values',
        { entityType: 'contact', entityId: 1, values: { '11': null, '12': 42 } },
        'PUT',
      ),
    );
    expect(res.status).toBe(200);
    // last insert captured was for fieldId 12 → value coerced to "42"
    expect(lastInsertValues).toMatchObject({ customFieldId: 12, value: '42' });
  });
});
