// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 24f):
 *   - app/api/portal/settings/billing/route.ts   (GET)
 *   - app/api/portal/credits/route.ts            (GET)
 *   - app/api/portal/hosting/route.ts            (GET)
 *   - app/api/portal/services/nav/route.ts       (GET)
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
  isAuthError: (v: unknown) => isAuthErrorMock(v),
}));

const getBalanceMock = vi.fn();
const getLedgerMock = vi.fn();
const getMonthlyUsageMock = vi.fn();
const getCreditPackagesMock = vi.fn();
vi.mock('@/lib/ai-credits', () => ({
  getBalance: (...args: unknown[]) => getBalanceMock(...args),
  getLedger: (...args: unknown[]) => getLedgerMock(...args),
  getMonthlyUsage: (...args: unknown[]) => getMonthlyUsageMock(...args),
  getCreditPackages: (...args: unknown[]) => getCreditPackagesMock(...args),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    op: 'sql',
    strings: Array.from(strings),
    values,
  }),
}));

vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          if (prop === '$inferSelect') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return {
    invoices: wrap('invoices'),
    clientServices: wrap('clientServices'),
    services: wrap('services'),
    hostedSites: wrap('hostedSites'),
  };
});

// ---------------------------------------------------------------------------
// DB mock: thenable select chain
// ---------------------------------------------------------------------------

let selectQueue: Array<Array<Record<string, unknown>>> = [];

function shiftNext(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) materializedPromise = Promise.resolve(shiftNext());
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'groupBy']) {
      chain[m] = passthrough;
    }
    chain.orderBy = () => {
      materialize();
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
        limit() {
          return {
            then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
              return materializedPromise!.then(onF, onR);
            },
          };
        },
      };
    };
    chain.limit = () => {
      materialize();
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
      };
    };
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  return {
    db: {
      select() {
        return buildSelect();
      },
    },
  };
});

// ---- modules under test ----
const settingsBillingRoute = await import('@/app/api/portal/settings/billing/route');
const creditsRoute = await import('@/app/api/portal/credits/route');
const hostingRoute = await import('@/app/api/portal/hosting/route');
const servicesNavRoute = await import('@/app/api/portal/services/nav/route');

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

const SESSION = { user: { id: '7', name: 'Bob' } };

beforeEach(() => {
  selectQueue = [];
  authMock.mockReset();
  getPortalClientMock.mockReset();
  authorizePortalMock.mockReset();
  isAuthErrorMock.mockReset();
  getBalanceMock.mockReset();
  getLedgerMock.mockReset();
  getMonthlyUsageMock.mockReset();
  getCreditPackagesMock.mockReset();
  vi.restoreAllMocks();
});

// ===========================================================================
// portal/settings/billing
// ===========================================================================

describe('GET /api/portal/settings/billing', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await settingsBillingRoute.GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await settingsBillingRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await settingsBillingRoute.GET();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/Client not found/);
  });

  it('returns invoices, services, and stripeCustomerId', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42, stripeCustomerId: 'cus_abc' });
    // First select -> invoices, second select -> activeServices
    selectQueue.push([
      { id: 100, clientId: 42, amount: 9900, status: 'paid' },
      { id: 101, clientId: 42, amount: 4200, status: 'open' },
    ]);
    selectQueue.push([
      {
        id: 1,
        status: 'active',
        startDate: '2024-01-01',
        renewalDate: '2026-01-01',
        serviceName: 'Hosting Plus',
        serviceCategory: 'hosting',
        servicePrice: '49.00',
        billingCycle: 'monthly',
      },
    ]);
    const res = await settingsBillingRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.invoices).toHaveLength(2);
    expect(body.data.services).toHaveLength(1);
    expect(body.data.services[0].serviceName).toBe('Hosting Plus');
    expect(body.data.stripeCustomerId).toBe('cus_abc');
  });

  it('parses user id from session string into integer', async () => {
    authMock.mockResolvedValue({ user: { id: '99' } });
    getPortalClientMock.mockResolvedValue({ id: 1, stripeCustomerId: null });
    selectQueue.push([]);
    selectQueue.push([]);
    const res = await settingsBillingRoute.GET();
    expect(res.status).toBe(200);
    expect(getPortalClientMock).toHaveBeenCalledWith(99);
  });
});

// ===========================================================================
// portal/credits
// ===========================================================================

