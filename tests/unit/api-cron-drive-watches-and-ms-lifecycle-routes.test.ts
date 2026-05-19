// @vitest-environment node
/**
 * Unit tests for two unrelated API routes bundled together for batch coverage:
 *
 *   1. GET  /api/cron/renew-drive-watches      (cron renewal for Google Drive
 *      push channels — auth gate, candidate filter, renewal happy-path,
 *      bootstrap of missing start-page-token, stop-old-channel best-effort,
 *      per-row failure isolation, multiple connections.)
 *
 *   2. POST /api/microsoft-webhook/lifecycle   (Graph lifecycle notifications —
 *      validation handshake, JSON parse errors, missing value array, per-event
 *      shape validation, clientState mismatch, unknown subscriptionId, the
 *      three known lifecycleEvents (reauthorizationRequired, subscriptionRemoved,
 *      missed), and unknown lifecycleEvent fallthrough.)
 *
 * Everything external (db, drizzle-orm, schema, google libs) is mocked, so
 * these are pure unit tests of the route's branching logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ===========================================================================
// Shared mocks
// ===========================================================================
//
// Both routes touch `@/lib/db`, `@/lib/db/schema`, and `drizzle-orm`. We share
// a single mock per module via lightweight state objects so the two describe
// blocks can independently program their own DB behavior.
// ===========================================================================

// ---- drive-watches state -------------------------------------------------

type DriveRow = {
  id: number;
  clientId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
  driveChannelId: string | null;
  driveChannelResourceId: string | null;
  driveChannelToken: string | null;
  driveChannelExpiration: Date | null;
  driveStartPageToken: string | null;
  revokedAt: Date | null;
};

const driveState: { rows: DriveRow[] } = { rows: [] };

// ---- ms-lifecycle state --------------------------------------------------

type LifecycleRow = { id: number; clientState: string | null };

const lifecycleState: {
  selectQueue: LifecycleRow[][];
} = { selectQueue: [] };

// ---- shared update tracker ----------------------------------------------

const updateCalls: Array<{ table: string; set: Record<string, unknown> }> = [];

// ===========================================================================
// Module mocks (must be declared before any route import)
// ===========================================================================

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
    googleWorkspaceUserConnections: tableProxy('googleWorkspaceUserConnections'),
    microsoftTeamsUserConnections: tableProxy('microsoftTeamsUserConnections'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ _op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ _op: 'and', args }),
  or: (...args: unknown[]) => ({ _op: 'or', args }),
  isNull: (a: unknown) => ({ _op: 'isNull', a }),
  lt: (a: unknown, b: unknown) => ({ _op: 'lt', a, b }),
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => ({
    _op: 'sql',
    strings,
    vals,
  }),
}));

vi.mock('@/lib/db', () => {
  function makeDriveSelect() {
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.where = () => Promise.resolve(driveState.rows);
    return chain;
  }
  function makeLifecycleSelect() {
    const rows = lifecycleState.selectQueue.shift() ?? [];
    const chain: Record<string, unknown> = {};
    const passthrough = ['from', 'where', 'orderBy', 'innerJoin', 'leftJoin', 'groupBy', 'offset'];
    for (const m of passthrough) chain[m] = () => chain;
    chain.limit = () => Promise.resolve(rows);
    return chain;
  }
  return {
    db: {
      // Drive route calls .select().from().where() returning a Promise.
      // Lifecycle route calls .select({...}).from().where().limit() returning a Promise.
      // We disambiguate by checking whether select() got a projection argument.
      select: (arg?: unknown) =>
        arg === undefined ? makeDriveSelect() : makeLifecycleSelect(),
      update: (table: { _name?: string }) => ({
        set: (values: Record<string, unknown>) => {
          updateCalls.push({ table: table?._name ?? 'unknown', set: values });
          return { where: () => Promise.resolve() };
        },
      }),
    },
  };
});

// ---- drive-route-specific mocks -----------------------------------------

const refreshIfExpiredMock = vi.fn();
const getTenantWorkspaceCredentialsByClientIdMock = vi.fn();
const subscribeDriveChangesMock = vi.fn();
const stopDriveChangesMock = vi.fn();
const getDriveStartPageTokenMock = vi.fn();

vi.mock('@/lib/google/oauth', () => ({
  refreshIfExpired: refreshIfExpiredMock,
}));
vi.mock('@/lib/google/tenant-credentials', () => ({
  getTenantWorkspaceCredentialsByClientId:
    getTenantWorkspaceCredentialsByClientIdMock,
}));
vi.mock('@/lib/google/drive-changes', () => ({
  subscribeDriveChanges: subscribeDriveChangesMock,
  stopDriveChanges: stopDriveChangesMock,
  getDriveStartPageToken: getDriveStartPageTokenMock,
}));

// ===========================================================================
// Helpers
// ===========================================================================

function resetState() {
  driveState.rows = [];
  lifecycleState.selectQueue = [];
  updateCalls.length = 0;
  refreshIfExpiredMock.mockReset();
  getTenantWorkspaceCredentialsByClientIdMock.mockReset();
  subscribeDriveChangesMock.mockReset();
  stopDriveChangesMock.mockReset();
  getDriveStartPageTokenMock.mockReset();
}

function baseDriveRow(overrides: Partial<DriveRow> = {}): DriveRow {
  return {
    id: 1,
    clientId: 'client-1',
    accessToken: 'at',
    refreshToken: 'rt',
    expiresAt: new Date('2026-05-19T12:00:00Z'),
    scopes: ['https://www.googleapis.com/auth/drive'],
    driveChannelId: null,
    driveChannelResourceId: null,
    driveChannelToken: null,
    driveChannelExpiration: null,
    driveStartPageToken: 'spt-1',
    revokedAt: null,
    ...overrides,
  };
}

// ===========================================================================
// Tests — renew-drive-watches
// ===========================================================================

describe('GET /api/cron/renew-drive-watches', () => {
  const ORIGINAL_CRON = process.env.CRON_SECRET;
  const ORIGINAL_WEBHOOK = process.env.GOOGLE_DRIVE_WEBHOOK_URL;
  const ORIGINAL_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    vi.resetModules();
    resetState();
    // Tenant credentials default to "active".
    getTenantWorkspaceCredentialsByClientIdMock.mockResolvedValue({
      status: 'active',
      oauth: { clientId: 'g', clientSecret: 's', redirectUri: 'r' },
    });
    refreshIfExpiredMock.mockResolvedValue({ refreshed: false });
    subscribeDriveChangesMock.mockResolvedValue({
      channelId: 'ch-new',
      resourceId: 'rid-new',
      channelToken: 'tok-new',
      expiration: new Date('2026-05-20T12:00:00Z'),
    });
    stopDriveChangesMock.mockResolvedValue(undefined);
    getDriveStartPageTokenMock.mockResolvedValue('spt-bootstrapped');
  });

  afterEach(() => {
    if (ORIGINAL_CRON === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_CRON;
    if (ORIGINAL_WEBHOOK === undefined) delete process.env.GOOGLE_DRIVE_WEBHOOK_URL;
    else process.env.GOOGLE_DRIVE_WEBHOOK_URL = ORIGINAL_WEBHOOK;
    if (ORIGINAL_PUBLIC === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_PUBLIC;
  });

  it('rejects unauthenticated requests when CRON_SECRET is set', async () => {
    process.env.CRON_SECRET = 'shh';
    const { GET } = await import('@/app/api/cron/renew-drive-watches/route');
    const res = await GET(
      new Request('http://x/api/cron/renew-drive-watches'),
    );
    expect(res.status).toBe(401);
    const json = (await res.json()) as { success: boolean; message: string };
    expect(json).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('rejects when CRON_SECRET is unset and no Vercel header', async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import('@/app/api/cron/renew-drive-watches/route');
    const res = await GET(
      new Request('http://x/api/cron/renew-drive-watches', {
        headers: { authorization: 'Bearer whatever' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('rejects when bearer token does not match CRON_SECRET', async () => {
    process.env.CRON_SECRET = 'shh';
    const { GET } = await import('@/app/api/cron/renew-drive-watches/route');
    const res = await GET(
      new Request('http://x/api/cron/renew-drive-watches', {
        headers: { authorization: 'Bearer wrong' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('accepts the Vercel cron header without bearer token', async () => {
    process.env.CRON_SECRET = 'shh';
    const { GET } = await import('@/app/api/cron/renew-drive-watches/route');
    const res = await GET(
      new Request('http://x/api/cron/renew-drive-watches', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      examined: number;
      candidates: number;
      renewed: number;
      skipped: number;
      failed: number;
      webhookAddress: string;
    };
    expect(json.success).toBe(true);
    expect(json.examined).toBe(0);
    expect(json.candidates).toBe(0);
    expect(json.renewed).toBe(0);
    expect(json.skipped).toBe(0);
    expect(json.failed).toBe(0);
    expect(json.webhookAddress).toMatch(/\/api\/google-webhook\/drive$/);
  });

  it('accepts a matching bearer token', async () => {
    process.env.CRON_SECRET = 'shh';
    const { GET } = await import('@/app/api/cron/renew-drive-watches/route');
    const res = await GET(
      new Request('http://x/api/cron/renew-drive-watches', {
        headers: { authorization: 'Bearer shh' },
      }),
    );
    expect(res.status).toBe(200);
  });

  it('uses GOOGLE_DRIVE_WEBHOOK_URL when set, trimming trailing slash', async () => {
    process.env.CRON_SECRET = 'shh';
    process.env.GOOGLE_DRIVE_WEBHOOK_URL = 'https://wh.example.com/';
    const { GET } = await import('@/app/api/cron/renew-drive-watches/route');
    const res = await GET(
      new Request('http://x/api/cron/renew-drive-watches', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    const json = (await res.json()) as { webhookAddress: string };
    expect(json.webhookAddress).toBe(
      'https://wh.example.com/api/google-webhook/drive',
    );
  });

  it('falls back to NEXT_PUBLIC_SITE_URL when GOOGLE_DRIVE_WEBHOOK_URL is unset', async () => {
    process.env.CRON_SECRET = 'shh';
    delete process.env.GOOGLE_DRIVE_WEBHOOK_URL;
    process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example.com';
    const { GET } = await import('@/app/api/cron/renew-drive-watches/route');
    const res = await GET(
      new Request('http://x/api/cron/renew-drive-watches', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    const json = (await res.json()) as { webhookAddress: string };
    expect(json.webhookAddress).toBe(
      'https://site.example.com/api/google-webhook/drive',
    );
  });

  it('falls back to req.url origin when no env vars are set', async () => {
    process.env.CRON_SECRET = 'shh';
    delete process.env.GOOGLE_DRIVE_WEBHOOK_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const { GET } = await import('@/app/api/cron/renew-drive-watches/route');
    const res = await GET(
      new Request('http://host.example.com/api/cron/renew-drive-watches', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    const json = (await res.json()) as { webhookAddress: string };
    expect(json.webhookAddress).toBe(
      'http://host.example.com/api/google-webhook/drive',
    );
  });

  it('filters out connections without drive scope', async () => {
    process.env.CRON_SECRET = 'shh';
    driveState.rows = [
      baseDriveRow({ id: 1, scopes: ['https://www.googleapis.com/auth/gmail.readonly'] }),
      baseDriveRow({ id: 2, scopes: ['https://www.googleapis.com/auth/calendar'] }),
    ];
    const { GET } = await import('@/app/api/cron/renew-drive-watches/route');
    const res = await GET(
      new Request('http://x/api/cron/renew-drive-watches', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    const json = (await res.json()) as {
      examined: number;
      candidates: number;
      renewed: number;
    };
    expect(json.examined).toBe(2);
    expect(json.candidates).toBe(0);
    expect(json.renewed).toBe(0);
    expect(subscribeDriveChangesMock).not.toHaveBeenCalled();
  });

  it('selects connections beyond the 12h renewal horizon as NOT candidates', async () => {
    process.env.CRON_SECRET = 'shh';
    driveState.rows = [
      baseDriveRow({
        id: 99,
        driveChannelId: 'ch-existing',
        driveChannelResourceId: 'rid',
        driveChannelExpiration: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48h out
      }),
    ];
    const { GET } = await import('@/app/api/cron/renew-drive-watches/route');
    const res = await GET(
      new Request('http://x/api/cron/renew-drive-watches', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    const json = (await res.json()) as { candidates: number; renewed: number };
    expect(json.candidates).toBe(0);
    expect(json.renewed).toBe(0);
  });

  it('bootstraps a new watch when driveChannelId is null', async () => {
    process.env.CRON_SECRET = 'shh';
    driveState.rows = [baseDriveRow({ id: 11, driveStartPageToken: 'spt-existing' })];
    const { GET } = await import('@/app/api/cron/renew-drive-watches/route');
    const res = await GET(
      new Request('http://x/api/cron/renew-drive-watches', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { renewed: number; candidates: number };
    expect(json.candidates).toBe(1);
    expect(json.renewed).toBe(1);
    expect(subscribeDriveChangesMock).toHaveBeenCalledTimes(1);
    expect(stopDriveChangesMock).not.toHaveBeenCalled();
    expect(getDriveStartPageTokenMock).not.toHaveBeenCalled();
    // The final update should write the new channel fields.
    const lastUpdate = updateCalls[updateCalls.length - 1];
    expect(lastUpdate.set).toMatchObject({
      driveChannelId: 'ch-new',
      driveChannelResourceId: 'rid-new',
      driveChannelToken: 'tok-new',
    });
  });

  it('refreshes tokens and persists them when access token is expired', async () => {
    process.env.CRON_SECRET = 'shh';
    driveState.rows = [baseDriveRow({ id: 12 })];
    refreshIfExpiredMock.mockResolvedValueOnce({
      refreshed: true,
      accessToken: 'new-at',
      refreshToken: 'new-rt',
      expiresAt: new Date('2026-05-19T14:00:00Z'),
    });
    const { GET } = await import('@/app/api/cron/renew-drive-watches/route');
    await GET(
      new Request('http://x/api/cron/renew-drive-watches', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    // First update should be the token persistence.
    expect(updateCalls[0].set).toMatchObject({
      accessToken: 'new-at',
      refreshToken: 'new-rt',
    });
  });

  it('keeps the existing refresh token when the refresher omits a new one', async () => {
    process.env.CRON_SECRET = 'shh';
    driveState.rows = [baseDriveRow({ id: 13, refreshToken: 'old-rt' })];
    refreshIfExpiredMock.mockResolvedValueOnce({
      refreshed: true,
      accessToken: 'new-at',
      // no refreshToken returned
      expiresAt: new Date('2026-05-19T14:00:00Z'),
    });
    const { GET } = await import('@/app/api/cron/renew-drive-watches/route');
    await GET(
      new Request('http://x/api/cron/renew-drive-watches', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(updateCalls[0].set).toMatchObject({
      accessToken: 'new-at',
      refreshToken: 'old-rt',
    });
  });

  it('bootstraps driveStartPageToken when missing', async () => {
    process.env.CRON_SECRET = 'shh';
    driveState.rows = [baseDriveRow({ id: 14, driveStartPageToken: null })];
    const { GET } = await import('@/app/api/cron/renew-drive-watches/route');
    await GET(
      new Request('http://x/api/cron/renew-drive-watches', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(getDriveStartPageTokenMock).toHaveBeenCalledTimes(1);
    // One of the updates should set the bootstrapped start page token.
    expect(updateCalls.some((u) => u.set.driveStartPageToken === 'spt-bootstrapped')).toBe(true);
  });

  it('stops the previous channel before opening a new one when both ids are present', async () => {
    process.env.CRON_SECRET = 'shh';
    driveState.rows = [
      baseDriveRow({
        id: 15,
        driveChannelId: 'ch-old',
        driveChannelResourceId: 'rid-old',
        driveChannelExpiration: new Date(Date.now() - 1000), // already expired
      }),
    ];
    const { GET } = await import('@/app/api/cron/renew-drive-watches/route');
    await GET(
      new Request('http://x/api/cron/renew-drive-watches', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(stopDriveChangesMock).toHaveBeenCalledTimes(1);
    const args = stopDriveChangesMock.mock.calls[0][0];
    expect(args.channelId).toBe('ch-old');
    expect(args.resourceId).toBe('rid-old');
  });

  it('swallows errors from stopDriveChanges (best-effort)', async () => {
    process.env.CRON_SECRET = 'shh';
    driveState.rows = [
      baseDriveRow({
        id: 16,
        driveChannelId: 'ch-old',
        driveChannelResourceId: 'rid-old',
        driveChannelExpiration: new Date(Date.now() - 1000),
      }),
    ];
    stopDriveChangesMock.mockRejectedValueOnce(new Error('404 not found'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { GET } = await import('@/app/api/cron/renew-drive-watches/route');
    const res = await GET(
      new Request('http://x/api/cron/renew-drive-watches', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { renewed: number; failed: number };
    expect(json.renewed).toBe(1);
    expect(json.failed).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('skips connections whose tenant is revoked', async () => {
    process.env.CRON_SECRET = 'shh';
    driveState.rows = [baseDriveRow({ id: 17 })];
    getTenantWorkspaceCredentialsByClientIdMock.mockResolvedValueOnce({
      status: 'revoked',
      oauth: { clientId: 'g', clientSecret: 's', redirectUri: 'r' },
    });
    const { GET } = await import('@/app/api/cron/renew-drive-watches/route');
    const res = await GET(
      new Request('http://x/api/cron/renew-drive-watches', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    const json = (await res.json()) as {
      candidates: number;
      renewed: number;
      skipped: number;
    };
    expect(json.candidates).toBe(1);
    expect(json.renewed).toBe(0);
    expect(json.skipped).toBe(1);
    expect(subscribeDriveChangesMock).not.toHaveBeenCalled();
  });

  it('skips connections when no tenant credentials are found', async () => {
    process.env.CRON_SECRET = 'shh';
    driveState.rows = [baseDriveRow({ id: 18 })];
    getTenantWorkspaceCredentialsByClientIdMock.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/cron/renew-drive-watches/route');
    const res = await GET(
      new Request('http://x/api/cron/renew-drive-watches', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    const json = (await res.json()) as { skipped: number; renewed: number };
    expect(json.skipped).toBe(1);
    expect(json.renewed).toBe(0);
  });

  it('reports a failure entry when subscribeDriveChanges throws', async () => {
    process.env.CRON_SECRET = 'shh';
    driveState.rows = [baseDriveRow({ id: 19 })];
    subscribeDriveChangesMock.mockRejectedValueOnce(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { GET } = await import('@/app/api/cron/renew-drive-watches/route');
    const res = await GET(
      new Request('http://x/api/cron/renew-drive-watches', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    const json = (await res.json()) as {
      failed: number;
      renewed: number;
      failures: Array<{ connectionId: number; reason: string }>;
    };
    expect(json.renewed).toBe(0);
    expect(json.failed).toBe(1);
    expect(json.failures).toEqual([{ connectionId: 19, reason: 'boom' }]);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('processes multiple candidates and isolates per-row failures', async () => {
    process.env.CRON_SECRET = 'shh';
    driveState.rows = [
      baseDriveRow({ id: 20 }),
      baseDriveRow({ id: 21 }),
      baseDriveRow({ id: 22 }),
    ];
    subscribeDriveChangesMock
      .mockResolvedValueOnce({
        channelId: 'ch-20',
        resourceId: 'rid-20',
        channelToken: 'tok-20',
        expiration: new Date(),
      })
      .mockRejectedValueOnce(new Error('mid-fail'))
      .mockResolvedValueOnce({
        channelId: 'ch-22',
        resourceId: 'rid-22',
        channelToken: 'tok-22',
        expiration: new Date(),
      });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { GET } = await import('@/app/api/cron/renew-drive-watches/route');
    const res = await GET(
      new Request('http://x/api/cron/renew-drive-watches', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    const json = (await res.json()) as {
      examined: number;
      candidates: number;
      renewed: number;
      failed: number;
      failures: Array<{ connectionId: number }>;
    };
    expect(json.examined).toBe(3);
    expect(json.candidates).toBe(3);
    expect(json.renewed).toBe(2);
    expect(json.failed).toBe(1);
    expect(json.failures.map((f) => f.connectionId)).toEqual([21]);
    errSpy.mockRestore();
  });
});

// ===========================================================================
// Tests — microsoft-webhook/lifecycle
// ===========================================================================

describe('POST /api/microsoft-webhook/lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
  });

  function makeReq(
    body: unknown,
    opts: { validationToken?: string; raw?: string } = {},
  ) {
    const search = opts.validationToken
      ? `?validationToken=${encodeURIComponent(opts.validationToken)}`
      : '';
    const url = `http://x/api/microsoft-webhook/lifecycle${search}`;
    const init: RequestInit = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: opts.raw !== undefined ? opts.raw : JSON.stringify(body),
    };
    // The route signature is `POST(req: NextRequest)`; a Request works at runtime
    // because Next's NextRequest extends Request and the route uses standard
    // Request APIs (url, headers, json()).
    return new Request(url, init) as unknown as import('next/server').NextRequest;
  }

  it('echoes the validation token on handshake without touching the body', async () => {
    const { POST } = await import('@/app/api/microsoft-webhook/lifecycle/route');
    const res = await POST(makeReq(undefined, { validationToken: 'tok-123' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/plain/);
    const text = await res.text();
    expect(text).toBe('tok-123');
  });

  it('returns 400 when the body is not valid JSON', async () => {
    const { POST } = await import('@/app/api/microsoft-webhook/lifecycle/route');
    const res = await POST(makeReq(undefined, { raw: '{ not json' }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_json');
  });

  it('returns 400 when the body is missing the value array', async () => {
    const { POST } = await import('@/app/api/microsoft-webhook/lifecycle/route');
    const res = await POST(makeReq({ value: 'not-array' }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('missing_value_array');
  });

  it('returns 400 when the body is null', async () => {
    const { POST } = await import('@/app/api/microsoft-webhook/lifecycle/route');
    const res = await POST(makeReq(null));
    expect(res.status).toBe(400);
  });

  it('returns 202 and counts rejected for malformed event entries', async () => {
    const { POST } = await import('@/app/api/microsoft-webhook/lifecycle/route');
    const res = await POST(
      makeReq({ value: [null, 'not-an-object', { onlySome: 'fields' }] }),
    );
    expect(res.status).toBe(202);
    const json = (await res.json()) as {
      success: boolean;
      data: { handled: number; rejected: number; unknown: number };
    };
    expect(json.success).toBe(true);
    expect(json.data.handled).toBe(0);
    expect(json.data.rejected).toBe(3);
    expect(json.data.unknown).toBe(0);
  });

  it('counts unknown when no matching connection exists', async () => {
    lifecycleState.selectQueue = [[]];
    const { POST } = await import('@/app/api/microsoft-webhook/lifecycle/route');
    const res = await POST(
      makeReq({
        value: [
          {
            subscriptionId: 'sub-unknown',
            clientState: 'cs',
            lifecycleEvent: 'missed',
          },
        ],
      }),
    );
    const json = (await res.json()) as {
      data: { handled: number; rejected: number; unknown: number };
    };
    expect(json.data.unknown).toBe(1);
    expect(json.data.handled).toBe(0);
  });

  it('rejects events whose clientState does not match', async () => {
    lifecycleState.selectQueue = [[{ id: 100, clientState: 'expected' }]];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { POST } = await import('@/app/api/microsoft-webhook/lifecycle/route');
    const res = await POST(
      makeReq({
        value: [
          {
            subscriptionId: 'sub-mismatch',
            clientState: 'attacker',
            lifecycleEvent: 'missed',
          },
        ],
      }),
    );
    const json = (await res.json()) as {
      data: { handled: number; rejected: number; unknown: number };
    };
    expect(json.data.rejected).toBe(1);
    expect(json.data.handled).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('handles reauthorizationRequired by flagging expiration=now', async () => {
    lifecycleState.selectQueue = [[{ id: 101, clientState: 'cs' }]];
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { POST } = await import('@/app/api/microsoft-webhook/lifecycle/route');
    const res = await POST(
      makeReq({
        value: [
          {
            subscriptionId: 'sub-101',
            clientState: 'cs',
            lifecycleEvent: 'reauthorizationRequired',
          },
        ],
      }),
    );
    const json = (await res.json()) as {
      data: { handled: number; rejected: number };
    };
    expect(json.data.handled).toBe(1);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].set).toHaveProperty('subscriptionExpiration');
    expect(updateCalls[0].set.subscriptionExpiration).toBeInstanceOf(Date);
    expect(updateCalls[0].set).toHaveProperty('updatedAt');
    logSpy.mockRestore();
  });

  it('handles subscriptionRemoved by nulling out subscription columns', async () => {
    lifecycleState.selectQueue = [[{ id: 102, clientState: 'cs' }]];
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { POST } = await import('@/app/api/microsoft-webhook/lifecycle/route');
    const res = await POST(
      makeReq({
        value: [
          {
            subscriptionId: 'sub-102',
            clientState: 'cs',
            lifecycleEvent: 'subscriptionRemoved',
          },
        ],
      }),
    );
    expect(res.status).toBe(202);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].set).toMatchObject({
      subscriptionId: null,
      subscriptionResource: null,
      subscriptionExpiration: null,
      subscriptionClientState: null,
    });
    logSpy.mockRestore();
  });

  it('handles missed by logging only (no DB write)', async () => {
    lifecycleState.selectQueue = [[{ id: 103, clientState: 'cs' }]];
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { POST } = await import('@/app/api/microsoft-webhook/lifecycle/route');
    const res = await POST(
      makeReq({
        value: [
          {
            subscriptionId: 'sub-103',
            clientState: 'cs',
            lifecycleEvent: 'missed',
          },
        ],
      }),
    );
    const json = (await res.json()) as { data: { handled: number } };
    expect(json.data.handled).toBe(1);
    expect(updateCalls).toHaveLength(0);
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('counts an unknown lifecycleEvent as rejected', async () => {
    lifecycleState.selectQueue = [[{ id: 104, clientState: 'cs' }]];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { POST } = await import('@/app/api/microsoft-webhook/lifecycle/route');
    const res = await POST(
      makeReq({
        value: [
          {
            subscriptionId: 'sub-104',
            clientState: 'cs',
            lifecycleEvent: 'someUnknownEvent',
          },
        ],
      }),
    );
    const json = (await res.json()) as {
      data: { handled: number; rejected: number; unknown: number };
    };
    expect(json.data.rejected).toBe(1);
    expect(json.data.handled).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('aggregates a mixed batch (handled + rejected + unknown)', async () => {
    // Three events; first two find their connection rows, third does not.
    lifecycleState.selectQueue = [
      [{ id: 200, clientState: 'cs' }],
      [{ id: 201, clientState: 'expected' }],
      [],
    ];
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { POST } = await import('@/app/api/microsoft-webhook/lifecycle/route');
    const res = await POST(
      makeReq({
        value: [
          {
            subscriptionId: 'sub-200',
            clientState: 'cs',
            lifecycleEvent: 'reauthorizationRequired',
          },
          {
            subscriptionId: 'sub-201',
            clientState: 'attacker',
            lifecycleEvent: 'missed',
          },
          {
            subscriptionId: 'sub-202',
            clientState: 'cs',
            lifecycleEvent: 'missed',
          },
        ],
      }),
    );
    const json = (await res.json()) as {
      success: boolean;
      data: { handled: number; rejected: number; unknown: number };
    };
    expect(json.success).toBe(true);
    expect(json.data.handled).toBe(1);
    expect(json.data.rejected).toBe(1);
    expect(json.data.unknown).toBe(1);
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
