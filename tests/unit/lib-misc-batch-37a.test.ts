// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// googleapis mock — drives lib/google/oauth.ts
// ---------------------------------------------------------------------------
const mockGenerateAuthUrl = vi.fn();
const mockGetToken = vi.fn();
const mockSetCredentials = vi.fn();
const mockRefreshAccessToken = vi.fn();
const mockRevokeToken = vi.fn();
const mockUserinfoGet = vi.fn();

const mockOAuth2Ctor = vi.fn(function OAuth2Mock(
  this: Record<string, unknown>,
  clientId?: string,
  clientSecret?: string,
  redirectUri?: string,
) {
  this.clientId = clientId;
  this.clientSecret = clientSecret;
  this.redirectUri = redirectUri;
  this.generateAuthUrl = mockGenerateAuthUrl;
  this.getToken = mockGetToken;
  this.setCredentials = mockSetCredentials;
  this.refreshAccessToken = mockRefreshAccessToken;
  this.revokeToken = mockRevokeToken;
});

const mockOauth2Factory = vi.fn(() => ({
  userinfo: { get: mockUserinfoGet },
}));

vi.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: mockOAuth2Ctor },
    oauth2: mockOauth2Factory,
  },
}));

// ---------------------------------------------------------------------------
// graph-client mock — drives lib/microsoft/transcripts-fetch.ts metadata call
// ---------------------------------------------------------------------------
const mockGraphCall = vi.fn();
vi.mock('@/lib/microsoft/graph-client', () => ({
  graphCall: (...args: unknown[]) => mockGraphCall(...args),
}));

// Imports happen after mocks
const googleOauth = await import('@/lib/google/oauth');
const msOauth = await import('@/lib/microsoft/oauth');
const portalNav = await import('@/lib/portal-nav');
const transcriptsFetch = await import('@/lib/microsoft/transcripts-fetch');

