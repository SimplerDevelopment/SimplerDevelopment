// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 23a):
 *   - app/api/portal/media/route.ts            (GET)
 *   - app/api/cron/usage-rollup/route.ts       (GET)
 *   - app/api/portal/branding/audit/route.ts   (POST)
 *   - app/api/portal/agency/chrome/route.ts    (GET)
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
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const authorizePortalMock = vi.fn();
const isAuthErrorMock = vi.fn((r: unknown) => Boolean(r && typeof r === 'object' && 'response' in (r as Record<string, unknown>)));
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (r: unknown) => isAuthErrorMock(r),
}));

const headersMock = vi.fn();
vi.mock('next/headers', () => ({
  headers: () => headersMock(),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  like: (a: unknown, b: unknown) => ({ op: 'like', a, b }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => ({
    __sql: strings.join('?'),
    vals,
  }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
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
  return new Proxy({
    media: wrap('media'),
    brandingProfiles: wrap('brandingProfiles'),
    brandingMessaging: wrap('brandingMessaging'),
    clients: wrap('clients'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// Branding audit + messaging helpers
const auditBrandingMock = vi.fn();
vi.mock('@/lib/branding/audit', () => ({
  auditBranding: (...args: unknown[]) => auditBrandingMock(...args),
}));
const messagingRowToContextMock = vi.fn();
vi.mock('@/lib/branding/block-defaults', () => ({
  messagingRowToContext: (...args: unknown[]) => messagingRowToContextMock(...args),
}));

// Usage-rollup billing helpers
const rollupClientPeriodMock = vi.fn();
const listClientsWithActiveMeteredItemsMock = vi.fn();
const currentPeriodUtcMock = vi.fn();
vi.mock('@/lib/billing/usage-rollup', () => ({
  rollupClientPeriod: (...args: unknown[]) => rollupClientPeriodMock(...args),
  listClientsWithActiveMeteredItems: (...args: unknown[]) =>
    listClientsWithActiveMeteredItemsMock(...args),
  currentPeriodUtc: (...args: unknown[]) => currentPeriodUtcMock(...args),
}));

// ---------------------------------------------------------------------------
// DB mock: thenable chain that materializes from a select queue.
// ---------------------------------------------------------------------------

let selectQueue: Array<Array<Record<string, unknown>>> = [];

function shiftNext(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) materializedPromise = Promise.resolve(shiftNext());
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'groupBy']) {
      chain[m] = passthrough;
    }
    const terminalChain = () => {
      materialize();
      const term: Record<string, unknown> = {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
        limit: () => term,
        offset: () => term,
      };
      return term;
    };
    chain.limit = terminalChain;
    chain.offset = terminalChain;
    chain.orderBy = terminalChain;
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  return {
    db: {
      select() {
        return buildSelect();
      },
    },
  };
});

// ---- modules under test ----
const mediaRoute = await import('@/app/api/portal/media/route');
const usageRollupRoute = await import('@/app/api/cron/usage-rollup/route');
const brandingAuditRoute = await import('@/app/api/portal/branding/audit/route');
const agencyChromeRoute = await import('@/app/api/portal/agency/chrome/route');

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

const SESSION = { user: { id: '7', name: 'Bob' } };

beforeEach(() => {
  selectQueue = [];
  authMock.mockReset();
  getPortalClientMock.mockReset();
  authorizePortalMock.mockReset();
  headersMock.mockReset();
  auditBrandingMock.mockReset();
  messagingRowToContextMock.mockReset();
  rollupClientPeriodMock.mockReset();
  listClientsWithActiveMeteredItemsMock.mockReset();
  currentPeriodUtcMock.mockReset();
});

// ===========================================================================
// GET /api/portal/media
// ===========================================================================

describe('GET /api/portal/media', () => {
  it('returns 401 without a session', async () => {
    authorizePortalMock.mockResolvedValue({
      response: new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), { status: 401 }),
    });
    const res = await mediaRoute.GET(makeReq('http://x/api/portal/media'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client cannot be resolved', async () => {
    authorizePortalMock.mockResolvedValue({
      response: new Response(JSON.stringify({ success: false, message: 'Client not found' }), { status: 404 }),
    });
    const res = await mediaRoute.GET(makeReq('http://x/api/portal/media'));
    expect(res.status).toBe(404);
  });

  it('returns media + branding profiles + pagination total', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'admin' });
    // 1: branding profiles, 2: media rows, 3: count
    selectQueue.push([{ id: 1, name: 'Default' }]);
    selectQueue.push([
      { id: 10, filename: 'a.png', mimeType: 'image/png' },
      { id: 11, filename: 'b.jpg', mimeType: 'image/jpeg' },
    ]);
    selectQueue.push([{ count: 2 }]);
    const res = await mediaRoute.GET(makeReq('http://x/api/portal/media'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.brandingProfiles).toEqual([{ id: 1, name: 'Default' }]);
    expect(body.pagination).toEqual({ limit: 20, offset: 0, total: 2 });
  });

  it('honors search + mimeType + brandingProfileId=unassigned filters', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'admin' });
    selectQueue.push([]); // profiles
    selectQueue.push([]); // media
    selectQueue.push([{ count: 0 }]); // count
    const res = await mediaRoute.GET(
      makeReq(
        'http://x/api/portal/media?search=hero&mimeType=image&brandingProfileId=unassigned&limit=5&offset=10',
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination).toEqual({ limit: 5, offset: 10, total: 0 });
  });

  it('honors a specific brandingProfileId filter', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'admin' });
    selectQueue.push([]);
    selectQueue.push([]);
    selectQueue.push([{ count: 0 }]);
    const res = await mediaRoute.GET(
      makeReq('http://x/api/portal/media?brandingProfileId=42&mimeType=all'),
    );
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// GET /api/cron/usage-rollup
// ===========================================================================

describe('GET /api/cron/usage-rollup', () => {
  const ORIGINAL = process.env.CRON_SECRET;
  beforeEach(() => {
    delete process.env.CRON_SECRET;
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL;
  });

  it('returns 401 when CRON_SECRET is set and auth header is wrong', async () => {
    process.env.CRON_SECRET = 'expected';
    const res = await usageRollupRoute.GET(
      makeReq('http://x/api/cron/usage-rollup', {
        headers: { authorization: 'Bearer nope' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('allows the request through when no CRON_SECRET and no vercel header', async () => {
    currentPeriodUtcMock.mockReturnValue('2026-05');
    listClientsWithActiveMeteredItemsMock.mockResolvedValue([]);
    const res = await usageRollupRoute.GET(
      makeReq('http://x/api/cron/usage-rollup'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.period).toBe('2026-05');
    expect(body.data.totalClients).toBe(0);
  });

  it('rejects an invalid period format', async () => {
    const res = await usageRollupRoute.GET(
      makeReq('http://x/api/cron/usage-rollup?period=not-a-month'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/Invalid period/);
  });

  it('rolls up each client and counts ok/err appropriately', async () => {
    listClientsWithActiveMeteredItemsMock.mockResolvedValue([1, 2, 3]);
    // client 1: clean
    rollupClientPeriodMock.mockResolvedValueOnce([{ resource: 'a', total: 10 }]);
    // client 2: stripe failure flagged on a row
    rollupClientPeriodMock.mockResolvedValueOnce([{ resource: 'b', error: 'stripe' }]);
    // client 3: rejection thrown
    rollupClientPeriodMock.mockRejectedValueOnce(new Error('boom'));
    const res = await usageRollupRoute.GET(
      makeReq('http://x/api/cron/usage-rollup?period=2026-04'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.period).toBe('2026-04');
    expect(body.data.totalClients).toBe(3);
    expect(body.data.ok).toBe(1);
    expect(body.data.err).toBe(2);
    expect(body.data.perClient).toHaveLength(3);
    expect(body.data.perClient[2].error).toBe('boom');
  });

  it('treats dryRun=1 stripe-error rows as ok (no push attempted)', async () => {
    listClientsWithActiveMeteredItemsMock.mockResolvedValue([1]);
    rollupClientPeriodMock.mockResolvedValueOnce([{ resource: 'b', error: 'would' }]);
    const res = await usageRollupRoute.GET(
      makeReq('http://x/api/cron/usage-rollup?period=2026-04&dryRun=1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.dryRun).toBe(true);
    expect(body.data.ok).toBe(1);
    expect(body.data.err).toBe(0);
    expect(rollupClientPeriodMock).toHaveBeenCalledWith(1, '2026-04', { dryRun: true });
  });

  it('passes through with x-vercel-cron header even when CRON_SECRET is set', async () => {
    process.env.CRON_SECRET = 'expected';
    listClientsWithActiveMeteredItemsMock.mockResolvedValue([]);
    currentPeriodUtcMock.mockReturnValue('2026-05');
    const res = await usageRollupRoute.GET(
      makeReq('http://x/api/cron/usage-rollup', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// POST /api/portal/branding/audit
// ===========================================================================

describe('POST /api/portal/branding/audit', () => {
  function req(body: unknown) {
    return makeReq('http://x/api/portal/branding/audit', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await brandingAuditRoute.POST(req({ profileId: 1 }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when no portal client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await brandingAuditRoute.POST(req({ profileId: 1 }));
    expect(res.status).toBe(404);
  });

  it('returns 400 when profileId is missing or not numeric', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await brandingAuditRoute.POST(req({ profileId: 'abc' }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/profileId/);
  });

  it('returns 404 when profile is not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // profile lookup
    const res = await brandingAuditRoute.POST(req({ profileId: 5 }));
    expect(res.status).toBe(404);
  });

  it('returns an audit report; falls back to default messaging when profile-scoped is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([
      {
        id: 5,
        name: 'Brand',
        primaryColor: '#fff',
        secondaryColor: null,
        accentColor: null,
        backgroundColor: null,
        textColor: null,
        navBackground: null,
        navTextColor: null,
        linkColor: null,
        headingFont: null,
        bodyFont: null,
        logoUrl: null,
        logoSquareUrl: null,
        logoRectUrl: null,
        logoIconUrl: null,
        faviconUrl: null,
        ogImageUrl: null,
        buttonStyle: null,
      },
    ]);
    selectQueue.push([]); // profile-scoped messaging -> empty
    selectQueue.push([{ id: 9, tagline: 'fallback' }]); // default messaging
    messagingRowToContextMock.mockReturnValue({ tagline: 'fallback' });
    auditBrandingMock.mockReturnValue({ score: 80, issues: [] });
    const res = await brandingAuditRoute.POST(req({ profileId: 5 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, report: { score: 80, issues: [] } });
    expect(auditBrandingMock).toHaveBeenCalledTimes(1);
    expect(messagingRowToContextMock).toHaveBeenCalledWith({ id: 9, tagline: 'fallback' });
  });

  it('returns 500 when JSON body cannot be parsed', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await brandingAuditRoute.POST(req('not-json'));
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });
});

// ===========================================================================
// GET /api/portal/agency/chrome
// ===========================================================================

describe('GET /api/portal/agency/chrome', () => {
  function fakeHeaders(map: Record<string, string>) {
    return {
      get: (k: string) => map[k.toLowerCase()] ?? null,
    };
  }

  it('returns empty payload when no header hint and no session', async () => {
    headersMock.mockReturnValue(fakeHeaders({}));
    authMock.mockResolvedValue(null);
    const res = await agencyChromeRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.whiteLabelEnabled).toBe(false);
    expect(body.data.agencyName).toBeNull();
  });

  it('resolves clientId from x-agency-client-id header and returns white-label payload', async () => {
    headersMock.mockReturnValue(fakeHeaders({ 'x-agency-client-id': '42' }));
    selectQueue.push([
      {
        whiteLabelEnabled: true,
        agencyName: 'Acme Agency',
        agencyLogoUrl: 'https://acme.test/logo.png',
        agencyPrimaryColor: '#ff0000',
      },
    ]);
    const res = await agencyChromeRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.whiteLabelEnabled).toBe(true);
    expect(body.data.agencyName).toBe('Acme Agency');
    expect(body.data.agencyPrimaryColor).toBe('#ff0000');
  });

  it('returns empty payload when row exists but white-label flag is off', async () => {
    headersMock.mockReturnValue(fakeHeaders({ 'x-agency-client-id': '42' }));
    selectQueue.push([
      {
        whiteLabelEnabled: false,
        agencyName: 'Hidden',
        agencyLogoUrl: null,
        agencyPrimaryColor: null,
      },
    ]);
    const res = await agencyChromeRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.whiteLabelEnabled).toBe(false);
    expect(body.data.agencyName).toBeNull();
  });

  it('falls back to session-derived client when no header hint is present', async () => {
    headersMock.mockReturnValue(fakeHeaders({}));
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 77 });
    selectQueue.push([
      {
        whiteLabelEnabled: true,
        agencyName: 'Session Agency',
        agencyLogoUrl: null,
        agencyPrimaryColor: null,
      },
    ]);
    const res = await agencyChromeRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.agencyName).toBe('Session Agency');
  });

  it('survives headers() throwing and still falls back to session', async () => {
    headersMock.mockImplementation(() => {
      throw new Error('outside request context');
    });
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 77 });
    selectQueue.push([
      {
        whiteLabelEnabled: true,
        agencyName: 'Recovered',
        agencyLogoUrl: null,
        agencyPrimaryColor: null,
      },
    ]);
    const res = await agencyChromeRoute.GET();
    expect(res.status).toBe(200);
    expect((await res.json()).data.agencyName).toBe('Recovered');
  });

  it('ignores an invalid (non-numeric) x-agency-client-id', async () => {
    headersMock.mockReturnValue(fakeHeaders({ 'x-agency-client-id': 'abc' }));
    authMock.mockResolvedValue(null);
    const res = await agencyChromeRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.whiteLabelEnabled).toBe(false);
  });
});
