/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment node
/**
 * Pins `authorizePortal`'s bearer-branch OAuth scope enforcement
 * (AUTH79-011) — see lib/portal-auth.ts lines ~136-164.
 *
 * Behaviour under test:
 *  - A bearer request (`resolvePortalFromCurrentRequest()` returns non-null)
 *    whose granted `scopes` don't satisfy `requiredScopeFor(opts)` always
 *    emits a `console.warn` JSON line `{ event: 'oauth.scope.insufficient', ... }`.
 *  - It only returns a 403 `{ success: false, error: 'insufficient_scope', required_scope }`
 *    when `process.env.AUTH_SCOPE_ENFORCE === '1'` — otherwise it's log-only and
 *    the request continues to the role gate.
 *  - Session (non-bearer) callers never enter this branch at all.
 *
 * This test had no coverage before AUTH79-011 landed; a refactor could drop
 * the enforcement gate (or the log-only rollout guard) silently.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { assertMockUsed } from '../helpers/assertMockUsed';

// ===========================================================================
// drizzle-orm + schema stubs (mirrors tests/unit/lib-portal-and-storefront-auth.test.ts)
// ===========================================================================

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ __op: 'eq', col, val }),
  and: (...conds: unknown[]) => ({ __op: 'and', conds }),
}));

vi.mock('@/lib/db/schema', () => ({
  clients: {
    __table: 'clients',
    id: { __col: 'id' },
    userId: { __col: 'userId' },
    $inferSelect: {} as any,
  },
  clientMembers: {
    __table: 'clientMembers',
    role: { __col: 'role' },
    clientId: { __col: 'clientId' },
    userId: { __col: 'userId' },
  },
  clientServices: {
    __table: 'clientServices',
    clientId: { __col: 'clientId' },
    serviceId: { __col: 'serviceId' },
    status: { __col: 'status' },
  },
  services: {
    __table: 'services',
    id: { __col: 'id' },
    category: { __col: 'category' },
  },
}));

// db mock — none of these tests exercise `resolveRole`'s membership query
// (every bearer/client fixture below is the direct `client.userId === userId`
// owner match, which short-circuits before any `db.select()`), but the module
// still imports `@/lib/db` at load time so it must resolve to something.
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([]) }),
        innerJoin: () => ({ where: () => Promise.resolve([]) }),
      }),
    }),
  },
}));

// ===========================================================================
// portal-auth's other collaborators
// ===========================================================================

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({ auth: () => authMock() }));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: any, init?: { status?: number }) => ({
      __nextResponse: true,
      status: init?.status ?? 200,
      _body: body,
      json: async () => body,
    }),
  },
}));

// resolvePortalFromCurrentRequest is mocked (per-test controlled); hasScope is
// the REAL implementation — this test is specifically pinning how
// authorizePortal uses hasScope's real semantics (`*` wildcard, `resource:*`),
// not a re-mock of it.
const resolvePortalFromCurrentRequestMock = vi.fn();
vi.mock('@/lib/mcp-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/mcp-auth')>('@/lib/mcp-auth');
  return {
    ...actual,
    resolvePortalFromCurrentRequest: (...args: unknown[]) => resolvePortalFromCurrentRequestMock(...args),
  };
});

// ===========================================================================
// Imports MUST come after vi.mock calls (hoisted, but keep tidy).
// ===========================================================================
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

function makeBearer(overrides: Partial<{ userId: number; scopes: string[]; keyId: number | null }> = {}) {
  const userId = overrides.userId ?? 42;
  return {
    userId,
    client: { id: 99, userId, name: 'Acme' }, // client.userId === userId -> resolveRole short-circuits to 'owner'
    scopes: overrides.scopes ?? [],
    keyId: overrides.keyId ?? 7,
    credentialKind: 'oauth' as const,
  };
}

describe("authorizePortal — OAuth scope enforcement (AUTH79-011, log-only vs AUTH_SCOPE_ENFORCE)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resolvePortalFromCurrentRequestMock.mockReset();
    authMock.mockReset();
    getPortalClientMock.mockReset();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  function scopeLogCalls() {
    return warnSpy.mock.calls
      .map(([line]) => {
        try {
          return JSON.parse(line as string);
        } catch {
          return null;
        }
      })
      .filter((parsed) => parsed?.event === 'oauth.scope.insufficient');
  }

  // -------- 1. insufficient scope, enforce unset --------
  it('logs but does NOT 403 when AUTH_SCOPE_ENFORCE is unset', async () => {
    delete process.env.AUTH_SCOPE_ENFORCE; // ensure truly unset, not '' or a leftover from another test

    const bearer = makeBearer({ scopes: ['bar:read'] });
    resolvePortalFromCurrentRequestMock.mockResolvedValue(bearer);

    const result: any = await authorizePortal({ scope: 'foo:read' });

    expect(isAuthError(result)).toBe(false); // no 403 — request proceeded to the role gate
    assertMockUsed(resolvePortalFromCurrentRequestMock, 'resolvePortalFromCurrentRequest');

    const logs = scopeLogCalls();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      event: 'oauth.scope.insufficient',
      required_scope: 'foo:read',
      granted_scopes: ['bar:read'],
      enforced: false,
    });
  });

  // -------- 2. insufficient scope, enforce ON --------
  it('returns 403 insufficient_scope and logs enforced:true when AUTH_SCOPE_ENFORCE=1', async () => {
    vi.stubEnv('AUTH_SCOPE_ENFORCE', '1');

    const bearer = makeBearer({ scopes: ['bar:read'] });
    resolvePortalFromCurrentRequestMock.mockResolvedValue(bearer);

    const result: any = await authorizePortal({ scope: 'foo:read' });

    expect(isAuthError(result)).toBe(true);
    expect(result.response.status).toBe(403);
    expect(result.response._body).toEqual({
      success: false,
      error: 'insufficient_scope',
      required_scope: 'foo:read',
    });

    const logs = scopeLogCalls();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      event: 'oauth.scope.insufficient',
      required_scope: 'foo:read',
      granted_scopes: ['bar:read'],
      enforced: true,
    });
  });

  // -------- 3. bearer WITH the required scope, enforce on --------
  it('no 403 and no scope log when the bearer already carries the required scope', async () => {
    vi.stubEnv('AUTH_SCOPE_ENFORCE', '1');

    const bearer = makeBearer({ scopes: ['foo:read'] });
    resolvePortalFromCurrentRequestMock.mockResolvedValue(bearer);

    const result: any = await authorizePortal({ scope: 'foo:read' });

    expect(isAuthError(result)).toBe(false);
    expect(scopeLogCalls()).toHaveLength(0);
  });

  // -------- 4. bearer with ['*'] (sd_mcp_ key), enforce on --------
  it('a wildcard-scoped (sd_mcp_) bearer is never denied regardless of required scope', async () => {
    vi.stubEnv('AUTH_SCOPE_ENFORCE', '1');

    const bearer = makeBearer({ scopes: ['*'] });
    resolvePortalFromCurrentRequestMock.mockResolvedValue(bearer);

    const result: any = await authorizePortal({ scope: 'anything:write' });

    expect(isAuthError(result)).toBe(false);
    expect(scopeLogCalls()).toHaveLength(0);
  });

  // -------- 5. no required scope derivable --------
  it('emits no scope log at all when no scope/requireService is given', async () => {
    vi.stubEnv('AUTH_SCOPE_ENFORCE', '1');

    const bearer = makeBearer({ scopes: [] }); // even an empty-scope bearer is fine — nothing is required
    resolvePortalFromCurrentRequestMock.mockResolvedValue(bearer);

    const result: any = await authorizePortal(); // no scope, no requireService -> requiredScopeFor() === null

    expect(isAuthError(result)).toBe(false);
    expect(scopeLogCalls()).toHaveLength(0);
  });

  // -------- 6. session caller (no bearer), enforce on --------
  it('a session caller never enters the scope branch — no log, never 403 for scope', async () => {
    vi.stubEnv('AUTH_SCOPE_ENFORCE', '1');

    resolvePortalFromCurrentRequestMock.mockResolvedValue(null); // not a bearer request
    authMock.mockResolvedValue({ user: { id: '11' } });
    const client = { id: 99, userId: 11, name: 'Acme' }; // owner match -> resolveRole short-circuits
    getPortalClientMock.mockResolvedValue(client);

    const result: any = await authorizePortal({ scope: 'foo:read' });

    assertMockUsed(resolvePortalFromCurrentRequestMock, 'resolvePortalFromCurrentRequest');
    expect(isAuthError(result)).toBe(false);
    expect(scopeLogCalls()).toHaveLength(0);
  });
});
