// @vitest-environment node
/**
 * Unit tests for two related Portal Google Analytics routes packed into one file:
 *
 *   1. GET / POST / DELETE /api/portal/websites/[siteId]/google/analytics
 *      - Auth gating (401 when no session)
 *      - resolveWebsite failures: no portal client / no matching site -> 404
 *      - Google not connected -> 400
 *      - GET: lists accounts + properties via analyticsadmin
 *      - GET: 500 path when analyticsadmin throws
 *      - POST: validates request body branches (select / create / neither)
 *      - POST: creates property + data stream, writes env vars, triggers deploy
 *      - POST: select existing -> reads data streams, picks WEB_DATA_STREAM
 *      - POST: vercel push swallowed on error (non-fatal)
 *      - DELETE: clears GA fields
 *
 *   2. GET /api/portal/websites/[siteId]/google/analytics/report
 *      - Same auth + website gating
 *      - GA property not configured -> 400
 *      - Google not connected -> 400
 *      - Happy path: parses metrics + timeseries + topPages + trafficSources
 *      - Date range clamped to 90 days
 *      - percentChange null-when-previous-zero branch
 *      - 500 path when runReport throws
 *
 * All external modules (auth, db, drizzle, googleapis, portal-client, oauth,
 * vercel) are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===========================================================================
// drizzle-orm + schema (shared)
// ===========================================================================

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
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
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    clientWebsites: wrap('clientWebsites'),
    googleWebsiteTokens: wrap('googleWebsiteTokens'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ===========================================================================
// auth
// ===========================================================================

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

// ===========================================================================
// portal-client
// ===========================================================================

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

// ===========================================================================
// google-website-oauth
// ===========================================================================

const getAuthenticatedClientMock = vi.fn();
vi.mock('@/lib/google-website-oauth', () => ({
  getAuthenticatedClient: (...args: unknown[]) =>
    getAuthenticatedClientMock(...args),
}));

// ===========================================================================
// vercel
// ===========================================================================

const setEnvVarsMock = vi.fn();
const createDeploymentMock = vi.fn();
vi.mock('@/lib/vercel', () => ({
  setEnvVars: (...args: unknown[]) => setEnvVarsMock(...args),
  createDeployment: (...args: unknown[]) => createDeploymentMock(...args),
}));

// ===========================================================================
// googleapis — both analyticsadmin and analyticsdata
// ===========================================================================

const adminAccountsList = vi.fn();
const adminPropertiesList = vi.fn();
const adminPropertiesCreate = vi.fn();
const adminDataStreamsList = vi.fn();
const adminDataStreamsCreate = vi.fn();
const dataRunReport = vi.fn();

const mockAnalyticsAdminFactory = vi.fn(() => ({
  accounts: { list: adminAccountsList },
  properties: {
    list: adminPropertiesList,
    create: adminPropertiesCreate,
    dataStreams: {
      list: adminDataStreamsList,
      create: adminDataStreamsCreate,
    },
  },
}));
const mockAnalyticsDataFactory = vi.fn(() => ({
  properties: { runReport: dataRunReport },
}));

vi.mock('googleapis', () => ({
  google: {
    analyticsadmin: (...args: unknown[]) => mockAnalyticsAdminFactory(...args),
    analyticsdata: (...args: unknown[]) => mockAnalyticsDataFactory(...args),
  },
}));

// ===========================================================================
// db — simple queue-based select + capture for update
// ===========================================================================

let selectQueue: Array<Array<Record<string, unknown>>> = [];
interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
}
const updateCalls: UpdateCall[] = [];

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materialized: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = () => {
      if (!materialized) {
        const next = selectQueue.shift() ?? [];
        materialized = Promise.resolve(next.map((r) => ({ ...r })));
      }
      return materialized;
    };
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy']) {
      chain[m] = passthrough;
    }
    chain.limit = () => ({
      then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
        return materialize().then(onF, onR);
      },
    });
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  function buildUpdate(table: { __table: string }) {
    let patch: Record<string, unknown> = {};
    return {
      set(p: Record<string, unknown>) {
        patch = p;
        return {
          where(filter: unknown) {
            updateCalls.push({ table: table.__table, patch, filter });
            return Promise.resolve(undefined);
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

// ===========================================================================
// Module under test (after mocks)
// ===========================================================================

const analyticsRoute = await import(
  '@/app/api/portal/websites/[siteId]/google/analytics/route'
);
const reportRoute = await import(
  '@/app/api/portal/websites/[siteId]/google/analytics/report/route'
);

// ===========================================================================
// Helpers
// ===========================================================================

function makeParams(siteId: string) {
  return { params: Promise.resolve({ siteId }) };
}

function makeRequest(url = 'http://x/api/portal/websites/1/google/analytics', init?: RequestInit) {
  return new Request(url, init);
}

const SESSION = { user: { id: '42' } };

beforeEach(() => {
  authMock.mockReset();
  getPortalClientMock.mockReset();
  getAuthenticatedClientMock.mockReset();
  setEnvVarsMock.mockReset();
  createDeploymentMock.mockReset();
  adminAccountsList.mockReset();
  adminPropertiesList.mockReset();
  adminPropertiesCreate.mockReset();
  adminDataStreamsList.mockReset();
  adminDataStreamsCreate.mockReset();
  dataRunReport.mockReset();
  mockAnalyticsAdminFactory.mockClear();
  mockAnalyticsDataFactory.mockClear();
  selectQueue = [];
  updateCalls.length = 0;
});

// ===========================================================================
// 1. /api/portal/websites/[siteId]/google/analytics
// ===========================================================================

describe('GET /api/portal/websites/[siteId]/google/analytics', () => {
  it('returns 401 when not authenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await analyticsRoute.GET(makeRequest(), makeParams('1'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 404 when no portal client for user', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await analyticsRoute.GET(makeRequest(), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when website is not found for this client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // resolveWebsite -> empty
    const res = await analyticsRoute.GET(makeRequest(), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when google is not connected', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, name: 'Site' }]);
    getAuthenticatedClientMock.mockResolvedValue(null);
    const res = await analyticsRoute.GET(makeRequest(), makeParams('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Google not connected/i);
  });

  it('lists accounts and properties on happy path', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, name: 'Site' }]);
    getAuthenticatedClientMock.mockResolvedValue({ /* oauth */ });
    adminAccountsList.mockResolvedValue({
      data: { accounts: [{ name: 'accounts/1', displayName: 'Acct One' }] },
    });
    adminPropertiesList.mockResolvedValue({
      data: {
        properties: [
          { name: 'properties/100', displayName: 'Prop A' },
          { name: 'properties/101', displayName: 'Prop B' },
        ],
      },
    });

    const res = await analyticsRoute.GET(makeRequest(), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.accounts).toEqual([
      { name: 'accounts/1', displayName: 'Acct One' },
    ]);
    expect(body.data.properties).toHaveLength(2);
    expect(body.data.properties[0]).toMatchObject({
      name: 'properties/100',
      displayName: 'Prop A',
      account: 'Acct One',
    });
    expect(adminPropertiesList).toHaveBeenCalledWith({ filter: 'parent:accounts/1' });
  });

  it('handles empty accounts list', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, name: 'Site' }]);
    getAuthenticatedClientMock.mockResolvedValue({});
    adminAccountsList.mockResolvedValue({ data: {} });
    const res = await analyticsRoute.GET(makeRequest(), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.accounts).toEqual([]);
    expect(body.data.properties).toEqual([]);
  });

  it('returns 500 when analyticsadmin throws', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, name: 'Site' }]);
    getAuthenticatedClientMock.mockResolvedValue({});
    adminAccountsList.mockRejectedValue(new Error('boom'));
    const res = await analyticsRoute.GET(makeRequest(), makeParams('1'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('boom');
  });

  it('returns 500 generic message when non-Error thrown', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, name: 'Site' }]);
    getAuthenticatedClientMock.mockResolvedValue({});
    adminAccountsList.mockRejectedValue('weird');
    const res = await analyticsRoute.GET(makeRequest(), makeParams('1'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('Failed to list Analytics properties');
  });
});

