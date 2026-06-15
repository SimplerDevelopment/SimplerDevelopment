// POST /api/admin/portal/subscriptions/:id/change-plan
//
// Swap the Stripe Subscription's primary item to a different Price. Used
// when staff upgrade or downgrade a client's plan from the admin panel.
//
// Body: { newStripePriceId: string, proration?: 'create_prorations' | 'none' }
//
// The Stripe webhook reconciles `clientServices.serviceId` after the
// change — we do NOT mutate local DB here beyond a console.log audit row.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientServices, meteredSubscriptionItems, services } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getStripeClient } from '@/lib/stripe';
import { TIERS, BUNDLE_SLUG } from '@/lib/billing/domain-catalog';

export const runtime = 'nodejs';

// Only these SKUs may be assigned via change-plan. Individual à-la-carte modules
// must never be swapped onto a subscription's plan line.
const PLAN_SLUGS = [...TIERS.map((t) => t.slug), BUNDLE_SLUG];

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

async function resolveStripeSubscriptionId(clientServiceId: number): Promise<{
  stripeSubscriptionId: string;
} | { error: string; status: number }> {
  const [row] = await db
    .select()
    .from(clientServices)
    .where(eq(clientServices.id, clientServiceId))
    .limit(1);

  if (!row) return { error: 'Subscription not found', status: 404 };

  const metadata = (row.metadata ?? {}) as { stripeSubscriptionId?: string };
  if (typeof metadata.stripeSubscriptionId === 'string' && metadata.stripeSubscriptionId.length > 0) {
    return { stripeSubscriptionId: metadata.stripeSubscriptionId };
  }

  const [metered] = await db
    .select()
    .from(meteredSubscriptionItems)
    .where(and(
      eq(meteredSubscriptionItems.clientId, row.clientId),
      eq(meteredSubscriptionItems.status, 'active'),
    ))
    .limit(1);

  if (metered?.stripeSubscriptionId) {
    return { stripeSubscriptionId: metered.stripeSubscriptionId };
  }

  return {
    error: 'No Stripe subscription is linked to this client_services row.',
    status: 409,
  };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const clientServiceId = parseInt(id, 10);
  if (!Number.isFinite(clientServiceId)) {
    return NextResponse.json({ success: false, message: 'Invalid subscription id' }, { status: 400 });
  }

  let body: { newStripePriceId?: string; proration?: 'create_prorations' | 'none' };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const newStripePriceId = body.newStripePriceId;
  if (typeof newStripePriceId !== 'string' || newStripePriceId.length === 0) {
    return NextResponse.json({ success: false, message: 'newStripePriceId is required' }, { status: 400 });
  }
  const proration = body.proration === 'none' ? 'none' : 'create_prorations';

  // ── Guard: target must be a plan/bundle price, not an individual module ───
  // (The à-la-carte model builds multi-item module subscriptions; swapping a
  // module price onto the plan line — or swapping the first item of an
  // à-la-carte sub — corrupts it.)
  const planRows = await db
    .select({ stripePriceId: services.stripePriceId, stripeProductId: services.stripeProductId })
    .from(services)
    .where(inArray(services.slug, PLAN_SLUGS));
  const planPriceIds = new Set(planRows.map((r) => r.stripePriceId).filter(Boolean) as string[]);
  const planProductIds = new Set(planRows.map((r) => r.stripeProductId).filter(Boolean) as string[]);

  if (!planPriceIds.has(newStripePriceId)) {
    return NextResponse.json(
      { success: false, message: 'Target price must be a plan or bundle — individual modules are managed from the client plan page.' },
      { status: 400 },
    );
  }

  const resolved = await resolveStripeSubscriptionId(clientServiceId);
  if ('error' in resolved) {
    return NextResponse.json({ success: false, message: resolved.error }, { status: resolved.status });
  }
  const { stripeSubscriptionId } = resolved;

  try {
    const stripe = getStripeClient();

    // Swap the existing PLAN line (a tier/bundle item), not blindly the first
    // item — a multi-item à-la-carte subscription has no plan line, so we refuse
    // rather than corrupt it.
    const existing = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const planItem = existing.items.data.find((it) => {
      const product = typeof it.price.product === 'string' ? it.price.product : it.price.product?.id;
      return planPriceIds.has(it.price.id) || (product ? planProductIds.has(product) : false);
    });
    if (!planItem) {
      return NextResponse.json(
        { success: false, message: 'This subscription has no plan line to change — it looks à-la-carte. Manage its modules from the client plan page.' },
        { status: 409 },
      );
    }

    const idempotencyKey = `changePlan_${stripeSubscriptionId}__${clientServiceId}_${Date.now()}`;

    const updated = await stripe.subscriptions.update(
      stripeSubscriptionId,
      {
        items: [{ id: planItem.id, price: newStripePriceId }],
        proration_behavior: proration,
      },
      { idempotencyKey },
    );

    console.log('[admin/subscriptions/change-plan]', {
      staffUserId: session.user?.id,
      subscriptionId: clientServiceId,
      stripeSubscriptionId,
      action: 'change_plan',
      newStripePriceId,
      proration,
      stripeResponseId: updated.id,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        status: updated.status,
        items: updated.items.data.map(it => ({ id: it.id, priceId: it.price.id })),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error';
    console.error('[admin/subscriptions/change-plan] failed', { clientServiceId, stripeSubscriptionId, err });
    return NextResponse.json({ success: false, message }, { status: 502 });
  }
}
