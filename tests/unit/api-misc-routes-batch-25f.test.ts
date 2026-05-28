// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 25f):
 *   - app/api/portal/branding/defaults/route.ts   (GET)
 *   - app/api/portal/sign-out/route.ts            (POST)
 *   - app/api/portal/switch-client/route.ts       (POST)
 *   - app/api/cron/expire-mcp-pendings/route.ts   (GET / POST)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
const getPortalClientsMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
  getPortalClients: (...args: unknown[]) => getPortalClientsMock(...args),
}));

const getBrandDefaultsMock = vi.fn();
vi.mock('@/lib/branding', () => ({
  getBrandDefaults: (...args: unknown[]) => getBrandDefaultsMock(...args),
}));

vi.mock('@/lib/active-client', () => ({
  COOKIE_NAME: 'sd-active-client',
}));

const expireStalePendingsMock = vi.fn();
vi.mock('@/lib/mcp/expire-pending', () => ({
  expireStalePendings: (...args: unknown[]) => expireStalePendingsMock(...args),
}));

// ---- modules under test (imported AFTER mocks) ----
const brandingDefaultsRoute = await import('@/app/api/portal/branding/defaults/route');
const signOutRoute = await import('@/app/api/portal/sign-out/route');
const switchClientRoute = await import('@/app/api/portal/switch-client/route');
const expireMcpPendingsRoute = await import('@/app/api/cron/expire-mcp-pendings/route');

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

const SESSION = { user: { id: '7', name: 'Bob' } };

const originalNodeEnv = process.env.NODE_ENV;
const originalCronSecret = process.env.CRON_SECRET;

beforeEach(() => {
  authMock.mockReset();
  getPortalClientMock.mockReset();
  getPortalClientsMock.mockReset();
  getBrandDefaultsMock.mockReset();
  expireStalePendingsMock.mockReset();
  // Default to development environment so cookies on sign-out behave predictably
  process.env.NODE_ENV = 'development';
  delete process.env.CRON_SECRET;
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalCronSecret === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = originalCronSecret;
  }
});

// ===========================================================================
// portal/branding/defaults
// ===========================================================================

describe('GET /api/portal/branding/defaults', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await brandingDefaultsRoute.GET(
      makeReq('http://x/api/portal/branding/defaults'),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Unauthorized');
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await brandingDefaultsRoute.GET(
      makeReq('http://x/api/portal/branding/defaults'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await brandingDefaultsRoute.GET(
      makeReq('http://x/api/portal/branding/defaults'),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/Client not found/);
  });

  it('returns brand defaults for client with no profileId', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    const defaults = { tone: 'friendly', voice: 'casual' };
    getBrandDefaultsMock.mockResolvedValue(defaults);
    const res = await brandingDefaultsRoute.GET(
      makeReq('http://x/api/portal/branding/defaults'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(defaults);
    expect(getBrandDefaultsMock).toHaveBeenCalledWith({
      clientId: 42,
      brandingProfileId: null,
    });
  });

  it('passes parsed profileId through to getBrandDefaults', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 10 });
    getBrandDefaultsMock.mockResolvedValue({});
    const res = await brandingDefaultsRoute.GET(
      makeReq('http://x/api/portal/branding/defaults?profileId=99'),
    );
    expect(res.status).toBe(200);
    expect(getBrandDefaultsMock).toHaveBeenCalledWith({
      clientId: 10,
      brandingProfileId: 99,
    });
  });

  it('treats non-numeric profileId as null', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 10 });
    getBrandDefaultsMock.mockResolvedValue({});
    const res = await brandingDefaultsRoute.GET(
      makeReq('http://x/api/portal/branding/defaults?profileId=not-a-number'),
    );
    expect(res.status).toBe(200);
    expect(getBrandDefaultsMock).toHaveBeenCalledWith({
      clientId: 10,
      brandingProfileId: null,
    });
  });

  it('returns 500 when getBrandDefaults throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    getBrandDefaultsMock.mockRejectedValue(new Error('boom'));
    const res = await brandingDefaultsRoute.GET(
      makeReq('http://x/api/portal/branding/defaults'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('boom');
    consoleSpy.mockRestore();
  });

  it('returns 500 with generic message when caught value is not an Error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    getBrandDefaultsMock.mockRejectedValue('plain string');
    const res = await brandingDefaultsRoute.GET(
      makeReq('http://x/api/portal/branding/defaults'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('Failed to load brand defaults');
    consoleSpy.mockRestore();
  });

  it('parses user id from session string into integer', async () => {
    authMock.mockResolvedValue({ user: { id: '321' } });
    getPortalClientMock.mockResolvedValue({ id: 1 });
    getBrandDefaultsMock.mockResolvedValue({});
    await brandingDefaultsRoute.GET(makeReq('http://x/api/portal/branding/defaults'));
    expect(getPortalClientMock).toHaveBeenCalledWith(321);
  });
});