describe('POST /api/portal/websites/[siteId]/google/analytics', () => {
  function makePost(body: unknown) {
    return makeRequest('http://x/api/portal/websites/1/google/analytics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns 401 when not authenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await analyticsRoute.POST(makePost({}), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when website not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]);
    const res = await analyticsRoute.POST(makePost({}), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when google not connected', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, name: 'Site' }]);
    getAuthenticatedClientMock.mockResolvedValue(null);
    const res = await analyticsRoute.POST(makePost({}), makeParams('1'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when neither propertyId nor create+accountId provided', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, name: 'Site' }]);
    getAuthenticatedClientMock.mockResolvedValue({});
    const res = await analyticsRoute.POST(makePost({}), makeParams('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Provide propertyId/);
  });

  it('creates a property + data stream and pushes env to vercel', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        name: 'My Site',
        subdomain: 'mysite',
        domain: null,
        vercelProjectId: 'prj_123',
        githubRepoName: 'org/repo',
      },
    ]);
    getAuthenticatedClientMock.mockResolvedValue({});
    adminPropertiesCreate.mockResolvedValue({
      data: { name: 'properties/999' },
    });
    adminDataStreamsCreate.mockResolvedValue({
      data: { webStreamData: { measurementId: 'G-XYZ' } },
    });
    setEnvVarsMock.mockResolvedValue(undefined);
    createDeploymentMock.mockResolvedValue(undefined);

    const res = await analyticsRoute.POST(
      makePost({ create: true, accountId: 'accounts/1', displayName: 'Site Title' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ propertyId: 'properties/999', measurementId: 'G-XYZ' });

    expect(adminPropertiesCreate).toHaveBeenCalledWith({
      requestBody: expect.objectContaining({
        parent: 'accounts/1',
        displayName: 'Site Title',
        timeZone: 'America/New_York',
        currencyCode: 'USD',
      }),
    });
    // domain resolution prefers subdomain.simplerdevelopment.com when site.domain is null
    expect(adminDataStreamsCreate).toHaveBeenCalledWith({
      parent: 'properties/999',
      requestBody: expect.objectContaining({
        type: 'WEB_DATA_STREAM',
        displayName: 'mysite.simplerdevelopment.com',
        webStreamData: { defaultUri: 'https://mysite.simplerdevelopment.com' },
      }),
    });

    // DB update written
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('googleWebsiteTokens');
    expect(updateCalls[0].patch).toMatchObject({
      gaPropertyId: 'properties/999',
      gaMeasurementId: 'G-XYZ',
    });

    expect(setEnvVarsMock).toHaveBeenCalledWith('prj_123', [
      { key: 'NEXT_PUBLIC_GA_MEASUREMENT_ID', value: 'G-XYZ' },
    ]);
    expect(createDeploymentMock).toHaveBeenCalledWith('prj_123', 'org/repo');
  });

  it('uses site.name when neither domain nor subdomain are set', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        name: 'fallback-name',
        subdomain: null,
        domain: null,
        vercelProjectId: null,
      },
    ]);
    getAuthenticatedClientMock.mockResolvedValue({});
    adminPropertiesCreate.mockResolvedValue({ data: { name: 'properties/1' } });
    adminDataStreamsCreate.mockResolvedValue({ data: { webStreamData: {} } });

    const res = await analyticsRoute.POST(
      makePost({ create: true, accountId: 'accounts/1' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    // measurementId fell back to ''
    const body = await res.json();
    expect(body.data.measurementId).toBe('');
    // setEnvVars not called when measurementId is empty
    expect(setEnvVarsMock).not.toHaveBeenCalled();
  });

  it('selects existing property and finds WEB_DATA_STREAM', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      { id: 1, clientId: 5, name: 'Site', vercelProjectId: null },
    ]);
    getAuthenticatedClientMock.mockResolvedValue({});
    adminDataStreamsList.mockResolvedValue({
      data: {
        dataStreams: [
          { type: 'ANDROID_APP_DATA_STREAM' },
          { type: 'WEB_DATA_STREAM', webStreamData: { measurementId: 'G-EXISTING' } },
        ],
      },
    });

    const res = await analyticsRoute.POST(
      makePost({ propertyId: 'properties/777' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({
      propertyId: 'properties/777',
      measurementId: 'G-EXISTING',
    });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].patch).toMatchObject({
      gaPropertyId: 'properties/777',
      gaMeasurementId: 'G-EXISTING',
    });
  });

  it('swallows vercel push errors (non-fatal)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        name: 'Site',
        subdomain: 'sub',
        domain: null,
        vercelProjectId: 'prj_1',
        githubRepoName: 'org/repo',
      },
    ]);
    getAuthenticatedClientMock.mockResolvedValue({});
    adminPropertiesCreate.mockResolvedValue({ data: { name: 'properties/1' } });
    adminDataStreamsCreate.mockResolvedValue({
      data: { webStreamData: { measurementId: 'G-1' } },
    });
    setEnvVarsMock.mockRejectedValue(new Error('vercel down'));

    const res = await analyticsRoute.POST(
      makePost({ create: true, accountId: 'accounts/1' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 500 when analyticsadmin throws on create', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, name: 'S', subdomain: 's' }]);
    getAuthenticatedClientMock.mockResolvedValue({});
    adminPropertiesCreate.mockRejectedValue(new Error('quota'));
    const res = await analyticsRoute.POST(
      makePost({ create: true, accountId: 'accounts/1' }),
      makeParams('1'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('quota');
  });

  it('returns 500 generic message when non-Error thrown on POST', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, name: 'S' }]);
    getAuthenticatedClientMock.mockResolvedValue({});
    adminDataStreamsList.mockRejectedValue('weird');
    const res = await analyticsRoute.POST(
      makePost({ propertyId: 'properties/1' }),
      makeParams('1'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('Failed to configure Analytics');
  });
});

