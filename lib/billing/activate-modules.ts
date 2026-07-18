// Shared activation for module-subscription purchases (OBQA-014).
//
// Called from BOTH sides of the post-checkout race:
//   1. POST /api/portal/billing/modules/verify-session — when the buyer lands
//      back on the app with ?session_id={CHECKOUT_SESSION_ID}, so entitlements
//      exist before the quick-setup screens render.
//   2. app/api/stripe/webhook — checkout.session.completed, the backstop for
//      buyers who never return (closed tab, lost connection).
//
// Concurrency: the two callers routinely run within seconds of each other and
// client_services has no unique index on (client_id, service_id), so the bare
// SELECT-then-INSERT pattern would duplicate rows — which double-counts Stripe
// line items on the next reconcile and inflates monthly credit grants. A
// per-client advisory lock serializes activators.
// ponytail: advisory xact lock; a unique index on (client_id, service_id) is
// the DB-enforced upgrade path once legacy rows are audited/deduped.

import { db } from '@/lib/db';
import { clients, clientServices } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { grantMonthlyCredits } from '@/lib/ai-credits';

// Advisory-lock namespace for module activation (arbitrary but stable).
const ACTIVATION_LOCK_NS = 74014;
// Mirrors the invoice.paid dedupe window: a grant within the last 20 days is a
// duplicate delivery / replay, not a new billing cycle.
const GRANT_DEDUPE_MS = 20 * 24 * 60 * 60 * 1000;

export interface ActivateModulesInput {
  clientId: number;
  serviceIds: number[];
  stripeSubscriptionId: string | null;
  stripeCustomerId?: string | null;
  markTrialUsed?: boolean;
}

/**
 * Idempotently activate `client_services` rows for a completed module
 * checkout, stamp the client's Stripe customer id / trialUsedAt, and grant
 * month-one AI credits exactly once no matter how many times (or from which
 * caller) the same purchase is processed.
 */
export async function activateModuleSubscription({
  clientId,
  serviceIds,
  stripeSubscriptionId,
  stripeCustomerId,
  markTrialUsed,
}: ActivateModulesInput): Promise<{ newlyActivated: boolean; creditsGranted: boolean }> {
  if (!clientId || serviceIds.length === 0) {
    return { newlyActivated: false, creditsGranted: false };
  }

  let insertedNew = false;
  let reactivated = false;
  let shouldGrant = false;

  await db.transaction(async (tx) => {
    // Serialize concurrent activators (verify-on-return vs webhook, webhook
    // redeliveries) per client. The xact lock releases on commit/rollback.
    await tx.execute(sql`select pg_advisory_xact_lock(${ACTIVATION_LOCK_NS}, ${clientId})`);

    const clientUpdate: Record<string, unknown> = { updatedAt: new Date() };
    if (stripeCustomerId) clientUpdate.stripeCustomerId = stripeCustomerId;
    if (markTrialUsed) clientUpdate.trialUsedAt = new Date();
    if (Object.keys(clientUpdate).length > 1) {
      await tx.update(clients).set(clientUpdate).where(eq(clients.id, clientId));
    }

    for (const serviceId of serviceIds) {
      const [existing] = await tx
        .select({ id: clientServices.id, status: clientServices.status })
        .from(clientServices)
        .where(and(eq(clientServices.clientId, clientId), eq(clientServices.serviceId, serviceId)))
        .limit(1);

      if (existing) {
        if (existing.status !== 'active') reactivated = true;
        await tx
          .update(clientServices)
          .set({ status: 'active', stripeSubscriptionId, updatedAt: new Date() })
          .where(eq(clientServices.id, existing.id));
      } else {
        insertedNew = true;
        await tx.insert(clientServices).values({
          clientId,
          serviceId,
          status: 'active',
          stripeSubscriptionId,
          startDate: new Date(),
        });
      }
    }

    // Month-one credits belong to whichever caller actually flipped a service
    // on — replays (webhook redelivery, an old session_id re-verified) change
    // nothing above, so they never grant. A brand-new service always grants
    // (matches the old webhook's behavior for a second purchase); a pure
    // reactivation (cancel→resubscribe) grants only when the last stamp is
    // outside the 20-day dedupe window, i.e. effectively a new billing cycle.
    // No stamping here: grantMonthlyCredits stamps on success, so a grant that
    // fails after commit self-heals at the next invoice.paid instead of being
    // silently lost.
    if (insertedNew) {
      shouldGrant = true;
    } else if (reactivated) {
      const [recent] = await tx
        .select({ grantedAt: clientServices.creditsGrantedAt })
        .from(clientServices)
        .where(and(eq(clientServices.clientId, clientId), eq(clientServices.status, 'active')))
        .orderBy(sql`${clientServices.creditsGrantedAt} desc nulls last`)
        .limit(1);
      const recentlyGranted =
        recent?.grantedAt != null && recent.grantedAt.getTime() > Date.now() - GRANT_DEDUPE_MS;
      shouldGrant = !recentlyGranted;
    }
  });

  // Outside the transaction on purpose: grantMonthlyCredits uses the global
  // `db` handle and the pool defaults to max=1 per process — calling it inside
  // the callback would deadlock waiting for a second connection.
  if (shouldGrant) await grantMonthlyCredits(clientId);

  return { newlyActivated: insertedNew || reactivated, creditsGranted: shouldGrant };
}
