// @vitest-environment node
/**
 * Batch 33g — unit tests for 4 portal websites route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/websites/[siteId]/domains/[domainId]/route.ts            (DELETE, PATCH)
 *  - app/api/portal/websites/[siteId]/domains/[domainId]/verify/route.ts     (POST)
 *  - app/api/portal/websites/[siteId]/environments/[envId]/backup/route.ts   (GET, POST)
 *  - app/api/portal/websites/[siteId]/environments/[envId]/copy/route.ts     (POST)
 *
 * Strategy: heavy mocking — db.select() shares one queue of result rows;
 * chain methods return a thenable that materializes on `await` (or on
 * terminal `.limit` / `.orderBy`). db.insert / db.update / db.delete are
 * mocked to capture writes and emit queued return rows. lib/vercel and
 * lib/environment-helpers are stubbed with vi.fn() spies.
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
const resolvePortalSiteMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
  resolvePortalSite: (...args: unknown[]) => resolvePortalSiteMock(...args),
}));

const removeDomainMock = vi.fn();
const verifyDomainMock = vi.fn();
const resolveDomainProjectIdMock = vi.fn();
vi.mock('@/lib/vercel', () => ({
  removeDomain: (...args: unknown[]) => removeDomainMock(...args),
  verifyDomain: (...args: unknown[]) => verifyDomainMock(...args),
  resolveDomainProjectId: (...args: unknown[]) => resolveDomainProjectIdMock(...args),
}));

const getEnvironmentForClientMock = vi.fn();
const snapshotEnvironmentMock = vi.fn();
vi.mock('@/lib/environment-helpers', () => ({
  getEnvironmentForClient: (...args: unknown[]) => getEnvironmentForClientMock(...args),
  snapshotEnvironment: (...args: unknown[]) => snapshotEnvironmentMock(...args),
}));

// drizzle-orm operators — inert objects
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  gte: (a: unknown, b: unknown) => ({ op: 'gte', a, b }),
  lte: (a: unknown, b: unknown) => ({ op: 'lte', a, b }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings,
      values,
    }),
    {
      raw: (s: string) => ({ op: 'sql.raw', s }),
    },
  ),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// schema — proxy tables. Any column accessed returns a marker so
// orderBy(websiteDomains.createdAt) etc. won't blow up.
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
  return new Proxy({
    clientWebsites: wrap('clientWebsites'),
    websiteDomains: wrap('websiteDomains'),
    websiteBackups: wrap('websiteBackups'),
    websiteEnvironments: wrap('websiteEnvironments'),
    websiteEnvVars: wrap('websiteEnvVars'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// db mock: select-queue + write capture
// ---------------------------------------------------------------------------

interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
}

interface UpdateCall {
  table: string;
  set: Record<string, unknown>;
}

interface DeleteCall {
  table: string;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
const insertCalls: InsertCall[] = [];
const updateCalls: UpdateCall[] = [];
const deleteCalls: DeleteCall[] = [];

function shiftNext(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = () => {
      if (!materializedPromise) materializedPromise = Promise.resolve(shiftNext());
      return materializedPromise;
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
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
      return materialize().then(onF, onR);
    };
    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        insertCalls.push({ table: table.__table, values: v });
        const rows = insertReturnQueue.shift() ?? [];
        const ret = {
          returning() {
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
          then(onF: (val: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(rows.map((r) => ({ ...r }))).then(onF, onR);
          },
        };
        return ret;
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(s: Record<string, unknown>) {
        updateCalls.push({ table: table.__table, set: s });
        return {
          where() {
            return Promise.resolve(undefined);
          },
        };
      },
    };
  }

  function buildDelete(table: { __table: string }) {
    deleteCalls.push({ table: table.__table });
    return {
      where() {
        return Promise.resolve(undefined);
      },
    };
  }

  return {
    db: {
      select() {
        return buildSelect();
      },
      selectDistinct() {
        return buildSelect();
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
      delete(table: { __table: string }) {
        return buildDelete(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Routes under test (imported AFTER all mocks).
// ---------------------------------------------------------------------------

const domainRoute = await import('@/app/api/portal/websites/[siteId]/domains/[domainId]/route');
const domainVerifyRoute = await import(
  '@/app/api/portal/websites/[siteId]/domains/[domainId]/verify/route'
);
const backupRoute = await import(
  '@/app/api/portal/websites/[siteId]/environments/[envId]/backup/route'
);
const copyRoute = await import(
  '@/app/api/portal/websites/[siteId]/environments/[envId]/copy/route'
);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeJsonReq(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

const SESSION = { user: { id: '7' } };

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  removeDomainMock.mockReset();
  verifyDomainMock.mockReset();
  resolveDomainProjectIdMock.mockReset();
  getEnvironmentForClientMock.mockReset();
  snapshotEnvironmentMock.mockReset();
  // Default resolveDomainProjectId returns a stable string id.
  resolveDomainProjectIdMock.mockImplementation((id: string | null | undefined) => id ?? 'platform');
});

// ===========================================================================
// DELETE /api/portal/websites/[siteId]/domains/[domainId]
// ===========================================================================

describe('DELETE /api/portal/websites/[siteId]/domains/[domainId]', () => {
  const params = Promise.resolve({ siteId: '1', domainId: '10' });
  const reparams = () => Promise.resolve({ siteId: '1', domainId: '10' });

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await domainRoute.DELETE(makeReq('http://x/'), { params: reparams() });
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await domainRoute.DELETE(makeReq('http://x/'), { params: reparams() });
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await domainRoute.DELETE(makeReq('http://x/'), { params: reparams() });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 404 when site is not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // site lookup empty
    const res = await domainRoute.DELETE(makeReq('http://x/'), { params: reparams() });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Website not found');
  });

  it('returns 404 when domain is not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, vercelProjectId: 'prj_abc' }]);
    selectQueue.push([]); // domain lookup empty
    const res = await domainRoute.DELETE(makeReq('http://x/'), { params: reparams() });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Domain not found');
  });

  it('deletes a non-primary domain successfully', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, vercelProjectId: 'prj_abc' }]);
    selectQueue.push([
      { id: 10, websiteId: 1, domain: 'extra.com', isPrimary: false },
    ]);
    removeDomainMock.mockResolvedValue(undefined);

    const res = await domainRoute.DELETE(makeReq('http://x/'), { params: reparams() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe('Domain removed.');
    expect(removeDomainMock).toHaveBeenCalledWith('prj_abc', 'extra.com');
    expect(deleteCalls.some((c) => c.table === 'websiteDomains')).toBe(true);
    // No isPrimary path → no clientWebsites update.
    expect(updateCalls.find((u) => u.table === 'clientWebsites')).toBeUndefined();
  });

  it('promotes the next domain to primary when deleting a primary with siblings', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, vercelProjectId: 'prj_abc' }]);
    selectQueue.push([
      { id: 10, websiteId: 1, domain: 'old.com', isPrimary: true },
    ]);
    // next-primary lookup returns a sibling
    selectQueue.push([{ id: 11, websiteId: 1, domain: 'new.com', isPrimary: false }]);
    removeDomainMock.mockResolvedValue(undefined);

    const res = await domainRoute.DELETE(makeReq('http://x/'), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    // websiteDomains updated to set isPrimary:true on sibling
    const domainUpdate = updateCalls.find(
      (u) => u.table === 'websiteDomains' && u.set.isPrimary === true,
    );
    expect(domainUpdate).toBeDefined();
    // clientWebsites updated with the new primary domain string
    const clientUpdate = updateCalls.find((u) => u.table === 'clientWebsites');
    expect(clientUpdate?.set.domain).toBe('new.com');
  });

  it('clears the legacy domain column when deleting the last primary', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, vercelProjectId: 'prj_abc' }]);
    selectQueue.push([
      { id: 10, websiteId: 1, domain: 'only.com', isPrimary: true },
    ]);
    selectQueue.push([]); // no siblings
    removeDomainMock.mockResolvedValue(undefined);

    const res = await domainRoute.DELETE(makeReq('http://x/'), { params: reparams() });
    expect(res.status).toBe(200);
    const clientUpdate = updateCalls.find((u) => u.table === 'clientWebsites');
    expect(clientUpdate?.set.domain).toBeNull();
  });

  it('still deletes the DB row when Vercel removal throws (non-fatal)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, vercelProjectId: 'prj_abc' }]);
    selectQueue.push([
      { id: 10, websiteId: 1, domain: 'flaky.com', isPrimary: false },
    ]);
    removeDomainMock.mockRejectedValue(new Error('vercel down'));

    const res = await domainRoute.DELETE(makeReq('http://x/'), { params: reparams() });
    expect(res.status).toBe(200);
    expect(deleteCalls.some((c) => c.table === 'websiteDomains')).toBe(true);
  });
});

// ===========================================================================
// PATCH /api/portal/websites/[siteId]/domains/[domainId]
// ===========================================================================

describe('PATCH /api/portal/websites/[siteId]/domains/[domainId]', () => {
  const reparams = () => Promise.resolve({ siteId: '1', domainId: '10' });

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await domainRoute.PATCH(
      makeJsonReq('http://x/', 'PATCH', { isPrimary: true }),
      { params: reparams() },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await domainRoute.PATCH(
      makeJsonReq('http://x/', 'PATCH', { isPrimary: true }),
      { params: reparams() },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 404 when site is not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]);
    const res = await domainRoute.PATCH(
      makeJsonReq('http://x/', 'PATCH', { isPrimary: true }),
      { params: reparams() },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Website not found');
  });

  it('returns 404 when domain is not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5 }]);
    selectQueue.push([]);
    const res = await domainRoute.PATCH(
      makeJsonReq('http://x/', 'PATCH', { isPrimary: true }),
      { params: reparams() },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Domain not found');
  });

  it('promotes the domain to primary when body.isPrimary is true', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5 }]);
    selectQueue.push([
      { id: 10, websiteId: 1, domain: 'newprimary.com', isPrimary: false },
    ]);

    const res = await domainRoute.PATCH(
      makeJsonReq('http://x/', 'PATCH', { isPrimary: true }),
      { params: reparams() },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe('Domain updated.');

    // First call clears all isPrimary, second sets new primary, third updates clientWebsites.
    const domainUpdates = updateCalls.filter((u) => u.table === 'websiteDomains');
    expect(domainUpdates.length).toBeGreaterThanOrEqual(2);
    expect(domainUpdates[0].set.isPrimary).toBe(false);
    expect(domainUpdates[1].set.isPrimary).toBe(true);
    const clientUpdate = updateCalls.find((u) => u.table === 'clientWebsites');
    expect(clientUpdate?.set.domain).toBe('newprimary.com');
  });

  it('is a no-op when body.isPrimary is false/absent', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5 }]);
    selectQueue.push([{ id: 10, websiteId: 1, domain: 'x.com', isPrimary: false }]);

    const res = await domainRoute.PATCH(
      makeJsonReq('http://x/', 'PATCH', { something: 'else' }),
      { params: reparams() },
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(0);
  });
});

// ===========================================================================
// POST /api/portal/websites/[siteId]/domains/[domainId]/verify
// ===========================================================================

describe('POST /api/portal/websites/[siteId]/domains/[domainId]/verify', () => {
  const reparams = () => Promise.resolve({ siteId: '1', domainId: '10' });

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await domainVerifyRoute.POST(makeReq('http://x/'), { params: reparams() });
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await domainVerifyRoute.POST(makeReq('http://x/'), { params: reparams() });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 404 when site is not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]);
    const res = await domainVerifyRoute.POST(makeReq('http://x/'), { params: reparams() });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Website not found');
  });

  it('returns 404 when domain is not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, vercelProjectId: 'prj_abc' }]);
    selectQueue.push([]);
    const res = await domainVerifyRoute.POST(makeReq('http://x/'), { params: reparams() });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Domain not found');
  });

  it('returns verified=true and updates DB when verifier returns clean state', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, vercelProjectId: 'prj_abc' }]);
    selectQueue.push([{ id: 10, websiteId: 1, domain: 'good.com' }]);
    verifyDomainMock.mockResolvedValue({
      verified: true,
      misconfigured: false,
      dnsRecords: [{ name: '@', type: 'A', value: '76.76.21.21' }],
    });

    const res = await domainVerifyRoute.POST(makeReq('http://x/'), { params: reparams() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.verified).toBe(true);
    expect(body.data.misconfigured).toBe(false);
    expect(body.data.status).toBe('verified');
    expect(body.message).toBe('Domain verified and DNS is correctly configured.');
    // DB row updated with status:'verified'
    const upd = updateCalls.find(
      (u) => u.table === 'websiteDomains' && u.set.status === 'verified',
    );
    expect(upd).toBeDefined();
    expect(upd?.set.verifiedAt).toBeInstanceOf(Date);
  });

  it('returns verified=true but no DB update when misconfigured', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, vercelProjectId: 'prj_abc' }]);
    selectQueue.push([{ id: 10, websiteId: 1, domain: 'half.com' }]);
    verifyDomainMock.mockResolvedValue({
      verified: true,
      misconfigured: true,
      dnsRecords: [],
    });

    const res = await domainVerifyRoute.POST(makeReq('http://x/'), { params: reparams() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.verified).toBe(true);
    expect(body.data.misconfigured).toBe(true);
    expect(body.data.status).toBe('pending');
    expect(body.message).toBe('Domain ownership verified but DNS is still misconfigured.');
    expect(updateCalls.find((u) => u.set.status === 'verified')).toBeUndefined();
  });

  it('returns verified=false with pending message', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, vercelProjectId: 'prj_abc' }]);
    selectQueue.push([{ id: 10, websiteId: 1, domain: 'pending.com' }]);
    verifyDomainMock.mockResolvedValue({
      verified: false,
      misconfigured: true,
      dnsRecords: [],
    });

    const res = await domainVerifyRoute.POST(makeReq('http://x/'), { params: reparams() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.verified).toBe(false);
    expect(body.data.status).toBe('pending');
    expect(body.message).toBe(
      'Domain not yet verified. Make sure your DNS records are set correctly.',
    );
  });

  it('returns 500 when verifyDomain throws', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, vercelProjectId: 'prj_abc' }]);
    selectQueue.push([{ id: 10, websiteId: 1, domain: 'boom.com' }]);
    verifyDomainMock.mockRejectedValue(new Error('vercel exploded'));

    const res = await domainVerifyRoute.POST(makeReq('http://x/'), { params: reparams() });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('vercel exploded');
  });

  it('returns 500 with default message when verifyDomain throws non-Error', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, vercelProjectId: 'prj_abc' }]);
    selectQueue.push([{ id: 10, websiteId: 1, domain: 'weird.com' }]);
    verifyDomainMock.mockRejectedValue('string thrown');

    const res = await domainVerifyRoute.POST(makeReq('http://x/'), { params: reparams() });
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('Verification failed');
  });
});

// ===========================================================================
// GET /api/portal/websites/[siteId]/environments/[envId]/backup
// ===========================================================================

describe('GET /api/portal/websites/[siteId]/environments/[envId]/backup', () => {
  const reparams = () => Promise.resolve({ siteId: '1', envId: '2' });

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await backupRoute.GET(makeReq('http://x/'), { params: reparams() });
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await backupRoute.GET(makeReq('http://x/'), { params: reparams() });
    expect(res.status).toBe(401);
  });

  it('returns 404 when env/site lookup returns null', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(null);
    const res = await backupRoute.GET(makeReq('http://x/'), { params: reparams() });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns the list of backups for an env', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue({
      env: { id: 22, name: 'prod' },
      site: { id: 1 },
    });
    const now = new Date('2026-05-18T00:00:00.000Z');
    selectQueue.push([
      { id: 1001, name: 'Manual backup', createdAt: now },
      { id: 1002, name: 'Auto', createdAt: now },
    ]);
    const res = await backupRoute.GET(makeReq('http://x/'), { params: reparams() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].id).toBe(1001);
    expect(body.data[0].name).toBe('Manual backup');
  });

  it('returns an empty list when no backups exist', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue({
      env: { id: 22, name: 'prod' },
      site: { id: 1 },
    });
    selectQueue.push([]);
    const res = await backupRoute.GET(makeReq('http://x/'), { params: reparams() });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });
});

// ===========================================================================
// POST /api/portal/websites/[siteId]/environments/[envId]/backup
// ===========================================================================

describe('POST /api/portal/websites/[siteId]/environments/[envId]/backup', () => {
  const reparams = () => Promise.resolve({ siteId: '1', envId: '2' });

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await backupRoute.POST(
      makeJsonReq('http://x/', 'POST', { name: 'X' }),
      { params: reparams() },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when env/site lookup returns null', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(null);
    const res = await backupRoute.POST(
      makeJsonReq('http://x/', 'POST', { name: 'X' }),
      { params: reparams() },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('creates a backup using the provided name', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue({
      env: { id: 22, name: 'prod' },
      site: { id: 1 },
    });
    snapshotEnvironmentMock.mockResolvedValue({ snapshot: { posts: [], envVars: [] } });
    insertReturnQueue.push([{ id: 5555, name: 'Pre-deploy snapshot' }]);

    const res = await backupRoute.POST(
      makeJsonReq('http://x/', 'POST', { name: 'Pre-deploy snapshot' }),
      { params: reparams() },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ id: 5555, name: 'Pre-deploy snapshot' });
    expect(body.message).toBe('Backup created.');
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('websiteBackups');
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.environmentId).toBe(22);
    expect(inserted.name).toBe('Pre-deploy snapshot');
    expect(inserted.createdBy).toBe(7);
    expect(inserted.snapshot).toEqual({ snapshot: { posts: [], envVars: [] } });
  });

  it('falls back to a generated name when body.name is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue({
      env: { id: 22, name: 'staging' },
      site: { id: 1 },
    });
    snapshotEnvironmentMock.mockResolvedValue({ foo: 'bar' });
    insertReturnQueue.push([{ id: 9, name: 'auto' }]);
    const res = await backupRoute.POST(
      makeJsonReq('http://x/', 'POST', {}),
      { params: reparams() },
    );
    expect(res.status).toBe(200);
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.name).toMatch(/^staging backup —/);
  });

  it('handles unparseable JSON body without throwing', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue({
      env: { id: 22, name: 'staging' },
      site: { id: 1 },
    });
    snapshotEnvironmentMock.mockResolvedValue({});
    insertReturnQueue.push([{ id: 11, name: 'x' }]);
    // Request without a JSON body — req.json() will throw and the route .catch(() => ({}))
    const req = new Request('http://x/', { method: 'POST' });
    const res = await backupRoute.POST(req, { params: reparams() });
    expect(res.status).toBe(200);
    expect(insertCalls).toHaveLength(1);
  });
});

// ===========================================================================
// POST /api/portal/websites/[siteId]/environments/[envId]/copy
// ===========================================================================

describe('POST /api/portal/websites/[siteId]/environments/[envId]/copy', () => {
  const reparams = () => Promise.resolve({ siteId: '1', envId: '2' });

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await copyRoute.POST(
      makeJsonReq('http://x/', 'POST', { fromEnvironmentId: 3 }),
      { params: reparams() },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when env/site lookup returns null', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(null);
    const res = await copyRoute.POST(
      makeJsonReq('http://x/', 'POST', { fromEnvironmentId: 3 }),
      { params: reparams() },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns 400 when fromEnvironmentId is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue({
      env: { id: 22, name: 'prod' },
      site: { id: 1 },
    });
    const res = await copyRoute.POST(
      makeJsonReq('http://x/', 'POST', {}),
      { params: reparams() },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('fromEnvironmentId is required');
  });

  it('returns 404 when source environment is not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue({
      env: { id: 22, name: 'prod' },
      site: { id: 1 },
    });
    selectQueue.push([]); // source env lookup empty
    const res = await copyRoute.POST(
      makeJsonReq('http://x/', 'POST', { fromEnvironmentId: 999 }),
      { params: reparams() },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Source environment not found');
  });

  it('copies env vars from source to target, creating an auto-backup', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue({
      env: { id: 22, name: 'prod' },
      site: { id: 1 },
    });
    snapshotEnvironmentMock.mockResolvedValue({ before: true });
    // source environment exists
    selectQueue.push([{ id: 33, name: 'staging', websiteId: 1 }]);
    // source env vars
    selectQueue.push([
      { key: 'DATABASE_URL', value: 'postgres://...' },
      { key: 'API_KEY', value: 'abc123' },
    ]);

    const res = await copyRoute.POST(
      makeJsonReq('http://x/', 'POST', { fromEnvironmentId: 33 }),
      { params: reparams() },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain('Copied 2 variables from staging');

    // Two inserts: the auto-backup + the env-var batch
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0].table).toBe('websiteBackups');
    const backupInsert = insertCalls[0].values as Record<string, unknown>;
    expect(backupInsert.environmentId).toBe(22);
    expect(String(backupInsert.name)).toContain('Auto-backup before copy from staging');
    expect(backupInsert.snapshot).toEqual({ before: true });

    expect(insertCalls[1].table).toBe('websiteEnvVars');
    const varsInsert = insertCalls[1].values as Record<string, unknown>[];
    expect(varsInsert).toHaveLength(2);
    expect(varsInsert[0]).toMatchObject({
      environmentId: 22,
      key: 'DATABASE_URL',
      value: 'postgres://...',
      syncedToVercel: false,
    });
    expect(varsInsert[1].key).toBe('API_KEY');

    // Old target env vars must be deleted first
    expect(deleteCalls.some((c) => c.table === 'websiteEnvVars')).toBe(true);
  });

  it('handles a source with zero env vars (singular grammar + no batch insert)', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue({
      env: { id: 22, name: 'prod' },
      site: { id: 1 },
    });
    snapshotEnvironmentMock.mockResolvedValue({});
    selectQueue.push([{ id: 33, name: 'empty-env', websiteId: 1 }]);
    selectQueue.push([]); // no source vars

    const res = await copyRoute.POST(
      makeJsonReq('http://x/', 'POST', { fromEnvironmentId: 33 }),
      { params: reparams() },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain('Copied 0 variables from empty-env');
    // Only the auto-backup insert was made; no env-vars insert.
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('websiteBackups');
    expect(deleteCalls.some((c) => c.table === 'websiteEnvVars')).toBe(true);
  });

  it('uses singular "variable" when exactly one is copied', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue({
      env: { id: 22, name: 'prod' },
      site: { id: 1 },
    });
    snapshotEnvironmentMock.mockResolvedValue({});
    selectQueue.push([{ id: 33, name: 'staging', websiteId: 1 }]);
    selectQueue.push([{ key: 'SOLO', value: 'one' }]);

    const res = await copyRoute.POST(
      makeJsonReq('http://x/', 'POST', { fromEnvironmentId: 33 }),
      { params: reparams() },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).message).toContain('Copied 1 variable from staging');
  });
});
