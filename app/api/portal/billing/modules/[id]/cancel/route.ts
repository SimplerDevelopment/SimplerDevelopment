// POST /api/portal/billing/modules/[id]/cancel
//
// Removes ONE module from a self-serve subscription. If other modules remain,
// the module's line item is dropped immediately (prorated credit) and the
// remaining modules + seat line are re-priced by the reconciler. If it's the
// LAST item, the whole subscription is cancelled at period end (a Stripe
// subscription can't be left empty). [id] = clientServices.id (not serviceId).

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clientServices } from '@/lib/db/schema';
import { and, eq, ne, isNotNull } from 'drizzle-orm';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { recomputeClientSubscription } from '@/lib/billing/recompute-subscription';
import Stripe from 'stripe';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizePortal({ action: 'admin' });
  if (isAuthError(auth)) return auth.response;

  const { client } = auth;
  const { id: rawId } = await params;
  const clientServiceId = parseInt(rawId, 10);

  if (!clientServiceId || isNaN(clientServiceId)) {
    return NextResponse.json({ success: false, message: 'Invalid id.' }, { status: 400 });
  }

  // ── Load row, enforce tenancy ─────────────────────────────────────────────
  const [row] = await db
    .select()
    .from(clientServices)
    .where(
      and(
        eq(clientServices.id, clientServiceId),
        eq(clientServices.clientId, client.id), // tenancy guard
      ),
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ success: false, message: 'Subscription not found.' }, { status: 404 });
  }

  // ── Guard: admin-assigned rows can't be cancelled here ────────────────────
  if (!row.stripeSubscriptionId) {
    return NextResponse.json(
      {
        success: false,
        message: 'Managed subscription — contact us to change it.',
      },
      { status: 403 },
    );
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json(
      { success: false, message: 'Stripe not configured.' },
      { status: 500 },
    );
  }
  const stripe = new Stripe(stripeKey);

  // Other active items on the same subscription (tenancy: clientId-scoped).
  const others = await db
    .select({ id: clientServices.id })
    .from(clientServices)
    .where(
      and(
        eq(clientServices.clientId, client.id),
        eq(clientServices.status, 'active'),
        eq(clientServices.stripeSubscriptionId, row.stripeSubscriptionId),
        isNotNull(clientServices.stripeSubscriptionId),
        ne(clientServices.id, clientServiceId),
      ),
    );

  if (others.length === 0) {
    // Last item — a subscription can't be emptied, so cancel the whole thing at
    // period end. The webhook marks the row cancelled when it actually ends.
    await stripe.subscriptions.update(row.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    return NextResponse.json({ success: true, data: { cancelAtPeriodEnd: true } });
  }

  // Drop just this module: mark it cancelled, then let the reconciler remove its
  // line item and re-price the remaining modules (its loss may change the volume
  // discount tier) and the seat line.
  await db
    .update(clientServices)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(eq(clientServices.id, clientServiceId), eq(clientServices.clientId, client.id)));

  await recomputeClientSubscription(stripe, client.id);

  return NextResponse.json({ success: true, data: { removed: true } });
}
