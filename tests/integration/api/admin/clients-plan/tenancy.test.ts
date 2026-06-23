/**
 * Cross-tenant isolation for the admin tier-assignment endpoint.
 *
 * Even though the route is admin-only (staff see all tenants by design),
 * its data-access pattern still has to scope writes to the URL-supplied
 * client_id. This spec proves that:
 *
 *   - POSTing on /api/admin/portal/clients/[A]/plan only mutates rows
 *     belonging to client A. Client B's existing client_services rows
 *     (active OR cancelled) are never read or modified.
 *
 *   - GET on client A's plan does not surface client B's tier rows in
 *     the active-tier slot.
 *
 * This guards against the classic "missing WHERE client_id" data-access bug
 * — a subtle regression because admin routes don't filter on the caller's
 * tenancy, only on the resource path.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../../helpers/call-handler';
import {
  sessionForNewClientUser,
  sessionForStaff,
  type TenantCtx,
} from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';

interface TierRow {
  id: number;
  slug: string;
}

async function seedTier(slug: string, name: string): Promise<TierRow> {
  const sql = getTestSql();
  const [row] = await sql<TierRow[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services
      (name, slug, category, price, billing_cycle, active)
    VALUES (${name}, ${slug}, 'subscription', 9900, 'monthly', true)
    RETURNING id, slug
  `;
  return row;
}

async function seedTiers(): Promise<{ starter: TierRow; growth: TierRow; scale: TierRow }> {
  const [starter, growth, scale] = await Promise.all([
    seedTier('plan-starter', 'Starter'),
    seedTier('plan-growth', 'Growth'),
    seedTier('plan-scale', 'Scale'),
  ]);
  return { starter, growth, scale };
}

async function postPlan(clientId: number, body: unknown) {
  const route = await import('@/app/api/admin/portal/clients/[id]/plan/route');
  return callHandler<{ success: boolean }>(
    route as unknown as Record<string, unknown>,
    'POST',
    { params: { id: String(clientId) }, body },
  );
}

async function getPlan(clientId: number) {
  const route = await import('@/app/api/admin/portal/clients/[id]/plan/route');
  return callHandler<{
    success: boolean;
    data?: {
      active: { clientServiceId: number; serviceId: number; slug: string } | null;
    };
  }>(route as unknown as Record<string, unknown>, 'GET', { params: { id: String(clientId) } });
}

async function clientServicesFor(clientId: number) {
  const sql = getTestSql();
  return sql<{ id: number; service_id: number; status: string }[]>`
    SELECT id, service_id, status
    FROM ${sql(TEST_SCHEMA)}.client_services
    WHERE client_id = ${clientId}
    ORDER BY id ASC
  `;
}

describe('POST /api/admin/portal/clients/[id]/plan — cross-tenant isolation @admin @billing @tenancy', () => {
  let staff: TenantCtx;
  let A: TenantCtx;
  let B: TenantCtx;
  let tiers: { starter: TierRow; growth: TierRow; scale: TierRow };

  beforeEach(async () => {
    [staff, A, B, tiers] = await Promise.all([
      sessionForStaff('plan-tenancy-staff'),
      sessionForNewClientUser('plan-tenancy-a'),
      sessionForNewClientUser('plan-tenancy-b'),
      seedTiers(),
    ]);
    mockedAuth.mockResolvedValue(staff.session);
  });

  it('writing on client A leaves client B\'s active tier untouched', async () => {
    // Pre-seed B with an active tier.
    await postPlan(B.client.id, { serviceId: tiers.starter.id });
    const bBefore = await clientServicesFor(B.client.id);
    expect(bBefore).toHaveLength(1);
    const bRowIdBefore = bBefore[0].id;

    // Now hammer client A with a sequence of tier changes.
    await postPlan(A.client.id, { serviceId: tiers.starter.id });
    await postPlan(A.client.id, { serviceId: tiers.growth.id });
    await postPlan(A.client.id, { serviceId: tiers.scale.id });

    // A has 3 rows: 2 cancelled, 1 active.
    const aRows = await clientServicesFor(A.client.id);
    expect(aRows).toHaveLength(3);
    expect(aRows.filter(r => r.status === 'active')).toHaveLength(1);

    // B was never touched: same row id, same status.
    const bAfter = await clientServicesFor(B.client.id);
    expect(bAfter).toHaveLength(1);
    expect(bAfter[0].id).toBe(bRowIdBefore);
    expect(bAfter[0].status).toBe('active');
    expect(bAfter[0].service_id).toBe(tiers.starter.id);
  });

  it('cancelled history rows from one client are never modified by another client\'s tier change', async () => {
    // A: build up a history of cancelled rows.
    await postPlan(A.client.id, { serviceId: tiers.starter.id });
    await postPlan(A.client.id, { serviceId: tiers.growth.id });

    const aBefore = await clientServicesFor(A.client.id);
    expect(aBefore).toHaveLength(2);
    const cancelledBefore = aBefore.find(r => r.status === 'cancelled');
    expect(cancelledBefore).toBeDefined();

    // Now change B's tier multiple times.
    await postPlan(B.client.id, { serviceId: tiers.starter.id });
    await postPlan(B.client.id, { serviceId: tiers.scale.id });

    // A's rows should be byte-identical to before.
    const aAfter = await clientServicesFor(A.client.id);
    expect(aAfter).toEqual(aBefore);
  });

  it('GET on client A returns A\'s active tier even when B has a different one', async () => {
    await postPlan(A.client.id, { serviceId: tiers.starter.id });
    await postPlan(B.client.id, { serviceId: tiers.scale.id });

    const aRes = await getPlan(A.client.id);
    expect(aRes.status).toBe(200);
    expect(aRes.data?.data?.active?.slug).toBe('plan-starter');

    const bRes = await getPlan(B.client.id);
    expect(bRes.status).toBe(200);
    expect(bRes.data?.data?.active?.slug).toBe('plan-scale');
  });

  it('non-tier client_services rows on the same client are NOT cancelled by a tier change', async () => {
    // Seed a non-tier service (e.g. hosting) and a clientService row pointing
    // at it for client A. The plan endpoint must only deactivate prior TIER
    // rows, never unrelated services like hosting / domain / per-project.
    const sql = getTestSql();
    const [hosting] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.services (name, slug, category, price, billing_cycle, active)
      VALUES ('Premium Hosting', ${`hosting-${Date.now()}`}, 'hosting', 2500, 'monthly', true)
      RETURNING id
    `;
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.client_services (client_id, service_id, status)
      VALUES (${A.client.id}, ${hosting.id}, 'active')
    `;

    // Assign a tier — this should NOT touch the hosting row.
    await postPlan(A.client.id, { serviceId: tiers.starter.id });

    const aRows = await clientServicesFor(A.client.id);
    expect(aRows).toHaveLength(2);
    const hostingRow = aRows.find(r => r.service_id === hosting.id);
    expect(hostingRow).toBeDefined();
    expect(hostingRow?.status).toBe('active');

    // Switching tiers also leaves the hosting row alone.
    await postPlan(A.client.id, { serviceId: tiers.growth.id });
    const aRowsAfter = await clientServicesFor(A.client.id);
    const hostingAfter = aRowsAfter.find(r => r.service_id === hosting.id);
    expect(hostingAfter?.status).toBe('active');
  });
});
