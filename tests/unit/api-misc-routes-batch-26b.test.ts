// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 26b):
 *   - app/api/admin/email/domains/[id]/route.ts            (GET, PATCH, DELETE)
 *   - app/api/admin/email/domains/[id]/verify/route.ts     (POST)
 *   - app/api/admin/email/lists/[id]/route.ts              (GET, PATCH, DELETE)
 *   - app/api/admin/portal/automations/logs/route.ts       (GET)
 *
 * All external deps (auth, Resend, the Drizzle db handle) are mocked so the
 * file is a pure unit test — no network, no DATABASE_URL required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

// resend client — surface domains.{get,update,remove,verify}
const domainsGetMock = vi.fn();
const domainsUpdateMock = vi.fn();
const domainsRemoveMock = vi.fn();
const domainsVerifyMock = vi.fn();
vi.mock('@/lib/email', () => ({
  resend: {
    domains: {
      get: (...args: unknown[]) => domainsGetMock(...args),
      update: (...args: unknown[]) => domainsUpdateMock(...args),
      remove: (...args: unknown[]) => domainsRemoveMock(...args),
      verify: (...args: unknown[]) => domainsVerifyMock(...args),
    },
  },
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
    emailLists: wrap('emailLists'),
    emailSubscribers: wrap('emailSubscribers'),
    automationLogs: wrap('automationLogs'),
    automationRules: wrap('automationRules'),
    clients: wrap('clients'),
    users: wrap('users'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// DB mock: thenable select chain + update chain + delete chain
// ---------------------------------------------------------------------------

let selectQueue: Array<Array<Record<string, unknown>>> = [];
const updateSetCalls: Array<{
  table: string;
  values: Record<string, unknown>;
  where: unknown;
  returning?: boolean;
}> = [];
const deleteCalls: Array<{ table: string; where: unknown }> = [];

// Optional: row(s) to return from update().returning()
let updateReturningRows: Array<Record<string, unknown>> = [];

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

  function buildUpdate(table: { __table?: string } | undefined) {
    const tableName = (table && table.__table) || 'unknown';
    return {
      set(values: Record<string, unknown>) {
        return {
          where(w: unknown) {
            updateSetCalls.push({ table: tableName, values, where: w });
            return {
              returning() {
                return Promise.resolve(updateReturningRows);
              },
              then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                return Promise.resolve({ rowCount: 1 }).then(onF, onR);
              },
            };
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
      delete(table: { __table?: string } | undefined) {
        return buildDelete(table);
      },
    },
  };
});

// ---- modules under test ----
const domainsIdRoute = await import('@/app/api/admin/email/domains/[id]/route');
const domainsVerifyRoute = await import('@/app/api/admin/email/domains/[id]/verify/route');
const emailListsIdRoute = await import('@/app/api/admin/email/lists/[id]/route');
const automationLogsRoute = await import('@/app/api/admin/portal/automations/logs/route');

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}
function makeJsonReq(url: string, body: unknown, method = 'PATCH'): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function paramsFor(id: string): Promise<{ id: string }> {
  return Promise.resolve({ id });
}

const ADMIN_SESSION = { user: { id: '1', role: 'admin' } };
const EMPLOYEE_SESSION = { user: { id: '2', role: 'employee' } };
const CLIENT_SESSION = { user: { id: '3', role: 'client' } };

beforeEach(() => {
  selectQueue = [];
  updateSetCalls.length = 0;
  deleteCalls.length = 0;
  updateReturningRows = [];
  authMock.mockReset();
  domainsGetMock.mockReset();
  domainsUpdateMock.mockReset();
  domainsRemoveMock.mockReset();
  domainsVerifyMock.mockReset();
});

// ===========================================================================
// admin/email/domains/[id]
// ===========================================================================

describe('GET/PATCH/DELETE /api/admin/email/domains/[id]', () => {
  describe('GET', () => {
    it('returns 401 without a session', async () => {
      authMock.mockResolvedValue(null);
      const res = await domainsIdRoute.GET(
        makeReq('http://x/api/admin/email/domains/d1'),
        { params: paramsFor('d1') },
      );
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.message).toMatch(/Unauthorized/);
      expect(domainsGetMock).not.toHaveBeenCalled();
    });

    it('returns 401 when session user has no id', async () => {
      authMock.mockResolvedValue({ user: { role: 'admin' } });
      const res = await domainsIdRoute.GET(
        makeReq('http://x/api/admin/email/domains/d1'),
        { params: paramsFor('d1') },
      );
      expect(res.status).toBe(401);
    });

    it('returns 401 when role is not admin', async () => {
      authMock.mockResolvedValue(EMPLOYEE_SESSION);
      const res = await domainsIdRoute.GET(
        makeReq('http://x/api/admin/email/domains/d1'),
        { params: paramsFor('d1') },
      );
      expect(res.status).toBe(401);
      expect(domainsGetMock).not.toHaveBeenCalled();
    });

    it('returns 401 when role is client', async () => {
      authMock.mockResolvedValue(CLIENT_SESSION);
      const res = await domainsIdRoute.GET(
        makeReq('http://x/api/admin/email/domains/d1'),
        { params: paramsFor('d1') },
      );
      expect(res.status).toBe(401);
    });

    it('returns the domain when resend.domains.get succeeds', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      domainsGetMock.mockResolvedValue({
        data: { id: 'd1', name: 'example.com', status: 'verified' },
        error: null,
      });
      const res = await domainsIdRoute.GET(
        makeReq('http://x/api/admin/email/domains/d1'),
        { params: paramsFor('d1') },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ id: 'd1', name: 'example.com', status: 'verified' });
      expect(domainsGetMock).toHaveBeenCalledWith('d1');
    });

    it('returns 500 when resend.domains.get returns an error', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      domainsGetMock.mockResolvedValue({
        data: null,
        error: { message: 'domain not found' },
      });
      const res = await domainsIdRoute.GET(
        makeReq('http://x/api/admin/email/domains/d-missing'),
        { params: paramsFor('d-missing') },
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.message).toBe('domain not found');
    });
  });

  describe('PATCH', () => {
    it('returns 401 without a session', async () => {
      authMock.mockResolvedValue(null);
      const res = await domainsIdRoute.PATCH(
        makeJsonReq('http://x/api/admin/email/domains/d1', { openTracking: true }),
        { params: paramsFor('d1') },
      );
      expect(res.status).toBe(401);
      expect(domainsUpdateMock).not.toHaveBeenCalled();
    });

    it('returns 401 when role is not admin', async () => {
      authMock.mockResolvedValue(EMPLOYEE_SESSION);
      const res = await domainsIdRoute.PATCH(
        makeJsonReq('http://x/api/admin/email/domains/d1', { openTracking: true }),
        { params: paramsFor('d1') },
      );
      expect(res.status).toBe(401);
    });

    it('passes only defined toggle fields to resend.domains.update', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      domainsUpdateMock.mockResolvedValue({
        data: { id: 'd1', openTracking: true, clickTracking: false },
        error: null,
      });
      const res = await domainsIdRoute.PATCH(
        makeJsonReq('http://x/api/admin/email/domains/d1', {
          openTracking: true,
          clickTracking: false,
        }),
        { params: paramsFor('d1') },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(domainsUpdateMock).toHaveBeenCalledTimes(1);
      const callArg = domainsUpdateMock.mock.calls[0][0];
      expect(callArg.id).toBe('d1');
      expect(callArg.openTracking).toBe(true);
      expect(callArg.clickTracking).toBe(false);
      expect('tls' in callArg).toBe(false);
    });

    it('forwards all three tracking knobs when present (including tls)', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      domainsUpdateMock.mockResolvedValue({ data: { id: 'd2' }, error: null });
      const res = await domainsIdRoute.PATCH(
        makeJsonReq('http://x/api/admin/email/domains/d2', {
          openTracking: true,
          clickTracking: true,
          tls: 'enforced',
        }),
        { params: paramsFor('d2') },
      );
      expect(res.status).toBe(200);
      const callArg = domainsUpdateMock.mock.calls[0][0];
      expect(callArg).toEqual({
        id: 'd2',
        openTracking: true,
        clickTracking: true,
        tls: 'enforced',
      });
    });

    it('omits all toggle fields when body is empty', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      domainsUpdateMock.mockResolvedValue({ data: { id: 'd3' }, error: null });
      const res = await domainsIdRoute.PATCH(
        makeJsonReq('http://x/api/admin/email/domains/d3', {}),
        { params: paramsFor('d3') },
      );
      expect(res.status).toBe(200);
      const callArg = domainsUpdateMock.mock.calls[0][0];
      expect(callArg).toEqual({ id: 'd3' });
    });

    it('returns 500 when resend.domains.update returns an error', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      domainsUpdateMock.mockResolvedValue({
        data: null,
        error: { message: 'update failed' },
      });
      const res = await domainsIdRoute.PATCH(
        makeJsonReq('http://x/api/admin/email/domains/d1', { openTracking: true }),
        { params: paramsFor('d1') },
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.message).toBe('update failed');
    });
  });

  describe('DELETE', () => {
    it('returns 401 without a session', async () => {
      authMock.mockResolvedValue(null);
      const res = await domainsIdRoute.DELETE(
        makeReq('http://x/api/admin/email/domains/d1', { method: 'DELETE' }),
        { params: paramsFor('d1') },
      );
      expect(res.status).toBe(401);
      expect(domainsRemoveMock).not.toHaveBeenCalled();
    });

    it('returns 401 when role is not admin', async () => {
      authMock.mockResolvedValue(EMPLOYEE_SESSION);
      const res = await domainsIdRoute.DELETE(
        makeReq('http://x/api/admin/email/domains/d1', { method: 'DELETE' }),
        { params: paramsFor('d1') },
      );
      expect(res.status).toBe(401);
    });

    it('removes the domain and returns success', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      domainsRemoveMock.mockResolvedValue({ error: null });
      const res = await domainsIdRoute.DELETE(
        makeReq('http://x/api/admin/email/domains/d1', { method: 'DELETE' }),
        { params: paramsFor('d1') },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(domainsRemoveMock).toHaveBeenCalledWith('d1');
    });

    it('returns 500 when resend.domains.remove returns an error', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      domainsRemoveMock.mockResolvedValue({ error: { message: 'cannot delete' } });
      const res = await domainsIdRoute.DELETE(
        makeReq('http://x/api/admin/email/domains/d1', { method: 'DELETE' }),
        { params: paramsFor('d1') },
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.message).toBe('cannot delete');
    });
  });
});

