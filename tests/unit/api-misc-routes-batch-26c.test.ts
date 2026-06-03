// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 26c):
 *   - app/api/admin/portal/automations/route.ts                                                 (GET, PATCH)
 *   - app/api/admin/portal/clients/[id]/billing/metered-items/route.ts                          (GET, POST)
 *   - app/api/admin/portal/clients/[id]/billing/metered-items/[itemId]/route.ts                 (PATCH, DELETE)
 *   - app/api/admin/portal/clients/[id]/billing/usage/route.ts                                  (GET, POST)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

// Metered-items helpers
const getMeteredItemMock = vi.fn();
const updateMeteredItemMock = vi.fn();
const deleteMeteredItemMock = vi.fn();
const listMeteredItemsForClientMock = vi.fn();
const insertMeteredItemMock = vi.fn();
vi.mock('@/lib/billing/metered-items', () => ({
  getMeteredItem: (...args: unknown[]) => getMeteredItemMock(...args),
  updateMeteredItem: (...args: unknown[]) => updateMeteredItemMock(...args),
  deleteMeteredItem: (...args: unknown[]) => deleteMeteredItemMock(...args),
  listMeteredItemsForClient: (...args: unknown[]) => listMeteredItemsForClientMock(...args),
  insertMeteredItem: (...args: unknown[]) => insertMeteredItemMock(...args),
}));

// Stripe helper
const createMeteredItemForSubscriptionMock = vi.fn();
vi.mock('@/lib/stripe', () => ({
  createMeteredItemForSubscription: (...args: unknown[]) =>
    createMeteredItemForSubscriptionMock(...args),
}));

// Usage rollup helpers
const rollupClientPeriodMock = vi.fn();
const currentPeriodUtcMock = vi.fn(() => '2026-05');
vi.mock('@/lib/billing/usage-rollup', () => ({
  rollupClientPeriod: (...args: unknown[]) => rollupClientPeriodMock(...args),
  currentPeriodUtc: () => currentPeriodUtcMock(),
}));

// drizzle-orm helpers
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  count: () => ({ op: 'count' }),
  sum: (a: unknown) => ({ op: 'sum', a }),
  inArray: (a: unknown, vals: unknown) => ({ op: 'inArray', a, vals }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings: Array.from(strings),
      values,
    }),
    {
      raw: (s: string) => ({ op: 'sql-raw', s }),
    },
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
}));

vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          if (prop === '$inferSelect') return undefined;
          if (prop === '$inferInsert') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    automationRules: wrap('automationRules'),
    automationLogs: wrap('automationLogs'),
    clients: wrap('clients'),
    users: wrap('users'),
    usageMeterEvents: wrap('usageMeterEvents'),
    usageBillingPeriods: wrap('usageBillingPeriods'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// DB mock: thenable select chain + update chain
// ---------------------------------------------------------------------------

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturning: Array<Array<Record<string, unknown>>> = [];

function shiftNext(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}
function shiftUpdateReturning(): Array<Record<string, unknown>> {
  return updateReturning.shift() ?? [];
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

  function buildUpdate() {
    return {
      set() {
        return {
          where() {
            return {
              returning() {
                return Promise.resolve(shiftUpdateReturning());
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
      update() {
        return buildUpdate();
      },
    },
  };
});

// ---- modules under test ----
const automationsRoute = await import('@/app/api/admin/portal/automations/route');
const meteredItemsListRoute = await import(
  '@/app/api/admin/portal/clients/[id]/billing/metered-items/route'
);
const meteredItemRoute = await import(
  '@/app/api/admin/portal/clients/[id]/billing/metered-items/[itemId]/route'
);
const usageRoute = await import(
  '@/app/api/admin/portal/clients/[id]/billing/usage/route'
);

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}
function makeJsonReq(url: string, body: unknown, method = 'POST'): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function paramsFor<T>(p: T): Promise<T> {
  return Promise.resolve(p);
}

const ADMIN_SESSION = { user: { id: '1', role: 'admin' } };
const EMPLOYEE_SESSION = { user: { id: '2', role: 'employee' } };
const CLIENT_SESSION = { user: { id: '3', role: 'client' } };

beforeEach(() => {
  selectQueue = [];
  updateReturning = [];
  authMock.mockReset();
  getMeteredItemMock.mockReset();
  updateMeteredItemMock.mockReset();
  deleteMeteredItemMock.mockReset();
  listMeteredItemsForClientMock.mockReset();
  insertMeteredItemMock.mockReset();
  createMeteredItemForSubscriptionMock.mockReset();
  rollupClientPeriodMock.mockReset();
  currentPeriodUtcMock.mockReset();
  currentPeriodUtcMock.mockReturnValue('2026-05');
});

// ===========================================================================
// admin/portal/automations
// ===========================================================================

describe('admin/portal/automations route', () => {
  describe('GET', () => {
    it('returns 401 when not signed in', async () => {
      authMock.mockResolvedValue(null);
      const res = await automationsRoute.GET();
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.message).toMatch(/Unauthorized/);
    });

    it('returns 401 when user role is client', async () => {
      authMock.mockResolvedValue(CLIENT_SESSION);
      const res = await automationsRoute.GET();
      expect(res.status).toBe(401);
    });

    it('returns 401 when session.user.id missing', async () => {
      authMock.mockResolvedValue({ user: {} });
      const res = await automationsRoute.GET();
      expect(res.status).toBe(401);
    });

    it('returns rules and aggregated stats for admin', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      // First select: rules with joined columns
      selectQueue.push([
        {
          id: 1, name: 'A', description: 'a',
          enabled: true, executionCount: 5, lastExecutedAt: null,
          source: 'system', productScope: 'all', createdAt: new Date(),
          company: 'Acme', clientName: 'Alice',
        },
        {
          id: 2, name: 'B', description: 'b',
          enabled: false, executionCount: 3, lastExecutedAt: null,
          source: 'system', productScope: 'all', createdAt: new Date(),
          company: 'Beta', clientName: 'Bob',
        },
      ]);
      // Second select: failed count
      selectQueue.push([{ count: 7 }]);

      const res = await automationsRoute.GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.stats.totalRules).toBe(2);
      expect(body.stats.enabledRules).toBe(1);
      expect(body.stats.totalExecutions).toBe(8);
      expect(body.stats.failedCount).toBe(7);
    });

    it('defaults failedCount to 0 when no failure row', async () => {
      authMock.mockResolvedValue(EMPLOYEE_SESSION);
      selectQueue.push([]); // rules
      selectQueue.push([]); // failed count (empty array)
      const res = await automationsRoute.GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.stats.failedCount).toBe(0);
      expect(body.stats.totalRules).toBe(0);
      expect(body.stats.enabledRules).toBe(0);
      expect(body.stats.totalExecutions).toBe(0);
    });
  });

  describe('PATCH', () => {
    it('returns 401 when unauthorized', async () => {
      authMock.mockResolvedValue(null);
      const res = await automationsRoute.PATCH(
        makeJsonReq('http://x/api/admin/portal/automations', { id: 1, enabled: true }, 'PATCH'),
      );
      expect(res.status).toBe(401);
    });

    it('returns 400 when id is not a number', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      const res = await automationsRoute.PATCH(
        makeJsonReq('http://x/api/admin/portal/automations', { id: 'x', enabled: true }, 'PATCH'),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/Invalid payload/);
    });

    it('returns 400 when enabled is not a boolean', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      const res = await automationsRoute.PATCH(
        makeJsonReq('http://x/api/admin/portal/automations', { id: 1, enabled: 'yes' }, 'PATCH'),
      );
      expect(res.status).toBe(400);
    });

    it('updates rule and returns the row', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      updateReturning.push([{ id: 1, enabled: false }]);
      const res = await automationsRoute.PATCH(
        makeJsonReq('http://x/api/admin/portal/automations', { id: 1, enabled: false }, 'PATCH'),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ id: 1, enabled: false });
    });
  });
});

// ===========================================================================
// admin/portal/clients/:id/billing/metered-items (LIST/CREATE)
// ===========================================================================

