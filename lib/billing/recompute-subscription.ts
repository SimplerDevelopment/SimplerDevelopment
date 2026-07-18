// The single writer of a client's Stripe subscription line items. Reconciles
// the live subscription to match the DB (active module/bundle services) + the
// accepted seat count:
//
//   - à-la-carte modules → one price_data item each, at the post-volume-discount
//     amount (so the displayed discount IS the charged amount, no coupon)
//   - the "Everything" bundle → its fixed Stripe price, left untouched
//   - additional seats → one price_data "Additional seats" item at
//     min(M, $30) × (acceptedSeats − 1)
//
// Call this after ANY change to a client's modules OR team size. It is
// idempotent: it only emits Stripe item updates that actually differ, so a
// no-op change makes no Stripe write (and no proration).
//
// Matching is by Stripe Product id: each module has its own product, the bundle
// its own, and the seat SKU its own — so items survive across recomputes.

import type Stripe from 'stripe';
import { db } from '@/lib/db';
import { clientServices, services, clients } from '@/lib/db/schema';
import { and, eq, isNotNull } from 'drizzle-orm';
import {
  BUNDLE,
  SEAT_SKU,
  SEAT_PRICE_CAP_CENTS,
  computeAccountBilling,
} from './domain-catalog';
import { countBillableSeats } from './seats';

type ItemUpdate = Stripe.SubscriptionUpdateParams.Item;

function monthlyPriceData(productId: string, unitAmountCents: number): Stripe.SubscriptionUpdateParams.Item.PriceData {
  return {
    currency: 'usd',
    product: productId,
    unit_amount: unitAmountCents,
    recurring: { interval: 'month' },
  };
}

/**
 * Idempotently ensure a `comp-<percent>` forever percent_off coupon exists, and
 * return its id. This is the ONE sanctioned coupon — an admin per-account comp,
 * distinct from the à-la-carte volume discount (which lives in the line items).
 */
async function ensureCompCoupon(stripe: Stripe, percent: number): Promise<string> {
  const id = `comp-${percent}`;
  try {
    await stripe.coupons.retrieve(id);
  } catch (err) {
    if ((err as { code?: string })?.code === 'resource_missing') {
      await stripe.coupons.create({
        id,
        percent_off: percent,
        duration: 'forever',
        name: `Comp ${percent}% off`,
        metadata: { kind: 'comp_discount' },
      });
    } else {
      throw err;
    }
  }
  return id;
}

export interface RecomputeResult {
  updated: boolean;
  note?: string;
  /** the computed monthly total in cents (modules + seats), for callers/logging */
  totalCents?: number;
}

/**
 * Reconcile clientId's Stripe subscription to its current modules + accepted
 * seats. No-ops (returns updated:false) when the client has no active self-serve
 * subscription. Best-effort callers should try/catch — a Stripe hiccup here must
 * not break the DB-level change that triggered it.
 */