// ===========================================================================
// admin/email/domains/[id]/verify
// ===========================================================================

describe('POST /api/admin/email/domains/[id]/verify', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await domainsVerifyRoute.POST(
      makeReq('http://x/api/admin/email/domains/d1/verify', { method: 'POST' }),
      { params: paramsFor('d1') },
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/Unauthorized/);
    expect(domainsVerifyMock).not.toHaveBeenCalled();
  });

  it('returns 401 when session user has no id', async () => {
    authMock.mockResolvedValue({ user: { role: 'admin' } });
    const res = await domainsVerifyRoute.POST(
      makeReq('http://x/api/admin/email/domains/d1/verify', { method: 'POST' }),
      { params: paramsFor('d1') },
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when role is not admin (employee)', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    const res = await domainsVerifyRoute.POST(
      makeReq('http://x/api/admin/email/domains/d1/verify', { method: 'POST' }),
      { params: paramsFor('d1') },
    );
    expect(res.status).toBe(401);
    expect(domainsVerifyMock).not.toHaveBeenCalled();
  });

  it('triggers verify on the requested domain id', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    domainsVerifyMock.mockResolvedValue({
      data: { id: 'd1', status: 'pending' },
      error: null,
    });
    const res = await domainsVerifyRoute.POST(
      makeReq('http://x/api/admin/email/domains/d1/verify', { method: 'POST' }),
      { params: paramsFor('d1') },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ id: 'd1', status: 'pending' });
    expect(domainsVerifyMock).toHaveBeenCalledWith('d1');
  });

  it('returns 500 when resend.domains.verify returns an error', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    domainsVerifyMock.mockResolvedValue({
      data: null,
      error: { message: 'dns not ready' },
    });
    const res = await domainsVerifyRoute.POST(
      makeReq('http://x/api/admin/email/domains/d1/verify', { method: 'POST' }),
      { params: paramsFor('d1') },
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('dns not ready');
  });
});