describe('admin/portal/clients/[id]/billing/metered-items route', () => {
  const URL_BASE = 'http://x/api/admin/portal/clients/5/billing/metered-items';

  describe('GET', () => {
    it('returns 401 when unauthorized', async () => {
      authMock.mockResolvedValue(null);
      const res = await meteredItemsListRoute.GET(
        makeReq(URL_BASE),
        { params: paramsFor({ id: '5' }) },
      );
      expect(res.status).toBe(401);
    });

    it('returns 401 for client role', async () => {
      authMock.mockResolvedValue(CLIENT_SESSION);
      const res = await meteredItemsListRoute.GET(
        makeReq(URL_BASE),
        { params: paramsFor({ id: '5' }) },
      );
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid client id', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      const res = await meteredItemsListRoute.GET(
        makeReq(URL_BASE),
        { params: paramsFor({ id: 'abc' }) },
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/Invalid client id/);
    });

    it('returns list of metered items for the client', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      listMeteredItemsForClientMock.mockResolvedValue([
        { id: 1, clientId: 5, resource: 'leads' },
      ]);
      const res = await meteredItemsListRoute.GET(
        makeReq(URL_BASE),
        { params: paramsFor({ id: '5' }) },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(listMeteredItemsForClientMock).toHaveBeenCalledWith(5);
    });
  });

  describe('POST', () => {
    it('returns 401 when unauthorized', async () => {
      authMock.mockResolvedValue(null);
      const res = await meteredItemsListRoute.POST(
        makeJsonReq(URL_BASE, {}),
        { params: paramsFor({ id: '5' }) },
      );
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid client id', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      const res = await meteredItemsListRoute.POST(
        makeJsonReq(URL_BASE, {}),
        { params: paramsFor({ id: 'abc' }) },
      );
      expect(res.status).toBe(400);
    });

    it('returns 400 on invalid JSON body', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      const req = new Request(URL_BASE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json{',
      });
      const res = await meteredItemsListRoute.POST(req, { params: paramsFor({ id: '5' }) });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/Invalid JSON body/);
    });

    it('returns 400 when resource missing', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      const res = await meteredItemsListRoute.POST(
        makeJsonReq(URL_BASE, { unitPriceCents: 100 }),
        { params: paramsFor({ id: '5' }) },
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/resource is required/);
    });

    it('returns 400 when unitPriceCents missing', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      const res = await meteredItemsListRoute.POST(
        makeJsonReq(URL_BASE, { resource: 'leads' }),
        { params: paramsFor({ id: '5' }) },
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/unitPriceCents/);
    });

    it('returns 400 when unitPriceCents is Infinity', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      const res = await meteredItemsListRoute.POST(
        makeJsonReq(URL_BASE, { resource: 'leads', unitPriceCents: Number.POSITIVE_INFINITY }),
        { params: paramsFor({ id: '5' }) },
      );
      expect(res.status).toBe(400);
    });

    it('creates via Stripe path when stripePriceId + stripeSubscriptionId supplied', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      createMeteredItemForSubscriptionMock.mockResolvedValue({ id: 99, ok: true });
      const res = await meteredItemsListRoute.POST(
        makeJsonReq(URL_BASE, {
          resource: 'leads',
          unitPriceCents: 250,
          includedQuantity: 10,
          stripePriceId: 'price_X',
          stripeSubscriptionId: 'sub_Y',
        }),
        { params: paramsFor({ id: '5' }) },
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ id: 99, ok: true });
      expect(createMeteredItemForSubscriptionMock).toHaveBeenCalledWith(
        5,
        'sub_Y',
        'price_X',
        { resource: 'leads', unitPriceCents: 250, includedQuantity: 10 },
      );
    });

    it('defaults includedQuantity to 0 when omitted (Stripe path)', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      createMeteredItemForSubscriptionMock.mockResolvedValue({ id: 1 });
      await meteredItemsListRoute.POST(
        makeJsonReq(URL_BASE, {
          resource: 'leads',
          unitPriceCents: 100,
          stripePriceId: 'price_X',
          stripeSubscriptionId: 'sub_Y',
        }),
        { params: paramsFor({ id: '5' }) },
      );
      expect(createMeteredItemForSubscriptionMock).toHaveBeenCalledWith(
        5,
        'sub_Y',
        'price_X',
        expect.objectContaining({ includedQuantity: 0 }),
      );
    });

    it('returns 502 with error message when Stripe path throws Error', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      createMeteredItemForSubscriptionMock.mockRejectedValue(new Error('stripe-boom'));
      const res = await meteredItemsListRoute.POST(
        makeJsonReq(URL_BASE, {
          resource: 'leads',
          unitPriceCents: 100,
          stripePriceId: 'price_X',
          stripeSubscriptionId: 'sub_Y',
        }),
        { params: paramsFor({ id: '5' }) },
      );
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.message).toBe('stripe-boom');
    });

    it('returns 502 with fallback message for non-Error throw', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      createMeteredItemForSubscriptionMock.mockRejectedValue('weird');
      const res = await meteredItemsListRoute.POST(
        makeJsonReq(URL_BASE, {
          resource: 'leads',
          unitPriceCents: 100,
          stripePriceId: 'price_X',
          stripeSubscriptionId: 'sub_Y',
        }),
        { params: paramsFor({ id: '5' }) },
      );
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.message).toMatch(/Stripe error/);
    });

    it('returns 400 when neither path is fully supplied', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      // Missing stripeSubscriptionId on path 2
      const res = await meteredItemsListRoute.POST(
        makeJsonReq(URL_BASE, {
          resource: 'leads',
          unitPriceCents: 100,
          stripeSubscriptionItemId: 'si_X',
        }),
        { params: paramsFor({ id: '5' }) },
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/Either/);
    });

    it('persists mapping on path 2 when stripeSubscriptionItemId + stripeSubscriptionId supplied', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      insertMeteredItemMock.mockResolvedValue({ id: 42 });
      const res = await meteredItemsListRoute.POST(
        makeJsonReq(URL_BASE, {
          resource: 'leads',
          unitPriceCents: 100,
          stripeSubscriptionId: 'sub_Z',
          stripeSubscriptionItemId: 'si_Z',
          includedQuantity: 5,
        }),
        { params: paramsFor({ id: '5' }) },
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data).toEqual({ id: 42 });
      expect(insertMeteredItemMock).toHaveBeenCalledWith({
        clientId: 5,
        stripeSubscriptionId: 'sub_Z',
        stripeSubscriptionItemId: 'si_Z',
        resource: 'leads',
        unitPriceCents: 100,
        includedQuantity: 5,
      });
    });

    it('defaults includedQuantity to 0 on path 2 when omitted', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      insertMeteredItemMock.mockResolvedValue({ id: 99 });
      await meteredItemsListRoute.POST(
        makeJsonReq(URL_BASE, {
          resource: 'leads',
          unitPriceCents: 100,
          stripeSubscriptionId: 'sub_Z',
          stripeSubscriptionItemId: 'si_Z',
        }),
        { params: paramsFor({ id: '5' }) },
      );
      expect(insertMeteredItemMock).toHaveBeenCalledWith(
        expect.objectContaining({ includedQuantity: 0 }),
      );
    });
  });
});

