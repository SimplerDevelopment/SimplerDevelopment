// @vitest-environment node
/**
 * Unit tests focused specifically on the `includedQuantity` allowance logic
 * in `rollupClientPeriod`. These cases are split out because the math
 * (including the floor-at-zero behaviour and the cents rounding) is the
 * load-bearing part of the metered-billing flow — getting it wrong directly
 * = wrong invoices.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state: {
  selectQueue: unknown[][];
  insertCalls: Array<{ values: Record<string, unknown>; onConflict: Record<string, unknown> | null }>;
} = { selectQueue: [], insertCalls: [] };

const reportUsageMock = vi.fn().mockResolvedValue({ id: 'ur_test' });

vi.mock('@/lib/stripe', () => ({
  reportUsage: (...args: unknown[]) => reportUsageMock(...args),
}));

vi.mock('@/lib/db', () => {
  function makeSelectChain() {
    const rows = state.selectQueue.shift() ?? [];
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'groupBy', 'orderBy', 'limit']) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve);
    return chain;
  }
  const insertChain = {
    values(v: Record<string, unknown>) { state.insertCalls.push({ values: v, onConflict: null }); return insertChain; },
    onConflictDoUpdate(opts: Record<string, unknown>) {
      const last = state.insertCalls[state.insertCalls.length - 1];
      if (last) last.onConflict = opts;
      return Promise.resolve();
    },
    then(resolve: (v: unknown) => unknown) { return Promise.resolve(undefined).then(resolve); },
  };
  return {
    db: {
      select: () => makeSelectChain(),
      selectDistinct: () => ({ from() { return this; }, where() { return this; }, then(r: (v: unknown) => unknown) { return Promise.resolve([]).then(r); } }),
      insert: () => insertChain,
    },
  };
});

// vi.mock calls above are hoisted; this static import is resolved after mocks.
// vi.resetModules() removed — usage-rollup has no module-level mutable state.
import { rollupClientPeriod } from '@/lib/billing/usage-rollup';

function reset() {
  state.selectQueue = [];
  state.insertCalls = [];
  reportUsageMock.mockClear();
  reportUsageMock.mockResolvedValue({ id: 'ur_test' });
}

function setup(opts: { total: string; included: string; unitPriceCents: number }) {
  state.selectQueue = [
    [{ resource: 'hosting_bandwidth_gb', total: opts.total }],
    [{
      id: 1, clientId: 1,
      stripeSubscriptionId: 'sub_1', stripeSubscriptionItemId: 'si_bw',
      resource: 'hosting_bandwidth_gb', unitPriceCents: opts.unitPriceCents,
      includedQuantity: opts.included, status: 'active',
    }],
  ];
}

describe('includedQuantity allowance', () => {
  beforeEach(() => {
    reset();
  });

  it('total below included → billable=0, billedCents=0', async () => {
    setup({ total: '40', included: '50', unitPriceCents: 5 });
    const [r] = await rollupClientPeriod(1, '2026-05', { periodEndUnix: 100 });
    expect(r.total).toBe(40);
    expect(r.included).toBe(50);
    expect(r.billable).toBe(0);
    expect(r.billedCents).toBe(0);
  });

  it('total exactly equals included → billable=0', async () => {
    setup({ total: '50', included: '50', unitPriceCents: 5 });

    const [r] = await rollupClientPeriod(1, '2026-05', { periodEndUnix: 100 });
    expect(r.billable).toBe(0);
    expect(r.billedCents).toBe(0);
  });

  it('total above included → billable=delta, billedCents=delta*price (rounded)', async () => {
    setup({ total: '125', included: '50', unitPriceCents: 5 });

    const [r] = await rollupClientPeriod(1, '2026-05', { periodEndUnix: 100 });
    expect(r.billable).toBe(75);
    expect(r.billedCents).toBe(375); // 75 * 5
  });

  it('zero included → billable equals total', async () => {
    setup({ total: '125', included: '0', unitPriceCents: 5 });

    const [r] = await rollupClientPeriod(1, '2026-05', { periodEndUnix: 100 });
    expect(r.billable).toBe(125);
    expect(r.billedCents).toBe(625);
  });

  it('fractional values are preserved through math, cents rounded', async () => {
    setup({ total: '70.6', included: '50.4', unitPriceCents: 7 });

    const [r] = await rollupClientPeriod(1, '2026-05', { periodEndUnix: 100 });
    expect(r.billable).toBeCloseTo(20.2, 4);
    // 20.2 * 7 = 141.4 → rounded to 141
    expect(r.billedCents).toBe(Math.round(20.2 * 7));
  });

  it('no events for the resource → total=0, billable=0', async () => {
    state.selectQueue = [
      [], // no sums
      [{
        id: 1, clientId: 1,
        stripeSubscriptionId: 'sub_1', stripeSubscriptionItemId: 'si_bw',
        resource: 'hosting_bandwidth_gb', unitPriceCents: 5,
        includedQuantity: '50', status: 'active',
      }],
    ];

    const [r] = await rollupClientPeriod(1, '2026-05', { periodEndUnix: 100 });
    expect(r.total).toBe(0);
    expect(r.included).toBe(50);
    expect(r.billable).toBe(0);
    expect(r.billedCents).toBe(0);
  });

  it('persists totalQuantity, includedQuantity, billableQuantity in audit row', async () => {
    setup({ total: '125.5', included: '50.5', unitPriceCents: 5 });

    await rollupClientPeriod(1, '2026-05', { periodEndUnix: 100 });
    expect(state.insertCalls).toHaveLength(1);
    const v = state.insertCalls[0].values as Record<string, string | number | null>;
    expect(v.totalQuantity).toBe('125.5');
    expect(v.includedQuantity).toBe('50.5');
    expect(v.billableQuantity).toBe('75');
    expect(v.unitPriceCents).toBe(5);
    expect(v.billedAmountCents).toBe(375);
    expect(v.stripeUsageRecordId).toBe('ur_test');
  });
});
