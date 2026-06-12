// POST /api/portal/billing/customer-portal
//
// Creates a Stripe Billing Portal session for the active client, returning
// the session URL the browser should redirect to.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import Stripe from 'stripe';

export async function POST() {
  const auth = await authorizePortal({ action: 'admin' });
  if (isAuthError(auth)) return auth.response;

  const { client } = auth;

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ success: false, message: 'Stripe not configured.' }, { status: 500 });
  }
  const stripe = new Stripe(stripeKey);

  // Ensure the client has a Stripe customer — create one lazily if absent.
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

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://simplerdevelopment.com';

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/portal/settings/billing`,
  });

  return NextResponse.json({ success: true, data: { url: session.url } });
}