beforeEach(() => {
  mockGenerateAuthUrl.mockReset();
  mockGetToken.mockReset();
  mockSetCredentials.mockReset();
  mockRefreshAccessToken.mockReset();
  mockRevokeToken.mockReset();
  mockUserinfoGet.mockReset();
  mockOAuth2Ctor.mockClear();
  mockOauth2Factory.mockClear();
  mockGraphCall.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ===========================================================================
// 1. lib/microsoft/oauth.ts
// ===========================================================================

describe('lib/microsoft/oauth', () => {
  const CREDS: import('@/lib/microsoft/oauth').MicrosoftOAuthCredentials = {
    clientId: 'ms-client',
    clientSecret: 'ms-secret',
    tenant: 'common',
    redirectUri: 'https://app.example.com/cb',
  };

  describe('RefreshTokenInvalidError', () => {
    it('has the expected name and default message', () => {
      const e = new msOauth.RefreshTokenInvalidError();
      expect(e.name).toBe('RefreshTokenInvalidError');
      expect(e.message).toContain('Refresh token is invalid');
      expect(e).toBeInstanceOf(Error);
    });

    it('respects a custom message', () => {
      const e = new msOauth.RefreshTokenInvalidError('custom');
      expect(e.message).toBe('custom');
    });
  });

  describe('getEnvMicrosoftCredentials', () => {
    const originalEnv = process.env;
    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.MICROSOFT_TEAMS_CLIENT_ID;
      delete process.env.MICROSOFT_TEAMS_CLIENT_SECRET;
      delete process.env.MICROSOFT_TEAMS_TENANT;
    });
    afterEach(() => {
      process.env = originalEnv;
    });

    it('throws when client id is missing', () => {
      process.env.MICROSOFT_TEAMS_CLIENT_SECRET = 'sec';
      expect(() => msOauth.getEnvMicrosoftCredentials('http://cb')).toThrow(
        /MICROSOFT_TEAMS_CLIENT_ID/,
      );
    });

    it('throws when client secret is missing', () => {
      process.env.MICROSOFT_TEAMS_CLIENT_ID = 'cid';
      expect(() => msOauth.getEnvMicrosoftCredentials('http://cb')).toThrow(
        /MICROSOFT_TEAMS_CLIENT/,
      );
    });

    it('returns creds with tenant defaulting to "common"', () => {
      process.env.MICROSOFT_TEAMS_CLIENT_ID = 'cid';
      process.env.MICROSOFT_TEAMS_CLIENT_SECRET = 'csec';
      const out = msOauth.getEnvMicrosoftCredentials('http://cb');
      expect(out).toEqual({
        clientId: 'cid',
        clientSecret: 'csec',
        tenant: 'common',
        redirectUri: 'http://cb',
      });
    });

    it('honors a tenant override from env', () => {
      process.env.MICROSOFT_TEAMS_CLIENT_ID = 'cid';
      process.env.MICROSOFT_TEAMS_CLIENT_SECRET = 'csec';
      process.env.MICROSOFT_TEAMS_TENANT = 'tenant-guid';
      const out = msOauth.getEnvMicrosoftCredentials('http://cb');
      expect(out.tenant).toBe('tenant-guid');
    });
  });

  describe('buildAuthUrl', () => {
    it('produces a v2 authorize URL with required params', () => {
      const url = msOauth.buildAuthUrl({
        credentials: CREDS,
        surfaces: ['transcripts'],
        state: 'state-xyz',
      });
      expect(url).toMatch(/^https:\/\/login\.microsoftonline\.com\/common\/oauth2\/v2\.0\/authorize\?/);
      const u = new URL(url);
      expect(u.searchParams.get('client_id')).toBe('ms-client');
      expect(u.searchParams.get('response_type')).toBe('code');
      expect(u.searchParams.get('response_mode')).toBe('query');
      expect(u.searchParams.get('redirect_uri')).toBe(CREDS.redirectUri);
      expect(u.searchParams.get('state')).toBe('state-xyz');
      expect(u.searchParams.get('prompt')).toBe('consent');
      expect(u.searchParams.get('scope')).toContain('openid');
      expect(u.searchParams.get('scope')).toContain('OnlineMeetingTranscript.Read.All');
    });

    it('includes login_hint when provided', () => {
      const url = msOauth.buildAuthUrl({
        credentials: CREDS,
        surfaces: [],
        state: 's',
        loginHint: 'user@x.com',
      });
      expect(new URL(url).searchParams.get('login_hint')).toBe('user@x.com');
    });

    it('omits login_hint when not provided', () => {
      const url = msOauth.buildAuthUrl({
        credentials: CREDS,
        surfaces: [],
        state: 's',
      });
      expect(new URL(url).searchParams.has('login_hint')).toBe(false);
    });

    it('honors a non-common tenant in the URL', () => {
      const url = msOauth.buildAuthUrl({
        credentials: { ...CREDS, tenant: 'tenant-abc' },
        surfaces: [],
        state: 's',
      });
      expect(url).toContain('/tenant-abc/oauth2/v2.0/authorize');
    });
  });

  describe('exchangeCode', () => {
    function makeIdToken(payload: Record<string, unknown>) {
      const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
      const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
      return `${header}.${body}.sig`;
    }

    function stubFetch(impl: (input: unknown, init?: unknown) => Promise<Response>) {
      vi.stubGlobal('fetch', vi.fn(impl));
    }

    it('returns parsed tokens + claims on success', async () => {
      const idToken = makeIdToken({
        oid: 'oid-1',
        tid: 'tid-1',
        email: 'a@b.com',
      });
      stubFetch(async () =>
        new Response(
          JSON.stringify({
            token_type: 'Bearer',
            scope: 'openid User.Read OnlineMeetingTranscript.Read.All',
            expires_in: 3600,
            access_token: 'at',
            refresh_token: 'rt',
            id_token: idToken,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const result = await msOauth.exchangeCode('code-1', CREDS);
      expect(result.accessToken).toBe('at');
      expect(result.refreshToken).toBe('rt');
      expect(result.microsoftUserId).toBe('oid-1');
      expect(result.microsoftTenantId).toBe('tid-1');
      expect(result.microsoftAccountEmail).toBe('a@b.com');
      expect(result.scopes).toEqual(
        expect.arrayContaining(['openid', 'User.Read', 'OnlineMeetingTranscript.Read.All']),
      );
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('falls back to preferred_username and upn for email', async () => {
      const idToken = makeIdToken({
        oid: 'oid-1',
        tid: 'tid-1',
        preferred_username: 'pref@x.com',
      });
      stubFetch(async () =>
        new Response(
          JSON.stringify({
            scope: '',
            expires_in: 1,
            access_token: 'a',
            refresh_token: 'r',
            id_token: idToken,
          }),
          { status: 200 },
        ),
      );
      const out = await msOauth.exchangeCode('c', CREDS);
      expect(out.microsoftAccountEmail).toBe('pref@x.com');
    });

    it('throws on non-2xx response', async () => {
      stubFetch(async () => new Response('bad', { status: 400 }));
      await expect(msOauth.exchangeCode('c', CREDS)).rejects.toThrow(
        /Microsoft token exchange failed \(400\)/,
      );
    });

    it('throws when refresh_token is missing', async () => {
      const idToken = makeIdToken({ oid: 'o', tid: 't' });
      stubFetch(async () =>
        new Response(
          JSON.stringify({
            scope: '',
            expires_in: 1,
            access_token: 'a',
            id_token: idToken,
          }),
          { status: 200 },
        ),
      );
      await expect(msOauth.exchangeCode('c', CREDS)).rejects.toThrow(/offline_access/);
    });

    it('throws when id_token is missing', async () => {
      stubFetch(async () =>
        new Response(
          JSON.stringify({
            scope: '',
            expires_in: 1,
            access_token: 'a',
            refresh_token: 'r',
          }),
          { status: 200 },
        ),
      );
      await expect(msOauth.exchangeCode('c', CREDS)).rejects.toThrow(/openid scope/);
    });

    it('throws when id_token is malformed', async () => {
      stubFetch(async () =>
        new Response(
          JSON.stringify({
            scope: '',
            expires_in: 1,
            access_token: 'a',
            refresh_token: 'r',
            id_token: 'not-a-jwt',
          }),
          { status: 200 },
        ),
      );
      await expect(msOauth.exchangeCode('c', CREDS)).rejects.toThrow(/Malformed ID token/);
    });

    it('throws when oid/tid claims are missing', async () => {
      const idToken = makeIdToken({});
      stubFetch(async () =>
        new Response(
          JSON.stringify({
            scope: '',
            expires_in: 1,
            access_token: 'a',
            refresh_token: 'r',
            id_token: idToken,
          }),
          { status: 200 },
        ),
      );
      await expect(msOauth.exchangeCode('c', CREDS)).rejects.toThrow(/oid\/tid claims/);
    });
  });

  describe('refreshAccessToken', () => {
    const CONN: import('@/lib/microsoft/oauth').MicrosoftConnectionLike = {
      accessToken: 'at-old',
      refreshToken: 'rt-old',
      expiresAt: new Date(),
    };

    it('returns refreshed token info on success', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          new Response(
            JSON.stringify({
              scope: 'openid x',
              expires_in: 1000,
              access_token: 'at-new',
              refresh_token: 'rt-new',
            }),
            { status: 200 },
          ),
        ),
      );
      const out = await msOauth.refreshAccessToken(CONN, CREDS);
      expect(out.accessToken).toBe('at-new');
      expect(out.refreshToken).toBe('rt-new');
      expect(out.scopes).toEqual(['openid', 'x']);
      expect(out.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('keeps the old refresh token when Microsoft omits one', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          new Response(
            JSON.stringify({ scope: '', expires_in: 1, access_token: 'a' }),
            { status: 200 },
          ),
        ),
      );
      const out = await msOauth.refreshAccessToken(CONN, CREDS);
      expect(out.refreshToken).toBe('rt-old');
    });

    it('throws RefreshTokenInvalidError on 400', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('AADSTS70008', { status: 400 })),
      );
      await expect(msOauth.refreshAccessToken(CONN, CREDS)).rejects.toBeInstanceOf(
        msOauth.RefreshTokenInvalidError,
      );
    });

    it('throws RefreshTokenInvalidError on 401', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })));
      await expect(msOauth.refreshAccessToken(CONN, CREDS)).rejects.toBeInstanceOf(
        msOauth.RefreshTokenInvalidError,
      );
    });

    it('throws a generic error on other non-2xx', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
      await expect(msOauth.refreshAccessToken(CONN, CREDS)).rejects.toThrow(
        /token refresh failed \(500\)/,
      );
    });
  });

  describe('refreshIfExpired', () => {
    it('returns the same connection when not expiring soon', async () => {
      const conn = {
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      };
      const out = await msOauth.refreshIfExpired(conn, CREDS);
      expect(out.refreshed).toBe(false);
      expect(out.connection).toBe(conn);
    });

    it('refreshes when within the 60s leeway', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          new Response(
            JSON.stringify({
              scope: 'openid',
              expires_in: 3600,
              access_token: 'new',
              refresh_token: 'r-new',
            }),
            { status: 200 },
          ),
        ),
      );
      const conn = {
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: new Date(Date.now() + 10_000),
      };
      const out = await msOauth.refreshIfExpired(conn, CREDS);
      expect(out.refreshed).toBe(true);
      expect(out.connection.accessToken).toBe('new');
      expect(out.connection.refreshToken).toBe('r-new');
    });
  });

  describe('revoke', () => {
    it('is a no-op that resolves', async () => {
      await expect(
        msOauth.revoke({ accessToken: 'a', refreshToken: 'r', expiresAt: new Date() }),
      ).resolves.toBeUndefined();
    });
  });
});

