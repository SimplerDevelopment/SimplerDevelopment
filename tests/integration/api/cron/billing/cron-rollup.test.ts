/**
 * Integration tests for the cron usage-rollup endpoint.
 *
 *   GET /api/cron/usage-rollup
 *
 * Auth surface: Bearer ${CRON_SECRET} OR header `x-vercel-cron: 1`.
 *
 * Behaviour:
 *   - Iterates every client with at least one active metered_subscription_item.
 *   - For each (client, resource), pushes the absolute period total to Stripe
 *     via `reportUsage` (action='set' under the hood) and upserts a row in
 *     `usage_billing_periods`. The unique index on (client_id, period,
 *     resource) makes this idempotent — re-runs overwrite, never duplicate.
 *   - Stripe failure is non-fatal: the audit row is still written with
 *     `stripe_usage_record_id = NULL` so a later retry picks it up.
 *
 * Stripe is mocked at module level (no real network call). We assert the
 * mock is invoked with the right arguments per item per run.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const reportUsageMock = vi.fn();
vi.mock('@/lib/stripe', () => ({
  reportUsage: (...args: unknown[]) => reportUsageMock(...args),
}));

import { callHandler } from '../../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../../helpers/session';
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
  process.env.CRON_SECRET = CRON_SECRET;
});

// ───────────────────────────── auth ──────────────────────────────────────────

describe('GET /api/cron/usage-rollup — auth @cron @billing @metered @security', () => {
  it('rejects without Authorization or x-vercel-cron (401)', async () => {
    const route = await import('@/app/api/cron/usage-rollup/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });

  it('rejects with a wrong bearer (401)', async () => {
    const route = await import('@/app/api/cron/usage-rollup/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: 'Bearer wrong-secret' } },
    );
    expect(res.status).toBe(401);
  });

  it('accepts the matching CRON_SECRET (200)', async () => {
    const route = await import('@/app/api/cron/usage-rollup/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: `Bearer ${CRON_SECRET}` } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
  });

  it('accepts the x-vercel-cron header (200)', async () => {
    const route = await import('@/app/api/cron/usage-rollup/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { 'x-vercel-cron': '1' } },
    );
    expect(res.status).toBe(200);
  });

  it('rejects malformed period query (400)', async () => {
    const route = await import('@/app/api/cron/usage-rollup/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
        query: { period: 'oops' },
      },
    );
    expect(res.status).toBe(400);
  });
});

// ───────────────────────────── happy path ────────────────────────────────────

describe('GET /api/cron/usage-rollup — rollup behaviour @cron @billing @metered', () => {
  let A: TenantCtx;
  const PERIOD = currentPeriodUtcStr();

  beforeEach(async () => {
    A = await sessionForNewClientUser('cron-rollup-a');
    reportUsageMock.mockImplementation(async (itemId: string) => ({ id: `ur_${itemId}` }));
  });

  it('rolls up two metered items for one client; pushes Stripe + writes audit rows', async () => {
    const bw = await seedMeteredItem(A.client.id, {
      resource: 'hosting_bandwidth_gb',
      unitPriceCents: 5,
      includedQuantity: 50,
      stripeSubscriptionItemId: 'si_bw_a',
    });
    const email = await seedMeteredItem(A.client.id, {
      resource: 'email_send',
      unitPriceCents: 1,
      includedQuantity: 10000,
      stripeSubscriptionItemId: 'si_email_a',
    });
    await seedUsageEvent(A.client.id, 'hosting_bandwidth_gb', 75, PERIOD);
    await seedUsageEvent(A.client.id, 'email_send', 5000, PERIOD);

    const route = await import('@/app/api/cron/usage-rollup/route');
    const res = await callHandler<{
      success: boolean;
      data: {
        period: string;
        totalClients: number;
        ok: number;
        err: number;
        perClient: Array<{ clientId: number; rollups: Array<{ resource: string; billable: number; stripeUsageRecordId: string | null }> }>;
      };
    }>(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: `Bearer ${CRON_SECRET}` } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.period).toBe(PERIOD);
    expect(res.data?.data.totalClients).toBe(1);
    expect(res.data?.data.ok).toBe(1);
    expect(res.data?.data.err).toBe(0);

    // Stripe pushed twice: once per metered item.
    expect(reportUsageMock).toHaveBeenCalledTimes(2);
    const callMap = Object.fromEntries(
      reportUsageMock.mock.calls.map(c => [c[0], { qty: c[1], ts: c[2] }]),
    );
    expect(callMap[bw.stripeSubscriptionItemId].qty).toBe(25); // 75 - 50
    expect(callMap[email.stripeSubscriptionItemId].qty).toBe(0); // 5000 - 10000

    // Audit rows persisted.
    const sql = getTestSql();
    const rows = await sql<{
      resource: string; billable_quantity: string; billed_amount_cents: number;
      stripe_usage_record_id: string | null;
    }[]>`
      SELECT resource, billable_quantity, billed_amount_cents, stripe_usage_record_id
      FROM ${sql(TEST_SCHEMA)}.usage_billing_periods
      WHERE client_id = ${A.client.id} AND period = ${PERIOD}
      ORDER BY resource
    `;
    expect(rows.length).toBe(2);
    const byResource = Object.fromEntries(rows.map(r => [r.resource, r]));
    expect(parseFloat(byResource['hosting_bandwidth_gb'].billable_quantity)).toBe(25);
    expect(byResource['hosting_bandwidth_gb'].billed_amount_cents).toBe(125);
    expect(byResource['hosting_bandwidth_gb'].stripe_usage_record_id).toBe('ur_si_bw_a');
    expect(parseFloat(byResource['email_send'].billable_quantity)).toBe(0);
    expect(byResource['email_send'].billed_amount_cents).toBe(0);
  });

  it('skips clients with no active metered items', async () => {
    // Inactive item — should not surface this client.
    await seedMeteredItem(A.client.id, { status: 'paused' });
    await seedUsageEvent(A.client.id, 'hosting_bandwidth_gb', 100, PERIOD);

    const route = await import('@/app/api/cron/usage-rollup/route');
    const res = await callHandler<{ data: { totalClients: number; perClient: unknown[] } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: `Bearer ${CRON_SECRET}` } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.totalClients).toBe(0);
    expect(res.data?.data.perClient).toEqual([]);
    expect(reportUsageMock).not.toHaveBeenCalled();
  });

  it('dryRun=1 short-circuits Stripe + audit write', async () => {
    await seedMeteredItem(A.client.id, {
      resource: 'hosting_bandwidth_gb',
      unitPriceCents: 5,
      includedQuantity: 50,
    });
    await seedUsageEvent(A.client.id, 'hosting_bandwidth_gb', 100, PERIOD);

    const route = await import('@/app/api/cron/usage-rollup/route');
    const res = await callHandler<{ data: { dryRun: boolean; totalClients: number } }>(
      route as unknown as Record<string, unknown>, 'GET',
      {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
        query: { dryRun: '1' },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.dryRun).toBe(true);
    expect(reportUsageMock).not.toHaveBeenCalled();

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.usage_billing_periods
      WHERE client_id = ${A.client.id}
    `;
    expect(rows.length).toBe(0);
  });
});

// ───────────────────────────── idempotency ───────────────────────────────────

describe('GET /api/cron/usage-rollup — idempotency @cron @billing @metered', () => {
  let A: TenantCtx;
  const PERIOD = currentPeriodUtcStr();

  beforeEach(async () => {
    A = await sessionForNewClientUser('cron-idemp-a');
    reportUsageMock.mockImplementation(async (itemId: string) => ({ id: `ur_${itemId}_${Date.now()}` }));
  });

  it('re-running on the same period: no duplicate audit rows; Stripe push repeats', async () => {
    await seedMeteredItem(A.client.id, {
      resource: 'hosting_bandwidth_gb',
      unitPriceCents: 5,
      includedQuantity: 50,
      stripeSubscriptionItemId: 'si_idemp',
    });
    await seedUsageEvent(A.client.id, 'hosting_bandwidth_gb', 75, PERIOD);

    const route = await import('@/app/api/cron/usage-rollup/route');

    // First run.
    const r1 = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: `Bearer ${CRON_SECRET}` } },
    );
    expect(r1.status).toBe(200);

    // Second run on the same period.
    const r2 = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: `Bearer ${CRON_SECRET}` } },
    );
    expect(r2.status).toBe(200);

    // Stripe push runs both times — audit row idempotency comes from the
    // upsert, not from skipping the Stripe call. Per the rollup design,
    // re-running pushes the absolute period total again (action='set').
    expect(reportUsageMock).toHaveBeenCalledTimes(2);
    // Both calls used the same args (same total / same itemId).
    expect(reportUsageMock.mock.calls[0][0]).toBe('si_idemp');
    expect(reportUsageMock.mock.calls[1][0]).toBe('si_idemp');
    expect(reportUsageMock.mock.calls[0][1]).toBe(25);
    expect(reportUsageMock.mock.calls[1][1]).toBe(25);

    // Exactly one audit row for (client, period, resource) — the unique
    // index makes the upsert overwrite, not insert a second row.
    const sql = getTestSql();
    const rows = await sql<{ id: number; stripe_usage_record_id: string | null }[]>`
      SELECT id, stripe_usage_record_id FROM ${sql(TEST_SCHEMA)}.usage_billing_periods
      WHERE client_id = ${A.client.id} AND period = ${PERIOD}
        AND resource = 'hosting_bandwidth_gb'
    `;
    expect(rows.length).toBe(1);
    // Latest run's Stripe id should win.
    expect(rows[0].stripe_usage_record_id).toMatch(/^ur_si_idemp_/);
  });
});

// ───────────────────────────── Stripe failure → retry ────────────────────────

describe('GET /api/cron/usage-rollup — Stripe failure handling @cron @billing @metered', () => {
  let A: TenantCtx;
  const PERIOD = currentPeriodUtcStr();

  beforeEach(async () => {
    A = await sessionForNewClientUser('cron-stripe-fail');
  });

  it('first run fails Stripe push: audit row written with id=null, err count incremented', async () => {
    await seedMeteredItem(A.client.id, {
      resource: 'hosting_bandwidth_gb',
      unitPriceCents: 5,
      includedQuantity: 50,
      stripeSubscriptionItemId: 'si_failthenretry',
    });
    await seedUsageEvent(A.client.id, 'hosting_bandwidth_gb', 75, PERIOD);

    reportUsageMock.mockRejectedValueOnce(new Error('Stripe is down'));

    const route = await import('@/app/api/cron/usage-rollup/route');
    const res = await callHandler<{
      data: { ok: number; err: number; perClient: Array<{ rollups: Array<{ error?: string; stripeUsageRecordId: string | null }> }> };
    }>(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: `Bearer ${CRON_SECRET}` } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.ok).toBe(0);
    expect(res.data?.data.err).toBe(1);

    const r = res.data!.data.perClient[0].rollups[0];
    expect(r.error).toBe('Stripe is down');
    expect(r.stripeUsageRecordId).toBeNull();

    // Audit row IS persisted with stripe_usage_record_id=null so a future
    // retry has somewhere to upsert into.
    const sql = getTestSql();
    const rows = await sql<{
      stripe_usage_record_id: string | null; reported_at: Date | null;
      billable_quantity: string;
    }[]>`
      SELECT stripe_usage_record_id, reported_at, billable_quantity
      FROM ${sql(TEST_SCHEMA)}.usage_billing_periods
      WHERE client_id = ${A.client.id} AND period = ${PERIOD}
        AND resource = 'hosting_bandwidth_gb'
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].stripe_usage_record_id).toBeNull();
    expect(rows[0].reported_at).toBeNull();
    expect(parseFloat(rows[0].billable_quantity)).toBe(25);
  });

  it('subsequent retry succeeds: audit row backfilled with Stripe id', async () => {
    await seedMeteredItem(A.client.id, {
      resource: 'hosting_bandwidth_gb',
      unitPriceCents: 5,
      includedQuantity: 50,
      stripeSubscriptionItemId: 'si_failthenretry',
    });
    await seedUsageEvent(A.client.id, 'hosting_bandwidth_gb', 75, PERIOD);

    // First call fails.
    reportUsageMock.mockRejectedValueOnce(new Error('Stripe is down'));
    // Second call succeeds.
    reportUsageMock.mockResolvedValueOnce({ id: 'ur_recovered' });

    const route = await import('@/app/api/cron/usage-rollup/route');

    // First run — failure path.
    const r1 = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: `Bearer ${CRON_SECRET}` } },
    );
    expect(r1.status).toBe(200);

    // Second run — success path overwrites the audit row.
    const r2 = await callHandler<{ data: { ok: number; err: number } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: `Bearer ${CRON_SECRET}` } },
    );
    expect(r2.status).toBe(200);
    expect(r2.data?.data.ok).toBe(1);
    expect(r2.data?.data.err).toBe(0);

    const sql = getTestSql();
    const rows = await sql<{
      stripe_usage_record_id: string | null; reported_at: Date | null;
    }[]>`
      SELECT stripe_usage_record_id, reported_at
      FROM ${sql(TEST_SCHEMA)}.usage_billing_periods
      WHERE client_id = ${A.client.id} AND period = ${PERIOD}
        AND resource = 'hosting_bandwidth_gb'
    `;
    expect(rows.length).toBe(1); // upserted, not duplicated
    expect(rows[0].stripe_usage_record_id).toBe('ur_recovered');
    expect(rows[0].reported_at).not.toBeNull();
  });
});
