import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { orders, orderItems, orderStatusHistory, designs } from '@/lib/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';
import {
  sendTransactionalEmail, getWebsiteUrls, formatCents, formatAddress, formatEmailDate, buildItemsHtml,
} from '@/lib/email/send-transactional';
import { emitEvent } from '@/lib/automation/event-bus';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { resolveSiteStripe, SiteStripeError } from '@/lib/stripe/site-stripe';

type Params = { params: Promise<{ siteId: string; orderId: string }> };

async function resolveOrder(userId: number, siteId: string, orderId: string) {
  const site = await resolveClientSite(userId, parseInt(siteId));
  if (!site) return null;

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, parseInt(orderId)), eq(orders.websiteId, site.id)))
    .limit(1);

  return order || null;
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'store' });
  if (isAuthError(authResult)) return authResult.response;

  const { siteId, orderId } = await params;
  const order = await resolveOrder(parseInt(session.user.id, 10), siteId, orderId);
  if (!order) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  // Left-join designs (uuid-PK Fabric.js designs table) so the admin can
  // see the saved-design thumbnail/name inline with each order line.
  // When the design row no longer exists the join misses and design is null,
  // letting the UI render a "Design no longer available" placeholder.
  const [itemsWithDesign, history] = await Promise.all([
    db.select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      productId: orderItems.productId,
      variantId: orderItems.variantId,
      designId: orderItems.designId,
      productName: orderItems.productName,
      variantName: orderItems.variantName,
      sku: orderItems.sku,
      unitPrice: orderItems.unitPrice,
      quantity: orderItems.quantity,
      total: orderItems.total,
      createdAt: orderItems.createdAt,
      designRowId: designs.id,
      designName: designs.name,
      designThumbnailUrl: designs.thumbnailUrl,
    })
      .from(orderItems)
      .leftJoin(designs, eq(designs.id, orderItems.designId))
      .where(eq(orderItems.orderId, order.id)),
    db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, order.id)).orderBy(asc(orderStatusHistory.createdAt)),
  ]);

  const items = itemsWithDesign.map(row => ({
    id: row.id,
    orderId: row.orderId,
    productId: row.productId,
    variantId: row.variantId,
    designId: row.designId,
    productName: row.productName,
    variantName: row.variantName,
    sku: row.sku,
    unitPrice: row.unitPrice,
    quantity: row.quantity,
    total: row.total,
    // Cents-suffixed aliases — the order-detail UI reads `*Cents` fields.
    unitPriceCents: row.unitPrice,
    totalCents: row.total,
    createdAt: row.createdAt,
    // `design` resolves to null both when the order line has no designId
    // AND when the referenced design row no longer exists (left-join miss).
    // The UI renders "Design no longer available" using the row.designId hint.
    design: row.designRowId
      ? {
          id: row.designRowId,
          name: row.designName,
          thumbnailUrl: row.designThumbnailUrl,
        }
      : null,
  }));

  return NextResponse.json({
    success: true,
    data: {
      ...order,
      // Cents-suffixed aliases + plural note key — match the order-detail UI's
      // field convention (the raw columns are already in cents).
      subtotalCents: order.subtotal,
      shippingCents: order.shippingTotal,
      taxCents: order.taxTotal,
      discountCents: order.discountTotal,
      totalCents: order.total,
      internalNotes: order.internalNote,
      items,
      statusHistory: history,
    },
  });
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'store' });
  if (isAuthError(authResult)) return authResult.response;

  const { siteId, orderId } = await params;
  const order = await resolveOrder(parseInt(session.user.id, 10), siteId, orderId);
  if (!order) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();

  // Guard: refund transition must succeed in Stripe before we flip status
  if (body.status === 'refunded' && body.status !== order.status) {
    if (!order.stripePaymentIntentId) {
      return NextResponse.json(
        { success: false, message: 'This order has no Stripe payment to refund' },
        { status: 400 },
      );
    }
    try {
      const { stripe } = await resolveSiteStripe(order.websiteId);
      await stripe.refunds.create({ payment_intent: order.stripePaymentIntentId });
    } catch (err) {
      if (err instanceof SiteStripeError) {
        return NextResponse.json(
          { success: false, message: `Stripe not configured: ${err.message}` },
          { status: 400 },
        );
      }
      console.error('[orders] refund error:', err);
      return NextResponse.json(
        { success: false, message: 'Stripe refund failed — status not updated' },
        { status: 502 },
      );
    }
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (body.trackingNumber !== undefined) updateData.trackingNumber = body.trackingNumber;
  if (body.trackingUrl !== undefined) updateData.trackingUrl = body.trackingUrl;
  if (body.internalNote !== undefined) updateData.internalNote = body.internalNote;

  // Handle status change
  if (body.status !== undefined && body.status !== order.status) {
    updateData.status = body.status;

    // Set timestamps based on status
    if (body.status === 'shipped' && !order.shippedAt) {
      updateData.shippedAt = new Date();
    }
    if (body.status === 'delivered' && !order.deliveredAt) {
      updateData.deliveredAt = new Date();
    }

    // Insert status history
    await db.insert(orderStatusHistory).values({
      orderId: order.id,
      status: body.status,
      note: body.statusNote || null,
      changedBy: parseInt(session.user.id, 10),
    });
  }

  const [updated] = await db
    .update(orders)
    .set(updateData)
    .where(eq(orders.id, order.id))
    .returning();

  // Send transactional emails for status changes
  if (body.status !== undefined && body.status !== order.status) {
    const nameParts = order.customerName.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    const orderUrls = await getWebsiteUrls(order.websiteId);
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));

    const commonVars: Record<string, string> = {
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
      orderUrl: orderUrls.orderUrl(order.orderNumber),
    };

    const statusEmailMap: Record<string, { event: string; fromName: string; extraVars?: Record<string, string> }> = {
      shipped: {
        event: 'order.shipped',
        fromName: 'Shipping Update',
        extraVars: {
          trackingNumber: updated.trackingNumber || body.trackingNumber || '',
          trackingUrl: updated.trackingUrl || body.trackingUrl || '',
          shippingMethod: updated.shippingMethod || '',
          estimatedDelivery: '',
        },
      },
      delivered: { event: 'order.delivered', fromName: 'Delivery Confirmation' },
      cancelled: {
        event: 'order.cancelled',
        fromName: 'Order Update',
        extraVars: { cancellationReason: body.statusNote || 'Order cancelled' },
      },
    };

    const mapping = statusEmailMap[body.status];
    if (mapping) {
      sendTransactionalEmail({
        websiteId: order.websiteId,
        event: mapping.event,
        to: order.customerEmail,
        fromName: mapping.fromName,
        variables: { ...commonVars, ...(mapping.extraVars || {}) },
      }).catch(err => console.error(`[orders] ${mapping.event} email failed:`, err));
    }

    // Emit automation event
    emitEvent(`order.${body.status}`, order.websiteId, parseInt(session.user.id, 10), {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerEmail: order.customerEmail,
      newStatus: body.status,
      previousStatus: order.status,
    });
  }

  return NextResponse.json({ success: true, data: updated });
}
