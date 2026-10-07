import { resolveSiteStripe } from '@/lib/stripe/site-stripe';
import { processStorePayment } from './payment-events';

export class StoreOrderActionError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

/** Provider confirmation precedes the same transactional reducer used by webhooks. */
export async function applyOrderPaymentAction(order: {
  id: number; websiteId: number; stripePaymentIntentId: string | null; paymentStatus: string;
}, action: 'cancelled' | 'refunded'): Promise<void> {
  if (action === 'cancelled' && order.paymentStatus === 'cancelled') return;
  if (action === 'refunded' && order.paymentStatus === 'refunded') return;
  if (action === 'cancelled' && ['paid', 'partially_refunded', 'refunded'].includes(order.paymentStatus)) {
    throw new StoreOrderActionError('Captured payments must be refunded before cancelling the order');
  }
  if (!order.stripePaymentIntentId) throw new StoreOrderActionError('Payment setup is incomplete; retry after reconciliation');
  const { stripe } = await resolveSiteStripe(order.websiteId);
  const metadata = { orderId: String(order.id), websiteId: String(order.websiteId) };
  if (action === 'cancelled') {
    const payment = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
    if (payment.status === 'succeeded') throw new StoreOrderActionError('Payment has been captured; refund this order instead');
    if (payment.status !== 'canceled') {
      await stripe.paymentIntents.cancel(payment.id, {}, { idempotencyKey: `store-cancel:${order.id}:${payment.id}` });
    }
    await processStorePayment({ id: `portal-cancel:${order.id}:${payment.id}`, type: 'payment_intent.canceled',
      data: { object: { id: payment.id, metadata } } }, order.websiteId);
    return;
  }
  const refund = await stripe.refunds.create({ payment_intent: order.stripePaymentIntentId },
    { idempotencyKey: `store-refund-full:${order.id}:${order.stripePaymentIntentId}` });
  if (refund.status !== 'succeeded') throw new StoreOrderActionError('Refund is awaiting provider confirmation; the webhook will reconcile it');
  const chargeId = typeof refund.charge === 'string' ? refund.charge : refund.charge?.id;
  if (!chargeId) throw new Error('Refund did not identify its charge');
  const charge = await stripe.charges.retrieve(chargeId);
  // Use the charge's cumulative refunded amount, including any earlier partial
  // refunds. A later webhook then becomes a harmless monotonic replay.
  await processStorePayment({ id: `portal-refund:${refund.id}`, type: 'charge.refunded',
    data: { object: { id: charge.id, payment_intent: order.stripePaymentIntentId,
      amount_refunded: charge.amount_refunded, metadata } } }, order.websiteId);
}
