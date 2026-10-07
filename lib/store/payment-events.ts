import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { automationJobs, carts, clientWebsites, discountCodes, internalJobs, orderItems,
  orders, orderStatusHistory, products, storePaymentEvents } from '@/lib/db/schema';
import { aggregateStock, commitCheckout, consumeCheckoutStock, releaseCheckout, refundCheckoutGift, type ReservedStock } from './checkout-reservations';

interface PaymentObject {
  id: string; payment_intent?: string | { id: string } | null;
  amount?: number; amount_received?: number; amount_refunded?: number;
  metadata?: { websiteId?: string; orderId?: string } | null;
}
export interface StorePaymentEvent { id: string; type: string; data: { object: PaymentObject } }
export class StorePaymentError extends Error {
  constructor(message: string, public code: string) { super(message); }
}

type StoreTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
interface PaymentContext {
  tx: StoreTx;
  order: typeof orders.$inferSelect;
  websiteId: number;
  clientId: number;
  paymentId: string | undefined;
}
const CAPTURED_STATUSES = ['paid', 'refunded', 'partially_refunded'];
const REFUNDED_STATUSES = ['refunded', 'partially_refunded'];
const SUPPORTED_EVENTS = ['payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.canceled', 'charge.refunded'];
const FAILURE_TRANSITIONS = {
  failed: { orderPatch: { paymentStatus: 'failed' }, historyStatus: 'payment_failed',
    historyNote: 'Payment failed', notification: 'payment.failed' },
  cancelled: { orderPatch: { paymentStatus: 'cancelled', status: 'cancelled' }, historyStatus: 'cancelled',
    historyNote: 'Payment cancelled; reservation released', notification: 'order.cancelled' },
};

async function lockPaymentContext(tx: StoreTx, event: StorePaymentEvent, websiteId: number, orderId: number): Promise<PaymentContext> {
  const [order] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.websiteId, websiteId))).for('update');
  if (!order) {
    const [foreign] = await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)).limit(1);
    if (foreign) throw new StorePaymentError('siteId mismatch', 'site_id_mismatch');
    throw new Error('Payment order not found for this store');
  }
  const object = event.data.object;
  const paymentId = event.type === 'charge.refunded'
    ? (typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id)
    : object.id;
  if (order.stripePaymentIntentId && order.stripePaymentIntentId !== paymentId) {
    throw new StorePaymentError('PaymentIntent mismatch', 'payment_intent_mismatch');
  }
  const [site] = await tx.select({ clientId: clientWebsites.clientId }).from(clientWebsites).where(eq(clientWebsites.id, websiteId)).limit(1);
  if (!site) throw new Error('Store owner not found');
  return { tx, order, websiteId, clientId: site.clientId, paymentId };
}

async function claimPaymentEvent(ctx: PaymentContext, eventId: string): Promise<boolean> {
  const claimed = await ctx.tx.insert(storePaymentEvents).values({ websiteId: ctx.websiteId, clientId: ctx.clientId, eventId })
    .onConflictDoNothing().returning({ id: storePaymentEvents.id });
  return claimed.length > 0;
}

async function consumeLegacyOrderStock(ctx: PaymentContext): Promise<void> {
  const { tx, order, websiteId } = ctx;
  // Legacy pending orders predate reservations; take stock conditionally,
  // never clamp away an oversell or decrement untracked products.
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const stock: ReservedStock[] = [];
  const requested = aggregateStock(items.filter(i => i.productId !== null)
    .map(i => ({ productId: i.productId!, variantId: i.variantId, quantity: i.quantity })));
  for (const item of requested) {
    const [product] = await tx.select().from(products).where(and(eq(products.id, item.productId), eq(products.websiteId, websiteId))).limit(1);
    if (!product) throw new Error('Order product no longer belongs to store');
    if (product.trackInventory) stock.push(item);
  }
  await consumeCheckoutStock(tx, websiteId, stock);
  if (order.discountCode) await tx.update(discountCodes).set({ usedCount: sql`${discountCodes.usedCount} + 1`, updatedAt: new Date() })
    .where(and(eq(discountCodes.websiteId, websiteId), eq(discountCodes.code, order.discountCode)));
}

async function markOrderPaid(ctx: PaymentContext): Promise<void> {
  const { tx, order, websiteId, clientId, paymentId } = ctx;
  if (!await commitCheckout(tx, order.id)) await consumeLegacyOrderStock(ctx);
  await tx.update(orders).set({ paymentStatus: 'paid', paidAt: new Date(), updatedAt: new Date(), stripePaymentIntentId: paymentId }).where(eq(orders.id, order.id));
  await tx.insert(orderStatusHistory).values({ orderId: order.id, status: 'confirmed', note: 'Payment received' });
  await tx.update(carts).set({ status: 'converted', updatedAt: new Date() })
    .where(and(eq(carts.websiteId, websiteId), eq(carts.customerEmail, order.customerEmail), eq(carts.status, 'active')));
  await tx.insert(automationJobs).values({ clientId, userId: 0, event: 'order.paid', status: 'pending',
    payload: { orderId: order.id, websiteId, orderNumber: order.orderNumber, customerEmail: order.customerEmail, customerName: order.customerName, total: order.total } });
}

