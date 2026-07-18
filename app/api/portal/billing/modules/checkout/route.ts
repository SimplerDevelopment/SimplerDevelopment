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
import { buildDesiredItems, toCheckoutLineItem, toNamedCheckoutLineItem } from '@/lib/billing/subscription-items';
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
    .select({ pendingToken: users.emailVerificationToken, email: users.email })
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

  // On a Stripe-less instance the catalog has no price IDs — the check only
  // applies when a real checkout will happen (see the bypass branch below).
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (stripeKey) {
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

  // ── 5. No payment processor on this instance: grant locally, bypass checkout.
  // This is a server-side env check — a client cannot force this path on an
  // instance where Stripe IS configured, so paid instances always charge.
  if (!stripeKey) {
    await db.insert(clientServices).values(
      rows.map((r) => ({
        clientId: client.id,
        serviceId: r.id,
        status: 'active' as const,
        notes: 'granted without payment — Stripe not configured on this instance',
      })),
    );
    return NextResponse.json({ success: true, data: { bypassed: true } });
  }
  const stripe = new Stripe(stripeKey);

  // Create or reuse Stripe customer. Set the customer's email from the signed-in
  // user so Checkout pre-fills AND locks it — otherwise the already-logged-in
  // user is asked to retype their email on the Stripe page (unnecessary friction).
  let customerId = client.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      ...(me?.email ? { email: me.email } : {}),
      ...(client.company ? { name: client.company } : {}),
    });
    customerId = customer.id;
    await db
      .update(clients)
      .set({ stripeCustomerId: customerId })
      .where(eq(clients.id, client.id));
  } else if (me?.email) {
    // Existing customer may predate email capture (e.g. created via the credits
    // purchase flow, which also omitted it). Backfill so Checkout pre-fills the
    // email rather than asking for it again. Non-fatal — never block checkout.
    try {
      await stripe.customers.update(customerId, { email: me.email });
    } catch {
      /* ignore — worst case Stripe just asks for the email as before */
    }
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
  let desiredItems: ReturnType<typeof buildDesiredItems>['items'] | null = null;
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
    desiredItems = items;
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

  const createSession = (items: Stripe.Checkout.SessionCreateParams.LineItem[]) =>
    stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: items,
      metadata,
      subscription_data: {
        metadata,
        ...(trialEligible ? { trial_period_days: TRIAL_DAYS } : {}),
      },
      // {CHECKOUT_SESSION_ID} is substituted by Stripe — the return page uses
      // it to verify + activate server-side without waiting for the webhook
      // (OBQA-014, see verify-session route).
      success_url: `${origin}${returnPath}success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${returnPath}cancelled`,
    });

  let checkoutSession: Stripe.Checkout.Session;
  try {
    checkoutSession = await createSession(lineItems);
  } catch (err) {
    // The catalog's pre-provisioned product/price ids belong to the
    // SimplerDevelopment Stripe account; a self-hoster's own key can't see
    // them ("No such product"). Rebuild the lines with INLINE product_data
    // (Stripe creates the products at session time) and retry once.
    const code = (err as Stripe.errors.StripeError)?.code;
    if (code !== 'resource_missing') throw err;

    const nameBySlug = new Map(rows.map((r) => [r.slug, r.name] as const));
    let namedItems: Stripe.Checkout.SessionCreateParams.LineItem[];
    if (desiredItems) {
      namedItems = desiredItems.map((item) =>
        toNamedCheckoutLineItem(
          item,
          item.kind === 'seat' ? 'Additional seat' : nameBySlug.get(item.moduleKey ?? '') ?? item.moduleKey ?? 'Module',
        ),
      );
    } else {
      // bundle / legacy tier: inline from the catalog row's own price
      if (rows.some((r) => r.price == null)) throw err;
      namedItems = rows.map((r) => ({
        quantity: 1,
        price_data: {
          currency: 'usd',
          product_data: { name: r.name },
          unit_amount: r.price as number,
          recurring: { interval: 'month' },
        },
      }));
    }
    checkoutSession = await createSession(namedItems);
  }

  return NextResponse.json({ success: true, data: { url: checkoutSession.url } });
}
