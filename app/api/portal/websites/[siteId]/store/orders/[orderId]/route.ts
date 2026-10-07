import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { orders, orderItems, orderStatusHistory, productDesigns, clientWebsites, automationJobs, internalJobs } from '@/lib/db/schema';
import { and, eq, asc, sql } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { applyOrderPaymentAction, StoreOrderActionError } from '@/lib/store/order-payment-actions';

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

  // Left-join productDesigns so the admin sees the saved-design thumbnail/name
  // inline with each order line. orderItems.designId is a pg uuid holding
  // productDesigns.uuid (the share-link key), so the join casts to text —
  // without it Postgres raises `operator does not exist: character varying = uuid`.
  // When the design no longer exists the join misses and design is null, letting
  // the UI render a "Design no longer available" placeholder.
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
      designRowId: productDesigns.id,
      designName: productDesigns.name,
      designThumbnailUrl: productDesigns.thumbnailUrl,
    })
      .from(orderItems)
      .leftJoin(productDesigns, and(sql`${productDesigns.uuid} = ${orderItems.designId}::text`, eq(productDesigns.websiteId, order.websiteId)))
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
  const statuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
  if (body.status !== undefined && !statuses.includes(body.status)) {
    return NextResponse.json({ success: false, message: 'Invalid order status' }, { status: 400 });
  }
  try {
    if (body.status === 'cancelled' || body.status === 'refunded') await applyOrderPaymentAction(order, body.status);
    const updated = await db.transaction(async tx => {
      const [locked] = await tx.select().from(orders).where(and(eq(orders.id, order.id), eq(orders.websiteId, order.websiteId))).for('update');
      if (!locked) throw new Error('Order disappeared');
      const [site] = await tx.select({ clientId: clientWebsites.clientId }).from(clientWebsites).where(eq(clientWebsites.id, order.websiteId)).limit(1);
      if (!site) throw new Error('Order owner disappeared');
      const changed = body.status !== undefined && body.status !== locked.status;
      if (changed && ['cancelled', 'refunded'].includes(locked.status)) throw new StoreOrderActionError('Terminal orders cannot be reopened');
      if (changed && ['processing', 'shipped', 'delivered'].includes(body.status) && locked.paymentStatus !== 'paid') {
        throw new StoreOrderActionError('Payment must be captured before fulfilment');
      }
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (body.trackingNumber !== undefined) updateData.trackingNumber = body.trackingNumber;
      if (body.trackingUrl !== undefined) updateData.trackingUrl = body.trackingUrl;
      if (body.internalNote !== undefined) updateData.internalNote = body.internalNote;
      if (changed) {
        updateData.status = body.status;
        if (body.status === 'shipped' && !locked.shippedAt) updateData.shippedAt = new Date();
        if (body.status === 'delivered' && !locked.deliveredAt) updateData.deliveredAt = new Date();
        const [history] = await tx.insert(orderStatusHistory).values({ orderId: order.id, status: body.status,
          note: body.statusNote || null, changedBy: parseInt(session.user.id, 10) }).returning({ id: orderStatusHistory.id });
        await tx.insert(automationJobs).values({ clientId: site.clientId, userId: parseInt(session.user.id, 10),
          event: `order.${body.status}`, status: 'pending', payload: { orderId: order.id, websiteId: order.websiteId,
            orderNumber: order.orderNumber, customerEmail: order.customerEmail, newStatus: body.status, previousStatus: locked.status } });
        if (['shipped', 'delivered'].includes(body.status)) {
          const key = `store.status:${order.id}:${history.id}`;
          await tx.insert(internalJobs).values({ clientId: site.clientId, type: 'store.payment_notification', dedupeKey: key,
            payload: { orderId: order.id, websiteId: order.websiteId, clientId: site.clientId,
              event: `order.${body.status}`, idempotencyKey: key } });
        }
      }
      const [result] = await tx.update(orders).set(updateData).where(eq(orders.id, order.id)).returning();
      return result;
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof StoreOrderActionError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    console.error('[orders] transition failed:', error);
    return NextResponse.json({ success: false, message: 'Order transition failed; retry to reconcile provider confirmation' }, { status: 502 });
  }
}
