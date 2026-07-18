/**
 * Portal websites — deployments listing.
 *
 * GET /api/portal/websites/[siteId]/deployments
 *   - 401 unauthenticated
 *   - empty array when site has no vercelProjectId
 *   - calls into vercel.getDeployments() when project is provisioned
 *   - cross-site rejection (A cannot list B's deployments)
 *
 * The lib/vercel module is mocked so we don't hit api.vercel.com — the API
 * surface here is purely the auth + ownership gate around getDeployments.
 *
 * GET /api/portal/websites/[siteId]/deployments/[deploymentId]/logs
 *   - 401 unauthenticated
 *   - 400 when site is not provisioned (vercelProjectId is null)
 *   - happy path returns events (mocked)
 *   - cross-site rejection
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/vercel', () => ({
  getDeployments: vi.fn(),
  getDeploymentEvents: vi.fn(),
  addDomain: vi.fn(),
  removeDomain: vi.fn(),
  verifyDomain: vi.fn(),
  setEnvVars: vi.fn(),
  createDeployment: vi.fn(),
}));

import { auth } from '@/lib/auth';
import * as vercel from '@/lib/vercel';

const mockedAuth = auth as unknown as Mock;
const mockedGetDeployments = vercel.getDeployments as unknown as Mock;
const mockedGetDeploymentEvents = vercel.getDeploymentEvents as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedSite(
  ctx: TenantCtx,
  opts: { vercelProjectId?: string | null; label?: string } = {},
): Promise<{ siteId: number }> {
  const sql = getTestSql();
  const label = opts.label ?? 'depl-site';
  const [s] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain, vercel_project_id)
    VALUES (
      ${ctx.client.id}, ${`${label}-${Date.now()}-${Math.random()}`},
      ${`${label}-${Date.now()}-${Math.floor(Math.random() * 9999)}.test`},
      ${opts.vercelProjectId ?? null}
    )
    RETURNING id
  `;
  return { siteId: s.id };
}

describe('GET /api/portal/websites/[siteId]/deployments @websites @deployments', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    mockedGetDeployments.mockReset();
    A = await sessionForNewClientUser('deployments-list');
  });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/deployments/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId) } },
    );
    expect(res.status).toBe(401);
  });

  it('returns empty data array when site is not provisioned (no vercelProjectId)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/deployments/route');
    const res = await callHandler<{ success: boolean; data: unknown[] }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data).toEqual([]);
    expect(mockedGetDeployments).not.toHaveBeenCalled();
  });

  it('calls vercel.getDeployments when site is provisioned and returns the result', async () => {
    mockedAuth.mockResolvedValue(A.session);
    mockedGetDeployments.mockResolvedValue([
      { uid: 'depl_1', state: 'READY', url: 'https://x.vercel.app' },
    ]);
    const { siteId } = await seedSite(A, { vercelProjectId: 'prj_a' });
    const route = await import('@/app/api/portal/websites/[siteId]/deployments/route');
    const res = await callHandler<{ success: boolean; data: { uid: string }[] }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId) } },
    );
    expect(res.status).toBe(200);
    expect(mockedGetDeployments).toHaveBeenCalledWith('prj_a');
    expect(res.data?.data[0].uid).toBe('depl_1');
  });

  it('soft-fails when vercel throws — returns 200 with empty list', async () => {
    mockedAuth.mockResolvedValue(A.session);
    mockedGetDeployments.mockRejectedValue(new Error('vercel down'));
    const { siteId } = await seedSite(A, { vercelProjectId: 'prj_a' });
    const route = await import('@/app/api/portal/websites/[siteId]/deployments/route');
    const res = await callHandler<{ success: boolean; data: unknown[]; message?: string }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data).toEqual([]);
  });

  it('cross-site rejection — A cannot list B\'s deployments', async () => {
    const B = await sessionForNewClientUser('deployments-list-b');
    const { siteId: bSite } = await seedSite(B, { vercelProjectId: 'prj_b' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/websites/[siteId]/deployments/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(bSite) } },
    );
    expect(res.status).toBe(404);
    expect(mockedGetDeployments).not.toHaveBeenCalled();
  });
});

describe('GET /api/portal/websites/[siteId]/deployments/[deploymentId]/logs @websites @deployments', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    mockedGetDeploymentEvents.mockReset();
    A = await sessionForNewClientUser('depl-logs');
  });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const { siteId } = await seedSite(A, { vercelProjectId: 'prj' });
    const route = await import('@/app/api/portal/websites/[siteId]/deployments/[deploymentId]/logs/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId), deploymentId: 'depl_x' } },
    );
    expect(res.status).toBe(401);
  });

  it('400 when site has no vercelProjectId', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A); // no projectId
    const route = await import('@/app/api/portal/websites/[siteId]/deployments/[deploymentId]/logs/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId), deploymentId: 'depl_x' } },
    );
    expect(res.status).toBe(400);
  });

  it('happy path — passes deploymentId through to vercel.getDeploymentEvents', async () => {
    mockedAuth.mockResolvedValue(A.session);
    mockedGetDeploymentEvents.mockResolvedValue([{ type: 'stdout', text: 'building' }]);
    const { siteId } = await seedSite(A, { vercelProjectId: 'prj' });
    const route = await import('@/app/api/portal/websites/[siteId]/deployments/[deploymentId]/logs/route');
    const res = await callHandler<{ success: boolean; data: { text: string }[] }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId), deploymentId: 'depl_42' } },
    );
    expect(res.status).toBe(200);
    expect(mockedGetDeploymentEvents).toHaveBeenCalledWith('depl_42');
    expect(res.data?.data[0].text).toBe('building');
  });

  it('cross-site rejection — A cannot read B\'s deployment logs', async () => {
    const B = await sessionForNewClientUser('depl-logs-b');
    const { siteId: bSite } = await seedSite(B, { vercelProjectId: 'prj_b' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/websites/[siteId]/deployments/[deploymentId]/logs/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(bSite), deploymentId: 'depl_b' } },
    );
    expect(res.status).toBe(404);
    expect(mockedGetDeploymentEvents).not.toHaveBeenCalled();
  });
});
