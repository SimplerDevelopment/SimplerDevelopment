// @vitest-environment node
/**
 * Unit tests for four admin portal API routes (batch 27a):
 *   - app/api/admin/portal/services/[id]/route.ts                       (PATCH, DELETE)
 *   - app/api/admin/portal/services/route.ts                            (GET, POST, PATCH)
 *   - app/api/admin/portal/suggested-project-requests/[id]/route.ts     (PATCH)
 *   - app/api/admin/portal/suggested-project-requests/route.ts          (GET)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

// Stripe mock — captures all calls
const stripeProductsCreate = vi.fn();
const stripeProductsUpdate = vi.fn();
const stripePricesCreate = vi.fn();
const stripePricesUpdate = vi.fn();

class StripeMock {
  products = { create: stripeProductsCreate, update: stripeProductsUpdate };
  prices = { create: stripePricesCreate, update: stripePricesUpdate };
  constructor(_secret: string) {}
}
vi.mock('stripe', () => ({
  default: StripeMock,
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings: Array.from(strings),
      values,
    }),
    {
      raw: (s: string) => ({ op: 'sql.raw', value: s }),
    },
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
          return { __col: prop, __table: tableName };
        },
      },
    );
  return {
    services: wrap('services'),
    suggestedProjectRequests: wrap('suggested_project_requests'),
    suggestedProjects: wrap('suggested_projects'),
    clients: wrap('clients'),
    users: wrap('users'),
  };
});

// ---------------------------------------------------------------------------
// DB mock: thenable select / update / delete / insert chains
// ---------------------------------------------------------------------------

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturningQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturningQueue: Array<Array<Record<string, unknown>>> = [];

const updateCalls: Array<{
  table: string;
  setValues: Record<string, unknown>;
  whereArg: unknown;
  returning: boolean;
}> = [];
const deleteCalls: Array<{ table: string; whereArg: unknown }> = [];
const insertCalls: Array<{ table: string; values: unknown }> = [];

function shiftSelect(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

function shiftUpdateReturning(): Array<Record<string, unknown>> {
  return updateReturningQueue.shift() ?? [];
}

function shiftInsertReturning(): Array<Record<string, unknown>> {
  return insertReturningQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) materializedPromise = Promise.resolve(shiftSelect());
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'groupBy']) {
      chain[m] = passthrough;
    }
    const terminalChain = () => {
      materialize();
      const term: Record<string, unknown> = {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
        limit: () => term,
        offset: () => term,
        orderBy: () => term,
      };
      return term;
    };
    chain.limit = terminalChain;
    chain.offset = terminalChain;
    chain.orderBy = terminalChain;
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  function buildUpdate(tableRef: unknown) {
    const tableName =
      (tableRef as { __table?: string } | null | undefined)?.__table ?? 'unknown';
    let stagedValues: Record<string, unknown> = {};
    let stagedWhere: unknown = undefined;

    function makeReturning() {
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          updateCalls.push({
            table: tableName,
            setValues: stagedValues,
            whereArg: stagedWhere,
            returning: true,
          });
          return Promise.resolve(shiftUpdateReturning()).then(onF, onR);
        },
      };
    }

    const chain: Record<string, unknown> = {
      set(v: Record<string, unknown>) {
        stagedValues = v;
        return chain;
      },
      where(arg: unknown) {
        stagedWhere = arg;
        return {
          returning: (_cols?: unknown) => makeReturning(),
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            updateCalls.push({
              table: tableName,
              setValues: stagedValues,
              whereArg: stagedWhere,
              returning: false,
            });
            return Promise.resolve().then(onF, onR);
          },
        };
      },
    };
    return chain;
  }

  function buildDelete(tableRef: unknown) {
    const tableName =
      (tableRef as { __table?: string } | null | undefined)?.__table ?? 'unknown';
    return {
      where(arg: unknown) {
        deleteCalls.push({ table: tableName, whereArg: arg });
        return Promise.resolve();
      },
    };
  }

  function buildInsert(tableRef: unknown) {
    const tableName =
      (tableRef as { __table?: string } | null | undefined)?.__table ?? 'unknown';
    return {
      values(v: unknown) {
        insertCalls.push({ table: tableName, values: v });
        return {
          returning() {
            return Promise.resolve(shiftInsertReturning());
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
      update(tableRef: unknown) {
        return buildUpdate(tableRef);
      },
      delete(tableRef: unknown) {
        return buildDelete(tableRef);
      },
      insert(tableRef: unknown) {
        return buildInsert(tableRef);
      },
    },
  };
});

// ---- modules under test ----
const servicesIdRoute = await import('@/app/api/admin/portal/services/[id]/route');
const servicesRoute = await import('@/app/api/admin/portal/services/route');
const sprIdRoute = await import(
  '@/app/api/admin/portal/suggested-project-requests/[id]/route'
);
const sprRoute = await import(
  '@/app/api/admin/portal/suggested-project-requests/route'
);

// ---- helpers ----
const ADMIN_SESSION = { user: { id: '1', role: 'admin' } };
const EMP_SESSION = { user: { id: '2', role: 'employee' } };
const CLIENT_SESSION = { user: { id: '3', role: 'client' } };

function paramsP(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  selectQueue = [];
  updateReturningQueue = [];
  insertReturningQueue = [];
  updateCalls.length = 0;
  deleteCalls.length = 0;
  insertCalls.length = 0;
  authMock.mockReset();
  stripeProductsCreate.mockReset();
  stripeProductsUpdate.mockReset();
  stripePricesCreate.mockReset();
  stripePricesUpdate.mockReset();
  delete process.env.STRIPE_SECRET_KEY;
});

// ===========================================================================
// PATCH /api/admin/portal/services/[id]
// ===========================================================================

describe('PATCH /api/admin/portal/services/[id]', () => {
  function req(body: unknown) {
    return new Request('http://x/api/admin/portal/services/5', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await servicesIdRoute.PATCH(req({ name: 'X' }), paramsP('5'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when user role is not admin/employee', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await servicesIdRoute.PATCH(req({ name: 'X' }), paramsP('5'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: { role: 'admin' } });
    const res = await servicesIdRoute.PATCH(req({ name: 'X' }), paramsP('5'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when the service does not exist', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([]);
    const res = await servicesIdRoute.PATCH(req({ name: 'X' }), paramsP('5'));
    expect(res.status).toBe(404);
  });

  it('updates a service without Stripe sync when STRIPE_SECRET_KEY is unset', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([
      { id: 5, name: 'Old', description: 'd', price: 100, stripeProductId: 'prod_1', stripePriceId: 'price_1', billingCycle: 'monthly' },
    ]);
    updateReturningQueue.push([{ id: 5, name: 'New' }]);

    const res = await servicesIdRoute.PATCH(req({ name: 'New' }), paramsP('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('New');
    expect(stripeProductsUpdate).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('services');
  });

  it('syncs name/description to Stripe when STRIPE_SECRET_KEY is set and service has stripeProductId', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_xyz';
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([
      {
        id: 5,
        name: 'Old',
        description: 'old desc',
        price: 100,
        stripeProductId: 'prod_1',
        stripePriceId: 'price_1',
        billingCycle: 'once',
      },
    ]);
    updateReturningQueue.push([{ id: 5, name: 'New' }]);
    stripeProductsUpdate.mockResolvedValue({});

    const res = await servicesIdRoute.PATCH(req({ name: 'New' }), paramsP('5'));
    expect(res.status).toBe(200);
    expect(stripeProductsUpdate).toHaveBeenCalledTimes(1);
    expect(stripeProductsUpdate.mock.calls[0][0]).toBe('prod_1');
    expect(stripeProductsUpdate.mock.calls[0][1].name).toBe('New');
  });

  it('archives old Stripe price and creates a new monthly recurring price when price changes', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_xyz';
    authMock.mockResolvedValue(EMP_SESSION);
    selectQueue.push([
      {
        id: 5,
        name: 'S',
        description: 'd',
        price: 100,
        stripeProductId: 'prod_1',
        stripePriceId: 'price_1',
        billingCycle: 'once',
      },
    ]);
    updateReturningQueue.push([{ id: 5, price: 200, stripePriceId: 'price_new' }]);
    stripePricesUpdate.mockResolvedValue({});
    stripePricesCreate.mockResolvedValue({ id: 'price_new' });

    const res = await servicesIdRoute.PATCH(
      req({ price: 200, billingCycle: 'monthly' }),
      paramsP('5'),
    );
    expect(res.status).toBe(200);
    expect(stripePricesUpdate).toHaveBeenCalledWith('price_1', { active: false });
    expect(stripePricesCreate).toHaveBeenCalledTimes(1);
    const created = stripePricesCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(created.product).toBe('prod_1');
    expect(created.unit_amount).toBe(200);
    expect(created.recurring).toEqual({ interval: 'month' });
    expect(updateCalls[0].setValues.stripePriceId).toBe('price_new');
  });

  it('creates a yearly recurring price when billingCycle is annually', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_xyz';
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([
      {
        id: 5,
        name: 'S',
        description: null,
        price: 100,
        stripeProductId: 'prod_1',
        stripePriceId: null,
        billingCycle: 'annually',
      },
    ]);
    updateReturningQueue.push([{ id: 5 }]);
    stripePricesCreate.mockResolvedValue({ id: 'price_yr' });

    const res = await servicesIdRoute.PATCH(req({ price: 500 }), paramsP('5'));
    expect(res.status).toBe(200);
    const created = stripePricesCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(created.recurring).toEqual({ interval: 'year' });
  });

  it('swallows Stripe errors and still updates the DB', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_xyz';
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([
      {
        id: 5,
        name: 'Old',
        description: 'd',
        price: 100,
        stripeProductId: 'prod_1',
        stripePriceId: 'price_1',
        billingCycle: 'once',
      },
    ]);
    updateReturningQueue.push([{ id: 5, name: 'New' }]);
    stripeProductsUpdate.mockRejectedValue(new Error('stripe down'));

    const res = await servicesIdRoute.PATCH(req({ name: 'New' }), paramsP('5'));
    expect(res.status).toBe(200);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// ===========================================================================
// DELETE /api/admin/portal/services/[id]
// ===========================================================================

describe('DELETE /api/admin/portal/services/[id]', () => {
  function req() {
    return new Request('http://x/api/admin/portal/services/5', { method: 'DELETE' });
  }

  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await servicesIdRoute.DELETE(req(), paramsP('5'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when the service is missing', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([]);
    const res = await servicesIdRoute.DELETE(req(), paramsP('5'));
    expect(res.status).toBe(404);
  });

  it('deletes a service without Stripe call when no STRIPE_SECRET_KEY', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([{ id: 5, stripeProductId: 'prod_1' }]);
    const res = await servicesIdRoute.DELETE(req(), paramsP('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(stripeProductsUpdate).not.toHaveBeenCalled();
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('services');
  });

  it('archives the Stripe product before deleting when STRIPE_SECRET_KEY set', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_xyz';
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([{ id: 5, stripeProductId: 'prod_1' }]);
    stripeProductsUpdate.mockResolvedValue({});

    const res = await servicesIdRoute.DELETE(req(), paramsP('5'));
    expect(res.status).toBe(200);
    expect(stripeProductsUpdate).toHaveBeenCalledWith('prod_1', { active: false });
    expect(deleteCalls).toHaveLength(1);
  });

  it('swallows Stripe archive errors and still deletes', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_xyz';
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([{ id: 5, stripeProductId: 'prod_1' }]);
    stripeProductsUpdate.mockRejectedValue(new Error('boom'));

    const res = await servicesIdRoute.DELETE(req(), paramsP('5'));
    expect(res.status).toBe(200);
    expect(errSpy).toHaveBeenCalled();
    expect(deleteCalls).toHaveLength(1);
    errSpy.mockRestore();
  });

  it('does not call Stripe when service has no stripeProductId', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_xyz';
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([{ id: 5, stripeProductId: null }]);

    const res = await servicesIdRoute.DELETE(req(), paramsP('5'));
    expect(res.status).toBe(200);
    expect(stripeProductsUpdate).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// GET /api/admin/portal/services
// ===========================================================================

describe('GET /api/admin/portal/services', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await servicesRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 401 for client role', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await servicesRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns service list for admin', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);
    const res = await servicesRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });

  it('returns service list for employee', async () => {
    authMock.mockResolvedValue(EMP_SESSION);
    selectQueue.push([]);
    const res = await servicesRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

// ===========================================================================
// POST /api/admin/portal/services
// ===========================================================================

describe('POST /api/admin/portal/services', () => {
  function req(body: unknown) {
    return new Request('http://x/api/admin/portal/services', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await servicesRoute.POST(req({ name: 'A', category: 'c', price: 100 }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    const res = await servicesRoute.POST(req({ name: 'A' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/name, category, and price/);
  });

  it('returns 400 when price is undefined', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    const res = await servicesRoute.POST(req({ name: 'A', category: 'c' }));
    expect(res.status).toBe(400);
  });

  it('creates a service without Stripe sync when STRIPE_SECRET_KEY is unset', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    insertReturningQueue.push([{ id: 10, name: 'New Svc', slug: 'new-svc' }]);

    const res = await servicesRoute.POST(
      req({ name: 'New Svc', category: 'design', price: 5000 }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(10);
    expect(insertCalls).toHaveLength(1);
    const inserted = insertCalls[0].values as Record<string, unknown>;
    // slug auto-generated from name
    expect(inserted.slug).toBe('new-svc');
    expect(inserted.billingCycle).toBe('once');
    expect(inserted.active).toBe(true);
    expect(stripeProductsCreate).not.toHaveBeenCalled();
  });

  it('skips Stripe sync when stripePriceId is provided manually', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_xyz';
    authMock.mockResolvedValue(ADMIN_SESSION);
    insertReturningQueue.push([{ id: 11, name: 'X' }]);
    const res = await servicesRoute.POST(
      req({
        name: 'X',
        category: 'c',
        price: 100,
        stripePriceId: 'price_manual',
      }),
    );
    expect(res.status).toBe(200);
    expect(stripeProductsCreate).not.toHaveBeenCalled();
  });

  it('syncs to Stripe with monthly recurring price', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_xyz';
    authMock.mockResolvedValue(ADMIN_SESSION);
    insertReturningQueue.push([{ id: 11, name: 'X' }]);
    updateReturningQueue.push([
      { id: 11, name: 'X', stripeProductId: 'prod_X', stripePriceId: 'price_X' },
    ]);
    stripeProductsCreate.mockResolvedValue({ id: 'prod_X' });
    stripePricesCreate.mockResolvedValue({ id: 'price_X' });

    const res = await servicesRoute.POST(
      req({ name: 'X', category: 'c', price: 5000, billingCycle: 'monthly' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.stripeProductId).toBe('prod_X');
    expect(stripeProductsCreate).toHaveBeenCalledTimes(1);
    expect(stripePricesCreate).toHaveBeenCalledTimes(1);
    const priceArg = stripePricesCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(priceArg.recurring).toEqual({ interval: 'month' });
    expect(updateCalls).toHaveLength(1);
  });

  it('syncs to Stripe with annually recurring price', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_xyz';
    authMock.mockResolvedValue(ADMIN_SESSION);
    insertReturningQueue.push([{ id: 12, name: 'Y' }]);
    updateReturningQueue.push([{ id: 12, name: 'Y' }]);
    stripeProductsCreate.mockResolvedValue({ id: 'prod_Y' });
    stripePricesCreate.mockResolvedValue({ id: 'price_Y' });

    const res = await servicesRoute.POST(
      req({ name: 'Y', category: 'c', price: 10000, billingCycle: 'annually' }),
    );
    expect(res.status).toBe(200);
    const priceArg = stripePricesCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(priceArg.recurring).toEqual({ interval: 'year' });
  });

  it('returns the unsynced service when Stripe sync throws', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_xyz';
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    authMock.mockResolvedValue(ADMIN_SESSION);
    insertReturningQueue.push([{ id: 13, name: 'Z' }]);
    stripeProductsCreate.mockRejectedValue(new Error('boom'));

    const res = await servicesRoute.POST(
      req({ name: 'Z', category: 'c', price: 100 }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(13);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('uses provided slug instead of auto-generating', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    insertReturningQueue.push([{ id: 14 }]);
    const res = await servicesRoute.POST(
      req({ name: 'Hello World', slug: 'custom-slug', category: 'c', price: 100 }),
    );
    expect(res.status).toBe(200);
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.slug).toBe('custom-slug');
  });

  it('normalizes ugly names into slugs', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    insertReturningQueue.push([{ id: 15 }]);
    const res = await servicesRoute.POST(
      req({ name: '  Hello, World!! ', category: 'c', price: 100 }),
    );
    expect(res.status).toBe(200);
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.slug).toBe('hello-world');
  });
});

// ===========================================================================
// PATCH /api/admin/portal/services (collection-level quick toggle)
// ===========================================================================

describe('PATCH /api/admin/portal/services (collection)', () => {
  function req(body: unknown) {
    return new Request('http://x/api/admin/portal/services', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await servicesRoute.PATCH(req({ id: 5, active: false }));
    expect(res.status).toBe(401);
  });

  it('toggles a service by id', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    updateReturningQueue.push([{ id: 5, active: false }]);

    const res = await servicesRoute.PATCH(req({ id: 5, active: false }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.active).toBe(false);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('services');
    // id should be stripped from setValues
    expect((updateCalls[0].setValues as Record<string, unknown>).id).toBeUndefined();
    expect((updateCalls[0].setValues as Record<string, unknown>).active).toBe(false);
  });
});

// ===========================================================================
// PATCH /api/admin/portal/suggested-project-requests/[id]
// ===========================================================================

describe('PATCH /api/admin/portal/suggested-project-requests/[id]', () => {
  function req(body: unknown) {
    return new Request('http://x/api/admin/portal/suggested-project-requests/3', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await sprIdRoute.PATCH(req({ status: 'approved' }), paramsP('3'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for client role', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await sprIdRoute.PATCH(req({ status: 'approved' }), paramsP('3'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when update returns no row', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    updateReturningQueue.push([]);
    const res = await sprIdRoute.PATCH(req({ status: 'approved' }), paramsP('3'));
    expect(res.status).toBe(404);
  });

  it('updates status and adminNotes, then returns enriched row', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    updateReturningQueue.push([{ id: 3, status: 'approved' }]);
    selectQueue.push([
      {
        id: 3,
        status: 'approved',
        answers: {},
        message: 'm',
        adminNotes: 'n',
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: 99,
        projectTitle: 'Logo Refresh',
        projectCategory: 'design',
        clientId: 5,
        clientCompany: 'Acme',
        clientUserId: 7,
        clientUserName: 'Bob',
        clientUserEmail: 'bob@acme.com',
      },
    ]);

    const res = await sprIdRoute.PATCH(
      req({ status: 'approved', adminNotes: 'n' }),
      paramsP('3'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.projectTitle).toBe('Logo Refresh');
    expect(body.data.clientCompany).toBe('Acme');

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('suggested_project_requests');
    const set = updateCalls[0].setValues as Record<string, unknown>;
    expect(set.status).toBe('approved');
    expect(set.adminNotes).toBe('n');
    expect(set.updatedAt).toBeInstanceOf(Date);
  });

  it('only applies allowed fields (ignores stray body keys)', async () => {
    authMock.mockResolvedValue(EMP_SESSION);
    updateReturningQueue.push([{ id: 3 }]);
    selectQueue.push([{ id: 3, projectId: 1, clientId: 1, clientUserId: 1 }]);

    const res = await sprIdRoute.PATCH(
      req({ status: 'rejected', notAllowed: 'ignored' }),
      paramsP('3'),
    );
    expect(res.status).toBe(200);
    const set = updateCalls[0].setValues as Record<string, unknown>;
    expect(set.notAllowed).toBeUndefined();
    expect(set.status).toBe('rejected');
  });

  it('allows updating only adminNotes', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    updateReturningQueue.push([{ id: 3 }]);
    selectQueue.push([{ id: 3 }]);

    const res = await sprIdRoute.PATCH(
      req({ adminNotes: 'just notes' }),
      paramsP('3'),
    );
    expect(res.status).toBe(200);
    const set = updateCalls[0].setValues as Record<string, unknown>;
    expect(set.adminNotes).toBe('just notes');
    expect(set.status).toBeUndefined();
  });
});

// ===========================================================================
// GET /api/admin/portal/suggested-project-requests
// ===========================================================================

describe('GET /api/admin/portal/suggested-project-requests', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await sprRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 401 for client role', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await sprRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns the enriched request list for admin', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([
      {
        id: 1,
        status: 'pending',
        answers: {},
        message: null,
        adminNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: 50,
        projectTitle: 'Site Refresh',
        projectCategory: 'web',
        clientId: 9,
        clientCompany: 'Acme',
        clientUserId: 4,
        clientUserName: 'Alice',
        clientUserEmail: 'a@acme.com',
      },
    ]);
    const res = await sprRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].projectTitle).toBe('Site Refresh');
  });

  it('returns empty array for employee with no rows', async () => {
    authMock.mockResolvedValue(EMP_SESSION);
    selectQueue.push([]);
    const res = await sprRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});
