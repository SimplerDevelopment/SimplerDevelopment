// @vitest-environment node
/**
 * Unit tests for batch 30e (4 CRM routes):
 *   - app/api/portal/crm/contracts/route.ts                 (GET, POST)
 *   - app/api/portal/crm/custom-fields/[id]/route.ts        (PUT, DELETE)
 *   - app/api/portal/crm/custom-fields/route.ts             (GET, POST)
 *   - app/api/portal/crm/import/preview/route.ts            (POST)
 *
 * All routes depend on auth + getPortalClient + db (Drizzle). We use the same
 * programmable-queue mock pattern as other tests in this directory: tests push
 * the rows the route should "find" / "insert" / "update" / "delete" in the
 * order the route makes those calls. Schema column refs are Proxy markers so
 * any column access returns a stable { __col, __table } shape; drizzle-orm
 * helpers are stubbed to plain objects.
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

// portal-auth — mock authorizePortal to pass through (esign entitlement granted)
const authorizePortalMock = vi.fn();
const isAuthErrorMock = vi.fn();
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (...args: unknown[]) => isAuthErrorMock(...args),
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
    crmContracts: wrap('crmContracts'),
    crmContractSigners: wrap('crmContractSigners'),
    crmContacts: wrap('crmContacts'),
    crmCompanies: wrap('crmCompanies'),
    crmDeals: wrap('crmDeals'),
    crmCustomFields: wrap('crmCustomFields'),
    crmCustomFieldValues: wrap('crmCustomFieldValues'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  inArray: (a: unknown, b: unknown) => ({ op: 'inArray', a, b }),
  sql: Object.assign((..._a: unknown[]) => ({ op: 'sql' }), { raw: () => ({ op: 'raw' }) }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
}));

// Stable predictable bytes for crypto.randomBytes used in contracts POST.
vi.mock('crypto', async () => {
  const actual = await vi.importActual<typeof import('crypto')>('crypto');
  return {
    ...actual,
    default: {
      ...actual,
      randomBytes: (_n: number) => ({
        toString: (_enc: string) => 'tok',
      }),
    },
    randomBytes: (_n: number) => ({
      toString: (_enc: string) => 'tok',
    }),
  };
});

// ---- DB mock — programmable per-test --------------------------------------
const selectQueue: Array<Array<Record<string, unknown>>> = [];
const insertQueue: Array<Array<Record<string, unknown>>> = [];
const updateQueue: Array<Array<Record<string, unknown>>> = [];
const deleteQueue: Array<Array<Record<string, unknown>>> = [];

const insertCalls: unknown[] = [];
let lastUpdateSet: unknown = undefined;

vi.mock('@/lib/db', () => {
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
        insertCalls.push(v);
        const valuesResult = {
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
          // Allow `await db.insert(t).values(v)` w/o returning (no .returning() call)
          then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(insertQueue.shift() ?? []).then(onFulfilled, onRejected);
          },
        };
        return valuesResult;
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

const contractsRoute = await import('@/app/api/portal/crm/contracts/route');
const customFieldsIdRoute = await import('@/app/api/portal/crm/custom-fields/[id]/route');
const customFieldsRoute = await import('@/app/api/portal/crm/custom-fields/route');
const importPreviewRoute = await import('@/app/api/portal/crm/import/preview/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(url: string, body?: unknown, method = 'POST'): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function makeNextReq(url: string, body?: unknown, method = 'GET') {
  const u = new URL(url);
  const base = new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return Object.assign(base, {
    nextUrl: u,
  }) as unknown as import('next/server').NextRequest;
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue.length = 0;
  insertQueue.length = 0;
  updateQueue.length = 0;
  deleteQueue.length = 0;
  insertCalls.length = 0;
  lastUpdateSet = undefined;
  // Default: esign service is granted — authorizePortal passes through
  authorizePortalMock.mockResolvedValue({ ok: true });
  isAuthErrorMock.mockReturnValue(false);
});

// ===========================================================================
// /api/portal/crm/contracts
// ===========================================================================

describe('GET /api/portal/crm/contracts', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await contractsRoute.GET(makeNextReq('http://x/api/portal/crm/contracts'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await contractsRoute.GET(makeNextReq('http://x/api/portal/crm/contracts'));
    expect(res.status).toBe(404);
  });

  it('returns the list of contracts with signer stats=0 when none exist', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([
      { id: 1, title: 'Contract A', status: 'draft' },
      { id: 2, title: 'Contract B', status: 'sent' },
    ]);
    // signer lookups (per contract)
    selectQueue.push([]);
    selectQueue.push([]);

    const res = await contractsRoute.GET(makeNextReq('http://x/api/portal/crm/contracts'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].signers).toEqual({ total: 0, signed: 0 });
    expect(body.data[1].signers).toEqual({ total: 0, signed: 0 });
  });

  it('aggregates signer total/signed correctly per contract', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1, title: 'Contract A', status: 'sent' }]);
    selectQueue.push([
      { status: 'signed' },
      { status: 'signed' },
      { status: 'pending' },
    ]);

    const res = await contractsRoute.GET(makeNextReq('http://x/api/portal/crm/contracts'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].signers).toEqual({ total: 3, signed: 2 });
  });

  it('applies status + search filters from query params', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([]); // empty contracts

    const res = await contractsRoute.GET(
      makeNextReq('http://x/api/portal/crm/contracts?status=draft&search=hello'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('returns empty data and skips signer-lookup loop when there are zero contracts', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([]); // no contracts → no signer queries

    const res = await contractsRoute.GET(makeNextReq('http://x/api/portal/crm/contracts'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

describe('POST /api/portal/crm/contracts', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await contractsRoute.POST(makeReq('http://x', { title: 'A' }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await contractsRoute.POST(makeReq('http://x', { title: 'A' }));
    expect(res.status).toBe(404);
  });

  it('returns 400 when title is missing', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await contractsRoute.POST(makeReq('http://x', {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/title/i);
  });

  it('returns 400 when title is only whitespace', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await contractsRoute.POST(makeReq('http://x', { title: '   ' }));
    expect(res.status).toBe(400);
  });

  it('creates a contract with defaults when only title is provided', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    insertQueue.push([{ id: 99, title: 'A', clientToken: 'tok' }]);

    const res = await contractsRoute.POST(makeReq('http://x', { title: 'A' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(99);
    expect(insertCalls[0]).toMatchObject({
      clientId: 10,
      title: 'A',
      clauses: [],
      lineItems: [],
      fees: [],
      currency: 'USD',
      accentColor: '#2563eb',
      createdBy: 7,
      clientToken: 'tok',
    });
  });

  it('creates a contract with full body including signers', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    insertQueue.push([{ id: 99, title: 'B' }]); // contract insert
    insertQueue.push([{ id: 1 }]); // signer 1
    insertQueue.push([{ id: 2 }]); // signer 2

    const res = await contractsRoute.POST(
      makeReq('http://x', {
        title: '  B  ',
        summary: '  sum  ',
        proposalId: 5,
        dealId: 6,
        contactId: 7,
        companyId: 8,
        clauses: [{ text: 'c' }],
        lineItems: [{ name: 'li' }],
        fees: [{ name: 'f' }],
        currency: 'EUR',
        validUntil: '2026-12-31',
        accentColor: '#ff0000',
        logoUrl: 'https://x/logo.png',
        footerText: 'footer',
        signers: [
          { name: 'Alice', email: 'a@x.com', role: 'signer', order: 1 },
          { name: 'Bob', email: 'b@x.com' },
        ],
      }),
    );
    expect(res.status).toBe(201);
    expect(insertCalls[0]).toMatchObject({
      clientId: 10,
      proposalId: 5,
      dealId: 6,
      contactId: 7,
      companyId: 8,
      title: 'B',
      summary: 'sum',
      currency: 'EUR',
      accentColor: '#ff0000',
      logoUrl: 'https://x/logo.png',
      footerText: 'footer',
    });
    // 1 contract insert + 2 signer inserts
    expect(insertCalls).toHaveLength(3);
    expect(insertCalls[1]).toMatchObject({
      contractId: 99,
      name: 'Alice',
      email: 'a@x.com',
      role: 'signer',
      order: 1,
    });
    expect(insertCalls[2]).toMatchObject({
      contractId: 99,
      name: 'Bob',
      email: 'b@x.com',
      role: 'signer',
      order: 0,
    });
  });

  it('skips signers with missing name or email', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    insertQueue.push([{ id: 99 }]);
    // only one signer should be inserted
    insertQueue.push([{ id: 1 }]);

    await contractsRoute.POST(
      makeReq('http://x', {
        title: 'A',
        signers: [
          { name: '', email: 'a@x.com' }, // skipped
          { name: 'B', email: '' }, // skipped
          { name: 'C', email: 'c@x.com' }, // kept
        ],
      }),
    );
    // contract + 1 signer only
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[1]).toMatchObject({ name: 'C', email: 'c@x.com' });
  });

  it('ignores signers param when not an array', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    insertQueue.push([{ id: 99 }]);

    await contractsRoute.POST(makeReq('http://x', { title: 'A', signers: 'oops' }));
    expect(insertCalls).toHaveLength(1);
  });
});

// ===========================================================================
// /api/portal/crm/custom-fields/[id]
// ===========================================================================

describe('PUT /api/portal/crm/custom-fields/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await customFieldsIdRoute.PUT(makeReq('http://x', {}, 'PUT'), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await customFieldsIdRoute.PUT(makeReq('http://x', {}, 'PUT'), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-numeric id', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await customFieldsIdRoute.PUT(makeReq('http://x', {}, 'PUT'), makeParams('abc'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid ID');
  });

  it('returns 404 when the field does not exist for this client', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([]); // existing lookup empty
    const res = await customFieldsIdRoute.PUT(
      makeReq('http://x', { fieldName: 'industry' }, 'PUT'),
      makeParams('5'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when body has no updatable fields', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 5 }]); // existing
    const res = await customFieldsIdRoute.PUT(
      makeReq('http://x', {}, 'PUT'),
      makeParams('5'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/no fields/i);
  });

  it('updates fieldName, options, required, sortOrder, category (string)', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 5 }]); // existing
    updateQueue.push([{ id: 5, fieldName: 'industry', category: 'segment' }]);

    const res = await customFieldsIdRoute.PUT(
      makeReq(
        'http://x',
        {
          fieldName: '  industry  ',
          options: ['a', 'b'],
          required: true,
          sortOrder: 3,
          category: '  segment  ',
        },
        'PUT',
      ),
      makeParams('5'),
    );
    expect(res.status).toBe(200);
    expect(lastUpdateSet).toMatchObject({
      fieldName: 'industry',
      options: ['a', 'b'],
      required: true,
      sortOrder: 3,
      category: 'segment',
    });
  });

  it('coerces blank/non-string category to null', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 5 }]);
    updateQueue.push([{ id: 5, category: null }]);

    await customFieldsIdRoute.PUT(
      makeReq('http://x', { category: '   ' }, 'PUT'),
      makeParams('5'),
    );
    expect(lastUpdateSet).toMatchObject({ category: null });
  });

  it('non-string category becomes null', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 5 }]);
    updateQueue.push([{ id: 5 }]);

    await customFieldsIdRoute.PUT(
      makeReq('http://x', { category: 123 }, 'PUT'),
      makeParams('5'),
    );
    expect(lastUpdateSet).toMatchObject({ category: null });
  });
});

describe('DELETE /api/portal/crm/custom-fields/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await customFieldsIdRoute.DELETE(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await customFieldsIdRoute.DELETE(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-numeric id', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await customFieldsIdRoute.DELETE(new Request('http://x'), makeParams('abc'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when no row was deleted', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    deleteQueue.push([]); // nothing deleted
    const res = await customFieldsIdRoute.DELETE(new Request('http://x'), makeParams('5'));
    expect(res.status).toBe(404);
  });

  it('returns 200 with the deleted row on success', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    deleteQueue.push([{ id: 5, fieldName: 'industry' }]);
    const res = await customFieldsIdRoute.DELETE(new Request('http://x'), makeParams('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(5);
  });
});

// ===========================================================================
// /api/portal/crm/custom-fields (collection)
// ===========================================================================

describe('GET /api/portal/crm/custom-fields', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await customFieldsRoute.GET(makeNextReq('http://x/api/portal/crm/custom-fields'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await customFieldsRoute.GET(makeNextReq('http://x/api/portal/crm/custom-fields'));
    expect(res.status).toBe(404);
  });

  it('returns fields list without entityType filter', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1, fieldName: 'industry' }]);
    const res = await customFieldsRoute.GET(makeNextReq('http://x/api/portal/crm/custom-fields'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });

  it('returns fields list with valid entityType filter', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([]);
    const res = await customFieldsRoute.GET(
      makeNextReq('http://x/api/portal/crm/custom-fields?entityType=contact'),
    );
    expect(res.status).toBe(200);
  });

  it('ignores invalid entityType (returns full list)', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1 }, { id: 2 }]);
    const res = await customFieldsRoute.GET(
      makeNextReq('http://x/api/portal/crm/custom-fields?entityType=bogus'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
  });
});

describe('POST /api/portal/crm/custom-fields', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await customFieldsRoute.POST(
      makeNextReq('http://x/api/portal/crm/custom-fields', {}, 'POST'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await customFieldsRoute.POST(
      makeNextReq('http://x/api/portal/crm/custom-fields', {}, 'POST'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when fieldName is missing', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await customFieldsRoute.POST(
      makeNextReq('http://x/api/portal/crm/custom-fields', { entityType: 'contact', fieldType: 'text' }, 'POST'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/field name/i);
  });

  it('returns 400 when entityType is missing', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await customFieldsRoute.POST(
      makeNextReq('http://x/api/portal/crm/custom-fields', { fieldName: 'industry', fieldType: 'text' }, 'POST'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/entity type/i);
  });

  it('returns 400 when entityType is invalid', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await customFieldsRoute.POST(
      makeNextReq('http://x/api/portal/crm/custom-fields', { fieldName: 'industry', entityType: 'bogus', fieldType: 'text' }, 'POST'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when fieldType is missing', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await customFieldsRoute.POST(
      makeNextReq('http://x/api/portal/crm/custom-fields', { fieldName: 'industry', entityType: 'contact' }, 'POST'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/field type/i);
  });

  it('returns 400 when fieldType is invalid', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await customFieldsRoute.POST(
      makeNextReq('http://x/api/portal/crm/custom-fields', { fieldName: 'industry', entityType: 'contact', fieldType: 'bogus' }, 'POST'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 409 when a duplicate fieldName exists for this client+entityType', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1 }]); // existing
    const res = await customFieldsRoute.POST(
      makeNextReq(
        'http://x/api/portal/crm/custom-fields',
        { fieldName: 'industry', entityType: 'contact', fieldType: 'text' },
        'POST',
      ),
    );
    expect(res.status).toBe(409);
  });

  it('creates a field with defaults (no category, no options)', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([]); // no existing
    insertQueue.push([{ id: 22, fieldName: 'industry' }]);

    const res = await customFieldsRoute.POST(
      makeNextReq(
        'http://x/api/portal/crm/custom-fields',
        { fieldName: '  industry  ', entityType: 'contact', fieldType: 'text' },
        'POST',
      ),
    );
    expect(res.status).toBe(201);
    expect(insertCalls[0]).toMatchObject({
      clientId: 10,
      entityType: 'contact',
      fieldName: 'industry',
      fieldType: 'text',
      options: null,
      required: false,
      sortOrder: 0,
      category: null,
    });
  });

  it('creates a field with full body (options, required, sortOrder, category)', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([]);
    insertQueue.push([{ id: 23 }]);

    await customFieldsRoute.POST(
      makeNextReq(
        'http://x/api/portal/crm/custom-fields',
        {
          fieldName: 'tier',
          entityType: 'deal',
          fieldType: 'select',
          options: ['gold', 'silver'],
          required: true,
          sortOrder: 5,
          category: '  segment  ',
        },
        'POST',
      ),
    );
    expect(insertCalls[0]).toMatchObject({
      entityType: 'deal',
      fieldName: 'tier',
      fieldType: 'select',
      options: ['gold', 'silver'],
      required: true,
      sortOrder: 5,
      category: 'segment',
    });
  });

  it('coerces blank category string to null', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([]);
    insertQueue.push([{ id: 24 }]);

    await customFieldsRoute.POST(
      makeNextReq(
        'http://x/api/portal/crm/custom-fields',
        { fieldName: 'x', entityType: 'company', fieldType: 'text', category: '   ' },
        'POST',
      ),
    );
    expect(insertCalls[0]).toMatchObject({ category: null });
  });
});

// ===========================================================================
// /api/portal/crm/import/preview
// ===========================================================================

function makeFormRequest(csv: string | null): Request {
  const formData = new FormData();
  if (csv !== null) {
    const blob = new Blob([csv], { type: 'text/csv' });
    formData.append('file', blob, 'test.csv');
  }
  return new Request('http://x/api/portal/crm/import/preview', {
    method: 'POST',
    body: formData,
  });
}

describe('POST /api/portal/crm/import/preview', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await importPreviewRoute.POST(makeFormRequest('a,b\n1,2'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await importPreviewRoute.POST(makeFormRequest('a,b\n1,2'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when no file is provided', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await importPreviewRoute.POST(makeFormRequest(null));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/file/i);
  });

  it('returns 400 when CSV file is empty (no lines)', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await importPreviewRoute.POST(makeFormRequest(''));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/empty/i);
  });

  it('returns 400 when CSV file is whitespace only', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await importPreviewRoute.POST(makeFormRequest('   \n\n  '));
    expect(res.status).toBe(400);
  });

  it('parses simple CSV headers and sample rows', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const csv = 'name,email\nAlice,a@x.com\nBob,b@x.com';
    const res = await importPreviewRoute.POST(makeFormRequest(csv));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.headers).toEqual(['name', 'email']);
    expect(body.data.sampleRows).toEqual([
      ['Alice', 'a@x.com'],
      ['Bob', 'b@x.com'],
    ]);
  });

  it('returns at most 5 sample rows even when more are present', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const rows = ['a'].concat(Array.from({ length: 10 }, (_, i) => `v${i}`));
    const csv = rows.join('\n');
    const res = await importPreviewRoute.POST(makeFormRequest(csv));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.headers).toEqual(['a']);
    expect(body.data.sampleRows).toHaveLength(5);
  });

  it('parses quoted CSV fields with commas inside quotes', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const csv = 'name,address\n"Alice","123, Main St"\n"Bob","456, 2nd Ave"';
    const res = await importPreviewRoute.POST(makeFormRequest(csv));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.headers).toEqual(['name', 'address']);
    expect(body.data.sampleRows[0]).toEqual(['Alice', '123, Main St']);
    expect(body.data.sampleRows[1]).toEqual(['Bob', '456, 2nd Ave']);
  });

  it('parses doubled quotes ("") as a single literal quote', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const csv = 'name,nickname\n"Bob","B""ig"';
    const res = await importPreviewRoute.POST(makeFormRequest(csv));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.sampleRows[0]).toEqual(['Bob', 'B"ig']);
  });

  it('handles CRLF line endings', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const csv = 'a,b\r\n1,2\r\n3,4';
    const res = await importPreviewRoute.POST(makeFormRequest(csv));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.headers).toEqual(['a', 'b']);
    expect(body.data.sampleRows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });
});
