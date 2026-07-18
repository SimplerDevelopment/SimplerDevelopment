// POST /api/portal/billing/modules/verify-session
//
// Called when the buyer lands back from Stripe Checkout with
// ?session_id={CHECKOUT_SESSION_ID}. Retrieves the session server-side and, if
// it completed, activates the purchased modules immediately — the
// checkout.session.completed webhook becomes the backstop rather than the
// primary writer, so quick-setup inline actions stop 403ing while the webhook
// is in flight (OBQA-014). Idempotent: safe to call repeatedly, safe alongside
// the webhook.
//
// Body: { sessionId: string }

import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { activateModuleSubscription } from '@/lib/billing/activate-modules';
import Stripe from 'stripe';

export async function POST(req: Request) {
  const auth = await authorizePortal({ action: 'admin' });
  if (isAuthError(auth)) return auth.response;
  const { client } = auth;

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    // Stripe-less instances grant modules synchronously at checkout — there is
    // never a session to verify.
    return NextResponse.json({ success: true, data: { activated: false } });
  }

  let body: { sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  if (!sessionId || !sessionId.startsWith('cs_')) {
    return NextResponse.json(
      { success: false, message: 'Missing checkout session id.' },
      { status: 400 },
    );
  }

  const stripe = new Stripe(stripeKey);
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });
  } catch {
    return NextResponse.json({ success: false, message: 'Unknown checkout session.' }, { status: 404 });
  }

  // Tenancy: the session's own metadata names the buyer — activate only when
  // it matches the active client, never on the caller-supplied id alone.
  if (
    session.metadata?.type !== 'module_subscription' ||
    session.metadata.clientId !== String(client.id)
  ) {
    return NextResponse.json(
      { success: false, message: 'This checkout session does not belong to your account.' },
      { status: 403 },
    );
  }

  if (session.status !== 'complete') {
    // Open / expired — nothing to activate; the webhook stays authoritative.
    return NextResponse.json({
      success: true,
      data: { activated: false, checkoutStatus: session.status },
    });
  }

  // Replay guard: a Checkout Session stays 'complete' forever, but entitlement
  // follows the LIVE subscription — a cancelled subscriber must not restore
  // paid modules by replaying the session_id from their old success URL.
  const sub = typeof session.subscription === 'object' ? session.subscription : null;
  if (!sub || !['active', 'trialing'].includes(sub.status)) {
    return NextResponse.json({
      success: true,
      data: { activated: false, subscriptionStatus: sub?.status ?? null },
    });
  }

  // serviceIds (plural) is the current metadata shape; serviceId (singular)
  // kept for sessions minted before multi-item checkout.
  const serviceIds = (session.metadata.serviceIds ?? session.metadata.serviceId ?? '')
    .split(',')
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  const result = await activateModuleSubscription({
    clientId: client.id,
    serviceIds,
    stripeSubscriptionId: sub.id,
    stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
    markTrialUsed: session.metadata.trial === '1',
  });

  return NextResponse.json({ success: true, data: { activated: true, ...result } });
}
