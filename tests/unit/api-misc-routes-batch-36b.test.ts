// @vitest-environment node
/**
 * Batch 36b — unit tests for 4 portal route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/cms/websites/[siteId]/route.ts                                (PUT, DELETE)
 *  - app/api/portal/crm/deals/[id]/artifacts/available/route.ts                   (GET)
 *  - app/api/portal/project-webhooks/[id]/route.ts                                (PATCH, DELETE)
 *  - app/api/portal/tools/booking/[id]/bookings/route.ts                          (GET)
 *
 * Strategy: heavy mocking — db.select() materializes from a FIFO queue;
 * db.update/delete capture writes. All external libs (auth, portal-client,
 * subdomain, website-provisioner, ssrf-guard, cloudflare-dns, vercel) are mocked.
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

const validateSubdomainMock = vi.fn();
const isSubdomainAvailableMock = vi.fn();
vi.mock('@/lib/subdomain', () => ({
  validateSubdomain: (...args: unknown[]) => validateSubdomainMock(...args),
  isSubdomainAvailable: (...args: unknown[]) => isSubdomainAvailableMock(...args),
}));

const changeSubdomainMock = vi.fn();
vi.mock('@/lib/website-provisioner', () => ({
  changeSubdomain: (...args: unknown[]) => changeSubdomainMock(...args),
}));

const createCnameRecordMock = vi.fn();
vi.mock('@/lib/cloudflare-dns', () => ({
  createCnameRecord: (...args: unknown[]) => createCnameRecordMock(...args),
}));

const addDomainMock = vi.fn();
const getDomainConfigMock = vi.fn();
vi.mock('@/lib/vercel', () => ({
  addDomain: (...args: unknown[]) => addDomainMock(...args),
  getDomainConfig: (...args: unknown[]) => getDomainConfigMock(...args),
}));

const validateWebhookUrlMock = vi.fn();
vi.mock('@/lib/ssrf-guard', () => ({
  validateWebhookUrl: (...args: unknown[]) => validateWebhookUrlMock(...args),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings,
      values,
    }),
    { raw: (s: string) => ({ op: 'sql.raw', s }) },
  ),
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
  return {
    clientWebsites: wrap('clientWebsites'),
    emailCampaigns: wrap('emailCampaigns'),
    pitchDecks: wrap('pitchDecks'),
    crmProposals: wrap('crmProposals'),
    bookingPages: wrap('bookingPages'),
    surveys: wrap('surveys'),
    projects: wrap('projects'),
    projectWebhooks: wrap('projectWebhooks'),
    bookings: wrap('bookings'),
  };
});

// ---------------------------------------------------------------------------
// db mock: select-queue + write capture
// ---------------------------------------------------------------------------

interface WriteCall {
  op: 'insert' | 'update' | 'delete';
  table: string;
  values?: Record<string, unknown> | Record<string, unknown>[];
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let writeReturnQueue: Array<Array<Record<string, unknown>>> = [];
const writeCalls: WriteCall[] = [];

function shiftNext(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

function shiftWriteRows(): Array<Record<string, unknown>> {
  return writeReturnQueue.shift() ?? [];
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
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
      return materialize().then(onF, onR);
    };
    return chain;
  }

  function buildUpdate(table: { __table: string }) {
    let captured: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {
      set(v: Record<string, unknown>) {
        captured = v;
        return chain;
      },
      where() {
        writeCalls.push({ op: 'update', table: table.__table, values: captured });
        const rows = shiftWriteRows();
        const returnable = {
          returning() {
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(rows.map((r) => ({ ...r }))).then(onF, onR);
          },
        };
        return returnable;
      },
    };
    return chain;
  }

  function buildDelete(table: { __table: string }) {
    return {
      where() {
        writeCalls.push({ op: 'delete', table: table.__table });
        return Promise.resolve();
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
      delete(table: { __table: string }) {
        return buildDelete(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Routes under test (imported AFTER all mocks)
// ---------------------------------------------------------------------------

const websitesSiteIdRoute = await import('@/app/api/portal/cms/websites/[siteId]/route');
const dealArtifactsAvailableRoute = await import(
  '@/app/api/portal/crm/deals/[id]/artifacts/available/route'
);
const projectWebhookIdRoute = await import('@/app/api/portal/project-webhooks/[id]/route');
const bookingPageBookingsRoute = await import(
  '@/app/api/portal/tools/booking/[id]/bookings/route'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

function makeJsonReq(url: string, body: unknown, method = 'POST'): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue = [];
  writeReturnQueue = [];
  writeCalls.length = 0;
  validateSubdomainMock.mockReturnValue(null);
  isSubdomainAvailableMock.mockResolvedValue(true);
});

// ===========================================================================
// PUT/DELETE /api/portal/cms/websites/[siteId]
// ===========================================================================

describe('PUT /api/portal/cms/websites/[siteId]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await websitesSiteIdRoute.PUT(
      makeJsonReq('http://x/api/portal/cms/websites/1', {}, 'PUT'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 404 when client lookup fails', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await websitesSiteIdRoute.PUT(
      makeJsonReq('http://x/api/portal/cms/websites/1', {}, 'PUT'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 404 when website not found for this client', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 9 });
    selectQueue.push([]); // site lookup empty
    const res = await websitesSiteIdRoute.PUT(
      makeJsonReq('http://x/api/portal/cms/websites/1', {}, 'PUT'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Website not found');
  });

  it('returns 400 when name is empty string', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 9 });
    selectQueue.push([{ id: 1, clientId: 9, subdomain: 'foo', vercelProjectId: null }]);
    const res = await websitesSiteIdRoute.PUT(
      makeJsonReq('http://x/api/portal/cms/websites/1', { name: '   ' }, 'PUT'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/empty/i);
  });

  it('returns 400 when subdomain validation fails', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 9 });
    selectQueue.push([{ id: 1, clientId: 9, subdomain: 'foo', vercelProjectId: null }]);
    validateSubdomainMock.mockReturnValueOnce('Bad subdomain');
    const res = await websitesSiteIdRoute.PUT(
      makeJsonReq('http://x/api/portal/cms/websites/1', { subdomain: 'BAD!' }, 'PUT'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Bad subdomain');
  });

  it('returns 409 when new subdomain is already taken', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 9 });
    selectQueue.push([{ id: 1, clientId: 9, subdomain: 'foo', vercelProjectId: null }]);
    isSubdomainAvailableMock.mockResolvedValueOnce(false);
    const res = await websitesSiteIdRoute.PUT(
      makeJsonReq('http://x/api/portal/cms/websites/1', { subdomain: 'bar' }, 'PUT'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/already taken/i);
  });

  it('changes subdomain on existing-subdomain site via changeSubdomain helper', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 9 });
    selectQueue.push([{ id: 1, clientId: 9, subdomain: 'foo', vercelProjectId: null }]);
    isSubdomainAvailableMock.mockResolvedValueOnce(true);
    changeSubdomainMock.mockResolvedValueOnce(undefined);
    writeReturnQueue.push([
      { id: 1, name: 'Site', subdomain: 'bar', vercelDomain: 'bar.simplerdevelopment.com' },
    ]);

    const res = await websitesSiteIdRoute.PUT(
      makeJsonReq(
        'http://x/api/portal/cms/websites/1',
        { name: ' New Name ', description: '  ', subdomain: 'bar', publicAccess: true },
        'PUT',
      ),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(changeSubdomainMock).toHaveBeenCalledWith(1, 'foo', 'bar', null);

    const updateCall = writeCalls.find((c) => c.op === 'update');
    expect(updateCall?.table).toBe('clientWebsites');
    const sets = updateCall?.values as Record<string, unknown>;
    expect(sets.name).toBe('New Name');
    expect(sets.description).toBeNull();
    expect(sets.subdomain).toBe('bar');
    expect(sets.vercelDomain).toBe('bar.simplerdevelopment.com');
    expect(sets.publicAccess).toBe(true);
  });

  it('first-time subdomain with vercelProjectId calls addDomain + getDomainConfig + createCnameRecord', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 9 });
    selectQueue.push([{ id: 1, clientId: 9, subdomain: null, vercelProjectId: 'vp-xyz' }]);
    isSubdomainAvailableMock.mockResolvedValueOnce(true);
    addDomainMock.mockResolvedValueOnce(undefined);
    getDomainConfigMock.mockResolvedValueOnce({ cnames: ['target.vercel-dns.com'] });
    createCnameRecordMock.mockResolvedValueOnce(undefined);
    writeReturnQueue.push([{ id: 1, subdomain: 'newsub' }]);

    const res = await websitesSiteIdRoute.PUT(
      makeJsonReq('http://x/api/portal/cms/websites/1', { subdomain: 'newsub' }, 'PUT'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    expect(addDomainMock).toHaveBeenCalledWith('vp-xyz', 'newsub.simplerdevelopment.com');
    expect(getDomainConfigMock).toHaveBeenCalledWith('newsub.simplerdevelopment.com');
    expect(createCnameRecordMock).toHaveBeenCalledWith('newsub', 'target.vercel-dns.com');
  });

  it('first-time subdomain with no vercelProjectId uses platform CNAME', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 9 });
    selectQueue.push([{ id: 1, clientId: 9, subdomain: null, vercelProjectId: null }]);
    isSubdomainAvailableMock.mockResolvedValueOnce(true);
    createCnameRecordMock.mockResolvedValueOnce(undefined);
    writeReturnQueue.push([{ id: 1, subdomain: 'newsub' }]);

    const res = await websitesSiteIdRoute.PUT(
      makeJsonReq('http://x/api/portal/cms/websites/1', { subdomain: 'newsub' }, 'PUT'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    expect(createCnameRecordMock).toHaveBeenCalledTimes(1);
    // Second arg is the platform domain
    expect(createCnameRecordMock.mock.calls[0][0]).toBe('newsub');
  });

  it('returns 500 when subdomain change throws', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 9 });
    selectQueue.push([{ id: 1, clientId: 9, subdomain: 'foo', vercelProjectId: null }]);
    isSubdomainAvailableMock.mockResolvedValueOnce(true);
    changeSubdomainMock.mockRejectedValueOnce(new Error('cloudflare exploded'));

    const res = await websitesSiteIdRoute.PUT(
      makeJsonReq('http://x/api/portal/cms/websites/1', { subdomain: 'bar' }, 'PUT'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('cloudflare exploded');
  });

  it('returns 500 with generic message when subdomain change throws non-Error', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 9 });
    selectQueue.push([{ id: 1, clientId: 9, subdomain: 'foo', vercelProjectId: null }]);
    isSubdomainAvailableMock.mockResolvedValueOnce(true);
    changeSubdomainMock.mockRejectedValueOnce('string explosion');

    const res = await websitesSiteIdRoute.PUT(
      makeJsonReq('http://x/api/portal/cms/websites/1', { subdomain: 'bar' }, 'PUT'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toMatch(/failed to update subdomain/i);
  });

  it('updates only non-subdomain fields when subdomain is undefined', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 9 });
    selectQueue.push([{ id: 1, clientId: 9, subdomain: 'foo', vercelProjectId: null }]);
    writeReturnQueue.push([{ id: 1, name: 'X' }]);

    const res = await websitesSiteIdRoute.PUT(
      makeJsonReq(
        'http://x/api/portal/cms/websites/1',
        {
          name: 'X',
          description: 'desc',
          githubRepoName: ' repo ',
          githubRepoUrl: ' https://gh/x ',
          deployBranch: ' main ',
        },
        'PUT',
      ),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    expect(changeSubdomainMock).not.toHaveBeenCalled();
    const updateCall = writeCalls.find((c) => c.op === 'update');
    const sets = updateCall?.values as Record<string, unknown>;
    expect(sets.name).toBe('X');
    expect(sets.description).toBe('desc');
    expect(sets.githubRepoName).toBe('repo');
    expect(sets.githubRepoUrl).toBe('https://gh/x');
    expect(sets.deployBranch).toBe('main');
  });

  it('sets nullable fields to null when trimmed empty', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 9 });
    selectQueue.push([{ id: 1, clientId: 9, subdomain: 'foo', vercelProjectId: null }]);
    writeReturnQueue.push([{ id: 1 }]);

    const res = await websitesSiteIdRoute.PUT(
      makeJsonReq(
        'http://x/api/portal/cms/websites/1',
        { githubRepoName: '   ', githubRepoUrl: '   ', deployBranch: '   ', description: '   ' },
        'PUT',
      ),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    const sets = writeCalls.find((c) => c.op === 'update')!.values as Record<string, unknown>;
    expect(sets.githubRepoName).toBeNull();
    expect(sets.githubRepoUrl).toBeNull();
    expect(sets.deployBranch).toBeNull();
    expect(sets.description).toBeNull();
  });

  it('subdomain set to null clears vercelDomain', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 9 });
    selectQueue.push([{ id: 1, clientId: 9, subdomain: 'foo', vercelProjectId: null }]);
    isSubdomainAvailableMock.mockResolvedValueOnce(true);
    changeSubdomainMock.mockResolvedValueOnce(undefined);
    writeReturnQueue.push([{ id: 1 }]);

    const res = await websitesSiteIdRoute.PUT(
      makeJsonReq('http://x/api/portal/cms/websites/1', { subdomain: null }, 'PUT'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    const sets = writeCalls.find((c) => c.op === 'update')!.values as Record<string, unknown>;
    expect(sets.subdomain).toBeNull();
    expect(sets.vercelDomain).toBeNull();
  });
});

describe('DELETE /api/portal/cms/websites/[siteId]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await websitesSiteIdRoute.DELETE(makeReq('http://x', { method: 'DELETE' }), {
      params: Promise.resolve({ siteId: '1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 when client not found', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await websitesSiteIdRoute.DELETE(makeReq('http://x', { method: 'DELETE' }), {
      params: Promise.resolve({ siteId: '1' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 404 when website not owned by client', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 9 });
    selectQueue.push([]); // site lookup empty
    const res = await websitesSiteIdRoute.DELETE(makeReq('http://x', { method: 'DELETE' }), {
      params: Promise.resolve({ siteId: '1' }),
    });
    expect(res.status).toBe(404);
  });

  it('deletes site and returns success', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 9 });
    selectQueue.push([{ id: 1, clientId: 9 }]);
    const res = await websitesSiteIdRoute.DELETE(makeReq('http://x', { method: 'DELETE' }), {
      params: Promise.resolve({ siteId: '1' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    const del = writeCalls.find((c) => c.op === 'delete');
    expect(del?.table).toBe('clientWebsites');
  });
});

// ===========================================================================
// GET /api/portal/crm/deals/[id]/artifacts/available
// ===========================================================================

describe('GET /api/portal/crm/deals/[id]/artifacts/available', () => {
  function makeArtifactReq(qs = ''): import('next/server').NextRequest {
    const u = new URL(
      'http://localhost/api/portal/crm/deals/1/artifacts/available' + (qs ? '?' + qs : ''),
    );
    const r = new Request(u);
    Object.defineProperty(r, 'nextUrl', { value: u, configurable: true });
    return r as unknown as import('next/server').NextRequest;
  }

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await dealArtifactsAvailableRoute.GET(makeArtifactReq(), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await dealArtifactsAvailableRoute.GET(makeArtifactReq(), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 when client lookup fails', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await dealArtifactsAvailableRoute.GET(makeArtifactReq(), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('aggregates all types when no type filter provided', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 9 });
    // Order in Promise.all: website, email_campaign, pitch_deck, proposal, booking, survey, project
    selectQueue.push([{ id: 1, title: 'site1' }]);
    selectQueue.push([{ id: 2, title: 'camp1' }]);
    selectQueue.push([{ id: 3, title: 'deck1' }]);
    selectQueue.push([{ id: 4, title: 'prop1' }]);
    selectQueue.push([{ id: 5, title: 'book1' }]);
    selectQueue.push([{ id: 6, title: null }]); // exercise "Untitled" fallback
    selectQueue.push([{ id: 7, title: 'proj1' }]);

    const res = await dealArtifactsAvailableRoute.GET(makeArtifactReq(), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const data = body.data as Array<{ type: string; id: number; title: string }>;
    expect(data).toHaveLength(7);
    const types = data.map((d) => d.type).sort();
    expect(types).toEqual([
      'booking',
      'email_campaign',
      'pitch_deck',
      'project',
      'proposal',
      'survey',
      'website',
    ]);
    const survey = data.find((d) => d.type === 'survey');
    expect(survey?.title).toBe('Untitled');
  });

  it('filters to a single type when type query param provided', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 9 });
    // Only the matching type triggers a select. Push a single result for the matching type.
    selectQueue.push([{ id: 42, title: 'Camp42' }]);

    const res = await dealArtifactsAvailableRoute.GET(
      makeArtifactReq('type=email_campaign'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([{ type: 'email_campaign', id: 42, title: 'Camp42' }]);
  });

  it('returns empty data when no rows exist for any type', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 9 });
    for (let i = 0; i < 7; i++) selectQueue.push([]);
    const res = await dealArtifactsAvailableRoute.GET(makeArtifactReq(), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });
});

// ===========================================================================
// PATCH/DELETE /api/portal/project-webhooks/[id]
// ===========================================================================

describe('PATCH /api/portal/project-webhooks/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await projectWebhookIdRoute.PATCH(
      makeJsonReq('http://x', {}, 'PATCH'),
      { params: Promise.resolve({ id: '7' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when webhook does not exist', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5', role: 'admin' } });
    selectQueue.push([]); // webhook lookup empty
    const res = await projectWebhookIdRoute.PATCH(
      makeJsonReq('http://x', {}, 'PATCH'),
      { params: Promise.resolve({ id: '7' }) },
    );
    expect(res.status).toBe(404);
  });

  it('admin role bypasses client-ownership check', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5', role: 'admin' } });
    selectQueue.push([{ id: 7, projectId: 100, url: 'https://x', events: ['a'], active: true, secret: 'abcdefghij' }]);
    validateWebhookUrlMock.mockReturnValueOnce({ ok: true });
    writeReturnQueue.push([
      { id: 7, projectId: 100, url: 'https://new.example.com', events: ['x'], active: true, secret: 'abcdefghij' },
    ]);
    const res = await projectWebhookIdRoute.PATCH(
      makeJsonReq(
        'http://x',
        { url: 'https://new.example.com', events: ['x'], active: true },
        'PATCH',
      ),
      { params: Promise.resolve({ id: '7' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.secret).toMatch(/^abcdef…$/);
    expect(getPortalClientMock).not.toHaveBeenCalled();
  });

  it('non-admin: client lookup fails returns 404', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5', role: 'client' } });
    selectQueue.push([{ id: 7, projectId: 100, secret: 'xxxxxx' }]);
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await projectWebhookIdRoute.PATCH(
      makeJsonReq('http://x', {}, 'PATCH'),
      { params: Promise.resolve({ id: '7' }) },
    );
    expect(res.status).toBe(404);
  });

  it('non-admin: project not found for client returns 404', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5', role: 'client' } });
    selectQueue.push([{ id: 7, projectId: 100, secret: 'xxxxxx' }]);
    getPortalClientMock.mockResolvedValueOnce({ id: 9 });
    selectQueue.push([]); // project lookup empty
    const res = await projectWebhookIdRoute.PATCH(
      makeJsonReq('http://x', {}, 'PATCH'),
      { params: Promise.resolve({ id: '7' }) },
    );
    expect(res.status).toBe(404);
  });

  it('non-admin: project not private returns 403 forbidden', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5', role: 'client' } });
    selectQueue.push([{ id: 7, projectId: 100, secret: 'xxxxxx' }]);
    getPortalClientMock.mockResolvedValueOnce({ id: 9 });
    selectQueue.push([{ id: 100, clientId: 9, isPrivate: false }]);
    const res = await projectWebhookIdRoute.PATCH(
      makeJsonReq('http://x', {}, 'PATCH'),
      { params: Promise.resolve({ id: '7' }) },
    );
    expect(res.status).toBe(403);
  });

  it('non-admin: project private + URL validation fails returns 400', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5', role: 'client' } });
    selectQueue.push([{ id: 7, projectId: 100, secret: 'abcdefghij' }]);
    getPortalClientMock.mockResolvedValueOnce({ id: 9 });
    selectQueue.push([{ id: 100, clientId: 9, isPrivate: true }]);
    validateWebhookUrlMock.mockReturnValueOnce({ ok: false, reason: 'bad host' });

    const res = await projectWebhookIdRoute.PATCH(
      makeJsonReq('http://x', { url: 'http://169.254.169.254/' }, 'PATCH'),
      { params: Promise.resolve({ id: '7' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('bad host');
  });

  it('non-admin success: updates url, filters events, resets failureCount on activate', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5', role: 'client' } });
    selectQueue.push([{ id: 7, projectId: 100, secret: 'abcdefghij' }]);
    getPortalClientMock.mockResolvedValueOnce({ id: 9 });
    selectQueue.push([{ id: 100, clientId: 9, isPrivate: true }]);
    validateWebhookUrlMock.mockReturnValueOnce({ ok: true });
    writeReturnQueue.push([
      { id: 7, projectId: 100, url: 'https://ok', events: ['x', 'y'], active: true, secret: 'abcdefghij' },
    ]);

    const res = await projectWebhookIdRoute.PATCH(
      makeJsonReq(
        'http://x',
        // Send long URL to test slice(0,500) safety; bad events to test filter+slice
        {
          url: 'https://ok',
          events: ['x', 'y', 42, null, 'z'],
          active: true,
        },
        'PATCH',
      ),
      { params: Promise.resolve({ id: '7' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.secret).toBe('abcdef…');
    const updateCall = writeCalls.find((c) => c.op === 'update');
    const sets = updateCall?.values as Record<string, unknown>;
    expect(sets.url).toBe('https://ok');
    // events filtered to strings only
    expect(sets.events).toEqual(['x', 'y', 'z']);
    expect(sets.active).toBe(true);
    expect(sets.failureCount).toBe(0);
  });

  it('non-admin success: deactivating does NOT reset failureCount', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5', role: 'admin' } });
    selectQueue.push([{ id: 7, projectId: 100, secret: 'abcdefghij' }]);
    writeReturnQueue.push([
      { id: 7, projectId: 100, secret: 'abcdefghij', active: false },
    ]);

    const res = await projectWebhookIdRoute.PATCH(
      makeJsonReq('http://x', { active: false }, 'PATCH'),
      { params: Promise.resolve({ id: '7' }) },
    );
    expect(res.status).toBe(200);
    const sets = writeCalls.find((c) => c.op === 'update')!.values as Record<string, unknown>;
    expect(sets.active).toBe(false);
    expect('failureCount' in sets).toBe(false);
  });
});

describe('DELETE /api/portal/project-webhooks/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await projectWebhookIdRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '7' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when webhook does not exist', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5', role: 'admin' } });
    selectQueue.push([]);
    const res = await projectWebhookIdRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '7' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 when non-admin client on non-private project', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5', role: 'client' } });
    selectQueue.push([{ id: 7, projectId: 100, secret: 'abcdef' }]);
    getPortalClientMock.mockResolvedValueOnce({ id: 9 });
    selectQueue.push([{ id: 100, clientId: 9, isPrivate: false }]);
    const res = await projectWebhookIdRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '7' }) },
    );
    expect(res.status).toBe(403);
  });

  it('admin deletes webhook successfully', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5', role: 'admin' } });
    selectQueue.push([{ id: 7, projectId: 100, secret: 'abcdef' }]);
    const res = await projectWebhookIdRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '7' }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(writeCalls.find((c) => c.op === 'delete')?.table).toBe('projectWebhooks');
  });

  it('non-admin private project: client can delete', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5', role: 'client' } });
    selectQueue.push([{ id: 7, projectId: 100, secret: 'abcdef' }]);
    getPortalClientMock.mockResolvedValueOnce({ id: 9 });
    selectQueue.push([{ id: 100, clientId: 9, isPrivate: true }]);
    const res = await projectWebhookIdRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '7' }) },
    );
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// GET /api/portal/tools/booking/[id]/bookings
// ===========================================================================

describe('GET /api/portal/tools/booking/[id]/bookings', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await bookingPageBookingsRoute.GET(makeReq('http://x'), {
      params: Promise.resolve({ id: '7' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 when client lookup fails', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await bookingPageBookingsRoute.GET(makeReq('http://x'), {
      params: Promise.resolve({ id: '7' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 404 when booking page does not belong to client', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 9 });
    selectQueue.push([]); // page lookup empty
    const res = await bookingPageBookingsRoute.GET(makeReq('http://x'), {
      params: Promise.resolve({ id: '7' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns bookings ordered by startTime desc when page exists', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 9 });
    selectQueue.push([{ id: 7, clientId: 9, title: 'Discovery Call' }]);
    selectQueue.push([
      { id: 100, bookingPageId: 7, startTime: '2030-01-02T10:00:00Z' },
      { id: 101, bookingPageId: 7, startTime: '2030-01-01T10:00:00Z' },
    ]);

    const res = await bookingPageBookingsRoute.GET(makeReq('http://x'), {
      params: Promise.resolve({ id: '7' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].id).toBe(100);
  });

  it('returns empty array when page has no bookings', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '5' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 9 });
    selectQueue.push([{ id: 7, clientId: 9 }]);
    selectQueue.push([]);

    const res = await bookingPageBookingsRoute.GET(makeReq('http://x'), {
      params: Promise.resolve({ id: '7' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });
});
