/**
 * Portal websites — custom domain attachment.
 *
 * POST /api/portal/websites/[siteId]/domain
 *   - 401 unauthenticated
 *   - 400 when site is not provisioned (no vercelProjectId)
 *   - 400 when customDomain is missing/non-string
 *   - happy path: lowercases, strips scheme, persists, returns DNS hints
 *   - cross-site rejection: A cannot attach a domain under B's siteId
 *
 * lib/vercel is mocked so addDomain doesn't hit api.vercel.com.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/vercel', () => ({
  addDomain: vi.fn().mockResolvedValue({ apexName: 'example.com', verified: false }),
  getDeployments: vi.fn(),
  getDeploymentEvents: vi.fn(),
  removeDomain: vi.fn(),
  verifyDomain: vi.fn(),
  setEnvVars: vi.fn(),
  createDeployment: vi.fn(),
}));

import { auth } from '@/lib/auth';
import * as vercel from '@/lib/vercel';

const mockedAuth = auth as unknown as Mock;
const mockedAddDomain = vercel.addDomain as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedSite(
  ctx: TenantCtx,
  opts: { vercelProjectId?: string | null; label?: string } = {},
): Promise<{ siteId: number }> {
  const sql = getTestSql();
  const label = opts.label ?? 'domain-site';
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

describe('POST /api/portal/websites/[siteId]/domain @websites @domain', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    mockedAddDomain.mockReset();
    mockedAddDomain.mockResolvedValue({ apexName: 'example.com', verified: false });
    A = await sessionForNewClientUser('domain-set');
  });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const { siteId } = await seedSite(A, { vercelProjectId: 'prj' });
    const route = await import('@/app/api/portal/websites/[siteId]/domain/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { customDomain: 'x.com' } },
    );
    expect(res.status).toBe(401);
  });

  it('400 when site is not provisioned', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);   // no projectId
    const route = await import('@/app/api/portal/websites/[siteId]/domain/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { customDomain: 'x.com' } },
    );
    expect(res.status).toBe(400);
    expect(mockedAddDomain).not.toHaveBeenCalled();
  });

  it('400 when customDomain is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A, { vercelProjectId: 'prj' });
    const route = await import('@/app/api/portal/websites/[siteId]/domain/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: {} },
    );
    expect(res.status).toBe(400);
  });

  it('happy path — strips scheme/trailing-slash + lowercases + persists', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A, { vercelProjectId: 'prj' });
    const route = await import('@/app/api/portal/websites/[siteId]/domain/route');
    const res = await callHandler<{ success: boolean; data: { domain: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { customDomain: 'HTTPS://Example.COM/' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.domain).toBe('example.com');
    expect(mockedAddDomain).toHaveBeenCalledWith('prj', 'example.com');

    const sql = getTestSql();
    const [check] = await sql<{ domain: string }[]>`
      SELECT domain FROM ${sql(TEST_SCHEMA)}.client_websites WHERE id = ${siteId}
    `;
    expect(check.domain).toBe('example.com');
  });

  it('500 when vercel.addDomain throws', async () => {
    mockedAuth.mockResolvedValue(A.session);
    mockedAddDomain.mockRejectedValue(new Error('upstream'));
    const { siteId } = await seedSite(A, { vercelProjectId: 'prj' });
    const route = await import('@/app/api/portal/websites/[siteId]/domain/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { customDomain: 'fail.test' } },
    );
    expect(res.status).toBe(500);
  });

  it('cross-site rejection — A cannot attach a domain to B\'s site', async () => {
    const B = await sessionForNewClientUser('domain-set-b');
    const { siteId: bSite } = await seedSite(B, { vercelProjectId: 'prj_b' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/websites/[siteId]/domain/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(bSite) }, body: { customDomain: 'hijacked.com' } },
    );
    expect(res.status).toBe(404);
    expect(mockedAddDomain).not.toHaveBeenCalled();

    // Confirm B's domain wasn't overwritten
    const sql = getTestSql();
    const [check] = await sql<{ domain: string }[]>`
      SELECT domain FROM ${sql(TEST_SCHEMA)}.client_websites WHERE id = ${bSite}
    `;
    expect(check.domain).not.toBe('hijacked.com');
  });
});
