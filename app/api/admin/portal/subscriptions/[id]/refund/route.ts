// POST /api/admin/portal/subscriptions/:id/refund
//
// Issue a Stripe refund against a specific local `invoices` row tied to the
// same client as the `clientServices` subscription identified by :id.
//
// Body: { invoiceId: number, amountCents?: number, reason?: string }
//   - amountCents omitted = full refund of the PaymentIntent
//   - reason is forwarded to Stripe (`duplicate` | `fraudulent` |
//     `requested_by_customer`) but only when it matches one of those exact
//     values; arbitrary strings are dropped because Stripe rejects them.
//
// Local DB is intentionally not mutated — the Stripe webhook reconciles
// `invoices.status` once Stripe emits `charge.refunded`.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientServices, invoices } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getStripeClient } from '@/lib/stripe';
import Stripe from 'stripe';

export const runtime = 'nodejs';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

const ALLOWED_REASONS: ReadonlySet<string> = new Set([
  'duplicate',
  'fraudulent',
  'requested_by_customer',
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const clientServiceId = parseInt(id, 10);
  if (!Number.isFinite(clientServiceId)) {
    return NextResponse.json({ success: false, message: 'Invalid subscription id' }, { status: 400 });
  }

  let body: { invoiceId?: number; amountCents?: number; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const invoiceId = typeof body.invoiceId === 'number' ? body.invoiceId : null;
  if (!invoiceId) {
    return NextResponse.json({ success: false, message: 'invoiceId is required' }, { status: 400 });
  }
  const amountCents = typeof body.amountCents === 'number' && body.amountCents > 0 ? Math.floor(body.amountCents) : undefined;
  const reason = typeof body.reason === 'string' && ALLOWED_REASONS.has(body.reason)
    ? (body.reason as Stripe.RefundCreateParams.Reason)
    : undefined;

  // Resolve client and invoice, ensure they line up.
  const [sub] = await db.select().from(clientServices).where(eq(clientServices.id, clientServiceId)).limit(1);
  if (!sub) return NextResponse.json({ success: false, message: 'Subscription not found' }, { status: 404 });

  const [invoice] = await db.select().from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.clientId, sub.clientId)))
    .limit(1);
  if (!invoice) {
    return NextResponse.json({ success: false, message: 'Invoice not found for this client' }, { status: 404 });
  }
  if (!invoice.stripePaymentIntentId) {
    return NextResponse.json({
      success: false,
      message: 'Invoice has no Stripe PaymentIntent — nothing to refund.',
    }, { status: 409 });
  }
  if (amountCents && amountCents > invoice.total) {
    return NextResponse.json({
      success: false,
      message: `Refund amount (${amountCents}c) exceeds invoice total (${invoice.total}c).`,
    }, { status: 400 });
  }

  try {
    const stripe = getStripeClient();
    const idempotencyKey = `refund_${sub.id}_${invoiceId}_${Date.now()}`;

    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: invoice.stripePaymentIntentId,
    };
    if (amountCents) refundParams.amount = amountCents;
    if (reason) refundParams.reason = reason;

    const refund = await stripe.refunds.create(refundParams, { idempotencyKey });

    console.log('[admin/subscriptions/refund]', {
      staffUserId: session.user?.id,
      subscriptionId: clientServiceId,
      invoiceId,
      action: amountCents ? 'partial_refund' : 'full_refund',
      amountCents: amountCents ?? null,
      reason: reason ?? null,
      stripeResponseId: refund.id,
    });

    return NextResponse.json({
      success: true,
      data: {
        refundId: refund.id,
        amount: refund.amount,
        status: refund.status,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error';
    console.error('[admin/subscriptions/refund] failed', { clientServiceId, invoiceId, err });
    return NextResponse.json({ success: false, message }, { status: 502 });
  }
}