// ===========================================================================
// portal/sign-out
// ===========================================================================

describe('POST /api/portal/sign-out', () => {
  it('returns success and clears all auth cookies on the bare domain in development', async () => {
    process.env.NODE_ENV = 'development';
    const res = await signOutRoute.POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const setCookies = res.headers.getSetCookie?.() ?? [];
    // In dev: only bare domain set (no wildcard); 6 cookie names cleared.
    // (Some Next versions also might collapse them; just assert the well-known ones are present)
    const joined = setCookies.join('\n');
    expect(joined).toContain('authjs.session-token=');
    expect(joined).toContain('authjs.csrf-token=');
    expect(joined).toContain('authjs.callback-url=');
    expect(joined).toContain('sd-active-client=');
    // Wildcard domain set is production-only
    expect(joined).not.toContain('Domain=.simplerdevelopment.com');
  });

  it('uses Secure prefix names and writes wildcard cookies in production', async () => {
    process.env.NODE_ENV = 'production';
    const res = await signOutRoute.POST();
    expect(res.status).toBe(200);

    const setCookies = res.headers.getSetCookie?.() ?? [];
    const joined = setCookies.join('\n');
    // Production: secure-prefixed names
    expect(joined).toContain('__Secure-authjs.session-token=');
    expect(joined).toContain('__Secure-authjs.csrf-token=');
    // wildcard-domain clears
    expect(joined).toMatch(/Domain=\.?simplerdevelopment\.com/);
  });

  it('returns expired-cookie headers with epoch expiry', async () => {
    process.env.NODE_ENV = 'development';
    const res = await signOutRoute.POST();
    const setCookies = res.headers.getSetCookie?.() ?? [];
    const joined = setCookies.join('\n');
    // Expires=Thu, 01 Jan 1970 00:00:00 GMT
    expect(joined).toMatch(/Expires=/);
    expect(joined).toMatch(/01 Jan 1970/);
  });
});

// ===========================================================================
// portal/switch-client
// ===========================================================================

