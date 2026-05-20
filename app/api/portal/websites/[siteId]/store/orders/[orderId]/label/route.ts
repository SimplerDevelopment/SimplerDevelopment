import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { orders, orderStatusHistory } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';
import { resolveProvider, CarrierProviderError } from '@/lib/shipping/providers';

type Params = { params: Promise<{ siteId: string; orderId: string }> };

async function loadOrder(userId: number, siteId: string, orderId: string) {
  const site = await resolveClientSite(userId, parseInt(siteId, 10));
  if (!site) return null;
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, parseInt(orderId, 10)), eq(orders.websiteId, site.id)))
    .limit(1);
  return order ? { order, site } : null;
}

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { siteId, orderId } = await params;
  const userId = parseInt(session.user.id, 10);
  const loaded = await loadOrder(userId, siteId, orderId);
  if (!loaded) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }
  const { order, site } = loaded;

  const body = (await req.json().catch(() => ({}))) as { rateId?: string; shipmentId?: string };
  if (!body.rateId || !body.shipmentId) {
    return NextResponse.json(
      { success: false, message: 'rateId and shipmentId are required' },
      { status: 400 },
    );
  }

  const resolved = await resolveProvider(site.id);
  if (!resolved) {
    return NextResponse.json(
      { success: false, message: 'EasyPost not configured' },
      { status: 400 },
    );
  }
  const { provider } = resolved;

  try {
    const result = await provider.buyLabel({ rateId: body.rateId, shipmentId: body.shipmentId });

    await db
      .update(orders)
      .set({
        easypostShipmentId: result.shipmentId,
        trackingNumber: result.trackingNumber,
        trackingUrl: `https://www.easypost.com/account/tracking/${result.trackingNumber}`,
        carrier: result.carrier,
        shippingMethod: `${result.carrier} ${result.service}`,
        labelUrl: result.labelUrl,
        labelCostCents: result.labelCostCents,
        labelPurchasedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    await db.insert(orderStatusHistory).values({
      orderId: order.id,
      status: 'label_purchased',
      note: `${result.carrier} ${result.service} for $${(result.labelCostCents / 100).toFixed(2)}`,
      changedBy: userId,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof CarrierProviderError) {
      return NextResponse.json(
        { success: false, message: err.message, code: err.code },
        { status: 400 },
      );
    }
    console.error('[orders/label] buyLabel failed:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to purchase label' },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { siteId, orderId } = await params;
  const userId = parseInt(session.user.id, 10);
  const loaded = await loadOrder(userId, siteId, orderId);
  if (!loaded) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }
  const { order, site } = loaded;

  if (!order.easypostShipmentId) {
    return NextResponse.json(
      { success: false, message: 'No label to refund' },
      { status: 400 },
    );
  }

  const resolved = await resolveProvider(site.id);
  if (!resolved) {
    return NextResponse.json(
      { success: false, message: 'EasyPost not configured' },
      { status: 400 },
    );
  }
  const { provider } = resolved;

  try {
    const r = await provider.refundLabel({ shipmentId: order.easypostShipmentId });

    await db
      .update(orders)
      .set({
        labelUrl: null,
        labelPurchasedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    await db.insert(orderStatusHistory).values({
      orderId: order.id,
      status: 'label_refund_requested',
      note: r.refundStatus,
      changedBy: userId,
    });

    return NextResponse.json({ success: true, data: r });
  } catch (err) {
    if (err instanceof CarrierProviderError) {
      return NextResponse.json(
        { success: false, message: err.message, code: err.code },
        { status: 400 },
      );
    }
    console.error('[orders/label] refundLabel failed:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to refund label' },
      { status: 500 },
    );
  }
}
