// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 25h):
 *   - app/api/portal/sign-out/route.ts            (POST)
 *   - app/api/portal/branding/defaults/route.ts   (GET)
 *   - app/api/portal/mentionable-users/route.ts   (GET)
 *   - app/api/portal/change-password/route.ts     (POST)
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

const getBrandDefaultsMock = vi.fn();
vi.mock('@/lib/branding', () => ({
  getBrandDefaults: (...args: unknown[]) => getBrandDefaultsMock(...args),
}));

const compareMock = vi.fn();
const hashMock = vi.fn();
vi.mock('bcryptjs', () => ({
  compare: (...args: unknown[]) => compareMock(...args),
  hash: (...args: unknown[]) => hashMock(...args),
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
// DB mock: thenable select chain + update chain
// ---------------------------------------------------------------------------

let selectQueue: Array<Array<Record<string, unknown>>> = [];
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
            return Promise.resolve({ rowCount: 1 });
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
const signOutRoute = await import('@/app/api/portal/sign-out/route');
const brandingDefaultsRoute = await import('@/app/api/portal/branding/defaults/route');
const mentionableUsersRoute = await import('@/app/api/portal/mentionable-users/route');
const changePasswordRoute = await import('@/app/api/portal/change-password/route');

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

const SESSION = { user: { id: '7', name: 'Bob' } };

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  selectQueue = [];
  updateSetCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  getBrandDefaultsMock.mockReset();
  compareMock.mockReset();
  hashMock.mockReset();
  // restore NODE_ENV between tests via stubEnv
  vi.stubEnv('NODE_ENV', ORIGINAL_NODE_ENV ?? 'test');
  vi.restoreAllMocks();
});

// ===========================================================================
// portal/sign-out
// ===========================================================================

describe('POST /api/portal/sign-out', () => {
  it('returns success JSON', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const res = await signOutRoute.POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('sets dev cookie names (not __Secure-) when not in production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const res = await signOutRoute.POST();
    // gather Set-Cookie headers
    const setCookies: string[] = [];
    res.headers.forEach((v, k) => {
      if (k.toLowerCase() === 'set-cookie') setCookies.push(v);
    });
    // NextResponse may merge into a single header value with commas; we just stringify
    const joined = setCookies.join('\n');
    expect(joined).toMatch(/authjs\.session-token=/);
    expect(joined).toMatch(/authjs\.csrf-token=/);
    expect(joined).toMatch(/sd-active-client=/);
    // in non-production: should NOT set wildcard domain cookies
    expect(joined).not.toMatch(/Domain=\.simplerdevelopment\.com/i);
  });

  it('emits __Secure-prefixed cookies and wildcard domain in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = await signOutRoute.POST();
    const setCookies: string[] = [];
    res.headers.forEach((v, k) => {
      if (k.toLowerCase() === 'set-cookie') setCookies.push(v);
    });
    const joined = setCookies.join('\n');
    expect(joined).toMatch(/__Secure-authjs\.session-token=/);
    // in production the wildcard domain should appear (NextResponse may
    // dedupe same-named cookies; bare-domain set is overwritten by wildcard).
    expect(joined).toMatch(/Domain=\.simplerdevelopment\.com/i);
    expect(joined).toMatch(/Secure/i);
  });
});

// ===========================================================================
// portal/branding/defaults
// ===========================================================================

describe('GET /api/portal/branding/defaults', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await brandingDefaultsRoute.GET(
      makeReq('http://x/api/portal/branding/defaults'),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/Unauthorized/);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await brandingDefaultsRoute.GET(
      makeReq('http://x/api/portal/branding/defaults'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await brandingDefaultsRoute.GET(
      makeReq('http://x/api/portal/branding/defaults'),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/Client not found/);
  });

  it('passes a valid profileId through to getBrandDefaults', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    getBrandDefaultsMock.mockResolvedValue({ palette: { primary: '#fff' } });
    const res = await brandingDefaultsRoute.GET(
      makeReq('http://x/api/portal/branding/defaults?profileId=99'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ palette: { primary: '#fff' } });
    expect(getBrandDefaultsMock).toHaveBeenCalledWith({
      clientId: 42,
      brandingProfileId: 99,
    });
  });

  it('passes null brandingProfileId when query param absent', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 12 });
    getBrandDefaultsMock.mockResolvedValue({ palette: {} });
    const res = await brandingDefaultsRoute.GET(
      makeReq('http://x/api/portal/branding/defaults'),
    );
    expect(res.status).toBe(200);
    expect(getBrandDefaultsMock).toHaveBeenCalledWith({
      clientId: 12,
      brandingProfileId: null,
    });
  });

  it('passes null brandingProfileId when query param is NaN', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 3 });
    getBrandDefaultsMock.mockResolvedValue({});
    const res = await brandingDefaultsRoute.GET(
      makeReq('http://x/api/portal/branding/defaults?profileId=not-a-number'),
    );
    expect(res.status).toBe(200);
    expect(getBrandDefaultsMock).toHaveBeenCalledWith({
      clientId: 3,
      brandingProfileId: null,
    });
  });

  it('returns 500 when getBrandDefaults throws an Error', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    getBrandDefaultsMock.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await brandingDefaultsRoute.GET(
      makeReq('http://x/api/portal/branding/defaults'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('boom');
  });

  it('returns 500 with fallback message for non-Error throws', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    getBrandDefaultsMock.mockRejectedValue('not-an-error');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await brandingDefaultsRoute.GET(
      makeReq('http://x/api/portal/branding/defaults'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toMatch(/Failed to load brand defaults/);
  });
});

