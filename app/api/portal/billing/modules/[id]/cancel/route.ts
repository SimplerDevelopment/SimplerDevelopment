// POST /api/portal/billing/modules/[id]/cancel
//
// Cancels a self-serve module subscription at period end via Stripe.
// [id] = clientServices.id (not serviceId).

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clientServices } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
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

  // ── Cancel at period end via Stripe ──────────────────────────────────────
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json(
      { success: false, message: 'Stripe not configured.' },
      { status: 500 },
    );
  }
  const stripe = new Stripe(stripeKey);

  await stripe.subscriptions.update(row.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  return NextResponse.json({
    success: true,
    data: { cancelAtPeriodEnd: true },
  });
}
