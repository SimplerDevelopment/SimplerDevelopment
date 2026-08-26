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
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  sql: Object.assign((..._args: unknown[]) => ({ op: 'sql' }), {
    raw: (s: string) => ({ op: 'raw', s }),
  }),
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
  return { oauthAccessTokens: wrap('oauthAccessTokens'), oauthClients: wrap('oauthClients'), users: wrap('users') };
});

interface UpdateCall { patch: Record<string, unknown>; filter: any }
const updateCalls: UpdateCall[] = [];
let updateReturnRows: Array<Record<string, unknown>> = [];

const selectCalls: Array<{ filter: any }> = [];
let selectRows: Array<Record<string, unknown>> = [];

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
    select: () => {
      const chain: any = {};
      for (const m of ['from', 'innerJoin', 'orderBy']) chain[m] = () => chain;
      chain.where = (filter: unknown) => { selectCalls.push({ filter }); return chain; };
      chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
        Promise.resolve(selectRows.map((r) => ({ ...r }))).then(onF, onR);
      return chain;
    },
  },
}));

const { DELETE, GET } = await import('@/app/api/portal/oauth-tokens/route');

/** Does the captured predicate constrain on oauthAccessTokens.userId? */
function constrainsUserId(filter: any): boolean {
  return (filter?.args ?? []).some(
    (c: any) => c?.op === 'eq' && c?.a?.__col === 'userId' && c?.a?.__table === 'oauthAccessTokens',
  );
}

const req = (id = '7') => new Request(`https://portal.test/api/portal/oauth-tokens?id=${id}`, { method: 'DELETE' });

beforeEach(() => {
  updateCalls.length = 0;
  selectCalls.length = 0;
  selectRows = [];
  updateReturnRows = [{ id: 7 }];
  authMock.mockReset();
  getPortalClientMock.mockReset();
  getPortalRoleMock.mockReset();
  authMock.mockResolvedValue({ user: { id: '42' } });
  getPortalClientMock.mockResolvedValue({ id: 900 });
  getPortalRoleMock.mockResolvedValue('member');
});

const tokenRow = (id: number, uid: number) => ({
  id, tokenPreview: `tok_${id}`, scopes: ['*'], resource: null, lastUsedAt: null,
  expiresAt: null, revokedAt: null, createdAt: new Date('2026-01-01'), userId: uid,
  memberName: `User ${uid}`, memberEmail: `u${uid}@x.test`, clientName: 'Claude.ai', clientUri: null,
});

describe('GET /api/portal/oauth-tokens', () => {
  it('narrows a plain member to their own grants IN SQL, not after the fact', async () => {
    getPortalRoleMock.mockResolvedValue('member');
    selectRows = [tokenRow(1, 42)];
    const res = await GET();
    expect(res.status).toBe(200);
    // The privacy property: a colleague's row never leaves Postgres.
    expect(constrainsUserId(selectCalls[0].filter)).toBe(true);
    const body = await res.json();
    expect(body.data.canManageTeam).toBe(false);
    expect(body.data.mine).toHaveLength(1);
    expect(body.data.team).toHaveLength(0);
  });

  it.each(['owner', 'admin'])('lets a %s see the whole client, split by ownership', async (role) => {
    getPortalRoleMock.mockResolvedValue(role);
    selectRows = [tokenRow(1, 42), tokenRow(2, 99)];
    const res = await GET();
    expect(constrainsUserId(selectCalls[0].filter)).toBe(false);
    const body = await res.json();
    expect(body.data.canManageTeam).toBe(true);
    expect(body.data.mine.map((t: any) => t.id)).toEqual([1]);
    expect(body.data.team.map((t: any) => t.id)).toEqual([2]);
  });

  it('treats a null role (no membership) as non-privileged', async () => {
    getPortalRoleMock.mockResolvedValue(null);
    selectRows = [tokenRow(1, 42)];
    const body = await (await GET()).json();
    expect(constrainsUserId(selectCalls[0].filter)).toBe(true);
    expect(body.data.canManageTeam).toBe(false);
  });

  it('rejects an unauthenticated caller without querying', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(selectCalls).toHaveLength(0);
  });
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

  // PUX-052 widened this from `eq(clientId)` to `or(eq(clientId), <allowlist
  // containment>)`, so the default-client match now sits one level down inside
  // an `or` rather than directly in the top-level `and`. Both halves matter:
  // dropping the eq would stop scoping to the active client, and dropping the
  // or would make a credential that merely lists this client invisible and
  // unrevocable here again.
  const findDeep = (node: any, pred: (n: any) => boolean): boolean => {
    if (!node || typeof node !== 'object') return false;
    if (pred(node)) return true;
    return (node.args ?? []).some((c: any) => findDeep(c, pred));
  };

  it('always scopes to the active client regardless of role', async () => {
    getPortalRoleMock.mockResolvedValue('owner');
    await DELETE(req());
    const clientScoped = findDeep(
      updateCalls[0].filter,
      (c) => c?.op === 'eq' && c?.a?.__col === 'clientId' && c?.b === 900,
    );
    expect(clientScoped, 'lost the default-client match').toBe(true);
  });

  it('also matches credentials that merely list this client in client_ids', async () => {
    getPortalRoleMock.mockResolvedValue('owner');
    await DELETE(req());
    expect(
      findDeep(updateCalls[0].filter, (c) => c?.op === 'or'),
      'revoke filters on the default client only — a credential whose client_ids ' +
        'includes this client but defaults to another is unrevocable here (PUX-052)',
    ).toBe(true);
  });

  it('rejects a missing id without touching the database', async () => {
    const res = await DELETE(new Request('https://portal.test/api/portal/oauth-tokens', { method: 'DELETE' }));
    expect(res.status).toBe(400);
    expect(updateCalls).toHaveLength(0);
  });
});
