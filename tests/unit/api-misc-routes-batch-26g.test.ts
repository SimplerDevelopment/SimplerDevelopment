// @vitest-environment node
/**
 * Unit tests for four admin API routes (batch 26g):
 *   - app/api/admin/portal/hosting/[id]/route.ts            (GET, PATCH, DELETE)
 *   - app/api/admin/portal/hosting/[id]/verify-dns/route.ts (POST)
 *   - app/api/admin/portal/hosting/route.ts                 (GET, POST)
 *   - app/api/admin/portal/invoices/[id]/route.ts           (GET, PATCH)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const resolveMock = vi.fn();
vi.mock('dns/promises', () => ({
  resolve: (...args: unknown[]) => resolveMock(...args),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  inArray: (a: unknown, vals: unknown) => ({ op: 'inArray', a, vals }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    op: 'sql',
    strings: Array.from(strings),
    values,
  }),
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
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    hostedSites: wrap('hostedSites'),
    clientWebsites: wrap('clientWebsites'),
    clients: wrap('clients'),
    users: wrap('users'),
    invoices: wrap('invoices'),
    invoiceItems: wrap('invoiceItems'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// DB mock: thenable select chain + update / insert / delete chains
// ---------------------------------------------------------------------------

let selectQueue: Array<Array<Record<string, unknown>>> = [];
const updateSetCalls: Array<{
  table: string;
  values: Record<string, unknown>;
  where: unknown;
  returned?: Array<Record<string, unknown>>;
}> = [];
const insertCalls: Array<{
  table: string;
  values: Record<string, unknown>;
  returned: Array<Record<string, unknown>>;
}> = [];
const deleteCalls: Array<{ table: string; where: unknown }> = [];

// what an update's .returning() should yield (FIFO)
let updateReturningQueue: Array<Array<Record<string, unknown>>> = [];
// what an insert's .returning() should yield (FIFO)
let insertReturningQueue: Array<Array<Record<string, unknown>>> = [];

function shiftSelect(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
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

  function buildUpdate(table: { __table?: string } | undefined) {
    const tableName = (table && table.__table) || 'unknown';
    return {
      set(values: Record<string, unknown>) {
        const setObj = {
          where(w: unknown) {
            const entry: {
              table: string;
              values: Record<string, unknown>;
              where: unknown;
              returned?: Array<Record<string, unknown>>;
            } = { table: tableName, values, where: w };
            const whereObj = {
              returning() {
                const rows = updateReturningQueue.shift() ?? [];
                entry.returned = rows;
                updateSetCalls.push(entry);
                return Promise.resolve(rows);
              },
              then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                updateSetCalls.push(entry);
                return Promise.resolve({ rowCount: 1 }).then(onF, onR);
              },
            };
            return whereObj;
          },
        };
        return setObj;
      },
    };
  }

  function buildInsert(table: { __table?: string } | undefined) {
    const tableName = (table && table.__table) || 'unknown';
    return {
      values(values: Record<string, unknown>) {
        return {
          returning() {
            const rows = insertReturningQueue.shift() ?? [];
            insertCalls.push({ table: tableName, values, returned: rows });
            return Promise.resolve(rows);
          },
        };
      },
    };
  }

  function buildDelete(table: { __table?: string } | undefined) {
    const tableName = (table && table.__table) || 'unknown';
    return {
      where(w: unknown) {
        deleteCalls.push({ table: tableName, where: w });
        return Promise.resolve({ rowCount: 1 });
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
      insert(table: { __table?: string } | undefined) {
        return buildInsert(table);
      },
      delete(table: { __table?: string } | undefined) {
        return buildDelete(table);
      },
    },
  };
});

// ---- modules under test ----
const hostingIdRoute = await import('@/app/api/admin/portal/hosting/[id]/route');
const verifyDnsRoute = await import('@/app/api/admin/portal/hosting/[id]/verify-dns/route');
const hostingRoute = await import('@/app/api/admin/portal/hosting/route');
const invoicesIdRoute = await import('@/app/api/admin/portal/invoices/[id]/route');

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

function makeParams(id: string): Promise<{ id: string }> {
  return Promise.resolve({ id });
}

const ADMIN_SESSION = { user: { id: '7', name: 'Admin', role: 'admin' } };
const EMPLOYEE_SESSION = { user: { id: '8', name: 'Emp', role: 'employee' } };
const CLIENT_SESSION = { user: { id: '9', name: 'Client', role: 'client' } };

beforeEach(() => {
  selectQueue = [];
  updateSetCalls.length = 0;
  insertCalls.length = 0;
  deleteCalls.length = 0;
  updateReturningQueue = [];
  insertReturningQueue = [];
  authMock.mockReset();
  resolveMock.mockReset();
});

// ===========================================================================
// admin/portal/hosting/[id]
// ===========================================================================

describe('admin/portal/hosting/[id]', () => {
  describe('GET', () => {
    it('returns 401 when no session', async () => {
      authMock.mockResolvedValue(null);
      const res = await hostingIdRoute.GET(makeReq('http://x'), { params: makeParams('1') });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.message).toMatch(/Unauthorized/);
    });

    it('returns 401 when role is not admin or employee', async () => {
      authMock.mockResolvedValue(CLIENT_SESSION);
      const res = await hostingIdRoute.GET(makeReq('http://x'), { params: makeParams('1') });
      expect(res.status).toBe(401);
    });

    it('returns 401 when session has no user id', async () => {
      authMock.mockResolvedValue({ user: { role: 'admin' } });
      const res = await hostingIdRoute.GET(makeReq('http://x'), { params: makeParams('1') });
      expect(res.status).toBe(401);
    });

    it('returns 404 when site not found', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([]);
      const res = await hostingIdRoute.GET(makeReq('http://x'), { params: makeParams('1') });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.message).toMatch(/Not found/);
    });

    it('returns the site when found (employee role allowed)', async () => {
      authMock.mockResolvedValue(EMPLOYEE_SESSION);
      selectQueue.push([{ id: 42, name: 'Site' }]);
      const res = await hostingIdRoute.GET(makeReq('http://x'), { params: makeParams('42') });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ id: 42, name: 'Site' });
    });
  });

  describe('PATCH', () => {
    it('returns 401 when unauthorized', async () => {
      authMock.mockResolvedValue(null);
      const res = await hostingIdRoute.PATCH(
        makeJsonReq('http://x', {}, 'PATCH'),
        { params: makeParams('1') },
      );
      expect(res.status).toBe(401);
    });

    it('returns 404 when update returns no row', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      updateReturningQueue.push([]);
      const res = await hostingIdRoute.PATCH(
        makeJsonReq('http://x', { name: 'New' }, 'PATCH'),
        { params: makeParams('1') },
      );
      expect(res.status).toBe(404);
    });

    it('updates only provided fields and returns the row', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      updateReturningQueue.push([{ id: 1, name: 'New' }]);
      const res = await hostingIdRoute.PATCH(
        makeJsonReq(
          'http://x',
          {
            name: 'New',
            customDomain: 'example.com',
            railwayProjectId: 'p1',
            railwayServiceId: 's1',
            railwayEnvironmentId: 'e1',
            railwayDomain: 'r.up.railway.app',
            status: 'active',
            plan: 'pro',
            renewalDate: '2026-01-01',
            notes: 'note',
            dnsInstructions: [{ type: 'A', value: '1.2.3.4' }],
          },
          'PATCH',
        ),
        { params: makeParams('1') },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ id: 1, name: 'New' });
      expect(updateSetCalls).toHaveLength(1);
      const setVals = updateSetCalls[0].values;
      expect(setVals.name).toBe('New');
      expect(setVals.customDomain).toBe('example.com');
      expect(setVals.railwayProjectId).toBe('p1');
      expect(setVals.status).toBe('active');
      expect(setVals.renewalDate).toBeInstanceOf(Date);
      expect(setVals.updatedAt).toBeInstanceOf(Date);
    });

    it('coerces empty-string optional fields to null', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      updateReturningQueue.push([{ id: 1 }]);
      const res = await hostingIdRoute.PATCH(
        makeJsonReq(
          'http://x',
          {
            customDomain: '',
            railwayProjectId: '',
            railwayServiceId: '',
            railwayEnvironmentId: '',
            railwayDomain: '',
            notes: '',
            renewalDate: '',
          },
          'PATCH',
        ),
        { params: makeParams('1') },
      );
      expect(res.status).toBe(200);
      const setVals = updateSetCalls[0].values;
      expect(setVals.customDomain).toBeNull();
      expect(setVals.railwayProjectId).toBeNull();
      expect(setVals.railwayServiceId).toBeNull();
      expect(setVals.railwayEnvironmentId).toBeNull();
      expect(setVals.railwayDomain).toBeNull();
      expect(setVals.notes).toBeNull();
      expect(setVals.renewalDate).toBeNull();
    });
  });

  describe('DELETE', () => {
    it('returns 401 when unauthorized', async () => {
      authMock.mockResolvedValue(null);
      const res = await hostingIdRoute.DELETE(makeReq('http://x'), { params: makeParams('1') });
      expect(res.status).toBe(401);
    });

    it('deletes the site and returns success', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      const res = await hostingIdRoute.DELETE(makeReq('http://x'), { params: makeParams('42') });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0].table).toBe('hostedSites');
    });
  });
});

// ===========================================================================
// admin/portal/hosting/[id]/verify-dns
// ===========================================================================

describe('POST admin/portal/hosting/[id]/verify-dns', () => {
  it('returns 401 when not staff', async () => {
    authMock.mockResolvedValue(null);
    const res = await verifyDnsRoute.POST(makeReq('http://x'), { params: makeParams('1') });
    expect(res.status).toBe(401);
  });

  it('returns 404 when site missing', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([]);
    const res = await verifyDnsRoute.POST(makeReq('http://x'), { params: makeParams('1') });
    expect(res.status).toBe(404);
  });

  it('returns 400 when customDomain is not set', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([{ id: 1, customDomain: null, railwayDomain: 'r.up' }]);
    const res = await verifyDnsRoute.POST(makeReq('http://x'), { params: makeParams('1') });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/No custom domain/);
  });

  it('returns 400 when railwayDomain is not set', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([{ id: 1, customDomain: 'example.com', railwayDomain: null }]);
    const res = await verifyDnsRoute.POST(makeReq('http://x'), { params: makeParams('1') });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/No Railway domain/);
  });

  it('verifies via matching CNAME and updates status to active, also setting client_websites.domain when empty', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        customDomain: 'example.com',
        railwayDomain: 'r.up.railway.app',
      },
    ]);
    selectQueue.push([{ id: 11, clientId: 5, domain: null }]);
    resolveMock.mockImplementation((_domain: string, type: string) => {
      if (type === 'CNAME') return Promise.resolve(['r.up.railway.app.']);
      return Promise.resolve([]);
    });

    const res = await verifyDnsRoute.POST(makeReq('http://x'), { params: makeParams('1') });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.verified).toBe(true);
    expect(body.data.status).toBe('active');
    expect(body.message).toMatch(/DNS verified/);
    // Two update calls: hostedSites status active + clientWebsites domain
    expect(updateSetCalls).toHaveLength(2);
    expect(updateSetCalls[0].table).toBe('hostedSites');
    expect(updateSetCalls[0].values.status).toBe('active');
    expect(updateSetCalls[1].table).toBe('clientWebsites');
    expect(updateSetCalls[1].values.domain).toBe('example.com');
  });

  it('does not update client_websites when row already has a domain', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        customDomain: 'example.com',
        railwayDomain: 'r.up.railway.app',
      },
    ]);
    selectQueue.push([{ id: 11, clientId: 5, domain: 'already.com' }]);
    resolveMock.mockImplementation((_d: string, type: string) =>
      type === 'CNAME' ? Promise.resolve(['r.up.railway.app']) : Promise.resolve([]),
    );

    const res = await verifyDnsRoute.POST(makeReq('http://x'), { params: makeParams('1') });
    expect(res.status).toBe(200);
    // Only one update — hostedSites
    expect(updateSetCalls).toHaveLength(1);
    expect(updateSetCalls[0].table).toBe('hostedSites');
  });

  it('does not update client_websites when no row found for client', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        customDomain: 'example.com',
        railwayDomain: 'r.up.railway.app',
      },
    ]);
    selectQueue.push([]); // no client_websites row
    resolveMock.mockImplementation((_d: string, type: string) =>
      type === 'CNAME' ? Promise.resolve(['r.up.railway.app']) : Promise.resolve([]),
    );

    const res = await verifyDnsRoute.POST(makeReq('http://x'), { params: makeParams('1') });
    expect(res.status).toBe(200);
    expect(updateSetCalls).toHaveLength(1);
    expect(updateSetCalls[0].table).toBe('hostedSites');
  });

  it('falls back to A-record comparison when CNAME does not match', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        customDomain: 'example.com',
        railwayDomain: 'r.up.railway.app',
      },
    ]);
    selectQueue.push([{ id: 11, clientId: 5, domain: null }]);
    // CNAME returns something that does not match, A returns same IPs
    let callCount = 0;
    resolveMock.mockImplementation((domain: string, type: string) => {
      callCount += 1;
      if (type === 'CNAME') return Promise.resolve(['other.com']);
      if (type === 'A' && domain === 'example.com') return Promise.resolve(['1.2.3.4']);
      if (type === 'A' && domain === 'r.up.railway.app') return Promise.resolve(['1.2.3.4']);
      return Promise.resolve([]);
    });

    const res = await verifyDnsRoute.POST(makeReq('http://x'), { params: makeParams('1') });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.verified).toBe(true);
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  it('returns verified=false when neither CNAME nor A match', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        customDomain: 'example.com',
        railwayDomain: 'r.up.railway.app',
      },
    ]);
    resolveMock.mockImplementation((domain: string, type: string) => {
      if (type === 'CNAME') return Promise.reject(new Error('ENOTFOUND'));
      if (type === 'A' && domain === 'example.com') return Promise.resolve(['9.9.9.9']);
      if (type === 'A' && domain === 'r.up.railway.app') return Promise.resolve(['1.1.1.1']);
      return Promise.resolve([]);
    });

    const res = await verifyDnsRoute.POST(makeReq('http://x'), { params: makeParams('1') });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.verified).toBe(false);
    expect(body.data.status).toBe('pending');
    expect(body.message).toMatch(/not yet pointing/);
    // No update should have happened
    expect(updateSetCalls).toHaveLength(0);
  });

  it('handles A-record lookup failures gracefully (no match, no throw)', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        customDomain: 'example.com',
        railwayDomain: 'r.up.railway.app',
      },
    ]);
    resolveMock.mockImplementation((_d: string, type: string) => {
      if (type === 'CNAME') return Promise.reject(new Error('no cname'));
      if (type === 'A') return Promise.reject(new Error('no a'));
      return Promise.resolve([]);
    });

    const res = await verifyDnsRoute.POST(makeReq('http://x'), { params: makeParams('1') });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.verified).toBe(false);
  });
});

// ===========================================================================
// admin/portal/hosting (list + create)
// ===========================================================================

describe('admin/portal/hosting', () => {
  describe('GET', () => {
    it('returns 401 when not staff', async () => {
      authMock.mockResolvedValue(null);
      const res = await hostingRoute.GET();
      expect(res.status).toBe(401);
    });

    it('returns 401 when role is client', async () => {
      authMock.mockResolvedValue(CLIENT_SESSION);
      const res = await hostingRoute.GET();
      expect(res.status).toBe(401);
    });

    it('returns the list of sites with client joins', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([
        { id: 1, clientId: 10, name: 'Site A', clientCompany: 'Acme' },
        { id: 2, clientId: 11, name: 'Site B', clientCompany: 'Beta' },
      ]);
      const res = await hostingRoute.GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].clientCompany).toBe('Acme');
    });
  });

  describe('POST', () => {
    it('returns 401 when not staff', async () => {
      authMock.mockResolvedValue(null);
      const res = await hostingRoute.POST(makeJsonReq('http://x', {}));
      expect(res.status).toBe(401);
    });

    it('returns 400 when clientId or name missing', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      const res = await hostingRoute.POST(makeJsonReq('http://x', { clientId: 1 }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/required/);
    });

    it('inserts a site with defaults when minimal body', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      insertReturningQueue.push([{ id: 99, name: 'Site' }]);
      const res = await hostingRoute.POST(
        makeJsonReq('http://x', { clientId: 5, name: 'Site' }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ id: 99, name: 'Site' });
      expect(insertCalls).toHaveLength(1);
      const ins = insertCalls[0].values;
      expect(ins.clientId).toBe(5);
      expect(ins.name).toBe('Site');
      expect(ins.status).toBe('provisioning');
      expect(ins.plan).toBe('starter');
      expect(ins.dnsInstructions).toEqual([]);
      expect(ins.createdBy).toBe(7);
      expect(ins.renewalDate).toBeNull();
    });

    it('honours provided non-empty values and parses renewalDate', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      insertReturningQueue.push([{ id: 1 }]);
      const res = await hostingRoute.POST(
        makeJsonReq('http://x', {
          clientId: '5',
          name: 'Site',
          customDomain: 'example.com',
          railwayProjectId: 'p1',
          railwayServiceId: 's1',
          railwayEnvironmentId: 'e1',
          railwayDomain: 'r.up',
          status: 'active',
          plan: 'pro',
          renewalDate: '2026-12-01',
          notes: 'hi',
          dnsInstructions: [{ type: 'A' }],
        }),
      );
      expect(res.status).toBe(200);
      const ins = insertCalls[0].values;
      expect(ins.clientId).toBe(5);
      expect(ins.customDomain).toBe('example.com');
      expect(ins.status).toBe('active');
      expect(ins.plan).toBe('pro');
      expect(ins.renewalDate).toBeInstanceOf(Date);
      expect(ins.dnsInstructions).toEqual([{ type: 'A' }]);
    });
  });
});

// ===========================================================================
// admin/portal/invoices/[id]
// ===========================================================================

describe('admin/portal/invoices/[id]', () => {
  describe('GET', () => {
    it('returns 401 when no session', async () => {
      authMock.mockResolvedValue(null);
      const res = await invoicesIdRoute.GET(makeReq('http://x'), { params: makeParams('1') });
      expect(res.status).toBe(401);
    });

    it('returns 401 when role is client', async () => {
      authMock.mockResolvedValue(CLIENT_SESSION);
      const res = await invoicesIdRoute.GET(makeReq('http://x'), { params: makeParams('1') });
      expect(res.status).toBe(401);
    });

    it('returns 404 when invoice not found', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([]); // invoice query returns nothing
      const res = await invoicesIdRoute.GET(makeReq('http://x'), { params: makeParams('1') });
      expect(res.status).toBe(404);
    });

    it('returns the invoice and its items when found', async () => {
      authMock.mockResolvedValue(EMPLOYEE_SESSION);
      selectQueue.push([{ id: 5, status: 'draft' }]); // invoice
      selectQueue.push([{ id: 1, invoiceId: 5, description: 'x' }]); // items
      const res = await invoicesIdRoute.GET(makeReq('http://x'), { params: makeParams('5') });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.invoice).toEqual({ id: 5, status: 'draft' });
      expect(body.data.items).toEqual([{ id: 1, invoiceId: 5, description: 'x' }]);
    });
  });

  describe('PATCH', () => {
    it('returns 401 when unauthorized', async () => {
      authMock.mockResolvedValue(null);
      const res = await invoicesIdRoute.PATCH(
        makeJsonReq('http://x', {}, 'PATCH'),
        { params: makeParams('1') },
      );
      expect(res.status).toBe(401);
    });

    it('updates status / dueDate / notes and returns the row', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      updateReturningQueue.push([{ id: 5, status: 'paid' }]);
      const res = await invoicesIdRoute.PATCH(
        makeJsonReq(
          'http://x',
          { status: 'paid', dueDate: '2026-06-01', notes: 'thx' },
          'PATCH',
        ),
        { params: makeParams('5') },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ id: 5, status: 'paid' });
      expect(updateSetCalls).toHaveLength(1);
      const setVals = updateSetCalls[0].values;
      expect(setVals.status).toBe('paid');
      expect(setVals.dueDate).toBeInstanceOf(Date);
      expect(setVals.notes).toBe('thx');
      expect(setVals.updatedAt).toBeInstanceOf(Date);
    });

    it('leaves dueDate undefined when body has no dueDate', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      updateReturningQueue.push([{ id: 5 }]);
      const res = await invoicesIdRoute.PATCH(
        makeJsonReq('http://x', { status: 'sent' }, 'PATCH'),
        { params: makeParams('5') },
      );
      expect(res.status).toBe(200);
      const setVals = updateSetCalls[0].values;
      expect(setVals.dueDate).toBeUndefined();
      expect(setVals.status).toBe('sent');
    });
  });
});
