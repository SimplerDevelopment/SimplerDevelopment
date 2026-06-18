import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  orders, orderItems, orderStatusHistory, carts,
  products, productVariants, discountCodes,
} from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import {
  sendTransactionalEmail, getWebsiteUrls, formatCents, formatAddress, formatEmailDate, buildItemsHtml,
} from '@/lib/email/send-transactional';
import { emitEvent } from '@/lib/automation/event-bus';
import { resolveSiteStripe, SiteStripeError, type SiteStripeContext } from '@/lib/stripe/site-stripe';
import { getStripeClient } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  // `?siteId=N` is REQUIRED for BYOK (each tenant registers their own per-site URL)
  // and OPTIONAL for Connect (the platform webhook URL is shared across all connected
  // accounts and was registered before BYOK existed). When absent, we verify against
  // the platform's signing secret and then derive siteId from the event's metadata.
  const url = new URL(req.url);
  const siteIdRaw = url.searchParams.get('siteId');
  const querySiteId = siteIdRaw ? parseInt(siteIdRaw, 10) : NaN;
  const hasQuerySiteId = !!siteIdRaw && Number.isFinite(querySiteId) && querySiteId > 0;

  const body = await req.text();
  const sig = req.headers.get('stripe-signature') ?? '';

  // Pick the signing secret + Stripe client for signature verification:
  //  - With ?siteId: per-site BYOK secret OR per-site Connect (same platform secret)
  //  - Without ?siteId: platform-only path (legacy Connect URL still in Stripe dashboard)
  let ctx: SiteStripeContext | null = null;
  let signingSecret: string | null = null;
  let stripeForVerify: import('stripe').default;

  if (hasQuerySiteId) {
    try {
      ctx = await resolveSiteStripe(querySiteId);
    } catch (err) {
      if (err instanceof SiteStripeError) {
        return NextResponse.json(
          { success: false, message: err.message, code: err.code },
          { status: 400 },
        );
      }
      console.error('[stripe/webhook/ecommerce] resolveSiteStripe error:', err);
      return NextResponse.json(
        { success: false, message: 'Failed to resolve site Stripe context', code: 'resolver_error' },
        { status: 500 },
      );
    }
    signingSecret = ctx.mode === 'byok'
      ? ctx.webhookSecret
      : process.env.STRIPE_ECOMMERCE_WEBHOOK_SECRET ?? null;
    stripeForVerify = ctx.stripe;
  } else {
    // Legacy Connect path — siteId comes from event metadata after we verify.
    signingSecret = process.env.STRIPE_ECOMMERCE_WEBHOOK_SECRET ?? null;
    stripeForVerify = getStripeClient();
  }

  if (!signingSecret) {
    return NextResponse.json(
      { success: false, message: 'Webhook secret not configured', code: 'no_secret' },
      { status: 500 },
    );
  }

  // Verify signature. constructEvent is local HMAC — no network call.
  let event: import('stripe').default.Event;
  try {
    event = stripeForVerify.webhooks.constructEvent(body, sig, signingSecret);
  } catch (err) {
    const Stripe = (await import('stripe')).default;
    if (err instanceof Stripe.errors.StripeSignatureVerificationError) {
      return NextResponse.json(
        { success: false, message: 'Invalid signature', code: 'invalid_signature' },
        { status: 401 },
      );
    }
    console.error('[stripe/webhook/ecommerce] constructEvent error:', err);
    return NextResponse.json(
      { success: false, message: 'Invalid signature', code: 'invalid_signature' },
      { status: 401 },
    );
  }

  // Derive the canonical websiteId. With ?siteId we already have it; without,
  // pull it from the event object's metadata (set by the checkout route).
  let websiteId: number;
  if (hasQuerySiteId) {
    websiteId = querySiteId;
  } else {
    const eventObj = event.data.object as { metadata?: { websiteId?: string } };
    const metaWebsiteId = eventObj?.metadata?.websiteId
      ? parseInt(eventObj.metadata.websiteId, 10)
      : NaN;
    if (!Number.isFinite(metaWebsiteId) || metaWebsiteId <= 0) {
      // Not an ecommerce-related event (or missing metadata). Acknowledge so Stripe
      // doesn't retry, but skip processing.
      return NextResponse.json({ received: true, skipped: 'no_website_id' });
    }
    websiteId = metaWebsiteId;

    // Resolve context lazily for the metadata-derived siteId. If this site is in
    // BYOK mode, that's a misrouted event (BYOK tenants should be using the
    // per-site URL, not the platform URL). Acknowledge & skip — do not process.
    try {
      ctx = await resolveSiteStripe(websiteId);
    } catch (err) {
      if (err instanceof SiteStripeError) {
        console.warn('[stripe/webhook/ecommerce] resolveSiteStripe after metadata derive:', err.code);
        return NextResponse.json({ received: true, skipped: err.code });
      }
      throw err;
    }
    if (ctx.mode === 'byok') {
      console.warn('[stripe/webhook/ecommerce] event arrived on platform URL for BYOK site', websiteId);
      return NextResponse.json({ received: true, skipped: 'byok_via_platform_url' });
    }
  }

  try {
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

      // Tenancy assertion: if the PI metadata carries websiteId, it MUST
      // match the URL's siteId. Mismatch = wrong-tenant event delivery.
      const metaWebsiteId = paymentIntent.metadata?.websiteId
        ? parseInt(paymentIntent.metadata.websiteId, 10)
        : null;
      if (metaWebsiteId !== null && metaWebsiteId !== websiteId) {
        return NextResponse.json(
          { success: false, message: 'siteId mismatch', code: 'site_id_mismatch' },
          { status: 400 },
        );
      }

      // Load the order
      const [order] = await db.select().from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      if (!order) {
        console.error(`eCommerce webhook: order ${orderId} not found`);
        return NextResponse.json({ received: true });
      }

      // Secondary tenancy assertion: the loaded order must belong to the
      // siteId carried in the webhook URL.
      if (order.websiteId !== websiteId) {
        return NextResponse.json(
          { success: false, message: 'siteId mismatch', code: 'site_id_mismatch' },
          { status: 400 },
        );
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
      const urls = await getWebsiteUrls(order.websiteId);

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
          orderUrl: urls.orderUrl(order.orderNumber),
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

      // Fire-and-forget Printful auto-fulfillment
      import('@/lib/fulfillment/pod').then(({ submitPODOrder }) =>
        submitPODOrder(orderId, db).catch(err =>
          console.error('[webhook/ecommerce] submitPODOrder failed:', err)
        )
      );
    }

    if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object as {
        id: string;
        metadata?: { orderId?: string; websiteId?: string };
      };

      const orderId = paymentIntent.metadata?.orderId
        ? parseInt(paymentIntent.metadata.orderId, 10)
        : null;

      const metaWebsiteId = paymentIntent.metadata?.websiteId
        ? parseInt(paymentIntent.metadata.websiteId, 10)
        : null;
      if (metaWebsiteId !== null && metaWebsiteId !== websiteId) {
        return NextResponse.json(
          { success: false, message: 'siteId mismatch', code: 'site_id_mismatch' },
          { status: 400 },
        );
      }

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
          if (failedOrder.websiteId !== websiteId) {
            return NextResponse.json(
              { success: false, message: 'siteId mismatch', code: 'site_id_mismatch' },
              { status: 400 },
            );
          }

          const nameParts = failedOrder.customerName.split(' ');
          const failedUrls = await getWebsiteUrls(failedOrder.websiteId);

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
              orderUrl: failedUrls.orderUrl(failedOrder.orderNumber),
              retryUrl: failedUrls.orderUrl(failedOrder.orderNumber),
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
        metadata?: { orderId?: string; websiteId?: string };
      };

      const orderId = charge.metadata?.orderId
        ? parseInt(charge.metadata.orderId, 10)
        : null;

      const metaWebsiteId = charge.metadata?.websiteId
        ? parseInt(charge.metadata.websiteId, 10)
        : null;
      if (metaWebsiteId !== null && metaWebsiteId !== websiteId) {
        return NextResponse.json(
          { success: false, message: 'siteId mismatch', code: 'site_id_mismatch' },
          { status: 400 },
        );
      }

      if (orderId) {
        const [refundedOrder] = await db.select().from(orders)
          .where(eq(orders.id, orderId)).limit(1);

        if (refundedOrder) {
          if (refundedOrder.websiteId !== websiteId) {
            return NextResponse.json(
              { success: false, message: 'siteId mismatch', code: 'site_id_mismatch' },
              { status: 400 },
            );
          }

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
          const refundUrls = await getWebsiteUrls(refundedOrder.websiteId);

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
              orderUrl: refundUrls.orderUrl(refundedOrder.orderNumber),
              refundAmount: formatCents(charge.amount_refunded),
            },
          }).catch(err => console.error('[webhook] order.refunded email failed:', err));
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    console.error('[stripe/webhook/ecommerce] error:', err instanceof Error ? err.stack ?? err.message : err);
    return NextResponse.json({ error: 'webhook_error' }, { status: 400 });
  }
}
