import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateAuthUrl = vi.fn();
const mockGetToken = vi.fn();
const mockRefreshAccessToken = vi.fn();
const mockRevokeToken = vi.fn();
const mockSetCredentials = vi.fn();
const mockUserinfoGet = vi.fn();

vi.mock('googleapis', () => ({
  google: {
    auth: {
      // Use a regular function (not arrow) so `new google.auth.OAuth2(...)` is valid
      OAuth2: vi.fn(function OAuth2Mock() {
        return {
          generateAuthUrl: mockGenerateAuthUrl,
          getToken: mockGetToken,
          refreshAccessToken: mockRefreshAccessToken,
          revokeToken: mockRevokeToken,
          setCredentials: mockSetCredentials,
        };
      }),
    },
    oauth2: vi.fn(() => ({
      userinfo: { get: mockUserinfoGet },
    })),
  },
}));

const oauthModule = await import('@/lib/google/oauth');
const {
  buildAuthUrl,
  exchangeCode,
  refreshIfExpired,
  revoke,
  RefreshTokenInvalidError,
  getEnvWorkspaceCredentials,
} = oauthModule;

const TEST_CREDS = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  redirectUri: 'http://localhost:3000/cb',
};

beforeEach(() => {
  mockGenerateAuthUrl.mockReset();
  mockGetToken.mockReset();
  mockRefreshAccessToken.mockReset();
  mockRevokeToken.mockReset();
  mockSetCredentials.mockReset();
  mockUserinfoGet.mockReset();
});

describe('getEnvWorkspaceCredentials', () => {
  it('returns credentials when all env vars are set', () => {
    const prev = {
      id: process.env.GOOGLE_WORKSPACE_CLIENT_ID,
      sec: process.env.GOOGLE_WORKSPACE_CLIENT_SECRET,
      uri: process.env.GOOGLE_WORKSPACE_REDIRECT_URI,
    };
    process.env.GOOGLE_WORKSPACE_CLIENT_ID = 'env-client-id';
    process.env.GOOGLE_WORKSPACE_CLIENT_SECRET = 'env-client-secret';
    process.env.GOOGLE_WORKSPACE_REDIRECT_URI = 'http://localhost:3000/env-cb';
    const creds = getEnvWorkspaceCredentials();
    expect(creds).toEqual({
      clientId: 'env-client-id',
      clientSecret: 'env-client-secret',
      redirectUri: 'http://localhost:3000/env-cb',
    });
    process.env.GOOGLE_WORKSPACE_CLIENT_ID = prev.id;
    process.env.GOOGLE_WORKSPACE_CLIENT_SECRET = prev.sec;
    process.env.GOOGLE_WORKSPACE_REDIRECT_URI = prev.uri;
  });

  it('throws when any env var is missing', () => {
    const prev = {
      id: process.env.GOOGLE_WORKSPACE_CLIENT_ID,
      sec: process.env.GOOGLE_WORKSPACE_CLIENT_SECRET,
      uri: process.env.GOOGLE_WORKSPACE_REDIRECT_URI,
    };
    delete process.env.GOOGLE_WORKSPACE_CLIENT_ID;
    delete process.env.GOOGLE_WORKSPACE_CLIENT_SECRET;
    delete process.env.GOOGLE_WORKSPACE_REDIRECT_URI;
    expect(() => getEnvWorkspaceCredentials()).toThrow(/env vars not configured/);
    process.env.GOOGLE_WORKSPACE_CLIENT_ID = prev.id;
    process.env.GOOGLE_WORKSPACE_CLIENT_SECRET = prev.sec;
    process.env.GOOGLE_WORKSPACE_REDIRECT_URI = prev.uri;
  });
});

