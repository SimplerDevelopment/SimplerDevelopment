import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { getCreditPackages } from '@/lib/ai-credits';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ error: 'No client' }, { status: 404 });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  const stripe = new Stripe(stripeKey);

  const { packageId } = await req.json();
  if (!packageId) return NextResponse.json({ error: 'packageId required' }, { status: 400 });

  const packages = await getCreditPackages();
  const pkg = packages.find(p => p.id === packageId);
  if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 });

  // Get or create Stripe customer
  let customerId = client.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      ...(session.user.email ? { email: session.user.email } : {}),
      name: client.company,
    });
    customerId = customer.id;
    await db.update(clients).set({ stripeCustomerId: customerId }).where(eq(clients.id, client.id));
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: pkg.name, description: `${(pkg.tokens / 1000).toFixed(0)}K AI tokens` },
        unit_amount: pkg.price,
      },
      quantity: 1,
    }],
    metadata: {
      type: 'credit_purchase',
      clientId: String(client.id),
      packageId: String(pkg.id),
      tokens: String(pkg.tokens),
      packageName: pkg.name,
    },
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://simplerdevelopment.com'}/portal/dashboard?credits=purchased`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://simplerdevelopment.com'}/portal/dashboard`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
