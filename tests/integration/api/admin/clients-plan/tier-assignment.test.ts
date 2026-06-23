/**
 * Integration tests for the admin tier-assignment endpoint:
 *   GET  /api/admin/portal/clients/[id]/plan  — current active tier + catalog
 *   POST /api/admin/portal/clients/[id]/plan  — assign / change the active tier
 *
 * The route is keyed by `serviceId` (a numeric FK into services) — NOT by tier
 * slug — so all POST bodies in these tests look like { serviceId: <id> }. The
 * three tier rows are seeded per-test with the canonical tier-starter /
 * tier-growth / tier-scale slugs and category='subscription' (mirroring
 * scripts/seed-pricing-tiers.ts).
 *
 * Behaviour under test:
 *   - First-ever assignment: inserts an active client_services row with
 *     status='active' and start_date populated, pointing at the requested
 *     tier service.
 *   - Re-assignment: prior active tier row is flipped to status='cancelled'
 *     and a fresh status='active' row is inserted. Only one active row
 *     exists at any moment.
 *   - Round-trip Starter → Growth → Scale → Starter leaves exactly one
 *     active tier row plus a history of cancelled rows.
 *   - GET returns the current active tier (or null) plus the catalog.
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
  name: string;
}

interface SeededTiers {
  starter: TierRow;
  growth: TierRow;
  scale: TierRow;
}

async function seedTier(slug: string, name: string, price: number): Promise<TierRow> {
  const sql = getTestSql();
  const [row] = await sql<TierRow[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services
      (name, slug, category, price, billing_cycle, active)
    VALUES (
      ${name},
      ${slug},
      'subscription',
      ${price},
      'monthly',
      true
    )
    RETURNING id, slug, name
  `;
  return row;
}

async function seedAllTiers(): Promise<SeededTiers> {
  const [starter, growth, scale] = await Promise.all([
    seedTier('tier-starter', 'Starter', 9_900),
    seedTier('tier-growth', 'Growth', 29_900),
    seedTier('tier-scale', 'Scale', 59_900),
  ]);
  return { starter, growth, scale };
}

async function listClientServiceRows(clientId: number) {
  const sql = getTestSql();
  return sql<
    {
      id: number;
      service_id: number;
      status: string;
      start_date: Date | null;
      renewal_date: Date | null;
    }[]
  >`
    SELECT id, service_id, status, start_date, renewal_date
    FROM ${sql(TEST_SCHEMA)}.client_services
    WHERE client_id = ${clientId}
    ORDER BY id ASC
  `;
}

async function postPlan(clientId: number, body: unknown) {
  const route = await import('@/app/api/admin/portal/clients/[id]/plan/route');
  return callHandler<{ success: boolean; message?: string; data?: unknown }>(
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
      active: {
        clientServiceId: number;
        serviceId: number;
        slug: string;
        name: string;
      } | null;
      catalog: Array<{ id: number; slug: string; name: string }>;
    };
  }>(route as unknown as Record<string, unknown>, 'GET', { params: { id: String(clientId) } });
}

describe('POST /api/admin/portal/clients/[id]/plan — first assignment @admin @billing', () => {
  let staff: TenantCtx;
  let target: TenantCtx;
  let tiers: SeededTiers;

  beforeEach(async () => {
    [staff, target, tiers] = await Promise.all([
      sessionForStaff('plan-assign-staff'),
      sessionForNewClientUser('plan-assign-target'),
      seedAllTiers(),
    ]);
    mockedAuth.mockResolvedValue(staff.session);
  });

  it('creates exactly one active client_services row pointing at the Starter tier', async () => {
    const before = await listClientServiceRows(target.client.id);
    expect(before).toHaveLength(0);

    const res = await postPlan(target.client.id, { serviceId: tiers.starter.id });
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);

    const after = await listClientServiceRows(target.client.id);
    expect(after).toHaveLength(1);
    const [row] = after;
    expect(row.service_id).toBe(tiers.starter.id);
    expect(row.status).toBe('active');
    // The route stamps start_date with `new Date()` (see route handler), so
    // the row should have a populated start_date even though renewal_date is
    // not auto-filled by the current implementation.
    expect(row.start_date).not.toBeNull();
  });

  it('echoes the assigned tier in the response envelope', async () => {
    const res = await postPlan(target.client.id, { serviceId: tiers.growth.id });
    expect(res.status).toBe(200);
    const data = res.data?.data as {
      clientId: number;
      assigned: { id: number; serviceId: number; status: string } | null;
      tier: { id: number; slug: string; name: string } | null;
    };
    expect(data.clientId).toBe(target.client.id);
    expect(data.assigned?.serviceId).toBe(tiers.growth.id);
    expect(data.assigned?.status).toBe('active');
    expect(data.tier?.slug).toBe('tier-growth');
    expect(data.tier?.name).toBe('Growth');
  });
});

describe('POST /api/admin/portal/clients/[id]/plan — switching tiers @admin @billing', () => {
  let staff: TenantCtx;
  let target: TenantCtx;
  let tiers: SeededTiers;

  beforeEach(async () => {
    [staff, target, tiers] = await Promise.all([
      sessionForStaff('plan-switch-staff'),
      sessionForNewClientUser('plan-switch-target'),
      seedAllTiers(),
    ]);
    mockedAuth.mockResolvedValue(staff.session);
  });

  it('Starter → Growth: prior row deactivated, new active row inserted', async () => {
    await postPlan(target.client.id, { serviceId: tiers.starter.id });
    const after1 = await listClientServiceRows(target.client.id);
    expect(after1).toHaveLength(1);
    expect(after1[0].status).toBe('active');
    expect(after1[0].service_id).toBe(tiers.starter.id);

    const res2 = await postPlan(target.client.id, { serviceId: tiers.growth.id });
    expect(res2.status).toBe(200);

    const after2 = await listClientServiceRows(target.client.id);
    expect(after2).toHaveLength(2);

    // Exactly one active row, and it's the Growth tier.
    const active = after2.filter(r => r.status === 'active');
    expect(active).toHaveLength(1);
    expect(active[0].service_id).toBe(tiers.growth.id);

    // The prior Starter row is flipped to cancelled.
    const cancelled = after2.filter(r => r.status === 'cancelled');
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0].service_id).toBe(tiers.starter.id);
  });

  it('Starter → Growth → Scale → Starter leaves one active row + 3 cancelled history rows', async () => {
    await postPlan(target.client.id, { serviceId: tiers.starter.id });
    await postPlan(target.client.id, { serviceId: tiers.growth.id });
    await postPlan(target.client.id, { serviceId: tiers.scale.id });
    await postPlan(target.client.id, { serviceId: tiers.starter.id });

    const all = await listClientServiceRows(target.client.id);
    expect(all).toHaveLength(4);

    const active = all.filter(r => r.status === 'active');
    const cancelled = all.filter(r => r.status === 'cancelled');
    expect(active).toHaveLength(1);
    expect(cancelled).toHaveLength(3);

    // Currently-active row points at Starter (the final step).
    expect(active[0].service_id).toBe(tiers.starter.id);

    // Cancelled history captures every prior tier in order: Starter, Growth, Scale.
    expect(cancelled.map(r => r.service_id)).toEqual([
      tiers.starter.id,
      tiers.growth.id,
      tiers.scale.id,
    ]);
  });

  it('serviceId: null (cancel without replacement) deactivates the active tier and inserts no new row', async () => {
    await postPlan(target.client.id, { serviceId: tiers.starter.id });
    const after1 = await listClientServiceRows(target.client.id);
    expect(after1).toHaveLength(1);

    const res = await postPlan(target.client.id, { serviceId: null });
    expect(res.status).toBe(200);

    const after2 = await listClientServiceRows(target.client.id);
    expect(after2).toHaveLength(1);
    expect(after2[0].status).toBe('cancelled');
  });
});

describe('GET /api/admin/portal/clients/[id]/plan @admin @billing', () => {
  let staff: TenantCtx;
  let target: TenantCtx;
  let tiers: SeededTiers;

  beforeEach(async () => {
    [staff, target, tiers] = await Promise.all([
      sessionForStaff('plan-get-staff'),
      sessionForNewClientUser('plan-get-target'),
      seedAllTiers(),
    ]);
    mockedAuth.mockResolvedValue(staff.session);
  });

  it('returns null active + full catalog when no tier has been assigned', async () => {
    const res = await getPlan(target.client.id);
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data?.active).toBeNull();
    const slugs = res.data?.data?.catalog.map(t => t.slug).sort();
    expect(slugs).toEqual(['tier-growth', 'tier-scale', 'tier-starter']);
  });

  it('returns the current active tier after assignment', async () => {
    await postPlan(target.client.id, { serviceId: tiers.growth.id });

    const res = await getPlan(target.client.id);
    expect(res.status).toBe(200);
    expect(res.data?.data?.active).not.toBeNull();
    expect(res.data?.data?.active?.slug).toBe('tier-growth');
    expect(res.data?.data?.active?.serviceId).toBe(tiers.growth.id);
  });

  it('after a tier switch, GET reports only the new active tier (not cancelled rows)', async () => {
    await postPlan(target.client.id, { serviceId: tiers.starter.id });
    await postPlan(target.client.id, { serviceId: tiers.scale.id });

    const res = await getPlan(target.client.id);
    expect(res.status).toBe(200);
    expect(res.data?.data?.active?.slug).toBe('tier-scale');
  });
});