// ===========================================================================
// admin/email/lists/[id]
// ===========================================================================

describe('GET/PATCH/DELETE /api/admin/email/lists/[id]', () => {
  describe('GET', () => {
    it('returns 401 without a session', async () => {
      authMock.mockResolvedValue(null);
      const res = await emailListsIdRoute.GET(
        makeReq('http://x/api/admin/email/lists/5'),
        { params: paramsFor('5') },
      );
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it('returns 401 when role is client', async () => {
      authMock.mockResolvedValue(CLIENT_SESSION);
      const res = await emailListsIdRoute.GET(
        makeReq('http://x/api/admin/email/lists/5'),
        { params: paramsFor('5') },
      );
      expect(res.status).toBe(401);
    });

    it('returns subscribers for the list (admin)', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([
        { id: 1, listId: 5, email: 'a@x.com' },
        { id: 2, listId: 5, email: 'b@x.com' },
      ]);
      const res = await emailListsIdRoute.GET(
        makeReq('http://x/api/admin/email/lists/5'),
        { params: paramsFor('5') },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].email).toBe('a@x.com');
    });

    it('allows employee role', async () => {
      authMock.mockResolvedValue(EMPLOYEE_SESSION);
      selectQueue.push([]);
      const res = await emailListsIdRoute.GET(
        makeReq('http://x/api/admin/email/lists/7'),
        { params: paramsFor('7') },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
    });
  });

  describe('PATCH', () => {
    it('returns 401 without a session', async () => {
      authMock.mockResolvedValue(null);
      const res = await emailListsIdRoute.PATCH(
        makeJsonReq('http://x/api/admin/email/lists/5', { name: 'New' }),
        { params: paramsFor('5') },
      );
      expect(res.status).toBe(401);
    });

    it('returns 401 when role is client', async () => {
      authMock.mockResolvedValue(CLIENT_SESSION);
      const res = await emailListsIdRoute.PATCH(
        makeJsonReq('http://x/api/admin/email/lists/5', { name: 'New' }),
        { params: paramsFor('5') },
      );
      expect(res.status).toBe(401);
    });

    it('returns 400 when name is missing', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      const res = await emailListsIdRoute.PATCH(
        makeJsonReq('http://x/api/admin/email/lists/5', { description: 'd' }),
        { params: paramsFor('5') },
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/Name is required/);
      expect(updateSetCalls).toHaveLength(0);
    });

    it('returns 400 when name is whitespace only', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      const res = await emailListsIdRoute.PATCH(
        makeJsonReq('http://x/api/admin/email/lists/5', { name: '   ' }),
        { params: paramsFor('5') },
      );
      expect(res.status).toBe(400);
    });

    it('returns 404 when the row to update is missing', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      updateReturningRows = []; // simulate no rows updated
      const res = await emailListsIdRoute.PATCH(
        makeJsonReq('http://x/api/admin/email/lists/999', { name: 'Anything' }),
        { params: paramsFor('999') },
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.message).toMatch(/Not found/);
    });

    it('trims and persists name + description, returning the row', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      updateReturningRows = [{ id: 5, name: 'Renamed', description: 'desc' }];
      const res = await emailListsIdRoute.PATCH(
        makeJsonReq('http://x/api/admin/email/lists/5', {
          name: '  Renamed  ',
          description: '  desc  ',
        }),
        { params: paramsFor('5') },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ id: 5, name: 'Renamed', description: 'desc' });
      expect(updateSetCalls).toHaveLength(1);
      expect(updateSetCalls[0].table).toBe('emailLists');
      expect(updateSetCalls[0].values.name).toBe('Renamed');
      expect(updateSetCalls[0].values.description).toBe('desc');
      expect(updateSetCalls[0].values.updatedAt).toBeInstanceOf(Date);
    });

    it('persists null description when description omitted', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      updateReturningRows = [{ id: 5, name: 'X', description: null }];
      const res = await emailListsIdRoute.PATCH(
        makeJsonReq('http://x/api/admin/email/lists/5', { name: 'X' }),
        { params: paramsFor('5') },
      );
      expect(res.status).toBe(200);
      expect(updateSetCalls[0].values.description).toBeNull();
    });
  });

  describe('DELETE', () => {
    it('returns 401 without a session', async () => {
      authMock.mockResolvedValue(null);
      const res = await emailListsIdRoute.DELETE(
        makeReq('http://x/api/admin/email/lists/5', { method: 'DELETE' }),
        { params: paramsFor('5') },
      );
      expect(res.status).toBe(401);
    });

    it('returns 401 when role is client', async () => {
      authMock.mockResolvedValue(CLIENT_SESSION);
      const res = await emailListsIdRoute.DELETE(
        makeReq('http://x/api/admin/email/lists/5', { method: 'DELETE' }),
        { params: paramsFor('5') },
      );
      expect(res.status).toBe(401);
    });

    it('deletes the list and returns success (admin)', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      const res = await emailListsIdRoute.DELETE(
        makeReq('http://x/api/admin/email/lists/5', { method: 'DELETE' }),
        { params: paramsFor('5') },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0].table).toBe('emailLists');
    });

    it('allows employee role', async () => {
      authMock.mockResolvedValue(EMPLOYEE_SESSION);
      const res = await emailListsIdRoute.DELETE(
        makeReq('http://x/api/admin/email/lists/9', { method: 'DELETE' }),
        { params: paramsFor('9') },
      );
      expect(res.status).toBe(200);
      expect(deleteCalls).toHaveLength(1);
    });
  });
});