describe('buildAuthUrl', () => {
  beforeEach(() => {
    mockGenerateAuthUrl.mockReturnValue(
      'https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&prompt=consent&include_granted_scopes=true&scope=openid&state=abc'
    );
  });

  it('passes access_type=offline, prompt=consent, include_granted_scopes=true to googleapis', () => {
    buildAuthUrl({ credentials: TEST_CREDS, surfaces: ['identity'], state: 'abc' });
    const call = mockGenerateAuthUrl.mock.calls[0][0];
    expect(call.access_type).toBe('offline');
    expect(call.prompt).toBe('consent');
    expect(call.include_granted_scopes).toBe(true);
  });

  it('passes the supplied state', () => {
    buildAuthUrl({ credentials: TEST_CREDS, surfaces: ['identity'], state: 'state-xyz' });
    const call = mockGenerateAuthUrl.mock.calls[0][0];
    expect(call.state).toBe('state-xyz');
  });

  it('includes identity scopes plus requested surface scopes (no duplicates)', () => {
    buildAuthUrl({ credentials: TEST_CREDS, surfaces: ['identity', 'gmail'], state: 's' });
    const call = mockGenerateAuthUrl.mock.calls[0][0];
    expect(call.scope).toContain('openid');
    expect(call.scope).toContain('https://www.googleapis.com/auth/userinfo.email');
    expect(call.scope).toContain('https://www.googleapis.com/auth/gmail.readonly');
  });

  it('returns the URL produced by googleapis', () => {
    const url = buildAuthUrl({ credentials: TEST_CREDS, surfaces: ['identity'], state: 'abc' });
    expect(url).toContain('accounts.google.com');
    expect(url).toContain('access_type=offline');
  });

  it('passes login_hint when provided', () => {
    buildAuthUrl({ credentials: TEST_CREDS, surfaces: ['identity'], state: 's', loginHint: 'user@example.com' });
    const call = mockGenerateAuthUrl.mock.calls[0][0];
    expect(call.login_hint).toBe('user@example.com');
  });

  it('omits login_hint when not provided', () => {
    buildAuthUrl({ credentials: TEST_CREDS, surfaces: ['identity'], state: 's' });
    const call = mockGenerateAuthUrl.mock.calls[0][0];
    expect(call.login_hint).toBeUndefined();
  });
});

describe('exchangeCode', () => {
  beforeEach(() => {
    mockUserinfoGet.mockResolvedValue({
      data: { email: 'alice@example.com', id: '12345' },
    });
  });

  it('returns parsed token object with all fields when refresh_token present', async () => {
    const futureMs = Date.now() + 3600_000;
    mockGetToken.mockResolvedValueOnce({
      tokens: {
        access_token: 'a',
        refresh_token: 'r',
        expiry_date: futureMs,
        scope: 'openid email',
      },
    });
    const result = await exchangeCode('code123', TEST_CREDS);
    expect(result.accessToken).toBe('a');
    expect(result.refreshToken).toBe('r');
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt.getTime()).toBe(futureMs);
    expect(result.googleAccountEmail).toBe('alice@example.com');
    expect(result.googleAccountId).toBe('12345');
    expect(result.scopes).toEqual(['openid', 'email']);
  });

  it('throws when refresh_token is absent', async () => {
    mockGetToken.mockResolvedValueOnce({
      tokens: { access_token: 'a', expiry_date: Date.now() + 3600_000, scope: 'openid' },
    });
    await expect(exchangeCode('code123', TEST_CREDS)).rejects.toThrow(/No refresh token/);
  });

  it('throws when access_token is absent', async () => {
    mockGetToken.mockResolvedValueOnce({
      tokens: { refresh_token: 'r', expiry_date: Date.now() + 3600_000 },
    });
    await expect(exchangeCode('code123', TEST_CREDS)).rejects.toThrow(/incomplete tokens/);
  });

  it('throws when userinfo lacks email', async () => {
    mockGetToken.mockResolvedValueOnce({
      tokens: { access_token: 'a', refresh_token: 'r', expiry_date: Date.now() + 3600_000, scope: 'openid' },
    });
    mockUserinfoGet.mockResolvedValueOnce({ data: { id: '12345' } });
    await expect(exchangeCode('code123', TEST_CREDS)).rejects.toThrow(/userinfo/);
  });
});

