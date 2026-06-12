import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { invoices, clients, clientServices, users } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { addPurchasedCredits, grantMonthlyCredits } from '@/lib/ai-credits';
import { revalidateAdminDashboard } from '@/lib/admin/dashboard-cache';
import {
  sendPaymentFailedEmail,
  sendTrialWillEndEmail,
  sendSubscriptionSuspendedEmail,
} from '@/lib/billing/dunning-emails';

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

    // ── Helper: resolve the owner email for a Stripe customer ID ─────────────
    // clients.userId is the owner; fall back to the first admin/owner team
    // member. Returns null when no email can be found (don't block on email
    // failures — log and continue).
    async function resolveClientEmailForStripeCustomer(
      stripeCustomerId: string,
    ): Promise<{ email: string; companyName: string | null; clientId: number } | null> {
      const [client] = await db
        .select({ id: clients.id, company: clients.company, userId: clients.userId })
        .from(clients)
        .where(eq(clients.stripeCustomerId, stripeCustomerId))
        .limit(1);
      if (!client) return null;

      // Primary path: the client.userId is the account owner.
      const [owner] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, client.userId))
        .limit(1);

      const email = owner?.email ?? null;
      if (!email) return null;

      return { email, companyName: client.company ?? null, clientId: client.id };
    }

    // ── Helper: resolve the owner email for a Stripe subscription ID ─────────
    // Looks up via clientServices row (stripeSubscriptionId).
    async function resolveClientEmailForSubscription(
      stripeSubscriptionId: string,
    ): Promise<{ email: string; companyName: string | null; clientId: number } | null> {
      const [cs] = await db
        .select({ clientId: clientServices.clientId })
        .from(clientServices)
        .where(eq(clientServices.stripeSubscriptionId, stripeSubscriptionId))
        .limit(1);
      if (!cs) return null;

      const [client] = await db
        .select({ id: clients.id, company: clients.company, userId: clients.userId })
        .from(clients)
        .where(eq(clients.id, cs.clientId))
        .limit(1);
      if (!client) return null;

      const [owner] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, client.userId))
        .limit(1);

      const email = owner?.email ?? null;
      if (!email) return null;

      return { email, companyName: client.company ?? null, clientId: client.id };
    }

    // ── invoice.payment_failed ────────────────────────────────────────────────
    // Do NOT suspend entitlements — Stripe retries automatically and the grace
    // period is a feature. Instead: notify the client to fix their card and
    // log loudly so ops can see it.
    if (event.type === 'invoice.payment_failed') {
      const failedInvoice = event.data.object as {
        customer?: string | null;
        hosted_invoice_url?: string | null;
        attempt_count?: number | null;
        amount_due?: number | null;
      };

      console.error(
        '[stripe/webhook] invoice.payment_failed —',
        JSON.stringify({
          customer: failedInvoice.customer,
          attemptCount: failedInvoice.attempt_count,
          amountDueCents: failedInvoice.amount_due,
        }),
      );

      if (typeof failedInvoice.customer === 'string') {
        try {
          const resolved = await resolveClientEmailForStripeCustomer(failedInvoice.customer);
          if (resolved) {
            await sendPaymentFailedEmail({
              toEmail: resolved.email,
              companyName: resolved.companyName,
              invoiceUrl: failedInvoice.hosted_invoice_url ?? null,
            });
          }
        } catch (emailErr) {
          // Email failures must never cause the webhook to return 4xx — Stripe
          // would retry indefinitely. Log and swallow.
          console.error('[stripe/webhook] invoice.payment_failed — email send failed:', emailErr);
        }
      }

      return NextResponse.json({ received: true });
    }

    // ── customer.subscription.updated ────────────────────────────────────────
    // Map Stripe subscription status to clientServices rows tied to this
    // subscription. Idempotent: re-running with the same status is a no-op.
    //
    // Status mapping:
    //   'canceled' | 'unpaid' | 'incomplete_expired'  → suspend ('cancelled')
    //   'active'   | 'trialing'                        → ensure active
    //   'past_due'                                     → leave active (grace)
    //   anything else                                  → leave unchanged
    if (event.type === 'customer.subscription.updated') {
      const updatedSub = event.data.object as {
        id: string;
        status: string;
        customer?: string | null;
      };

      const SUSPEND_STATUSES = new Set(['canceled', 'unpaid', 'incomplete_expired']);
      const ACTIVATE_STATUSES = new Set(['active', 'trialing']);

      if (SUSPEND_STATUSES.has(updatedSub.status)) {
        // Suspend every clientServices row backed by this subscription.
        await db
          .update(clientServices)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(eq(clientServices.stripeSubscriptionId, updatedSub.id));

        // Notify the client (best-effort).
        try {
          const resolved = await resolveClientEmailForSubscription(updatedSub.id);
          // Only send if we found a client — resolveClientEmailForSubscription
          // returns null when the subscription is unknown (e.g. test events).
          if (resolved) {
            const reason = updatedSub.status as 'canceled' | 'unpaid' | 'incomplete_expired';
            await sendSubscriptionSuspendedEmail({
              toEmail: resolved.email,
              companyName: resolved.companyName,
              reason,
            });
          }
        } catch (emailErr) {
          console.error('[stripe/webhook] customer.subscription.updated — suspend email failed:', emailErr);
        }
      } else if (ACTIVATE_STATUSES.has(updatedSub.status)) {
        // Re-activate any rows that were previously suspended/cancelled.
        // We do NOT touch rows that are already 'active' (no-op update is
        // cheap, but a conditional keeps the audit trail cleaner).
        await db
          .update(clientServices)
          .set({ status: 'active', updatedAt: new Date() })
          .where(
            and(
              eq(clientServices.stripeSubscriptionId, updatedSub.id),
              // Only re-activate rows that were suspended; don't stomp on
              // 'pending' rows that haven't been provisioned yet.
              eq(clientServices.status, 'cancelled'),
            ),
          );
      }
      // 'past_due' → intentionally left unchanged (grace period).

      return NextResponse.json({ received: true });
    }

    // ── customer.subscription.trial_will_end ─────────────────────────────────
    // Stripe fires this 3 days before the trial ends (configurable in the
    // Stripe dashboard). Send a reminder so the client knows they'll be billed.
    if (event.type === 'customer.subscription.trial_will_end') {
      const trialSub = event.data.object as {
        id: string;
        customer?: string | null;
        trial_end?: number | null;
      };

      if (typeof trialSub.customer === 'string') {
        try {
          const resolved = await resolveClientEmailForStripeCustomer(trialSub.customer);
          if (resolved) {
            const trialEndDate = trialSub.trial_end
              ? new Date(trialSub.trial_end * 1000)
              : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

            await sendTrialWillEndEmail({
              toEmail: resolved.email,
              companyName: resolved.companyName,
              trialEndDate,
            });
          }
        } catch (emailErr) {
          console.error('[stripe/webhook] customer.subscription.trial_will_end — email send failed:', emailErr);
        }
      }

      return NextResponse.json({ received: true });
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as { id: string };
      // Mark every clientServices row backed by this Stripe subscription as
      // cancelled — a multi-module checkout writes N rows sharing one
      // subscription ID. No-op if already cleaned up or never written
      // (e.g. checkout started but never completed).
      await db
        .update(clientServices)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(clientServices.stripeSubscriptionId, subscription.id));

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
        metadata?: { invoiceId?: string; serviceId?: string; serviceIds?: string; clientId?: string; type?: string; tokens?: string; packageName?: string; packageId?: string; trial?: string };
        id: string;
        customer?: string | null;
        subscription?: string | null;
      };

      // --- Module subscription purchase (one subscription, 1..N line items) ---
      if (session.metadata?.type === 'module_subscription') {
        const modClientId = parseInt(session.metadata.clientId || '0', 10);
        // serviceIds (plural, comma-separated) is the current shape; serviceId
        // (singular) kept for sessions minted before multi-item checkout.
        const modServiceIds = (session.metadata.serviceIds ?? session.metadata.serviceId ?? '')
          .split(',')
          .map((s) => parseInt(s, 10))
          .filter((n) => Number.isFinite(n) && n > 0);

        if (modClientId && modServiceIds.length > 0) {
          // Persist Stripe customer ID; stamp trialUsedAt when this checkout
          // granted the one-per-client trial.
          const clientUpdate: Record<string, unknown> = { updatedAt: new Date() };
          if (session.customer && typeof session.customer === 'string') {
            clientUpdate.stripeCustomerId = session.customer;
          }
          if (session.metadata.trial === '1') {
            clientUpdate.trialUsedAt = new Date();
          }
          if (Object.keys(clientUpdate).length > 1) {
            await db.update(clients).set(clientUpdate).where(eq(clients.id, modClientId));
          }

          const stripeSubId = (session.subscription ?? null) as string | null;
          for (const modServiceId of modServiceIds) {
            // Upsert clientServices row — set stripeSubscriptionId from session
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
