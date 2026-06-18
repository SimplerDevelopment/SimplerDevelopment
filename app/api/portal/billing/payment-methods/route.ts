import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { paymentMethods } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { eq, and } from 'drizzle-orm';
import Stripe from 'stripe';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const methods = await db
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.clientId, client.id))
    .orderBy(paymentMethods.createdAt);

  return NextResponse.json({ success: true, data: methods });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  let id: string | undefined;
  try { ({ id } = await req.json()); } catch { /* empty body */ }
  if (!id) return NextResponse.json({ success: false, message: 'Payment method ID required' }, { status: 400 });

  const [method] = await db
    .select()
    .from(paymentMethods)
    .where(and(eq(paymentMethods.id, parseInt(id, 10)), eq(paymentMethods.clientId, client.id)))
    .limit(1);
  if (!method) return NextResponse.json({ success: false, message: 'Payment method not found' }, { status: 404 });

  // Detach from Stripe first; tolerate "already detached" (no longer attached
  // to any customer) so retries and webhooks don't block local cleanup.
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (stripeKey && method.stripePaymentMethodId) {
    const stripe = new Stripe(stripeKey);
    try {
      await stripe.paymentMethods.detach(method.stripePaymentMethodId);
    } catch (err: unknown) {
      const stripeErr = err as { code?: string };
      if (stripeErr?.code !== 'payment_method_not_attached') {
        throw err;
      }
      // Already detached — safe to continue with local deletion.
    }
  }

  await db.delete(paymentMethods).where(eq(paymentMethods.id, parseInt(id, 10)));

  return NextResponse.json({ success: true, message: 'Payment method removed' });
}