describe('DELETE /api/portal/websites/[siteId]/google/analytics', () => {
  it('returns 401 when not authenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await analyticsRoute.DELETE(makeRequest(), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when website not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]);
    const res = await analyticsRoute.DELETE(makeRequest(), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('clears GA fields on success', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, name: 'Site' }]);

    const res = await analyticsRoute.DELETE(makeRequest(), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('googleWebsiteTokens');
    expect(updateCalls[0].patch).toMatchObject({
      gaPropertyId: null,
      gaMeasurementId: null,
    });
  });
});

// ===========================================================================
// 2. /api/portal/websites/[siteId]/google/analytics/report
// ===========================================================================

describe('GET /api/portal/websites/[siteId]/google/analytics/report', () => {
  function makeReportReq(qs = '') {
    return makeRequest(
      `http://x/api/portal/websites/1/google/analytics/report${qs}`,
    );
  }

  it('returns 401 when not authenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await reportRoute.GET(makeReportReq(), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when website not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // resolveWebsite -> empty
    const res = await reportRoute.GET(makeReportReq(), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when analytics not configured (no gaPropertyId)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, name: 'S' }]); // resolveWebsite
    selectQueue.push([{ id: 10, websiteId: 1, gaPropertyId: null }]); // tokens
    const res = await reportRoute.GET(makeReportReq(), makeParams('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Analytics not configured/);
  });

  it('returns 400 when token row missing entirely', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, name: 'S' }]);
    selectQueue.push([]); // no token row at all
    const res = await reportRoute.GET(makeReportReq(), makeParams('1'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when google not connected', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5 }]);
    selectQueue.push([{ id: 10, websiteId: 1, gaPropertyId: 'properties/1' }]);
    getAuthenticatedClientMock.mockResolvedValue(null);
    const res = await reportRoute.GET(makeReportReq(), makeParams('1'));
    expect(res.status).toBe(400);
  });

  it('parses metrics, timeseries, top pages, traffic sources on happy path', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5 }]);
    selectQueue.push([
      { id: 10, websiteId: 1, gaPropertyId: 'properties/123' },
    ]);
    getAuthenticatedClientMock.mockResolvedValue({});

    // metricsRes — current + previous rows, 6 metrics each
    const metricsRes = {
      data: {
        rows: [
          {
            metricValues: [
              { value: '100' }, // users
              { value: '120' }, // sessions
              { value: '500' }, // pageViews
              { value: '0.25' }, // bounceRate (-> 25)
              { value: '90' }, // avgSessionDuration
              { value: '0.5' }, // engagementRate (-> 50)
            ],
          },
          {
            metricValues: [
              { value: '50' }, // prev users
              { value: '60' },
              { value: '250' },
              { value: '0.5' }, // prev bounce -> 50
              { value: '45' },
              { value: '0.25' }, // prev engagement -> 25
            ],
          },
        ],
      },
    };
    const timeseriesRes = {
      data: {
        rows: [
          {
            dimensionValues: [{ value: '20260101' }],
            metricValues: [{ value: '10' }, { value: '5' }],
          },
          {
            dimensionValues: [{ value: '20260102' }],
            metricValues: [{ value: '20' }, { value: '8' }],
          },
        ],
      },
    };
    const pagesRes = {
      data: {
        rows: [
          {
            dimensionValues: [{ value: '/home' }],
            metricValues: [{ value: '300' }, { value: '120' }, { value: '45.7' }],
          },
        ],
      },
    };
    const sourcesRes = {
      data: {
        rows: [
          {
            dimensionValues: [{ value: 'Organic Search' }],
            metricValues: [{ value: '200' }, { value: '150' }],
          },
        ],
      },
    };

    dataRunReport
      .mockResolvedValueOnce(metricsRes)
      .mockResolvedValueOnce(timeseriesRes)
      .mockResolvedValueOnce(pagesRes)
      .mockResolvedValueOnce(sourcesRes);

    const res = await reportRoute.GET(makeReportReq('?range=14'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.range).toBe(14);

    // 100 vs 50 -> +100%
    expect(body.data.metrics.users).toEqual({ value: 100, change: 100 });
    // 120 vs 60 -> +100%
    expect(body.data.metrics.sessions.value).toBe(120);
    expect(body.data.metrics.sessions.change).toBe(100);
    // 500 vs 250 -> +100%
    expect(body.data.metrics.pageViews.value).toBe(500);
    // 0.25 * 100 = 25; prev 50 -> change -50
    expect(body.data.metrics.bounceRate.value).toBe(25);
    expect(body.data.metrics.bounceRate.change).toBe(-50);
    expect(body.data.metrics.avgSessionDuration.value).toBe(90);
    expect(body.data.metrics.engagementRate.value).toBe(50);
    expect(body.data.metrics.engagementRate.change).toBe(100); // 50 vs 25 -> +100%

    expect(body.data.timeseries).toEqual([
      { date: '20260101', pageViews: 10, users: 5 },
      { date: '20260102', pageViews: 20, users: 8 },
    ]);
    expect(body.data.topPages).toEqual([
      { path: '/home', pageViews: 300, users: 120, avgDuration: 46 },
    ]);
    expect(body.data.trafficSources).toEqual([
      { channel: 'Organic Search', sessions: 200, users: 150 },
    ]);

    // Verify the date range threading: startDate is `14daysAgo`
    expect(dataRunReport).toHaveBeenCalledTimes(4);
    const firstCallArg = (dataRunReport.mock.calls[0][0] as {
      requestBody: { dateRanges: Array<{ startDate: string; endDate: string }> };
    }).requestBody;
    expect(firstCallArg.dateRanges[0].startDate).toBe('14daysAgo');
    expect(firstCallArg.dateRanges[0].endDate).toBe('today');
  });

  it('defaults to 30 days when range param is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5 }]);
    selectQueue.push([{ id: 10, websiteId: 1, gaPropertyId: 'properties/1' }]);
    getAuthenticatedClientMock.mockResolvedValue({});
    dataRunReport.mockResolvedValue({ data: { rows: [] } });

    const res = await reportRoute.GET(makeReportReq(), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.range).toBe(30);
  });

  it('clamps range to a maximum of 90 days', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5 }]);
    selectQueue.push([{ id: 10, websiteId: 1, gaPropertyId: 'properties/1' }]);
    getAuthenticatedClientMock.mockResolvedValue({});
    dataRunReport.mockResolvedValue({ data: { rows: [] } });

    const res = await reportRoute.GET(makeReportReq('?range=999'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.range).toBe(90);
  });

  it('handles previous=0 with current>0 -> change=100, and both=0 -> null', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5 }]);
    selectQueue.push([{ id: 10, websiteId: 1, gaPropertyId: 'properties/1' }]);
    getAuthenticatedClientMock.mockResolvedValue({});

    const metricsRes = {
      data: {
        rows: [
          {
            metricValues: [
              { value: '10' }, // users — current>0, prev=0 -> 100
              { value: '0' }, // sessions — current=0, prev=0 -> null
              { value: '0' },
              { value: '0' },
              { value: '0' },
              { value: '0' },
            ],
          },
          {
            metricValues: [
              { value: '0' },
              { value: '0' },
              { value: '0' },
              { value: '0' },
              { value: '0' },
              { value: '0' },
            ],
          },
        ],
      },
    };

    dataRunReport
      .mockResolvedValueOnce(metricsRes)
      .mockResolvedValueOnce({ data: { rows: [] } })
      .mockResolvedValueOnce({ data: { rows: [] } })
      .mockResolvedValueOnce({ data: { rows: [] } });

    const res = await reportRoute.GET(makeReportReq(), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.metrics.users.change).toBe(100);
    expect(body.data.metrics.sessions.change).toBeNull();
  });

  it('handles entirely missing rows gracefully', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5 }]);
    selectQueue.push([{ id: 10, websiteId: 1, gaPropertyId: 'properties/1' }]);
    getAuthenticatedClientMock.mockResolvedValue({});

    dataRunReport.mockResolvedValue({ data: {} });

    const res = await reportRoute.GET(makeReportReq(), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.metrics.users.value).toBe(0);
    expect(body.data.timeseries).toEqual([]);
    expect(body.data.topPages).toEqual([]);
    expect(body.data.trafficSources).toEqual([]);
  });

  it('returns 500 with the error message when runReport throws', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5 }]);
    selectQueue.push([{ id: 10, websiteId: 1, gaPropertyId: 'properties/1' }]);
    getAuthenticatedClientMock.mockResolvedValue({});
    dataRunReport.mockRejectedValue(new Error('ga down'));

    const res = await reportRoute.GET(makeReportReq(), makeParams('1'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('ga down');
  });

  it('returns 500 generic message when non-Error thrown', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5 }]);
    selectQueue.push([{ id: 10, websiteId: 1, gaPropertyId: 'properties/1' }]);
    getAuthenticatedClientMock.mockResolvedValue({});
    dataRunReport.mockRejectedValue('weird');

    const res = await reportRoute.GET(makeReportReq(), makeParams('1'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('Failed to fetch analytics report');
  });
});
