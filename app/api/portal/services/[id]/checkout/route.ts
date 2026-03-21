import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { services, clients, clientServices } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const serviceId = parseInt(id, 10);
  const userId = parseInt(session.user.id, 10);

  const [client] = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const [svc] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
  if (!svc || !svc.active) return NextResponse.json({ success: false, message: 'Service not available' }, { status: 404 });

  // Check if already active
  const [existing] = await db.select().from(clientServices)
    .where(and(eq(clientServices.clientId, client.id), eq(clientServices.serviceId, serviceId)))
    .limit(1);
  if (existing?.status === 'active') {
    return NextResponse.json({ success: false, message: 'You already have this service' }, { status: 409 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ success: false, message: 'Payments not configured' }, { status: 500 });

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(stripeKey);

  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const isRecurring = svc.billingCycle === 'monthly' || svc.billingCycle === 'annually';
  const mode = isRecurring ? 'subscription' : 'payment';

  type LineItem = Parameters<typeof stripe.checkout.sessions.create>[0]['line_items'];
  let lineItems: LineItem;

  if (svc.stripePriceId) {
    lineItems = [{ price: svc.stripePriceId, quantity: 1 }];
  } else {
    const priceData: Record<string, unknown> = {
      currency: 'usd',
      unit_amount: svc.price,
      product_data: { name: svc.name, description: svc.description ?? undefined },
    };
    if (svc.billingCycle === 'monthly') priceData.recurring = { interval: 'month' };
    else if (svc.billingCycle === 'annually') priceData.recurring = { interval: 'year' };
    lineItems = [{ price_data: priceData as Parameters<typeof stripe.checkout.sessions.create>[0]['line_items'][0]['price_data'], quantity: 1 }];
  }

  const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
    mode,
    line_items: lineItems,
    success_url: `${origin}/portal/services?purchased=1`,
    cancel_url: `${origin}/portal/services`,
    metadata: { serviceId: String(svc.id), clientId: String(client.id) },
  };

  if (client.stripeCustomerId) {
    sessionParams.customer = client.stripeCustomerId;
  } else if (mode === 'payment') {
    sessionParams.customer_creation = 'always';
  }

  const checkoutSession = await stripe.checkout.sessions.create(sessionParams);

  return NextResponse.json({ success: true, data: { url: checkoutSession.url } });
}
