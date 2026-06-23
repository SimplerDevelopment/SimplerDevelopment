/**
 * Site snapshots — cross-tenant isolation. @tenancy
 *
 * Snapshots are tenant-scoped resources. Client B must not see, modify, or
 * import a snapshot created by Client A, regardless of who owns the target
 * site they pass in. Cross-client imports require admin/employee role on
 * the calling user.
 *
 * Routes covered:
 *   - GET    /api/portal/snapshots/[id]       — 404 on foreign-tenant access
 *   - DELETE /api/portal/snapshots/[id]       — 404 on foreign-tenant access
 *   - POST   /api/portal/snapshots/[id]/import — 404 on foreign-tenant snapshot,
 *                                                403 when targetClientId differs from
 *                                                the caller and role is not staff.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    has: () => false,
  })),
}));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../../helpers/call-handler';
import {
  sessionForNewClientUser,
  sessionForStaff,
  type TenantCtx,
} from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';

async function seedSite(ctx: TenantCtx, label: string): Promise<{ siteId: number }> {
  const sql = getTestSql();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const [s] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
    VALUES (${ctx.client.id}, ${`${label}-${stamp}`}, ${`${label}-${stamp}.test`})
    RETURNING id
  `;
  return { siteId: s.id };
}

async function seedSnapshotForClient(
  ctx: TenantCtx,
  sourceSiteId: number,
): Promise<{ snapshotId: number }> {
  // Use the export route so we get a real, valid payload — same as production.
  mockedAuth.mockResolvedValue(ctx.session);
  const route = await import('@/app/api/portal/sites/[siteId]/export/route');
  const res = await callHandler<{ success: boolean; data: { id: number } }>(
    route as unknown as Record<string, unknown>,
    'POST',
    {
      params: { siteId: String(sourceSiteId) },
      body: { name: `cross-tenant-${ctx.client.id}-${Date.now()}` },
    },
  );
  expect(res.status).toBe(200);
  return { snapshotId: res.data!.data.id };
}

describe('Site snapshots — cross-tenant access @snapshots @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('snap-tenant-a'),
      sessionForNewClientUser('snap-tenant-b'),
    ]);
  });

  it('client B cannot GET a snapshot owned by client A — 404', async () => {
    const { siteId } = await seedSite(A, 'a-src');
    const { snapshotId } = await seedSnapshotForClient(A, siteId);

    mockedAuth.mockResolvedValue(B.session);
    const route = await import('@/app/api/portal/snapshots/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET', {
      params: { id: String(snapshotId) },
    });
    expect(res.status).toBe(404);

    // Belt-and-braces: the row really does still belong to A.
    const sql = getTestSql();
    const [row] = await sql<{ client_id: number }[]>`
      SELECT client_id FROM ${sql(TEST_SCHEMA)}.site_snapshots WHERE id = ${snapshotId}
    `;
    expect(row.client_id).toBe(A.client.id);
  });

  it('client B cannot DELETE a snapshot owned by client A — 404, snapshot survives', async () => {
    const { siteId } = await seedSite(A, 'a-del');
    const { snapshotId } = await seedSnapshotForClient(A, siteId);

    mockedAuth.mockResolvedValue(B.session);
    const route = await import('@/app/api/portal/snapshots/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'DELETE', {
      params: { id: String(snapshotId) },
    });
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.site_snapshots WHERE id = ${snapshotId}
    `;
    expect(rows).toHaveLength(1);
  });

  it('client B cannot POST /import on a snapshot owned by client A — 404', async () => {
    const { siteId: aSite } = await seedSite(A, 'a-imp');
    const { snapshotId } = await seedSnapshotForClient(A, aSite);
    // B has its own target site, but the snapshot is invisible to it.
    const { siteId: bSite } = await seedSite(B, 'b-imp-tgt');

    mockedAuth.mockResolvedValue(B.session);
    const route = await import('@/app/api/portal/snapshots/[id]/import/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(snapshotId) },
      body: { siteId: bSite },
    });
    expect(res.status).toBe(404);

    // No data leaked into B's site.
    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.posts WHERE website_id = ${bSite}
    `;
    expect(rows).toHaveLength(0);
  });

  it('non-staff caller importing into a foreign client (targetClientId !== self) — 403', async () => {
    // Caller A owns the snapshot. They try to import it into B's tenant by
    // passing targetClientId=B. A is a regular `editor`, not staff.
    const { siteId } = await seedSite(A, 'a-cross');
    const { snapshotId } = await seedSnapshotForClient(A, siteId);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/snapshots/[id]/import/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      {
        params: { id: String(snapshotId) },
        body: { targetClientId: B.client.id, createNewSite: true },
      },
    );
    expect(res.status).toBe(403);
    expect(res.data?.success).toBe(false);
    expect(res.data?.message).toMatch(/admin/i);

    // No new site was created under B.
    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.client_websites WHERE client_id = ${B.client.id}
    `;
    expect(rows).toHaveLength(0);
  });

  it('admin/staff CAN import into a foreign client (targetClientId !== self) — 200', async () => {
    // Pre-arrange: snapshot owned by staff member, imported into client B's tenant.
    const staff = await sessionForStaff('snap-staff-import');
    const { siteId } = await seedSite(staff, 'staff-src');

    mockedAuth.mockResolvedValue(staff.session);
    const exportRoute = await import('@/app/api/portal/sites/[siteId]/export/route');
    const exportRes = await callHandler<{ success: boolean; data: { id: number } }>(
      exportRoute as unknown as Record<string, unknown>,
      'POST',
      { params: { siteId: String(siteId) }, body: { name: `staff-snap-${Date.now()}` } },
    );
    expect(exportRes.status).toBe(200);
    const snapshotId = exportRes.data!.data.id;

    const importRoute = await import('@/app/api/portal/snapshots/[id]/import/route');
    const importRes = await callHandler<{
      success: boolean;
      data: { siteId: number };
    }>(importRoute as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(snapshotId) },
      body: { targetClientId: B.client.id, createNewSite: true, newSiteName: 'Staff-Cloned' },
    });
    expect(importRes.status).toBe(200);
    expect(importRes.data?.success).toBe(true);

    // The new site really does belong to B now.
    const sql = getTestSql();
    const [row] = await sql<{ client_id: number }[]>`
      SELECT client_id FROM ${sql(TEST_SCHEMA)}.client_websites
      WHERE id = ${importRes.data!.data.siteId}
    `;
    expect(row.client_id).toBe(B.client.id);
  });
});
