import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  orders, orderItems, orderStatusHistory, carts,
  products, productVariants, discountCodes,
} from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import {
  sendTransactionalEmail, formatCents, formatAddress, formatEmailDate, buildItemsHtml,
} from '@/lib/email/send-transactional';
import { emitEvent } from '@/lib/automation/event-bus';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_ECOMMERCE_WEBHOOK_SECRET;

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
          orderId?: string;
          orderNumber?: string;
          websiteId?: string;
        };
      };

      const orderId = paymentIntent.metadata?.orderId
        ? parseInt(paymentIntent.metadata.orderId, 10)
        : null;

      if (!orderId) {
        // Not an eCommerce payment, skip
        return NextResponse.json({ received: true });
      }

      // Load the order
      const [order] = await db.select().from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      if (!order) {
        console.error(`eCommerce webhook: order ${orderId} not found`);
        return NextResponse.json({ received: true });
      }

      // Update order payment status
      await db.update(orders).set({
        paymentStatus: 'paid',
        paidAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(orders.id, orderId));

      // Insert order status history
      await db.insert(orderStatusHistory).values({
        orderId,
        status: 'confirmed',
        note: 'Payment received',
      });

      // Decrement inventory for each order item
      const items = await db.select().from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      for (const item of items) {
        if (item.variantId) {
          await db.update(productVariants).set({
            quantity: sql`GREATEST(${productVariants.quantity} - ${item.quantity}, 0)`,
            updatedAt: new Date(),
          }).where(eq(productVariants.id, item.variantId));
        }

        if (item.productId) {
          await db.update(products).set({
            quantity: sql`GREATEST(${products.quantity} - ${item.quantity}, 0)`,
            updatedAt: new Date(),
          }).where(eq(products.id, item.productId));
        }
      }

      // Mark cart as converted
      // Find the cart by matching websiteId + order email (sessionId not stored on order)
      await db.update(carts).set({
        status: 'converted',
        updatedAt: new Date(),
      }).where(and(
        eq(carts.websiteId, order.websiteId),
        eq(carts.customerEmail, order.customerEmail),
        eq(carts.status, 'active'),
      ));

      // Increment discount code usage if applicable
      if (order.discountCode) {
        await db.update(discountCodes).set({
          usedCount: sql`${discountCodes.usedCount} + 1`,
          updatedAt: new Date(),
        }).where(and(
          eq(discountCodes.websiteId, order.websiteId),
          eq(discountCodes.code, order.discountCode),
        ));
      }

      // Send order confirmation email
      const nameParts = order.customerName.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      const baseUrl = process.env.NEXTAUTH_URL || 'https://simplerdevelopment.com';

      sendTransactionalEmail({
        websiteId: order.websiteId,
        event: 'order.confirmed',
        to: order.customerEmail,
        fromName: 'Order Confirmation',
        variables: {
          firstName,
          lastName,
          fullName: order.customerName,
          email: order.customerEmail,
          orderNumber: order.orderNumber,
          orderDate: formatEmailDate(order.createdAt),
          orderTotal: formatCents(order.total),
          subtotal: formatCents(order.subtotal),
          shippingTotal: formatCents(order.shippingTotal),
          taxTotal: formatCents(order.taxTotal),
          discountTotal: formatCents(order.discountTotal),
          itemCount: String(items.length),
          itemsHtml: buildItemsHtml(items),
          shippingAddress: formatAddress(order.shippingAddress),
          billingAddress: formatAddress(order.billingAddress),
          orderUrl: `${baseUrl}/store/orders/${order.orderNumber}`,
        },
      }).catch(err => console.error('[webhook] order.confirmed email failed:', err));

      // Emit automation event
      emitEvent('order.paid', order.websiteId, 0, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerEmail: order.customerEmail,
        customerName: order.customerName,
        total: order.total,
      });
    }

    if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object as {
        id: string;
        metadata?: { orderId?: string };
      };

      const orderId = paymentIntent.metadata?.orderId
        ? parseInt(paymentIntent.metadata.orderId, 10)
        : null;

      if (orderId) {
        await db.update(orders).set({
          paymentStatus: 'failed',
          updatedAt: new Date(),
        }).where(eq(orders.id, orderId));

        await db.insert(orderStatusHistory).values({
          orderId,
          status: 'payment_failed',
          note: 'Payment failed',
        });

        // Send payment failed email
        const [failedOrder] = await db.select().from(orders)
          .where(eq(orders.id, orderId)).limit(1);

        if (failedOrder) {
          const nameParts = failedOrder.customerName.split(' ');
          const baseUrl = process.env.NEXTAUTH_URL || 'https://simplerdevelopment.com';

          sendTransactionalEmail({
            websiteId: failedOrder.websiteId,
            event: 'payment.failed',
            to: failedOrder.customerEmail,
            fromName: 'Payment Update',
            variables: {
              firstName: nameParts[0] || '',
              lastName: nameParts.slice(1).join(' ') || '',
              fullName: failedOrder.customerName,
              email: failedOrder.customerEmail,
              orderNumber: failedOrder.orderNumber,
              orderDate: formatEmailDate(failedOrder.createdAt),
              orderTotal: formatCents(failedOrder.total),
              subtotal: formatCents(failedOrder.subtotal),
              shippingTotal: formatCents(failedOrder.shippingTotal),
              taxTotal: formatCents(failedOrder.taxTotal),
              discountTotal: formatCents(failedOrder.discountTotal),
              itemCount: '0',
              itemsHtml: '',
              shippingAddress: formatAddress(failedOrder.shippingAddress),
              billingAddress: formatAddress(failedOrder.billingAddress),
              orderUrl: `${baseUrl}/store/orders/${failedOrder.orderNumber}`,
              retryUrl: `${baseUrl}/store/checkout/retry?order=${failedOrder.orderNumber}`,
            },
          }).catch(err => console.error('[webhook] payment.failed email failed:', err));
        }
      }
    }

    if (event.type === 'charge.refunded') {
      const charge = event.data.object as {
        id: string;
        payment_intent?: string;
        amount_refunded: number;
        metadata?: { orderId?: string };
      };

      const orderId = charge.metadata?.orderId
        ? parseInt(charge.metadata.orderId, 10)
        : null;

      if (orderId) {
        const [refundedOrder] = await db.select().from(orders)
          .where(eq(orders.id, orderId)).limit(1);

        if (refundedOrder) {
          await db.update(orders).set({
            paymentStatus: 'refunded',
            updatedAt: new Date(),
          }).where(eq(orders.id, orderId));

          await db.insert(orderStatusHistory).values({
            orderId,
            status: 'refunded',
            note: `Refund of ${formatCents(charge.amount_refunded)} issued`,
          });

          const nameParts = refundedOrder.customerName.split(' ');
          const baseUrl = process.env.NEXTAUTH_URL || 'https://simplerdevelopment.com';

          sendTransactionalEmail({
            websiteId: refundedOrder.websiteId,
            event: 'order.refunded',
            to: refundedOrder.customerEmail,
            fromName: 'Refund Confirmation',
            variables: {
              firstName: nameParts[0] || '',
              lastName: nameParts.slice(1).join(' ') || '',
              fullName: refundedOrder.customerName,
              email: refundedOrder.customerEmail,
              orderNumber: refundedOrder.orderNumber,
              orderDate: formatEmailDate(refundedOrder.createdAt),
              orderTotal: formatCents(refundedOrder.total),
              subtotal: formatCents(refundedOrder.subtotal),
              shippingTotal: formatCents(refundedOrder.shippingTotal),
              taxTotal: formatCents(refundedOrder.taxTotal),
              discountTotal: formatCents(refundedOrder.discountTotal),
              itemCount: '0',
              itemsHtml: '',
              shippingAddress: formatAddress(refundedOrder.shippingAddress),
              billingAddress: formatAddress(refundedOrder.billingAddress),
              orderUrl: `${baseUrl}/store/orders/${refundedOrder.orderNumber}`,
              refundAmount: formatCents(charge.amount_refunded),
            },
          }).catch(err => console.error('[webhook] order.refunded email failed:', err));
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Webhook error';
    console.error('eCommerce webhook error:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
