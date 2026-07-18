// @vitest-environment node
/**
 * Unit tests for three portal API routes:
 *
 *   1. GET /api/portal/tools/booking/analytics
 *      Aggregates booking revenue / counts / addOns / by-day / by-page.
 *
 *   2. GET /api/portal/crm/contracts/[id]/sign-url
 *      Returns embedded DropboxSign URL for owner OR signer; records
 *      a 'viewed' event when the signer fetches it.
 *
 *   3. GET + PATCH + DELETE /api/portal/brain/saved-searches/[id]
 *      Thin wrapper over lib/brain/saved-searches.ts. We mock the
 *      lib + entitlement layer and assert the validation paths.
 *
 * All collaborators (auth, db, drizzle, lib/* helpers) are mocked.
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

const authorizePortalMock = vi.fn();
const isAuthErrorMock = vi.fn();
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (...args: unknown[]) => isAuthErrorMock(...args),
}));

const getEmbeddedSignUrlMock = vi.fn();
vi.mock('@/lib/esign/dropbox-sign', () => ({
  getEmbeddedSignUrl: (...args: unknown[]) => getEmbeddedSignUrlMock(...args),
}));

const requireBrainEntitlementMock = vi.fn();
vi.mock('@/lib/brain/entitlement', () => ({
  requireBrainEntitlement: (...args: unknown[]) => requireBrainEntitlementMock(...args),
}));

const getSavedSearchMock = vi.fn();
const updateSavedSearchMock = vi.fn();
const deleteSavedSearchMock = vi.fn();

class SavedSearchForbiddenErrorMock extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'SavedSearchForbiddenError';
  }
}

vi.mock('@/lib/brain/saved-searches', () => ({
  getSavedSearch: (...args: unknown[]) => getSavedSearchMock(...args),
  updateSavedSearch: (...args: unknown[]) => updateSavedSearchMock(...args),
  deleteSavedSearch: (...args: unknown[]) => deleteSavedSearchMock(...args),
  SavedSearchForbiddenError: SavedSearchForbiddenErrorMock,
}));

vi.mock('@/lib/db/schema', () => {
  const wrap = (name: string) =>
    new Proxy(
      { __table: name },
      {
        get(_t, prop: string) {
          if (prop === '__table') return name;
          return { __col: prop, __table: name };
        },
      },
    );
  return new Proxy({
    bookings: wrap('bookings'),
    bookingPages: wrap('bookingPages'),
    bookingSelectedAddOns: wrap('bookingSelectedAddOns'),
    crmContracts: wrap('crmContracts'),
    crmContractSigningEvents: wrap('crmContractSigningEvents'),
    users: wrap('users'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : new Proxy({ __table: String(p) }, { get: (_x, c) => c === "__table" ? String(p) : (typeof c === "string" ? { __col: c, __table: String(p) } : undefined) })) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  ne: (a: unknown, b: unknown) => ({ op: 'ne', a, b }),
  gte: (a: unknown, b: unknown) => ({ op: 'gte', a, b }),
  lte: (a: unknown, b: unknown) => ({ op: 'lte', a, b }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      __sql: true,
      strings: Array.from(strings),
      values,
    }),
    {},
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ---- per-test DB queues ----------------------------------------------------

const selectQueue: Array<Array<Record<string, unknown>>> = [];
const updateCalls: Array<{ table: string; set: Record<string, unknown> }> = [];
const insertCalls: Array<{ table: string; values: Record<string, unknown> }> = [];

vi.mock('@/lib/db', () => {
  function makeSelectChain() {
    const chain: Record<string, unknown> = {
      from() {
        return chain;
      },
      where() {
        return chain;
      },
      orderBy() {
        return chain;
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

  function makeUpdate(table: { __table: string }) {
    return {
      set(values: Record<string, unknown>) {
        updateCalls.push({ table: table.__table, set: values });
        return {
          where() {
            return Promise.resolve();
          },
        };
      },
    };
  }

  function makeInsert(table: { __table: string }) {
    return {
      values(vals: Record<string, unknown>) {
        insertCalls.push({ table: table.__table, values: vals });
        return Promise.resolve();
      },
    };
  }

  return {
    db: {
      select() {
        return makeSelectChain();
      },
      update(table: { __table: string }) {
        return makeUpdate(table);
      },
      insert(table: { __table: string }) {
        return makeInsert(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Module under test (dynamic import AFTER all mocks)
// ---------------------------------------------------------------------------

const { GET: analyticsGET } = await import('@/app/api/portal/tools/booking/analytics/route');
const { GET: signUrlGET } = await import('@/app/api/portal/crm/contracts/[id]/sign-url/route');
const {
  GET: savedSearchGET,
  PATCH: savedSearchPATCH,
  DELETE: savedSearchDELETE,
} = await import('@/app/api/portal/brain/saved-searches/[id]/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makePatchReq(body: unknown, badJson = false): Request {
  return new Request('http://localhost/api/portal/brain/saved-searches/1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: badJson ? '{ not-json' : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue.length = 0;
  updateCalls.length = 0;
  insertCalls.length = 0;
  // Default: isAuthError returns false unless a test wires an auth error
  isAuthErrorMock.mockImplementation((r: unknown) => {
    return Boolean(r && typeof r === 'object' && 'response' in (r as Record<string, unknown>));
  });
});

// ===========================================================================
// GET /api/portal/tools/booking/analytics
// ===========================================================================

describe('GET /api/portal/tools/booking/analytics', () => {
  function makeReq(qs = ''): Request {
    return new Request(
      'http://localhost/api/portal/tools/booking/analytics' + (qs ? '?' + qs : ''),
    );
  }

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await analyticsGET(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await analyticsGET(makeReq());
    expect(res.status).toBe(401);
  });

  it('returns the authorizePortal error response when service is not entitled', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    const errRes = new Response(JSON.stringify({ success: false, error: 'no booking' }), {
      status: 403,
    });
    authorizePortalMock.mockResolvedValueOnce({ response: errRes });
    const res = await analyticsGET(makeReq());
    expect(res).toBe(errRes);
  });

  it('returns 401 when portal client cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    authorizePortalMock.mockResolvedValueOnce({ ok: true });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await analyticsGET(makeReq());
    expect(res.status).toBe(401);
  });

  it('returns zero-state analytics when there are no bookings', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    authorizePortalMock.mockResolvedValueOnce({ ok: true });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([]); // bookings query empty

    const res = await analyticsGET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.totalRevenue).toBe(0);
    expect(body.data.bookingCount).toBe(0);
    expect(body.data.averageBookingValue).toBe(0);
    expect(body.data.byDay).toEqual([]);
    expect(body.data.byPage).toEqual([]);
    expect(body.data.topAddOns).toEqual([]);
  });

  it('aggregates revenue, addOns, byDay, byPage with start/end + bookingPageId filters', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    authorizePortalMock.mockResolvedValueOnce({ ok: true });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    // bookings
    selectQueue.push([
      {
        id: 1,
        bookingPageId: 7,
        total: 1000,
        subtotal: 900,
        discountTotal: 0,
        paymentStatus: 'paid',
        status: 'confirmed',
        groupSize: 2,
        createdAt: new Date('2026-04-01T10:00:00Z'),
      },
      {
        id: 2,
        bookingPageId: 7,
        total: 500,
        subtotal: 500,
        discountTotal: 0,
        paymentStatus: 'free',
        status: 'confirmed',
        groupSize: 3,
        createdAt: new Date('2026-04-02T10:00:00Z'),
      },
      {
        id: 3,
        bookingPageId: 8,
        total: 200,
        subtotal: 200,
        discountTotal: 0,
        paymentStatus: 'pending',
        status: 'confirmed',
        groupSize: 1,
        createdAt: new Date('2026-04-02T11:00:00Z'),
      },
    ]);
    // addOns
    selectQueue.push([
      { productName: 'Hat', quantity: 2, unitPrice: 100 },
      { productName: 'Hat', quantity: 1, unitPrice: 100 },
      { productName: 'Shirt', quantity: 1, unitPrice: 50 },
    ]);
    // pages lookup
    selectQueue.push([
      { id: 7, title: 'Tour A' },
      // page 8 missing → triggers 'Unknown' fallback
    ]);

    const res = await analyticsGET(
      makeReq('startDate=2026-04-01&endDate=2026-04-30&bookingPageId=7'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // paidBookings = ids 1+2; pending excluded from totalRevenue
    expect(body.data.totalRevenue).toBe(1500);
    expect(body.data.addOnRevenue).toBe(350);
    expect(body.data.bookingRevenue).toBe(1150);
    expect(body.data.bookingCount).toBe(2);
    expect(body.data.totalGuests).toBe(5);
    expect(body.data.averageBookingValue).toBe(750);
    expect(body.data.byDay).toHaveLength(2);
    expect(body.data.byDay[0].date).toBe('2026-04-01');
    // byPage: Tour A first by revenue
    expect(body.data.byPage[0].title).toBe('Tour A');
    // topAddOns sorted by revenue desc
    expect(body.data.topAddOns[0].name).toBe('Hat');
    expect(body.data.topAddOns[0].revenue).toBe(300);
    expect(body.data.topAddOns[1].name).toBe('Shirt');
  });

  it('uses Unknown title when bookingPageId is not in pages lookup', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    authorizePortalMock.mockResolvedValueOnce({ ok: true });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([
      {
        id: 1,
        bookingPageId: 999,
        total: 100,
        subtotal: 100,
        discountTotal: 0,
        paymentStatus: 'paid',
        status: 'confirmed',
        groupSize: 1,
        createdAt: new Date('2026-04-01T10:00:00Z'),
      },
    ]);
    selectQueue.push([]); // no addOns
    selectQueue.push([]); // no pages row found

    const res = await analyticsGET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.byPage[0].title).toBe('Unknown');
  });
});

// ===========================================================================
// GET /api/portal/crm/contracts/[id]/sign-url
// ===========================================================================

describe('GET /api/portal/crm/contracts/[id]/sign-url', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await signUrlGET(new Request('http://localhost'), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await signUrlGET(new Request('http://localhost'), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when contract id is not numeric', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    const res = await signUrlGET(new Request('http://localhost'), makeParams('nope'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid contract id');
  });

  it('returns 404 when contract is not found', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    selectQueue.push([]); // contract lookup
    const res = await signUrlGET(new Request('http://localhost'), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when caller is neither owner nor signer', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    selectQueue.push([
      {
        id: 1,
        clientId: 99,
        esignSignerEmail: 'someone@else.com',
        esignProviderRequestId: 'req1',
        esignStatus: 'sent',
      },
    ]);
    getPortalClientMock.mockResolvedValueOnce({ id: 10 }); // mismatch
    selectQueue.push([{ email: 'me@me.com' }]); // user email lookup
    const res = await signUrlGET(new Request('http://localhost'), makeParams('1'));
    expect(res.status).toBe(403);
  });

  it('returns 409 when contract has not been sent for signature', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    selectQueue.push([
      {
        id: 1,
        clientId: 10,
        esignSignerEmail: null,
        esignProviderRequestId: null,
        esignStatus: null,
      },
    ]);
    getPortalClientMock.mockResolvedValueOnce({ id: 10 }); // owner
    const res = await signUrlGET(new Request('http://localhost'), makeParams('1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/not been sent/);
  });

  it('returns 409 when esignStatus is not sent/viewed', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    selectQueue.push([
      {
        id: 1,
        clientId: 10,
        esignSignerEmail: null,
        esignProviderRequestId: 'req1',
        esignStatus: 'declined',
      },
    ]);
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await signUrlGET(new Request('http://localhost'), makeParams('1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/Cannot fetch sign URL in status 'declined'/);
  });

  it('returns 500 when signature id is missing from signing event payload', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    selectQueue.push([
      {
        id: 1,
        clientId: 10,
        esignSignerEmail: null,
        esignProviderRequestId: 'req1',
        esignStatus: 'sent',
      },
    ]);
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ payload: {} }]); // no signatureId
    const res = await signUrlGET(new Request('http://localhost'), makeParams('1'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/Signature id missing/);
  });

  it('returns 502 when DropboxSign throws', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    selectQueue.push([
      {
        id: 1,
        clientId: 10,
        esignSignerEmail: null,
        esignProviderRequestId: 'req1',
        esignStatus: 'sent',
      },
    ]);
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ payload: { signatureId: 'sig_1' } }]);
    getEmbeddedSignUrlMock.mockRejectedValueOnce(new Error('upstream down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await signUrlGET(new Request('http://localhost'), makeParams('1'));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('upstream down');
    errSpy.mockRestore();
  });

  it('returns 502 with fallback message when DropboxSign throws non-Error', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    selectQueue.push([
      {
        id: 1,
        clientId: 10,
        esignSignerEmail: null,
        esignProviderRequestId: 'req1',
        esignStatus: 'sent',
      },
    ]);
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ payload: { signatureId: 'sig_1' } }]);
    getEmbeddedSignUrlMock.mockRejectedValueOnce('weird');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await signUrlGET(new Request('http://localhost'), makeParams('1'));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('DropboxSign request failed');
    errSpy.mockRestore();
  });

  it('returns the sign URL for owner without recording opened event', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    selectQueue.push([
      {
        id: 1,
        clientId: 10,
        esignSignerEmail: 'signer@x.com',
        esignProviderRequestId: 'req1',
        esignStatus: 'sent',
      },
    ]);
    getPortalClientMock.mockResolvedValueOnce({ id: 10 }); // owner
    selectQueue.push([{ email: 'owner@x.com' }]); // user email lookup (not signer)
    selectQueue.push([
      { payload: { signatureId: 'sig_old' } },
      { payload: { signatureId: 'sig_new' } },
    ]);
    const expiresAt = new Date('2026-05-20T00:00:00Z');
    getEmbeddedSignUrlMock.mockResolvedValueOnce({ signUrl: 'https://sign.url', expiresAt });

    const res = await signUrlGET(new Request('http://localhost'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.signUrl).toBe('https://sign.url');
    expect(body.data.expiresAt).toBe(expiresAt.toISOString());
    // Owner-only: no insert (opened event) and no update.
    expect(insertCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
    // Latest signature id was used.
    expect(getEmbeddedSignUrlMock).toHaveBeenCalledWith('sig_new');
  });

  it('records opened event and promotes status to viewed when signer fetches URL', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    selectQueue.push([
      {
        id: 1,
        clientId: 10,
        esignSignerEmail: 'Signer@X.com',
        esignProviderRequestId: 'req1',
        esignStatus: 'sent',
      },
    ]);
    getPortalClientMock.mockResolvedValueOnce(null); // not owner
    selectQueue.push([{ email: 'signer@x.com' }]); // matches (case insensitive)
    selectQueue.push([{ payload: { signatureId: 'sig_1' } }]);
    getEmbeddedSignUrlMock.mockResolvedValueOnce({
      signUrl: 'https://sign.url',
      expiresAt: new Date('2026-05-20T00:00:00Z'),
    });

    const res = await signUrlGET(new Request('http://localhost'), makeParams('1'));
    expect(res.status).toBe(200);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('crmContractSigningEvents');
    expect(insertCalls[0].values).toMatchObject({
      contractId: 1,
      clientId: 10,
      kind: 'opened',
      actorEmail: 'Signer@X.com',
    });
    // Status was promoted from sent → viewed.
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('crmContracts');
    expect(updateCalls[0].set).toMatchObject({ esignStatus: 'viewed' });
  });

  it('does NOT promote status when signer fetches URL but contract is already viewed', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    selectQueue.push([
      {
        id: 1,
        clientId: 10,
        esignSignerEmail: 'signer@x.com',
        esignProviderRequestId: 'req1',
        esignStatus: 'viewed',
      },
    ]);
    getPortalClientMock.mockResolvedValueOnce(null);
    selectQueue.push([{ email: 'signer@x.com' }]);
    selectQueue.push([{ payload: { signatureId: 'sig_1' } }]);
    getEmbeddedSignUrlMock.mockResolvedValueOnce({
      signUrl: 'https://sign.url',
      expiresAt: new Date('2026-05-20T00:00:00Z'),
    });

    const res = await signUrlGET(new Request('http://localhost'), makeParams('1'));
    expect(res.status).toBe(200);
    expect(insertCalls).toHaveLength(1); // opened event still recorded
    expect(updateCalls).toHaveLength(0); // status NOT changed
  });
});

// ===========================================================================
// /api/portal/brain/saved-searches/[id] — GET + PATCH + DELETE
// ===========================================================================

function makeEntitlementOk(overrides: Record<string, unknown> = {}) {
  return {
    client: { id: 10 },
    userId: 42,
    ...overrides,
  };
}

describe('GET /api/portal/brain/saved-searches/[id]', () => {
  it('returns entitlement response when not entitled', async () => {
    const errRes = new Response(JSON.stringify({ msg: 'no brain' }), { status: 403 });
    requireBrainEntitlementMock.mockResolvedValueOnce({ response: errRes });
    const res = await savedSearchGET(new Request('http://localhost'), makeParams('1'));
    expect(res).toBe(errRes);
  });

  it('returns 400 when id is not numeric', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(makeEntitlementOk());
    const res = await savedSearchGET(new Request('http://localhost'), makeParams('xyz'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Invalid saved-search id/);
  });

  it('returns 404 when saved search not found', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(makeEntitlementOk());
    getSavedSearchMock.mockResolvedValueOnce(null);
    const res = await savedSearchGET(new Request('http://localhost'), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns the saved search row on success', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(makeEntitlementOk());
    getSavedSearchMock.mockResolvedValueOnce({ id: 1, name: 'Hot Leads' });
    const res = await savedSearchGET(new Request('http://localhost'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ id: 1, name: 'Hot Leads' });
    expect(getSavedSearchMock).toHaveBeenCalledWith(10, 1);
  });
});

describe('PATCH /api/portal/brain/saved-searches/[id]', () => {
  it('returns entitlement response when not entitled', async () => {
    const errRes = new Response('{}', { status: 403 });
    requireBrainEntitlementMock.mockResolvedValueOnce({ response: errRes });
    const res = await savedSearchPATCH(makePatchReq({ name: 'x' }), makeParams('1'));
    expect(res).toBe(errRes);
  });

  it('returns 400 when id is not numeric', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(makeEntitlementOk());
    const res = await savedSearchPATCH(makePatchReq({ name: 'x' }), makeParams('nope'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is not JSON', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(makeEntitlementOk());
    const res = await savedSearchPATCH(makePatchReq({}, true), makeParams('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Invalid body/);
  });

  it('returns 400 when body is not an object', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(makeEntitlementOk());
    const req = new Request('http://localhost/api/portal/brain/saved-searches/1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify('not-an-object'),
    });
    const res = await savedSearchPATCH(req, makeParams('1'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when name is empty', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(makeEntitlementOk());
    const res = await savedSearchPATCH(makePatchReq({ name: '   ' }), makeParams('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/name must be 1-150/);
  });

  it('returns 400 when name is too long', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(makeEntitlementOk());
    const res = await savedSearchPATCH(
      makePatchReq({ name: 'x'.repeat(151) }),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when icon is not a string', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(makeEntitlementOk());
    const res = await savedSearchPATCH(makePatchReq({ icon: 123 }), makeParams('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/icon must be a string/);
  });

  it('returns 400 when filters are not an object', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(makeEntitlementOk());
    const res = await savedSearchPATCH(makePatchReq({ filters: 'bad' }), makeParams('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/invalid filters/);
  });

  it('returns 400 when sortOrder is not a finite number', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(makeEntitlementOk());
    const res = await savedSearchPATCH(
      makePatchReq({ sortOrder: 'high' }),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when scope is unknown', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(makeEntitlementOk());
    const res = await savedSearchPATCH(
      makePatchReq({ scope: 'weird' }),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/scope must be/);
  });

  it('translates scope=shared → userId=null', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(makeEntitlementOk());
    updateSavedSearchMock.mockResolvedValueOnce({ id: 1, name: 'x' });
    const res = await savedSearchPATCH(
      makePatchReq({ scope: 'shared' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(updateSavedSearchMock).toHaveBeenCalledWith(10, 1, { userId: null }, 42);
  });

  it('translates scope=personal → userId=current user', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(makeEntitlementOk());
    updateSavedSearchMock.mockResolvedValueOnce({ id: 1, name: 'x' });
    const res = await savedSearchPATCH(
      makePatchReq({ scope: 'personal' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(updateSavedSearchMock).toHaveBeenCalledWith(10, 1, { userId: 42 }, 42);
  });

  it('returns 404 when updateSavedSearch resolves to undefined', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(makeEntitlementOk());
    updateSavedSearchMock.mockResolvedValueOnce(undefined);
    const res = await savedSearchPATCH(
      makePatchReq({ name: 'New name' }),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
  });

  it('passes through a fully populated valid patch', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(makeEntitlementOk());
    updateSavedSearchMock.mockResolvedValueOnce({ id: 1, name: 'Hot' });
    const res = await savedSearchPATCH(
      makePatchReq({
        name: 'Hot',
        icon: 'fire',
        filters: {
          search: 'lead',
          tagPrefix: 'crm/',
          tags: ['vip', 'urgent', 123], // non-strings get filtered
          pinnedOnly: true,
          trashed: false,
          sort: 'updated',
          order: 'desc',
          extraneous: 'ignored',
        },
        sortOrder: 3,
      }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ id: 1, name: 'Hot' });
    const [, , patch] = updateSavedSearchMock.mock.calls[0];
    expect(patch.name).toBe('Hot');
    expect(patch.icon).toBe('fire');
    expect(patch.sortOrder).toBe(3);
    expect(patch.filters).toEqual({
      search: 'lead',
      tagPrefix: 'crm/',
      tags: ['vip', 'urgent'],
      pinnedOnly: true,
      trashed: false,
      sort: 'updated',
      order: 'desc',
    });
  });

  it('returns 403 when updateSavedSearch throws SavedSearchForbiddenError', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(makeEntitlementOk());
    updateSavedSearchMock.mockRejectedValueOnce(
      new SavedSearchForbiddenErrorMock('shared search edit blocked'),
    );
    const res = await savedSearchPATCH(
      makePatchReq({ name: 'Hot' }),
      makeParams('1'),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toBe('shared search edit blocked');
  });

  it('returns 500 when updateSavedSearch throws a generic error', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(makeEntitlementOk());
    updateSavedSearchMock.mockRejectedValueOnce(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await savedSearchPATCH(
      makePatchReq({ name: 'Hot' }),
      makeParams('1'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('boom');
    errSpy.mockRestore();
  });

  it('returns 500 with fallback message when updateSavedSearch throws non-Error', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(makeEntitlementOk());
    updateSavedSearchMock.mockRejectedValueOnce('weird-string');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await savedSearchPATCH(
      makePatchReq({ name: 'Hot' }),
      makeParams('1'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('Update failed');
    errSpy.mockRestore();
  });
});

describe('DELETE /api/portal/brain/saved-searches/[id]', () => {
  it('returns entitlement response when not entitled', async () => {
    const errRes = new Response('{}', { status: 403 });
    requireBrainEntitlementMock.mockResolvedValueOnce({ response: errRes });
    const res = await savedSearchDELETE(new Request('http://localhost'), makeParams('1'));
    expect(res).toBe(errRes);
  });

  it('returns 400 when id is not numeric', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(makeEntitlementOk());
    const res = await savedSearchDELETE(new Request('http://localhost'), makeParams('nope'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when deleteSavedSearch returns falsy', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(makeEntitlementOk());
    deleteSavedSearchMock.mockResolvedValueOnce(false);
    const res = await savedSearchDELETE(new Request('http://localhost'), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 200 success when deleteSavedSearch returns true', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(makeEntitlementOk());
    deleteSavedSearchMock.mockResolvedValueOnce(true);
    const res = await savedSearchDELETE(new Request('http://localhost'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteSavedSearchMock).toHaveBeenCalledWith(10, 1, 42);
  });

  it('returns 403 when deleteSavedSearch throws SavedSearchForbiddenError', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(makeEntitlementOk());
    deleteSavedSearchMock.mockRejectedValueOnce(
      new SavedSearchForbiddenErrorMock('cant delete'),
    );
    const res = await savedSearchDELETE(new Request('http://localhost'), makeParams('1'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toBe('cant delete');
  });

  it('returns 500 when deleteSavedSearch throws generic error', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(makeEntitlementOk());
    deleteSavedSearchMock.mockRejectedValueOnce(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await savedSearchDELETE(new Request('http://localhost'), makeParams('1'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('boom');
    errSpy.mockRestore();
  });

  it('returns 500 with fallback message when deleteSavedSearch throws non-Error', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(makeEntitlementOk());
    deleteSavedSearchMock.mockRejectedValueOnce('weird');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await savedSearchDELETE(new Request('http://localhost'), makeParams('1'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('Delete failed');
    errSpy.mockRestore();
  });
});
