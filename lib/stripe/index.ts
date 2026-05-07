// Thin wrapper around the `stripe` SDK for the metered-billing pipeline.
//
// Existing call sites (credit purchase, checkout, webhooks) instantiate
// `new Stripe(process.env.STRIPE_SECRET_KEY)` ad-hoc — that pattern is
// preserved, this module just centralises the metered-billing helpers so
// they can be mocked in unit tests and so the singleton client doesn't
// have to be wired through every caller.
//
// We deliberately use a lazy singleton: importing this file from a route
// that runs without STRIPE_SECRET_KEY (e.g. local dev) MUST NOT throw at
// import time. Helpers throw at call time instead so callers can return a
// 500 envelope cleanly.

import Stripe from 'stripe';

let _client: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (_client) return _client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  _client = new Stripe(key);
  return _client;
}

/**
 * Push a usage record to Stripe for a metered Subscription Item.
 *
 * `action: 'set'` — the rollup worker writes the absolute period total each
 * run, NOT a delta. Combined with the unique index on
 * (clientId, period, resource) on `usage_billing_periods` this means the
 * same period can be re-rolled-up safely without double-billing.
 *
 * NOTE: The `stripe` SDK removed `subscriptionItems.createUsageRecord` in
 * v20+ in favour of the new Meter Events API. The HTTP endpoint
 * `POST /v1/subscription_items/{id}/usage_records` is still live for
 * legacy metered Prices, so we call it via `rawRequest` until we migrate
 * to Meter Events.
 *
 * Stripe expects `timestamp` in seconds since epoch.
 */
export async function reportUsage(
  stripeSubscriptionItemId: string,
  quantity: number,
  periodEndUnix: number,
): Promise<{ id: string }> {
  const stripe = getStripeClient();
  const response = await stripe.rawRequest(
    'POST',
    `/v1/subscription_items/${encodeURIComponent(stripeSubscriptionItemId)}/usage_records`,
    {
      quantity: Math.max(0, Math.floor(quantity)),
      timestamp: periodEndUnix,
      action: 'set',
    },
  );
  const body = response as unknown as { id?: string };
  return { id: body.id ?? '' };
}

/**
 * Convenience: list the Stripe subscription items currently associated with
 * a client via our `metered_subscription_items` mapping. The lookup is
 * delegated to `lib/billing/metered-items.ts` so we don't import schema
 * tables here (this module stays Stripe-only).
 */
export async function listSubscriptionItemsForClient(
  clientId: number,
): Promise<Array<{ id: string; subscriptionId: string; resource: string }>> {
  const { listMeteredItemsForClient } = await import('@/lib/billing/metered-items');
  const rows = await listMeteredItemsForClient(clientId);
  return rows.map(r => ({
    id: r.stripeSubscriptionItemId,
    subscriptionId: r.stripeSubscriptionId,
    resource: r.resource,
  }));
}

/**
 * Add a metered Subscription Item to an existing Stripe Subscription, then
 * persist the (clientId, subscriptionItemId) mapping locally. Caller passes
 * an existing `priceId` — Stripe Price/Product creation is out of scope
 * (admin pastes the priceId).
 */
export async function createMeteredItemForSubscription(
  clientId: number,
  subscriptionId: string,
  priceId: string,
  opts: { resource: string; unitPriceCents: number; includedQuantity?: number },
): Promise<{ id: string; stripeSubscriptionItemId: string }> {
  const stripe = getStripeClient();
  const item = await stripe.subscriptionItems.create({
    subscription: subscriptionId,
    price: priceId,
  });

  const { insertMeteredItem } = await import('@/lib/billing/metered-items');
  const row = await insertMeteredItem({
    clientId,
    stripeSubscriptionId: subscriptionId,
    stripeSubscriptionItemId: item.id,
    resource: opts.resource,
    unitPriceCents: opts.unitPriceCents,
    includedQuantity: opts.includedQuantity ?? 0,
  });

  return { id: String(row.id), stripeSubscriptionItemId: item.id };
}
