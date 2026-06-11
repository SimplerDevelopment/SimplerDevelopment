// POST /api/portal/billing/modules/add-item
//
// One-click module add for clients who ALREADY have an active self-serve
// Stripe subscription (created by the multi-item checkout): appends the
// module as a prorated line item on the existing subscription — no second
// Checkout, no re-entering a card. During a trial the new item simply joins
// the trial. Powers the onboarding upsell step; the plans page can reuse it.
//
// Body: { slug } — a module slug, or the bundle slug for a full swap:
// swapping to the bundle replaces every module line item with the single
// bundle item and marks the per-module clientServices rows cancelled.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { services, clientServices } from '@/lib/db/schema';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { FEATURE_DOMAINS, BUNDLE_SLUG } from '@/lib/billing/domain-catalog';
import { grantMonthlyCredits } from '@/lib/ai-credits';
import Stripe from 'stripe';

const MODULE_SLUGS = new Set(FEATURE_DOMAINS.map((d) => d.slug));

export async function POST(req: Request) {
  const auth = await authorizePortal({ action: 'admin' });
  if (isAuthError(auth)) return auth.response;
  const { client } = auth;

  if (client.billingMode === 'agency') {
    return NextResponse.json(
      { success: false, message: 'Your plan is managed by SimplerDevelopment — contact us to make changes.' },
      { status: 403 },
    );
  }

  let body: { slug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }
  const slug = body.slug ?? '';
  const isBundleSwap = slug === BUNDLE_SLUG;
  if (!isBundleSwap && !MODULE_SLUGS.has(slug)) {
    return NextResponse.json({ success: false, message: 'Unknown module slug.' }, { status: 400 });
  }

  const [service] = await db
    .select()
    .from(services)
    .where(and(eq(services.slug, slug), eq(services.active, true)))
    .limit(1);
  if (!service?.stripePriceId) {
    return NextResponse.json(
      { success: false, message: "This module isn't available for self-serve checkout yet." },
      { status: 400 },
    );
  }

  // The client's live self-serve rows (tenancy: clientId-scoped).
  const activeRows = await db
    .select({
      id: clientServices.id,
      serviceId: clientServices.serviceId,
      stripeSubscriptionId: clientServices.stripeSubscriptionId,
      category: services.category,
    })
    .from(clientServices)
    .innerJoin(services, eq(services.id, clientServices.serviceId))
    .where(and(
      eq(clientServices.clientId, client.id),
      eq(clientServices.status, 'active'),
      isNotNull(clientServices.stripeSubscriptionId),
    ));

  const subscriptionId = activeRows[0]?.stripeSubscriptionId;
  if (!subscriptionId) {
    return NextResponse.json(
      { success: false, message: 'No active self-serve subscription — subscribe via checkout first.', useCheckout: true },
      { status: 409 },
    );
  }
  if (activeRows.some((r) => r.serviceId === service.id)) {
    return NextResponse.json({ success: false, message: 'Already subscribed to this module.' }, { status: 409 });
  }
  if (activeRows.some((r) => r.category === 'bundle')) {
    return NextResponse.json({ success: false, message: 'The bundle already includes every module.' }, { status: 409 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ success: false, message: 'Stripe not configured.' }, { status: 500 });
  }
  const stripe = new Stripe(stripeKey);

  if (isBundleSwap) {
    // Replace every existing line item with the single bundle item.
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    await stripe.subscriptions.update(subscriptionId, {
      items: [
        ...sub.items.data.map((item) => ({ id: item.id, deleted: true as const })),
        { price: service.stripePriceId },
      ],
      proration_behavior: 'create_prorations',
    });

    // Per-module rows are superseded by the bundle row.
    const moduleRowIds = activeRows
      .filter((r) => r.stripeSubscriptionId === subscriptionId)
      .map((r) => r.id);
    if (moduleRowIds.length > 0) {
      await db
        .update(clientServices)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(and(eq(clientServices.clientId, client.id), inArray(clientServices.id, moduleRowIds)));
    }
  } else {
    await stripe.subscriptionItems.create({
      subscription: subscriptionId,
      price: service.stripePriceId,
      quantity: 1,
      proration_behavior: 'create_prorations',
    });
  }

  await db.insert(clientServices).values({
    clientId: client.id,
    serviceId: service.id,
    status: 'active',
    stripeSubscriptionId: subscriptionId,
    startDate: new Date(),
  });

  await grantMonthlyCredits(client.id);

  return NextResponse.json({
    success: true,
    data: { added: service.slug, swap: isBundleSwap },
  });
}
