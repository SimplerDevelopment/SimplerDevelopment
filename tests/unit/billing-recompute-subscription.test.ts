// @vitest-environment node
/**
 * Golden-master / property tests for `lib/billing/recompute-subscription.ts` —
 * the single writer of a client's Stripe subscription line items.
 *
 * This is the test harness the roast council named as the GO-LIVE blocker for
 * Billing: until the reconciler's correctness is asserted, every edge case is a
 * manual-inspection, fix-in-prod-against-real-money event. We lock the four
 * flagged edge cases here:
 *   1. mid-cycle seat change      → seat line quantity/note behaviour
 *   2. proration                  → every Stripe write carries create_prorations
 *   3. volume-threshold crossing  → module unit_amounts recompute to the discount
 *   4. (cron race)                → N/A: no cron calls the reconciler; see note.
 * plus the comp-coupon diff, stale-item removal, bundle passthrough, and the
 * idempotent no-op (no Stripe write when nothing changed).
 *
 * Strategy mirrors billing-rollup.test.ts: queue canned rows for `@/lib/db`,
 * mock `countBillableSeats` (its own internals are tested elsewhere), and inject
 * a plain Stripe mock (the function takes `stripe` as a parameter).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeAccountBilling,
  volumeTierFor,
  discountedModuleCents,
  SEAT_PRICE_CAP_CENTS,
} from '@/lib/billing/domain-catalog';

const state: {
  selectQueue: unknown[][];
  seatCount: number;
} = { selectQueue: [], seatCount: 1 };

vi.mock('@/lib/db', () => {
  function makeSelectChain() {
    const rows = state.selectQueue.shift() ?? [];
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'innerJoin', 'where', 'limit', 'orderBy', 'groupBy']) {
      chain[m] = () => chain;
    }
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve);
    return chain;
  }
  return { db: { select: () => makeSelectChain() } };
});

vi.mock('@/lib/billing/seats', () => ({
  countBillableSeats: () => Promise.resolve(state.seatCount),
}));

import { recomputeClientSubscription } from '@/lib/billing/recompute-subscription';

// ── Stripe test doubles ───────────────────────────────────────────────────────

interface StripeItem {
  id: string;
  quantity?: number;
  price: { unit_amount: number | null; product: string };
}
function makeStripe(items: StripeItem[], discounts: unknown[] = []) {
  const update = vi.fn().mockResolvedValue({});
  const couponRetrieve = vi.fn().mockRejectedValue({ code: 'resource_missing' });
  const couponCreate = vi.fn().mockResolvedValue({ id: 'comp-x' });
  return {
    update,
    couponRetrieve,
    couponCreate,
    stripe: {
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({ items: { data: items }, discounts }),
        update,
      },
      coupons: { retrieve: couponRetrieve, create: couponCreate },
    } as never,
  };
}

function moduleRow(productId: string, priceCents: number, subId = 'sub_1') {
  return {
    slug: `module-${productId}`,
    category: 'crm',
    priceCents,
    stripeProductId: productId,
    stripePriceId: `price_${productId}`,
    stripeSubscriptionId: subId,
  };
}

beforeEach(() => {
  state.selectQueue = [];
  state.seatCount = 1;
});

// ── Pure billing math (property tests on the catalog) ─────────────────────────

describe('volume-discount math (domain-catalog)', () => {
  it('volumeTierFor crosses at exactly 4 / 8 / 12 modules', () => {
    expect(volumeTierFor(3)).toBeNull();
    expect(volumeTierFor(4)?.percentOff).toBe(10);
    expect(volumeTierFor(7)?.percentOff).toBe(10);
    expect(volumeTierFor(8)?.percentOff).toBe(20);
    expect(volumeTierFor(11)?.percentOff).toBe(20);
    expect(volumeTierFor(12)?.percentOff).toBe(30);
    expect(volumeTierFor(100)?.percentOff).toBe(30);
  });

  it('discountedModuleCents rounds half-up per module', () => {
    expect(discountedModuleCents(2500, 10)).toBe(2250);
    expect(discountedModuleCents(1999, 10)).toBe(1799); // 1799.1 → 1799
    expect(discountedModuleCents(2500, 0)).toBe(2500);
    expect(discountedModuleCents(15, 30)).toBe(11); // 10.5 → 11 (half-up)
  });

  it('computeAccountBilling caps the per-seat charge at SEAT_PRICE_CAP_CENTS', () => {
    const b = computeAccountBilling([10_000, 10_000], 3); // M=20000 > $30 cap
    expect(b.discountPercent).toBe(0); // 2 modules → below first tier
    expect(b.moduleSubtotalCents).toBe(20_000);
    expect(b.seatUnitCents).toBe(SEAT_PRICE_CAP_CENTS);
    expect(b.additionalSeats).toBe(2);
    expect(b.seatTotalCents).toBe(6_000);
    expect(b.totalCents).toBe(26_000);
  });

  it('computeAccountBilling does not floor the seat charge below subtotal when M < cap', () => {
    const b = computeAccountBilling([1_000], 2); // M=1000 < $30 cap
    expect(b.seatUnitCents).toBe(1_000);
    expect(b.totalCents).toBe(2_000);
  });

  it('computeAccountBilling applies the 30% tier at 12 modules', () => {
    const b = computeAccountBilling(Array(12).fill(1_000), 1);
    expect(b.discountPercent).toBe(30);
    expect(b.discountedModuleCents.every((c) => c === 700)).toBe(true);
    expect(b.moduleSubtotalCents).toBe(8_400);
  });
});

// ── Reconciler behaviour ──────────────────────────────────────────────────────

describe('recomputeClientSubscription', () => {
  it('no-ops when the client has no active subscription', async () => {
    state.selectQueue = [[]]; // no module/bundle rows
    const { stripe, update } = makeStripe([]);
    const res = await recomputeClientSubscription(stripe, 42);
    expect(res).toEqual({ updated: false, note: 'no active subscription' });
    expect(update).not.toHaveBeenCalled();
  });

  it('is idempotent — emits NO Stripe write when live state already matches', async () => {
    state.seatCount = 1; // no additional seats
    state.selectQueue = [
      [moduleRow('prod_a', 2500)], // 1 module → 0% discount → charged 2500
      [{ compDiscountPercent: null }],
    ];
    const { stripe, update } = makeStripe([
      { id: 'si_a', quantity: 1, price: { unit_amount: 2500, product: 'prod_a' } },
    ]);
    const res = await recomputeClientSubscription(stripe, 1);
    expect(res.updated).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('volume-threshold crossing: recomputes every module to the discounted amount', async () => {
    // 4 modules pushes the account into the 10% tier; live items are still at the
    // pre-crossing 2500. The reconciler must rewrite all four to 2250.
    state.seatCount = 1;
    state.selectQueue = [
      ['prod_a', 'prod_b', 'prod_c', 'prod_d'].map((p) => moduleRow(p, 2500)),
      [{ compDiscountPercent: null }],
    ];
    const live = ['prod_a', 'prod_b', 'prod_c', 'prod_d'].map((p, i) => ({
      id: `si_${i}`,
      quantity: 1,
      price: { unit_amount: 2500, product: p },
    }));
    const { stripe, update } = makeStripe(live);

    const res = await recomputeClientSubscription(stripe, 1);

    expect(res.updated).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    const [, params] = update.mock.calls[0];
    expect(params.proration_behavior).toBe('create_prorations'); // edge case 2
    expect(params.items).toHaveLength(4);
    for (const item of params.items) {
      expect(item.price_data.unit_amount).toBe(2250);
      expect(item.price_data.currency).toBe('usd');
      expect(item.price_data.recurring).toEqual({ interval: 'month' });
    }
  });

  it('mid-cycle seat change: skips the seat line with a note when SEAT_SKU is unprovisioned', async () => {
    // SEAT_SKU.stripeProductId ships undefined; the reconciler must not silently
    // bill a seat against a missing product — it records a note instead.
    state.seatCount = 3; // 2 additional seats
    state.selectQueue = [
      [moduleRow('prod_a', 2500), moduleRow('prod_b', 2500)], // 2 modules → 0%
      [{ compDiscountPercent: null }],
    ];
    const { stripe, update } = makeStripe([
      { id: 'si_a', quantity: 1, price: { unit_amount: 2500, product: 'prod_a' } },
      { id: 'si_b', quantity: 1, price: { unit_amount: 2500, product: 'prod_b' } },
    ]);
    const res = await recomputeClientSubscription(stripe, 1);
    expect(res.note).toMatch(/SEAT_SKU.*not provisioned/);
    expect(update).not.toHaveBeenCalled(); // modules already match, seat skipped
  });

  it('removes a line item whose product is no longer in the plan', async () => {
    state.seatCount = 1;
    state.selectQueue = [[moduleRow('prod_a', 2500)], [{ compDiscountPercent: null }]];
    const { stripe, update } = makeStripe([
      { id: 'si_a', quantity: 1, price: { unit_amount: 2500, product: 'prod_a' } },
      { id: 'si_stale', quantity: 1, price: { unit_amount: 999, product: 'prod_gone' } },
    ]);
    const res = await recomputeClientSubscription(stripe, 1);
    expect(res.updated).toBe(true);
    const [, params] = update.mock.calls[0];
    expect(params.items).toContainEqual({ id: 'si_stale', deleted: true });
  });

  it('leaves the bundle (fixed-price) item untouched', async () => {
    state.seatCount = 1;
    state.selectQueue = [
      [{ ...moduleRow('prod_bundle', 15_900), category: 'bundle' }],
      [{ compDiscountPercent: null }],
    ];
    const { stripe, update } = makeStripe([
      { id: 'si_bundle', quantity: 1, price: { unit_amount: 15_900, product: 'prod_bundle' } },
    ]);
    const res = await recomputeClientSubscription(stripe, 1);
    expect(res.updated).toBe(false); // fixed-price line never re-emitted
    expect(update).not.toHaveBeenCalled();
  });

  it('adds the comp coupon (creating it if missing) when the client has a comp discount', async () => {
    state.seatCount = 1;
    state.selectQueue = [
      [moduleRow('prod_a', 2500)],
      [{ compDiscountPercent: 20 }],
    ];
    const { stripe, update, couponCreate } = makeStripe(
      [{ id: 'si_a', quantity: 1, price: { unit_amount: 2500, product: 'prod_a' } }],
      [], // no discount currently on the sub
    );
    const res = await recomputeClientSubscription(stripe, 1);
    expect(res.updated).toBe(true);
    expect(couponCreate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'comp-20', percent_off: 20, duration: 'forever' }),
    );
    const [, params] = update.mock.calls[0];
    expect(params.discounts).toEqual([{ coupon: 'comp-20' }]);
    expect(params.proration_behavior).toBe('create_prorations');
  });

  it('clears an existing comp coupon when the client no longer has a comp discount', async () => {
    state.seatCount = 1;
    state.selectQueue = [
      [moduleRow('prod_a', 2500)],
      [{ compDiscountPercent: null }],
    ];
    const { stripe, update } = makeStripe(
      [{ id: 'si_a', quantity: 1, price: { unit_amount: 2500, product: 'prod_a' } }],
      [{ source: { coupon: { id: 'comp-15' } } }], // stale comp on the sub
    );
    const res = await recomputeClientSubscription(stripe, 1);
    expect(res.updated).toBe(true);
    const [, params] = update.mock.calls[0];
    expect(params.discounts).toEqual([]); // cleared
  });
});

// ponytail: edge case (3) "cron race" has no test because no cron path calls the
// reconciler (only explicit module/team mutations do) — verified by the billing
// map; if a cron is ever wired to recomputeClientSubscription, add a concurrency
// test here. The reconciler also has NO lock against two concurrent callers
// (proration collision): it is idempotent only on the no-diff path. That ceiling
// is documented, not tested — add a serializing lock if concurrent module/seat
// mutations on one client become real.
