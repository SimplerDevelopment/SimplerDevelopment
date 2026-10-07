import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { orders, storeCheckoutReservations } from '@/lib/db/schema';
import { resolveSiteStripe } from '@/lib/stripe/site-stripe';
import { releaseCheckout } from './checkout-reservations';
import { processStorePayment } from './payment-events';

/** Cancel at Stripe BEFORE returning inventory, so an old client secret cannot pay released stock. */
export async function expireCheckout(payload: Record<string, unknown>): Promise<void> {
  const orderId = payload.orderId;
  if (typeof orderId !== 'number' || typeof payload.clientId !== 'number') throw new Error('Invalid checkout expiration payload');
  const [reservation] = await db.select().from(storeCheckoutReservations).where(and(eq(storeCheckoutReservations.orderId, orderId), eq(storeCheckoutReservations.clientId, payload.clientId))).limit(1);
  if (!reservation || reservation.state !== 'reserved') return;
  if (reservation.expiresAt > new Date()) throw new Error('Reservation is not yet expired');
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.websiteId, reservation.websiteId))).limit(1);
  if (!order || order.paymentStatus === 'paid') return;
  const ctx = await resolveSiteStripe(reservation.websiteId);
  if (order.stripePaymentIntentId) {
    const payment = await ctx.stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
    // An in-flight or captured payment still owns its stock; webhook reconciles it.
    if (payment.status === 'succeeded') {
      // Recover a lost succeeded webhook rather than leave paid stock reserved
      // forever. The same transaction/outbox path makes the later webhook safe.
      await processStorePayment({ id: `reconcile:${payment.id}:succeeded`, type: 'payment_intent.succeeded', data: { object: payment } }, reservation.websiteId);
      return;
    }
    if (payment.status !== 'canceled') await ctx.stripe.paymentIntents.cancel(payment.id, {}, { idempotencyKey: `store-expire:${orderId}` });
  }
  await db.transaction(async tx => {
    const [locked] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!locked || locked.paymentStatus === 'paid') return;
    await releaseCheckout(tx, orderId);
    await tx.update(orders).set({ paymentStatus: 'cancelled', status: 'cancelled', updatedAt: new Date() }).where(eq(orders.id, orderId));
  });
}
