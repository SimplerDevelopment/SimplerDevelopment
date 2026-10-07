import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clientWebsites, orderItems, orders } from '@/lib/db/schema';
import { buildItemsHtml, formatAddress, formatCents, formatEmailDate, getWebsiteUrls, sendTransactionalEmail } from '@/lib/email/send-transactional';

export async function sendStorePaymentNotification(payload: Record<string, unknown>): Promise<void> {
  const { orderId, websiteId, clientId, event } = payload;
  if (typeof orderId !== 'number' || typeof websiteId !== 'number' || typeof clientId !== 'number' || typeof event !== 'string') throw new Error('Invalid store notification payload');
  const [site] = await db.select().from(clientWebsites).where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
  if (!site) throw new Error('Store notification tenant mismatch');
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.websiteId, websiteId))).limit(1);
  if (!order) return;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const urls = await getWebsiteUrls(websiteId);
  const nameParts = order.customerName.split(' ');
  const result = await sendTransactionalEmail({ websiteId, event, to: order.customerEmail,
    fromName: event === 'order.confirmed' ? 'Order Confirmation' : 'Payment Update',
    idempotencyKey: typeof payload.idempotencyKey === 'string' ? payload.idempotencyKey : `store:${websiteId}:${event}:${orderId}`,
    variables: { firstName: nameParts[0] || '', lastName: nameParts.slice(1).join(' '), fullName: order.customerName,
      email: order.customerEmail, orderNumber: order.orderNumber, orderDate: formatEmailDate(order.createdAt), orderTotal: formatCents(order.total),
      subtotal: formatCents(order.subtotal), shippingTotal: formatCents(order.shippingTotal), taxTotal: formatCents(order.taxTotal), discountTotal: formatCents(order.discountTotal),
      trackingNumber: order.trackingNumber ?? '', trackingUrl: order.trackingUrl ?? '', shippingMethod: order.shippingMethod ?? '',
      estimatedDelivery: '', cancellationReason: 'Order cancelled',
      itemCount: String(items.length), itemsHtml: buildItemsHtml(items), shippingAddress: formatAddress(order.shippingAddress), billingAddress: formatAddress(order.billingAddress),
      orderUrl: urls.orderUrl(order.orderNumber), retryUrl: urls.orderUrl(order.orderNumber), refundAmount: formatCents(typeof payload.refundAmount === 'number' ? payload.refundAmount : 0) },
  });
  if (!result.success) throw new Error(result.error ?? 'Store notification failed');
}
