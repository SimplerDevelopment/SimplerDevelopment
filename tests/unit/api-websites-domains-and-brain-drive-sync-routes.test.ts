// @vitest-environment node
/**
 * Unit tests for two unrelated portal routes packed into one file:
 *
 *  1. GET / POST /api/portal/websites/[siteId]/domains
 *     - Auth gate
 *     - Site lookup (ownership)
 *     - Vercel project id resolution (success + misconfig)
 *     - Duplicate domain detection
 *     - First-domain primary flag (legacy column update)
 *     - DNS instructions for apex vs subdomain
 *     - getDomainConfig CNAME fallback
 *
 *  2. POST /api/portal/brain/drive-sync
 *     - Entitlement gate short-circuit
 *     - Missing / non-drive-scoped connection
 *     - Missing tenant credentials
 *     - Token refresh persistence
 *     - Start page token bootstrap
 *     - mode=backfill: folder required, success
 *     - mode=subscribe: tears down prior channel, opens new watch
 *     - mode=unsubscribe: tears down channel, returns stopped
 *     - default mode: syncDriveChangesForConnection wired through
 *
 * Everything external (auth, db, drizzle, portal client, Vercel API, Google
 * helpers, entitlement) is mocked. No network, no DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===========================================================================
// Shared schema + drizzle mocks
// ===========================================================================

vi.mock('@/lib/db/schema', () => {
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
  return {
    clientWebsites: wrap('clientWebsites'),
    websiteDomains: wrap('websiteDomains'),
    googleWorkspaceUserConnections: wrap('googleWorkspaceUserConnections'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
}));

// ===========================================================================
// Domains route deps
// ===========================================================================

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const addDomainMock = vi.fn();
const getDomainConfigMock = vi.fn();
const resolveDomainProjectIdMock = vi.fn();
vi.mock('@/lib/vercel', () => ({
  addDomain: (...args: unknown[]) => addDomainMock(...args),
  getDomainConfig: (...args: unknown[]) => getDomainConfigMock(...args),
  resolveDomainProjectId: (...args: unknown[]) => resolveDomainProjectIdMock(...args),
}));

// ===========================================================================
// Drive-sync route deps
// ===========================================================================

const requireBrainEntitlementMock = vi.fn();
vi.mock('@/lib/brain/entitlement', () => ({
  requireBrainEntitlement: (...args: unknown[]) => requireBrainEntitlementMock(...args),
}));

const refreshIfExpiredMock = vi.fn();
vi.mock('@/lib/google/oauth', () => ({
  refreshIfExpired: (...args: unknown[]) => refreshIfExpiredMock(...args),
}));

const getTenantWorkspaceCredentialsByClientIdMock = vi.fn();
vi.mock('@/lib/google/tenant-credentials', () => ({
  getTenantWorkspaceCredentialsByClientId: (...args: unknown[]) =>
    getTenantWorkspaceCredentialsByClientIdMock(...args),
}));

const syncDriveChangesForConnectionMock = vi.fn();
const getDriveStartPageTokenMock = vi.fn();
const findMeetRecordingsFolderIdMock = vi.fn();
const backfillMeetRecordingsFolderMock = vi.fn();
const subscribeDriveChangesMock = vi.fn();
const stopDriveChangesMock = vi.fn();
vi.mock('@/lib/google/drive-changes', () => ({
  syncDriveChangesForConnection: (...args: unknown[]) =>
    syncDriveChangesForConnectionMock(...args),
  getDriveStartPageToken: (...args: unknown[]) => getDriveStartPageTokenMock(...args),
  findMeetRecordingsFolderId: (...args: unknown[]) =>
    findMeetRecordingsFolderIdMock(...args),
  backfillMeetRecordingsFolder: (...args: unknown[]) =>
    backfillMeetRecordingsFolderMock(...args),
  subscribeDriveChanges: (...args: unknown[]) => subscribeDriveChangesMock(...args),
  stopDriveChanges: (...args: unknown[]) => stopDriveChangesMock(...args),
}));

// ===========================================================================
// In-memory DB
// ===========================================================================

interface MockState {
  clientWebsites: Array<Record<string, unknown>>;
  websiteDomains: Array<Record<string, unknown>>;
  googleWorkspaceUserConnections: Array<Record<string, unknown>>;
}

const state: MockState = {
  clientWebsites: [],
  websiteDomains: [],
  googleWorkspaceUserConnections: [],
};

function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as {
    op?: string;
    a?: unknown;
    b?: unknown;
    args?: unknown[];
  };
  switch (f.op) {
    case 'eq': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === f.b;
    }
    case 'isNull': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === null || row[col.__col] === undefined;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    default:
      return true;
  }
}

let idCounter = 1000;
function nextId(): number {
  return idCounter++;
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
      orderBy(_arg: unknown) {
        return runQuery();
      },
      limit(n: number) {
        limit = n;
        return runQuery();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      const rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      let out = rows.map((r) => ({ ...r }));
      if (limit !== null) out = out.slice(0, limit);
      return Promise.resolve(out);
    }

    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(vals: Record<string, unknown> | Record<string, unknown>[]) {
        const arr = Array.isArray(vals) ? vals : [vals];
        const inserted = arr.map((v) => {
          const row = {
            ...v,
            id: v.id ?? nextId(),
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          tableArray(table.__table).push(row);
          return row;
        });
        const result: Record<string, unknown> = {
          returning() {
            return Promise.resolve(inserted.map((r) => ({ ...r })));
          },
          then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(inserted.map((r) => ({ ...r }))).then(
              onFulfilled,
              onRejected,
            );
          },
        };
        return result;
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    let setValues: Record<string, unknown> = {};
    let filter: unknown = null;
    const chain: Record<string, unknown> = {
      set(vals: Record<string, unknown>) {
        setValues = vals;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      returning() {
        const rows = tableArray(table.__table);
        const updated: Record<string, unknown>[] = [];
        for (const r of rows) {
          if (evalPredicate(filter, r)) {
            Object.assign(r, setValues);
            updated.push({ ...r });
          }
        }
        return Promise.resolve(updated);
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        const rows = tableArray(table.__table);
        const updated: Record<string, unknown>[] = [];
        for (const r of rows) {
          if (evalPredicate(filter, r)) {
            Object.assign(r, setValues);
            updated.push({ ...r });
          }
        }
        return Promise.resolve(updated).then(onFulfilled, onRejected);
      },
    };
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
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
    },
  };
});

// ===========================================================================
// Modules under test
// ===========================================================================

const domainsRoute = await import(
  '@/app/api/portal/websites/[siteId]/domains/route'
);
const DOMAINS_GET = domainsRoute.GET;
const DOMAINS_POST = domainsRoute.POST;

const driveSyncRoute = await import(
  '@/app/api/portal/brain/drive-sync/route'
);
const DRIVE_SYNC_POST = driveSyncRoute.POST;

// ===========================================================================
// Shared resets
// ===========================================================================

beforeEach(() => {
  state.clientWebsites.length = 0;
  state.websiteDomains.length = 0;
  state.googleWorkspaceUserConnections.length = 0;
  idCounter = 1000;

  authMock.mockReset();
  getPortalClientMock.mockReset();
  addDomainMock.mockReset();
  getDomainConfigMock.mockReset();
  resolveDomainProjectIdMock.mockReset();

  requireBrainEntitlementMock.mockReset();
  refreshIfExpiredMock.mockReset();
  getTenantWorkspaceCredentialsByClientIdMock.mockReset();
  syncDriveChangesForConnectionMock.mockReset();
  getDriveStartPageTokenMock.mockReset();
  findMeetRecordingsFolderIdMock.mockReset();
  backfillMeetRecordingsFolderMock.mockReset();
  subscribeDriveChangesMock.mockReset();
  stopDriveChangesMock.mockReset();
  stopDriveChangesMock.mockResolvedValue(undefined);

  authMock.mockResolvedValue({ user: { id: '7' } });
  getPortalClientMock.mockResolvedValue({ id: 10 });
  resolveDomainProjectIdMock.mockReturnValue('prj_123');
  addDomainMock.mockResolvedValue(undefined);
  getDomainConfigMock.mockResolvedValue({ cnames: ['custom.vercel-dns.com'] });
});

// ===========================================================================
// /api/portal/websites/[siteId]/domains
// ===========================================================================

function siteParams(siteId: string): { params: Promise<{ siteId: string }> } {
  return { params: Promise.resolve({ siteId }) };
}

function makeGetReq(): Request {
  return new Request('http://x/api/portal/websites/55/domains', { method: 'GET' });
}

function makePostReq(body: unknown): Request {
  return new Request('http://x/api/portal/websites/55/domains', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/portal/websites/[siteId]/domains', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await DOMAINS_GET(makeGetReq(), siteParams('55'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await DOMAINS_GET(makeGetReq(), siteParams('55'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when getPortalClient is null', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await DOMAINS_GET(makeGetReq(), siteParams('55'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when site does not belong to client', async () => {
    state.clientWebsites.push({ id: 55, clientId: 999 });
    const res = await DOMAINS_GET(makeGetReq(), siteParams('55'));
    expect(res.status).toBe(404);
  });

  it('returns domains list for owned site', async () => {
    state.clientWebsites.push({ id: 55, clientId: 10 });
    state.websiteDomains.push({
      id: 1,
      websiteId: 55,
      domain: 'example.com',
      isPrimary: true,
      status: 'active',
    });
    state.websiteDomains.push({
      id: 2,
      websiteId: 55,
      domain: 'www.example.com',
      isPrimary: false,
      status: 'pending',
    });
    // domain belonging to another site shouldn't appear
    state.websiteDomains.push({
      id: 3,
      websiteId: 99,
      domain: 'other.com',
    });
    const res = await DOMAINS_GET(makeGetReq(), siteParams('55'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data.map((d: { domain: string }) => d.domain).sort()).toEqual([
      'example.com',
      'www.example.com',
    ]);
  });
});

describe('POST /api/portal/websites/[siteId]/domains', () => {
  beforeEach(() => {
    state.clientWebsites.push({
      id: 55,
      clientId: 10,
      vercelProjectId: 'prj_dedicated',
      domain: null,
    });
  });

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await DOMAINS_POST(makePostReq({ domain: 'a.com' }), siteParams('55'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when site not found', async () => {
    const res = await DOMAINS_POST(makePostReq({ domain: 'a.com' }), siteParams('999'));
    expect(res.status).toBe(404);
  });

  it('returns 500 when platform Vercel project is misconfigured', async () => {
    resolveDomainProjectIdMock.mockImplementationOnce(() => {
      throw new Error('Platform Vercel project is not configured.');
    });
    const res = await DOMAINS_POST(makePostReq({ domain: 'a.com' }), siteParams('55'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toMatch(/Platform Vercel project is not configured/);
  });

  it('returns 500 with generic message when resolveDomainProjectId throws non-Error', async () => {
    resolveDomainProjectIdMock.mockImplementationOnce(() => {
      throw 'string thrown';
    });
    const res = await DOMAINS_POST(makePostReq({ domain: 'a.com' }), siteParams('55'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('Platform Vercel project is not configured.');
  });

  it('returns 400 when domain field is missing', async () => {
    const res = await DOMAINS_POST(makePostReq({}), siteParams('55'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/domain is required/);
  });

  it('returns 400 when domain is not a string', async () => {
    const res = await DOMAINS_POST(makePostReq({ domain: 123 }), siteParams('55'));
    expect(res.status).toBe(400);
  });

  it('returns 409 when domain already exists for site', async () => {
    state.websiteDomains.push({
      id: 1,
      websiteId: 55,
      domain: 'example.com',
    });
    const res = await DOMAINS_POST(
      makePostReq({ domain: 'https://Example.com/' }),
      siteParams('55'),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.message).toMatch(/already added/);
  });

  it('adds first domain as primary, generates apex DNS instructions, updates legacy column', async () => {
    const res = await DOMAINS_POST(
      makePostReq({ domain: 'https://Example.com/' }),
      siteParams('55'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.domain).toBe('example.com');
    expect(body.data.isPrimary).toBe(true);
    expect(body.data.status).toBe('pending');

    // Apex => A record + www CNAME
    expect(body.data.dnsInstructions).toHaveLength(2);
    expect(body.data.dnsInstructions[0]).toMatchObject({
      type: 'A',
      host: '@',
      value: '76.76.21.21',
    });
    expect(body.data.dnsInstructions[1]).toMatchObject({
      type: 'CNAME',
      host: 'www',
      value: 'custom.vercel-dns.com',
    });

    // Vercel addDomain was called with resolved project id and clean domain
    expect(addDomainMock).toHaveBeenCalledWith('prj_123', 'example.com');

    // Legacy column on clientWebsites was updated to new primary domain
    const site = state.clientWebsites.find((r) => r.id === 55) as Record<string, unknown>;
    expect(site.domain).toBe('example.com');
  });

  it('produces CNAME-only DNS instructions for a subdomain (non-apex)', async () => {
    const res = await DOMAINS_POST(
      makePostReq({ domain: 'shop.example.com' }),
      siteParams('55'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.dnsInstructions).toHaveLength(1);
    expect(body.data.dnsInstructions[0]).toMatchObject({
      type: 'CNAME',
      host: 'shop',
      value: 'custom.vercel-dns.com',
    });
  });

  it('marks subsequent domain as non-primary and does NOT update legacy column', async () => {
    state.websiteDomains.push({
      id: 1,
      websiteId: 55,
      domain: 'first.com',
      isPrimary: true,
    });
    const res = await DOMAINS_POST(
      makePostReq({ domain: 'second.com' }),
      siteParams('55'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.isPrimary).toBe(false);

    const site = state.clientWebsites.find((r) => r.id === 55) as Record<string, unknown>;
    // Legacy column NOT changed because not primary
    expect(site.domain).toBeNull();
  });

  it('falls back to generic CNAME target when getDomainConfig throws', async () => {
    getDomainConfigMock.mockRejectedValueOnce(new Error('vercel api blew up'));
    const res = await DOMAINS_POST(
      makePostReq({ domain: 'shop.example.com' }),
      siteParams('55'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.dnsInstructions[0].value).toBe('cname.vercel-dns.com');
  });

  it('falls back to generic CNAME target when getDomainConfig returns no cnames', async () => {
    getDomainConfigMock.mockResolvedValueOnce({ cnames: [] });
    const res = await DOMAINS_POST(
      makePostReq({ domain: 'shop.example.com' }),
      siteParams('55'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.dnsInstructions[0].value).toBe('cname.vercel-dns.com');
  });

  it('returns 500 with err.message when addDomain rejects', async () => {
    addDomainMock.mockRejectedValueOnce(new Error('Domain already in use'));
    const res = await DOMAINS_POST(
      makePostReq({ domain: 'taken.com' }),
      siteParams('55'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('Domain already in use');
  });

  it('returns 500 with generic message when addDomain throws non-Error', async () => {
    addDomainMock.mockRejectedValueOnce('not-an-error');
    const res = await DOMAINS_POST(
      makePostReq({ domain: 'taken.com' }),
      siteParams('55'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('Failed to add domain');
  });
});

// ===========================================================================
// /api/portal/brain/drive-sync
// ===========================================================================

function makeDriveReq(qs = ''): Request {
  return new Request(`http://x/api/portal/brain/drive-sync${qs}`, { method: 'POST' });
}

function entitlementOk(): Record<string, unknown> {
  return {
    userId: 7,
    client: { id: 10 },
  };
}

function tenantCreds(): Record<string, unknown> {
  return {
    oauth: { clientId: 'g-id', clientSecret: 'g-secret' },
  };
}

function freshConn(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'conn-1',
    clientId: 10,
    userId: 7,
    accessToken: 'AT',
    refreshToken: 'RT',
    expiresAt: new Date(Date.now() + 60_000),
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    revokedAt: null,
    driveStartPageToken: 'spt-1',
    driveChannelId: null,
    driveChannelResourceId: null,
    driveChannelToken: null,
    driveChannelExpiration: null,
    ...over,
  };
}

describe('POST /api/portal/brain/drive-sync', () => {
  beforeEach(() => {
    requireBrainEntitlementMock.mockResolvedValue(entitlementOk());
    getTenantWorkspaceCredentialsByClientIdMock.mockResolvedValue(tenantCreds());
    refreshIfExpiredMock.mockResolvedValue({ refreshed: false });
    findMeetRecordingsFolderIdMock.mockResolvedValue('folder-1');
    syncDriveChangesForConnectionMock.mockResolvedValue({
      scanned: 5,
      ingested: 3,
      skipped: 1,
      errors: [],
      newPageToken: 'spt-2',
    });
  });

  it('short-circuits with the entitlement response when not entitled', async () => {
    const denied = new Response(
      JSON.stringify({ success: false, message: 'Brain not enabled' }),
      { status: 402 },
    );
    requireBrainEntitlementMock.mockResolvedValueOnce({ response: denied });
    const res = await DRIVE_SYNC_POST(makeDriveReq());
    expect(res.status).toBe(402);
  });

  it('returns 400 when user has no Google connection', async () => {
    const res = await DRIVE_SYNC_POST(makeDriveReq());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/No Google Workspace connection/);
  });

  it('returns 400 when connection lacks drive scope', async () => {
    state.googleWorkspaceUserConnections.push(
      freshConn({ scopes: ['https://www.googleapis.com/auth/gmail.readonly'] }),
    );
    const res = await DRIVE_SYNC_POST(makeDriveReq());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/lacks Drive scope/);
  });

  it('returns 500 when tenant credentials missing', async () => {
    state.googleWorkspaceUserConnections.push(freshConn());
    getTenantWorkspaceCredentialsByClientIdMock.mockResolvedValueOnce(null);
    const res = await DRIVE_SYNC_POST(makeDriveReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toMatch(/Tenant Workspace credentials/);
  });

  it('persists refreshed tokens when refreshIfExpired returns refreshed=true', async () => {
    state.googleWorkspaceUserConnections.push(freshConn());
    refreshIfExpiredMock.mockResolvedValueOnce({
      refreshed: true,
      accessToken: 'AT-new',
      refreshToken: 'RT-new',
      expiresAt: new Date(Date.now() + 120_000),
    });
    const res = await DRIVE_SYNC_POST(makeDriveReq());
    expect(res.status).toBe(200);
    const stored = state.googleWorkspaceUserConnections[0] as Record<string, unknown>;
    expect(stored.accessToken).toBe('AT-new');
    expect(stored.refreshToken).toBe('RT-new');
  });

  it('keeps existing refresh token when refresh response omits one', async () => {
    state.googleWorkspaceUserConnections.push(freshConn());
    refreshIfExpiredMock.mockResolvedValueOnce({
      refreshed: true,
      accessToken: 'AT-new',
      expiresAt: new Date(Date.now() + 120_000),
    });
    const res = await DRIVE_SYNC_POST(makeDriveReq());
    expect(res.status).toBe(200);
    const stored = state.googleWorkspaceUserConnections[0] as Record<string, unknown>;
    expect(stored.refreshToken).toBe('RT'); // unchanged from original
  });

  it('bootstraps a missing driveStartPageToken before running sync', async () => {
    state.googleWorkspaceUserConnections.push(freshConn({ driveStartPageToken: null }));
    getDriveStartPageTokenMock.mockResolvedValueOnce('bootstrapped-tok');
    const res = await DRIVE_SYNC_POST(makeDriveReq());
    expect(res.status).toBe(200);
    expect(getDriveStartPageTokenMock).toHaveBeenCalledTimes(1);
    const stored = state.googleWorkspaceUserConnections[0] as Record<string, unknown>;
    expect(stored.driveStartPageToken).toBe('bootstrapped-tok');
  });

  it('default mode: runs syncDriveChangesForConnection and returns its result', async () => {
    state.googleWorkspaceUserConnections.push(freshConn());
    const res = await DRIVE_SYNC_POST(makeDriveReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      meetRecordingsFolderId: 'folder-1',
      scanned: 5,
      ingested: 3,
      skipped: 1,
      newPageToken: 'spt-2',
    });
    expect(syncDriveChangesForConnectionMock).toHaveBeenCalledTimes(1);
  });

  it('mode=backfill returns 400 when Meet Recordings folder cannot be found', async () => {
    state.googleWorkspaceUserConnections.push(freshConn());
    findMeetRecordingsFolderIdMock.mockResolvedValueOnce(null);
    const res = await DRIVE_SYNC_POST(makeDriveReq('?mode=backfill'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Meet Recordings folder not found/);
  });

  it('mode=backfill calls backfillMeetRecordingsFolder with capped limit', async () => {
    state.googleWorkspaceUserConnections.push(freshConn());
    backfillMeetRecordingsFolderMock.mockResolvedValueOnce({
      scanned: 12,
      ingested: 8,
      skipped: 4,
      errors: [],
    });
    const res = await DRIVE_SYNC_POST(makeDriveReq('?mode=backfill&limit=500'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.mode).toBe('backfill');
    expect(body.data.ingested).toBe(8);
    expect(backfillMeetRecordingsFolderMock).toHaveBeenCalledTimes(1);
    const args = backfillMeetRecordingsFolderMock.mock.calls[0][0] as {
      limit: number;
    };
    expect(args.limit).toBe(200); // capped from 500
  });

  it('mode=backfill defaults limit to 50 when not provided', async () => {
    state.googleWorkspaceUserConnections.push(freshConn());
    backfillMeetRecordingsFolderMock.mockResolvedValueOnce({
      scanned: 0,
      ingested: 0,
      skipped: 0,
      errors: [],
    });
    const res = await DRIVE_SYNC_POST(makeDriveReq('?mode=backfill'));
    expect(res.status).toBe(200);
    const args = backfillMeetRecordingsFolderMock.mock.calls[0][0] as {
      limit: number;
    };
    expect(args.limit).toBe(50);
  });

  it('mode=unsubscribe tears down existing channel and returns stopped', async () => {
    state.googleWorkspaceUserConnections.push(
      freshConn({
        driveChannelId: 'ch-1',
        driveChannelResourceId: 'res-1',
        driveChannelToken: 'tok-1',
        driveChannelExpiration: new Date(Date.now() + 60_000),
      }),
    );
    stopDriveChangesMock.mockResolvedValueOnce(undefined);
    const res = await DRIVE_SYNC_POST(makeDriveReq('?mode=unsubscribe'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ mode: 'unsubscribe', state: 'stopped' });
    expect(stopDriveChangesMock).toHaveBeenCalledTimes(1);
    const stored = state.googleWorkspaceUserConnections[0] as Record<string, unknown>;
    expect(stored.driveChannelId).toBeNull();
    expect(stored.driveChannelResourceId).toBeNull();
  });

  it('mode=subscribe opens a watch channel and persists ids', async () => {
    state.googleWorkspaceUserConnections.push(freshConn());
    const expiration = new Date(Date.now() + 3_600_000);
    subscribeDriveChangesMock.mockResolvedValueOnce({
      channelId: 'ch-new',
      resourceId: 'res-new',
      channelToken: 'tok-new',
      expiration,
    });
    const res = await DRIVE_SYNC_POST(makeDriveReq('?mode=subscribe'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({
      mode: 'subscribe',
      channelId: 'ch-new',
    });
    expect(body.data.expiration).toBe(expiration.toISOString());
    expect(body.data.webhookAddress).toMatch(/\/api\/google-webhook\/drive$/);

    const stored = state.googleWorkspaceUserConnections[0] as Record<string, unknown>;
    expect(stored.driveChannelId).toBe('ch-new');
    expect(stored.driveChannelResourceId).toBe('res-new');
  });

  it('mode=subscribe tears down prior channel before opening a new one', async () => {
    state.googleWorkspaceUserConnections.push(
      freshConn({
        driveChannelId: 'ch-old',
        driveChannelResourceId: 'res-old',
      }),
    );
    subscribeDriveChangesMock.mockResolvedValueOnce({
      channelId: 'ch-new',
      resourceId: 'res-new',
      channelToken: 'tok-new',
      expiration: new Date(Date.now() + 3_600_000),
    });
    const res = await DRIVE_SYNC_POST(makeDriveReq('?mode=subscribe'));
    expect(res.status).toBe(200);
    expect(stopDriveChangesMock).toHaveBeenCalledTimes(1);
    expect(subscribeDriveChangesMock).toHaveBeenCalledTimes(1);
  });

  it('mode=subscribe swallows stopDriveChanges errors and proceeds to subscribe', async () => {
    state.googleWorkspaceUserConnections.push(
      freshConn({
        driveChannelId: 'ch-old',
        driveChannelResourceId: 'res-old',
      }),
    );
    stopDriveChangesMock.mockRejectedValueOnce(new Error('stop blew up'));
    subscribeDriveChangesMock.mockResolvedValueOnce({
      channelId: 'ch-new',
      resourceId: 'res-new',
      channelToken: 'tok-new',
      expiration: new Date(Date.now() + 3_600_000),
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await DRIVE_SYNC_POST(makeDriveReq('?mode=subscribe'));
    expect(res.status).toBe(200);
    expect(subscribeDriveChangesMock).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});
