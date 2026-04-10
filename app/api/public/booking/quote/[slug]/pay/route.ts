import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookingQuotes, bookings, bookingPages, clientWebsites, storeSettings } from '@/lib/db/schema';
import { eq, and, ne } from 'drizzle-orm';
import crypto from 'crypto';

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    const [quote] = await db.select().from(bookingQuotes)
      .where(and(eq(bookingQuotes.slug, slug), eq(bookingQuotes.status, 'pending')))
      .limit(1);

    if (!quote) return NextResponse.json({ success: false, message: 'Quote not found or already paid' }, { status: 404 });

    if (quote.expiresAt && new Date() > quote.expiresAt) {
      return NextResponse.json({ success: false, message: 'This quote has expired' }, { status: 410 });
    }

    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    let stripeParams: Parameters<typeof stripe.paymentIntents.create>[0] = {
      amount: quote.price,
      currency: 'usd',
      metadata: {
        type: 'booking_quote',
        quoteId: String(quote.id),
        clientId: String(quote.clientId),
      },
    };

    // Check for Stripe Connect via client's website
    const [website] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
      .where(and(eq(clientWebsites.clientId, quote.clientId), eq(clientWebsites.active, true)))
      .limit(1);

    if (website) {
      const [store] = await db.select().from(storeSettings)
        .where(and(eq(storeSettings.websiteId, website.id), eq(storeSettings.enabled, true)))
        .limit(1);

      if (store?.stripeAccountId && store.stripeOnboardingComplete) {
        const platformFeePercent = store.platformFeePercent ? parseFloat(store.platformFeePercent) : 5;
        const applicationFee = Math.round(quote.price * (platformFeePercent / 100));
        stripeParams = {
          ...stripeParams,
          currency: store.currency?.toLowerCase() || 'usd',
          application_fee_amount: applicationFee,
          transfer_data: { destination: store.stripeAccountId },
        };
      }
    }

    const paymentIntent = await stripe.paymentIntents.create(stripeParams);

    await db.update(bookingQuotes)
      .set({ stripePaymentIntentId: paymentIntent.id, updatedAt: new Date() })
      .where(eq(bookingQuotes.id, quote.id));

    return NextResponse.json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        amount: quote.price,
      },
    });
  } catch (err) {
    console.error('Quote payment error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