// ===========================================================================
// admin/portal/clients/:id/billing/metered-items/:itemId (PATCH/DELETE)
// ===========================================================================

describe('admin/portal/clients/[id]/billing/metered-items/[itemId] route', () => {
  const URL_BASE = 'http://x/api/admin/portal/clients/5/billing/metered-items/7';
  const PARAMS = { params: paramsFor({ id: '5', itemId: '7' }) };

  describe('PATCH', () => {
    it('returns 401 when unauthorized', async () => {
      authMock.mockResolvedValue(null);
      const res = await meteredItemRoute.PATCH(makeJsonReq(URL_BASE, {}, 'PATCH'), PARAMS);
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid id', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      const res = await meteredItemRoute.PATCH(
        makeJsonReq(URL_BASE, {}, 'PATCH'),
        { params: paramsFor({ id: 'abc', itemId: '7' }) },
      );
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid itemId', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      const res = await meteredItemRoute.PATCH(
        makeJsonReq(URL_BASE, {}, 'PATCH'),
        { params: paramsFor({ id: '5', itemId: 'xx' }) },
      );
      expect(res.status).toBe(400);
    });

    it('returns 404 when item not found', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      getMeteredItemMock.mockResolvedValue(null);
      const res = await meteredItemRoute.PATCH(makeJsonReq(URL_BASE, {}, 'PATCH'), PARAMS);
      expect(res.status).toBe(404);
    });

    it('returns 404 when item belongs to a different client', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      getMeteredItemMock.mockResolvedValue({ id: 7, clientId: 999 });
      const res = await meteredItemRoute.PATCH(makeJsonReq(URL_BASE, {}, 'PATCH'), PARAMS);
      expect(res.status).toBe(404);
    });

    it('returns 400 on invalid JSON body', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      getMeteredItemMock.mockResolvedValue({ id: 7, clientId: 5 });
      const req = new Request(URL_BASE, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: 'not-json{',
      });
      const res = await meteredItemRoute.PATCH(req, PARAMS);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/Invalid JSON body/);
    });

    it('returns 400 for invalid status value', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      getMeteredItemMock.mockResolvedValue({ id: 7, clientId: 5 });
      const res = await meteredItemRoute.PATCH(
        makeJsonReq(URL_BASE, { status: 'bogus' }, 'PATCH'),
        PARAMS,
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/Invalid status/);
    });

    it('returns 400 when unitPriceCents is not a number', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      getMeteredItemMock.mockResolvedValue({ id: 7, clientId: 5 });
      const res = await meteredItemRoute.PATCH(
        makeJsonReq(URL_BASE, { unitPriceCents: 'abc' }, 'PATCH'),
        PARAMS,
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/unitPriceCents/);
    });

    it('returns 400 when includedQuantity is not a number', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      getMeteredItemMock.mockResolvedValue({ id: 7, clientId: 5 });
      const res = await meteredItemRoute.PATCH(
        makeJsonReq(URL_BASE, { includedQuantity: 'nope' }, 'PATCH'),
        PARAMS,
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/includedQuantity/);
    });

    it('returns 400 when unitPriceCents is Infinity', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      getMeteredItemMock.mockResolvedValue({ id: 7, clientId: 5 });
      const res = await meteredItemRoute.PATCH(
        makeJsonReq(URL_BASE, { unitPriceCents: Number.POSITIVE_INFINITY }, 'PATCH'),
        PARAMS,
      );
      expect(res.status).toBe(400);
    });

    it('returns 404 when updateMeteredItem returns null', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      getMeteredItemMock.mockResolvedValue({ id: 7, clientId: 5 });
      updateMeteredItemMock.mockResolvedValue(null);
      const res = await meteredItemRoute.PATCH(
        makeJsonReq(URL_BASE, { status: 'paused' }, 'PATCH'),
        PARAMS,
      );
      expect(res.status).toBe(404);
    });

    it('successfully patches with valid status', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      getMeteredItemMock.mockResolvedValue({ id: 7, clientId: 5 });
      updateMeteredItemMock.mockResolvedValue({ id: 7, status: 'paused' });
      const res = await meteredItemRoute.PATCH(
        makeJsonReq(URL_BASE, { status: 'paused', unitPriceCents: 100, includedQuantity: 5 }, 'PATCH'),
        PARAMS,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ id: 7, status: 'paused' });
      expect(updateMeteredItemMock).toHaveBeenCalledWith(7, {
        status: 'paused',
        unitPriceCents: 100,
        includedQuantity: 5,
      });
    });
  });

  describe('DELETE', () => {
    it('returns 401 when unauthorized', async () => {
      authMock.mockResolvedValue(null);
      const res = await meteredItemRoute.DELETE(makeReq(URL_BASE, { method: 'DELETE' }), PARAMS);
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid id params', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      const res = await meteredItemRoute.DELETE(
        makeReq(URL_BASE, { method: 'DELETE' }),
        { params: paramsFor({ id: 'x', itemId: '7' }) },
      );
      expect(res.status).toBe(400);
    });

    it('returns 404 when item not found', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      getMeteredItemMock.mockResolvedValue(null);
      const res = await meteredItemRoute.DELETE(makeReq(URL_BASE, { method: 'DELETE' }), PARAMS);
      expect(res.status).toBe(404);
    });

    it('returns 404 when item belongs to a different client', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      getMeteredItemMock.mockResolvedValue({ id: 7, clientId: 999 });
      const res = await meteredItemRoute.DELETE(makeReq(URL_BASE, { method: 'DELETE' }), PARAMS);
      expect(res.status).toBe(404);
    });

    it('deletes the item and returns success', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      getMeteredItemMock.mockResolvedValue({ id: 7, clientId: 5 });
      deleteMeteredItemMock.mockResolvedValue(true);
      const res = await meteredItemRoute.DELETE(makeReq(URL_BASE, { method: 'DELETE' }), PARAMS);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(deleteMeteredItemMock).toHaveBeenCalledWith(7);
    });

    it('returns success=false when deleteMeteredItem returns false', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      getMeteredItemMock.mockResolvedValue({ id: 7, clientId: 5 });
      deleteMeteredItemMock.mockResolvedValue(false);
      const res = await meteredItemRoute.DELETE(makeReq(URL_BASE, { method: 'DELETE' }), PARAMS);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });
});

