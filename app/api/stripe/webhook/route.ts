import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { invoices, clients, clientServices } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { addPurchasedCredits, grantMonthlyCredits } from '@/lib/ai-credits';
import { revalidateAdminDashboard } from '@/lib/admin/dashboard-cache';

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

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as { id: string };
      // Find the clientServices row that was backed by this Stripe subscription
      // and mark it cancelled. No-op if it's already been cleaned up or was
      // never written (e.g. checkout started but never completed).
      const [csRow] = await db
        .select({ id: clientServices.id })
        .from(clientServices)
        .where(eq(clientServices.stripeSubscriptionId, subscription.id))
        .limit(1);

      if (csRow) {
        await db
          .update(clientServices)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(eq(clientServices.id, csRow.id));
      }

      return NextResponse.json({ received: true });
    }

    if (event.type === 'invoice.paid') {
      // Recurring subscription renewal. Re-grant the monthly AI credit
      // allowance each cycle. The FIRST invoice (billing_reason
      // 'subscription_create') is intentionally skipped here — the initial
      // grant is handled by checkout.session.completed below, so granting here
      // too would double-grant month one.
      const invoice = event.data.object as {
        customer?: string | null;
        billing_reason?: string | null;
      };

      if (invoice.billing_reason === 'subscription_cycle' && typeof invoice.customer === 'string') {
        const [client] = await db
          .select({ id: clients.id })
          .from(clients)
          .where(eq(clients.stripeCustomerId, invoice.customer))
          .limit(1);

        if (client) {
          // Idempotency guard: Stripe can redeliver a webhook event. A renewal
          // cycle is ~30 days, so if we already granted within the last 20 days
          // this is a duplicate delivery rather than a new cycle — skip it.
          const [recent] = await db
            .select({ grantedAt: clientServices.creditsGrantedAt })
            .from(clientServices)
            .where(
              and(
                eq(clientServices.clientId, client.id),
                eq(clientServices.status, 'active'),
              ),
            )
            .orderBy(desc(clientServices.creditsGrantedAt))
            .limit(1);

          const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
          const alreadyGrantedThisCycle =
            recent?.grantedAt != null && recent.grantedAt.getTime() > twentyDaysAgo.getTime();

          if (!alreadyGrantedThisCycle) {
            await grantMonthlyCredits(client.id);
          }
        }
      }

      return NextResponse.json({ received: true });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as {
        metadata?: { invoiceId?: string; serviceId?: string; clientId?: string; type?: string; tokens?: string; packageName?: string; packageId?: string };
        id: string;
        customer?: string | null;
        subscription?: string | null;
      };

      // --- Module subscription purchase ---
      if (session.metadata?.type === 'module_subscription') {
        const modClientId = parseInt(session.metadata.clientId || '0', 10);
        const modServiceId = parseInt(session.metadata.serviceId || '0', 10);

        if (modClientId && modServiceId) {
          // Persist Stripe customer ID on the client record
          if (session.customer && typeof session.customer === 'string') {
            await db
              .update(clients)
              .set({ stripeCustomerId: session.customer, updatedAt: new Date() })
              .where(eq(clients.id, modClientId));
          }

          // Upsert clientServices row — set stripeSubscriptionId from session
          const stripeSubId = (session.subscription ?? null) as string | null;
          const [existingMod] = await db
            .select()
            .from(clientServices)
            .where(
              and(
                eq(clientServices.clientId, modClientId),
                eq(clientServices.serviceId, modServiceId),
              ),
            )
            .limit(1);

          if (existingMod) {
            await db
              .update(clientServices)
              .set({
                status: 'active',
                stripeSubscriptionId: stripeSubId,
                updatedAt: new Date(),
              })
              .where(eq(clientServices.id, existingMod.id));
          } else {
            await db.insert(clientServices).values({
              clientId: modClientId,
              serviceId: modServiceId,
              status: 'active',
              stripeSubscriptionId: stripeSubId,
              startDate: new Date(),
            });
          }

          await grantMonthlyCredits(modClientId);
        }

        return NextResponse.json({ received: true });
      }

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
        // E2 — invoice paid changes outstanding + collected totals on the
        // admin dashboard; invalidate the cached fan-out.
        revalidateAdminDashboard();
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
