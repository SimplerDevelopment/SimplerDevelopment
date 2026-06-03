// @vitest-environment node
/**
 * Unit tests for the cron handler that renews/creates Microsoft Teams
 * transcript subscriptions.
 *
 * Scope: auth gate (Vercel header / bearer token), the "env not configured"
 * early-return path, and the per-connection branch matrix (create vs renew,
 * renew→404 fallback that calls create, and per-row failure isolation that
 * still resolves a 200 envelope). The Microsoft Graph calls, the OAuth
 * credentials lookup, and the DB module are stubbed before the route is
 * imported so this file is self-contained.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --------------------------------------------------------------------------
// Mock helpers
// --------------------------------------------------------------------------

type Row = {
  id: number;
  microsoftUserId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  subscriptionId: string | null;
  subscriptionExpiration: Date | null;
};

const selectState: { rows: Row[] } = { rows: [] };
const updateCalls: Array<{ set: Record<string, unknown> }> = [];

const dbMock = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve(selectState.rows)),
    })),
  })),
  update: vi.fn((table?: unknown) => ({
    set: vi.fn((values: Record<string, unknown>) => {
      // Skip cronHealth tracking updates so tests can count business-logic updates only.
      const isCronHealth = typeof table === 'object' && table !== null && 'name' in (table as Record<string, unknown>) && (table as Record<string, unknown>).name === 'cron_health.name';
      if (!isCronHealth) updateCalls.push({ set: values });
      return {
        where: vi.fn(() => Promise.resolve()),
      };
    }),
  })),
  insert: vi.fn(() => ({
    values: vi.fn(() => ({
      onConflictDoUpdate: vi.fn(() => Promise.resolve()),
    })),
  })),
};

const createTranscriptsSubscriptionMock = vi.fn();
const renewTranscriptsSubscriptionMock = vi.fn();
const getEnvMicrosoftCredentialsMock = vi.fn();

// SubscriptionGoneError and GraphRequestError need to be real classes so
// `err instanceof X` checks in the route succeed.
class FakeSubscriptionGoneError extends Error {
  constructor(public subscriptionId: string) {
    super(`subscription gone: ${subscriptionId}`);
    this.name = 'SubscriptionGoneError';
  }
}
class FakeGraphRequestError extends Error {
  constructor(
    public status: number,
    public bodyText: string,
    public method: string,
    public path: string,
  ) {
    super(`Graph ${method} ${path} failed (${status}): ${bodyText}`);
    this.name = 'GraphRequestError';
  }
}

vi.mock('@/lib/db/schema/cronHealth', () => ({
  cronHealth: { name: 'cron_health.name' },
}));

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

vi.mock('@/lib/db/schema', () => ({
  microsoftTeamsUserConnections: {
    id: 'id',
    revokedAt: 'revokedAt',
    subscriptionId: 'subscriptionId',
    subscriptionExpiration: 'subscriptionExpiration',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ _op: 'eq', a, b })),
  and: vi.fn((...args) => ({ _op: 'and', args })),
  or: vi.fn((...args) => ({ _op: 'or', args })),
  isNull: vi.fn((a) => ({ _op: 'isNull', a })),
  lt: vi.fn((a, b) => ({ _op: 'lt', a, b })),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

vi.mock('@/lib/microsoft/oauth', () => ({
  getEnvMicrosoftCredentials: getEnvMicrosoftCredentialsMock,
}));

vi.mock('@/lib/microsoft/transcripts-watch', () => ({
  createTranscriptsSubscription: createTranscriptsSubscriptionMock,
  renewTranscriptsSubscription: renewTranscriptsSubscriptionMock,
  SubscriptionGoneError: FakeSubscriptionGoneError,
}));

vi.mock('@/lib/microsoft/graph-client', () => ({
  GraphRequestError: FakeGraphRequestError,
}));

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('GET /api/cron/renew-microsoft-subscriptions', () => {
  const ORIGINAL_CRON = process.env.CRON_SECRET;
  const ORIGINAL_NEXTAUTH = process.env.NEXTAUTH_URL;

  beforeEach(() => {
    vi.resetModules();
    selectState.rows = [];
    updateCalls.length = 0;
    dbMock.select.mockClear();
    dbMock.update.mockClear();
    dbMock.insert.mockClear();
    createTranscriptsSubscriptionMock.mockReset();
    renewTranscriptsSubscriptionMock.mockReset();
    getEnvMicrosoftCredentialsMock.mockReset();
    // Default: credentials are configured.
    getEnvMicrosoftCredentialsMock.mockReturnValue({
      clientId: 'cid',
      clientSecret: 'csec',
      tenantId: 'tid',
      redirectUri: 'https://x/cb',
    });
  });

  afterEach(() => {
    if (ORIGINAL_CRON === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_CRON;
    if (ORIGINAL_NEXTAUTH === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = ORIGINAL_NEXTAUTH;
  });

  it('rejects unauthenticated requests when CRON_SECRET is set', async () => {
    process.env.CRON_SECRET = 'shh';
    const { GET } = await import(
      '@/app/api/cron/renew-microsoft-subscriptions/route'
    );
    const res = await GET(
      new Request('http://x/api/cron/renew-microsoft-subscriptions'),
    );
    expect(res.status).toBe(401);
    const json = (await res.json()) as { success: boolean; message: string };
    expect(json.success).toBe(false);
    expect(json.message).toBe('Unauthorized');
  });

  it('rejects when CRON_SECRET is unset and no Vercel header', async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import(
      '@/app/api/cron/renew-microsoft-subscriptions/route'
    );
    const res = await GET(
      new Request('http://x/api/cron/renew-microsoft-subscriptions', {
        headers: { authorization: 'Bearer whatever' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('rejects when bearer token does not match CRON_SECRET', async () => {
    process.env.CRON_SECRET = 'shh';
    const { GET } = await import(
      '@/app/api/cron/renew-microsoft-subscriptions/route'
    );
    const res = await GET(
      new Request('http://x/api/cron/renew-microsoft-subscriptions', {
        headers: { authorization: 'Bearer wrong' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('accepts the Vercel cron header without bearer token', async () => {
    process.env.CRON_SECRET = 'shh';
    const { GET } = await import(
      '@/app/api/cron/renew-microsoft-subscriptions/route'
    );
    const res = await GET(
      new Request('http://x/api/cron/renew-microsoft-subscriptions', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: { considered: number; results: unknown[]; durationMs: number };
    };
    expect(json.success).toBe(true);
    expect(json.data.considered).toBe(0);
    expect(json.data.results).toEqual([]);
    expect(typeof json.data.durationMs).toBe('number');
  });

  it('accepts a matching bearer token', async () => {
    process.env.CRON_SECRET = 'shh';
    const { GET } = await import(
      '@/app/api/cron/renew-microsoft-subscriptions/route'
    );
    const res = await GET(
      new Request('http://x/api/cron/renew-microsoft-subscriptions', {
        headers: { authorization: 'Bearer shh' },
      }),
    );
    expect(res.status).toBe(200);
  });

  it('short-circuits with skipped envelope when Microsoft OAuth is not configured', async () => {
    process.env.CRON_SECRET = 'shh';
    getEnvMicrosoftCredentialsMock.mockImplementation(() => {
      throw new Error('MICROSOFT_CLIENT_ID is required');
    });
    const { GET } = await import(
      '@/app/api/cron/renew-microsoft-subscriptions/route'
    );
    const res = await GET(
      new Request('http://x/api/cron/renew-microsoft-subscriptions', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: { skipped: string };
    };
    expect(json.success).toBe(true);
    expect(json.data.skipped).toBe('microsoft_oauth_not_configured');
    // Should not have queried the DB once we early-return.
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('uses a fallback redirect URI when NEXTAUTH_URL is unset', async () => {
    process.env.CRON_SECRET = 'shh';
    delete process.env.NEXTAUTH_URL;
    const { GET } = await import(
      '@/app/api/cron/renew-microsoft-subscriptions/route'
    );
    await GET(
      new Request('http://x/api/cron/renew-microsoft-subscriptions', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(getEnvMicrosoftCredentialsMock).toHaveBeenCalledWith(
      'https://www.simplerdevelopment.com/api/portal/integrations/microsoft/callback',
    );
  });

  it('honors NEXTAUTH_URL when set', async () => {
    process.env.CRON_SECRET = 'shh';
    process.env.NEXTAUTH_URL = 'https://staging.example.com';
    const { GET } = await import(
      '@/app/api/cron/renew-microsoft-subscriptions/route'
    );
    await GET(
      new Request('http://x/api/cron/renew-microsoft-subscriptions', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(getEnvMicrosoftCredentialsMock).toHaveBeenCalledWith(
      'https://staging.example.com/api/portal/integrations/microsoft/callback',
    );
  });

  it('creates a subscription for connections that do not yet have one', async () => {
    process.env.CRON_SECRET = 'shh';
    selectState.rows = [
      {
        id: 11,
        microsoftUserId: 'mu-1',
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date('2026-05-19T12:00:00Z'),
        subscriptionId: null,
        subscriptionExpiration: null,
      },
    ];
    createTranscriptsSubscriptionMock.mockResolvedValueOnce({
      subscriptionId: 'sub-new-1',
      subscriptionResource: '/communications/onlineMeetings',
      subscriptionExpiration: new Date('2026-05-19T13:00:00Z'),
      subscriptionClientState: 'cs-1',
      refreshed: true,
      connection: {
        accessToken: 'at-refreshed',
        refreshToken: 'rt-refreshed',
        expiresAt: new Date('2026-05-19T14:00:00Z'),
      },
    });

    const { GET } = await import(
      '@/app/api/cron/renew-microsoft-subscriptions/route'
    );
    const res = await GET(
      new Request('http://x/api/cron/renew-microsoft-subscriptions', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { considered: number; results: Array<Record<string, unknown>> };
    };
    expect(json.data.considered).toBe(1);
    expect(json.data.results).toEqual([
      { connectionId: 11, action: 'created', ok: true },
    ]);
    expect(createTranscriptsSubscriptionMock).toHaveBeenCalledTimes(1);
    expect(renewTranscriptsSubscriptionMock).not.toHaveBeenCalled();
    // persistSubscription wrote the new subscription fields plus refreshed tokens.
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].set).toMatchObject({
      subscriptionId: 'sub-new-1',
      subscriptionResource: '/communications/onlineMeetings',
      subscriptionClientState: 'cs-1',
      accessToken: 'at-refreshed',
      refreshToken: 'rt-refreshed',
    });
  });

  it('does not overwrite tokens when create did not refresh', async () => {
    process.env.CRON_SECRET = 'shh';
    selectState.rows = [
      {
        id: 12,
        microsoftUserId: 'mu-2',
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date('2026-05-19T12:00:00Z'),
        subscriptionId: null,
        subscriptionExpiration: null,
      },
    ];
    createTranscriptsSubscriptionMock.mockResolvedValueOnce({
      subscriptionId: 'sub-new-2',
      subscriptionResource: '/r',
      subscriptionExpiration: new Date('2026-05-19T13:00:00Z'),
      subscriptionClientState: 'cs-2',
      refreshed: false,
      connection: {
        accessToken: 'should-not-be-written',
        refreshToken: 'should-not-be-written',
        expiresAt: new Date(),
      },
    });
    const { GET } = await import(
      '@/app/api/cron/renew-microsoft-subscriptions/route'
    );
    await GET(
      new Request('http://x/api/cron/renew-microsoft-subscriptions', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].set).not.toHaveProperty('accessToken');
    expect(updateCalls[0].set).not.toHaveProperty('refreshToken');
    expect(updateCalls[0].set).toMatchObject({
      subscriptionId: 'sub-new-2',
    });
  });

  it('renews an existing subscription that is expiring soon', async () => {
    process.env.CRON_SECRET = 'shh';
    selectState.rows = [
      {
        id: 21,
        microsoftUserId: 'mu-3',
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date('2026-05-19T12:00:00Z'),
        subscriptionId: 'sub-existing',
        subscriptionExpiration: new Date('2026-05-19T12:10:00Z'),
      },
    ];
    renewTranscriptsSubscriptionMock.mockResolvedValueOnce({
      subscriptionExpiration: new Date('2026-05-19T13:00:00Z'),
      refreshed: false,
      connection: {
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date('2026-05-19T12:00:00Z'),
      },
    });
    const { GET } = await import(
      '@/app/api/cron/renew-microsoft-subscriptions/route'
    );
    const res = await GET(
      new Request('http://x/api/cron/renew-microsoft-subscriptions', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { results: Array<Record<string, unknown>> };
    };
    expect(json.data.results).toEqual([
      { connectionId: 21, action: 'renewed', ok: true },
    ]);
    expect(renewTranscriptsSubscriptionMock).toHaveBeenCalledTimes(1);
    expect(createTranscriptsSubscriptionMock).not.toHaveBeenCalled();
    expect(updateCalls[0].set).toMatchObject({
      subscriptionExpiration: new Date('2026-05-19T13:00:00Z'),
    });
    // refreshed=false → tokens not written
    expect(updateCalls[0].set).not.toHaveProperty('accessToken');
  });

  it('persists refreshed tokens on renewal when transcripts-watch reports refresh', async () => {
    process.env.CRON_SECRET = 'shh';
    selectState.rows = [
      {
        id: 22,
        microsoftUserId: 'mu-4',
        accessToken: 'old-at',
        refreshToken: 'old-rt',
        expiresAt: new Date('2026-05-19T12:00:00Z'),
        subscriptionId: 'sub-existing-2',
        subscriptionExpiration: new Date('2026-05-19T12:10:00Z'),
      },
    ];
    renewTranscriptsSubscriptionMock.mockResolvedValueOnce({
      subscriptionExpiration: new Date('2026-05-19T13:00:00Z'),
      refreshed: true,
      connection: {
        accessToken: 'new-at',
        refreshToken: 'new-rt',
        expiresAt: new Date('2026-05-19T14:00:00Z'),
      },
    });
    const { GET } = await import(
      '@/app/api/cron/renew-microsoft-subscriptions/route'
    );
    await GET(
      new Request('http://x/api/cron/renew-microsoft-subscriptions', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(updateCalls[0].set).toMatchObject({
      accessToken: 'new-at',
      refreshToken: 'new-rt',
    });
  });

  it('falls back to create when renew throws SubscriptionGoneError (404)', async () => {
    process.env.CRON_SECRET = 'shh';
    selectState.rows = [
      {
        id: 31,
        microsoftUserId: 'mu-5',
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date('2026-05-19T12:00:00Z'),
        subscriptionId: 'sub-gone',
        subscriptionExpiration: new Date('2026-05-19T12:10:00Z'),
      },
    ];
    renewTranscriptsSubscriptionMock.mockRejectedValueOnce(
      new FakeSubscriptionGoneError('sub-gone'),
    );
    createTranscriptsSubscriptionMock.mockResolvedValueOnce({
      subscriptionId: 'sub-recreated',
      subscriptionResource: '/r',
      subscriptionExpiration: new Date('2026-05-19T13:00:00Z'),
      subscriptionClientState: 'cs-r',
      refreshed: false,
      connection: { accessToken: 'at', refreshToken: 'rt', expiresAt: new Date() },
    });
    const { GET } = await import(
      '@/app/api/cron/renew-microsoft-subscriptions/route'
    );
    const res = await GET(
      new Request('http://x/api/cron/renew-microsoft-subscriptions', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    const json = (await res.json()) as {
      data: { results: Array<Record<string, unknown>> };
    };
    expect(json.data.results).toEqual([
      { connectionId: 31, action: 'recreated_after_404', ok: true },
    ]);
    expect(renewTranscriptsSubscriptionMock).toHaveBeenCalledTimes(1);
    expect(createTranscriptsSubscriptionMock).toHaveBeenCalledTimes(1);
    expect(updateCalls[0].set).toMatchObject({
      subscriptionId: 'sub-recreated',
    });
  });

  it('reports a failure entry when create throws and continues to next row', async () => {
    process.env.CRON_SECRET = 'shh';
    selectState.rows = [
      {
        id: 41,
        microsoftUserId: 'mu-6',
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date('2026-05-19T12:00:00Z'),
        subscriptionId: null,
        subscriptionExpiration: null,
      },
      {
        id: 42,
        microsoftUserId: 'mu-7',
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date('2026-05-19T12:00:00Z'),
        subscriptionId: null,
        subscriptionExpiration: null,
      },
    ];
    createTranscriptsSubscriptionMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({
        subscriptionId: 'sub-ok',
        subscriptionResource: '/r',
        subscriptionExpiration: new Date('2026-05-19T13:00:00Z'),
        subscriptionClientState: 'cs',
        refreshed: false,
        connection: {
          accessToken: 'at',
          refreshToken: 'rt',
          expiresAt: new Date(),
        },
      });

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { GET } = await import(
      '@/app/api/cron/renew-microsoft-subscriptions/route'
    );
    const res = await GET(
      new Request('http://x/api/cron/renew-microsoft-subscriptions', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { results: Array<Record<string, unknown>> };
    };
    expect(json.data.results).toEqual([
      { connectionId: 41, action: 'create', ok: false, error: 'boom' },
      { connectionId: 42, action: 'created', ok: true },
    ]);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('annotates the error with GraphRequestError.status when available', async () => {
    process.env.CRON_SECRET = 'shh';
    selectState.rows = [
      {
        id: 51,
        microsoftUserId: 'mu-g',
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date('2026-05-19T12:00:00Z'),
        subscriptionId: 'sub-existing',
        subscriptionExpiration: new Date('2026-05-19T12:10:00Z'),
      },
    ];
    renewTranscriptsSubscriptionMock.mockRejectedValueOnce(
      new FakeGraphRequestError(401, 'invalid_grant', 'PATCH', '/subscriptions/sub-existing'),
    );

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { GET } = await import(
      '@/app/api/cron/renew-microsoft-subscriptions/route'
    );
    const res = await GET(
      new Request('http://x/api/cron/renew-microsoft-subscriptions', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    const json = (await res.json()) as {
      data: { results: Array<{ ok: boolean; error?: string; action: string }> };
    };
    expect(json.data.results).toHaveLength(1);
    expect(json.data.results[0].ok).toBe(false);
    expect(json.data.results[0].action).toBe('renew');
    expect(json.data.results[0].error).toMatch(/^401: /);
    errSpy.mockRestore();
  });

  it('coerces a non-Error throw to a string in the failure entry', async () => {
    process.env.CRON_SECRET = 'shh';
    selectState.rows = [
      {
        id: 61,
        microsoftUserId: 'mu-x',
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date('2026-05-19T12:00:00Z'),
        subscriptionId: null,
        subscriptionExpiration: null,
      },
    ];
    createTranscriptsSubscriptionMock.mockRejectedValueOnce('weird-string');

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { GET } = await import(
      '@/app/api/cron/renew-microsoft-subscriptions/route'
    );
    const res = await GET(
      new Request('http://x/api/cron/renew-microsoft-subscriptions', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    const json = (await res.json()) as {
      data: { results: Array<{ ok: boolean; error?: string }> };
    };
    expect(json.data.results[0]).toEqual({
      connectionId: 61,
      action: 'create',
      ok: false,
      error: 'weird-string',
    });
    errSpy.mockRestore();
  });

  it('iterates multiple connections in order, mixing create + renew', async () => {
    process.env.CRON_SECRET = 'shh';
    selectState.rows = [
      {
        id: 71,
        microsoftUserId: 'mu-a',
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date('2026-05-19T12:00:00Z'),
        subscriptionId: null,
        subscriptionExpiration: null,
      },
      {
        id: 72,
        microsoftUserId: 'mu-b',
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date('2026-05-19T12:00:00Z'),
        subscriptionId: 'sub-72',
        subscriptionExpiration: new Date('2026-05-19T12:10:00Z'),
      },
    ];
    createTranscriptsSubscriptionMock.mockResolvedValueOnce({
      subscriptionId: 'sub-71',
      subscriptionResource: '/r',
      subscriptionExpiration: new Date('2026-05-19T13:00:00Z'),
      subscriptionClientState: 'cs',
      refreshed: false,
      connection: { accessToken: 'at', refreshToken: 'rt', expiresAt: new Date() },
    });
    renewTranscriptsSubscriptionMock.mockResolvedValueOnce({
      subscriptionExpiration: new Date('2026-05-19T13:10:00Z'),
      refreshed: false,
      connection: { accessToken: 'at', refreshToken: 'rt', expiresAt: new Date() },
    });

    const { GET } = await import(
      '@/app/api/cron/renew-microsoft-subscriptions/route'
    );
    const res = await GET(
      new Request('http://x/api/cron/renew-microsoft-subscriptions', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { considered: number; results: Array<Record<string, unknown>> };
    };
    expect(json.data.considered).toBe(2);
    expect(json.data.results).toEqual([
      { connectionId: 71, action: 'created', ok: true },
      { connectionId: 72, action: 'renewed', ok: true },
    ]);
    expect(updateCalls).toHaveLength(2);
  });
});
