import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookings, bookingPages, bookingQuotes, clients, users, giftCertificates } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { sendGuestConfirmation, sendHostNotification, loadBookingBrand } from '@/lib/email/booking-emails';
import { createCalendarEvent } from '@/lib/google-calendar';
import { createZoomMeeting } from '@/lib/zoom';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_BOOKING_WEBHOOK_SECRET;

  if (!stripeKey || !webhookSecret) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(stripeKey);

    const body = await req.text();
    const sig = req.headers.get('stripe-signature') ?? '';

    const event = stripe.webhooks.constructEvent(body, sig, webhookSecret);

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as {
        id: string;
        metadata?: {
          type?: string;
          bookingId?: string;
          bookingPageId?: string;
          clientId?: string;
          giftCertificateId?: string;
          quoteId?: string;
        };
      };

      // Handle gift certificate purchase
      if (paymentIntent.metadata?.type === 'gift_certificate') {
        const certId = paymentIntent.metadata?.giftCertificateId
          ? parseInt(paymentIntent.metadata.giftCertificateId, 10)
          : null;
        if (certId) {
          await db.update(giftCertificates)
            .set({ status: 'active', paymentStatus: 'paid', updatedAt: new Date() })
            .where(eq(giftCertificates.id, certId));
        }
        return NextResponse.json({ received: true });
      }

      // Handle quote payment
      if (paymentIntent.metadata?.type === 'booking_quote') {
        const quoteId = paymentIntent.metadata?.quoteId
          ? parseInt(paymentIntent.metadata.quoteId, 10)
          : null;
        if (quoteId) {
          await db.update(bookingQuotes)
            .set({ status: 'paid', paidAt: new Date(), updatedAt: new Date() })
            .where(eq(bookingQuotes.id, quoteId));
        }
        return NextResponse.json({ received: true });
      }

      if (paymentIntent.metadata?.type !== 'booking') {
        return NextResponse.json({ received: true });
      }

      const bookingId = paymentIntent.metadata?.bookingId
        ? parseInt(paymentIntent.metadata.bookingId, 10)
        : null;

      if (!bookingId) {
        return NextResponse.json({ received: true });
      }

      // Update booking payment status
      const [booking] = await db.select().from(bookings)
        .where(eq(bookings.id, bookingId)).limit(1);

      if (!booking || booking.paymentStatus === 'paid') {
        return NextResponse.json({ received: true }); // idempotent
      }

      await db.update(bookings)
        .set({ paymentStatus: 'paid', paidAt: new Date(), updatedAt: new Date() })
        .where(eq(bookings.id, bookingId));

      // Get booking page for conference/calendar settings
      const [page] = await db.select().from(bookingPages)
        .where(eq(bookingPages.id, booking.bookingPageId)).limit(1);

      if (!page) {
        return NextResponse.json({ received: true });
      }

      const bookingTimezone = booking.timezone || page.timezone;
      let meetingLink: string | null = null;

      // Create calendar event + meeting link
      if (page.googleCalendarSync || page.conferenceType === 'google_meet') {
        const result = await createCalendarEvent({
          clientId: page.clientId,
          bookingId: booking.id,
          title: page.title,
          startTime: booking.startTime,
          endTime: booking.endTime,
          timezone: bookingTimezone,
          guestEmail: booking.guestEmail,
          guestName: booking.guestName,
          addGoogleMeet: page.conferenceType === 'google_meet',
        });
        if (result?.meetingLink) meetingLink = result.meetingLink;
      }

      if (page.conferenceType === 'zoom') {
        meetingLink = await createZoomMeeting({
          clientId: page.clientId,
          bookingId: booking.id,
          title: `${page.title} — ${booking.guestName}`,
          startTime: booking.startTime,
          duration: page.duration,
          timezone: bookingTimezone,
        });

        if (page.googleCalendarSync) {
          createCalendarEvent({
            clientId: page.clientId,
            bookingId: booking.id,
            title: page.title,
            description: meetingLink ? `Zoom: ${meetingLink}` : undefined,
            startTime: booking.startTime,
            endTime: booking.endTime,
            timezone: bookingTimezone,
            guestEmail: booking.guestEmail,
            guestName: booking.guestName,
          }).catch(() => {});
        }
      }

      if (meetingLink) {
        await db.update(bookings)
          .set({ meetingLink })
          .where(eq(bookings.id, bookingId));
      }

      // Send confirmation emails
      const emailData = {
        guestName: booking.guestName,
        guestEmail: booking.guestEmail,
        pageTitle: page.title,
        startTime: booking.startTime,
        endTime: booking.endTime,
        timezone: bookingTimezone,
        cancelToken: booking.cancelToken,
        bookingSlug: page.slug,
        duration: page.duration,
        meetingLink,
        brand: await loadBookingBrand(page.id),
      };

      sendGuestConfirmation(emailData).catch(() => {});

      const [client] = await db.select({ userId: clients.userId }).from(clients)
        .where(eq(clients.id, page.clientId)).limit(1);
      if (client) {
        const [host] = await db.select({ email: users.email }).from(users)
          .where(eq(users.id, client.userId)).limit(1);
        if (host) {
          sendHostNotification(host.email, emailData).catch(() => {});
        }
      }
    }

    if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object as {
        id: string;
        metadata?: { type?: string; bookingId?: string };
      };

      if (paymentIntent.metadata?.type !== 'booking') {
        return NextResponse.json({ received: true });
      }

      const bookingId = paymentIntent.metadata?.bookingId
        ? parseInt(paymentIntent.metadata.bookingId, 10)
        : null;

      if (bookingId) {
        await db.update(bookings)
          .set({ status: 'cancelled', paymentStatus: 'free', cancelledAt: new Date(), updatedAt: new Date() })
          .where(eq(bookings.id, bookingId));
      }
    }

    if (event.type === 'charge.refunded') {
      const charge = event.data.object as {
        payment_intent: string;
        metadata?: { type?: string; bookingId?: string };
      };

      // Try to find booking by payment intent ID
      const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
      if (piId) {
        const [booking] = await db.select().from(bookings)
          .where(eq(bookings.stripePaymentIntentId, piId)).limit(1);
        if (booking) {
          await db.update(bookings)
            .set({ paymentStatus: 'refunded', updatedAt: new Date() })
            .where(eq(bookings.id, booking.id));
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Booking webhook error:', err);
    return NextResponse.json({ error: 'Webhook error' }, { status: 400 });
  }
}