export async function recomputeClientSubscription(
  stripe: Stripe,
  clientId: number,
): Promise<RecomputeResult> {
  const rows = await db
    .select({
      slug: services.slug,
      category: services.category,
      priceCents: services.price,
      stripeProductId: services.stripeProductId,
      stripePriceId: services.stripePriceId,
      stripeSubscriptionId: clientServices.stripeSubscriptionId,
    })
    .from(clientServices)
    .innerJoin(services, eq(services.id, clientServices.serviceId))
    .where(
      and(
        eq(clientServices.clientId, clientId),
        eq(clientServices.status, 'active'),
        isNotNull(clientServices.stripeSubscriptionId),
      ),
    );

  const subscriptionId = rows[0]?.stripeSubscriptionId;
  if (!subscriptionId) return { updated: false, note: 'no active subscription' };

  // Admin comp discount (separate from the line-item volume discount).
  const [clientRow] = await db
    .select({ compDiscountPercent: clients.compDiscountPercent })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  const compPercent = clientRow?.compDiscountPercent ?? null;
  const desiredCouponId =
    compPercent != null && compPercent > 0 && compPercent <= 100 ? `comp-${compPercent}` : null;

  const seatCount = await countBillableSeats(clientId);
  const bundleRow = rows.find((r) => r.category === 'bundle');
  const moduleRows = rows.filter(
    (r) => r.category !== 'bundle' && r.stripeProductId && r.priceCents != null,
  );

  // Desired state, keyed by Stripe Product id.
  const desired = new Map<
    string,
    { unitAmountCents?: number; fixedPriceId?: string; quantity: number }
  >();

  let moduleSubtotalCents: number;
  if (bundleRow) {
    // Bundle is a flat fixed price — leave its item untouched. M = bundle price.
    moduleSubtotalCents = bundleRow.priceCents ?? BUNDLE.monthlyPriceCents;
    if (bundleRow.stripeProductId) {
      desired.set(bundleRow.stripeProductId, {
        fixedPriceId: bundleRow.stripePriceId ?? undefined,
        quantity: 1,
      });
    }
  } else {
    const billing = computeAccountBilling(moduleRows.map((r) => r.priceCents as number), seatCount);
    moduleSubtotalCents = billing.moduleSubtotalCents;
    moduleRows.forEach((r, i) => {
      desired.set(r.stripeProductId as string, {
        unitAmountCents: billing.discountedModuleCents[i],
        quantity: 1,
      });
    });
  }

  // Seat line — undiscounted, capped at $30/seat.
  const seatUnitCents = Math.min(moduleSubtotalCents, SEAT_PRICE_CAP_CENTS);
  const additionalSeats = Math.max(0, seatCount - 1);
  const seatProductId = SEAT_SKU.stripeProductId;
  let seatNote: string | undefined;
  if (additionalSeats > 0 && seatUnitCents > 0) {
    if (seatProductId) {
      desired.set(seatProductId, { unitAmountCents: seatUnitCents, quantity: additionalSeats });
    } else {
      seatNote = 'SEAT_SKU.stripeProductId not provisioned — seat line skipped';
    }
  }

  // Diff against the live subscription items (matched by price.product).
  const sub = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price', 'discounts'],
  });
  const updates: ItemUpdate[] = [];
  const seenProducts = new Set<string>();

  for (const item of sub.items.data) {
    const price = item.price;
    const product = typeof price.product === 'string' ? price.product : price.product?.id;
    if (!product) continue;
    seenProducts.add(product);
    const want = desired.get(product);

    if (!want) {
      // No longer part of the plan → remove.
      updates.push({ id: item.id, deleted: true });
      continue;
    }

    if (want.fixedPriceId) {
      // Bundle / fixed-price line: leave as-is (no change emitted).
      continue;
    }

    const sameAmount = price.unit_amount === want.unitAmountCents;
    const sameQty = (item.quantity ?? 1) === want.quantity;
    if (!sameAmount || !sameQty) {
      updates.push({
        id: item.id,
        price_data: monthlyPriceData(product, want.unitAmountCents as number),
        quantity: want.quantity,
      });
    }
  }

  // Desired products not yet on the subscription → add them.
  for (const [product, want] of desired) {
    if (seenProducts.has(product)) continue;
    if (want.fixedPriceId) {
      updates.push({ price: want.fixedPriceId, quantity: want.quantity });
    } else {
      updates.push({ price_data: monthlyPriceData(product, want.unitAmountCents as number), quantity: want.quantity });
    }
  }

  // Comp discount diff — the subscription should carry the `comp-<percent>`
  // coupon iff the client has a comp set (and nothing otherwise).
  const currentCouponId: string | null = (() => {
    const d = sub.discounts?.[0];
    if (!d || typeof d === 'string') return null;
    // Stripe v20: the coupon lives under discount.source.coupon.
    const c = (d as Stripe.Discount).source?.coupon;
    return typeof c === 'string' ? c : c?.id ?? null;
  })();
  const compChanged = currentCouponId !== desiredCouponId;

  const totalCents = moduleSubtotalCents + seatUnitCents * additionalSeats;
  if (updates.length === 0 && !compChanged) return { updated: false, note: seatNote, totalCents };

  const updateParams: Stripe.SubscriptionUpdateParams = { proration_behavior: 'create_prorations' };
  if (updates.length > 0) updateParams.items = updates;
  if (compChanged) {
    if (desiredCouponId) {
      await ensureCompCoupon(stripe, compPercent as number);
      updateParams.discounts = [{ coupon: desiredCouponId }];
    } else {
      updateParams.discounts = []; // clear the comp discount
    }
  }
  await stripe.subscriptions.update(subscriptionId, updateParams);

  return { updated: true, note: seatNote, totalCents };
}

/**
 * Best-effort seat/billing re-sync for a client — instantiates Stripe and
 * swallows errors. Safe to call from team mutation handlers (invite-accept,
 * member removal) where a Stripe hiccup must not break the team change itself.
 */
export async function syncSeatBillingSafe(clientId: number): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return;
  try {
    const Stripe = (await import('stripe')).default;
    await recomputeClientSubscription(new Stripe(key), clientId);
  } catch (err) {
    console.error(
      `[seat-billing] recompute failed for client ${clientId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
