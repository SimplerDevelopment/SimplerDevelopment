import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  orders, orderItems, orderStatusHistory, carts,
  products, productVariants, discountCodes,
} from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';

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
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Webhook error';
    console.error('eCommerce webhook error:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