describe('POST /api/portal/switch-client', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await switchClientRoute.POST(
      makeReq('http://x/api/portal/switch-client', {
        method: 'POST',
        body: JSON.stringify({ clientId: 1 }),
      }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 when clientId is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    const res = await switchClientRoute.POST(
      makeReq('http://x/api/portal/switch-client', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/clientId is required/);
  });

  it('returns 400 when clientId is not a number', async () => {
    authMock.mockResolvedValue(SESSION);
    const res = await switchClientRoute.POST(
      makeReq('http://x/api/portal/switch-client', {
        method: 'POST',
        body: JSON.stringify({ clientId: 'abc' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 403 when target client is not in user\'s allowed list', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientsMock.mockResolvedValue([
      { id: 1, company: 'Alpha' },
      { id: 2, company: 'Beta' },
    ]);
    const res = await switchClientRoute.POST(
      makeReq('http://x/api/portal/switch-client', {
        method: 'POST',
        body: JSON.stringify({ clientId: 999 }),
      }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Access denied');
  });

  it('returns activeClientId + company and sets cookie when target client is allowed', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientsMock.mockResolvedValue([
      { id: 1, company: 'Alpha' },
      { id: 2, company: 'Beta Co' },
    ]);
    const res = await switchClientRoute.POST(
      makeReq('http://x/api/portal/switch-client', {
        method: 'POST',
        body: JSON.stringify({ clientId: 2 }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activeClientId).toBe(2);
    expect(body.company).toBe('Beta Co');

    // cookie set
    const setCookies = res.headers.getSetCookie?.() ?? [];
    const joined = setCookies.join('\n');
    expect(joined).toContain('sd-active-client=2');
    expect(joined).toContain('HttpOnly');
    expect(joined).toMatch(/Path=\//);
  });

  it('parses user id from session string when looking up clients', async () => {
    authMock.mockResolvedValue({ user: { id: '15' } });
    getPortalClientsMock.mockResolvedValue([{ id: 8, company: 'X' }]);
    await switchClientRoute.POST(
      makeReq('http://x/api/portal/switch-client', {
        method: 'POST',
        body: JSON.stringify({ clientId: 8 }),
      }),
    );
    expect(getPortalClientsMock).toHaveBeenCalledWith(15);
  });
});

// ===========================================================================
// cron/expire-mcp-pendings
// ===========================================================================

describe('GET /api/cron/expire-mcp-pendings', () => {
  it('returns 401 when CRON_SECRET is unset and no vercel-cron header', async () => {
    const res = await expireMcpPendingsRoute.GET(
      makeReq('http://x/api/cron/expire-mcp-pendings'),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Unauthorized');
    expect(expireStalePendingsMock).not.toHaveBeenCalled();
  });

  it('returns 401 when bearer token does not match CRON_SECRET', async () => {
    process.env.CRON_SECRET = 'secret-abc';
    const res = await expireMcpPendingsRoute.GET(
      makeReq('http://x/api/cron/expire-mcp-pendings', {
        headers: { authorization: 'Bearer wrong' },
      }),
    );
    expect(res.status).toBe(401);
    expect(expireStalePendingsMock).not.toHaveBeenCalled();
  });

  it('runs expiration when bearer matches CRON_SECRET', async () => {
    process.env.CRON_SECRET = 'secret-abc';
    expireStalePendingsMock.mockResolvedValue({ expired: 3, scannedIds: [1, 2, 3] });
    const res = await expireMcpPendingsRoute.GET(
      makeReq('http://x/api/cron/expire-mcp-pendings', {
        headers: { authorization: 'Bearer secret-abc' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.expired).toBe(3);
    expect(body.scannedIds).toEqual([1, 2, 3]);
    expect(expireStalePendingsMock).toHaveBeenCalledWith({
      ttlSeconds: undefined,
      ids: undefined,
    });
  });

  it('runs expiration when x-vercel-cron header is "1" (no bearer required)', async () => {
    expireStalePendingsMock.mockResolvedValue({ expired: 0 });
    const res = await expireMcpPendingsRoute.GET(
      makeReq('http://x/api/cron/expire-mcp-pendings', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    expect(expireStalePendingsMock).toHaveBeenCalled();
  });

  it('parses ttlSeconds and ids from query params', async () => {
    expireStalePendingsMock.mockResolvedValue({ expired: 1 });
    const res = await expireMcpPendingsRoute.GET(
      makeReq(
        'http://x/api/cron/expire-mcp-pendings?ttlSeconds=600&ids=1,2,3,not-a-number,4',
        { headers: { 'x-vercel-cron': '1' } },
      ),
    );
    expect(res.status).toBe(200);
    expect(expireStalePendingsMock).toHaveBeenCalledWith({
      ttlSeconds: 600,
      ids: [1, 2, 3, 4], // non-numeric filtered out
    });
  });

  it('treats non-numeric ttlSeconds as undefined', async () => {
    expireStalePendingsMock.mockResolvedValue({ expired: 0 });
    const res = await expireMcpPendingsRoute.GET(
      makeReq('http://x/api/cron/expire-mcp-pendings?ttlSeconds=banana', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    expect(expireStalePendingsMock).toHaveBeenCalledWith({
      ttlSeconds: undefined,
      ids: undefined,
    });
  });

  it('POST is an alias for GET (same handler reference)', () => {
    expect(expireMcpPendingsRoute.POST).toBe(expireMcpPendingsRoute.GET);
  });

  it('exposes dynamic + runtime config', () => {
    expect(expireMcpPendingsRoute.dynamic).toBe('force-dynamic');
    expect(expireMcpPendingsRoute.runtime).toBe('nodejs');
  });
});
