import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { orders } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';
import { submitPODOrder } from '@/lib/fulfillment/pod';

export const runtime = 'nodejs';

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

export async function POST(_req: Request, { params }: Params) {
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
  const { order } = loaded;

  if (order.printfulOrderId) {
    return NextResponse.json(
      { success: false, message: 'Order already submitted to Printful' },
      { status: 409 },
    );
  }

  try {
    await submitPODOrder(order.id, db);

    const [updated] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, order.id))
      .limit(1);

    return NextResponse.json({
      success: true,
      data: {
        printfulOrderId: updated.printfulOrderId,
        printfulFulfillmentStatus: updated.printfulFulfillmentStatus,
      },
    });
  } catch (err) {
    console.error('[orders/printful/submit] submitPODOrder failed:', err);
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : 'Failed to submit order to Printful' },
      { status: 500 },
    );
  }
}
