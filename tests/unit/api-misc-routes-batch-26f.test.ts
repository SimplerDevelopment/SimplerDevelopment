// @vitest-environment node
/**
 * Unit tests for four admin API routes (batch 26f):
 *   - app/api/admin/portal/crm/deals/route.ts                       (GET)
 *   - app/api/admin/portal/crm/proposals/route.ts                   (GET)
 *   - app/api/admin/portal/ecommerce/route.ts                       (GET)
 *   - app/api/admin/portal/hosting/[id]/provision-domain/route.ts   (POST)
 *
 * All routes gate access via a `requireStaff()` helper that wraps `auth()`
 * and verifies the session's user role is `admin` or `employee`.
 *
 * The drizzle ORM and schema are mocked. The db mock supports thenable
 * select chains (with `from`/`leftJoin`/`innerJoin`/`where`/`orderBy`/`groupBy`/
 * `limit`/`offset`/`$dynamic`), and an update chain with `set().where().returning()`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  inArray: (a: unknown, vals: unknown) => ({ op: 'inArray', a, vals }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const obj: Record<string, unknown> = {
        __sql: true,
        strings: Array.from(strings),
        values,
      };
      (obj as { as: (alias: string) => unknown }).as = (alias: string) => ({
        __sql_as: alias,
        strings: Array.from(strings),
        values,
      });
      return obj;
    },
    {},
  ),
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
  return {
    crmDeals: wrap('crmDeals'),
    crmContacts: wrap('crmContacts'),
    crmCompanies: wrap('crmCompanies'),
    crmPipelines: wrap('crmPipelines'),
    crmPipelineStages: wrap('crmPipelineStages'),
    crmProposals: wrap('crmProposals'),
    clients: wrap('clients'),
    storeSettings: wrap('storeSettings'),
    orders: wrap('orders'),
    orderItems: wrap('orderItems'),
    products: wrap('products'),
    clientWebsites: wrap('clientWebsites'),
    users: wrap('users'),
    hostedSites: wrap('hostedSites'),
  };
});

// ---------------------------------------------------------------------------
// DB mock: thenable select chain + update chain
// ---------------------------------------------------------------------------

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
const updateSetCalls: Array<{ table: string; values: Record<string, unknown>; where: unknown }> = [];

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

    // A single chain object: every chain method (from, joins, orderBy, where,
    // groupBy, $dynamic, limit, offset) returns `chain`. The chain is itself
    // a thenable that resolves to the next queued result. This covers both
    // `db.select()...orderBy().$dynamic()[.where()]` and the
    // `db.select()...orderBy().limit().offset()` patterns the routes use.
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of [
      'from',
      'leftJoin',
      'innerJoin',
      'rightJoin',
      'where',
      'groupBy',
      'orderBy',
      '$dynamic',
      'limit',
      'offset',
    ]) {
      chain[m] = passthrough;
    }
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  function buildUpdate(table: { __table?: string } | undefined) {
    const tableName = (table && table.__table) || 'unknown';
    return {
      set(values: Record<string, unknown>) {
        return {
          where(w: unknown) {
            updateSetCalls.push({ table: tableName, values, where: w });
            const rows = updateReturnQueue.shift() ?? [{ ...values }];
            return {
              returning() {
                return Promise.resolve(rows);
              },
              then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                return Promise.resolve({ rowCount: rows.length }).then(onF, onR);
              },
            };
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
      update(table: { __table?: string } | undefined) {
        return buildUpdate(table);
      },
    },
  };
});

// ---- modules under test ----
const dealsRoute = await import('@/app/api/admin/portal/crm/deals/route');
const proposalsRoute = await import('@/app/api/admin/portal/crm/proposals/route');
const ecommerceRoute = await import('@/app/api/admin/portal/ecommerce/route');
const provisionDomainRoute = await import(
  '@/app/api/admin/portal/hosting/[id]/provision-domain/route'
);

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

function makeJsonReq(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ADMIN_SESSION = { user: { id: '1', name: 'Admin', role: 'admin' } };
const EMPLOYEE_SESSION = { user: { id: '2', name: 'Employee', role: 'employee' } };
const CLIENT_SESSION = { user: { id: '3', name: 'Client', role: 'client' } };

beforeEach(() => {
  selectQueue = [];
  updateReturnQueue = [];
  updateSetCalls.length = 0;
  authMock.mockReset();
});

// ===========================================================================
// GET /api/admin/portal/crm/deals
// ===========================================================================

describe('GET /api/admin/portal/crm/deals', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await dealsRoute.GET(makeReq('http://x/api/admin/portal/crm/deals'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/Unauthorized/);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await dealsRoute.GET(makeReq('http://x/api/admin/portal/crm/deals'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for non-staff roles (client)', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await dealsRoute.GET(makeReq('http://x/api/admin/portal/crm/deals'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when role is undefined', async () => {
    authMock.mockResolvedValue({ user: { id: '5' } });
    const res = await dealsRoute.GET(makeReq('http://x/api/admin/portal/crm/deals'));
    expect(res.status).toBe(401);
  });

  it('returns all deals for an admin (no status filter)', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([
      { id: 1, title: 'Deal A', value: '100', status: 'open' },
      { id: 2, title: 'Deal B', value: '200', status: 'won' },
    ]);
    const res = await dealsRoute.GET(makeReq('http://x/api/admin/portal/crm/deals'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].title).toBe('Deal A');
  });

  it('returns all deals for an employee', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    selectQueue.push([{ id: 1, title: 'Deal A' }]);
    const res = await dealsRoute.GET(makeReq('http://x/api/admin/portal/crm/deals'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });

  it('passes through the status query filter when not "all"', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([{ id: 9, title: 'Filtered', status: 'won' }]);
    const res = await dealsRoute.GET(
      makeReq('http://x/api/admin/portal/crm/deals?status=won'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].status).toBe('won');
  });

  it('ignores the status filter when value is "all"', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([{ id: 1 }, { id: 2 }]);
    const res = await dealsRoute.GET(
      makeReq('http://x/api/admin/portal/crm/deals?status=all'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
  });

  it('returns an empty array when there are no deals', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([]);
    const res = await dealsRoute.GET(makeReq('http://x/api/admin/portal/crm/deals'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

// ===========================================================================
// GET /api/admin/portal/crm/proposals
// ===========================================================================

describe('GET /api/admin/portal/crm/proposals', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await proposalsRoute.GET(
      makeReq('http://x/api/admin/portal/crm/proposals'),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/Unauthorized/);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await proposalsRoute.GET(
      makeReq('http://x/api/admin/portal/crm/proposals'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 for non-staff roles', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await proposalsRoute.GET(
      makeReq('http://x/api/admin/portal/crm/proposals'),
    );
    expect(res.status).toBe(401);
  });

  it('returns all proposals for admin (no status filter)', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([
      { id: 11, title: 'Proposal A', status: 'draft', lineItems: [] },
      { id: 12, title: 'Proposal B', status: 'sent', lineItems: [{ name: 'x' }] },
    ]);
    const res = await proposalsRoute.GET(
      makeReq('http://x/api/admin/portal/crm/proposals'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[1].status).toBe('sent');
  });

  it('returns all proposals for employee', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    selectQueue.push([{ id: 1, title: 'P', status: 'sent' }]);
    const res = await proposalsRoute.GET(
      makeReq('http://x/api/admin/portal/crm/proposals'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });

  it('filters by status when not "all"', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([{ id: 5, title: 'Signed', status: 'signed' }]);
    const res = await proposalsRoute.GET(
      makeReq('http://x/api/admin/portal/crm/proposals?status=signed'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].status).toBe('signed');
  });

  it('ignores status filter when value is "all"', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const res = await proposalsRoute.GET(
      makeReq('http://x/api/admin/portal/crm/proposals?status=all'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(3);
  });

  it('returns empty array when no proposals exist', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([]);
    const res = await proposalsRoute.GET(
      makeReq('http://x/api/admin/portal/crm/proposals'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

// ===========================================================================
// GET /api/admin/portal/ecommerce
// ===========================================================================

describe('GET /api/admin/portal/ecommerce', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await ecommerceRoute.GET(makeReq('http://x/api/admin/portal/ecommerce'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/Unauthorized/);
  });

  it('returns 401 for client role', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await ecommerceRoute.GET(makeReq('http://x/api/admin/portal/ecommerce'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await ecommerceRoute.GET(makeReq('http://x/api/admin/portal/ecommerce'));
    expect(res.status).toBe(401);
  });

  it('returns 400 for an unknown view', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    const res = await ecommerceRoute.GET(
      makeReq('http://x/api/admin/portal/ecommerce?view=garbage'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/Invalid view/);
  });

  describe('view=overview (default)', () => {
    it('returns stores + platform totals (empty)', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([]); // stores
      selectQueue.push([]); // orderStats
      const res = await ecommerceRoute.GET(makeReq('http://x/api/admin/portal/ecommerce'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.stores).toEqual([]);
      expect(body.data.platform).toEqual({
        totalStores: 0,
        activeStores: 0,
        totalRevenue: 0,
        totalPlatformFees: 0,
        totalOrders: 0,
        pendingOrders: 0,
      });
    });

    it('merges orderStats with stores by websiteId', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([
        {
          storeId: 1,
          websiteId: 10,
          enabled: true,
          storeName: 'Store A',
          currency: 'USD',
          stripeConnected: true,
          platformFeePercent: 5,
          websiteName: 'Site A',
          domain: 'a.example',
          clientCompany: 'Acme',
          clientName: 'Alice',
        },
        {
          storeId: 2,
          websiteId: 20,
          enabled: false,
          storeName: 'Store B',
          currency: 'USD',
          stripeConnected: false,
          platformFeePercent: 5,
          websiteName: 'Site B',
          domain: 'b.example',
          clientCompany: 'Beta',
          clientName: 'Bob',
        },
      ]);
      selectQueue.push([
        { websiteId: 10, totalOrders: 3, totalRevenue: 300, totalPlatformFees: 15, pendingOrders: 1 },
        // No row for websiteId 20 → defaults
      ]);
      const res = await ecommerceRoute.GET(
        makeReq('http://x/api/admin/portal/ecommerce?view=overview'),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.stores).toHaveLength(2);
      const a = body.data.stores.find((s: { storeId: number }) => s.storeId === 1);
      const b = body.data.stores.find((s: { storeId: number }) => s.storeId === 2);
      expect(a.totalOrders).toBe(3);
      expect(a.totalRevenue).toBe(300);
      expect(a.totalPlatformFees).toBe(15);
      expect(a.pendingOrders).toBe(1);
      expect(b.totalOrders).toBe(0);
      expect(b.totalRevenue).toBe(0);
      expect(body.data.platform).toEqual({
        totalStores: 2,
        activeStores: 1, // only store A enabled
        totalRevenue: 300,
        totalPlatformFees: 15,
        totalOrders: 3,
        pendingOrders: 1,
      });
    });

    it('coerces string-valued numeric stats safely', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([
        {
          storeId: 1,
          websiteId: 7,
          enabled: true,
          storeName: 'S',
          clientCompany: 'C',
        },
      ]);
      // String values simulate pg numeric type
      selectQueue.push([
        {
          websiteId: 7,
          totalOrders: '4',
          totalRevenue: '99.50',
          totalPlatformFees: '5.00',
          pendingOrders: '2',
        },
      ]);
      const res = await ecommerceRoute.GET(
        makeReq('http://x/api/admin/portal/ecommerce?view=overview'),
      );
      const body = await res.json();
      expect(body.data.platform.totalRevenue).toBe(99.5);
      expect(body.data.platform.totalOrders).toBe(4);
      expect(body.data.platform.pendingOrders).toBe(2);
    });
  });

  describe('view=orders', () => {
    it('returns paginated orders with default page/limit', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([
        {
          id: 1,
          orderNumber: 'O-1',
          customerName: 'Cust',
          customerEmail: 'a@b',
          total: 50,
          platformFee: 2.5,
          status: 'paid',
          paymentStatus: 'paid',
          createdAt: '2026-01-01',
          websiteName: 'Site',
          websiteId: 10,
        },
      ]);
      selectQueue.push([{ total: 17 }]); // count query
      const res = await ecommerceRoute.GET(
        makeReq('http://x/api/admin/portal/ecommerce?view=orders'),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.orders).toHaveLength(1);
      expect(body.data.total).toBe(17);
      expect(body.data.page).toBe(1);
      expect(body.data.limit).toBe(50);
    });

    it('respects custom page + limit query params', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([]);
      selectQueue.push([{ total: 0 }]);
      const res = await ecommerceRoute.GET(
        makeReq('http://x/api/admin/portal/ecommerce?view=orders&page=3&limit=10'),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.page).toBe(3);
      expect(body.data.limit).toBe(10);
      expect(body.data.orders).toEqual([]);
      expect(body.data.total).toBe(0);
    });
  });
});

// ===========================================================================
// POST /api/admin/portal/hosting/[id]/provision-domain
// ===========================================================================

describe('POST /api/admin/portal/hosting/[id]/provision-domain', () => {
  function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await provisionDomainRoute.POST(
      makeJsonReq('http://x/api/admin/portal/hosting/1/provision-domain', {
        customDomain: 'foo.example.com',
      }),
      makeParams('1'),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/Unauthorized/);
  });

  it('returns 401 when role is client', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await provisionDomainRoute.POST(
      makeJsonReq('http://x/api/admin/portal/hosting/1/provision-domain', {
        customDomain: 'foo.example.com',
      }),
      makeParams('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await provisionDomainRoute.POST(
      makeJsonReq('http://x/api/admin/portal/hosting/1/provision-domain', {
        customDomain: 'foo.example.com',
      }),
      makeParams('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when customDomain is missing', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    const res = await provisionDomainRoute.POST(
      makeJsonReq('http://x/api/admin/portal/hosting/1/provision-domain', {}),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/customDomain is required/);
  });

  it('returns 404 when the hosted site does not exist', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([]); // site lookup empty
    const res = await provisionDomainRoute.POST(
      makeJsonReq('http://x/api/admin/portal/hosting/99/provision-domain', {
        customDomain: 'foo.example.com',
      }),
      makeParams('99'),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/Not found/);
  });

  it('generates a CNAME pointing at the Railway domain when present (apex)', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([
      { id: 1, railwayDomain: 'svc.up.railway.app' },
    ]);
    updateReturnQueue.push([
      {
        id: 1,
        customDomain: 'example.com',
        railwayDomain: 'svc.up.railway.app',
        status: 'provisioning',
      },
    ]);
    const res = await provisionDomainRoute.POST(
      makeJsonReq('http://x/api/admin/portal/hosting/1/provision-domain', {
        customDomain: 'example.com',
      }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/Domain provisioned/);
    expect(updateSetCalls).toHaveLength(1);
    const [u] = updateSetCalls;
    expect(u.table).toBe('hostedSites');
    expect(u.values.customDomain).toBe('example.com');
    expect(u.values.status).toBe('provisioning');
    const dns = u.values.dnsInstructions as Array<Record<string, string>>;
    expect(dns).toHaveLength(1);
    expect(dns[0].type).toBe('CNAME');
    expect(dns[0].host).toBe('@'); // apex
    expect(dns[0].value).toBe('svc.up.railway.app');
    expect(u.values.updatedAt).toBeInstanceOf(Date);
  });

  it('uses "www" host when customDomain starts with www.', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([{ id: 2, railwayDomain: 'svc.up.railway.app' }]);
    updateReturnQueue.push([{ id: 2, customDomain: 'www.example.com' }]);
    const res = await provisionDomainRoute.POST(
      makeJsonReq('http://x/api/admin/portal/hosting/2/provision-domain', {
        customDomain: 'www.example.com',
      }),
      makeParams('2'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toMatch(/Domain provisioned/);
    const dns = updateSetCalls[0].values.dnsInstructions as Array<Record<string, string>>;
    expect(dns[0].host).toBe('www');
    expect(dns[0].value).toBe('svc.up.railway.app');
  });

  it('returns the pending message when railwayDomain is not yet assigned', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([{ id: 3, railwayDomain: null }]);
    updateReturnQueue.push([{ id: 3, customDomain: 'pending.example.com' }]);
    const res = await provisionDomainRoute.POST(
      makeJsonReq('http://x/api/admin/portal/hosting/3/provision-domain', {
        customDomain: 'pending.example.com',
      }),
      makeParams('3'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/Railway domain not yet assigned/);
    const dns = updateSetCalls[0].values.dnsInstructions as Array<Record<string, string>>;
    expect(dns[0].value).toContain('<pending');
    expect(dns[0].notes).toMatch(/Railway domain must be generated first/);
  });

  it('accepts an employee role', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    selectQueue.push([{ id: 4, railwayDomain: 'r.up.railway.app' }]);
    updateReturnQueue.push([{ id: 4, customDomain: 'emp.example.com' }]);
    const res = await provisionDomainRoute.POST(
      makeJsonReq('http://x/api/admin/portal/hosting/4/provision-domain', {
        customDomain: 'emp.example.com',
      }),
      makeParams('4'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