// ===========================================================================
// portal/mentionable-users
// ===========================================================================

describe('GET /api/portal/mentionable-users', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await mentionableUsersRoute.GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await mentionableUsersRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns only staff (no client members) when caller has no portal client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    selectQueue.push([
      { id: 1, name: 'Alice (admin)' },
      { id: 2, name: 'Bob (employee)' },
    ]);
    const res = await mentionableUsersRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].name).toBe('Alice (admin)');
  });

  it('includes both staff and active-client members when client exists', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 9 });
    // First select: client members
    selectQueue.push([{ userId: 100 }, { userId: 200 }]);
    // Second select: users (mix of staff + members)
    selectQueue.push([
      { id: 1, name: 'Adam (staff)' },
      { id: 100, name: 'Mike (client)' },
      { id: 200, name: 'Nora (client)' },
    ]);
    const res = await mentionableUsersRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(3);
    expect(body.data.map((u: { name: string }) => u.name)).toContain('Mike (client)');
  });

  it('returns 500 when db throws', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await mentionableUsersRoute.GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/Internal server error/);
  });
});

// ===========================================================================
// portal/change-password
// ===========================================================================

describe('POST /api/portal/change-password', () => {
  function makePasswordReq(body: unknown): Request {
    return new Request('http://x/api/portal/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await changePasswordRoute.POST(
      makePasswordReq({ currentPassword: 'a', newPassword: 'b12345678' }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 when currentPassword missing', async () => {
    authMock.mockResolvedValue(SESSION);
    const res = await changePasswordRoute.POST(
      makePasswordReq({ newPassword: 'longenough' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Current password is required/);
  });

  it('returns 400 when newPassword shorter than 8 chars', async () => {
    authMock.mockResolvedValue(SESSION);
    const res = await changePasswordRoute.POST(
      makePasswordReq({ currentPassword: 'oldpass', newPassword: 'short' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/at least 8 characters/);
  });

  it('returns 400 when newPassword is not a string', async () => {
    authMock.mockResolvedValue(SESSION);
    const res = await changePasswordRoute.POST(
      makePasswordReq({ currentPassword: 'oldpass', newPassword: 12345678 }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/at least 8 characters/);
  });

  it('returns 404 when the user is missing in db', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([]); // no rows
    const res = await changePasswordRoute.POST(
      makePasswordReq({ currentPassword: 'oldpass', newPassword: 'newpassword123' }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/User not found/);
  });

  it('returns 400 when current password does not match', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([{ id: 7, password: 'hashed-old' }]);
    compareMock.mockResolvedValue(false);
    const res = await changePasswordRoute.POST(
      makePasswordReq({ currentPassword: 'wrong', newPassword: 'newpassword123' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Current password is incorrect/);
    expect(compareMock).toHaveBeenCalledWith('wrong', 'hashed-old');
  });

  it('hashes new password and updates the user when current is valid', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([{ id: 7, password: 'hashed-old' }]);
    compareMock.mockResolvedValue(true);
    hashMock.mockResolvedValue('hashed-new');
    const res = await changePasswordRoute.POST(
      makePasswordReq({ currentPassword: 'oldpass', newPassword: 'newpassword123' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/Password updated/);
    expect(hashMock).toHaveBeenCalledWith('newpassword123', 12);
    expect(updateSetCalls).toHaveLength(1);
    expect(updateSetCalls[0].table).toBe('users');
    expect(updateSetCalls[0].values.password).toBe('hashed-new');
    expect(updateSetCalls[0].values.updatedAt).toBeInstanceOf(Date);
  });
});
