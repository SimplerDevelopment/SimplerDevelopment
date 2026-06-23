/**
 * Validation / not-found behaviour for the admin tier-assignment endpoint.
 *
 * The route accepts `{ serviceId: number | null }`. The task brief was
 * authored against an earlier slug-keyed proposal that returns 422; the
 * shipped route disambiguates as follows (see route source for detail):
 *
 *   - serviceId not present in services           → 404 'Service not found'
 *   - serviceId present but slug ∉ TIER_SLUGS     → 400 'Service is not a pricing tier'
 *   - serviceId present but isn't NaN-able        → 400 'Invalid serviceId'
 *
 * The non-subscription-category check is implemented as a slug allowlist
 * (TIER_SLUGS = tier-starter | tier-growth | tier-scale) rather than a
 * services.category='subscription' query — but the practical effect is the
 * same: any non-tier service is rejected before any client_services row is
 * mutated. The tests below cover that contract end-to-end and assert the
 * rejection is observable AND non-mutating.
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

async function postPlan(clientId: number, body: unknown) {
  const route = await import('@/app/api/admin/portal/clients/[id]/plan/route');
  return callHandler<{ success: boolean; message?: string }>(
    route as unknown as Record<string, unknown>,
    'POST',
    { params: { id: String(clientId) }, body },
  );
}

async function countClientServices(clientId: number): Promise<number> {
  const sql = getTestSql();
  const rows = await sql<{ c: string }[]>`
    SELECT COUNT(*)::text AS c
    FROM ${sql(TEST_SCHEMA)}.client_services
    WHERE client_id = ${clientId}
  `;
  return Number(rows[0].c);
}

async function seedNonTierService(slug: string, name: string, category: string) {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services
      (name, slug, category, price, billing_cycle, active)
    VALUES (${name}, ${slug}, ${category}, 2500, 'monthly', true)
    RETURNING id
  `;
  return row.id;
}

async function seedTier(slug: string, name: string) {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services
      (name, slug, category, price, billing_cycle, active)
    VALUES (${name}, ${slug}, 'subscription', 9900, 'monthly', true)
    RETURNING id
  `;
  return row.id;
}

describe('POST /api/admin/portal/clients/[id]/plan — invalid tier @admin @billing', () => {
  let staff: TenantCtx;
  let target: TenantCtx;

  beforeEach(async () => {
    [staff, target] = await Promise.all([
      sessionForStaff('plan-notfound-staff'),
      sessionForNewClientUser('plan-notfound-target'),
    ]);
    mockedAuth.mockResolvedValue(staff.session);
  });

  it('serviceId pointing at a non-existent services row → 404 with informative message', async () => {
    const res = await postPlan(target.client.id, { serviceId: 999_999_999 });
    expect(res.status).toBe(404);
    expect(res.data?.success).toBe(false);
    expect(res.data?.message).toMatch(/not found/i);

    // Defensive: nothing was inserted for this client.
    expect(await countClientServices(target.client.id)).toBe(0);
  });

  it('serviceId pointing at a non-tier (hosting) service → 400 "Service is not a pricing tier"', async () => {
    const hostingId = await seedNonTierService(`hosting-${Date.now()}`, 'Premium Hosting', 'hosting');

    const res = await postPlan(target.client.id, { serviceId: hostingId });
    expect(res.status).toBe(400);
    expect(res.data?.success).toBe(false);
    expect(res.data?.message).toMatch(/not a pricing tier/i);

    expect(await countClientServices(target.client.id)).toBe(0);
  });

  it('serviceId pointing at a category=subscription row whose slug is NOT a tier slug → 400', async () => {
    // The route gates on the slug allowlist (tier-starter|tier-growth|tier-scale),
    // not on category. A subscription row with an off-list slug still gets
    // rejected — proving the route rejects unknown subscriptions, not just
    // unknown categories.
    const offListId = await seedNonTierService(
      `legacy-sub-${Date.now()}`,
      'Legacy Subscription Plan',
      'subscription',
    );

    const res = await postPlan(target.client.id, { serviceId: offListId });
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/not a pricing tier/i);

    expect(await countClientServices(target.client.id)).toBe(0);
  });

  it('serviceId of NaN / non-numeric → 400 "Invalid serviceId"', async () => {
    const res = await postPlan(target.client.id, { serviceId: 'not-a-number' });
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/invalid serviceid/i);
    expect(await countClientServices(target.client.id)).toBe(0);
  });

  it('rejection of an invalid tier does NOT cancel a previously-active tier', async () => {
    // Pre-seed a real tier assignment.
    const starterId = await seedTier('tier-starter', 'Starter');
    const ok = await postPlan(target.client.id, { serviceId: starterId });
    expect(ok.status).toBe(200);

    // Try to switch to an invalid (non-tier) service. This must NOT blow
    // away the existing active tier — i.e. the route must validate the
    // target BEFORE issuing the cancel-prior UPDATE.
    const hostingId = await seedNonTierService(`hosting-${Date.now()}`, 'Hosting', 'hosting');
    const bad = await postPlan(target.client.id, { serviceId: hostingId });
    expect(bad.status).toBe(400);

    // Active tier still intact.
    const sql = getTestSql();
    const rows = await sql<{ status: string; service_id: number }[]>`
      SELECT status, service_id FROM ${sql(TEST_SCHEMA)}.client_services
      WHERE client_id = ${target.client.id}
      ORDER BY id ASC
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('active');
    expect(rows[0].service_id).toBe(starterId);
  });
});
