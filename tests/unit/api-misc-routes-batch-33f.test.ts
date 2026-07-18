// @vitest-environment node
/**
 * Batch 33f — unit tests for 4 portal route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/websites/[siteId]/deployments/[deploymentId]/logs/route.ts (GET)
 *  - app/api/portal/websites/[siteId]/deployments/route.ts                     (GET)
 *  - app/api/portal/websites/[siteId]/domain/route.ts                          (POST)
 *  - app/api/portal/websites/[siteId]/domain/verify/route.ts                   (POST)
 *
 * Strategy: heavy mocking — auth, getPortalClient, db.select (queue), db.update
 * (capture), and lib/vercel are all mocked. No network, no real DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const getDeploymentEventsMock = vi.fn();
const getDeploymentsMock = vi.fn();
const addDomainMock = vi.fn();
const verifyDomainMock = vi.fn();
const resolveDomainProjectIdMock = vi.fn();
vi.mock('@/lib/vercel', () => ({
  getDeploymentEvents: (...args: unknown[]) => getDeploymentEventsMock(...args),
  getDeployments: (...args: unknown[]) => getDeploymentsMock(...args),
  addDomain: (...args: unknown[]) => addDomainMock(...args),
  verifyDomain: (...args: unknown[]) => verifyDomainMock(...args),
  resolveDomainProjectId: (...args: unknown[]) => resolveDomainProjectIdMock(...args),
}));

// We don't need to mock normalize-domain — its real implementation is pure
// and safe to call in unit tests. The route uses it for input normalization.

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
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
          if (prop === 'then') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    clientWebsites: wrap('clientWebsites'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// db mock: select queue + update capture
// ---------------------------------------------------------------------------

interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
const updateCalls: UpdateCall[] = [];

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
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'groupBy', 'limit', 'offset']) {
      chain[m] = passthrough;
    }
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            updateCalls.push({ table: table.__table, patch, filter });
            return {
              returning() {
                return Promise.resolve([]);
              },
              then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                return Promise.resolve(undefined).then(onF, onR);
              },
            };
          },
        };
      },
    };
  }

  return {
    db: {
      select() {
        return buildSelect();
      },
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Routes under test (imported AFTER all mocks)
// ---------------------------------------------------------------------------

const logsRoute = await import(
  '@/app/api/portal/websites/[siteId]/deployments/[deploymentId]/logs/route'
);
const deploymentsRoute = await import(
  '@/app/api/portal/websites/[siteId]/deployments/route'
);
const domainRoute = await import('@/app/api/portal/websites/[siteId]/domain/route');
const domainVerifyRoute = await import(
  '@/app/api/portal/websites/[siteId]/domain/verify/route'
);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

function makeJsonReq(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const SESSION = { user: { id: '7' } };

beforeEach(() => {
  selectQueue = [];
  updateCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  getDeploymentEventsMock.mockReset();
  getDeploymentsMock.mockReset();
  addDomainMock.mockReset();
  verifyDomainMock.mockReset();
  resolveDomainProjectIdMock.mockReset();
});

// ===========================================================================
// GET /api/portal/websites/[siteId]/deployments/[deploymentId]/logs
// ===========================================================================

describe('GET /api/portal/websites/[siteId]/deployments/[deploymentId]/logs', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await logsRoute.GET(
      makeReq('http://x/api/portal/websites/1/deployments/d1/logs'),
      { params: Promise.resolve({ siteId: '1', deploymentId: 'd1' }) },
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Unauthorized');
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await logsRoute.GET(
      makeReq('http://x/api/portal/websites/1/deployments/d1/logs'),
      { params: Promise.resolve({ siteId: '1', deploymentId: 'd1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 404 when site is missing or not owned', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // site lookup empty
    const res = await logsRoute.GET(
      makeReq('http://x/api/portal/websites/1/deployments/d1/logs'),
      { params: Promise.resolve({ siteId: '1', deploymentId: 'd1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Website not found');
  });

  it('returns 400 when site has no vercelProjectId', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, vercelProjectId: null }]);
    const res = await logsRoute.GET(
      makeReq('http://x/api/portal/websites/1/deployments/d1/logs'),
      { params: Promise.resolve({ siteId: '1', deploymentId: 'd1' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Website not provisioned');
  });

  it('returns 200 with deployment events on success', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, vercelProjectId: 'prj_123' }]);
    getDeploymentEventsMock.mockResolvedValue([
      { type: 'stdout', text: 'building...' },
      { type: 'stdout', text: 'done' },
    ]);
    const res = await logsRoute.GET(
      makeReq('http://x/api/portal/websites/1/deployments/d1/logs'),
      { params: Promise.resolve({ siteId: '1', deploymentId: 'd1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(getDeploymentEventsMock).toHaveBeenCalledWith('d1');
  });

  it('returns 500 when getDeploymentEvents throws Error', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, vercelProjectId: 'prj_123' }]);
    getDeploymentEventsMock.mockRejectedValue(new Error('vercel down'));
    const res = await logsRoute.GET(
      makeReq('http://x/api/portal/websites/1/deployments/d1/logs'),
      { params: Promise.resolve({ siteId: '1', deploymentId: 'd1' }) },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('vercel down');
  });

  it('returns 500 with generic message when getDeploymentEvents rejects non-Error', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, vercelProjectId: 'prj_123' }]);
    getDeploymentEventsMock.mockRejectedValue('boom');
    const res = await logsRoute.GET(
      makeReq('http://x/api/portal/websites/1/deployments/d1/logs'),
      { params: Promise.resolve({ siteId: '1', deploymentId: 'd1' }) },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('Failed to fetch logs');
  });
});

// ===========================================================================
// GET /api/portal/websites/[siteId]/deployments
// ===========================================================================

describe('GET /api/portal/websites/[siteId]/deployments', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await deploymentsRoute.GET(
      makeReq('http://x/api/portal/websites/1/deployments'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await deploymentsRoute.GET(
      makeReq('http://x/api/portal/websites/1/deployments'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 404 when site is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]);
    const res = await deploymentsRoute.GET(
      makeReq('http://x/api/portal/websites/1/deployments'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Website not found');
  });

  it('returns 200 with empty array when site has no vercelProjectId', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, vercelProjectId: null }]);
    const res = await deploymentsRoute.GET(
      makeReq('http://x/api/portal/websites/1/deployments'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(getDeploymentsMock).not.toHaveBeenCalled();
  });

  it('returns 200 with deployments on success', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, vercelProjectId: 'prj_123' }]);
    getDeploymentsMock.mockResolvedValue([
      { id: 'dpl_1', state: 'READY' },
      { id: 'dpl_2', state: 'BUILDING' },
    ]);
    const res = await deploymentsRoute.GET(
      makeReq('http://x/api/portal/websites/1/deployments'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(getDeploymentsMock).toHaveBeenCalledWith('prj_123');
  });

  it('returns 200 with empty array + message when getDeployments throws', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, vercelProjectId: 'prj_123' }]);
    getDeploymentsMock.mockRejectedValue(new Error('vercel api blew up'));
    const res = await deploymentsRoute.GET(
      makeReq('http://x/api/portal/websites/1/deployments'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.message).toBe('Could not fetch deployments');
  });
});

// ===========================================================================
// POST /api/portal/websites/[siteId]/domain
// ===========================================================================

describe('POST /api/portal/websites/[siteId]/domain', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await domainRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/domain', 'POST', {
        customDomain: 'example.com',
      }),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await domainRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/domain', 'POST', {
        customDomain: 'example.com',
      }),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 404 when site is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]);
    const res = await domainRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/domain', 'POST', {
        customDomain: 'example.com',
      }),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Website not found');
  });

  it('returns 400 when site has no vercelProjectId', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, vercelProjectId: null }]);
    const res = await domainRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/domain', 'POST', {
        customDomain: 'example.com',
      }),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/must be provisioned/);
  });

  it('returns 400 when customDomain is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, vercelProjectId: 'prj_123' }]);
    const res = await domainRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/domain', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('customDomain is required.');
  });

  it('returns 400 when customDomain is not a string', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, vercelProjectId: 'prj_123' }]);
    const res = await domainRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/domain', 'POST', { customDomain: 123 }),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('customDomain is required.');
  });

  it('adds domain, updates DB, and returns DNS instructions on success', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, vercelProjectId: 'prj_123' }]);
    addDomainMock.mockResolvedValue({ apexName: 'example.com', verified: false });
    const res = await domainRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/domain', 'POST', {
        customDomain: 'HTTPS://Example.COM/',
      }),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.domain).toBe('example.com'); // normalized
    expect(body.data.dnsInstructions).toHaveLength(2);
    expect(body.data.dnsInstructions[0]).toMatchObject({
      type: 'CNAME',
      host: 'www',
      value: 'cname.vercel-dns.com',
    });
    expect(body.data.dnsInstructions[1]).toMatchObject({
      type: 'A',
      host: '@',
      value: '76.76.21.21',
    });
    expect(addDomainMock).toHaveBeenCalledWith('prj_123', 'example.com');
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('clientWebsites');
    expect(updateCalls[0].patch.domain).toBe('example.com');
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
  });

  it('returns 500 when addDomain throws Error', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, vercelProjectId: 'prj_123' }]);
    addDomainMock.mockRejectedValue(new Error('already attached'));
    const res = await domainRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/domain', 'POST', {
        customDomain: 'example.com',
      }),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('already attached');
    expect(updateCalls).toHaveLength(0);
  });

  it('returns 500 with generic message when addDomain rejects non-Error', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, vercelProjectId: 'prj_123' }]);
    addDomainMock.mockRejectedValue('boom');
    const res = await domainRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/domain', 'POST', {
        customDomain: 'example.com',
      }),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('Failed to add domain');
  });
});

// ===========================================================================
// POST /api/portal/websites/[siteId]/domain/verify
// ===========================================================================

describe('POST /api/portal/websites/[siteId]/domain/verify', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await domainVerifyRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/domain/verify', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await domainVerifyRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/domain/verify', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 404 when site is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]);
    const res = await domainVerifyRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/domain/verify', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Website not found');
  });

  it('returns 400 when site has no custom domain set', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, vercelProjectId: 'prj_123', domain: null }]);
    const res = await domainVerifyRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/domain/verify', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('No custom domain configured');
  });

  it('returns 200 with active status when fully verified', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      { id: 1, clientId: 5, vercelProjectId: 'prj_123', domain: 'example.com' },
    ]);
    resolveDomainProjectIdMock.mockReturnValue('prj_123');
    verifyDomainMock.mockResolvedValue({
      verified: true,
      misconfigured: false,
      dnsRecords: [{ type: 'A', name: '@', value: '76.76.21.21' }],
    });
    const res = await domainVerifyRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/domain/verify', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.domain).toBe('example.com');
    expect(body.data.verified).toBe(true);
    expect(body.data.misconfigured).toBe(false);
    expect(body.data.status).toBe('active');
    expect(body.message).toMatch(/verified and DNS/);
    expect(resolveDomainProjectIdMock).toHaveBeenCalledWith('prj_123');
    expect(verifyDomainMock).toHaveBeenCalledWith('prj_123', 'example.com');
  });

  it('returns pending status when verified but misconfigured DNS', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      { id: 1, clientId: 5, vercelProjectId: 'prj_123', domain: 'example.com' },
    ]);
    resolveDomainProjectIdMock.mockReturnValue('prj_123');
    verifyDomainMock.mockResolvedValue({
      verified: true,
      misconfigured: true,
      dnsRecords: [],
    });
    const res = await domainVerifyRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/domain/verify', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('pending');
    expect(body.message).toMatch(/ownership verified but DNS is still misconfigured/);
  });

  it('returns pending status when not yet verified', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      { id: 1, clientId: 5, vercelProjectId: 'prj_123', domain: 'example.com' },
    ]);
    resolveDomainProjectIdMock.mockReturnValue('prj_123');
    verifyDomainMock.mockResolvedValue({
      verified: false,
      misconfigured: false,
      dnsRecords: [],
    });
    const res = await domainVerifyRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/domain/verify', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('pending');
    expect(body.message).toMatch(/Domain not yet verified/);
  });

  it('resolves platform project id when site has no vercelProjectId (shared hosting)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      { id: 1, clientId: 5, vercelProjectId: null, domain: 'example.com' },
    ]);
    resolveDomainProjectIdMock.mockReturnValue('platform_prj');
    verifyDomainMock.mockResolvedValue({
      verified: true,
      misconfigured: false,
      dnsRecords: [],
    });
    const res = await domainVerifyRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/domain/verify', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    expect(resolveDomainProjectIdMock).toHaveBeenCalledWith(null);
    expect(verifyDomainMock).toHaveBeenCalledWith('platform_prj', 'example.com');
  });

  it('returns 500 when verifyDomain throws Error', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      { id: 1, clientId: 5, vercelProjectId: 'prj_123', domain: 'example.com' },
    ]);
    resolveDomainProjectIdMock.mockReturnValue('prj_123');
    verifyDomainMock.mockRejectedValue(new Error('vercel down'));
    const res = await domainVerifyRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/domain/verify', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('vercel down');
  });

  it('returns 500 with generic message when verifyDomain rejects non-Error', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      { id: 1, clientId: 5, vercelProjectId: 'prj_123', domain: 'example.com' },
    ]);
    resolveDomainProjectIdMock.mockReturnValue('prj_123');
    verifyDomainMock.mockRejectedValue('boom');
    const res = await domainVerifyRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/domain/verify', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('Verification failed');
  });
});