// ===========================================================================
// 2. lib/portal-nav.ts
// ===========================================================================

describe('lib/portal-nav', () => {
  describe('buildPortalNavItems', () => {
    it('returns the global tree without per-site branch when site is null', () => {
      const items = portalNav.buildPortalNavItems(null, null);
      const labels = items.map((i) => i.label);
      expect(labels).toContain('Dashboard');
      expect(labels).toContain('Company Brain');
      expect(labels).toContain('Projects');
      expect(labels).toContain('CRM');
      expect(labels).toContain('Email');
      expect(labels).toContain('Websites');
      expect(labels).toContain('Settings');
      // No per-site branch
      expect(items.some((i) => i.href.includes('/portal/websites/'))).toBe(false);
    });

    it('inserts the per-site branch when activeSiteId is provided', () => {
      const items = portalNav.buildPortalNavItems('site-7', 'Acme Co');
      const siteNode = items.find((i) => i.href === '/portal/websites/site-7');
      expect(siteNode).toBeDefined();
      expect(siteNode?.label).toBe('Acme Co');
      expect(siteNode?.children?.some((c) => c.label === 'Content')).toBe(true);
      expect(siteNode?.children?.some((c) => c.label === 'Store')).toBe(true);
      expect(siteNode?.children?.some((c) => c.label === 'Website Settings')).toBe(true);
    });

    it('falls back to "Website" label when activeSiteName is null', () => {
      const items = portalNav.buildPortalNavItems('site-1', null);
      const siteNode = items.find((i) => i.href === '/portal/websites/site-1');
      expect(siteNode?.label).toBe('Website');
    });

    it('store children include products and orders', () => {
      const items = portalNav.buildPortalNavItems('s', 'S');
      const siteNode = items.find((i) => i.href === '/portal/websites/s');
      const store = siteNode?.children?.find((c) => c.label === 'Store');
      const storeChildrenLabels = store?.children?.map((c) => c.label) ?? [];
      expect(storeChildrenLabels).toEqual(
        expect.arrayContaining(['Products', 'Orders', 'Categories', 'Discounts', 'Shipping']),
      );
    });

    it('agency branch is always included with its children', () => {
      const items = portalNav.buildPortalNavItems(null, null);
      const agency = items.find((i) => i.label === 'Agency');
      expect(agency).toBeDefined();
      const labels = agency?.children?.map((c) => c.label) ?? [];
      expect(labels).toEqual(
        expect.arrayContaining(['Overview', 'Custom Domain', 'Agency Branding']),
      );
    });
  });

  describe('flattenPortalNav', () => {
    it('returns one record per unique destination', () => {
      const items = portalNav.buildPortalNavItems(null, null);
      const flat = portalNav.flattenPortalNav(items);
      const hrefs = flat.map((t) => t.href);
      // Dedup invariant: no duplicate hrefs
      expect(new Set(hrefs).size).toBe(hrefs.length);
      // Top-level items appear
      expect(hrefs).toContain('/portal/dashboard');
      expect(hrefs).toContain('/portal/brain');
      // Deep-nested children appear
      expect(hrefs).toContain('/portal/brain/tasks');
      expect(hrefs).toContain('/portal/crm/contacts');
    });

    it('builds breadcrumbs from labels of ancestors', () => {
      const items = portalNav.buildPortalNavItems(null, null);
      const flat = portalNav.flattenPortalNav(items);
      const tasks = flat.find((t) => t.href === '/portal/brain/tasks');
      expect(tasks?.breadcrumb).toEqual(['Company Brain']);
      const root = flat.find((t) => t.href === '/portal/dashboard');
      expect(root?.breadcrumb).toEqual([]);
    });

    it('haystack contains lowercased label, breadcrumb, and keywords', () => {
      const items = portalNav.buildPortalNavItems(null, null);
      const flat = portalNav.flattenPortalNav(items);
      const tasks = flat.find((t) => t.href === '/portal/brain/tasks');
      expect(tasks?.haystack).toContain('tasks');
      expect(tasks?.haystack).toContain('kanban');
      expect(tasks?.haystack).toContain('company brain');
    });

    it('walks children of per-site branch when present', () => {
      const items = portalNav.buildPortalNavItems('s9', 'Demo');
      const flat = portalNav.flattenPortalNav(items);
      const hrefs = flat.map((t) => t.href);
      expect(hrefs).toContain('/portal/websites/s9');
      expect(hrefs).toContain('/portal/websites/s9/entries');
      expect(hrefs).toContain('/portal/websites/s9/store/products');
      const productsBreadcrumb = flat.find(
        (t) => t.href === '/portal/websites/s9/store/products',
      )?.breadcrumb;
      expect(productsBreadcrumb).toContain('Demo');
      expect(productsBreadcrumb).toContain('Store');
    });

    it('returns empty array on empty input', () => {
      expect(portalNav.flattenPortalNav([])).toEqual([]);
    });
  });
});

