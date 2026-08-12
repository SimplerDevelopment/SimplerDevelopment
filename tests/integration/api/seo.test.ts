/**
 * Integration tests for the SEO Intelligence portal API.
 *
 * Tenancy contract: seo_projects / seo_crawl_runs (and their child rows) are
 * clientId-scoped — tenant B must get 404s for every one of tenant A's
 * resources, on every route. Also covers the SSRF registration screen
 * (private/localhost start URLs rejected at project creation) and the
 * idempotent crawl trigger (one active run per project, never stacked).
 */
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../helpers/call-handler';
import { twoTenants, grantService, type TenantCtx } from '../../helpers/session';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

type Envelope<T = Record<string, unknown>> = { success: boolean; data: T; message?: string };

async function createProject(startUrl: string): Promise<Envelope<{ id: number; domain: string }>> {
  const route = await import('@/app/api/portal/seo/projects/route');
  const res = await callHandler<Envelope<{ id: number; domain: string }>>(
    route as unknown as Record<string, unknown>,
    'POST',
    { body: { startUrl } },
  );
  return res.data as Envelope<{ id: number; domain: string }>;
}

describe('SEO Intelligence portal API @seo @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    ({ A, B } = await twoTenants());
    await Promise.all([grantService(A.client.id, 'seo'), grantService(B.client.id, 'seo')]);
  });

  it('creates a project for the caller and rejects a duplicate domain (409)', async () => {
    await asTenant(A);
    const created = await createProject('https://example-a.com/');
    expect(created.success).toBe(true);
    expect(created.data.domain).toBe('example-a.com');

    const route = await import('@/app/api/portal/seo/projects/route');
    const dup = await callHandler<Envelope>(route as unknown as Record<string, unknown>, 'POST', {
      body: { startUrl: 'https://www.example-a.com/other' },
    });
    expect(dup.status).toBe(409);
  });

  it('rejects unsafe start URLs at registration (400)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/seo/projects/route');
    for (const startUrl of ['http://localhost/admin', 'http://192.168.1.1/', 'ftp://example.com/']) {
      const res = await callHandler<Envelope>(route as unknown as Record<string, unknown>, 'POST', {
        body: { startUrl },
      });
      expect(res.status, startUrl).toBe(400);
    }
  });

  it("does not list tenant A's projects for tenant B", async () => {
    await asTenant(A);
    await createProject('https://tenant-a-site.com/');

    await asTenant(B);
    const route = await import('@/app/api/portal/seo/projects/route');
    const res = await callHandler<Envelope<{ id: number }[]>>(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(200);
    expect((res.data as Envelope<{ id: number }[]>).data).toHaveLength(0);
  });

  it("returns 404 to tenant B for tenant A's project detail, update, delete and crawl", async () => {
    await asTenant(A);
    const created = await createProject('https://a-detail.com/');
    const projectId = String(created.data.id);

    await asTenant(B);
    const detail = await import('@/app/api/portal/seo/projects/[id]/route');
    const crawl = await import('@/app/api/portal/seo/projects/[id]/crawl/route');
    const mod = detail as unknown as Record<string, unknown>;

    expect((await callHandler(mod, 'GET', { params: { id: projectId } })).status).toBe(404);
    expect((await callHandler(mod, 'PATCH', { params: { id: projectId }, body: { name: 'stolen' } })).status).toBe(404);
    expect((await callHandler(mod, 'DELETE', { params: { id: projectId } })).status).toBe(404);
    expect(
      (await callHandler(crawl as unknown as Record<string, unknown>, 'POST', { params: { id: projectId } })).status,
    ).toBe(404);

    // And A can still read it — B's probing changed nothing.
    await asTenant(A);
    const mine = await callHandler<Envelope<{ name: string }>>(mod, 'GET', { params: { id: projectId } });
    expect(mine.status).toBe(200);
    expect((mine.data as Envelope<{ name: string }>).data.name).not.toBe('stolen');
  });

  it('enqueues one crawl run per project (idempotent trigger) and scopes run reads @tenancy', async () => {
    await asTenant(A);
    const created = await createProject('https://a-crawl.com/');
    const projectId = String(created.data.id);

    const crawl = await import('@/app/api/portal/seo/projects/[id]/crawl/route');
    const first = await callHandler<Envelope<{ runId: number; alreadyActive: boolean }>>(
      crawl as unknown as Record<string, unknown>,
      'POST',
      { params: { id: projectId } },
    );
    expect(first.status).toBe(202);
    const runId = (first.data as Envelope<{ runId: number; alreadyActive: boolean }>).data.runId;

    const second = await callHandler<Envelope<{ runId: number; alreadyActive: boolean }>>(
      crawl as unknown as Record<string, unknown>,
      'POST',
      { params: { id: projectId } },
    );
    expect(second.status).toBe(200);
    expect((second.data as Envelope<{ runId: number; alreadyActive: boolean }>).data).toMatchObject({
      runId,
      alreadyActive: true,
    });

    // Run endpoints: owner reads, the other tenant gets 404s.
    const runRoute = await import('@/app/api/portal/seo/runs/[id]/route');
    const issuesRoute = await import('@/app/api/portal/seo/runs/[id]/issues/route');
    const pagesRoute = await import('@/app/api/portal/seo/runs/[id]/pages/route');
    const runParams = { params: { id: String(runId) } };

    expect((await callHandler(runRoute as unknown as Record<string, unknown>, 'GET', runParams)).status).toBe(200);

    await asTenant(B);
    for (const mod of [runRoute, issuesRoute, pagesRoute]) {
      const res = await callHandler(mod as unknown as Record<string, unknown>, 'GET', runParams);
      expect(res.status).toBe(404);
    }
  });
});
