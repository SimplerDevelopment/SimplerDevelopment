// POST /api/portal/billing/modules/checkout
//
// Creates a Stripe Checkout Session for a module or bundle subscription.
// Body: { slug: string }

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clients, services, clientServices } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import {
  FEATURE_DOMAINS,
  BUNDLE_SLUG,
} from '@/lib/billing/domain-catalog';
import Stripe from 'stripe';

const VALID_SLUGS = new Set([
  ...FEATURE_DOMAINS.map((d) => d.slug),
  BUNDLE_SLUG,
]);

export async function POST(req: Request) {
  const auth = await authorizePortal({ action: 'admin' });
  if (isAuthError(auth)) return auth.response;

  const { client } = auth;

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

  // ── 2. Parse + validate body ──────────────────────────────────────────────
  let slug: string;
  try {
    const body = await req.json();
    slug = body?.slug;
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  if (!slug || !VALID_SLUGS.has(slug)) {
    return NextResponse.json(
      { success: false, message: 'Unknown module slug.' },
      { status: 400 },
    );
  }

  // ── 3. Look up service row ────────────────────────────────────────────────
  const [service] = await db
    .select()
    .from(services)
    .where(and(eq(services.slug, slug), eq(services.active, true)))
    .limit(1);

  if (!service) {
    return NextResponse.json(
      { success: false, message: 'Module not found.' },
      { status: 400 },
    );
  }

  if (!service.stripePriceId) {
    return NextResponse.json(
      { success: false, message: "This module isn't available for self-serve checkout yet." },
      { status: 400 },
    );
  }

  // ── 4. Already subscribed? ────────────────────────────────────────────────
  const [existing] = await db
    .select({ id: clientServices.id })
    .from(clientServices)
    .where(
      and(
        eq(clientServices.clientId, client.id),
        eq(clientServices.serviceId, service.id),
        eq(clientServices.status, 'active'),
      ),
    )
    .limit(1);

  if (existing) {
    return NextResponse.json(
      { success: false, message: 'You already have an active subscription to this module.' },
      { status: 409 },
    );
  }

  // ── 5. Stripe setup ───────────────────────────────────────────────────────
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json(
      { success: false, message: 'Stripe not configured.' },
      { status: 500 },
    );
  }
  const stripe = new Stripe(stripeKey);

  // Create or reuse Stripe customer — mirror the credits/purchase pattern:
  // use session email + company name when available, fall back gracefully.
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

  // ── 6. Derive origin for success/cancel URLs ──────────────────────────────
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://simplerdevelopment.com';

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: service.stripePriceId, quantity: 1 }],
    metadata: {
      type: 'module_subscription',
      clientId: String(client.id),
      serviceId: String(service.id),
    },
    subscription_data: {
      metadata: {
        type: 'module_subscription',
        clientId: String(client.id),
        serviceId: String(service.id),
      },
    },
    success_url: `${origin}/portal/settings/billing/plans?status=success`,
    cancel_url: `${origin}/portal/settings/billing/plans?status=cancelled`,
  });

  return NextResponse.json({ success: true, data: { url: checkoutSession.url } });
}
