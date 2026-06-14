// POST /api/portal/billing/modules/add-item
//
// One-click module add for clients who ALREADY have an active self-serve
// Stripe subscription (created by the multi-item checkout). Updates the DB
// (adds the module's clientServices row, or for a bundle swap cancels the
// per-module rows and adds the bundle row) and then calls the recompute
// reconciler, which makes the Stripe subscription match: every module priced
// at its post-volume-discount amount, the bundle at its fixed price, plus the
// per-seat line. No second Checkout, no re-entering a card.
//
// Body: { slug } — a module slug, or the bundle slug for a full swap.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { services, clientServices } from '@/lib/db/schema';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { FEATURE_DOMAINS, BUNDLE_SLUG } from '@/lib/billing/domain-catalog';
import { recomputeClientSubscription } from '@/lib/billing/recompute-subscription';
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

  // ── 1. Reflect the change in the DB first ─────────────────────────────────
  if (isBundleSwap) {
    // Per-module rows are superseded by the single bundle row.
    const moduleRowIds = activeRows
      .filter((r) => r.stripeSubscriptionId === subscriptionId)
      .map((r) => r.id);
    if (moduleRowIds.length > 0) {
      await db
        .update(clientServices)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(and(eq(clientServices.clientId, client.id), inArray(clientServices.id, moduleRowIds)));
    }
  }

  await db.insert(clientServices).values({
    clientId: client.id,
    serviceId: service.id,
    status: 'active',
    stripeSubscriptionId: subscriptionId,
    startDate: new Date(),
  });

  // ── 2. Make Stripe match the new module set + seats ───────────────────────
  await recomputeClientSubscription(stripe, client.id);

  await grantMonthlyCredits(client.id);

  return NextResponse.json({
    success: true,
    data: { added: service.slug, swap: isBundleSwap },
  });
}
