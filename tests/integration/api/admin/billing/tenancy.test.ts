/**
 * Multi-tenant leak regression for the metered-billing surface @tenancy.
 *
 * Tagged with `@tenancy` so `bun test:tenancy` (and the integration tag
 * filter) sweep this file on every data-access change.
 *
 * The tables under test are scoped strictly by `client_id`:
 *   - `metered_subscription_items`
 *   - `usage_billing_periods`
 *   - `usage_meter_events` (rolled up via the cron / admin force endpoint)
 *
 * The admin route paths take `:id` (clientId) directly, so the data should
 * NEVER surface across tenants — even though admins themselves see all
 * tenants on aggregate endpoints. Each scenario seeds rows for two tenants
 * and asserts the requesting URL only ever sees its scoped tenant's data.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

const reportUsageMock = vi.fn();
vi.mock('@/lib/stripe', () => ({
  reportUsage: (...args: unknown[]) => reportUsageMock(...args),
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

const CRON_SECRET = 'test-cron-secret-' + Math.random().toString(36).slice(2);

function currentPeriodUtcStr(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function seedMeteredItem(
  clientId: number,
  overrides: Partial<{
    resource: string;
    unitPriceCents: number;
    includedQuantity: number;
    status: string;
    stripeSubscriptionItemId: string;
  }> = {},
): Promise<{ id: number; stripeSubscriptionItemId: string }> {
  const sql = getTestSql();
  const stripeSubscriptionItemId = overrides.stripeSubscriptionItemId
    ?? `si_${Math.random().toString(36).slice(2, 12)}`;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.metered_subscription_items (
      client_id, stripe_subscription_id, stripe_subscription_item_id,
      resource, unit_price_cents, included_quantity, status
    ) VALUES (
      ${clientId},
      ${`sub_${Math.random().toString(36).slice(2, 10)}`},
      ${stripeSubscriptionItemId},
      ${overrides.resource ?? 'hosting_bandwidth_gb'},
      ${overrides.unitPriceCents ?? 5},
      ${(overrides.includedQuantity ?? 0).toString()},
      ${overrides.status ?? 'active'}
    )
    RETURNING id
  `;
  return { id: row.id, stripeSubscriptionItemId };
}

async function seedUsageEvent(
  clientId: number,
  resource: string,
  amount: number,
  period: string,
): Promise<void> {
  const sql = getTestSql();
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.usage_meter_events (
      client_id, resource, period, amount, source
    ) VALUES (
      ${clientId}, ${resource}, ${period}, ${amount.toString()}, 'manual'
    )
  `;
}

beforeEach(() => {
  reportUsageMock.mockReset();
  process.env.CRON_SECRET = CRON_SECRET;
});

// ───────────────── metered-items list (GET) ──────────────────────────────────

describe('Metered items: cross-tenant list isolation @admin @billing @metered @tenancy', () => {
  let staff: TenantCtx;
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [staff, A, B] = await Promise.all([
      sessionForStaff('tenancy-list-staff'),
      sessionForNewClientUser('tenancy-list-a'),
      sessionForNewClientUser('tenancy-list-b'),
    ]);
  });

  it('GET scoped to A only returns A\'s items, never B\'s', async () => {
    const aItem = await seedMeteredItem(A.client.id, { resource: 'hosting_bandwidth_gb' });
    const bItem = await seedMeteredItem(B.client.id, { resource: 'email_send' });

    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/metered-items/route');
    const res = await callHandler<{
      success: boolean;
      data: Array<{ id: number; clientId: number; resource: string }>;
    }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(A.client.id) } },
    );
    expect(res.status).toBe(200);
    const ids = res.data!.data.map(r => r.id);
    expect(ids).toContain(aItem.id);
    expect(ids).not.toContain(bItem.id);
    expect(res.data!.data.every(r => r.clientId === A.client.id)).toBe(true);
  });
});

// ───────────────── metered-items PATCH cross-tenant ──────────────────────────

describe('Metered items: cross-tenant PATCH guard @admin @billing @metered @tenancy', () => {
  let staff: TenantCtx;
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [staff, A, B] = await Promise.all([
      sessionForStaff('tenancy-patch-staff'),
      sessionForNewClientUser('tenancy-patch-a'),
      sessionForNewClientUser('tenancy-patch-b'),
    ]);
  });

  it('PATCH /clients/A/.../items/{B-itemId} → 404, B\'s row untouched', async () => {
    const bItem = await seedMeteredItem(B.client.id, { status: 'active', includedQuantity: 50 });

    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/metered-items/[itemId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      {
        params: { id: String(A.client.id), itemId: String(bItem.id) },
        body: { status: 'paused', includedQuantity: 9999 },
      },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ status: string; included_quantity: string }[]>`
      SELECT status, included_quantity FROM ${sql(TEST_SCHEMA)}.metered_subscription_items
      WHERE id = ${bItem.id}
    `;
    expect(row.status).toBe('active');
    expect(parseFloat(row.included_quantity)).toBe(50);
  });

  it('DELETE /clients/A/.../items/{B-itemId} → 404, B\'s row preserved', async () => {
    const bItem = await seedMeteredItem(B.client.id);

    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/metered-items/[itemId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(A.client.id), itemId: String(bItem.id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.metered_subscription_items WHERE id = ${bItem.id}
    `;
    expect(rows.length).toBe(1);
  });
});

// ───────────────── usage GET cross-tenant ────────────────────────────────────

describe('Usage GET: cross-tenant data isolation @admin @billing @metered @tenancy', () => {
  let staff: TenantCtx;
  let A: TenantCtx;
  let B: TenantCtx;
  const PERIOD = currentPeriodUtcStr();

  beforeEach(async () => {
    [staff, A, B] = await Promise.all([
      sessionForStaff('tenancy-usage-staff'),
      sessionForNewClientUser('tenancy-usage-a'),
      sessionForNewClientUser('tenancy-usage-b'),
    ]);
  });

  it('GET /clients/A/.../usage returns A\'s totals only, not B\'s', async () => {
    await seedMeteredItem(A.client.id, { resource: 'hosting_bandwidth_gb', includedQuantity: 0 });
    await seedMeteredItem(B.client.id, { resource: 'hosting_bandwidth_gb', includedQuantity: 0 });
    await seedUsageEvent(A.client.id, 'hosting_bandwidth_gb', 100, PERIOD);
    await seedUsageEvent(B.client.id, 'hosting_bandwidth_gb', 999, PERIOD);

    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/usage/route');
    const res = await callHandler<{
      data: {
        liveTotals: Array<{ resource: string; total: number }>;
        dryRun: Array<{ resource: string; total: number }>;
      };
    }>(
      route as unknown as Record<string, unknown>, 'GET',
      {
        params: { id: String(A.client.id) },
        query: { period: PERIOD },
      },
    );
    expect(res.status).toBe(200);

    // A's totals, not B's.
    const lt = Object.fromEntries(res.data!.data.liveTotals.map(t => [t.resource, t.total]));
    expect(lt['hosting_bandwidth_gb']).toBe(100);
    const dr = Object.fromEntries(res.data!.data.dryRun.map(t => [t.resource, t.total]));
    expect(dr['hosting_bandwidth_gb']).toBe(100);
  });

  it('history view: A\'s usage_billing_periods rows are not visible from B\'s URL', async () => {
    // Seed an audit row for A.
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.usage_billing_periods (
        client_id, period, resource, total_quantity, included_quantity,
        billable_quantity, unit_price_cents, billed_amount_cents,
        stripe_usage_record_id, reported_at
      ) VALUES (
        ${A.client.id}, ${PERIOD}, 'hosting_bandwidth_gb',
        '100', '50', '50', 5, 250,
        'ur_a_only', NOW()
      )
    `;

    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/usage/route');
    const res = await callHandler<{
      data: { history: Array<{ stripeUsageRecordId: string | null; clientId: number }> };
    }>(
      route as unknown as Record<string, unknown>, 'GET',
      {
        params: { id: String(B.client.id) },
        query: { period: PERIOD },
      },
    );
    expect(res.status).toBe(200);
    // B's URL should NOT see A's audit row.
    const ids = res.data!.data.history.map(h => h.stripeUsageRecordId);
    expect(ids).not.toContain('ur_a_only');
  });
});

// ───────────────── cron rollup cross-tenant ──────────────────────────────────

describe('Cron rollup: cross-tenant event isolation @cron @billing @metered @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  const PERIOD = currentPeriodUtcStr();

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('tenancy-cron-a'),
      sessionForNewClientUser('tenancy-cron-b'),
    ]);
    reportUsageMock.mockImplementation(async (itemId: string) => ({ id: `ur_${itemId}` }));
  });

  it('A\'s metered item rolls up only A\'s usage events, never B\'s', async () => {
    // Only A has an active metered item. B has no items, but emits events.
    const aItem = await seedMeteredItem(A.client.id, {
      resource: 'hosting_bandwidth_gb',
      unitPriceCents: 5,
      includedQuantity: 0,
      stripeSubscriptionItemId: 'si_a_only',
    });
    await seedUsageEvent(A.client.id, 'hosting_bandwidth_gb', 30, PERIOD);
    // B's events for the same resource — must NOT be summed into A.
    await seedUsageEvent(B.client.id, 'hosting_bandwidth_gb', 1000, PERIOD);

    const route = await import('@/app/api/cron/usage-rollup/route');
    const res = await callHandler<{
      data: { totalClients: number; perClient: Array<{ clientId: number; rollups: Array<{ billable: number; stripeSubscriptionItemId: string | null }> }> };
    }>(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: `Bearer ${CRON_SECRET}` } },
    );
    expect(res.status).toBe(200);

    // Only A is iterated (B has no active metered items).
    expect(res.data?.data.totalClients).toBe(1);
    expect(res.data?.data.perClient[0].clientId).toBe(A.client.id);

    // A's billable reflects A's events only (30, not 30+1000).
    const aRollup = res.data!.data.perClient[0].rollups[0];
    expect(aRollup.billable).toBe(30);
    expect(aRollup.stripeSubscriptionItemId).toBe(aItem.stripeSubscriptionItemId);

    // Stripe push: exactly once, for A's item, with A's quantity.
    expect(reportUsageMock).toHaveBeenCalledTimes(1);
    expect(reportUsageMock.mock.calls[0][0]).toBe('si_a_only');
    expect(reportUsageMock.mock.calls[0][1]).toBe(30);

    // Audit row: only A has one for this period.
    const sql = getTestSql();
    const rows = await sql<{ client_id: number; billable_quantity: string }[]>`
      SELECT client_id, billable_quantity FROM ${sql(TEST_SCHEMA)}.usage_billing_periods
      WHERE period = ${PERIOD} AND resource = 'hosting_bandwidth_gb'
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].client_id).toBe(A.client.id);
    expect(parseFloat(rows[0].billable_quantity)).toBe(30);
  });

  it('both A and B with active metered items: each is rolled up against own events only', async () => {
    await seedMeteredItem(A.client.id, {
      resource: 'hosting_bandwidth_gb',
      unitPriceCents: 5,
      includedQuantity: 0,
      stripeSubscriptionItemId: 'si_a_both',
    });
    await seedMeteredItem(B.client.id, {
      resource: 'hosting_bandwidth_gb',
      unitPriceCents: 5,
      includedQuantity: 0,
      stripeSubscriptionItemId: 'si_b_both',
    });
    await seedUsageEvent(A.client.id, 'hosting_bandwidth_gb', 10, PERIOD);
    await seedUsageEvent(B.client.id, 'hosting_bandwidth_gb', 200, PERIOD);

    const route = await import('@/app/api/cron/usage-rollup/route');
    const res = await callHandler<{
      data: { perClient: Array<{ clientId: number; rollups: Array<{ billable: number; stripeSubscriptionItemId: string | null }> }> };
    }>(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: `Bearer ${CRON_SECRET}` } },
    );
    expect(res.status).toBe(200);

    const byClient = Object.fromEntries(
      res.data!.data.perClient.map(c => [c.clientId, c.rollups[0]]),
    );
    expect(byClient[A.client.id].billable).toBe(10);
    expect(byClient[A.client.id].stripeSubscriptionItemId).toBe('si_a_both');
    expect(byClient[B.client.id].billable).toBe(200);
    expect(byClient[B.client.id].stripeSubscriptionItemId).toBe('si_b_both');

    // Each client's audit row is keyed by its own clientId.
    const sql = getTestSql();
    const rows = await sql<{ client_id: number; billable_quantity: string }[]>`
      SELECT client_id, billable_quantity FROM ${sql(TEST_SCHEMA)}.usage_billing_periods
      WHERE period = ${PERIOD} AND resource = 'hosting_bandwidth_gb'
      ORDER BY client_id
    `;
    expect(rows.length).toBe(2);
    const auditByClient = Object.fromEntries(rows.map(r => [r.client_id, parseFloat(r.billable_quantity)]));
    expect(auditByClient[A.client.id]).toBe(10);
    expect(auditByClient[B.client.id]).toBe(200);
  });
});
