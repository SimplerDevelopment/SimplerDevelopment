// POST /api/admin/portal/subscriptions/:id/cancel
//
// Cancels the Stripe Subscription tied to a `clientServices` row.
// Default behaviour is `atPeriodEnd: true` so customers aren't surprised by
// an immediate cut-off mid-cycle — pass `{ atPeriodEnd: false }` to cancel
// immediately.
//
// Source of truth: Stripe. The Stripe webhook reconciles local
// `clientServices.status` so this handler intentionally does NOT mutate
// local state beyond a console.log audit trail.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientServices, meteredSubscriptionItems } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getStripeClient } from '@/lib/stripe';

export const runtime = 'nodejs';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

/**
 * Resolves the Stripe Subscription ID for a `clientServices` row.
 *
 * The local schema does not (yet) store `stripeSubscriptionId` directly on
 * `clientServices`. Two fallbacks:
 *   1. Read `clientServices.metadata.stripeSubscriptionId` if set.
 *   2. Look it up via `metered_subscription_items` for the same client.
 *      This is a best-effort hint — a client can only have one active
 *      Stripe subscription in practice, so picking the first active row is
 *      safe enough for staff-driven actions.
 */
async function resolveStripeSubscriptionId(clientServiceId: number): Promise<{
  stripeSubscriptionId: string;
  clientServiceId: number;
} | { error: string; status: number }> {
  const [row] = await db
    .select()
    .from(clientServices)
    .where(eq(clientServices.id, clientServiceId))
    .limit(1);

  if (!row) return { error: 'Subscription not found', status: 404 };

  const metadata = (row.metadata ?? {}) as { stripeSubscriptionId?: string };
  if (typeof metadata.stripeSubscriptionId === 'string' && metadata.stripeSubscriptionId.length > 0) {
    return { stripeSubscriptionId: metadata.stripeSubscriptionId, clientServiceId: row.id };
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
    return { stripeSubscriptionId: metered.stripeSubscriptionId, clientServiceId: row.id };
  }

  return {
    error: 'No Stripe subscription is linked to this client_services row. Save the Stripe Subscription ID on clientServices.metadata.stripeSubscriptionId or attach a metered subscription item first.',
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

  let body: { atPeriodEnd?: boolean } = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }
  const atPeriodEnd = body.atPeriodEnd !== false; // default true

  const resolved = await resolveStripeSubscriptionId(clientServiceId);
  if ('error' in resolved) {
    return NextResponse.json({ success: false, message: resolved.error }, { status: resolved.status });
  }
  const { stripeSubscriptionId } = resolved;

  try {
    const stripe = getStripeClient();
    const idempotencyKey = `cancel_${stripeSubscriptionId}__${clientServiceId}_${Date.now()}`;

    let result: { id: string; status: string; cancelAtPeriodEnd?: boolean; canceledAt: number | null };

    if (atPeriodEnd) {
      // Soft cancel: schedule end-of-period termination via .update.
      const updated = await stripe.subscriptions.update(
        stripeSubscriptionId,
        { cancel_at_period_end: true },
        { idempotencyKey },
      );
      result = {
        id: updated.id,
        status: updated.status,
        cancelAtPeriodEnd: updated.cancel_at_period_end,
        canceledAt: updated.canceled_at,
      };
    } else {
      const cancelled = await stripe.subscriptions.cancel(
        stripeSubscriptionId,
        undefined,
        { idempotencyKey },
      );
      result = {
        id: cancelled.id,
        status: cancelled.status,
        canceledAt: cancelled.canceled_at,
      };
    }

    console.log('[admin/subscriptions/cancel]', {
      staffUserId: session.user?.id,
      subscriptionId: clientServiceId,
      stripeSubscriptionId,
      action: atPeriodEnd ? 'cancel_at_period_end' : 'cancel_immediate',
      stripeResponseId: result.id,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error';
    console.error('[admin/subscriptions/cancel] failed', { clientServiceId, stripeSubscriptionId, err });
    return NextResponse.json({ success: false, message }, { status: 502 });
  }
}
