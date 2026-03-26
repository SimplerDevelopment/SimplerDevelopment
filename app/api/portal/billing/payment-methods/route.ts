import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { paymentMethods } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { eq, and } from 'drizzle-orm';

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

  // TODO: Also detach from Stripe when SDK is integrated
  // await stripe.paymentMethods.detach(method.stripePaymentMethodId);

  await db.delete(paymentMethods).where(eq(paymentMethods.id, parseInt(id, 10)));

  return NextResponse.json({ success: true, message: 'Payment method removed' });
}
