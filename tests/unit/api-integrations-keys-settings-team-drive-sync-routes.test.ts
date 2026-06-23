// @vitest-environment node
/**
 * Unit tests for three unrelated API routes bundled together for batch
 * coverage:
 *
 *   1. GET  / POST  /api/portal/integrations/api-keys
 *      - BYOK provider key list + create (auth, validation, encryption,
 *        per-provider prefix gates).
 *
 *   2. GET  / POST  /api/portal/settings/team
 *      - Team member list + invite (auth, owner-only invite, find-or-create
 *        user, duplicate-member guard, primary-owner virtualization).
 *
 *   3. GET  /api/cron/drive-sync
 *      - Cron walker for Drive-scoped Workspace connections (auth gate,
 *        drive-scope filter, token refresh persistence, watermark bootstrap,
 *        per-row failure isolation, error capping at 20).
 *
 * Everything external (db, drizzle-orm, schema, google libs, bcryptjs,
 * crypto, encryption helpers, portal-client, auth) is mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===========================================================================
// Shared schema + drizzle mocks (apply to all three routes)
// ===========================================================================

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
    clientApiKeys: wrap('clientApiKeys'),
    users: wrap('users'),
    clients: wrap('clients'),
    clientMembers: wrap('clientMembers'),
    googleWorkspaceUserConnections: wrap('googleWorkspaceUserConnections'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ---- auth + portal-client ----

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

// ---- encryption helpers (api-keys route) ----

const encryptApiKeyMock = vi.fn();
const maskApiKeyMock = vi.fn();
vi.mock('@/lib/crypto/api-key', () => ({
  encryptApiKey: (...args: unknown[]) => encryptApiKeyMock(...args),
  maskApiKey: (...args: unknown[]) => maskApiKeyMock(...args),
}));

// ---- bcryptjs + crypto.randomBytes (settings/team route) ----

const hashMock = vi.fn(async () => 'HASHED');
vi.mock('bcryptjs', () => ({
  hash: (...args: unknown[]) => hashMock(...args),
}));

vi.mock('crypto', () => ({
  randomBytes: (n: number) => ({
    toString: (_enc: string) => 'r'.repeat(n * 2),
  }),
}));

// ---- google libs (drive-sync route) ----

const refreshIfExpiredMock = vi.fn();
const getTenantCredsMock = vi.fn();
const syncDriveChangesMock = vi.fn();
const getDriveStartPageTokenMock = vi.fn();
const findMeetRecordingsFolderIdMock = vi.fn();

vi.mock('@/lib/google/oauth', () => ({
  refreshIfExpired: (...args: unknown[]) => refreshIfExpiredMock(...args),
}));
vi.mock('@/lib/google/tenant-credentials', () => ({
  getTenantWorkspaceCredentialsByClientId: (...args: unknown[]) =>
    getTenantCredsMock(...args),
}));
vi.mock('@/lib/google/drive-changes', () => ({
  syncDriveChangesForConnection: (...args: unknown[]) =>
    syncDriveChangesMock(...args),
  getDriveStartPageToken: (...args: unknown[]) =>
    getDriveStartPageTokenMock(...args),
  findMeetRecordingsFolderId: (...args: unknown[]) =>
    findMeetRecordingsFolderIdMock(...args),
}));

// ===========================================================================
// Shared db mock — chainable select / update / insert
// ===========================================================================

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
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null =
      null;
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
    chain.then = (
      onF: (v: unknown) => unknown,
      onR?: (e: unknown) => unknown,
    ) => materialize().then(onF, onR);
    return chain;
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            updateCalls.push({ table: table.__table, patch, filter });
            return {
              then(
                onF: (v: unknown) => unknown,
                onR?: (e: unknown) => unknown,
              ) {
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
        insertCalls.push({
          table: table.__table,
          values: v,
          returnedRows: rows,
        });
        const cloned = rows.map((r) => ({ ...r }));
        return {
          returning() {
            return Promise.resolve(cloned);
          },
          then(
            onF: (v: unknown) => unknown,
            onR?: (e: unknown) => unknown,
          ) {
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

// ===========================================================================
// Route imports — must come AFTER mocks
// ===========================================================================

const apiKeysRoute = await import(
  '@/app/api/portal/integrations/api-keys/route'
);
const settingsTeamRoute = await import('@/app/api/portal/settings/team/route');
const driveSyncRoute = await import('@/app/api/cron/drive-sync/route');

// ===========================================================================
// Helpers
// ===========================================================================

function makeJsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const SESSION = { user: { id: '7', name: 'Bob' } };

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  updateCalls.length = 0;
  insertCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  encryptApiKeyMock.mockReset();
  maskApiKeyMock.mockReset();
  hashMock.mockClear();
  refreshIfExpiredMock.mockReset();
  getTenantCredsMock.mockReset();
  syncDriveChangesMock.mockReset();
  getDriveStartPageTokenMock.mockReset();
  findMeetRecordingsFolderIdMock.mockReset();
  // Default mask just echoes a redacted version so JSON responses are stable.
  maskApiKeyMock.mockImplementation((s: string) => `MASK(${String(s).slice(0, 4)})`);
});

// ===========================================================================
// 1. /api/portal/integrations/api-keys
// ===========================================================================

describe('GET /api/portal/integrations/api-keys', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await apiKeysRoute.GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      success: false,
      message: 'Unauthorized',
    });
  });

  it('returns 401 when session lacks user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await apiKeysRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await apiKeysRoute.GET();
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns redacted list with masked keyPreview for each row', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([
      {
        id: 10,
        provider: 'anthropic',
        label: 'My Anthropic',
        encryptedKey: 'BLOB_ANTHROPIC',
        lastUsedAt: null,
        createdAt: new Date('2026-04-01'),
        updatedAt: new Date('2026-04-02'),
      },
      {
        id: 11,
        provider: 'openai',
        label: null,
        encryptedKey: 'BLOB_OPENAI',
        lastUsedAt: new Date('2026-04-05'),
        createdAt: new Date('2026-04-03'),
        updatedAt: new Date('2026-04-04'),
      },
    ]);

    const res = await apiKeysRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    // encryptedKey is never leaked.
    expect(body.data[0]).not.toHaveProperty('encryptedKey');
    expect(body.data[0].keyPreview).toBe('MASK(BLOB)');
    expect(body.data[0]).toMatchObject({
      id: 10,
      provider: 'anthropic',
      label: 'My Anthropic',
    });
    expect(body.data[1]).toMatchObject({ id: 11, provider: 'openai', label: null });
    // maskApiKey called once per row with the encrypted blob.
    expect(maskApiKeyMock).toHaveBeenCalledTimes(2);
    expect(maskApiKeyMock.mock.calls[0][0]).toBe('BLOB_ANTHROPIC');
    expect(maskApiKeyMock.mock.calls[1][0]).toBe('BLOB_OPENAI');
  });

  it('returns an empty list when the client has no keys', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]);
    const res = await apiKeysRoute.GET();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });
});

describe('POST /api/portal/integrations/api-keys', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await apiKeysRoute.POST(
      makeJsonRequest('http://x/api/portal/integrations/api-keys', {}),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session lacks user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await apiKeysRoute.POST(
      makeJsonRequest('http://x/api/portal/integrations/api-keys', {}),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await apiKeysRoute.POST(
      makeJsonRequest('http://x/api/portal/integrations/api-keys', {
        provider: 'anthropic',
        apiKey: 'sk-ant-1234567890',
      }),
    );
    expect(res.status).toBe(404);
  });

  it('treats malformed JSON body as empty and 400s on missing provider', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const badReq = new Request('http://x/api/portal/integrations/api-keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    const res = await apiKeysRoute.POST(badReq);
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/Unsupported provider/);
  });

  it('rejects unsupported providers', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await apiKeysRoute.POST(
      makeJsonRequest('http://x/api/portal/integrations/api-keys', {
        provider: 'cohere',
        apiKey: 'sk-12345678901234',
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/Unsupported provider/);
  });

  it('rejects when API key is missing or too short', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const r1 = await apiKeysRoute.POST(
      makeJsonRequest('http://x/api/portal/integrations/api-keys', {
        provider: 'openai',
        apiKey: '',
      }),
    );
    expect(r1.status).toBe(400);
    expect((await r1.json()).message).toBe('A valid API key is required.');
    const r2 = await apiKeysRoute.POST(
      makeJsonRequest('http://x/api/portal/integrations/api-keys', {
        provider: 'openai',
        apiKey: 'short',
      }),
    );
    expect(r2.status).toBe(400);
  });

  it('rejects an Anthropic key that does not begin with sk-ant-', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await apiKeysRoute.POST(
      makeJsonRequest('http://x/api/portal/integrations/api-keys', {
        provider: 'anthropic',
        apiKey: 'sk-not-anthropic-1234',
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/sk-ant-/);
  });

  it('rejects an OpenAI key that does not begin with sk-', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await apiKeysRoute.POST(
      makeJsonRequest('http://x/api/portal/integrations/api-keys', {
        provider: 'openai',
        apiKey: 'pk-bogus-12345678',
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/OpenAI/);
  });

  it('returns 500 when encryption throws (missing ENCRYPTION_KEY)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    encryptApiKeyMock.mockImplementation(() => {
      throw new Error('no ENCRYPTION_KEY');
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await apiKeysRoute.POST(
      makeJsonRequest('http://x/api/portal/integrations/api-keys', {
        provider: 'anthropic',
        apiKey: 'sk-ant-1234567890',
      }),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toMatch(/ENCRYPTION_KEY/);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('encrypts, inserts, and returns redacted record on success', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    encryptApiKeyMock.mockReturnValue('ENC_BLOB');
    insertReturnQueue.push([
      {
        id: 100,
        provider: 'anthropic',
        label: 'Prod key',
        createdAt: new Date('2026-04-01'),
      },
    ]);

    const res = await apiKeysRoute.POST(
      makeJsonRequest('http://x/api/portal/integrations/api-keys', {
        provider: 'anthropic',
        apiKey: 'sk-ant-1234567890ABCD',
        label: 'Prod key',
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(100);
    expect(body.data.provider).toBe('anthropic');
    expect(body.data.label).toBe('Prod key');
    expect(body.data.keyPreview).toBe('MASK(ENC_)');
    // Insert payload contains the encrypted blob, not the raw key.
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('clientApiKeys');
    expect(insertCalls[0].values).toMatchObject({
      clientId: 33,
      provider: 'anthropic',
      encryptedKey: 'ENC_BLOB',
      label: 'Prod key',
    });
  });

  it('normalises provider casing and trims label to 100 chars', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    encryptApiKeyMock.mockReturnValue('ENC');
    insertReturnQueue.push([
      { id: 1, provider: 'openai', label: 'a'.repeat(100), createdAt: new Date() },
    ]);
    const longLabel = 'a'.repeat(200);
    const res = await apiKeysRoute.POST(
      makeJsonRequest('http://x/api/portal/integrations/api-keys', {
        provider: 'OPENAI',
        apiKey: 'sk-openai-1234567890',
        label: longLabel,
      }),
    );
    expect(res.status).toBe(201);
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.provider).toBe('openai');
    expect((v.label as string).length).toBe(100);
  });

  it('stores label as null when it is omitted', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    encryptApiKeyMock.mockReturnValue('ENC');
    insertReturnQueue.push([
      { id: 2, provider: 'openai', label: null, createdAt: new Date() },
    ]);
    const res = await apiKeysRoute.POST(
      makeJsonRequest('http://x/api/portal/integrations/api-keys', {
        provider: 'openai',
        apiKey: 'sk-openai-1234567890',
      }),
    );
    expect(res.status).toBe(201);
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.label).toBeNull();
  });
});

// ===========================================================================
// 2. /api/portal/settings/team
// ===========================================================================

describe('GET /api/portal/settings/team', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await settingsTeamRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 401 when session lacks user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await settingsTeamRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await settingsTeamRoute.GET();
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('marks the current user as owner when client.userId matches the session', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({
      id: 33,
      userId: 7,
      createdAt: new Date('2026-01-01'),
    });
    selectQueue.push([
      {
        memberId: 1,
        role: 'owner',
        joinedAt: new Date('2026-02-01'),
        userId: 7,
        name: 'Bob',
        email: 'bob@x.com',
      },
    ]);

    const res = await settingsTeamRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.isOwner).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      userId: 7,
      isOwner: true,
      isCurrentUser: true,
    });
  });

  it('flags the primary owner via clients.userId match even when role !== owner', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({
      id: 33,
      userId: 99,
      createdAt: new Date('2026-01-01'),
    });
    selectQueue.push([
      {
        memberId: 1,
        role: 'member',
        joinedAt: new Date('2026-02-01'),
        userId: 7,
        name: 'Bob',
        email: 'bob@x.com',
      },
      {
        memberId: 2,
        role: 'member', // not 'owner' — relies on clients.userId match
        joinedAt: new Date('2026-01-01'),
        userId: 99,
        name: 'Alice',
        email: 'alice@x.com',
      },
    ]);
    const res = await settingsTeamRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    // Current user (7) is not owner.
    expect(body.isOwner).toBe(false);
    expect(body.data[0].isOwner).toBe(false);
    expect(body.data[0].isCurrentUser).toBe(true);
    // Alice (99) is owner via clients.userId.
    expect(body.data[1].isOwner).toBe(true);
  });

  it('unshifts the primary owner when missing from clientMembers', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({
      id: 33,
      userId: 99,
      createdAt: new Date('2026-01-01'),
    });
    // members query — no owner row
    selectQueue.push([
      {
        memberId: 1,
        role: 'member',
        joinedAt: new Date('2026-02-01'),
        userId: 7,
        name: 'Bob',
        email: 'bob@x.com',
      },
    ]);
    // owner lookup
    selectQueue.push([{ id: 99, name: 'Alice', email: 'alice@x.com' }]);
    const res = await settingsTeamRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toMatchObject({
      memberId: 0,
      role: 'owner',
      userId: 99,
      name: 'Alice',
      isOwner: true,
      isCurrentUser: false,
    });
  });

  it('does not unshift owner when client.userId is null', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({
      id: 33,
      userId: null,
      createdAt: new Date('2026-01-01'),
    });
    selectQueue.push([
      {
        memberId: 1,
        role: 'member',
        joinedAt: new Date('2026-02-01'),
        userId: 7,
        name: 'Bob',
        email: 'bob@x.com',
      },
    ]);
    const res = await settingsTeamRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    // No extra select consumed for owner lookup.
    expect(selectQueue.length).toBe(0);
  });

  it('does not unshift owner when the lookup returns no user row', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({
      id: 33,
      userId: 99,
      createdAt: new Date('2026-01-01'),
    });
    selectQueue.push([
      {
        memberId: 1,
        role: 'member',
        joinedAt: new Date('2026-02-01'),
        userId: 7,
        name: 'Bob',
        email: 'bob@x.com',
      },
    ]);
    selectQueue.push([]); // owner lookup — empty
    const res = await settingsTeamRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });
});

describe('POST /api/portal/settings/team', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await settingsTeamRoute.POST(
      makeJsonRequest('http://x/api/portal/settings/team', {}),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await settingsTeamRoute.POST(
      makeJsonRequest('http://x/api/portal/settings/team', {
        name: 'N',
        email: 'n@x.com',
      }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 when a non-owner has no owner clientMembers row', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 99 });
    // owner-membership check -> empty
    selectQueue.push([]);
    const res = await settingsTeamRoute.POST(
      makeJsonRequest('http://x/api/portal/settings/team', {
        name: 'N',
        email: 'n@x.com',
      }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).message).toMatch(/Only the account owner/);
  });

  it('allows a non-primary-owner with role=owner clientMembers row', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 99 });
    // owner-membership check -> found
    selectQueue.push([{ id: 1, role: 'owner', userId: 7 }]);
    // existing user lookup -> none
    selectQueue.push([]);
    // alreadyMember check -> none
    selectQueue.push([]);
    insertReturnQueue.push([
      { id: 500, name: 'N', email: 'n@x.com' },
    ]);
    insertReturnQueue.push([{ id: 600, role: 'member' }]);

    const res = await settingsTeamRoute.POST(
      makeJsonRequest('http://x/api/portal/settings/team', {
        name: 'N',
        email: 'n@x.com',
      }),
    );
    expect(res.status).toBe(201);
  });

  it('returns 400 when name or email is missing/blank', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 7 }); // primary owner
    const r1 = await settingsTeamRoute.POST(
      makeJsonRequest('http://x/api/portal/settings/team', { email: 'x@x.com' }),
    );
    expect(r1.status).toBe(400);
    expect((await r1.json()).message).toBe('Name and email are required');
    const r2 = await settingsTeamRoute.POST(
      makeJsonRequest('http://x/api/portal/settings/team', { name: 'X' }),
    );
    expect(r2.status).toBe(400);
    const r3 = await settingsTeamRoute.POST(
      makeJsonRequest('http://x/api/portal/settings/team', {
        name: '   ',
        email: '   ',
      }),
    );
    expect(r3.status).toBe(400);
  });

  it('creates a new user with a temp password when no user exists', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 7 }); // primary owner
    // existing user lookup -> none
    selectQueue.push([]);
    // alreadyMember -> none
    selectQueue.push([]);
    insertReturnQueue.push([
      { id: 500, name: 'New', email: 'new@x.com' },
    ]);
    insertReturnQueue.push([
      { id: 600, role: 'member', userId: 500, clientId: 33 },
    ]);

    const res = await settingsTeamRoute.POST(
      makeJsonRequest('http://x/api/portal/settings/team', {
        name: 'New',
        email: 'new@x.com',
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.isNewUser).toBe(true);
    // randomBytes(6).toString('hex') => 12 chars in our mock
    expect(typeof body.data.tempPassword).toBe('string');
    expect(body.data.tempPassword.length).toBe(12);
    // bcrypt.hash called with temp password
    expect(hashMock).toHaveBeenCalled();
    // Two inserts: users + clientMembers
    expect(insertCalls.map((c) => c.table)).toEqual(['users', 'clientMembers']);
    expect((insertCalls[0].values as Record<string, unknown>).role).toBe('client');
    expect((insertCalls[0].values as Record<string, unknown>).active).toBe(true);
  });

  it('reuses an existing user (no tempPassword, no user insert)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 7 });
    selectQueue.push([
      { id: 200, name: 'Existing', email: 'e@x.com' },
    ]); // existing user lookup
    selectQueue.push([]); // alreadyMember
    insertReturnQueue.push([
      { id: 700, userId: 200, role: 'member' },
    ]); // member insert

    const res = await settingsTeamRoute.POST(
      makeJsonRequest('http://x/api/portal/settings/team', {
        name: 'Existing',
        email: 'e@x.com',
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.isNewUser).toBe(false);
    expect(body.data.tempPassword).toBeNull();
    // Only the member insert ran.
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('clientMembers');
  });

  it('returns 400 when invitee is already a team member', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 7 });
    selectQueue.push([
      { id: 200, name: 'Existing', email: 'e@x.com' },
    ]); // existing user
    selectQueue.push([{ id: 999, userId: 200 }]); // alreadyMember
    const res = await settingsTeamRoute.POST(
      makeJsonRequest('http://x/api/portal/settings/team', {
        name: 'Existing',
        email: 'e@x.com',
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('User is already a team member');
    // No clientMembers insert happened.
    expect(insertCalls).toHaveLength(0);
  });
});

// ===========================================================================
// 3. /api/cron/drive-sync
// ===========================================================================

describe('GET /api/cron/drive-sync', () => {
  const ORIGINAL_CRON = process.env.CRON_SECRET;

  beforeEach(() => {
    // Sensible defaults — individual tests override.
    getTenantCredsMock.mockResolvedValue({
      status: 'active',
      oauth: { clientId: 'g', clientSecret: 's', redirectUri: 'r' },
    });
    refreshIfExpiredMock.mockResolvedValue({ refreshed: false });
    findMeetRecordingsFolderIdMock.mockResolvedValue('folder-1');
    syncDriveChangesMock.mockResolvedValue({ ingested: 0, errors: [] });
  });

  function restoreEnv() {
    if (ORIGINAL_CRON === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_CRON;
  }

  it('returns 401 when CRON_SECRET is unset and no Vercel header', async () => {
    delete process.env.CRON_SECRET;
    const res = await driveSyncRoute.GET(
      new Request('http://x/api/cron/drive-sync'),
    );
    expect(res.status).toBe(401);
    restoreEnv();
  });

  it('returns 401 on a wrong bearer token', async () => {
    process.env.CRON_SECRET = 'shh';
    const res = await driveSyncRoute.GET(
      new Request('http://x/api/cron/drive-sync', {
        headers: { authorization: 'Bearer nope' },
      }),
    );
    expect(res.status).toBe(401);
    restoreEnv();
  });

  it('accepts a matching bearer token', async () => {
    process.env.CRON_SECRET = 'shh';
    selectQueue.push([]); // no rows
    const res = await driveSyncRoute.GET(
      new Request('http://x/api/cron/drive-sync', {
        headers: { authorization: 'Bearer shh' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.examined).toBe(0);
    expect(body.candidates).toBe(0);
    restoreEnv();
  });

  it('accepts the Vercel cron header without bearer token', async () => {
    delete process.env.CRON_SECRET;
    selectQueue.push([]);
    const res = await driveSyncRoute.GET(
      new Request('http://x/api/cron/drive-sync', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    restoreEnv();
  });

  it('filters out connections without drive scope', async () => {
    delete process.env.CRON_SECRET;
    selectQueue.push([
      {
        id: 1,
        clientId: 11,
        userId: 71,
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date('2026-05-19'),
        scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
        driveStartPageToken: 'spt-1',
      },
      {
        id: 2,
        clientId: 12,
        userId: 72,
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date('2026-05-19'),
        scopes: ['https://www.googleapis.com/auth/calendar'],
        driveStartPageToken: 'spt-2',
      },
    ]);
    const res = await driveSyncRoute.GET(
      new Request('http://x/api/cron/drive-sync', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.examined).toBe(2);
    expect(body.candidates).toBe(0);
    expect(syncDriveChangesMock).not.toHaveBeenCalled();
    restoreEnv();
  });

  it('skips connections whose tenant credentials are revoked or missing', async () => {
    delete process.env.CRON_SECRET;
    selectQueue.push([
      {
        id: 1,
        clientId: 11,
        userId: 71,
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date('2026-05-19'),
        scopes: ['https://www.googleapis.com/auth/drive'],
        driveStartPageToken: 'spt-1',
      },
      {
        id: 2,
        clientId: 12,
        userId: 72,
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date('2026-05-19'),
        scopes: ['https://www.googleapis.com/auth/drive'],
        driveStartPageToken: 'spt-2',
      },
    ]);
    getTenantCredsMock
      .mockResolvedValueOnce(null) // first conn -> skipped
      .mockResolvedValueOnce({ status: 'revoked', oauth: {} }); // second -> skipped
    const res = await driveSyncRoute.GET(
      new Request('http://x/api/cron/drive-sync', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates).toBe(2);
    expect(body.skipped).toBe(2);
    expect(body.synced).toBe(0);
    expect(syncDriveChangesMock).not.toHaveBeenCalled();
    restoreEnv();
  });

  it('persists refreshed tokens and continues to sync', async () => {
    delete process.env.CRON_SECRET;
    selectQueue.push([
      {
        id: 5,
        clientId: 21,
        userId: 81,
        accessToken: 'old-at',
        refreshToken: 'old-rt',
        expiresAt: new Date('2026-05-19'),
        scopes: ['https://www.googleapis.com/auth/drive'],
        driveStartPageToken: 'spt-5',
      },
    ]);
    refreshIfExpiredMock.mockResolvedValue({
      refreshed: true,
      accessToken: 'new-at',
      refreshToken: 'new-rt',
      expiresAt: new Date('2026-05-20'),
    });
    syncDriveChangesMock.mockResolvedValue({ ingested: 3, errors: [] });

    const res = await driveSyncRoute.GET(
      new Request('http://x/api/cron/drive-sync', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.synced).toBe(1);
    expect(body.totalIngested).toBe(3);
    // Update was written for refreshed tokens.
    const tokenUpdate = updateCalls.find(
      (u) =>
        u.table === 'googleWorkspaceUserConnections' &&
        Object.prototype.hasOwnProperty.call(u.patch, 'accessToken'),
    );
    expect(tokenUpdate).toBeTruthy();
    expect(tokenUpdate!.patch).toMatchObject({
      accessToken: 'new-at',
      refreshToken: 'new-rt',
    });
    restoreEnv();
  });

  it('bootstraps the start page token when the row is missing one', async () => {
    delete process.env.CRON_SECRET;
    selectQueue.push([
      {
        id: 6,
        clientId: 22,
        userId: 82,
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date('2026-05-19'),
        scopes: ['https://www.googleapis.com/auth/drive'],
        driveStartPageToken: null, // forces bootstrap
      },
    ]);
    getDriveStartPageTokenMock.mockResolvedValue('booted-spt');
    syncDriveChangesMock.mockResolvedValue({ ingested: 0, errors: [] });

    const res = await driveSyncRoute.GET(
      new Request('http://x/api/cron/drive-sync', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    expect(getDriveStartPageTokenMock).toHaveBeenCalledTimes(1);
    const sptUpdate = updateCalls.find(
      (u) =>
        u.table === 'googleWorkspaceUserConnections' &&
        Object.prototype.hasOwnProperty.call(u.patch, 'driveStartPageToken'),
    );
    expect(sptUpdate).toBeTruthy();
    expect(sptUpdate!.patch).toMatchObject({
      driveStartPageToken: 'booted-spt',
    });
    restoreEnv();
  });

  it('propagates per-file errors from the sync into failures[]', async () => {
    delete process.env.CRON_SECRET;
    selectQueue.push([
      {
        id: 7,
        clientId: 23,
        userId: 83,
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date('2026-05-19'),
        scopes: ['https://www.googleapis.com/auth/drive'],
        driveStartPageToken: 'spt',
      },
    ]);
    syncDriveChangesMock.mockResolvedValue({
      ingested: 1,
      errors: [
        { fileId: 'f1', error: 'boom' },
        { fileId: 'f2', error: 'kaboom' },
      ],
    });

    const res = await driveSyncRoute.GET(
      new Request('http://x/api/cron/drive-sync', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    const body = await res.json();
    expect(body.synced).toBe(1);
    expect(body.failed).toBe(0);
    expect(body.totalIngested).toBe(1);
    expect(body.failures).toHaveLength(2);
    expect(body.failures[0]).toEqual({ connectionId: 7, reason: 'f1: boom' });
    restoreEnv();
  });

  it('caps failures[] at 20 entries', async () => {
    delete process.env.CRON_SECRET;
    selectQueue.push([
      {
        id: 8,
        clientId: 24,
        userId: 84,
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date('2026-05-19'),
        scopes: ['https://www.googleapis.com/auth/drive'],
        driveStartPageToken: 'spt',
      },
    ]);
    syncDriveChangesMock.mockResolvedValue({
      ingested: 0,
      errors: Array.from({ length: 25 }, (_, i) => ({
        fileId: `f${i}`,
        error: 'nope',
      })),
    });
    const res = await driveSyncRoute.GET(
      new Request('http://x/api/cron/drive-sync', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    const body = await res.json();
    expect(body.failures).toHaveLength(20);
    restoreEnv();
  });

  it('isolates a thrown error to a single connection', async () => {
    delete process.env.CRON_SECRET;
    selectQueue.push([
      {
        id: 9,
        clientId: 25,
        userId: 85,
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date('2026-05-19'),
        scopes: ['https://www.googleapis.com/auth/drive'],
        driveStartPageToken: 'spt-9',
      },
      {
        id: 10,
        clientId: 26,
        userId: 86,
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date('2026-05-19'),
        scopes: ['https://www.googleapis.com/auth/drive'],
        driveStartPageToken: 'spt-10',
      },
    ]);
    syncDriveChangesMock
      .mockRejectedValueOnce(new Error('Drive API down'))
      .mockResolvedValueOnce({ ingested: 2, errors: [] });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await driveSyncRoute.GET(
      new Request('http://x/api/cron/drive-sync', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    const body = await res.json();
    expect(body.synced).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.totalIngested).toBe(2);
    expect(body.failures[0]).toEqual({
      connectionId: 9,
      reason: 'Drive API down',
    });
    errSpy.mockRestore();
    restoreEnv();
  });
});
