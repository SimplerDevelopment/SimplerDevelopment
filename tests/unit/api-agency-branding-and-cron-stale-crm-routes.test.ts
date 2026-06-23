// @vitest-environment node
/**
 * Unit tests for two routes:
 *
 *   1. /api/portal/agency/branding (GET + PATCH)
 *      — exercises auth gate, getPortalClient/getPortalRole, JSON parsing,
 *        per-field validation (length, hex-color, URL), empty-update
 *        rejection, and the db.select/db.update path.
 *
 *   2. /api/cron/stale-crm-deals (GET)
 *      — complements existing cron-stale-crm-deals.test.ts with cases
 *        that drive the candidate-row loop: dup-skip, owner fallback,
 *        last-activity formatting, and the no-CRON_SECRET passthrough.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks for /api/portal/agency/branding
// ---------------------------------------------------------------------------
const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
const getPortalRoleMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
  getPortalRole: (...args: unknown[]) => getPortalRoleMock(...args),
}));

// drizzle chain stubs. The agency branding route does:
//   db.select(...).from(clients).where(...).limit(1)
//   db.update(clients).set(...).where(...)
// We capture set() args so we can assert the body parsing produced the
// right shape.
const selectLimitMock = vi.fn();
const selectWhereMock = vi.fn(() => ({ limit: selectLimitMock }));
const selectFromMock = vi.fn(() => ({ where: selectWhereMock }));
const dbSelectMock = vi.fn(() => ({ from: selectFromMock }));

const updateWhereMock = vi.fn().mockResolvedValue(undefined);
const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
const dbUpdateMock = vi.fn(() => ({ set: updateSetMock }));

const dbExecuteMock = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => dbSelectMock(...args),
    update: (...args: unknown[]) => dbUpdateMock(...args),
    execute: (...args: unknown[]) => dbExecuteMock(...args),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  clients: {
    id: 'clients.id',
    agencyName: 'clients.agencyName',
    agencyLogoUrl: 'clients.agencyLogoUrl',
    agencyPrimaryColor: 'clients.agencyPrimaryColor',
    whiteLabelEnabled: 'clients.whiteLabelEnabled',
  },
}));

// drizzle-orm eq just needs to be a callable. The route doesn't inspect it.
vi.mock('drizzle-orm', async () => {
  const actual: object = await vi.importActual('drizzle-orm');
  return {
    ...actual,
    eq: (...args: unknown[]) => ({ __eq: args }),
  };
});

// ---------------------------------------------------------------------------
// Mocks for /api/cron/stale-crm-deals
// ---------------------------------------------------------------------------
const createCrmNotificationMock = vi.fn();
vi.mock('@/lib/crm/notifications', () => ({
  createCrmNotification: (...args: unknown[]) => createCrmNotificationMock(...args),
}));

// ===========================================================================
// /api/portal/agency/branding
// ===========================================================================
describe('GET /api/portal/agency/branding', () => {
  beforeEach(() => {
    authMock.mockReset();
    getPortalClientMock.mockReset();
    getPortalRoleMock.mockReset();
    selectLimitMock.mockReset();
    selectLimitMock.mockResolvedValue([
      {
        agencyName: 'Acme',
        agencyLogoUrl: 'https://example.com/logo.png',
        agencyPrimaryColor: '#abcdef',
        whiteLabelEnabled: true,
      },
    ]);
  });

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const { GET } = await import('@/app/api/portal/agency/branding/route');
    const res = await GET();
    expect(res.status).toBe(401);
    const json = (await res.json()) as { success: boolean; error: string };
    expect(json).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns 404 when no portal client is resolved', async () => {
    authMock.mockResolvedValue({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValue(null);
    const { GET } = await import('@/app/api/portal/agency/branding/route');
    const res = await GET();
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Client not found');
  });

  it('returns 403 when role is not owner/admin', async () => {
    authMock.mockResolvedValue({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValue({ id: 7 });
    getPortalRoleMock.mockResolvedValue('member');
    const { GET } = await import('@/app/api/portal/agency/branding/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns row data for an owner', async () => {
    authMock.mockResolvedValue({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValue({ id: 7 });
    getPortalRoleMock.mockResolvedValue('owner');
    const { GET } = await import('@/app/api/portal/agency/branding/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: { agencyName: string; whiteLabelEnabled: boolean };
    };
    expect(json.success).toBe(true);
    expect(json.data.agencyName).toBe('Acme');
    expect(json.data.whiteLabelEnabled).toBe(true);
  });

  it('admin role also works and missing row falls back to defaults', async () => {
    authMock.mockResolvedValue({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValue({ id: 7 });
    getPortalRoleMock.mockResolvedValue('admin');
    selectLimitMock.mockResolvedValueOnce([]); // empty result -> defaults
    const { GET } = await import('@/app/api/portal/agency/branding/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: {
        agencyName: string | null;
        agencyLogoUrl: string | null;
        agencyPrimaryColor: string | null;
        whiteLabelEnabled: boolean;
      };
    };
    expect(json.data).toEqual({
      agencyName: null,
      agencyLogoUrl: null,
      agencyPrimaryColor: null,
      whiteLabelEnabled: false,
    });
  });
});

describe('PATCH /api/portal/agency/branding', () => {
  beforeEach(() => {
    authMock.mockReset();
    getPortalClientMock.mockReset();
    getPortalRoleMock.mockReset();
    selectLimitMock.mockReset();
    updateSetMock.mockClear();
    updateWhereMock.mockClear();
    authMock.mockResolvedValue({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValue({ id: 7 });
    getPortalRoleMock.mockResolvedValue('owner');
    selectLimitMock.mockResolvedValue([
      {
        agencyName: 'Acme',
        agencyLogoUrl: null,
        agencyPrimaryColor: null,
        whiteLabelEnabled: false,
      },
    ]);
  });

  async function callPatch(body: unknown) {
    const { PATCH } = await import('@/app/api/portal/agency/branding/route');
    return PATCH(
      new Request('http://x/api/portal/agency/branding', {
        method: 'PATCH',
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    );
  }

  it('rejects invalid JSON with 400', async () => {
    const { PATCH } = await import('@/app/api/portal/agency/branding/route');
    const res = await PATCH(
      new Request('http://x/api/portal/agency/branding', {
        method: 'PATCH',
        body: '{not json',
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Invalid JSON body');
  });

  it('rejects an empty body with "No fields provided"', async () => {
    const res = await callPatch({});
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('No fields provided');
  });

  it('rejects agencyName longer than 255 chars', async () => {
    const res = await callPatch({ agencyName: 'x'.repeat(256) });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/agencyName too long/);
  });

  it('rejects a non-http(s) agencyLogoUrl', async () => {
    const res = await callPatch({ agencyLogoUrl: 'ftp://example.com/x.png' });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/agencyLogoUrl must be a valid/);
  });

  it('rejects a totally malformed agencyLogoUrl', async () => {
    const res = await callPatch({ agencyLogoUrl: 'not a url' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-hex agencyPrimaryColor', async () => {
    const res = await callPatch({ agencyPrimaryColor: 'blueish' });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/hex color/);
  });

  it('writes trimmed values and converts empty strings to null', async () => {
    const res = await callPatch({
      agencyName: '  Acme Co  ',
      agencyLogoUrl: '',
      agencyPrimaryColor: '#2563eb',
    });
    expect(res.status).toBe(200);
    expect(updateSetMock).toHaveBeenCalledTimes(1);
    const args = updateSetMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(args.agencyName).toBe('Acme Co');
    expect(args.agencyLogoUrl).toBeNull();
    expect(args.agencyPrimaryColor).toBe('#2563eb');
    expect(args.updatedAt).toBeInstanceOf(Date);
  });

  it('explicit nulls are passed through as nulls', async () => {
    const res = await callPatch({
      agencyName: null,
      agencyLogoUrl: null,
      agencyPrimaryColor: null,
    });
    expect(res.status).toBe(200);
    const args = updateSetMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(args.agencyName).toBeNull();
    expect(args.agencyLogoUrl).toBeNull();
    expect(args.agencyPrimaryColor).toBeNull();
  });

  it('accepts a valid http(s) agencyLogoUrl', async () => {
    const res = await callPatch({ agencyLogoUrl: 'https://cdn.example.com/logo.png' });
    expect(res.status).toBe(200);
    const args = updateSetMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(args.agencyLogoUrl).toBe('https://cdn.example.com/logo.png');
  });

  it('rejects an http(s) agencyLogoUrl longer than 500 chars', async () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(490);
    const res = await callPatch({ agencyLogoUrl: longUrl });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/agencyLogoUrl too long/);
  });

  it('accepts short hex (#abc) as a valid primary color', async () => {
    const res = await callPatch({ agencyPrimaryColor: '#abc' });
    expect(res.status).toBe(200);
    const args = updateSetMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(args.agencyPrimaryColor).toBe('#abc');
  });
});

// ===========================================================================
// /api/cron/stale-crm-deals — complementary scenarios
// ===========================================================================
describe('GET /api/cron/stale-crm-deals — candidate loop', () => {
  const ORIGINAL_ENV = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_ENV;
  });

  it('skips dup rows, notifies owner fallback, and formats body lines', async () => {
    delete process.env.CRON_SECRET;
    const lastActivity = new Date('2026-01-01T12:00:00Z');

    dbExecuteMock.mockResolvedValueOnce({
      rows: [
        // dup row — already notified within 30 days
        {
          dealId: 1,
          clientId: 10,
          title: 'Dup Deal',
          ownerId: 99,
          fallbackOwnerId: 50,
          stageName: 'Negotiation',
          lastActivityAt: lastActivity,
          dealCreatedAt: new Date('2025-12-01T00:00:00Z'),
          recentDupId: 555,
        },
        // owner set — notify direct owner, with last-activity line
        {
          dealId: 2,
          clientId: 11,
          title: 'Owned Deal',
          ownerId: 77,
          fallbackOwnerId: 50,
          stageName: 'Discovery',
          lastActivityAt: lastActivity,
          dealCreatedAt: new Date('2025-12-01T00:00:00Z'),
          recentDupId: null,
        },
        // no ownerId, but fallback exists — uses fallbackOwnerId,
        // no-activity branch hits the "(no activity recorded)" copy
        {
          dealId: 3,
          clientId: 12,
          title: 'No-activity Deal',
          ownerId: null,
          fallbackOwnerId: 60,
          stageName: 'Proposal',
          lastActivityAt: null,
          dealCreatedAt: new Date('2025-01-01T00:00:00Z'),
          recentDupId: null,
        },
        // neither owner nor fallback — must short-circuit before
        // createCrmNotification is called
        {
          dealId: 4,
          clientId: 13,
          title: 'Orphan Deal',
          ownerId: null,
          fallbackOwnerId: 0,
          stageName: 'New',
          lastActivityAt: null,
          dealCreatedAt: new Date('2025-01-01T00:00:00Z'),
          recentDupId: null,
        },
      ],
    });

    const { GET } = await import('@/app/api/cron/stale-crm-deals/route');
    const res = await GET(
      new Request('http://x/api/cron/stale-crm-deals', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: {
        scanned: number;
        matched: number;
        notified: number;
        skippedDup: number;
        durationMs: number;
      };
    };
    expect(json.success).toBe(true);
    expect(json.data.scanned).toBe(4);
    expect(json.data.matched).toBe(4);
    expect(json.data.skippedDup).toBe(1);
    // 2 notifications: deal 2 (owner) + deal 3 (fallback); deal 4 short-circuits
    expect(json.data.notified).toBe(2);
    expect(typeof json.data.durationMs).toBe('number');

    expect(createCrmNotificationMock).toHaveBeenCalledTimes(2);

    // deal 2 — owner path, has last activity
    const ownedCall = createCrmNotificationMock.mock.calls[0]![0] as {
      userId: number;
      title: string;
      body: string;
      entityId: number;
      type: string;
      entityType: string;
    };
    expect(ownedCall.userId).toBe(77);
    expect(ownedCall.entityId).toBe(2);
    expect(ownedCall.type).toBe('deal_stale');
    expect(ownedCall.entityType).toBe('deal');
    expect(ownedCall.title).toMatch(/Owned Deal/);
    expect(ownedCall.body).toMatch(/Last activity: 2026-01-01/);
    expect(ownedCall.body).toMatch(/Stage: Discovery/);

    // deal 3 — fallback path, no activity
    const fallbackCall = createCrmNotificationMock.mock.calls[1]![0] as {
      userId: number;
      body: string;
    };
    expect(fallbackCall.userId).toBe(60);
    expect(fallbackCall.body).toMatch(/no activity recorded/);
  });

  it('accepts a bare array (non-wrapped) return shape from db.execute', async () => {
    delete process.env.CRON_SECRET;
    dbExecuteMock.mockResolvedValueOnce([
      {
        dealId: 100,
        clientId: 10,
        title: 'Bare Deal',
        ownerId: 1,
        fallbackOwnerId: 2,
        stageName: 'Stage',
        lastActivityAt: null,
        dealCreatedAt: new Date('2025-01-01T00:00:00Z'),
        recentDupId: null,
      },
    ]);

    const { GET } = await import('@/app/api/cron/stale-crm-deals/route');
    const res = await GET(
      new Request('http://x/api/cron/stale-crm-deals', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { scanned: number; notified: number } };
    expect(json.data.scanned).toBe(1);
    expect(json.data.notified).toBe(1);
  });

  it('returns 200 with no CRON_SECRET configured (no auth required)', async () => {
    delete process.env.CRON_SECRET;
    dbExecuteMock.mockResolvedValueOnce({ rows: [] });

    const { GET } = await import('@/app/api/cron/stale-crm-deals/route');
    const res = await GET(new Request('http://x/api/cron/stale-crm-deals'));
    expect(res.status).toBe(200);
  });

  it('rejects a wrong bearer token when CRON_SECRET is set', async () => {
    process.env.CRON_SECRET = 'shh';
    const { GET } = await import('@/app/api/cron/stale-crm-deals/route');
    const res = await GET(
      new Request('http://x/api/cron/stale-crm-deals', {
        headers: { authorization: 'Bearer wrong' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('handles a null .rows shape gracefully', async () => {
    delete process.env.CRON_SECRET;
    // simulate `{ rows: undefined }` from the driver — the route coalesces to []
    dbExecuteMock.mockResolvedValueOnce({});

    const { GET } = await import('@/app/api/cron/stale-crm-deals/route');
    const res = await GET(
      new Request('http://x/api/cron/stale-crm-deals', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { scanned: number } };
    expect(json.data.scanned).toBe(0);
  });
});