// ===========================================================================
// admin/portal/clients/:id/billing/usage (GET/POST)
// ===========================================================================

describe('admin/portal/clients/[id]/billing/usage route', () => {
  const URL_BASE = 'http://x/api/admin/portal/clients/5/billing/usage';
  const PARAMS = { params: paramsFor({ id: '5' }) };

  describe('GET', () => {
    it('returns 401 when unauthorized', async () => {
      authMock.mockResolvedValue(null);
      const res = await usageRoute.GET(makeReq(URL_BASE), PARAMS);
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid client id', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      const res = await usageRoute.GET(makeReq(URL_BASE), {
        params: paramsFor({ id: 'abc' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/Invalid client id/);
    });

    it('returns 400 for malformed period query', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      const res = await usageRoute.GET(
        makeReq(`${URL_BASE}?period=not-a-period`),
        PARAMS,
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/Invalid period/);
    });

    it('returns liveTotals, dryRun, history using default period', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      // First select: liveTotalsRows (groupBy)
      selectQueue.push([
        { resource: 'leads', total: '12' },
        { resource: 'sms', total: '5' },
      ]);
      // rollup
      rollupClientPeriodMock.mockResolvedValue({ items: [], totalCents: 0 });
      // Second select: history (orderBy + limit)
      selectQueue.push([{ id: 1, clientId: 5, period: '2026-04' }]);

      const res = await usageRoute.GET(makeReq(URL_BASE), PARAMS);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.period).toBe('2026-05');
      expect(body.data.liveTotals).toEqual([
        { resource: 'leads', total: 12 },
        { resource: 'sms', total: 5 },
      ]);
      expect(body.data.dryRun).toEqual({ items: [], totalCents: 0 });
      expect(body.data.history).toHaveLength(1);
      expect(rollupClientPeriodMock).toHaveBeenCalledWith(5, '2026-05', { dryRun: true });
    });

    it('uses period query param when valid', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([]); // liveTotals
      rollupClientPeriodMock.mockResolvedValue({});
      selectQueue.push([]); // history
      const res = await usageRoute.GET(
        makeReq(`${URL_BASE}?period=2025-12`),
        PARAMS,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.period).toBe('2025-12');
      expect(rollupClientPeriodMock).toHaveBeenCalledWith(5, '2025-12', { dryRun: true });
    });
  });

  describe('POST', () => {
    it('returns 401 when unauthorized', async () => {
      authMock.mockResolvedValue(null);
      const res = await usageRoute.POST(makeJsonReq(URL_BASE, {}), PARAMS);
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid client id', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      const res = await usageRoute.POST(makeJsonReq(URL_BASE, {}), {
        params: paramsFor({ id: 'abc' }),
      });
      expect(res.status).toBe(400);
    });

    it('falls through to defaults when body is non-JSON', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      rollupClientPeriodMock.mockResolvedValue({ ok: true });
      const req = new Request(URL_BASE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json{',
      });
      const res = await usageRoute.POST(req, PARAMS);
      // Default period derived from currentPeriodUtc, dryRun=true
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.period).toBe('2026-05');
      expect(body.data.dryRun).toBe(true);
    });

    it('returns 400 for malformed period in body', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      const res = await usageRoute.POST(
        makeJsonReq(URL_BASE, { period: 'oops' }),
        PARAMS,
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/Invalid period/);
    });

    it('runs dryRun when explicitly true', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      rollupClientPeriodMock.mockResolvedValue({ totalCents: 0 });
      const res = await usageRoute.POST(
        makeJsonReq(URL_BASE, { period: '2026-04', dryRun: true }),
        PARAMS,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.dryRun).toBe(true);
      expect(rollupClientPeriodMock).toHaveBeenCalledWith(5, '2026-04', { dryRun: true });
    });

    it('runs real push when force=true and dryRun unset', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      rollupClientPeriodMock.mockResolvedValue({ totalCents: 4200 });
      const res = await usageRoute.POST(
        makeJsonReq(URL_BASE, { period: '2026-04', force: true }),
        PARAMS,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.dryRun).toBe(false);
      expect(rollupClientPeriodMock).toHaveBeenCalledWith(5, '2026-04', { dryRun: false });
    });

    it('explicit dryRun=false overrides absence of force', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      rollupClientPeriodMock.mockResolvedValue({});
      const res = await usageRoute.POST(
        makeJsonReq(URL_BASE, { period: '2026-04', dryRun: false }),
        PARAMS,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.dryRun).toBe(false);
    });

    it('defaults to dryRun=true when no body fields provided', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      rollupClientPeriodMock.mockResolvedValue({});
      const res = await usageRoute.POST(makeJsonReq(URL_BASE, {}), PARAMS);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.dryRun).toBe(true);
      expect(body.data.period).toBe('2026-05');
    });
  });
});
