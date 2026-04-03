import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { orders, orderItems } from '@/lib/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { requireCustomer } from '@/lib/storefront/customer-auth';

/**
 * GET /api/storefront/[siteId]/account/orders — List customer's orders
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const websiteId = parseInt(siteId);
  const session = await requireCustomer(req, websiteId);
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const customerOrders = await db.select()
    .from(orders)
    .where(and(
      eq(orders.websiteId, websiteId),
      eq(orders.customerEmail, session.email),
    ))
    .orderBy(desc(orders.createdAt));

  return NextResponse.json({ success: true, data: customerOrders });
}
