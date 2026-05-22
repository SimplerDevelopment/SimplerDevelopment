// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 25g):
 *   - app/api/portal/clients/route.ts             (GET)
 *   - app/api/portal/sign-out/route.ts            (POST)
 *   - app/api/portal/switch-client/route.ts       (POST)
 *   - app/api/portal/mentionable-users/route.ts   (GET)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientsWithRolesMock = vi.fn();
const getPortalClientsMock = vi.fn();
const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClientsWithRoles: (...args: unknown[]) => getPortalClientsWithRolesMock(...args),
  getPortalClients: (...args: unknown[]) => getPortalClientsMock(...args),
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const getActiveClientIdMock = vi.fn();
vi.mock('@/lib/active-client', () => ({
  getActiveClientId: (...args: unknown[]) => getActiveClientIdMock(...args),
  COOKIE_NAME: 'sd-active-client',
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  inArray: (a: unknown, b: unknown) => ({ op: 'inArray', a, b }),
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
    users: wrap('users'),
    clientMembers: wrap('clientMembers'),
  };
});

// ---------------------------------------------------------------------------
// DB mock — chainable select() that resolves on terminal call
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
const clientsRoute = await import('@/app/api/portal/clients/route');
const signOutRoute = await import('@/app/api/portal/sign-out/route');
const switchClientRoute = await import('@/app/api/portal/switch-client/route');
const mentionableRoute = await import('@/app/api/portal/mentionable-users/route');

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

const SESSION = { user: { id: '7', name: 'Bob' } };

beforeEach(() => {
  selectQueue = [];
  authMock.mockReset();
  getPortalClientsWithRolesMock.mockReset();
  getPortalClientsMock.mockReset();
  getPortalClientMock.mockReset();
  getActiveClientIdMock.mockReset();
});

// ---------------------------------------------------------------------------
// GET /api/portal/clients
// ---------------------------------------------------------------------------
describe('GET /api/portal/clients', () => {
  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await clientsRoute.GET();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns clients with active client honored from cookie', async () => {
    authMock.mockResolvedValueOnce(SESSION);
    getPortalClientsWithRolesMock.mockResolvedValueOnce([
      { id: 10, company: 'Acme', role: 'owner', website: 'acme.com' },
      { id: 20, company: 'Globex', role: 'member', website: 'globex.com' },
    ]);
    getActiveClientIdMock.mockResolvedValueOnce(20);

    const res = await clientsRoute.GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.activeClientId).toBe(20);
    expect(json.clients).toHaveLength(2);
    expect(json.clients[0]).toEqual({ id: 10, company: 'Acme', role: 'owner', website: 'acme.com' });
  });

  it('falls back to first client when cookie id is not in list', async () => {
    authMock.mockResolvedValueOnce(SESSION);
    getPortalClientsWithRolesMock.mockResolvedValueOnce([
      { id: 11, company: 'One', role: 'owner', website: 'one.com' },
    ]);
    getActiveClientIdMock.mockResolvedValueOnce(999);

    const res = await clientsRoute.GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.activeClientId).toBe(11);
  });

  it('returns null activeClientId when user has no clients', async () => {
    authMock.mockResolvedValueOnce(SESSION);
    getPortalClientsWithRolesMock.mockResolvedValueOnce([]);
    getActiveClientIdMock.mockResolvedValueOnce(null);

    const res = await clientsRoute.GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.activeClientId).toBeNull();
    expect(json.clients).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/portal/sign-out
// ---------------------------------------------------------------------------
describe('POST /api/portal/sign-out', () => {
  it('returns success and clears session/csrf/active-client cookies', async () => {
    const res = await signOutRoute.POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    // Inspect cookies on the response: env-dependent name, but at least one of
    // the two session-token variants is always cleared, plus the active-client.
    const setCookie = res.headers.get('set-cookie') || '';
    expect(setCookie).toMatch(/authjs\.session-token=/);
    expect(setCookie).toContain('sd-active-client=');
    expect(setCookie).toContain('authjs.csrf-token=');
  });

  it('always returns success: true regardless of input', async () => {
    const res = await signOutRoute.POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// POST /api/portal/switch-client
// ---------------------------------------------------------------------------
describe('POST /api/portal/switch-client', () => {
  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValueOnce(null);
    const req = makeReq('http://x/api/portal/switch-client', {
      method: 'POST',
      body: JSON.stringify({ clientId: 5 }),
    });
    const res = await switchClientRoute.POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when clientId is missing or wrong type', async () => {
    authMock.mockResolvedValue(SESSION);

    const req1 = makeReq('http://x/api/portal/switch-client', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res1 = await switchClientRoute.POST(req1);
    expect(res1.status).toBe(400);

    const req2 = makeReq('http://x/api/portal/switch-client', {
      method: 'POST',
      body: JSON.stringify({ clientId: 'abc' }),
    });
    const res2 = await switchClientRoute.POST(req2);
    expect(res2.status).toBe(400);
  });

  it('returns 403 when user does not own the target client', async () => {
    authMock.mockResolvedValueOnce(SESSION);
    getPortalClientsMock.mockResolvedValueOnce([{ id: 1, company: 'A' }]);
    const req = makeReq('http://x/api/portal/switch-client', {
      method: 'POST',
      body: JSON.stringify({ clientId: 99 }),
    });
    const res = await switchClientRoute.POST(req);
    expect(res.status).toBe(403);
  });

  it('sets cookie and returns 200 when authorized', async () => {
    authMock.mockResolvedValueOnce(SESSION);
    getPortalClientsMock.mockResolvedValueOnce([
      { id: 1, company: 'A' },
      { id: 42, company: 'Target' },
    ]);
    const req = makeReq('http://x/api/portal/switch-client', {
      method: 'POST',
      body: JSON.stringify({ clientId: 42 }),
    });
    const res = await switchClientRoute.POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.activeClientId).toBe(42);
    expect(json.company).toBe('Target');

    const setCookie = res.headers.get('set-cookie') || '';
    expect(setCookie).toContain('sd-active-client=42');
  });
});

// ---------------------------------------------------------------------------
// GET /api/portal/mentionable-users
// ---------------------------------------------------------------------------
describe('GET /api/portal/mentionable-users', () => {
  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await mentionableRoute.GET();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('returns staff-only when caller has no client', async () => {
    authMock.mockResolvedValueOnce(SESSION);
    getPortalClientMock.mockResolvedValueOnce(null);
    // Only one select call: users
    selectQueue.push([
      { id: 1, name: 'Admin User' },
      { id: 2, name: 'Employee User' },
    ]);

    const res = await mentionableRoute.GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(2);
    expect(json.data[0].name).toBe('Admin User');
  });

  it('returns staff plus client members when caller has a client', async () => {
    authMock.mockResolvedValueOnce(SESSION);
    getPortalClientMock.mockResolvedValueOnce({ id: 50 });
    // First select: clientMembers -> memberIds
    selectQueue.push([{ userId: 10 }, { userId: 11 }]);
    // Second select: users
    selectQueue.push([
      { id: 1, name: 'Admin' },
      { id: 10, name: 'Member Ten' },
      { id: 11, name: 'Member Eleven' },
    ]);

    const res = await mentionableRoute.GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(3);
  });

  it('returns 500 when db throws', async () => {
    authMock.mockResolvedValueOnce(SESSION);
    getPortalClientMock.mockRejectedValueOnce(new Error('boom'));

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await mentionableRoute.GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    errSpy.mockRestore();
  });
});