describe('GET /api/portal/credits', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await creditsRoute.GET(makeReq('http://x/api/portal/credits'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await creditsRoute.GET(makeReq('http://x/api/portal/credits'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('No client');
  });

  it('returns balance, monthly usage, ledger, and mapped packages', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 50 });
    getBalanceMock.mockResolvedValue({
      balance: 12345,
      monthlyGrant: 10000,
      payAsYouGo: true,
    });
    getMonthlyUsageMock.mockResolvedValue(2500);
    getLedgerMock.mockResolvedValue([
      { id: 1, amount: -100, kind: 'spend' },
      { id: 2, amount: 10000, kind: 'grant' },
    ]);
    getCreditPackagesMock.mockResolvedValue([
      {
        id: 'pkg_1',
        name: 'Starter',
        tokens: 50_000,
        price: '5.00',
        extra: 'should be stripped',
      },
      {
        id: 'pkg_2',
        name: 'Pro',
        tokens: 250_000,
        price: '20.00',
        extra: 'stripped too',
      },
    ]);
    const res = await creditsRoute.GET(
      makeReq('http://x/api/portal/credits?limit=5&offset=10'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.balance).toBe(12345);
    expect(body.monthlyGrant).toBe(10000);
    expect(body.payAsYouGo).toBe(true);
    expect(body.monthlyUsage).toBe(2500);
    expect(body.ledger).toHaveLength(2);
    expect(body.packages).toEqual([
      { id: 'pkg_1', name: 'Starter', tokens: 50_000, price: '5.00' },
      { id: 'pkg_2', name: 'Pro', tokens: 250_000, price: '20.00' },
    ]);
    expect(getLedgerMock).toHaveBeenCalledWith(50, { limit: 5, offset: 10 });
  });

  it('defaults limit=20 and offset=0 when query params absent', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 7 });
    getBalanceMock.mockResolvedValue({ balance: 0, monthlyGrant: 0, payAsYouGo: false });
    getMonthlyUsageMock.mockResolvedValue(0);
    getLedgerMock.mockResolvedValue([]);
    getCreditPackagesMock.mockResolvedValue([]);
    const res = await creditsRoute.GET(makeReq('http://x/api/portal/credits'));
    expect(res.status).toBe(200);
    expect(getLedgerMock).toHaveBeenCalledWith(7, { limit: 20, offset: 0 });
  });
});

// ===========================================================================
// portal/hosting
// ===========================================================================

describe('GET /api/portal/hosting', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await hostingRoute.GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns the auth error response when service check fails', async () => {
    authMock.mockResolvedValue(SESSION);
    const errorResp = new Response(
      JSON.stringify({ success: false, message: 'No hosting service' }),
      { status: 403 },
    );
    authorizePortalMock.mockResolvedValue({ response: errorResp });
    isAuthErrorMock.mockReturnValue(true);
    const res = await hostingRoute.GET();
    expect(res).toBe(errorResp);
    expect(res.status).toBe(403);
  });

  it('returns 404 when portal client missing after authorization', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 1 }, userId: 7, role: 'owner' });
    isAuthErrorMock.mockReturnValue(false);
    getPortalClientMock.mockResolvedValue(null);
    const res = await hostingRoute.GET();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/Client not found/);
  });

  it('returns the hosted sites belonging to the client', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 21 }, userId: 7, role: 'owner' });
    isAuthErrorMock.mockReturnValue(false);
    getPortalClientMock.mockResolvedValue({ id: 21 });
    selectQueue.push([
      { id: 1, clientId: 21, domain: 'example.com', status: 'active' },
      { id: 2, clientId: 21, domain: 'foo.test', status: 'pending' },
    ]);
    const res = await hostingRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].domain).toBe('example.com');
    expect(authorizePortalMock).toHaveBeenCalledWith({
      action: 'read',
      requireService: 'hosting',
    });
  });
});

// ===========================================================================
// portal/services/nav
// ===========================================================================

describe('GET /api/portal/services/nav', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await servicesNavRoute.GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns empty data when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await servicesNavRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('filters out hidden categories (hosting) and maps icon + href', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      { id: 1, name: 'Website', category: 'cms', active: true },
      { id: 2, name: 'Email', category: 'email', active: true },
      { id: 3, name: 'Hosting', category: 'hosting', active: true }, // hidden
      { id: 4, name: 'Custom', category: 'unknown-thing', active: true },
    ]);
    selectQueue.push([
      { serviceId: 1, status: 'active' },
      { serviceId: 2, status: 'cancelled' },
    ]);
    const res = await servicesNavRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // hosting filtered out -> 3 left
    expect(body.data).toHaveLength(3);

    const byId = Object.fromEntries(
      (body.data as Array<Record<string, unknown>>).map(s => [s.id, s]),
    );
    expect(byId[1]).toMatchObject({
      name: 'Website',
      icon: 'language',
      href: '/portal/websites',
      subscribed: true, // status 'active'
    });
    expect(byId[2]).toMatchObject({
      name: 'Email',
      icon: 'email',
      href: '/portal/email',
      subscribed: false, // status 'cancelled' -> not subscribed
    });
    // unknown category falls back to default icon + request href
    expect(byId[4]).toMatchObject({
      name: 'Custom',
      icon: 'category',
      href: '/portal/services/4/request',
      subscribed: false,
    });
    // hosting must NOT appear
    expect(body.data.find((s: { category: string }) => s.category === 'hosting')).toBeUndefined();
  });

  it('returns empty array when no services match', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]);
    selectQueue.push([]);
    const res = await servicesNavRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});