// ===========================================================================
// 3. lib/google/oauth.ts
// ===========================================================================

describe('lib/google/oauth', () => {
  const CREDS: import('@/lib/google/oauth').GoogleOAuthCredentials = {
    clientId: 'g-client',
    clientSecret: 'g-secret',
    redirectUri: 'https://app.example.com/cb',
  };

  describe('RefreshTokenInvalidError', () => {
    it('has the expected name + default message', () => {
      const e = new googleOauth.RefreshTokenInvalidError();
      expect(e.name).toBe('RefreshTokenInvalidError');
      expect(e.message).toContain('Refresh token is invalid');
    });

    it('supports a custom message', () => {
      const e = new googleOauth.RefreshTokenInvalidError('x');
      expect(e.message).toBe('x');
    });
  });

  describe('getEnvWorkspaceCredentials', () => {
    const originalEnv = process.env;
    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.GOOGLE_WORKSPACE_CLIENT_ID;
      delete process.env.GOOGLE_WORKSPACE_CLIENT_SECRET;
      delete process.env.GOOGLE_WORKSPACE_REDIRECT_URI;
    });
    afterEach(() => {
      process.env = originalEnv;
    });

    it('throws when any var is missing', () => {
      expect(() => googleOauth.getEnvWorkspaceCredentials()).toThrow(/env vars not configured/);
      process.env.GOOGLE_WORKSPACE_CLIENT_ID = 'a';
      expect(() => googleOauth.getEnvWorkspaceCredentials()).toThrow(/env vars not configured/);
      process.env.GOOGLE_WORKSPACE_CLIENT_SECRET = 'b';
      expect(() => googleOauth.getEnvWorkspaceCredentials()).toThrow(/env vars not configured/);
    });

    it('returns creds when all three vars are present', () => {
      process.env.GOOGLE_WORKSPACE_CLIENT_ID = 'cid';
      process.env.GOOGLE_WORKSPACE_CLIENT_SECRET = 'csec';
      process.env.GOOGLE_WORKSPACE_REDIRECT_URI = 'http://cb';
      expect(googleOauth.getEnvWorkspaceCredentials()).toEqual({
        clientId: 'cid',
        clientSecret: 'csec',
        redirectUri: 'http://cb',
      });
    });
  });

  describe('buildAuthUrl', () => {
    it('passes access_type=offline, prompt=consent, include_granted_scopes, scope, state', () => {
      mockGenerateAuthUrl.mockReturnValue('https://auth/url');
      const url = googleOauth.buildAuthUrl({
        credentials: CREDS,
        surfaces: ['gmail'],
        state: 'st',
      });
      expect(url).toBe('https://auth/url');
      expect(mockOAuth2Ctor).toHaveBeenCalledWith('g-client', 'g-secret', CREDS.redirectUri);
      const callArg = mockGenerateAuthUrl.mock.calls[0][0];
      expect(callArg.access_type).toBe('offline');
      expect(callArg.prompt).toBe('consent');
      expect(callArg.include_granted_scopes).toBe(true);
      expect(callArg.state).toBe('st');
      expect(callArg.scope).toContain('https://www.googleapis.com/auth/gmail.readonly');
      expect('login_hint' in callArg).toBe(false);
    });

    it('passes login_hint when provided', () => {
      mockGenerateAuthUrl.mockReturnValue('u');
      googleOauth.buildAuthUrl({
        credentials: CREDS,
        surfaces: [],
        state: 's',
        loginHint: 'me@x.com',
      });
      const callArg = mockGenerateAuthUrl.mock.calls[0][0];
      expect(callArg.login_hint).toBe('me@x.com');
    });
  });

  describe('exchangeCode', () => {
    it('returns tokens + userinfo on success', async () => {
      mockGetToken.mockResolvedValue({
        tokens: {
          access_token: 'at',
          refresh_token: 'rt',
          expiry_date: Date.now() + 3600_000,
          scope: 'openid email profile',
        },
      });
      mockUserinfoGet.mockResolvedValue({ data: { email: 'u@x.com', id: '123' } });

      const out = await googleOauth.exchangeCode('code', CREDS);
      expect(out.accessToken).toBe('at');
      expect(out.refreshToken).toBe('rt');
      expect(out.googleAccountEmail).toBe('u@x.com');
      expect(out.googleAccountId).toBe('123');
      expect(out.scopes).toEqual(['openid', 'email', 'profile']);
      expect(out.expiresAt).toBeInstanceOf(Date);
      expect(mockSetCredentials).toHaveBeenCalled();
    });

    it('handles non-string scope safely', async () => {
      mockGetToken.mockResolvedValue({
        tokens: {
          access_token: 'at',
          refresh_token: 'rt',
          expiry_date: Date.now() + 1000,
          scope: undefined,
        },
      });
      mockUserinfoGet.mockResolvedValue({ data: { email: 'a@b', id: '1' } });
      const out = await googleOauth.exchangeCode('c', CREDS);
      expect(out.scopes).toEqual([]);
    });

    it('throws when refresh_token missing', async () => {
      mockGetToken.mockResolvedValue({
        tokens: { access_token: 'at', expiry_date: Date.now() + 1000, scope: '' },
      });
      await expect(googleOauth.exchangeCode('c', CREDS)).rejects.toThrow(
        /No refresh token received/,
      );
    });

    it('throws when access_token missing', async () => {
      mockGetToken.mockResolvedValue({
        tokens: { refresh_token: 'rt', expiry_date: 1, scope: '' },
      });
      await expect(googleOauth.exchangeCode('c', CREDS)).rejects.toThrow(/incomplete tokens/);
    });

    it('throws when expiry_date missing', async () => {
      mockGetToken.mockResolvedValue({
        tokens: { access_token: 'at', refresh_token: 'rt', scope: '' },
      });
      await expect(googleOauth.exchangeCode('c', CREDS)).rejects.toThrow(/incomplete tokens/);
    });

    it('throws when userinfo missing email or id', async () => {
      mockGetToken.mockResolvedValue({
        tokens: {
          access_token: 'at',
          refresh_token: 'rt',
          expiry_date: Date.now() + 1000,
          scope: '',
        },
      });
      mockUserinfoGet.mockResolvedValue({ data: { email: null, id: null } });
      await expect(googleOauth.exchangeCode('c', CREDS)).rejects.toThrow(
        /userinfo did not return/,
      );
    });
  });

  describe('refreshIfExpired', () => {
    it('returns refreshed=false when not expiring soon', async () => {
      const conn = {
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date(Date.now() + 5 * 60_000),
      };
      const out = await googleOauth.refreshIfExpired(conn, CREDS);
      expect(out.refreshed).toBe(false);
      expect(out.accessToken).toBe('at');
      expect(out.refreshToken).toBe('rt');
    });

    it('refreshes when within skew window', async () => {
      mockRefreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: 'at-new',
          refresh_token: 'rt-new',
          expiry_date: Date.now() + 3600_000,
        },
      });
      const conn = {
        accessToken: 'at-old',
        refreshToken: 'rt-old',
        expiresAt: new Date(Date.now() + 5_000),
      };
      const out = await googleOauth.refreshIfExpired(conn, CREDS);
      expect(out.refreshed).toBe(true);
      expect(out.accessToken).toBe('at-new');
      expect(out.refreshToken).toBe('rt-new');
    });

    it('refreshed token is undefined when google omits it', async () => {
      mockRefreshAccessToken.mockResolvedValue({
        credentials: { access_token: 'at-new', expiry_date: Date.now() + 1000 },
      });
      const conn = {
        accessToken: 'at-old',
        refreshToken: 'rt-old',
        expiresAt: new Date(Date.now() + 5_000),
      };
      const out = await googleOauth.refreshIfExpired(conn, CREDS);
      expect(out.refreshToken).toBeUndefined();
    });

    it('throws when refresh response missing access_token', async () => {
      mockRefreshAccessToken.mockResolvedValue({
        credentials: { expiry_date: Date.now() + 1000 },
      });
      const conn = {
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: new Date(Date.now() + 5_000),
      };
      await expect(googleOauth.refreshIfExpired(conn, CREDS)).rejects.toThrow(
        /missing access_token/,
      );
    });

    it('maps invalid_grant to RefreshTokenInvalidError', async () => {
      mockRefreshAccessToken.mockRejectedValue({
        response: { data: { error: 'invalid_grant' } },
      });
      const conn = {
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: new Date(Date.now() + 5_000),
      };
      await expect(googleOauth.refreshIfExpired(conn, CREDS)).rejects.toBeInstanceOf(
        googleOauth.RefreshTokenInvalidError,
      );
    });

    it('rethrows non-invalid_grant errors', async () => {
      const err = new Error('boom');
      mockRefreshAccessToken.mockRejectedValue(err);
      const conn = {
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: new Date(Date.now() + 5_000),
      };
      await expect(googleOauth.refreshIfExpired(conn, CREDS)).rejects.toBe(err);
    });
  });

  describe('revoke', () => {
    it('returns revoked=true on success', async () => {
      mockRevokeToken.mockResolvedValue(undefined);
      const out = await googleOauth.revoke('tok', CREDS);
      expect(out).toEqual({ revoked: true });
      expect(mockRevokeToken).toHaveBeenCalledWith('tok');
    });

    it('treats already-revoked invalid_token as success', async () => {
      mockRevokeToken.mockRejectedValue({
        response: { status: 400, data: { error: 'invalid_token' } },
      });
      const out = await googleOauth.revoke('tok', CREDS);
      expect(out).toEqual({ revoked: true, alreadyRevoked: true });
    });

    it('rethrows other failures', async () => {
      const err = { response: { status: 500, data: {} } };
      mockRevokeToken.mockRejectedValue(err);
      await expect(googleOauth.revoke('tok', CREDS)).rejects.toBe(err);
    });
  });
});

