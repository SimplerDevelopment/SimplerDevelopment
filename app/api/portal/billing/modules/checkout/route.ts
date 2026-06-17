// POST /api/portal/billing/modules/checkout
//
// Creates a Stripe Checkout Session for one or more module/bundle
// subscriptions — a single Stripe subscription with one line item per module
// (one invoice / renewal / trial clock; cancelling one module later means
// removing its line item).
//
// Body: { slug: string } | { slugs: string[] }, optional returnTo: 'onboarding'
// First-time self-serve clients (clients.trialUsedAt null) get a 14-day
// card-required trial; the webhook stamps trialUsedAt on activation.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clients, services, clientServices, users } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { FEATURE_DOMAINS, BUNDLE_SLUG, TIERS, SEAT_SKU } from '@/lib/billing/domain-catalog';
import { buildDesiredItems, toCheckoutLineItem } from '@/lib/billing/subscription-items';
import { countBillableSeats } from '@/lib/billing/seats';
import Stripe from 'stripe';

const VALID_SLUGS = new Set([
  ...FEATURE_DOMAINS.map((d) => d.slug),
  ...TIERS.map((t) => t.slug),
  BUNDLE_SLUG,
]);

// Individual modules are billed at their post-volume-discount amount via
// price_data; the bundle / legacy tier SKUs use their fixed Stripe price.
const MODULE_SLUGS = new Set(FEATURE_DOMAINS.map((d) => d.slug));

const TRIAL_DAYS = 14;

export async function POST(req: Request) {
  const auth = await authorizePortal({ action: 'admin' });
  if (isAuthError(auth)) return auth.response;

  const { client, userId } = auth;

  // ── 1. billingMode guard ──────────────────────────────────────────────────
  if (client.billingMode === 'agency') {
    return NextResponse.json(
      {
        success: false,
        message:
          'Your plan is managed by SimplerDevelopment — contact us to make changes.',
      },
      { status: 403 },
    );
  }

  // Self-serve signups must verify their email before paying — a pending
  // verification token marks an unverified self-serve account (invited and
  // legacy users never carry one).
  const [me] = await db
    .select({ pendingToken: users.emailVerificationToken })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (me?.pendingToken) {
    return NextResponse.json(
      { success: false, message: 'Verify your email first — check your inbox for the link.', requiresVerification: true },
      { status: 403 },
    );
  }

  // ── 2. Parse + validate body ──────────────────────────────────────────────
  let body: { slug?: string; slugs?: string[]; returnTo?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const slugs = [...new Set(body.slugs ?? (body.slug ? [body.slug] : []))];
  if (slugs.length === 0 || slugs.length > VALID_SLUGS.size || !slugs.every((s) => VALID_SLUGS.has(s))) {
    return NextResponse.json(
      { success: false, message: 'Unknown module slug.' },
      { status: 400 },
    );
  }

  // ── 3. Look up service rows ───────────────────────────────────────────────
  const rows = await db
    .select()
    .from(services)
    .where(and(inArray(services.slug, slugs), eq(services.active, true)));

  if (rows.length !== slugs.length) {
    return NextResponse.json(
      { success: false, message: 'Module not found.' },
      { status: 400 },
    );
  }

  const missingPrice = rows.filter((r) => !r.stripePriceId);
  if (missingPrice.length > 0) {
    return NextResponse.json(
      {
        success: false,
        message: `Not available for self-serve checkout yet: ${missingPrice.map((r) => r.name).join(', ')}.`,
      },
      { status: 400 },
    );
  }

  // ── 4. Already subscribed? ────────────────────────────────────────────────
  const existing = await db
    .select({ serviceId: clientServices.serviceId })
    .from(clientServices)
    .where(
      and(
        eq(clientServices.clientId, client.id),
        inArray(clientServices.serviceId, rows.map((r) => r.id)),
        eq(clientServices.status, 'active'),
      ),
    );

  if (existing.length > 0) {
    const owned = new Set(existing.map((e) => e.serviceId));
    const names = rows.filter((r) => owned.has(r.id)).map((r) => r.name).join(', ');
    return NextResponse.json(
      { success: false, message: `Already subscribed: ${names}.` },
      { status: 409 },
    );
  }

  // ── 5. Stripe setup ───────────────────────────────────────────────────────
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json(
      { success: false, message: 'Stripe not configured.' },
      { status: 500 },
    );
  }
  const stripe = new Stripe(stripeKey);

  // Create or reuse Stripe customer — mirror the credits/purchase pattern.
  let customerId = client.stripeCustomerId;
  if (!customerId) {
    const params: Record<string, string> = {};
    if (client.company) params.name = client.company;
    const customer = await stripe.customers.create(params);
    customerId = customer.id;
    await db
      .update(clients)
      .set({ stripeCustomerId: customerId })
      .where(eq(clients.id, client.id));
  }

  // ── 6. Trial: first self-serve subscription per client only ──────────────
  const trialEligible = client.trialUsedAt == null;

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://simplerdevelopment.com';
  const returnPath = body.returnTo === 'onboarding'
    ? '/portal/onboarding?checkout='
    : '/portal/settings/billing/plans?status=';

  // ── 7. Build the subscription line items ──────────────────────────────────
  // À-la-carte modules are charged at their post-volume-discount amount (baked
  // into the line via price_data, not a coupon) plus a seat line for any
  // additional accepted seats. Bundle / legacy tier SKUs keep their fixed price.
  const moduleRows = rows.filter((r) => MODULE_SLUGS.has(r.slug));
  const isPureModules = moduleRows.length === rows.length;

  let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
  if (isPureModules) {
    const missingProduct = moduleRows.filter((r) => !r.stripeProductId);
    if (missingProduct.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Not available for self-serve checkout yet: ${missingProduct.map((r) => r.name).join(', ')}.`,
        },
        { status: 400 },
      );
    }
    const seatCount = await countBillableSeats(client.id);
    const { items } = buildDesiredItems({
      modules: moduleRows.map((r) => ({
        key: r.slug,
        stripeProductId: r.stripeProductId as string,
        fullPriceCents: r.price ?? 0,
      })),
      seatCount,
      seatProductId: SEAT_SKU.stripeProductId,
    });
    lineItems = items.map(toCheckoutLineItem);
  } else {
    // Bundle or tier — their fixed Stripe price.
    lineItems = rows.map((r) => ({ price: r.stripePriceId as string, quantity: 1 }));
  }

  const metadata: Record<string, string> = {
    type: 'module_subscription',
    clientId: String(client.id),
    serviceIds: rows.map((r) => r.id).join(','),
    ...(trialEligible ? { trial: '1' } : {}),
  };

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: lineItems,
    metadata,
    subscription_data: {
      metadata,
      ...(trialEligible ? { trial_period_days: TRIAL_DAYS } : {}),
    },
    success_url: `${origin}${returnPath}success`,
    cancel_url: `${origin}${returnPath}cancelled`,
  });

  return NextResponse.json({ success: true, data: { url: checkoutSession.url } });
}
