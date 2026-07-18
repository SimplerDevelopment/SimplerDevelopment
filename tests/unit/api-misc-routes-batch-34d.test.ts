// @vitest-environment node
/**
 * Batch 34d — unit tests for 4 portal route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/websites/[siteId]/store/stripe-connect/route.ts (POST, GET)
 *  - app/api/portal/workflows/[id]/route.ts                          (GET, PATCH, DELETE)
 *  - app/api/portal/workflows/[id]/runs/route.ts                     (GET)
 *  - app/api/portal/workflows/[id]/test-run/route.ts                 (POST)
 *
 * Strategy: mock auth, portal-client, portal-auth, db (select queue + update
 * capture + insert capture + delete capture), drizzle-orm operators, schema
 * tables, the `stripe` dynamic import, and lib/workflows/runtime. No network,
 * no real DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
const resolveClientSiteMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
  resolveClientSite: (...args: unknown[]) => resolveClientSiteMock(...args),
}));

const authorizePortalMock = vi.fn();
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (r: unknown) =>
    typeof r === 'object' && r !== null && 'response' in (r as Record<string, unknown>),
}));

const runWorkflowMock = vi.fn();
vi.mock('@/lib/workflows/runtime', () => ({
  runWorkflow: (...args: unknown[]) => runWorkflowMock(...args),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          if (prop === '$inferSelect') return undefined;
          if (prop === 'then') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    storeSettings: wrap('storeSettings'),
    workflows: wrap('workflows'),
    workflowRuns: wrap('workflowRuns'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// stripe — captured per-call ctor + namespaced methods
const stripeAccountsCreateMock = vi.fn();
const stripeAccountsRetrieveMock = vi.fn();
const stripeAccountLinksCreateMock = vi.fn();
const stripeCtorMock = vi.fn();
vi.mock('stripe', () => ({
  default: class {
    constructor(key?: string) {
      stripeCtorMock(key);
    }
    accounts = {
      create: (...args: unknown[]) => stripeAccountsCreateMock(...args),
      retrieve: (...args: unknown[]) => stripeAccountsRetrieveMock(...args),
    };
    accountLinks = {
      create: (...args: unknown[]) => stripeAccountLinksCreateMock(...args),
    };
  },
}));

// ---------------------------------------------------------------------------
// db mock: select queue + insert capture + update capture + delete capture
// ---------------------------------------------------------------------------

interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
}
interface InsertCall {
  table: string;
  values: Record<string, unknown>;
}
interface DeleteCall {
  table: string;
  filter: unknown;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
const updateCalls: UpdateCall[] = [];
const insertCalls: InsertCall[] = [];
const deleteCalls: DeleteCall[] = [];

function shiftNext(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = () => {
      if (!materializedPromise) materializedPromise = Promise.resolve(shiftNext());
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of [
      'from',
      'leftJoin',
      'innerJoin',
      'where',
      'orderBy',
      'groupBy',
      'limit',
      'offset',
    ]) {
      chain[m] = passthrough;
    }
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(values: Record<string, unknown>) {
        insertCalls.push({ table: table.__table, values });
        return {
          returning() {
            return Promise.resolve(insertReturnQueue.shift() ?? []);
          },
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(undefined).then(onF, onR);
          },
        };
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            updateCalls.push({ table: table.__table, patch, filter });
            return {
              returning() {
                return Promise.resolve(updateReturnQueue.shift() ?? []);
              },
              then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                return Promise.resolve(undefined).then(onF, onR);
              },
            };
          },
        };
      },
    };
  }

  function buildDelete(table: { __table: string }) {
    return {
      where(filter: unknown) {
        deleteCalls.push({ table: table.__table, filter });
        return {
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(undefined).then(onF, onR);
          },
        };
      },
    };
  }

  return {
    db: {
      select() {
        return buildSelect();
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
// Routes under test (imported AFTER all mocks)
// ---------------------------------------------------------------------------

const stripeConnectRoute = await import(
  '@/app/api/portal/websites/[siteId]/store/stripe-connect/route'
);
const workflowIdRoute = await import('@/app/api/portal/workflows/[id]/route');
const workflowRunsRoute = await import('@/app/api/portal/workflows/[id]/runs/route');
const workflowTestRunRoute = await import('@/app/api/portal/workflows/[id]/test-run/route');

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}
function makeJsonReq(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const SESSION = { user: { id: '7' } };
const OK_AUTH = { ok: true };

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  updateReturnQueue = [];
  updateCalls.length = 0;
  insertCalls.length = 0;
  deleteCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  resolveClientSiteMock.mockReset();
  authorizePortalMock.mockReset();
  runWorkflowMock.mockReset();
  stripeAccountsCreateMock.mockReset();
  stripeAccountsRetrieveMock.mockReset();
  stripeAccountLinksCreateMock.mockReset();
  stripeCtorMock.mockReset();
  process.env.STRIPE_SECRET_KEY = 'sk_test_123';
  process.env.NEXT_PUBLIC_URL = 'https://app.example.com';
});

// ===========================================================================
// POST /api/portal/websites/[siteId]/store/stripe-connect
// ===========================================================================

describe('POST /api/portal/websites/[siteId]/store/stripe-connect', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await stripeConnectRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/store/stripe-connect', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when site cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue(null);
    const res = await stripeConnectRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/store/stripe-connect', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('creates settings + Stripe account when none exist, returns onboarding URL', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    // settings lookup empty -> route inserts
    selectQueue.push([]);
    insertReturnQueue.push([{ websiteId: 42, stripeAccountId: null }]);
    stripeAccountsCreateMock.mockResolvedValue({ id: 'acct_NEW' });
    stripeAccountLinksCreateMock.mockResolvedValue({ url: 'https://stripe.example/onboard' });

    const res = await stripeConnectRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/store/stripe-connect', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.url).toBe('https://stripe.example/onboard');
    expect(body.data.accountId).toBe('acct_NEW');
    expect(stripeCtorMock).toHaveBeenCalledWith('sk_test_123');
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('storeSettings');
    expect(insertCalls[0].values).toMatchObject({ websiteId: 42 });
    expect(stripeAccountsCreateMock).toHaveBeenCalledWith({
      type: 'standard',
      metadata: { websiteId: '42' },
    });
    // accountId was null -> route should update with new accountId
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('storeSettings');
    expect(updateCalls[0].patch.stripeAccountId).toBe('acct_NEW');
    expect(stripeAccountLinksCreateMock).toHaveBeenCalledWith({
      account: 'acct_NEW',
      refresh_url: 'https://app.example.com/portal/websites/42/store/settings',
      return_url: 'https://app.example.com/portal/websites/42/store/settings',
      type: 'account_onboarding',
    });
  });

  it('reuses existing Stripe account when settings already have stripeAccountId', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ websiteId: 42, stripeAccountId: 'acct_EXISTING' }]);
    stripeAccountLinksCreateMock.mockResolvedValue({ url: 'https://stripe.example/again' });

    const res = await stripeConnectRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/store/stripe-connect', 'POST', {
        returnUrl: 'https://custom/return',
        refreshUrl: 'https://custom/refresh',
      }),
      { params: Promise.resolve({ siteId: '1' }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.accountId).toBe('acct_EXISTING');
    expect(body.data.url).toBe('https://stripe.example/again');
    // Should NOT create a new Stripe account and should NOT update DB
    expect(stripeAccountsCreateMock).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
    expect(stripeAccountLinksCreateMock).toHaveBeenCalledWith({
      account: 'acct_EXISTING',
      refresh_url: 'https://custom/refresh',
      return_url: 'https://custom/return',
      type: 'account_onboarding',
    });
  });

  it('falls back to default return/refresh URL when body is not JSON', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ websiteId: 42, stripeAccountId: 'acct_EXISTING' }]);
    stripeAccountLinksCreateMock.mockResolvedValue({ url: 'https://stripe.example/onboard' });

    // Request body is not valid JSON — req.json().catch(() => ({})) yields {}
    const res = await stripeConnectRoute.POST(
      new Request('http://x/api/portal/websites/1/store/stripe-connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json',
      }),
      { params: Promise.resolve({ siteId: '1' }) },
    );

    expect(res.status).toBe(200);
    expect(stripeAccountLinksCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        return_url: 'https://app.example.com/portal/websites/42/store/settings',
        refresh_url: 'https://app.example.com/portal/websites/42/store/settings',
      }),
    );
  });
});

// ===========================================================================
// GET /api/portal/websites/[siteId]/store/stripe-connect
// ===========================================================================

describe('GET /api/portal/websites/[siteId]/store/stripe-connect', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await stripeConnectRoute.GET(
      makeReq('http://x/api/portal/websites/1/store/stripe-connect'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when site cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue(null);
    const res = await stripeConnectRoute.GET(
      makeReq('http://x/api/portal/websites/1/store/stripe-connect'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns connected: false when no settings row exists', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    selectQueue.push([]); // no settings
    const res = await stripeConnectRoute.GET(
      makeReq('http://x/api/portal/websites/1/store/stripe-connect'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({
      connected: false,
      onboardingComplete: false,
      accountId: null,
    });
    // Should not touch Stripe at all
    expect(stripeCtorMock).not.toHaveBeenCalled();
    expect(stripeAccountsRetrieveMock).not.toHaveBeenCalled();
  });

  it('returns connected: false when settings exist but no stripeAccountId', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ websiteId: 42, stripeAccountId: null }]);
    const res = await stripeConnectRoute.GET(
      makeReq('http://x/api/portal/websites/1/store/stripe-connect'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({
      connected: false,
      onboardingComplete: false,
      accountId: null,
    });
  });

  it('returns onboarding-complete + persists flag when both charges_enabled and payouts_enabled are true', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    selectQueue.push([
      {
        websiteId: 42,
        stripeAccountId: 'acct_OK',
        stripeOnboardingComplete: false,
      },
    ]);
    stripeAccountsRetrieveMock.mockResolvedValue({
      charges_enabled: true,
      payouts_enabled: true,
    });

    const res = await stripeConnectRoute.GET(
      makeReq('http://x/api/portal/websites/1/store/stripe-connect'),
      { params: Promise.resolve({ siteId: '1' }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({
      connected: true,
      onboardingComplete: true,
      accountId: 'acct_OK',
      chargesEnabled: true,
      payoutsEnabled: true,
    });
    expect(stripeAccountsRetrieveMock).toHaveBeenCalledWith('acct_OK');
    // First-time completion -> route persists the flag
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('storeSettings');
    expect(updateCalls[0].patch.stripeOnboardingComplete).toBe(true);
  });

  it('does NOT update DB when onboarding was already marked complete', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    selectQueue.push([
      {
        websiteId: 42,
        stripeAccountId: 'acct_OK',
        stripeOnboardingComplete: true, // already true
      },
    ]);
    stripeAccountsRetrieveMock.mockResolvedValue({
      charges_enabled: true,
      payouts_enabled: true,
    });

    const res = await stripeConnectRoute.GET(
      makeReq('http://x/api/portal/websites/1/store/stripe-connect'),
      { params: Promise.resolve({ siteId: '1' }) },
    );

    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(0);
  });

  it('returns connected: true but onboardingComplete: false when Stripe reports payouts disabled', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    selectQueue.push([
      {
        websiteId: 42,
        stripeAccountId: 'acct_NOTYET',
        stripeOnboardingComplete: false,
      },
    ]);
    stripeAccountsRetrieveMock.mockResolvedValue({
      charges_enabled: true,
      payouts_enabled: false,
    });

    const res = await stripeConnectRoute.GET(
      makeReq('http://x/api/portal/websites/1/store/stripe-connect'),
      { params: Promise.resolve({ siteId: '1' }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.connected).toBe(true);
    expect(body.data.onboardingComplete).toBe(false);
    expect(body.data.chargesEnabled).toBe(true);
    expect(body.data.payoutsEnabled).toBe(false);
    // Not complete -> no update
    expect(updateCalls).toHaveLength(0);
  });
});

// ===========================================================================
// GET /api/portal/workflows/[id]
// ===========================================================================

describe('GET /api/portal/workflows/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await workflowIdRoute.GET(makeReq('http://x/api/portal/workflows/1'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Unauthorized');
  });

  it('returns auth error response when authorizePortal denies', async () => {
    authMock.mockResolvedValue(SESSION);
    const denied = {
      response: new Response(JSON.stringify({ success: false, error: 'forbidden' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    };
    authorizePortalMock.mockResolvedValue(denied);
    const res = await workflowIdRoute.GET(makeReq('http://x/api/portal/workflows/1'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue(null);
    const res = await workflowIdRoute.GET(makeReq('http://x/api/portal/workflows/1'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Client not found');
  });

  it('returns 400 when id is not numeric', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await workflowIdRoute.GET(makeReq('http://x/api/portal/workflows/abc'), {
      params: Promise.resolve({ id: 'abc' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid id');
  });

  it('returns 404 when workflow is missing or not owned', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // loadOwned returns null
    const res = await workflowIdRoute.GET(makeReq('http://x/api/portal/workflows/1'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Workflow not found');
  });

  it('returns 200 with workflow row when found', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const row = { id: 11, clientId: 5, name: 'wf', status: 'draft' };
    selectQueue.push([row]);
    const res = await workflowIdRoute.GET(makeReq('http://x/api/portal/workflows/11'), {
      params: Promise.resolve({ id: '11' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject(row);
  });
});

// ===========================================================================
// PATCH /api/portal/workflows/[id]
// ===========================================================================

describe('PATCH /api/portal/workflows/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await workflowIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/workflows/1', 'PATCH', {}),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('propagates auth error response', async () => {
    authMock.mockResolvedValue(SESSION);
    const denied = {
      response: new Response(JSON.stringify({ success: false }), { status: 403 }),
    };
    authorizePortalMock.mockResolvedValue(denied);
    const res = await workflowIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/workflows/1', 'PATCH', {}),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(403);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue(null);
    const res = await workflowIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/workflows/1', 'PATCH', {}),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Client not found');
  });

  it('returns 400 when id is not numeric', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await workflowIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/workflows/oops', 'PATCH', {}),
      { params: Promise.resolve({ id: 'oops' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid id');
  });

  it('returns 404 when the workflow does not exist for this client', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // loadOwned -> null
    const res = await workflowIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/workflows/1', 'PATCH', { name: 'x' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Workflow not found');
  });

  it('returns 400 when status is not a valid value', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 11, clientId: 5 }]);
    const res = await workflowIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/workflows/11', 'PATCH', { status: 'bogus' }),
      { params: Promise.resolve({ id: '11' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid status');
    expect(updateCalls).toHaveLength(0);
  });

  it('applies partial updates and returns the updated row', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 11, clientId: 5 }]);
    updateReturnQueue.push([
      {
        id: 11,
        clientId: 5,
        name: 'renamed',
        description: 'new desc',
        status: 'active',
        trigger: { kind: 'crm_event' },
        graph: { nodes: [] },
      },
    ]);

    const res = await workflowIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/workflows/11', 'PATCH', {
        name: 'renamed',
        description: 'new desc',
        status: 'active',
        trigger: { kind: 'crm_event' },
        graph: { nodes: [] },
      }),
      { params: Promise.resolve({ id: '11' }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('renamed');
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('workflows');
    expect(updateCalls[0].patch).toMatchObject({
      name: 'renamed',
      description: 'new desc',
      status: 'active',
      trigger: { kind: 'crm_event' },
      graph: { nodes: [] },
    });
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
  });

  it('allows description to be explicitly null', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 11, clientId: 5 }]);
    updateReturnQueue.push([{ id: 11, description: null }]);

    const res = await workflowIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/workflows/11', 'PATCH', { description: null }),
      { params: Promise.resolve({ id: '11' }) },
    );

    expect(res.status).toBe(200);
    expect(updateCalls[0].patch).toHaveProperty('description', null);
  });

  it('handles non-JSON body gracefully and still touches updatedAt', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 11, clientId: 5 }]);
    updateReturnQueue.push([{ id: 11 }]);

    const res = await workflowIdRoute.PATCH(
      new Request('http://x/api/portal/workflows/11', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: 'not-json',
      }),
      { params: Promise.resolve({ id: '11' }) },
    );

    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    // Only updatedAt should have been set
    expect(Object.keys(updateCalls[0].patch)).toEqual(['updatedAt']);
  });
});

// ===========================================================================
// DELETE /api/portal/workflows/[id]
// ===========================================================================

describe('DELETE /api/portal/workflows/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await workflowIdRoute.DELETE(makeReq('http://x/api/portal/workflows/1'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(401);
  });

  it('propagates auth error response', async () => {
    authMock.mockResolvedValue(SESSION);
    const denied = {
      response: new Response(JSON.stringify({ success: false }), { status: 403 }),
    };
    authorizePortalMock.mockResolvedValue(denied);
    const res = await workflowIdRoute.DELETE(makeReq('http://x/api/portal/workflows/1'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue(null);
    const res = await workflowIdRoute.DELETE(makeReq('http://x/api/portal/workflows/1'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Client not found');
  });

  it('returns 400 when id is not numeric', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await workflowIdRoute.DELETE(makeReq('http://x/api/portal/workflows/abc'), {
      params: Promise.resolve({ id: 'abc' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid id');
    expect(deleteCalls).toHaveLength(0);
  });

  it('deletes the workflow scoped to client and returns success', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 5 });

    const res = await workflowIdRoute.DELETE(makeReq('http://x/api/portal/workflows/11'), {
      params: Promise.resolve({ id: '11' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('workflows');
  });
});

// ===========================================================================
// GET /api/portal/workflows/[id]/runs
// ===========================================================================

describe('GET /api/portal/workflows/[id]/runs', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await workflowRunsRoute.GET(makeReq('http://x/api/portal/workflows/1/runs'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(401);
  });

  it('propagates auth error response', async () => {
    authMock.mockResolvedValue(SESSION);
    const denied = {
      response: new Response(JSON.stringify({ success: false }), { status: 403 }),
    };
    authorizePortalMock.mockResolvedValue(denied);
    const res = await workflowRunsRoute.GET(makeReq('http://x/api/portal/workflows/1/runs'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue(null);
    const res = await workflowRunsRoute.GET(makeReq('http://x/api/portal/workflows/1/runs'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Client not found');
  });

  it('returns 400 when id is not numeric', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await workflowRunsRoute.GET(
      makeReq('http://x/api/portal/workflows/abc/runs'),
      { params: Promise.resolve({ id: 'abc' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid id');
  });

  it('returns 404 when workflow ownership check fails', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // ownership check
    const res = await workflowRunsRoute.GET(
      makeReq('http://x/api/portal/workflows/11/runs'),
      { params: Promise.resolve({ id: '11' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Workflow not found');
  });

  it('returns runs ordered by recency with default limit', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 11 }]); // ownership
    selectQueue.push([
      { id: 'r2', status: 'completed' },
      { id: 'r1', status: 'failed' },
    ]);

    const res = await workflowRunsRoute.GET(
      makeReq('http://x/api/portal/workflows/11/runs'),
      { params: Promise.resolve({ id: '11' }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].id).toBe('r2');
  });

  it('accepts ?limit query parameter (capped at 200)', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 11 }]); // ownership
    selectQueue.push([]);

    const res = await workflowRunsRoute.GET(
      makeReq('http://x/api/portal/workflows/11/runs?limit=999'),
      { params: Promise.resolve({ id: '11' }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('treats invalid limit value as default 50', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 11 }]); // ownership
    selectQueue.push([{ id: 'r1' }]);

    const res = await workflowRunsRoute.GET(
      makeReq('http://x/api/portal/workflows/11/runs?limit=notanumber'),
      { params: Promise.resolve({ id: '11' }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });
});

// ===========================================================================
// POST /api/portal/workflows/[id]/test-run
// ===========================================================================

describe('POST /api/portal/workflows/[id]/test-run', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await workflowTestRunRoute.POST(
      makeJsonReq('http://x/api/portal/workflows/1/test-run', 'POST', {}),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('propagates auth error response', async () => {
    authMock.mockResolvedValue(SESSION);
    const denied = {
      response: new Response(JSON.stringify({ success: false }), { status: 403 }),
    };
    authorizePortalMock.mockResolvedValue(denied);
    const res = await workflowTestRunRoute.POST(
      makeJsonReq('http://x/api/portal/workflows/1/test-run', 'POST', {}),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(403);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue(null);
    const res = await workflowTestRunRoute.POST(
      makeJsonReq('http://x/api/portal/workflows/1/test-run', 'POST', {}),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Client not found');
  });

  it('returns 400 when id is not numeric', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await workflowTestRunRoute.POST(
      makeJsonReq('http://x/api/portal/workflows/abc/test-run', 'POST', {}),
      { params: Promise.resolve({ id: 'abc' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid id');
  });

  it('returns 404 when workflow ownership check fails', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // ownership empty
    const res = await workflowTestRunRoute.POST(
      makeJsonReq('http://x/api/portal/workflows/11/test-run', 'POST', {}),
      { params: Promise.resolve({ id: '11' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Workflow not found');
  });

  it('runs workflow with synthetic context and returns success when completed', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 11 }]); // ownership
    runWorkflowMock.mockResolvedValue({
      status: 'completed',
      runId: 99,
      logs: [],
    });

    const res = await workflowTestRunRoute.POST(
      makeJsonReq('http://x/api/portal/workflows/11/test-run', 'POST', {
        context: { foo: 'bar' },
      }),
      { params: Promise.resolve({ id: '11' }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('completed');
    expect(runWorkflowMock).toHaveBeenCalledTimes(1);
    const [calledWfId, calledCtx, calledOpts] = runWorkflowMock.mock.calls[0];
    expect(calledWfId).toBe(11);
    expect(calledCtx).toMatchObject({ clientId: 5, foo: 'bar' });
    expect(typeof calledCtx.triggeredAt).toBe('string');
    expect(calledOpts).toEqual({ triggeredBy: 'test-run' });
  });

  it('returns success: false when runWorkflow status is not completed', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 11 }]); // ownership
    runWorkflowMock.mockResolvedValue({ status: 'failed', error: 'boom' });

    const res = await workflowTestRunRoute.POST(
      makeJsonReq('http://x/api/portal/workflows/11/test-run', 'POST', {}),
      { params: Promise.resolve({ id: '11' }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.data.status).toBe('failed');
  });

  it('handles non-JSON body and still runs with default context', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 11 }]); // ownership
    runWorkflowMock.mockResolvedValue({ status: 'completed' });

    const res = await workflowTestRunRoute.POST(
      new Request('http://x/api/portal/workflows/11/test-run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json',
      }),
      { params: Promise.resolve({ id: '11' }) },
    );

    expect(res.status).toBe(200);
    const ctx = runWorkflowMock.mock.calls[0][1];
    expect(ctx.clientId).toBe(5);
    expect(typeof ctx.triggeredAt).toBe('string');
  });
});