async function handlePaymentSucceeded(ctx: PaymentContext, object: PaymentObject): Promise<string | null> {
  const { tx, order, clientId } = ctx;
  if ((object.amount_received ?? object.amount) !== order.total) throw new Error('Paid amount does not match order total');
  if (REFUNDED_STATUSES.includes(order.paymentStatus)) return null; // Older success cannot undo refund.
  if (order.paymentStatus !== 'paid') await markOrderPaid(ctx);
  // No early return for paid orders: repair/re-delivery can still ensure the
  // stable outbox entries exist without repeating the inventory mutation.
  await tx.insert(internalJobs).values({ clientId, type: 'pod.submit', payload: { orderId: order.id }, dedupeKey: `pod.submit:${order.id}` }).onConflictDoNothing();
  return 'order.confirmed';
}

async function handlePaymentFailure(ctx: PaymentContext, cancelled: boolean): Promise<string | null> {
  const { tx, order, websiteId, clientId } = ctx;
  if (CAPTURED_STATUSES.includes(order.paymentStatus) || order.paymentStatus === 'cancelled') return null;
  const transition = FAILURE_TRANSITIONS[cancelled ? 'cancelled' : 'failed'];
  // A failed card can retry the same PaymentIntent. Its stock stays held
  // until actual Stripe cancellation (webhook or expiration worker).
  if (cancelled) await releaseCheckout(tx, order.id);
  await tx.update(orders).set({ ...transition.orderPatch, updatedAt: new Date() }).where(eq(orders.id, order.id));
  await tx.insert(orderStatusHistory).values({ orderId: order.id, status: transition.historyStatus, note: transition.historyNote });
  if (cancelled) await tx.insert(automationJobs).values({ clientId, userId: 0, event: 'order.cancelled', status: 'pending',
    payload: { orderId: order.id, websiteId, orderNumber: order.orderNumber } });
  return transition.notification;
}

async function handlePaymentRefund(ctx: PaymentContext, object: PaymentObject): Promise<string | null> {
  const { tx, order, websiteId, clientId } = ctx;
  const amount = object.amount_refunded;
  if (!amount || amount <= order.refundedAmount) return null;
  // Refund delivery can precede the succeeded webhook. Commit its held
  // balances before refunding so no reserved credit becomes stranded.
  if (!CAPTURED_STATUSES.includes(order.paymentStatus)) await commitCheckout(tx, order.id);
  const fullyRefunded = amount >= order.total;
  await tx.update(orders).set({ paymentStatus: fullyRefunded ? 'refunded' : 'partially_refunded', ...(fullyRefunded ? { status: 'refunded' } : {}), refundedAmount: amount, updatedAt: new Date() }).where(eq(orders.id, order.id));
  if (fullyRefunded) await refundCheckoutGift(tx, order.id);
  // A refund does not mean physical goods were returned. Committed stock
  // remains consumed; cancellation only releases an uncommitted reservation.
  await tx.insert(orderStatusHistory).values({ orderId: order.id, status: 'refunded', note: `Refund cumulative amount ${amount} cents` });
  await tx.insert(automationJobs).values({ clientId, userId: 0, event: 'order.refunded', status: 'pending',
    payload: { orderId: order.id, websiteId, refundAmount: amount, orderNumber: order.orderNumber } });
  return 'order.refunded';
}

async function applyPaymentEvent(ctx: PaymentContext, event: StorePaymentEvent): Promise<string | null> {
  switch (event.type) {
    case 'payment_intent.succeeded': return handlePaymentSucceeded(ctx, event.data.object);
    case 'payment_intent.payment_failed': return handlePaymentFailure(ctx, false);
    case 'payment_intent.canceled': return handlePaymentFailure(ctx, true);
    case 'charge.refunded': return handlePaymentRefund(ctx, event.data.object);
    default: return null;
  }
}

async function enqueuePaymentNotification(ctx: PaymentContext, event: StorePaymentEvent, notification: string): Promise<void> {
  const { tx, order, websiteId, clientId } = ctx;
  const key = notification === 'order.confirmed' ? `store.confirmation:${order.id}` : `store.notification:${websiteId}:${event.id}`;
  await tx.insert(internalJobs).values({ clientId, type: 'store.payment_notification', dedupeKey: key,
    payload: { orderId: order.id, clientId, websiteId, event: notification, idempotencyKey: key, refundAmount: event.data.object.amount_refunded ?? 0 } }).onConflictDoNothing();
}

/** The event claim, order, inventory, ledger and durable side effects commit together. */
export async function processStorePayment(event: StorePaymentEvent, websiteId: number): Promise<void> {
  if (!SUPPORTED_EVENTS.includes(event.type)) return;
  const object = event.data.object;
  if (object.metadata?.websiteId && Number(object.metadata.websiteId) !== websiteId) throw new StorePaymentError('siteId mismatch', 'site_id_mismatch');
  const orderId = Number(object.metadata?.orderId);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) return;
  if (!event.id) throw new Error('Missing Stripe event ID');
  await db.transaction(async tx => {
    // Lock before claiming: concurrent deliveries serialize per order, while
    // an exception rolls the event claim back together with every side effect.
    const ctx = await lockPaymentContext(tx, event, websiteId, orderId);
    if (!await claimPaymentEvent(ctx, event.id)) return;
    const notification = await applyPaymentEvent(ctx, event);
    if (notification) await enqueuePaymentNotification(ctx, event, notification);
  });
}
