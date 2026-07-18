/**
 * Portal websites — Google Analytics integration (POST + DELETE).
 *
 * POST   /api/portal/websites/[siteId]/google/analytics
 *   - 401 unauthenticated
 *   - 400 when Google not connected (no oauth client available)
 *   - 400 when neither propertyId nor (create + accountId) provided
 *   - happy path: existing-property selection persists gaPropertyId/gaMeasurementId
 *   - cross-site rejection: A cannot configure GA on B's siteId
 *
 * DELETE /api/portal/websites/[siteId]/google/analytics
 *   - 401 unauthenticated
 *   - happy path: clears gaPropertyId + gaMeasurementId
 *   - cross-site rejection
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/google-website-oauth', () => ({
  getAuthenticatedClient: vi.fn(),
  createOAuth2Client: vi.fn(),
}));
vi.mock('@/lib/vercel', () => ({
  setEnvVars: vi.fn().mockResolvedValue(undefined),
  createDeployment: vi.fn().mockResolvedValue(undefined),
  getDeployments: vi.fn(),
  getDeploymentEvents: vi.fn(),
  addDomain: vi.fn(),
}));

// Mock googleapis Analytics Admin surface
const mockDataStreamsList = vi.fn();
const mockPropertiesCreate = vi.fn();
const mockDataStreamsCreate = vi.fn();
const mockAccountsList = vi.fn();
const mockPropertiesList = vi.fn();

vi.mock('googleapis', () => ({
  google: {
    analyticsadmin: vi.fn(() => ({
      accounts: { list: mockAccountsList },
      properties: {
        list: mockPropertiesList,
        create: mockPropertiesCreate,
        dataStreams: {
          list: mockDataStreamsList,
          create: mockDataStreamsCreate,
        },
      },
    })),
  },
}));

import { auth } from '@/lib/auth';
import { getAuthenticatedClient } from '@/lib/google-website-oauth';

const mockedAuth = auth as unknown as Mock;
const mockedGetClient = getAuthenticatedClient as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedSite(ctx: TenantCtx, label = 'ga-site'): Promise<{ siteId: number }> {
  const sql = getTestSql();
  const [s] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
    VALUES (${ctx.client.id}, ${`${label}-${Date.now()}-${Math.random()}`}, ${`${label}-${Date.now()}-${Math.floor(Math.random() * 9999)}.test`})
    RETURNING id
  `;
  return { siteId: s.id };
}

async function seedGoogleTokens(siteId: number, opts: { gaPropertyId?: string; gaMeasurementId?: string } = {}) {
  const sql = getTestSql();
  // expires 1h in the future so getAuthenticatedClient (mocked here anyway)
  // would consider the token live.
  const expiresAt = new Date(Date.now() + 3600_000);
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.google_website_tokens (
      website_id, access_token, refresh_token, expires_at, ga_property_id, ga_measurement_id
    )
    VALUES (
      ${siteId}, 'at', 'rt', ${expiresAt},
      ${opts.gaPropertyId ?? null}, ${opts.gaMeasurementId ?? null}
    )
  `;
}

describe('POST /api/portal/websites/[siteId]/google/analytics @websites @integrations', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    [mockDataStreamsList, mockPropertiesCreate, mockDataStreamsCreate, mockAccountsList, mockPropertiesList]
      .forEach(m => m.mockReset());
    mockedGetClient.mockReset();
    A = await sessionForNewClientUser('ga-config');
  });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/google/analytics/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { propertyId: 'properties/123' } },
    );
    expect(res.status).toBe(401);
  });

  it('400 when Google is not connected (oauth client unavailable)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    mockedGetClient.mockResolvedValue(null);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/google/analytics/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { propertyId: 'properties/123' } },
    );
    expect(res.status).toBe(400);
  });

  it('400 when body provides neither propertyId nor (create + accountId)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    mockedGetClient.mockResolvedValue({});
    const { siteId } = await seedSite(A);
    await seedGoogleTokens(siteId);
    const route = await import('@/app/api/portal/websites/[siteId]/google/analytics/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: {} },
    );
    expect(res.status).toBe(400);
  });

  it('happy path — selects existing property + persists IDs', async () => {
    mockedAuth.mockResolvedValue(A.session);
    mockedGetClient.mockResolvedValue({});
    mockDataStreamsList.mockResolvedValue({
      data: {
        dataStreams: [
          { type: 'WEB_DATA_STREAM', webStreamData: { measurementId: 'G-ABC123' } },
        ],
      },
    });
    const { siteId } = await seedSite(A);
    await seedGoogleTokens(siteId);
    const route = await import('@/app/api/portal/websites/[siteId]/google/analytics/route');
    const res = await callHandler<{ success: boolean; data: { propertyId: string; measurementId: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { propertyId: 'properties/999' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.propertyId).toBe('properties/999');
    expect(res.data?.data.measurementId).toBe('G-ABC123');

    const sql = getTestSql();
    const [tok] = await sql<{ ga_property_id: string; ga_measurement_id: string }[]>`
      SELECT ga_property_id, ga_measurement_id
      FROM ${sql(TEST_SCHEMA)}.google_website_tokens WHERE website_id = ${siteId}
    `;
    expect(tok.ga_property_id).toBe('properties/999');
    expect(tok.ga_measurement_id).toBe('G-ABC123');
  });

  it('cross-site rejection — A cannot configure GA on B\'s site', async () => {
    const B = await sessionForNewClientUser('ga-config-b');
    const { siteId: bSite } = await seedSite(B);
    await seedGoogleTokens(bSite);

    mockedAuth.mockResolvedValue(A.session);
    mockedGetClient.mockResolvedValue({});
    const route = await import('@/app/api/portal/websites/[siteId]/google/analytics/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(bSite) }, body: { propertyId: 'properties/sneak' } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [tok] = await sql<{ ga_property_id: string | null }[]>`
      SELECT ga_property_id FROM ${sql(TEST_SCHEMA)}.google_website_tokens WHERE website_id = ${bSite}
    `;
    expect(tok.ga_property_id).toBeNull();
  });
});

describe('DELETE /api/portal/websites/[siteId]/google/analytics @websites @integrations', () => {
  let A: TenantCtx;

  beforeEach(async () => { A = await sessionForNewClientUser('ga-disconnect'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const { siteId } = await seedSite(A);
    await seedGoogleTokens(siteId, { gaPropertyId: 'properties/x', gaMeasurementId: 'G-X' });
    const route = await import('@/app/api/portal/websites/[siteId]/google/analytics/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { siteId: String(siteId) } },
    );
    expect(res.status).toBe(401);
  });

  it('happy path — clears gaPropertyId + gaMeasurementId', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    await seedGoogleTokens(siteId, { gaPropertyId: 'properties/x', gaMeasurementId: 'G-X' });
    const route = await import('@/app/api/portal/websites/[siteId]/google/analytics/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { siteId: String(siteId) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const [tok] = await sql<{ ga_property_id: string | null; ga_measurement_id: string | null }[]>`
      SELECT ga_property_id, ga_measurement_id
      FROM ${sql(TEST_SCHEMA)}.google_website_tokens WHERE website_id = ${siteId}
    `;
    expect(tok.ga_property_id).toBeNull();
    expect(tok.ga_measurement_id).toBeNull();
  });

  it('cross-site rejection — A cannot disconnect GA on B\'s site', async () => {
    const B = await sessionForNewClientUser('ga-disconnect-b');
    const { siteId: bSite } = await seedSite(B);
    await seedGoogleTokens(bSite, { gaPropertyId: 'properties/x', gaMeasurementId: 'G-X' });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/websites/[siteId]/google/analytics/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { siteId: String(bSite) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [tok] = await sql<{ ga_property_id: string | null }[]>`
      SELECT ga_property_id FROM ${sql(TEST_SCHEMA)}.google_website_tokens WHERE website_id = ${bSite}
    `;
    expect(tok.ga_property_id).toBe('properties/x');
  });
});
