// @vitest-environment node
/**
 * Unit tests for `GET /api/portal/integrations/microsoft/callback`.
 *
 * This is the Microsoft OAuth redirect target. It validates the signed `state`
 * we issued at /connect, CSRF-binds against the session, exchanges the auth
 * code for tokens, best-effort creates a transcripts subscription, and upserts
 * the connection row.
 *
 * All external dependencies (db, schema, drizzle-orm, auth, microsoft/* libs)
 * are stubbed — pure unit coverage of the route's branching logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mock harness state
// ---------------------------------------------------------------------------

interface DbState {
  insertCalls: Array<{
    values: Record<string, unknown>;
    conflict: Record<string, unknown> | null;
  }>;
  insertThrow: Error | null;
}

const dbState: DbState = {
  insertCalls: [],
  insertThrow: null,
};

interface MsState {
  exchangeCode: ReturnType<typeof vi.fn>;
  getEnvMicrosoftCredentials: ReturnType<typeof vi.fn>;
  verifyState: ReturnType<typeof vi.fn>;
  createTranscriptsSubscription: ReturnType<typeof vi.fn>;
  auth: ReturnType<typeof vi.fn>;
}

const msState: MsState = {
  exchangeCode: vi.fn(),
  getEnvMicrosoftCredentials: vi.fn(),
  verifyState: vi.fn(),
  createTranscriptsSubscription: vi.fn(),
  auth: vi.fn(),
};

// ---------------------------------------------------------------------------
// Mocks — declared before importing the route under test
// ---------------------------------------------------------------------------

vi.mock('@/lib/db/schema', () => {
  function tableProxy(name: string) {
    return new Proxy(
      { _name: name },
      {
        get(_target, prop) {
          if (prop === '_name') return name;
          return `${name}.${String(prop)}`;
        },
      },
    );
  }
  return {
    microsoftTeamsUserConnections: tableProxy('microsoftTeamsUserConnections'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ _op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ _op: 'and', args }),
  isNull: (a: unknown) => ({ _op: 'isNull', a }),
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => ({
    _op: 'sql',
    strings,
    vals,
  }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

vi.mock('@/lib/db', () => {
  return {
    db: {
      insert(_table: unknown) {
        let captured: Record<string, unknown> = {};
        const chain = {
          values(v: Record<string, unknown>) {
            captured = v;
            return chain;
          },
          onConflictDoUpdate(args: Record<string, unknown>) {
            if (dbState.insertThrow) {
              const err = dbState.insertThrow;
              return {
                then(_ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) {
                  return Promise.reject(err).catch((e) => {
                    if (fail) return fail(e);
                    throw e;
                  });
                },
              };
            }
            dbState.insertCalls.push({ values: captured, conflict: args });
            return {
              then(ok: (v: unknown) => unknown) {
                return Promise.resolve(undefined).then(ok);
              },
            };
          },
        };
        return chain;
      },
    },
  };
});

// Fake StateInvalidError that matches the route's `err instanceof StateInvalidError` check.
class FakeStateInvalidError extends Error {
  reason: string;
  constructor(reason: 'malformed' | 'bad_signature' | 'expired') {
    super(`OAuth state invalid: ${reason}`);
    this.name = 'StateInvalidError';
    this.reason = reason;
  }
}

vi.mock('@/lib/microsoft/oauth-state', () => ({
  verifyState: (state: string) => msState.verifyState(state),
  StateInvalidError: FakeStateInvalidError,
}));

vi.mock('@/lib/microsoft/oauth', () => ({
  exchangeCode: (...args: unknown[]) => msState.exchangeCode(...args),
  getEnvMicrosoftCredentials: (...args: unknown[]) =>
    msState.getEnvMicrosoftCredentials(...args),
}));

vi.mock('@/lib/microsoft/transcripts-watch', () => ({
  createTranscriptsSubscription: (...args: unknown[]) =>
    msState.createTranscriptsSubscription(...args),
}));

vi.mock('@/lib/auth', () => ({
  auth: () => msState.auth(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  query: Record<string, string | undefined>,
  origin = 'http://localhost',
): NextRequest {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) params.set(k, v);
  }
  const url = `${origin}/api/portal/integrations/microsoft/callback?${params.toString()}`;
  return new Request(url, { method: 'GET' }) as unknown as NextRequest;
}

interface RouteJson {
  error?: string;
  message?: string;
  reason?: string;
}

const DEFAULT_PAYLOAD = {
  clientId: 7,
  userId: 42,
  surfaces: ['transcripts'],
  nonce: 'n',
  expiresAt: Date.now() + 600_000,
  returnTo: '/portal/integrations',
};

const DEFAULT_EXCHANGE = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: new Date('2099-01-01T00:00:00Z'),
  scopes: ['offline_access', 'OnlineMeetings.Read'],
  microsoftAccountEmail: 'user@contoso.com',
  microsoftUserId: 'oid-abc',
  microsoftTenantId: 'tid-xyz',
};

const DEFAULT_CREDS = {
  clientId: 'cli',
  clientSecret: 'sec',
  redirectUri: 'http://localhost/api/portal/integrations/microsoft/callback',
  tenant: 'common',
};

beforeEach(() => {
  vi.resetModules();
  dbState.insertCalls.length = 0;
  dbState.insertThrow = null;
  msState.exchangeCode.mockReset();
  msState.getEnvMicrosoftCredentials.mockReset();
  msState.verifyState.mockReset();
  msState.createTranscriptsSubscription.mockReset();
  msState.auth.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/portal/integrations/microsoft/callback — pre-state validation', () => {
  it('returns 400 missing_state when state query param is absent', async () => {
    const { GET } = await import(
      '@/app/api/portal/integrations/microsoft/callback/route'
    );
    const res = await GET(makeRequest({ code: 'abc' }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as RouteJson).error).toBe('missing_state');
  });

  it('returns 400 invalid_state with reason when verifyState throws StateInvalidError', async () => {
    msState.verifyState.mockImplementation(() => {
      throw new FakeStateInvalidError('bad_signature');
    });
    const { GET } = await import(
      '@/app/api/portal/integrations/microsoft/callback/route'
    );
    const res = await GET(makeRequest({ state: 'forged', code: 'abc' }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as RouteJson;
    expect(json.error).toBe('invalid_state');
    expect(json.reason).toBe('bad_signature');
  });

  it('rethrows non-StateInvalidError exceptions from verifyState', async () => {
    msState.verifyState.mockImplementation(() => {
      throw new Error('unexpected boom');
    });
    const { GET } = await import(
      '@/app/api/portal/integrations/microsoft/callback/route'
    );
    await expect(GET(makeRequest({ state: 's', code: 'c' }))).rejects.toThrow(
      'unexpected boom',
    );
  });
});

describe('GET /api/portal/integrations/microsoft/callback — session CSRF binding', () => {
  it('returns 403 session_mismatch when no session', async () => {
    msState.verifyState.mockReturnValue(DEFAULT_PAYLOAD);
    msState.auth.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/portal/integrations/microsoft/callback/route'
    );
    const res = await GET(makeRequest({ state: 's', code: 'c' }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as RouteJson).error).toBe('session_mismatch');
  });

  it('returns 403 session_mismatch when session user id does not equal payload.userId', async () => {
    msState.verifyState.mockReturnValue(DEFAULT_PAYLOAD);
    msState.auth.mockResolvedValue({ user: { id: '99' } }); // mismatch
    const { GET } = await import(
      '@/app/api/portal/integrations/microsoft/callback/route'
    );
    const res = await GET(makeRequest({ state: 's', code: 'c' }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as RouteJson).error).toBe('session_mismatch');
  });
});

describe('GET /api/portal/integrations/microsoft/callback — microsoft error / missing code', () => {
  beforeEach(() => {
    msState.verifyState.mockReturnValue(DEFAULT_PAYLOAD);
    msState.auth.mockResolvedValue({ user: { id: '42' } });
  });

  it('redirects to safe returnTo with microsoft_error when ?error= is set', async () => {
    const { GET } = await import(
      '@/app/api/portal/integrations/microsoft/callback/route'
    );
    const res = await GET(
      makeRequest({
        state: 's',
        error: 'access_denied',
        error_description: 'user said no',
      }),
    );
    expect(res.status).toBe(307); // Next redirect
    const loc = res.headers.get('location') ?? '';
    expect(loc).toContain('/portal/integrations');
    expect(loc).toContain('microsoft_error=access_denied');
    expect(loc).toContain('microsoft_error_description=user%20said%20no');
  });

  it('returns 400 missing_code when no code and no microsoft error', async () => {
    const { GET } = await import(
      '@/app/api/portal/integrations/microsoft/callback/route'
    );
    const res = await GET(makeRequest({ state: 's' }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as RouteJson).error).toBe('missing_code');
  });

  it('falls back to /portal when payload.returnTo is not same-origin (rejects //evil.com)', async () => {
    msState.verifyState.mockReturnValue({
      ...DEFAULT_PAYLOAD,
      returnTo: '//evil.com/path',
    });
    const { GET } = await import(
      '@/app/api/portal/integrations/microsoft/callback/route'
    );
    const res = await GET(
      makeRequest({ state: 's', error: 'access_denied' }),
    );
    expect(res.status).toBe(307);
    const loc = res.headers.get('location') ?? '';
    // Should not include "//evil.com" as the path — fallback is /portal
    expect(loc).toMatch(/localhost\/portal\?microsoft_error=access_denied/);
  });
});

describe('GET /api/portal/integrations/microsoft/callback — credentials & token exchange', () => {
  beforeEach(() => {
    msState.verifyState.mockReturnValue(DEFAULT_PAYLOAD);
    msState.auth.mockResolvedValue({ user: { id: '42' } });
  });

  it('returns 500 microsoft_oauth_not_configured when credentials throw', async () => {
    msState.getEnvMicrosoftCredentials.mockImplementation(() => {
      throw new Error('MICROSOFT_OAUTH_CLIENT_ID env var is not set');
    });
    const { GET } = await import(
      '@/app/api/portal/integrations/microsoft/callback/route'
    );
    const res = await GET(makeRequest({ state: 's', code: 'c' }));
    expect(res.status).toBe(500);
    const json = (await res.json()) as RouteJson;
    expect(json.error).toBe('microsoft_oauth_not_configured');
    expect(json.message).toContain('MICROSOFT_OAUTH_CLIENT_ID');
  });

  it('returns 502 token_exchange_failed when exchangeCode rejects', async () => {
    msState.getEnvMicrosoftCredentials.mockReturnValue(DEFAULT_CREDS);
    msState.exchangeCode.mockRejectedValue(new Error('graph 503'));
    const { GET } = await import(
      '@/app/api/portal/integrations/microsoft/callback/route'
    );
    const res = await GET(makeRequest({ state: 's', code: 'c' }));
    expect(res.status).toBe(502);
    const json = (await res.json()) as RouteJson;
    expect(json.error).toBe('token_exchange_failed');
    expect(json.message).toContain('graph 503');
  });
});

describe('GET /api/portal/integrations/microsoft/callback — happy path', () => {
  beforeEach(() => {
    msState.verifyState.mockReturnValue(DEFAULT_PAYLOAD);
    msState.auth.mockResolvedValue({ user: { id: '42' } });
    msState.getEnvMicrosoftCredentials.mockReturnValue(DEFAULT_CREDS);
    msState.exchangeCode.mockResolvedValue({ ...DEFAULT_EXCHANGE });
  });

  it('upserts the connection and redirects with microsoft_connected=1 when subscription succeeds', async () => {
    msState.createTranscriptsSubscription.mockResolvedValue({
      subscriptionId: 'sub-1',
      subscriptionResource: '/users/oid-abc/onlineMeetings',
      subscriptionExpiration: new Date('2099-02-01T00:00:00Z'),
      subscriptionClientState: 'cs-1',
      refreshed: false,
      connection: {
        accessToken: DEFAULT_EXCHANGE.accessToken,
        refreshToken: DEFAULT_EXCHANGE.refreshToken,
        expiresAt: DEFAULT_EXCHANGE.expiresAt,
      },
    });
    const { GET } = await import(
      '@/app/api/portal/integrations/microsoft/callback/route'
    );
    const res = await GET(makeRequest({ state: 's', code: 'c' }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(
      'http://localhost/portal/integrations?microsoft_connected=1',
    );
    expect(dbState.insertCalls.length).toBe(1);
    const call = dbState.insertCalls[0];
    expect(call.values).toMatchObject({
      clientId: 7,
      userId: 42,
      microsoftUserId: 'oid-abc',
      microsoftTenantId: 'tid-xyz',
      microsoftAccountEmail: 'user@contoso.com',
      subscriptionId: 'sub-1',
      subscriptionResource: '/users/oid-abc/onlineMeetings',
      subscriptionClientState: 'cs-1',
    });
  });

  it('still upserts and redirects when subscription creation fails (logs warn)', async () => {
    msState.createTranscriptsSubscription.mockRejectedValue(
      new Error('notificationUrl unreachable'),
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { GET } = await import(
      '@/app/api/portal/integrations/microsoft/callback/route'
    );
    const res = await GET(makeRequest({ state: 's', code: 'c' }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('microsoft_connected=1');
    expect(dbState.insertCalls.length).toBe(1);
    const call = dbState.insertCalls[0];
    expect(call.values.subscriptionId).toBeNull();
    expect(call.values.subscriptionResource).toBeNull();
    // When subscription fails, the conflict-update set must NOT include
    // subscription fields (so renewal cron preserves prior values).
    const setObj = (call.conflict?.set ?? {}) as Record<string, unknown>;
    expect('subscriptionId' in setObj).toBe(false);
    expect('subscriptionResource' in setObj).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('uses /portal fallback when payload has no returnTo', async () => {
    msState.verifyState.mockReturnValue({
      ...DEFAULT_PAYLOAD,
      returnTo: undefined,
    });
    msState.createTranscriptsSubscription.mockRejectedValue(new Error('skip'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { GET } = await import(
      '@/app/api/portal/integrations/microsoft/callback/route'
    );
    const res = await GET(makeRequest({ state: 's', code: 'c' }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(
      'http://localhost/portal?microsoft_connected=1',
    );
    warnSpy.mockRestore();
  });

  it('uses refreshed tokens from subscription when sub.refreshed is true', async () => {
    msState.createTranscriptsSubscription.mockResolvedValue({
      subscriptionId: 'sub-1',
      subscriptionResource: '/users/oid-abc/onlineMeetings',
      subscriptionExpiration: new Date('2099-02-01T00:00:00Z'),
      subscriptionClientState: 'cs-1',
      refreshed: true,
      connection: {
        accessToken: 'rotated-access',
        refreshToken: 'rotated-refresh',
        expiresAt: new Date('2099-03-01T00:00:00Z'),
      },
    });
    const { GET } = await import(
      '@/app/api/portal/integrations/microsoft/callback/route'
    );
    const res = await GET(makeRequest({ state: 's', code: 'c' }));
    expect(res.status).toBe(307);
    const call = dbState.insertCalls[0];
    expect(call.values.accessToken).toBe('rotated-access');
    expect(call.values.refreshToken).toBe('rotated-refresh');
    expect(call.values.expiresAt).toEqual(new Date('2099-03-01T00:00:00Z'));
  });
});

describe('GET /api/portal/integrations/microsoft/callback — DB failure', () => {
  beforeEach(() => {
    msState.verifyState.mockReturnValue(DEFAULT_PAYLOAD);
    msState.auth.mockResolvedValue({ user: { id: '42' } });
    msState.getEnvMicrosoftCredentials.mockReturnValue(DEFAULT_CREDS);
    msState.exchangeCode.mockResolvedValue({ ...DEFAULT_EXCHANGE });
    msState.createTranscriptsSubscription.mockRejectedValue(new Error('skip'));
  });

  it('propagates DB errors (no swallow at the route level)', async () => {
    dbState.insertThrow = new Error('unique violation');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { GET } = await import(
      '@/app/api/portal/integrations/microsoft/callback/route'
    );
    await expect(GET(makeRequest({ state: 's', code: 'c' }))).rejects.toThrow(
      'unique violation',
    );
    warnSpy.mockRestore();
  });
});
