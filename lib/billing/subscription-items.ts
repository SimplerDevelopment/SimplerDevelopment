// Builds the explicit Stripe line items a client's module subscription is made
// of: one item per à-la-carte module (priced at its post-volume-discount
// amount) plus one "Additional seats" item (min(M, $30) × additional accepted
// seats). This is the single source of truth for what we charge — used by the
// checkout route (Checkout line_items) and the recompute reconciler
// (subscription item updates). Pure: no Stripe API calls.

import type Stripe from 'stripe';
import { computeAccountBilling, type AccountBilling } from './domain-catalog';

export interface ModuleLine {
  /** domain key (debug / matching) */
  key: string;
  /** the module's Stripe Product id (price is created inline, discounted) */
  stripeProductId: string;
  /** full, pre-discount monthly price in cents */
  fullPriceCents: number;
}

export interface BuildInput {
  modules: ModuleLine[];
  /** accepted seats, including the owner */
  seatCount: number;
  /** the stable "Additional seats" Stripe Product id (SEAT_SKU.stripeProductId) */
  seatProductId?: string;
}

/** A desired subscription line item in price_data form. */
export interface DesiredItem {
  kind: 'module' | 'seat';
  /** Stripe Product id this line is priced against */
  productId: string;
  unitAmountCents: number;
  quantity: number;
  /** module key, for module lines */
  moduleKey?: string;
}

/**
 * The desired line items + the computed billing breakdown. When `seatProductId`
 * is missing the seat line is omitted (modules still bill correctly) — surface
 * that as a provisioning gap rather than charging seats against a phantom product.
 */
export function buildDesiredItems(input: BuildInput): {
  items: DesiredItem[];
  billing: AccountBilling;
  seatLineOmitted: boolean;
} {
  const billing = computeAccountBilling(
    input.modules.map((m) => m.fullPriceCents),
    input.seatCount,
  );

  const items: DesiredItem[] = input.modules.map((m, i) => ({
    kind: 'module',
    productId: m.stripeProductId,
    unitAmountCents: billing.discountedModuleCents[i],
    quantity: 1,
    moduleKey: m.key,
  }));

  const wantsSeatLine = billing.additionalSeats > 0 && billing.seatUnitCents > 0;
  const seatLineOmitted = wantsSeatLine && !input.seatProductId;
  if (wantsSeatLine && input.seatProductId) {
    items.push({
      kind: 'seat',
      productId: input.seatProductId,
      unitAmountCents: billing.seatUnitCents,
      quantity: billing.additionalSeats,
    });
  }

  return { items, billing, seatLineOmitted };
}

/** Monthly recurring price_data for a desired item. */
export function toPriceData(item: DesiredItem): Stripe.SubscriptionCreateParams.Item.PriceData {
  return {
    currency: 'usd',
    product: item.productId,
    unit_amount: item.unitAmountCents,
    recurring: { interval: 'month' },
  };
}

/** A desired item as a Checkout Session line item. */
export function toCheckoutLineItem(item: DesiredItem): Stripe.Checkout.SessionCreateParams.LineItem {
  return {
    quantity: item.quantity,
    price_data: {
      currency: 'usd',
      product: item.productId,
      unit_amount: item.unitAmountCents,
      recurring: { interval: 'month' },
    },
  };
}
