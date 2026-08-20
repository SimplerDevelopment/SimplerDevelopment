// @vitest-environment node
/**
 * Unit tests for DELETE app/api/portal/oauth-tokens/route.ts.
 *
 * The boundary under test is INTRA-tenant: every caller here is already a
 * member of the same portal client, so `bun test:tenancy` cannot reach it.
 * What matters is whether the revoke query is additionally constrained to the
 * caller's own `userId` -- it wasn't, which let any member cut off a
 * colleague's Claude/MCP connection.
 *
 * Strategy: drizzle operators are stubbed to plain objects so the `where`
 * predicate can be inspected directly. `and()` drops undefined exactly like the
 * real one, which is how an owner/admin's missing userId constraint is asserted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({ auth: () => authMock() }));

const getPortalClientMock = vi.fn();
const getPortalRoleMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...a: unknown[]) => getPortalClientMock(...a),
  getPortalRole: (...a: unknown[]) => getPortalRoleMock(...a),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  // The real `and()` ignores undefined entries -- mirror that, since the route
  // relies on it to drop the userId constraint for owners/admins.
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter((x) => x !== undefined) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
}));

vi.mock('@/lib/db/schema', () => {
  const wrap = (t: string) =>
    new Proxy({ __table: t }, {
      get(_o, p: string) {
        if (p === '__table') return t;
        return { __col: p, __table: t };
      },
    });
  return { oauthAccessTokens: wrap('oauthAccessTokens'), oauthClients: wrap('oauthClients') };
});

interface UpdateCall { patch: Record<string, unknown>; filter: any }
const updateCalls: UpdateCall[] = [];
let updateReturnRows: Array<Record<string, unknown>> = [];

vi.mock('@/lib/db', () => ({
  db: {
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: (filter: unknown) => {
          updateCalls.push({ patch, filter });
          return { returning: () => Promise.resolve(updateReturnRows.map((r) => ({ ...r }))) };
        },
      }),
    }),
    select: () => ({}),
  },
}));

const { DELETE } = await import('@/app/api/portal/oauth-tokens/route');

/** Does the captured predicate constrain on oauthAccessTokens.userId? */
function constrainsUserId(filter: any): boolean {
  return (filter?.args ?? []).some(
    (c: any) => c?.op === 'eq' && c?.a?.__col === 'userId' && c?.a?.__table === 'oauthAccessTokens',
  );
}

const req = (id = '7') => new Request(`https://portal.test/api/portal/oauth-tokens?id=${id}`, { method: 'DELETE' });

beforeEach(() => {
  updateCalls.length = 0;
  updateReturnRows = [{ id: 7 }];
  authMock.mockReset();
  getPortalClientMock.mockReset();
  getPortalRoleMock.mockReset();
  authMock.mockResolvedValue({ user: { id: '42' } });
  getPortalClientMock.mockResolvedValue({ id: 900 });
  getPortalRoleMock.mockResolvedValue('member');
});

describe('DELETE /api/portal/oauth-tokens', () => {
  it('rejects an unauthenticated caller', async () => {
    authMock.mockResolvedValue(null);
    const res = await DELETE(req());
    expect(res.status).toBe(401);
    expect(updateCalls).toHaveLength(0);
  });

  it('constrains a plain member to their own grants', async () => {
    const res = await DELETE(req());
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(constrainsUserId(updateCalls[0].filter)).toBe(true);
  });

  // The regression: a member aiming at a colleague's grant matches no row, and
  // must be told so rather than receiving a success the UI renders as "Revoked".
  it('404s when a member targets a grant that is not theirs', async () => {
    updateReturnRows = [];
    const res = await DELETE(req('999'));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ success: false });
    expect(constrainsUserId(updateCalls[0].filter)).toBe(true);
  });

  it.each(['owner', 'admin'])('lets a %s revoke any grant in the client', async (role) => {
    getPortalRoleMock.mockResolvedValue(role);
    const res = await DELETE(req());
    expect(res.status).toBe(200);
    expect(constrainsUserId(updateCalls[0].filter)).toBe(false);
  });

  it.each(['member', 'viewer'])('does not treat %s as client-wide authority', async (role) => {
    getPortalRoleMock.mockResolvedValue(role);
    await DELETE(req());
    expect(constrainsUserId(updateCalls[0].filter)).toBe(true);
  });

  // A revoked membership must not retain authority via a stale session role.
  it('treats a null role (no membership) as non-privileged', async () => {
    getPortalRoleMock.mockResolvedValue(null);
    await DELETE(req());
    expect(constrainsUserId(updateCalls[0].filter)).toBe(true);
  });

  it('always scopes to the active client regardless of role', async () => {
    getPortalRoleMock.mockResolvedValue('owner');
    await DELETE(req());
    const clientScoped = updateCalls[0].filter.args.some(
      (c: any) => c?.op === 'eq' && c?.a?.__col === 'clientId' && c?.b === 900,
    );
    expect(clientScoped).toBe(true);
  });

  it('rejects a missing id without touching the database', async () => {
    const res = await DELETE(new Request('https://portal.test/api/portal/oauth-tokens', { method: 'DELETE' }));
    expect(res.status).toBe(400);
    expect(updateCalls).toHaveLength(0);
  });
});