// ===========================================================================
// 4. lib/microsoft/transcripts-fetch.ts
// ===========================================================================

describe('lib/microsoft/transcripts-fetch', () => {
  describe('vttToPlainText', () => {
    const fn = transcriptsFetch.vttToPlainText;

    it('returns empty string on bare WEBVTT header', () => {
      expect(fn('WEBVTT\n')).toBe('');
    });

    it('extracts a single speaker-tagged cue', () => {
      const vtt = [
        'WEBVTT',
        '',
        '00:00:01.234 --> 00:00:05.678',
        '<v Jane Doe>Hello, how are you?</v>',
        '',
      ].join('\n');
      expect(fn(vtt)).toBe('Jane Doe: Hello, how are you?');
    });

    it('handles a cue identifier line before the timing line', () => {
      const vtt = [
        'WEBVTT',
        '',
        'cue-1',
        '00:00:01.000 --> 00:00:02.000',
        '<v Bob>Hi.</v>',
        '',
      ].join('\n');
      expect(fn(vtt)).toBe('Bob: Hi.');
    });

    it('joins multi-line cue payloads with a space', () => {
      const vtt = [
        'WEBVTT',
        '',
        '00:00:00.000 --> 00:00:01.000',
        '<v Alice>line one',
        'line two</v>',
        '',
      ].join('\n');
      expect(fn(vtt)).toBe('Alice: line one line two');
    });

    it('handles cues without a closing </v>', () => {
      const vtt = [
        'WEBVTT',
        '',
        '00:00:00.000 --> 00:00:01.000',
        '<v Bob>just text',
        '',
      ].join('\n');
      expect(fn(vtt)).toBe('Bob: just text');
    });

    it('skips cues with no speaker tag and emits plain text', () => {
      const vtt = [
        'WEBVTT',
        '',
        '00:00:00.000 --> 00:00:01.000',
        'unattributed line',
        '',
      ].join('\n');
      expect(fn(vtt)).toBe('unattributed line');
    });

    it('skips NOTE blocks', () => {
      const vtt = [
        'WEBVTT',
        '',
        'NOTE this is metadata',
        'which continues here',
        '',
        '00:00:00.000 --> 00:00:01.000',
        '<v X>kept</v>',
        '',
      ].join('\n');
      expect(fn(vtt)).toBe('X: kept');
    });

    it('skips STYLE and REGION blocks', () => {
      const vtt = [
        'WEBVTT',
        '',
        'STYLE',
        '::cue { color: red }',
        '',
        'REGION',
        'id:foo',
        '',
        '00:00:00.000 --> 00:00:01.000',
        '<v A>ok</v>',
        '',
      ].join('\n');
      expect(fn(vtt)).toBe('A: ok');
    });

    it('skips malformed cues missing the timing line', () => {
      const vtt = [
        'WEBVTT',
        '',
        'orphan-line-no-timing',
        '',
      ].join('\n');
      expect(fn(vtt)).toBe('');
    });

    it('drops empty payload cues', () => {
      const vtt = [
        'WEBVTT',
        '',
        '00:00:00.000 --> 00:00:01.000',
        '',
      ].join('\n');
      expect(fn(vtt)).toBe('');
    });

    it('strips inline tags inside payload', () => {
      const vtt = [
        'WEBVTT',
        '',
        '00:00:00.000 --> 00:00:01.000',
        '<v Bob><i>italic</i> word</v>',
        '',
      ].join('\n');
      expect(fn(vtt)).toBe('Bob: italic word');
    });
  });

  describe('fetchTeamsTranscript', () => {
    const CONN = { accessToken: 'at', refreshToken: 'rt', expiresAt: new Date() };
    const CREDS = {
      clientId: 'c',
      clientSecret: 's',
      tenant: 'common',
      redirectUri: 'http://cb',
    };

    it('returns parsed transcript + metadata when both calls succeed', async () => {
      mockGraphCall.mockResolvedValue({
        data: {
          id: 'mid',
          subject: '  Standup  ',
          startDateTime: '2026-01-01T10:00:00Z',
          endDateTime: '2026-01-01T10:30:00Z',
          joinWebUrl: 'https://teams/join',
          participants: {
            organizer: { identity: { user: { id: 'oid-org', displayName: 'Alice' } } },
            attendees: [
              { identity: { user: { id: 'oid-att', displayName: 'Bob' } } },
              { identity: { user: { displayName: 'Alice' } } }, // dup name — dedup
            ],
          },
        },
        refreshed: true,
        connection: { accessToken: 'new-at', refreshToken: 'rt', expiresAt: new Date() },
      });

      const vtt = [
        'WEBVTT',
        '',
        '00:00:00.000 --> 00:00:01.000',
        '<v Alice>hi</v>',
        '',
      ].join('\n');
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(vtt, { status: 200 })),
      );

      const out = await transcriptsFetch.fetchTeamsTranscript({
        connection: CONN,
        credentials: CREDS,
        userOid: 'user@1',
        meetingId: 'mid-1',
        transcriptId: 'tid-1',
      });

      expect(out.meetingId).toBe('mid-1');
      expect(out.transcriptId).toBe('tid-1');
      expect(out.meetingSubject).toBe('Standup');
      expect(out.meetingStart).toBeInstanceOf(Date);
      expect(out.meetingEnd).toBeInstanceOf(Date);
      expect(out.joinWebUrl).toBe('https://teams/join');
      expect(out.participants.map((p) => p.name)).toEqual(['Alice', 'Bob']);
      expect(out.transcript).toBe('Alice: hi');
      expect(out.vtt).toBe(vtt);
      expect(out.refreshed).toBe(true);
      expect(out.connection.accessToken).toBe('new-at');
    });

    it('uses fallback subject when meta.subject is missing/blank', async () => {
      mockGraphCall.mockResolvedValue({
        data: { id: 'mid', subject: '   ' },
        refreshed: false,
        connection: CONN,
      });
      vi.stubGlobal('fetch', vi.fn(async () => new Response('WEBVTT\n', { status: 200 })));
      const out = await transcriptsFetch.fetchTeamsTranscript({
        connection: CONN,
        credentials: CREDS,
        userOid: 'u',
        meetingId: 'm',
        transcriptId: 't',
      });
      expect(out.meetingSubject).toBe('(Untitled Teams meeting)');
      expect(out.meetingStart).toBeNull();
      expect(out.meetingEnd).toBeNull();
      expect(out.joinWebUrl).toBeNull();
      expect(out.participants).toEqual([]);
    });

    it('returns null for invalid ISO date strings', async () => {
      mockGraphCall.mockResolvedValue({
        data: { id: 'mid', startDateTime: 'not-a-date', endDateTime: 'also-bad' },
        refreshed: false,
        connection: CONN,
      });
      vi.stubGlobal('fetch', vi.fn(async () => new Response('WEBVTT\n', { status: 200 })));
      const out = await transcriptsFetch.fetchTeamsTranscript({
        connection: CONN,
        credentials: CREDS,
        userOid: 'u',
        meetingId: 'm',
        transcriptId: 't',
      });
      expect(out.meetingStart).toBeNull();
      expect(out.meetingEnd).toBeNull();
    });

    it('throws when transcript content fetch fails', async () => {
      mockGraphCall.mockResolvedValue({
        data: { id: 'mid' },
        refreshed: false,
        connection: CONN,
      });
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('forbidden', { status: 403 })),
      );
      await expect(
        transcriptsFetch.fetchTeamsTranscript({
          connection: CONN,
          credentials: CREDS,
          userOid: 'u',
          meetingId: 'm',
          transcriptId: 't',
        }),
      ).rejects.toThrow(/Graph transcript content fetch failed \(403\)/);
    });

    it('URL-encodes the userOid, meetingId, transcriptId in the content URL', async () => {
      mockGraphCall.mockResolvedValue({
        data: { id: 'mid' },
        refreshed: false,
        connection: CONN,
      });
      const fetchSpy = vi.fn(async () => new Response('WEBVTT\n', { status: 200 }));
      vi.stubGlobal('fetch', fetchSpy);
      await transcriptsFetch.fetchTeamsTranscript({
        connection: CONN,
        credentials: CREDS,
        userOid: 'user space/1',
        meetingId: 'meet#1',
        transcriptId: 't?1',
      });
      const calledUrl = String(fetchSpy.mock.calls[0][0]);
      expect(calledUrl).toContain('user%20space%2F1');
      expect(calledUrl).toContain('meet%231');
      expect(calledUrl).toContain('t%3F1');
      expect(calledUrl).toContain('$format=text/vtt');
    });

    it('skips participants without name or id', async () => {
      mockGraphCall.mockResolvedValue({
        data: {
          id: 'm',
          participants: {
            attendees: [
              { identity: { user: {} } }, // no name, no id → skipped
              { identity: { user: { displayName: 'Real' } } },
            ],
          },
        },
        refreshed: false,
        connection: CONN,
      });
      vi.stubGlobal('fetch', vi.fn(async () => new Response('WEBVTT\n', { status: 200 })));
      const out = await transcriptsFetch.fetchTeamsTranscript({
        connection: CONN,
        credentials: CREDS,
        userOid: 'u',
        meetingId: 'm',
        transcriptId: 't',
      });
      expect(out.participants).toEqual([{ name: 'Real' }]);
    });
  });
});