describe('refreshIfExpired', () => {
  it('returns refreshed:false when token has more than 60s remaining', async () => {
    const futureExpiry = new Date(Date.now() + 5 * 60_000);
    const result = await refreshIfExpired(
      { accessToken: 'a', refreshToken: 'r', expiresAt: futureExpiry },
      TEST_CREDS
    );
    expect(result.refreshed).toBe(false);
    expect(result.accessToken).toBe('a');
    expect(result.refreshToken).toBe('r');
    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
  });

  it('refreshes when expired and returns new access_token', async () => {
    const pastExpiry = new Date(Date.now() - 60_000);
    const newExpiryMs = Date.now() + 3600_000;
    mockRefreshAccessToken.mockResolvedValueOnce({
      credentials: { access_token: 'a2', expiry_date: newExpiryMs },
    });
    const result = await refreshIfExpired(
      { accessToken: 'a', refreshToken: 'r', expiresAt: pastExpiry },
      TEST_CREDS
    );
    expect(result.refreshed).toBe(true);
    expect(result.accessToken).toBe('a2');
    expect(result.refreshToken).toBeUndefined();
    expect(result.expiresAt.getTime()).toBe(newExpiryMs);
  });

  it('returns new refresh_token when Google rotates it', async () => {
    const pastExpiry = new Date(Date.now() - 60_000);
    mockRefreshAccessToken.mockResolvedValueOnce({
      credentials: { access_token: 'a2', refresh_token: 'r2', expiry_date: Date.now() + 3600_000 },
    });
    const result = await refreshIfExpired(
      { accessToken: 'a', refreshToken: 'r', expiresAt: pastExpiry },
      TEST_CREDS
    );
    expect(result.refreshToken).toBe('r2');
  });

  it('throws RefreshTokenInvalidError on invalid_grant', async () => {
    const pastExpiry = new Date(Date.now() - 60_000);
    mockRefreshAccessToken.mockRejectedValueOnce(
      Object.assign(new Error('invalid_grant'), {
        response: { data: { error: 'invalid_grant' } },
      })
    );
    await expect(
      refreshIfExpired({ accessToken: 'a', refreshToken: 'r', expiresAt: pastExpiry }, TEST_CREDS)
    ).rejects.toBeInstanceOf(RefreshTokenInvalidError);
  });

  it('rethrows non-invalid_grant errors as-is', async () => {
    const pastExpiry = new Date(Date.now() - 60_000);
    mockRefreshAccessToken.mockRejectedValueOnce(new Error('network unreachable'));
    await expect(
      refreshIfExpired({ accessToken: 'a', refreshToken: 'r', expiresAt: pastExpiry }, TEST_CREDS)
    ).rejects.toThrow(/network unreachable/);
  });

  it('refreshes when within 60s skew window even if not yet expired', async () => {
    const nearFuture = new Date(Date.now() + 30_000);
    mockRefreshAccessToken.mockResolvedValueOnce({
      credentials: { access_token: 'a2', expiry_date: Date.now() + 3600_000 },
    });
    const result = await refreshIfExpired(
      { accessToken: 'a', refreshToken: 'r', expiresAt: nearFuture },
      TEST_CREDS
    );
    expect(result.refreshed).toBe(true);
  });
});

describe('revoke', () => {
  it('returns revoked:true on success', async () => {
    mockRevokeToken.mockResolvedValueOnce({});
    const result = await revoke('refresh-token-value', TEST_CREDS);
    expect(result.revoked).toBe(true);
    expect(result.alreadyRevoked).toBeUndefined();
  });

  it('treats 400 invalid_token as already-revoked (idempotent)', async () => {
    mockRevokeToken.mockRejectedValueOnce(
      Object.assign(new Error('invalid_token'), {
        response: { status: 400, data: { error: 'invalid_token' } },
      })
    );
    const result = await revoke('already-revoked', TEST_CREDS);
    expect(result.revoked).toBe(true);
    expect(result.alreadyRevoked).toBe(true);
  });

  it('rethrows other errors', async () => {
    mockRevokeToken.mockRejectedValueOnce(new Error('500 internal server error'));
    await expect(revoke('x', TEST_CREDS)).rejects.toThrow(/500/);
  });
});
