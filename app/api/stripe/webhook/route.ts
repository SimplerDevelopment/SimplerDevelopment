import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { invoices, clients, clientServices } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { addPurchasedCredits, grantMonthlyCredits } from '@/lib/ai-credits';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || !webhookSecret) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(stripeKey);

    const body = await req.text();
    const sig = req.headers.get('stripe-signature') ?? '';

    const event = stripe.webhooks.constructEvent(body, sig, webhookSecret);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as {
        metadata?: { invoiceId?: string; serviceId?: string; clientId?: string; type?: string; tokens?: string; packageName?: string; packageId?: string };
        id: string;
        customer?: string | null;
      };

      // --- Credit package purchase ---
      if (session.metadata?.type === 'credit_purchase') {
        const creditClientId = parseInt(session.metadata.clientId || '0', 10);
        const tokens = parseInt(session.metadata.tokens || '0', 10);
        const packageName = session.metadata.packageName || 'Credit Package';
        if (creditClientId && tokens > 0) {
          await addPurchasedCredits(creditClientId, tokens, session.id, packageName);
        }
        return NextResponse.json({ received: true });
      }

      // --- Invoice payment ---
      const invoiceId = session.metadata?.invoiceId ? parseInt(session.metadata.invoiceId, 10) : null;
      if (invoiceId) {
        await db.update(invoices).set({
          status: 'paid',
          paidAt: new Date(),
          stripeCheckoutSessionId: session.id,
          updatedAt: new Date(),
        }).where(eq(invoices.id, invoiceId));
      }

      // --- Service purchase ---
      const serviceId = session.metadata?.serviceId ? parseInt(session.metadata.serviceId, 10) : null;
      const clientId = session.metadata?.clientId ? parseInt(session.metadata.clientId, 10) : null;

      if (serviceId && clientId) {
        // Persist Stripe customer ID on the client record for future purchases
        if (session.customer && typeof session.customer === 'string') {
          await db.update(clients)
            .set({ stripeCustomerId: session.customer, updatedAt: new Date() })
            .where(eq(clients.id, clientId));
        }

        // Upsert clientServices record
        const [existing] = await db.select().from(clientServices)
          .where(and(eq(clientServices.clientId, clientId), eq(clientServices.serviceId, serviceId)))
          .limit(1);

        if (existing) {
          await db.update(clientServices)
            .set({ status: 'active', updatedAt: new Date() })
            .where(eq(clientServices.id, existing.id));
        } else {
          await db.insert(clientServices).values({
            clientId,
            serviceId,
            status: 'active',
            startDate: new Date(),
          });
        }

        // Grant monthly AI credits for newly activated service
        await grantMonthlyCredits(clientId);
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    // Don't echo signature-verification messages to the caller — they
    // fingerprint whether STRIPE_WEBHOOK_SECRET is set / what shape we expect.
    console.error('[stripe/webhook] error:', err instanceof Error ? err.stack ?? err.message : err);
    return NextResponse.json({ error: 'webhook_error' }, { status: 400 });
  }
}
