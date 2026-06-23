import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookingPages, bookings } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; bookingId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const { id, bookingId } = await params;
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const [page] = await db.select().from(bookingPages)
    .where(and(eq(bookingPages.id, parseInt(id)), eq(bookingPages.clientId, client.id)))
    .limit(1);
  if (!page) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const [booking] = await db.select().from(bookings)
    .where(and(eq(bookings.id, parseInt(bookingId)), eq(bookings.bookingPageId, page.id)))
    .limit(1);
  if (!booking) return NextResponse.json({ success: false, message: 'Booking not found' }, { status: 404 });

  if (!booking.stripePaymentIntentId || booking.paymentStatus !== 'paid') {
    return NextResponse.json({ success: false, message: 'This booking has no payment to refund' }, { status: 400 });
  }

  const body = await req.json();
  const { amount } = body; // optional partial refund amount in cents

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    const refundParams: { payment_intent: string; amount?: number } = {
      payment_intent: booking.stripePaymentIntentId,
    };

    if (amount && amount > 0 && amount < booking.total) {
      refundParams.amount = amount; // partial refund
    }

    const refund = await stripe.refunds.create(refundParams);

    const isFullRefund = !amount || amount >= booking.total;

    await db.update(bookings)
      .set({
        paymentStatus: 'refunded',
        status: isFullRefund ? 'cancelled' : booking.status,
        cancelledAt: isFullRefund ? new Date() : booking.cancelledAt,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, booking.id));

    return NextResponse.json({
      success: true,
      data: {
        refundId: refund.id,
        amount: refund.amount,
        status: refund.status,
      },
    });
  } catch (err) {
    console.error('Booking refund error:', err);
    return NextResponse.json({ success: false, message: 'Failed to process refund' }, { status: 500 });
  }
}
