// @vitest-environment node
/**
 * Unit tests for app/api/portal/agency/custom-domain/route.ts (GET / POST / DELETE).
 *
 * Strategy: mock auth, getPortalClient/Role, the dns-verify helpers,
 * clearCustomDomainCache, drizzle-orm operators, schema tables, and db.
 * db.select() returns a chain that resolves to queued rows; db.update()
 * and db.insert() capture writes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- mocks (must be declared before importing the route) ----

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
const getPortalRoleMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
  getPortalRole: (...args: unknown[]) => getPortalRoleMock(...args),
}));

const generateVerificationTokenMock = vi.fn();
const isPlausibleDomainMock = vi.fn();
vi.mock('@/lib/agency/dns-verify', () => ({
  generateVerificationToken: () => generateVerificationTokenMock(),
  isPlausibleDomain: (d: unknown) => isPlausibleDomainMock(d),
}));

const clearCustomDomainCacheMock = vi.fn();
vi.mock('@/lib/agency/custom-domain', () => ({
  clearCustomDomainCache: () => clearCustomDomainCacheMock(),
}));

// drizzle-orm — stub operators to plain objects
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// schema — proxy tables so `table.col` is inert
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
    clients: wrap('clients'),
    customDomainHistory: wrap('customDomainHistory'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---- db mock ----

interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
}
interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
const updateCalls: UpdateCall[] = [];
const insertCalls: InsertCall[] = [];

function shiftNext(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;

    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) {
        materializedPromise = Promise.resolve(shiftNext());
      }
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'groupBy']) {
      chain[m] = passthrough;
    }
    chain.limit = () => {
      materialize();
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
      };
    };
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
      return materialize().then(onF, onR);
    };
    return chain;
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            updateCalls.push({ table: table.__table, patch, filter });
            return Promise.resolve(undefined);
          },
        };
      },
    };
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        insertCalls.push({ table: table.__table, values: v });
        return Promise.resolve(undefined);
      },
    };
  }

  return {
    db: {
      select() {
        return buildSelect();
      },
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
    },
  };
});

// ---- module under test (after mocks) ----

const { GET, POST, DELETE } = await import('@/app/api/portal/agency/custom-domain/route');

// ---- helpers ----

function jsonReq(body: unknown, opts?: { malformed?: boolean }): Request {
  if (opts?.malformed) {
    return new Request('http://x/api/portal/agency/custom-domain', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json{{{',
    });
  }
  return new Request('http://x/api/portal/agency/custom-domain', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const OWNER_SESSION = { user: { id: '7' } };
const CLIENT_OBJ = { id: 33 };

beforeEach(() => {
  selectQueue = [];
  updateCalls.length = 0;
  insertCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  getPortalRoleMock.mockReset();
  generateVerificationTokenMock.mockReset().mockReturnValue('tok-abc');
  isPlausibleDomainMock.mockReset().mockReturnValue(true);
  clearCustomDomainCacheMock.mockReset();
});

// ---------------------------------------------------------------------------
// shared auth/role gating (exercised through GET)
// ---------------------------------------------------------------------------

describe('requireAdminClient gating (via GET)', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns 401 when session lacks user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when no portal client is resolved', async () => {
    authMock.mockResolvedValue(OWNER_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Client not found' });
  });

  it('returns 403 when role is neither owner nor admin', async () => {
    authMock.mockResolvedValue(OWNER_SESSION);
    getPortalClientMock.mockResolvedValue(CLIENT_OBJ);
    getPortalRoleMock.mockResolvedValue('member');
    const res = await GET();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Owner or admin role required');
  });

  it('allows admin role', async () => {
    authMock.mockResolvedValue(OWNER_SESSION);
    getPortalClientMock.mockResolvedValue(CLIENT_OBJ);
    getPortalRoleMock.mockResolvedValue('admin');
    selectQueue.push([]); // no row
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/portal/agency/custom-domain', () => {
  beforeEach(() => {
    authMock.mockResolvedValue(OWNER_SESSION);
    getPortalClientMock.mockResolvedValue(CLIENT_OBJ);
    getPortalRoleMock.mockResolvedValue('owner');
  });

  it('returns default null state when no row exists', async () => {
    selectQueue.push([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      data: {
        customDomain: null,
        verifiedAt: null,
        verificationRecord: null,
        whiteLabelEnabled: false,
      },
    });
  });

  it('returns mapping with verificationRecord when domain + token present', async () => {
    selectQueue.push([
      {
        customDomain: 'portal.acme.com',
        customDomainVerifiedAt: null,
        customDomainVerificationToken: 'tkn-1',
        whiteLabelEnabled: false,
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.customDomain).toBe('portal.acme.com');
    expect(body.data.verificationRecord).toEqual({
      host: '_simplerdev.portal.acme.com',
      type: 'TXT',
      value: 'tkn-1',
    });
    expect(body.data.whiteLabelEnabled).toBe(false);
  });

  it('returns null verificationRecord when domain present but token is missing', async () => {
    selectQueue.push([
      {
        customDomain: 'portal.acme.com',
        customDomainVerifiedAt: new Date('2026-05-01').toISOString(),
        customDomainVerificationToken: null,
        whiteLabelEnabled: true,
      },
    ]);
    const res = await GET();
    const body = await res.json();
    expect(body.data.verificationRecord).toBeNull();
    expect(body.data.whiteLabelEnabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

describe('POST /api/portal/agency/custom-domain', () => {
  beforeEach(() => {
    authMock.mockResolvedValue(OWNER_SESSION);
    getPortalClientMock.mockResolvedValue(CLIENT_OBJ);
    getPortalRoleMock.mockResolvedValue('owner');
  });

  it('returns 401 when unauthenticated (gating still applies)', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(jsonReq({ domain: 'x.com' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await POST(jsonReq(null, { malformed: true }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Invalid JSON body' });
  });

  it('returns 400 when domain is not plausible', async () => {
    isPlausibleDomainMock.mockReturnValue(false);
    const res = await POST(jsonReq({ domain: 'not a domain' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/valid public domain/);
  });

  it('trims and lowercases the input domain before validation', async () => {
    isPlausibleDomainMock.mockReturnValue(true);
    selectQueue.push([]); // no existing claim
    const res = await POST(jsonReq({ domain: '  Portal.ACME.com  ' }));
    expect(res.status).toBe(200);
    expect(isPlausibleDomainMock).toHaveBeenCalledWith('portal.acme.com');
    expect(updateCalls[0].patch).toMatchObject({
      customDomain: 'portal.acme.com',
      customDomainVerificationToken: 'tok-abc',
      customDomainVerifiedAt: null,
      whiteLabelEnabled: false,
    });
  });

  it('returns 400 with empty body domain (defaults to empty string)', async () => {
    isPlausibleDomainMock.mockReturnValue(false);
    const res = await POST(jsonReq({}));
    expect(res.status).toBe(400);
    expect(isPlausibleDomainMock).toHaveBeenCalledWith('');
  });

  it('returns 409 when the domain is already claimed by another client', async () => {
    isPlausibleDomainMock.mockReturnValue(true);
    selectQueue.push([{ id: 999 }]); // other client owns it
    const res = await POST(jsonReq({ domain: 'portal.acme.com' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already claimed/);
    expect(updateCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
    expect(clearCustomDomainCacheMock).not.toHaveBeenCalled();
  });

  it('allows the same client to re-claim its own domain', async () => {
    isPlausibleDomainMock.mockReturnValue(true);
    selectQueue.push([{ id: CLIENT_OBJ.id }]); // existing row belongs to us
    const res = await POST(jsonReq({ domain: 'portal.acme.com' }));
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(insertCalls).toHaveLength(1);
  });

  it('persists update + history insert + clears cache on success', async () => {
    isPlausibleDomainMock.mockReturnValue(true);
    selectQueue.push([]); // no prior claim
    const res = await POST(jsonReq({ domain: 'portal.acme.com' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      data: {
        customDomain: 'portal.acme.com',
        verifiedAt: null,
        verificationRecord: {
          host: '_simplerdev.portal.acme.com',
          type: 'TXT',
          value: 'tok-abc',
        },
        whiteLabelEnabled: false,
      },
    });
    expect(updateCalls[0]).toMatchObject({
      table: 'clients',
      patch: {
        customDomain: 'portal.acme.com',
        customDomainVerificationToken: 'tok-abc',
        customDomainVerifiedAt: null,
        whiteLabelEnabled: false,
      },
    });
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
    expect(insertCalls[0]).toEqual({
      table: 'customDomainHistory',
      values: {
        clientId: CLIENT_OBJ.id,
        domain: 'portal.acme.com',
        action: 'added',
        byUserId: 7,
      },
    });
    expect(clearCustomDomainCacheMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe('DELETE /api/portal/agency/custom-domain', () => {
  beforeEach(() => {
    authMock.mockResolvedValue(OWNER_SESSION);
    getPortalClientMock.mockResolvedValue(CLIENT_OBJ);
    getPortalRoleMock.mockResolvedValue('owner');
  });

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await DELETE();
    expect(res.status).toBe(401);
  });

  it('clears the mapping and inserts removed history when a domain existed', async () => {
    selectQueue.push([{ customDomain: 'portal.acme.com' }]);
    const res = await DELETE();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: { customDomain: null } });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({
      table: 'clients',
      patch: {
        customDomain: null,
        customDomainVerificationToken: null,
        customDomainVerifiedAt: null,
        whiteLabelEnabled: false,
      },
    });
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toEqual({
      table: 'customDomainHistory',
      values: {
        clientId: CLIENT_OBJ.id,
        domain: 'portal.acme.com',
        action: 'removed',
        byUserId: 7,
      },
    });
    expect(clearCustomDomainCacheMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT insert history when there was no prior domain', async () => {
    selectQueue.push([{ customDomain: null }]);
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(insertCalls).toHaveLength(0);
    expect(clearCustomDomainCacheMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT insert history when select returns no row', async () => {
    selectQueue.push([]);
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(insertCalls).toHaveLength(0);
  });
});
