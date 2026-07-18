// @vitest-environment node
/**
 * Unit tests for lib/google/tenant-credentials.ts.
 *
 * The module reads a single Drizzle table (googleWorkspaceTenantCredentials)
 * and decrypts one column via lib/crypto/secrets. The test file mocks
 * `@/lib/db`, `@/lib/db/schema`, `drizzle-orm`, and `@/lib/crypto/secrets`,
 * implementing a chainable select() backed by an in-memory state seeded
 * by each test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockRow {
  clientId: number;
  googleProjectId: string;
  pubsubTopic: string;
  pubsubVerificationToken: string;
  oauthClientId: string;
  oauthClientSecretEncrypted: string;
  oauthRedirectUri: string;
  status: 'pending' | 'configured' | 'active' | 'revoked';
  consentScreenUserType: 'internal' | 'external';
}

interface MockState {
  rows: MockRow[];
  /** When set, decryptSecret will throw instead of returning a value. */
  decryptShouldThrow: boolean;
  decryptCalls: string[];
}

const state: MockState = {
  rows: [],
  decryptShouldThrow: false,
  decryptCalls: [],
};

vi.mock('@/lib/db/schema', () => {
  // Proxy gives every column access a typed marker the predicate evaluator can inspect.
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    googleWorkspaceTenantCredentials: wrap('googleWorkspaceTenantCredentials'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

vi.mock('@/lib/crypto/secrets', () => ({
  decryptSecret: vi.fn((encrypted: string) => {
    state.decryptCalls.push(encrypted);
    if (state.decryptShouldThrow) {
      throw new Error('decryption failed');
    }
    // Convention: encrypted form is "enc:<plaintext>"; otherwise return as-is.
    if (encrypted.startsWith('enc:')) return encrypted.slice(4);
    return encrypted;
  }),
}));

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as { op?: string; a?: unknown; b?: unknown };
  if (f.op === 'eq') {
    const col = f.a as { __col?: string } | undefined;
    if (!col?.__col) return true;
    return row[col.__col] === f.b;
  }
  return true;
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limit: number | null = null;
    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      limit(n: number) {
        limit = n;
        return runQuery();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    function runQuery(): Promise<MockRow[]> {
      if (activeTable !== 'googleWorkspaceTenantCredentials') return Promise.resolve([]);
      const matched = state.rows.filter((r) =>
        evalPredicate(filter, r as unknown as Record<string, unknown>),
      );
      const out = limit !== null ? matched.slice(0, limit) : matched;
      return Promise.resolve(out);
    }

    return chain;
  }

  return {
    db: {
      select() {
        return {
          from(table: { __table: string }) {
            return buildSelect().from(table);
          },
        };
      },
    },
  };
});

beforeEach(() => {
  state.rows.length = 0;
  state.decryptShouldThrow = false;
  state.decryptCalls.length = 0;
});

function baseRow(overrides: Partial<MockRow> = {}): MockRow {
  return {
    clientId: 1,
    googleProjectId: 'gcp-tenant-1',
    pubsubTopic: 'projects/gcp-tenant-1/topics/gmail-watch',
    pubsubVerificationToken: 'tok-123',
    oauthClientId: 'oauth-client-1',
    oauthClientSecretEncrypted: 'enc:supersecret',
    oauthRedirectUri: 'https://example.test/cb',
    status: 'active',
    consentScreenUserType: 'internal',
    ...overrides,
  };
}

async function importModule() {
  return await import('@/lib/google/tenant-credentials');
}

// ---------------------------------------------------------------------------
// getTenantWorkspaceCredentialsByClientId
// ---------------------------------------------------------------------------

describe('getTenantWorkspaceCredentialsByClientId', () => {
  it('returns null when no row exists for the client', async () => {
    const { getTenantWorkspaceCredentialsByClientId } = await importModule();
    const res = await getTenantWorkspaceCredentialsByClientId(42);
    expect(res).toBeNull();
  });

  it('returns the hydrated context for an active tenant with decrypted secret', async () => {
    state.rows.push(baseRow({ clientId: 7, status: 'active' }));
    const { getTenantWorkspaceCredentialsByClientId } = await importModule();
    const res = await getTenantWorkspaceCredentialsByClientId(7);
    expect(res).not.toBeNull();
    expect(res!.clientId).toBe(7);
    expect(res!.googleProjectId).toBe('gcp-tenant-1');
    expect(res!.pubsubTopic).toBe('projects/gcp-tenant-1/topics/gmail-watch');
    expect(res!.pubsubVerificationToken).toBe('tok-123');
    expect(res!.status).toBe('active');
    expect(res!.consentScreenUserType).toBe('internal');
    expect(res!.oauth).toEqual({
      clientId: 'oauth-client-1',
      clientSecret: 'supersecret',
      redirectUri: 'https://example.test/cb',
    });
    expect(state.decryptCalls).toEqual(['enc:supersecret']);
  });

  it('returns the hydrated context for a pending tenant (non-revoked statuses pass through)', async () => {
    state.rows.push(baseRow({ clientId: 8, status: 'pending' }));
    const { getTenantWorkspaceCredentialsByClientId } = await importModule();
    const res = await getTenantWorkspaceCredentialsByClientId(8);
    expect(res!.status).toBe('pending');
  });

  it('returns the hydrated context for a configured tenant', async () => {
    state.rows.push(baseRow({ clientId: 9, status: 'configured' }));
    const { getTenantWorkspaceCredentialsByClientId } = await importModule();
    const res = await getTenantWorkspaceCredentialsByClientId(9);
    expect(res!.status).toBe('configured');
  });

  it('returns external consentScreenUserType when the row says so', async () => {
    state.rows.push(baseRow({ clientId: 10, consentScreenUserType: 'external' }));
    const { getTenantWorkspaceCredentialsByClientId } = await importModule();
    const res = await getTenantWorkspaceCredentialsByClientId(10);
    expect(res!.consentScreenUserType).toBe('external');
  });

  it('throws when the row is revoked, with a message that includes the client id', async () => {
    state.rows.push(baseRow({ clientId: 11, status: 'revoked' }));
    const { getTenantWorkspaceCredentialsByClientId } = await importModule();
    await expect(getTenantWorkspaceCredentialsByClientId(11)).rejects.toThrow(/revoked/);
    await expect(getTenantWorkspaceCredentialsByClientId(11)).rejects.toThrow(/client 11/);
  });

  it('propagates decryption errors instead of masking them', async () => {
    state.rows.push(baseRow({ clientId: 12 }));
    state.decryptShouldThrow = true;
    const { getTenantWorkspaceCredentialsByClientId } = await importModule();
    await expect(getTenantWorkspaceCredentialsByClientId(12)).rejects.toThrow(/decryption failed/);
  });

  it('only matches the clientId requested (filter is honored)', async () => {
    state.rows.push(
      baseRow({ clientId: 1, googleProjectId: 'gcp-1' }),
      baseRow({ clientId: 2, googleProjectId: 'gcp-2' }),
      baseRow({ clientId: 3, googleProjectId: 'gcp-3' }),
    );
    const { getTenantWorkspaceCredentialsByClientId } = await importModule();
    const res = await getTenantWorkspaceCredentialsByClientId(2);
    expect(res!.googleProjectId).toBe('gcp-2');
  });
});

// ---------------------------------------------------------------------------
// getTenantWorkspaceCredentialsByPubsubToken
// ---------------------------------------------------------------------------

describe('getTenantWorkspaceCredentialsByPubsubToken', () => {
  it('returns null when no row matches the token', async () => {
    const { getTenantWorkspaceCredentialsByPubsubToken } = await importModule();
    const res = await getTenantWorkspaceCredentialsByPubsubToken('nope');
    expect(res).toBeNull();
  });

  it('returns the hydrated context for an active tenant with decrypted secret', async () => {
    state.rows.push(
      baseRow({ clientId: 50, pubsubVerificationToken: 'tok-xyz', status: 'active' }),
    );
    const { getTenantWorkspaceCredentialsByPubsubToken } = await importModule();
    const res = await getTenantWorkspaceCredentialsByPubsubToken('tok-xyz');
    expect(res).not.toBeNull();
    expect(res!.clientId).toBe(50);
    expect(res!.pubsubVerificationToken).toBe('tok-xyz');
    expect(res!.oauth.clientSecret).toBe('supersecret');
  });

  it('returns null (does NOT throw) when the matched row is revoked', async () => {
    // The clientId-keyed lookup throws on revoked rows, but the pub/sub path
    // silently returns null — Pub/Sub pushes should be dropped quietly so we
    // don't surface 5xx and trigger retry storms.
    state.rows.push(
      baseRow({ clientId: 51, pubsubVerificationToken: 'tok-rev', status: 'revoked' }),
    );
    const { getTenantWorkspaceCredentialsByPubsubToken } = await importModule();
    const res = await getTenantWorkspaceCredentialsByPubsubToken('tok-rev');
    expect(res).toBeNull();
  });

  it('filters by token — does not return a tenant with a different token', async () => {
    state.rows.push(
      baseRow({ clientId: 60, pubsubVerificationToken: 'tok-a' }),
      baseRow({ clientId: 61, pubsubVerificationToken: 'tok-b' }),
    );
    const { getTenantWorkspaceCredentialsByPubsubToken } = await importModule();
    const res = await getTenantWorkspaceCredentialsByPubsubToken('tok-b');
    expect(res!.clientId).toBe(61);
  });

  it('returns the hydrated context for a pending tenant', async () => {
    state.rows.push(
      baseRow({ clientId: 70, pubsubVerificationToken: 'tok-pending', status: 'pending' }),
    );
    const { getTenantWorkspaceCredentialsByPubsubToken } = await importModule();
    const res = await getTenantWorkspaceCredentialsByPubsubToken('tok-pending');
    expect(res!.status).toBe('pending');
  });

  it('propagates decryption errors for matched non-revoked rows', async () => {
    state.rows.push(baseRow({ clientId: 80, pubsubVerificationToken: 'tok-err' }));
    state.decryptShouldThrow = true;
    const { getTenantWorkspaceCredentialsByPubsubToken } = await importModule();
    await expect(getTenantWorkspaceCredentialsByPubsubToken('tok-err')).rejects.toThrow(
      /decryption failed/,
    );
  });

  it('exposes external consent screen on the returned shape', async () => {
    state.rows.push(
      baseRow({
        clientId: 90,
        pubsubVerificationToken: 'tok-ext',
        consentScreenUserType: 'external',
      }),
    );
    const { getTenantWorkspaceCredentialsByPubsubToken } = await importModule();
    const res = await getTenantWorkspaceCredentialsByPubsubToken('tok-ext');
    expect(res!.consentScreenUserType).toBe('external');
  });
});
