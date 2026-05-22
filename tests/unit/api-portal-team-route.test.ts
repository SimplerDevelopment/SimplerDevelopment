// @vitest-environment node
/**
 * Unit tests for app/api/portal/team/route.ts (GET / POST).
 *
 * Strategy: db.select() returns a chainable thenable that resolves to the
 * next queued result set. db.update() / db.insert() capture writes and
 * resolve their `.returning()` to a queued row set. Auxiliary modules
 * (auth, portal-client, email, bcryptjs, crypto, token-hash) are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- mocks (must be declared before importing the route) ----

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
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
    clients: wrap('clients'),
    clientMembers: wrap('clientMembers'),
  };
});

const hashMock = vi.fn(async () => 'HASHED_PLACEHOLDER');
vi.mock('bcryptjs', () => ({
  hash: (...args: unknown[]) => hashMock(...args),
}));

vi.mock('crypto', () => ({
  randomBytes: (n: number) => ({
    toString: (_enc: string) => 'r'.repeat(n * 2),
  }),
}));

const sendInviteEmailMock = vi.fn();
vi.mock('@/lib/email/invite-email', () => ({
  sendInviteEmail: (...args: unknown[]) => sendInviteEmailMock(...args),
}));

const hashTokenMock = vi.fn((t: string) => `HASH(${t.slice(0, 4)})`);
vi.mock('@/lib/security/token-hash', () => ({
  hashToken: (...args: unknown[]) => hashTokenMock(...args as [string]),
}));

// ---- db mock ----

interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
}
interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
  returnedRows: Array<Record<string, unknown>>;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
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

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            updateCalls.push({ table: table.__table, patch, filter });
            return {
              then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                return Promise.resolve(undefined).then(onF, onR);
              },
            };
          },
        };
      },
    };
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        const rows = insertReturnQueue.shift() ?? [];
        insertCalls.push({ table: table.__table, values: v, returnedRows: rows });
        const cloned = rows.map((r) => ({ ...r }));
        return {
          returning() {
            return Promise.resolve(cloned);
          },
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(cloned).then(onF, onR);
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

const { GET, POST } = await import('@/app/api/portal/team/route');

// ---- helpers ----

function makeJsonRequest(body: unknown): Request {
  return new Request('http://x/api/portal/team', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const SESSION = { user: { id: '7', name: 'Inviter Bob' } };

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  updateCalls.length = 0;
  insertCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  hashMock.mockClear();
  sendInviteEmailMock.mockReset();
  hashTokenMock.mockClear();
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/portal/team', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when session lacks user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns owner role when the user is the primary owner', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 7, createdAt: new Date('2025-01-01') });
    // No call for getUserRole because client.userId === userId.
    // members query
    selectQueue.push([
      {
        memberId: 1,
        role: 'owner',
        joinedAt: new Date('2025-02-01'),
        userId: 7,
        name: 'Inviter Bob',
        email: 'bob@x.com',
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.currentRole).toBe('owner');
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      isOwner: true,
      isCurrentUser: true,
    });
  });

  it('resolves currentRole from clientMembers when user is not the primary owner', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 99, createdAt: new Date('2025-01-01') });
    // getUserRole limit(1) -> finds row
    selectQueue.push([{ role: 'admin' }]);
    // members query
    selectQueue.push([
      {
        memberId: 1,
        role: 'admin',
        joinedAt: new Date('2025-02-01'),
        userId: 7,
        name: 'Inviter Bob',
        email: 'bob@x.com',
      },
      {
        memberId: 2,
        role: 'owner',
        joinedAt: new Date('2025-01-01'),
        userId: 99,
        name: 'Owner Alice',
        email: 'alice@x.com',
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.currentRole).toBe('admin');
    expect(body.data).toHaveLength(2);
    // Inviter Bob is the current user
    expect(body.data[0].isCurrentUser).toBe(true);
    expect(body.data[0].isOwner).toBe(false);
    // Owner is flagged as owner via role
    expect(body.data[1].isOwner).toBe(true);
    expect(body.data[1].isCurrentUser).toBe(false);
  });

  it('returns null currentRole when user has no clientMembers row', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 99, createdAt: new Date('2025-01-01') });
    selectQueue.push([]); // getUserRole -> no row
    selectQueue.push([]); // members
    // owner is missing from members list and client.userId is truthy, so it tries
    // to fetch the owner — return empty so we don't unshift anything.
    selectQueue.push([]); // owner lookup -> empty
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.currentRole).toBeNull();
    expect(body.data).toEqual([]);
  });

  it('unshifts the primary owner when missing from clientMembers', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 99, createdAt: new Date('2025-01-01') });
    selectQueue.push([{ role: 'member' }]); // getUserRole
    selectQueue.push([
      {
        memberId: 1,
        role: 'member',
        joinedAt: new Date('2025-02-01'),
        userId: 7,
        name: 'Inviter Bob',
        email: 'bob@x.com',
      },
    ]); // members
    selectQueue.push([{ id: 99, name: 'Owner Alice', email: 'alice@x.com' }]); // owner lookup
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    // Owner unshifted to position 0
    expect(body.data[0]).toMatchObject({
      memberId: 0,
      role: 'owner',
      userId: 99,
      name: 'Owner Alice',
      isOwner: true,
      isCurrentUser: false,
    });
    expect(body.data[1].userId).toBe(7);
  });

  it('does not look up owner when client.userId is null', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: null, createdAt: new Date('2025-01-01') });
    // client.userId !== userId, so getUserRole runs
    selectQueue.push([{ role: 'member' }]);
    selectQueue.push([]); // members
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    // Only two select calls consumed (no owner lookup)
    expect(selectQueue.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

describe('POST /api/portal/team', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeJsonRequest({}));
    expect(res.status).toBe(401);
  });

  it('returns 401 when session lacks user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await POST(makeJsonRequest({}));
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await POST(makeJsonRequest({ name: 'X', email: 'x@x.com' }));
    expect(res.status).toBe(404);
  });

  it('returns 403 when current user is a member (not owner/admin)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 99 });
    selectQueue.push([{ role: 'member' }]); // getUserRole
    const res = await POST(makeJsonRequest({ name: 'X', email: 'x@x.com' }));
    expect(res.status).toBe(403);
    expect((await res.json()).message).toBe(
      'Only owners and admins can invite members',
    );
  });

  it('returns 403 when user has no role at all', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 99 });
    selectQueue.push([]); // getUserRole -> null
    const res = await POST(makeJsonRequest({ name: 'X', email: 'x@x.com' }));
    expect(res.status).toBe(403);
  });

  it('returns 400 when name is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 7 }); // owner
    const res = await POST(makeJsonRequest({ email: 'x@x.com' }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Name and email are required');
  });

  it('returns 400 when email is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 7 }); // owner
    const res = await POST(makeJsonRequest({ name: 'Foo' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when name and email are blank strings', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 7 });
    const res = await POST(makeJsonRequest({ name: '   ', email: '   ' }));
    expect(res.status).toBe(400);
  });

  it('returns 403 when admin tries to assign the admin role', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 99 });
    selectQueue.push([{ role: 'admin' }]); // getUserRole
    const res = await POST(
      makeJsonRequest({ name: 'New', email: 'new@x.com', role: 'admin' }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).message).toBe('Only owners can assign the admin role');
  });

  it('owners CAN assign the admin role', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({
      id: 33,
      userId: 7,
      company: 'Acme',
    });
    // existing user lookup -> none
    selectQueue.push([]);
    // alreadyMember check -> none
    selectQueue.push([]);
    // user insert
    insertReturnQueue.push([{ id: 500, name: 'New', email: 'new@x.com' }]);
    // member insert
    insertReturnQueue.push([{ id: 600, userId: 500, role: 'admin', clientId: 33 }]);
    sendInviteEmailMock.mockResolvedValue(undefined);

    const res = await POST(
      makeJsonRequest({ name: 'New', email: 'new@x.com', role: 'admin' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.isNewUser).toBe(true);
    expect(body.data.inviteSent).toBe(true);
    // member insert used assignRole=admin
    expect(insertCalls[1].values).toMatchObject({ role: 'admin' });
    expect(sendInviteEmailMock).toHaveBeenCalledTimes(1);
    expect(sendInviteEmailMock.mock.calls[0][0]).toMatchObject({
      recipientEmail: 'new@x.com',
      companyName: 'Acme',
      role: 'admin',
    });
  });

  it('falls back to member when role is not in VALID_ROLES', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 7 });
    selectQueue.push([]); // user lookup
    selectQueue.push([]); // alreadyMember check
    insertReturnQueue.push([{ id: 501, name: 'New', email: 'n@x.com' }]); // user
    insertReturnQueue.push([{ id: 601, role: 'member' }]); // member
    sendInviteEmailMock.mockResolvedValue(undefined);

    const res = await POST(
      makeJsonRequest({ name: 'New', email: 'n@x.com', role: 'banana' }),
    );
    expect(res.status).toBe(201);
    expect(insertCalls[1].values).toMatchObject({ role: 'member' });
  });

  it('reuses an existing user and updates their invite token', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 7, company: 'Acme' });
    // existing user lookup -> found
    selectQueue.push([{ id: 200, name: 'Existing', email: 'e@x.com' }]);
    // alreadyMember check -> none
    selectQueue.push([]);
    // member insert
    insertReturnQueue.push([{ id: 700, userId: 200, role: 'member' }]);
    sendInviteEmailMock.mockResolvedValue(undefined);

    const res = await POST(
      makeJsonRequest({ name: 'Existing', email: 'e@x.com' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.isNewUser).toBe(false);
    // No user insert — only the member insert
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('clientMembers');
    // User got an invite-token update
    const userUpdate = updateCalls.find((u) => u.table === 'users');
    expect(userUpdate).toBeTruthy();
    expect(userUpdate!.patch).toHaveProperty('inviteToken');
    expect(userUpdate!.patch).toHaveProperty('inviteExpiresAt');
    expect(userUpdate!.patch.inviteExpiresAt).toBeInstanceOf(Date);
  });

  it('returns 400 when invitee is already a team member', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 7 });
    // existing user lookup -> found
    selectQueue.push([{ id: 200, name: 'Existing', email: 'e@x.com' }]);
    // alreadyMember check -> found
    selectQueue.push([{ id: 999, userId: 200 }]);

    const res = await POST(
      makeJsonRequest({ name: 'Existing', email: 'e@x.com' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('User is already a team member');
    // No clientMembers insert happened
    expect(insertCalls.filter((c) => c.table === 'clientMembers')).toHaveLength(0);
  });

  it('still returns success when invite email send fails', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 7, company: 'Acme' });
    selectQueue.push([]); // user lookup
    selectQueue.push([]); // alreadyMember check
    insertReturnQueue.push([{ id: 510, name: 'New', email: 'fail@x.com' }]);
    insertReturnQueue.push([{ id: 610, role: 'member' }]);
    sendInviteEmailMock.mockRejectedValue(new Error('SMTP down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(
      makeJsonRequest({ name: 'New', email: 'fail@x.com' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.inviteSent).toBe(true);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('falls back to "A team member" when inviter has no session name', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } }); // no name
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 7, company: null });
    selectQueue.push([]); // user lookup
    selectQueue.push([]); // alreadyMember
    insertReturnQueue.push([{ id: 520, name: 'New', email: 'noname@x.com' }]);
    insertReturnQueue.push([{ id: 620 }]);
    sendInviteEmailMock.mockResolvedValue(undefined);

    const res = await POST(
      makeJsonRequest({ name: 'New', email: 'noname@x.com' }),
    );
    expect(res.status).toBe(201);
    expect(sendInviteEmailMock.mock.calls[0][0].inviterName).toBe('A team member');
    // Company falls back to 'Your Team' when null
    expect(sendInviteEmailMock.mock.calls[0][0].companyName).toBe('Your Team');
  });

  it('hashes the invite token and stores only the hash on new users', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 7, company: 'Acme' });
    selectQueue.push([]); // user lookup
    selectQueue.push([]); // alreadyMember
    insertReturnQueue.push([{ id: 530, name: 'New', email: 'hash@x.com' }]);
    insertReturnQueue.push([{ id: 630 }]);
    sendInviteEmailMock.mockResolvedValue(undefined);

    await POST(makeJsonRequest({ name: 'New', email: 'hash@x.com' }));

    // hashToken called with the raw token, then stored as the hashed value
    expect(hashTokenMock).toHaveBeenCalled();
    const rawToken = hashTokenMock.mock.calls[0][0] as string;
    const userInsert = insertCalls.find((c) => c.table === 'users')!;
    const values = userInsert.values as Record<string, unknown>;
    expect(values.inviteToken).toBe(`HASH(${rawToken.slice(0, 4)})`);
    // Raw token is the one that gets emailed
    expect(sendInviteEmailMock.mock.calls[0][0].inviteToken).toBe(rawToken);
    // Placeholder password came from the bcrypt mock
    expect(values.password).toBe('HASHED_PLACEHOLDER');
    expect(values.role).toBe('client');
    expect(values.active).toBe(true);
  });

  it('trims whitespace from name and email when creating user', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 7 });
    selectQueue.push([]); // user lookup
    selectQueue.push([]); // alreadyMember
    insertReturnQueue.push([{ id: 540, name: 'Padded', email: 'pad@x.com' }]);
    insertReturnQueue.push([{ id: 640 }]);
    sendInviteEmailMock.mockResolvedValue(undefined);

    await POST(
      makeJsonRequest({ name: '  Padded  ', email: '  pad@x.com  ' }),
    );
    const userInsert = insertCalls.find((c) => c.table === 'users')!;
    expect((userInsert.values as Record<string, unknown>).name).toBe('Padded');
    expect((userInsert.values as Record<string, unknown>).email).toBe('pad@x.com');
  });
});
