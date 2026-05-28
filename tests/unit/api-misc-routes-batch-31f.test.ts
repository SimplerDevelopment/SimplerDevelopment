// @vitest-environment node
/**
 * Batch 31f — unit tests for 4 portal integrations route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/integrations/google/disconnect/route.ts     (POST)
 *  - app/api/portal/integrations/google/status/route.ts         (GET)
 *  - app/api/portal/integrations/microsoft/connect/route.ts     (GET)
 *  - app/api/portal/integrations/microsoft/disconnect/route.ts  (POST)
 *
 * Strategy: heavy mocking — db.select() is a queue of result rows; chain
 * methods return a thenable that materializes on `await`. Write paths
 * (update) capture patches for assertion. External helpers (Google revoke,
 * Microsoft Graph subscription delete, OAuth credential builders, tenant
 * credentials, OAuth state signer) are all mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — declared before any route is imported.
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

// drizzle-orm operators — inert
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
}));

// schema — proxy tables
vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          if (prop === '$inferSelect') return undefined;
          if (prop === 'then') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return {
    googleWorkspaceUserConnections: wrap('googleWorkspaceUserConnections'),
    microsoftTeamsUserConnections: wrap('microsoftTeamsUserConnections'),
  };
});

// Google OAuth — only `revoke` is used by the disconnect route.
const googleRevokeMock = vi.fn();
vi.mock('@/lib/google/oauth', () => ({
  revoke: (...args: unknown[]) => googleRevokeMock(...args),
}));

// Tenant credentials lookup
const getTenantWorkspaceCredentialsByClientIdMock = vi.fn();
vi.mock('@/lib/google/tenant-credentials', () => ({
  getTenantWorkspaceCredentialsByClientId: (...args: unknown[]) =>
    getTenantWorkspaceCredentialsByClientIdMock(...args),
}));

// Microsoft OAuth — buildAuthUrl + getEnvMicrosoftCredentials
const buildAuthUrlMock = vi.fn();
const getEnvMicrosoftCredentialsMock = vi.fn();
vi.mock('@/lib/microsoft/oauth', () => ({
  buildAuthUrl: (...args: unknown[]) => buildAuthUrlMock(...args),
  getEnvMicrosoftCredentials: (...args: unknown[]) =>
    getEnvMicrosoftCredentialsMock(...args),
}));

// Microsoft OAuth state signing
const signStateMock = vi.fn();
vi.mock('@/lib/microsoft/oauth-state', () => ({
  signState: (...args: unknown[]) => signStateMock(...args),
}));

// Microsoft scopes — re-export only what the connect route imports
vi.mock('@/lib/microsoft/scopes', () => ({}));

// Microsoft transcripts watch
const deleteTranscriptsSubscriptionMock = vi.fn();
vi.mock('@/lib/microsoft/transcripts-watch', () => ({
  deleteTranscriptsSubscription: (...args: unknown[]) =>
    deleteTranscriptsSubscriptionMock(...args),
}));

// ---------------------------------------------------------------------------
// db mock: select queue + write capture
// ---------------------------------------------------------------------------

interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
const updateCalls: UpdateCall[] = [];

function shiftNext(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materialized: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = () => {
      if (!materialized) materialized = Promise.resolve(shiftNext());
      return materialized;
    };
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of [
      'from',
      'leftJoin',
      'innerJoin',
      'where',
      'orderBy',
      'groupBy',
      'limit',
      'offset',
    ]) {
      chain[m] = passthrough;
    }
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
            return Promise.resolve(undefined);
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
    },
  };
});

// ---------------------------------------------------------------------------
// Routes under test (imported AFTER all mocks).
// ---------------------------------------------------------------------------

const googleDisconnectRoute = await import(
  '@/app/api/portal/integrations/google/disconnect/route'
);
const googleStatusRoute = await import(
  '@/app/api/portal/integrations/google/status/route'
);
const microsoftConnectRoute = await import(
  '@/app/api/portal/integrations/microsoft/connect/route'
);
const microsoftDisconnectRoute = await import(
  '@/app/api/portal/integrations/microsoft/disconnect/route'
);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

function makeNextReq(url: string) {
  const u = new URL(url);
  return {
    nextUrl: u,
    url,
  } as unknown as import('next/server').NextRequest;
}

const SESSION = { user: { id: '7', email: 'tester@example.com' } };

beforeEach(() => {
  selectQueue = [];
  updateCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  googleRevokeMock.mockReset();
  getTenantWorkspaceCredentialsByClientIdMock.mockReset();
  buildAuthUrlMock.mockReset();
  getEnvMicrosoftCredentialsMock.mockReset();
  signStateMock.mockReset();
  deleteTranscriptsSubscriptionMock.mockReset();
});

// ===========================================================================
// POST /api/portal/integrations/google/disconnect
// ===========================================================================

describe('POST /api/portal/integrations/google/disconnect', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await googleDisconnectRoute.POST();
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Unauthorized');
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await googleDisconnectRoute.POST();
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await googleDisconnectRoute.POST();
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('No client for this user');
  });

  it('returns alreadyDisconnected when no active connection', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]);
    const res = await googleDisconnectRoute.POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.alreadyDisconnected).toBe(true);
    // No revoke/update should be attempted
    expect(googleRevokeMock).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it('revokes at Google and scrubs row when tenant + connection present', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      { id: 42, refreshToken: 'rtok', accessToken: 'atok' },
    ]);
    getTenantWorkspaceCredentialsByClientIdMock.mockResolvedValue({
      oauth: { clientId: 'gc', clientSecret: 'gs', redirectUri: 'http://x/cb' },
    });
    googleRevokeMock.mockResolvedValue({ revoked: true, alreadyRevoked: false });

    const res = await googleDisconnectRoute.POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.googleRevoked).toBe(true);
    expect(body.alreadyRevokedOnGoogle).toBe(false);
    expect(body.revokeError).toBeUndefined();

    expect(googleRevokeMock).toHaveBeenCalledWith('rtok', expect.any(Object));
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('googleWorkspaceUserConnections');
    expect(updateCalls[0].patch.accessToken).toBe('');
    expect(updateCalls[0].patch.refreshToken).toBe('');
    expect(updateCalls[0].patch.revokedAt).toBeInstanceOf(Date);
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
  });

  it('still scrubs row when tenant credentials missing (revokeError=tenant_credentials_missing)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 42, refreshToken: 'rtok' }]);
    getTenantWorkspaceCredentialsByClientIdMock.mockResolvedValue(null);

    const res = await googleDisconnectRoute.POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.googleRevoked).toBe(false);
    expect(body.revokeError).toBe('tenant_credentials_missing');
    expect(googleRevokeMock).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(1);
  });

  it('captures revokeError when Google revoke throws but still scrubs row', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 42, refreshToken: 'rtok' }]);
    getTenantWorkspaceCredentialsByClientIdMock.mockResolvedValue({
      oauth: { clientId: 'gc', clientSecret: 'gs' },
    });
    googleRevokeMock.mockRejectedValue(new Error('network exploded'));

    const res = await googleDisconnectRoute.POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.googleRevoked).toBe(false);
    expect(body.revokeError).toBe('network exploded');
    expect(updateCalls).toHaveLength(1);
  });

  it('reports alreadyRevokedOnGoogle when revoke returns alreadyRevoked=true', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 42, refreshToken: 'rtok' }]);
    getTenantWorkspaceCredentialsByClientIdMock.mockResolvedValue({
      oauth: { clientId: 'gc', clientSecret: 'gs' },
    });
    googleRevokeMock.mockResolvedValue({ revoked: true, alreadyRevoked: true });

    const res = await googleDisconnectRoute.POST();
    const body = await res.json();
    expect(body.googleRevoked).toBe(true);
    expect(body.alreadyRevokedOnGoogle).toBe(true);
  });
});

// ===========================================================================
// GET /api/portal/integrations/google/status
// ===========================================================================

describe('GET /api/portal/integrations/google/status', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await googleStatusRoute.GET();
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Unauthorized');
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await googleStatusRoute.GET();
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('No client for this user');
  });

  it('returns standard tier when tenant has no credentials row', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    getTenantWorkspaceCredentialsByClientIdMock.mockResolvedValue(null);
    const res = await googleStatusRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tier).toBe('standard');
    expect(body.tenantStatus).toBeNull();
    expect(body.connection).toBeNull();
  });

  it('returns enterprise tier with connection=null when no active connection', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    getTenantWorkspaceCredentialsByClientIdMock.mockResolvedValue({
      status: 'active',
    });
    selectQueue.push([]);
    const res = await googleStatusRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tier).toBe('enterprise');
    expect(body.tenantStatus).toBe('active');
    expect(body.connection).toBeNull();
  });

  it('returns enterprise tier with active connection details', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    getTenantWorkspaceCredentialsByClientIdMock.mockResolvedValue({
      status: 'configured',
    });
    selectQueue.push([
      {
        googleAccountEmail: 'gtest@example.com',
        scopes: ['profile', 'email'],
        expiresAt: new Date('2026-06-01T00:00:00Z'),
        lastSyncAt: null,
        createdAt: new Date('2026-05-01T00:00:00Z'),
      },
    ]);
    const res = await googleStatusRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tier).toBe('enterprise');
    expect(body.tenantStatus).toBe('configured');
    expect(body.connection).not.toBeNull();
    expect(body.connection.googleAccountEmail).toBe('gtest@example.com');
  });
});

// ===========================================================================
// GET /api/portal/integrations/microsoft/connect
// ===========================================================================

describe('GET /api/portal/integrations/microsoft/connect', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await microsoftConnectRoute.GET(
      makeNextReq('http://x/api/portal/integrations/microsoft/connect'),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Unauthorized');
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await microsoftConnectRoute.GET(
      makeNextReq('http://x/api/portal/integrations/microsoft/connect'),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('No client for this user');
  });

  it('returns 500 when env credentials missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    getEnvMicrosoftCredentialsMock.mockImplementation(() => {
      throw new Error('env not configured');
    });
    const res = await microsoftConnectRoute.GET(
      makeNextReq('http://x/api/portal/integrations/microsoft/connect'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('microsoft_oauth_not_configured');
    expect(body.message).toBe('env not configured');
  });

  it('redirects to Microsoft auth URL with default surfaces', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    getEnvMicrosoftCredentialsMock.mockReturnValue({
      clientId: 'mc',
      clientSecret: 'ms',
      tenant: 'common',
      redirectUri: 'http://x/api/portal/integrations/microsoft/callback',
    });
    signStateMock.mockReturnValue('signed-state-xyz');
    buildAuthUrlMock.mockReturnValue('https://login.microsoftonline.com/auth?x=1');

    const res = await microsoftConnectRoute.GET(
      makeNextReq('http://x/api/portal/integrations/microsoft/connect'),
    );
    expect(res.status).toBe(307); // NextResponse.redirect default
    expect(res.headers.get('location')).toBe(
      'https://login.microsoftonline.com/auth?x=1',
    );
    // redirectUri derived from request origin
    expect(getEnvMicrosoftCredentialsMock).toHaveBeenCalledWith(
      'http://x/api/portal/integrations/microsoft/callback',
    );
    expect(signStateMock).toHaveBeenCalledWith({
      clientId: 5,
      userId: 7,
      surfaces: ['identity', 'transcripts'],
      returnTo: undefined,
    });
    expect(buildAuthUrlMock).toHaveBeenCalledWith({
      credentials: expect.objectContaining({ clientId: 'mc' }),
      surfaces: ['identity', 'transcripts'],
      state: 'signed-state-xyz',
      loginHint: 'tester@example.com',
    });
  });

  it('parses comma-separated surfaces and always prepends identity', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    getEnvMicrosoftCredentialsMock.mockReturnValue({
      clientId: 'mc',
      clientSecret: 'ms',
      tenant: 'common',
      redirectUri: 'http://x/api/portal/integrations/microsoft/callback',
    });
    signStateMock.mockReturnValue('s');
    buildAuthUrlMock.mockReturnValue('https://login/auth');

    await microsoftConnectRoute.GET(
      makeNextReq(
        'http://x/api/portal/integrations/microsoft/connect?surfaces=transcripts&returnTo=/portal/foo',
      ),
    );
    expect(signStateMock).toHaveBeenCalledWith({
      clientId: 5,
      userId: 7,
      surfaces: ['identity', 'transcripts'],
      returnTo: '/portal/foo',
    });
  });

  it('falls back to all surfaces when none of requested are valid', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    getEnvMicrosoftCredentialsMock.mockReturnValue({
      clientId: 'mc',
      clientSecret: 'ms',
      tenant: 'common',
      redirectUri: 'http://x/api/portal/integrations/microsoft/callback',
    });
    signStateMock.mockReturnValue('s');
    buildAuthUrlMock.mockReturnValue('https://login/auth');

    await microsoftConnectRoute.GET(
      makeNextReq(
        'http://x/api/portal/integrations/microsoft/connect?surfaces=nonsense,bogus',
      ),
    );
    expect(signStateMock).toHaveBeenCalledWith({
      clientId: 5,
      userId: 7,
      surfaces: ['identity', 'transcripts'],
      returnTo: undefined,
    });
  });

  it('omits loginHint when session has no email', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } }); // no email
    getPortalClientMock.mockResolvedValue({ id: 5 });
    getEnvMicrosoftCredentialsMock.mockReturnValue({
      clientId: 'mc',
      clientSecret: 'ms',
      tenant: 'common',
      redirectUri: 'http://x/api/portal/integrations/microsoft/callback',
    });
    signStateMock.mockReturnValue('s');
    buildAuthUrlMock.mockReturnValue('https://login/auth');

    await microsoftConnectRoute.GET(
      makeNextReq('http://x/api/portal/integrations/microsoft/connect'),
    );
    expect(buildAuthUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({ loginHint: undefined }),
    );
  });
});

// ===========================================================================
// POST /api/portal/integrations/microsoft/disconnect
// ===========================================================================

describe('POST /api/portal/integrations/microsoft/disconnect', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await microsoftDisconnectRoute.POST();
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Unauthorized');
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await microsoftDisconnectRoute.POST();
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('No client for this user');
  });

  it('returns alreadyDisconnected when no active connection', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]);
    const res = await microsoftDisconnectRoute.POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.alreadyDisconnected).toBe(true);
    expect(deleteTranscriptsSubscriptionMock).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it('scrubs the connection row when no subscription exists', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      {
        id: 99,
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: new Date(),
        subscriptionId: null,
      },
    ]);

    const res = await microsoftDisconnectRoute.POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.disconnected).toBe(true);
    expect(deleteTranscriptsSubscriptionMock).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('microsoftTeamsUserConnections');
    expect(updateCalls[0].patch.accessToken).toBe('');
    expect(updateCalls[0].patch.refreshToken).toBe('');
    expect(updateCalls[0].patch.revokedAt).toBeInstanceOf(Date);
    expect(updateCalls[0].patch.subscriptionId).toBeNull();
    expect(updateCalls[0].patch.subscriptionResource).toBeNull();
    expect(updateCalls[0].patch.subscriptionExpiration).toBeNull();
    expect(updateCalls[0].patch.subscriptionClientState).toBeNull();
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
  });

  it('deletes Graph subscription when subscriptionId present', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const expiresAt = new Date('2026-12-31T00:00:00Z');
    selectQueue.push([
      {
        id: 99,
        accessToken: 'atok',
        refreshToken: 'rtok',
        expiresAt,
        subscriptionId: 'sub-abc',
      },
    ]);
    getEnvMicrosoftCredentialsMock.mockReturnValue({
      clientId: 'mc',
      clientSecret: 'ms',
      tenant: 'common',
      redirectUri:
        'https://www.simplerdevelopment.com/api/portal/integrations/microsoft/callback',
    });
    deleteTranscriptsSubscriptionMock.mockResolvedValue(undefined);

    const res = await microsoftDisconnectRoute.POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.disconnected).toBe(true);
    expect(deleteTranscriptsSubscriptionMock).toHaveBeenCalledWith({
      connection: { accessToken: 'atok', refreshToken: 'rtok', expiresAt },
      credentials: expect.objectContaining({ clientId: 'mc' }),
      subscriptionId: 'sub-abc',
    });
    expect(updateCalls).toHaveLength(1);
  });

  it('still scrubs the row when subscription delete throws', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      {
        id: 99,
        accessToken: 'atok',
        refreshToken: 'rtok',
        expiresAt: new Date(),
        subscriptionId: 'sub-abc',
      },
    ]);
    getEnvMicrosoftCredentialsMock.mockReturnValue({
      clientId: 'mc',
      clientSecret: 'ms',
      tenant: 'common',
      redirectUri:
        'https://www.simplerdevelopment.com/api/portal/integrations/microsoft/callback',
    });
    deleteTranscriptsSubscriptionMock.mockRejectedValue(new Error('graph 500'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await microsoftDisconnectRoute.POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.disconnected).toBe(true);
    expect(updateCalls).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('still scrubs the row when getEnvMicrosoftCredentials throws (caught by outer try)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      {
        id: 99,
        accessToken: 'atok',
        refreshToken: 'rtok',
        expiresAt: new Date(),
        subscriptionId: 'sub-abc',
      },
    ]);
    getEnvMicrosoftCredentialsMock.mockImplementation(() => {
      throw new Error('no env');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await microsoftDisconnectRoute.POST();
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(deleteTranscriptsSubscriptionMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
