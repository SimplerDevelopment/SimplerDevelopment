/**
 * Integration tests for the admin usage preview / force-rollup route.
 *
 *   GET  /api/admin/portal/clients/:id/billing/usage?period=YYYY-MM
 *     → { liveTotals, dryRun, history } — read-only preview, no Stripe push.
 *   POST /api/admin/portal/clients/:id/billing/usage  body: { force, period? }
 *     → triggers a real rollup; force=true + dryRun=false ⇒ Stripe push +
 *       audit row insert in `usage_billing_periods`.
 *
 * Stripe's `reportUsage` is mocked at module level — these tests assert it's
 * called with the right arguments and that the resulting audit row is
 * persisted in the `usage_billing_periods` table.
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
): Promise<{ id: number; stripeSubscriptionItemId: string; resource: string }> {
  const sql = getTestSql();
  const stripeSubscriptionItemId = overrides.stripeSubscriptionItemId
    ?? `si_${Math.random().toString(36).slice(2, 12)}`;
  const resource = overrides.resource ?? 'hosting_bandwidth_gb';
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.metered_subscription_items (
      client_id, stripe_subscription_id, stripe_subscription_item_id,
      resource, unit_price_cents, included_quantity, status
    ) VALUES (
      ${clientId},
      ${`sub_${Math.random().toString(36).slice(2, 10)}`},
      ${stripeSubscriptionItemId},
      ${resource},
      ${overrides.unitPriceCents ?? 5},
      ${(overrides.includedQuantity ?? 0).toString()},
      ${overrides.status ?? 'active'}
    )
    RETURNING id
  `;
  return { id: row.id, stripeSubscriptionItemId, resource };
}

async function seedUsageEvent(
  clientId: number,
  resource: string,
  amount: number,
  period: string,
  source = 'manual',
): Promise<void> {
  const sql = getTestSql();
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.usage_meter_events (
      client_id, resource, period, amount, source
    ) VALUES (
      ${clientId}, ${resource}, ${period}, ${amount.toString()}, ${source}
    )
  `;
}

beforeEach(() => {
  reportUsageMock.mockReset();
});

// ───────────────────────────── GET (preview) ─────────────────────────────────

describe('GET /api/admin/portal/clients/:id/billing/usage @admin @billing @metered', () => {
  let staff: TenantCtx;
  let client: TenantCtx;
  const PERIOD = currentPeriodUtcStr();

  beforeEach(async () => {
    [staff, client] = await Promise.all([
      sessionForStaff('usage-get-staff'),
      sessionForNewClientUser('usage-get-client'),
    ]);
  });

  it('returns liveTotals aggregated from usage_meter_events + dry-run rollup', async () => {
    await seedMeteredItem(client.client.id, {
      resource: 'hosting_bandwidth_gb',
      unitPriceCents: 5,
      includedQuantity: 50,
    });
    await seedMeteredItem(client.client.id, {
      resource: 'email_send',
      unitPriceCents: 1,
      includedQuantity: 10000,
    });

    // Two events on hosting (sums to 75), one on email (sums to 5000).
    await seedUsageEvent(client.client.id, 'hosting_bandwidth_gb', 30, PERIOD);
    await seedUsageEvent(client.client.id, 'hosting_bandwidth_gb', 45, PERIOD);
    await seedUsageEvent(client.client.id, 'email_send', 5000, PERIOD);

    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/usage/route');
    const res = await callHandler<{
      success: boolean;
      data: {
        period: string;
        liveTotals: Array<{ resource: string; total: number }>;
        dryRun: Array<{ resource: string; total: number; included: number; billable: number; billedCents: number; stripeUsageRecordId: string | null }>;
        history: unknown[];
      };
    }>(
      route as unknown as Record<string, unknown>, 'GET',
      {
        params: { id: String(client.client.id) },
        query: { period: PERIOD },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.period).toBe(PERIOD);

    const lt = Object.fromEntries(res.data!.data.liveTotals.map(t => [t.resource, t.total]));
    expect(lt['hosting_bandwidth_gb']).toBe(75);
    expect(lt['email_send']).toBe(5000);

    // dryRun reflects billable = max(0, total - included).
    const dr = Object.fromEntries(res.data!.data.dryRun.map(t => [t.resource, t]));
    expect(dr['hosting_bandwidth_gb'].billable).toBe(25); // 75 - 50
    expect(dr['hosting_bandwidth_gb'].billedCents).toBe(125); // 25 * 5
    expect(dr['hosting_bandwidth_gb'].stripeUsageRecordId).toBeNull();
    expect(dr['email_send'].billable).toBe(0); // 5000 - 10000
    expect(dr['email_send'].billedCents).toBe(0);

    // dryRun MUST NOT push to Stripe.
    expect(reportUsageMock).not.toHaveBeenCalled();
    // dryRun MUST NOT write an audit row.
    const sql = getTestSql();
    const auditRows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.usage_billing_periods
      WHERE client_id = ${client.client.id} AND period = ${PERIOD}
    `;
    expect(auditRows.length).toBe(0);
  });

  it('rejects malformed period (400)', async () => {
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/usage/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      {
        params: { id: String(client.client.id) },
        query: { period: 'May-2026' },
      },
    );
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated (401)', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/usage/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(client.client.id) } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects non-staff caller (401)', async () => {
    mockedAuth.mockResolvedValue(client.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/usage/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(client.client.id) } },
    );
    expect(res.status).toBe(401);
  });
});

// ───────────────────────────── POST (force rollup) ───────────────────────────

describe('POST /api/admin/portal/clients/:id/billing/usage (force rollup) @admin @billing @metered', () => {
  let staff: TenantCtx;
  let client: TenantCtx;
  const PERIOD = currentPeriodUtcStr();

  beforeEach(async () => {
    [staff, client] = await Promise.all([
      sessionForStaff('usage-force-staff'),
      sessionForNewClientUser('usage-force-client'),
    ]);
  });

  it('force=true triggers a real rollup: Stripe pushed + audit row inserted', async () => {
    const item = await seedMeteredItem(client.client.id, {
      resource: 'hosting_bandwidth_gb',
      unitPriceCents: 5,
      includedQuantity: 50,
      stripeSubscriptionItemId: 'si_force_test',
    });
    await seedUsageEvent(client.client.id, 'hosting_bandwidth_gb', 75, PERIOD);

    reportUsageMock.mockResolvedValue({ id: 'ur_force_test_1' });

    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/usage/route');
    const res = await callHandler<{
      success: boolean;
      data: {
        period: string;
        dryRun: boolean;
        result: Array<{ resource: string; billable: number; stripeUsageRecordId: string | null }>;
      };
    }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { id: String(client.client.id) },
        body: { period: PERIOD, force: true },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.dryRun).toBe(false);

    // Stripe push: called with (subItemId, billable=25, periodEndUnix).
    expect(reportUsageMock).toHaveBeenCalledTimes(1);
    const [calledItemId, calledBillable, calledTs] = reportUsageMock.mock.calls[0];
    expect(calledItemId).toBe(item.stripeSubscriptionItemId);
    expect(calledBillable).toBe(25);
    expect(typeof calledTs).toBe('number');
    expect(calledTs).toBeGreaterThan(0);

    // Result echoes Stripe id.
    const r = res.data!.data.result.find(x => x.resource === 'hosting_bandwidth_gb');
    expect(r?.stripeUsageRecordId).toBe('ur_force_test_1');
    expect(r?.billable).toBe(25);

    // Audit row exists in DB.
    const sql = getTestSql();
    const rows = await sql<{
      total_quantity: string; included_quantity: string; billable_quantity: string;
      billed_amount_cents: number; stripe_usage_record_id: string | null;
    }[]>`
      SELECT total_quantity, included_quantity, billable_quantity,
             billed_amount_cents, stripe_usage_record_id
      FROM ${sql(TEST_SCHEMA)}.usage_billing_periods
      WHERE client_id = ${client.client.id} AND period = ${PERIOD}
        AND resource = 'hosting_bandwidth_gb'
    `;
    expect(rows.length).toBe(1);
    expect(parseFloat(rows[0].total_quantity)).toBe(75);
    expect(parseFloat(rows[0].included_quantity)).toBe(50);
    expect(parseFloat(rows[0].billable_quantity)).toBe(25);
    expect(rows[0].billed_amount_cents).toBe(125);
    expect(rows[0].stripe_usage_record_id).toBe('ur_force_test_1');
  });

  it('default body (no force / no dryRun): defaults to dryRun=true → no Stripe call, no audit row', async () => {
    await seedMeteredItem(client.client.id, { resource: 'hosting_bandwidth_gb' });
    await seedUsageEvent(client.client.id, 'hosting_bandwidth_gb', 100, PERIOD);

    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/usage/route');
    const res = await callHandler<{ data: { dryRun: boolean } }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { id: String(client.client.id) },
        body: {},
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.dryRun).toBe(true);
    expect(reportUsageMock).not.toHaveBeenCalled();

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.usage_billing_periods
      WHERE client_id = ${client.client.id}
    `;
    expect(rows.length).toBe(0);
  });

  it('rejects malformed period in body (400)', async () => {
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/usage/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { id: String(client.client.id) },
        body: { period: 'oops', force: true },
      },
    );
    expect(res.status).toBe(400);
    expect(reportUsageMock).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated (401)', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/usage/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(client.client.id) }, body: { force: true } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects non-staff caller (401)', async () => {
    mockedAuth.mockResolvedValue(client.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/usage/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(client.client.id) }, body: { force: true } },
    );
    expect(res.status).toBe(401);
  });
});
