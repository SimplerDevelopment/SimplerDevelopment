// @vitest-environment node
/**
 * Unit tests for `lib/billing/usage-rollup.ts`.
 *
 * Strategy:
 *   - Mock `@/lib/db` with a fluent chain that returns canned rows in the
 *     deterministic call order used by `rollupClientPeriod`:
 *       1) sumRows from usage_meter_events GROUP BY resource
 *       2) itemRows from metered_subscription_items WHERE active
 *       3+) inserts to usage_billing_periods, one per metered item
 *   - Mock `@/lib/stripe` to capture `reportUsage` calls without hitting
 *     the network.
 *   - Verify quantity math, idempotency (onConflictDoUpdate path), and
 *     Stripe-failure fallback (audit row persisted with id=null).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state: {
  selectQueue: unknown[][];
  insertCalls: Array<{ values: Record<string, unknown>; onConflict: Record<string, unknown> | null }>;
  distinctRows: { clientId: number }[];
} = {
  selectQueue: [],
  insertCalls: [],
  distinctRows: [],
};

const reportUsageMock = vi.fn();

vi.mock('@/lib/stripe', () => ({
  reportUsage: (...args: unknown[]) => reportUsageMock(...args),
}));

vi.mock('@/lib/db', () => {
  // Each call to db.select() returns a chain that resolves to the next
  // queued row set. The rollup makes calls in a deterministic order:
  // 1) sum query, 2) items query, 3+) (no further selects in this fn).
  function makeSelectChain() {
    const rows = state.selectQueue.shift() ?? [];
    const chain: Record<string, unknown> = {};
    const passthrough = ['from', 'where', 'groupBy', 'orderBy', 'limit'];
    for (const m of passthrough) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve);
    return chain;
  }

  const distinctChain = {
    from() { return distinctChain; },
    where() { return distinctChain; },
    then(resolve: (v: unknown) => unknown) {
      return Promise.resolve(state.distinctRows).then(resolve);
    },
  };

  const insertChain = {
    values(v: Record<string, unknown>) {
      state.insertCalls.push({ values: v, onConflict: null });
      return insertChain;
    },
    onConflictDoUpdate(opts: Record<string, unknown>) {
      const last = state.insertCalls[state.insertCalls.length - 1];
      if (last) last.onConflict = opts;
      return Promise.resolve();
    },
    then(resolve: (v: unknown) => unknown) {
      return Promise.resolve(undefined).then(resolve);
    },
  };

  return {
    db: {
      select: () => makeSelectChain(),
      selectDistinct: () => distinctChain,
      insert: () => insertChain,
    },
  };
});

function resetState() {
  state.selectQueue = [];
  state.insertCalls = [];
  state.distinctRows = [];
  reportUsageMock.mockReset();
}

describe('rollupClientPeriod', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
  });

  it('rejects malformed period strings', async () => {
    const { rollupClientPeriod } = await import('@/lib/billing/usage-rollup');
    await expect(rollupClientPeriod(1, 'bogus')).rejects.toThrow(/YYYY-MM/);
  });

  it('returns empty array when client has no metered items', async () => {
    state.selectQueue = [
      [{ resource: 'hosting_bandwidth_gb', total: '100' }], // sum
      [], // items
    ];
    const { rollupClientPeriod } = await import('@/lib/billing/usage-rollup');
    const out = await rollupClientPeriod(42, '2026-05', { dryRun: true });
    expect(out).toEqual([]);
    expect(reportUsageMock).not.toHaveBeenCalled();
  });

  it('computes billable = max(0, total - included) and pushes to Stripe', async () => {
    state.selectQueue = [
      [
        { resource: 'hosting_bandwidth_gb', total: '120.5' },
        { resource: 'email_send', total: '5000' },
      ],
      [
        {
          id: 1, clientId: 7,
          stripeSubscriptionId: 'sub_1', stripeSubscriptionItemId: 'si_bw',
          resource: 'hosting_bandwidth_gb', unitPriceCents: 5,
          includedQuantity: '50', status: 'active',
        },
        {
          id: 2, clientId: 7,
          stripeSubscriptionId: 'sub_1', stripeSubscriptionItemId: 'si_email',
          resource: 'email_send', unitPriceCents: 1,
          includedQuantity: '10000', status: 'active',
        },
      ],
    ];
    reportUsageMock.mockImplementation(async (itemId: string) => ({ id: `ur_${itemId}` }));

    const { rollupClientPeriod } = await import('@/lib/billing/usage-rollup');
    const out = await rollupClientPeriod(7, '2026-05', { periodEndUnix: 1714521599 });

    expect(out).toHaveLength(2);
    const bw = out.find(r => r.resource === 'hosting_bandwidth_gb')!;
    expect(bw.total).toBe(120.5);
    expect(bw.included).toBe(50);
    expect(bw.billable).toBeCloseTo(70.5, 4);
    expect(bw.billedCents).toBe(Math.round(70.5 * 5));
    expect(bw.stripeUsageRecordId).toBe('ur_si_bw');

    const email = out.find(r => r.resource === 'email_send')!;
    expect(email.total).toBe(5000);
    expect(email.included).toBe(10000);
    expect(email.billable).toBe(0);
    expect(email.billedCents).toBe(0);

    expect(reportUsageMock).toHaveBeenCalledTimes(2);
    expect(reportUsageMock).toHaveBeenCalledWith('si_bw', 70.5, 1714521599);
    expect(reportUsageMock).toHaveBeenCalledWith('si_email', 0, 1714521599);

    expect(state.insertCalls).toHaveLength(2);
    expect(state.insertCalls[0].onConflict).not.toBeNull();
  });

  it('skips Stripe push and audit write under dryRun', async () => {
    state.selectQueue = [
      [{ resource: 'hosting_bandwidth_gb', total: '200' }],
      [{
        id: 1, clientId: 7,
        stripeSubscriptionId: 'sub_1', stripeSubscriptionItemId: 'si_bw',
        resource: 'hosting_bandwidth_gb', unitPriceCents: 5,
        includedQuantity: '50', status: 'active',
      }],
    ];

    const { rollupClientPeriod } = await import('@/lib/billing/usage-rollup');
    const out = await rollupClientPeriod(7, '2026-05', { dryRun: true });

    expect(out).toHaveLength(1);
    expect(out[0].billable).toBe(150);
    expect(reportUsageMock).not.toHaveBeenCalled();
    expect(state.insertCalls).toHaveLength(0);
  });

  it('persists audit row with stripeUsageRecordId=null on Stripe failure', async () => {
    state.selectQueue = [
      [{ resource: 'hosting_bandwidth_gb', total: '200' }],
      [{
        id: 1, clientId: 7,
        stripeSubscriptionId: 'sub_1', stripeSubscriptionItemId: 'si_bw',
        resource: 'hosting_bandwidth_gb', unitPriceCents: 5,
        includedQuantity: '50', status: 'active',
      }],
    ];
    reportUsageMock.mockRejectedValueOnce(new Error('Stripe is down'));

    const { rollupClientPeriod } = await import('@/lib/billing/usage-rollup');
    const out = await rollupClientPeriod(7, '2026-05');

    expect(out).toHaveLength(1);
    expect(out[0].error).toBe('Stripe is down');
    expect(out[0].stripeUsageRecordId).toBeNull();

    expect(state.insertCalls).toHaveLength(1);
    const inserted = state.insertCalls[0].values as Record<string, unknown>;
    expect(inserted.stripeUsageRecordId).toBeNull();
    expect(inserted.reportedAt).toBeNull();
  });

  it('upsert path uses onConflictDoUpdate so re-runs are idempotent', async () => {
    state.selectQueue = [
      [{ resource: 'hosting_bandwidth_gb', total: '200' }],
      [{
        id: 1, clientId: 7,
        stripeSubscriptionId: 'sub_1', stripeSubscriptionItemId: 'si_bw',
        resource: 'hosting_bandwidth_gb', unitPriceCents: 5,
        includedQuantity: '50', status: 'active',
      }],
    ];
    reportUsageMock.mockResolvedValue({ id: 'ur_1' });

    const { rollupClientPeriod } = await import('@/lib/billing/usage-rollup');
    await rollupClientPeriod(7, '2026-05');

    expect(state.insertCalls).toHaveLength(1);
    expect(state.insertCalls[0].onConflict).not.toBeNull();
    const onc = state.insertCalls[0].onConflict as { target: unknown; set: Record<string, unknown> };
    // The unique target is (clientId, period, resource).
    expect(onc.target).toBeDefined();
    // Set should rewrite the totals/billable on conflict.
    expect(onc.set).toHaveProperty('billableQuantity');
    expect(onc.set).toHaveProperty('stripeUsageRecordId');
  });
});

describe('listClientsWithActiveMeteredItems', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
  });

  it('returns distinct clientIds from selectDistinct', async () => {
    state.distinctRows = [{ clientId: 1 }, { clientId: 7 }, { clientId: 42 }];
    const { listClientsWithActiveMeteredItems } = await import('@/lib/billing/usage-rollup');
    expect(await listClientsWithActiveMeteredItems()).toEqual([1, 7, 42]);
  });
});

describe('currentPeriodUtc', () => {
  it('returns YYYY-MM matching current UTC month', async () => {
    const { currentPeriodUtc } = await import('@/lib/billing/usage-rollup');
    const period = currentPeriodUtc();
    expect(period).toMatch(/^\d{4}-\d{2}$/);
    const now = new Date();
    expect(period).toBe(`${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`);
  });
});
