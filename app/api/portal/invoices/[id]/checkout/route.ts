import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, invoices, invoiceItems } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const invoiceId = parseInt(id, 10);
  const userId = parseInt(session.user.id, 10);
  const role = (session.user as { role?: string })?.role;
  const isStaff = role === 'admin' || role === 'employee';

  let clientId: number | undefined;
  if (!isStaff) {
    const [client] = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
    if (!client) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    clientId = client.id;
  }

  const invoiceQuery = isStaff
    ? db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1)
    : db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.clientId, clientId!))).limit(1);

  const [invoice] = await invoiceQuery;
  if (!invoice) return NextResponse.json({ success: false, message: 'Invoice not found' }, { status: 404 });

  if (invoice.status !== 'sent' && invoice.status !== 'overdue') {
    return NextResponse.json({ success: false, message: 'Invoice is not payable' }, { status: 400 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ success: false, message: 'Stripe not configured. Set STRIPE_SECRET_KEY.' }, { status: 500 });
  }

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(stripeKey);

    const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: items.map((item) => ({
        price_data: {
          currency: 'usd',
          unit_amount: item.unitPrice,
          product_data: { name: item.description },
        },
        quantity: item.quantity,
      })),
      metadata: { invoiceId: String(invoiceId) },
      success_url: `${baseUrl}/portal/invoices/${invoiceId}?paid=1`,
      cancel_url: `${baseUrl}/portal/invoices/${invoiceId}`,
    });

    await db.update(invoices).set({ stripeCheckoutSessionId: checkoutSession.id, updatedAt: new Date() }).where(eq(invoices.id, invoiceId));

    return NextResponse.json({ success: true, data: { url: checkoutSession.url } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Stripe error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