// ===========================================================================
// admin/portal/automations/logs
// ===========================================================================

describe('GET /api/admin/portal/automations/logs', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await automationLogsRoute.GET(
      makeReq('http://x/api/admin/portal/automations/logs'),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/Unauthorized/);
  });

  it('returns 401 when session user has no id', async () => {
    authMock.mockResolvedValue({ user: { role: 'admin' } });
    const res = await automationLogsRoute.GET(
      makeReq('http://x/api/admin/portal/automations/logs'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when role is client', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await automationLogsRoute.GET(
      makeReq('http://x/api/admin/portal/automations/logs'),
    );
    expect(res.status).toBe(401);
  });

  it('returns the joined logs for an admin (no status filter)', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([
      {
        id: 1,
        triggerEvent: 'form.submitted',
        status: 'success',
        duration: 12,
        errorMessage: null,
        createdAt: new Date('2026-01-01T00:00:00Z').toISOString(),
        ruleName: 'Rule A',
        company: 'Acme',
        clientName: 'Joe',
      },
      {
        id: 2,
        triggerEvent: 'task.created',
        status: 'error',
        duration: 30,
        errorMessage: 'boom',
        createdAt: new Date('2026-01-02T00:00:00Z').toISOString(),
        ruleName: 'Rule B',
        company: 'Beta',
        clientName: 'Sue',
      },
    ]);
    const res = await automationLogsRoute.GET(
      makeReq('http://x/api/admin/portal/automations/logs'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].ruleName).toBe('Rule A');
    expect(body.data[1].status).toBe('error');
  });

  it('returns logs when status=all (filter intentionally bypassed)', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([{ id: 99, status: 'success' }]);
    const res = await automationLogsRoute.GET(
      makeReq('http://x/api/admin/portal/automations/logs?status=all'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });

  it('returns logs when a concrete status filter is supplied', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    selectQueue.push([{ id: 7, status: 'error' }]);
    const res = await automationLogsRoute.GET(
      makeReq('http://x/api/admin/portal/automations/logs?status=error'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].status).toBe('error');
  });

  it('returns empty list when no logs match', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([]);
    const res = await automationLogsRoute.GET(
      makeReq('http://x/api/admin/portal/automations/logs?status=success'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });
});
