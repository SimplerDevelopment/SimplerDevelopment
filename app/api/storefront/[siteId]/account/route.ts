import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { storeCustomers } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireCustomer } from '@/lib/storefront/customer-auth';

/**
 * GET /api/storefront/[siteId]/account — Get customer profile
 * PATCH /api/storefront/[siteId]/account — Update profile
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const session = await requireCustomer(req, parseInt(siteId));
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const [customer] = await db.select()
    .from(storeCustomers)
    .where(and(eq(storeCustomers.id, session.customerId), eq(storeCustomers.websiteId, parseInt(siteId))))
    .limit(1);

  if (!customer) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  return NextResponse.json({
    success: true,
    data: {
      id: customer.id,
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
      defaultShippingAddress: customer.defaultShippingAddress,
      defaultBillingAddress: customer.defaultBillingAddress,
      addressBook: customer.addressBook,
      orderCount: customer.orderCount,
      totalSpent: customer.totalSpent,
      createdAt: customer.createdAt,
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const session = await requireCustomer(req, parseInt(siteId));
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.firstName !== undefined) updates.firstName = body.firstName;
  if (body.lastName !== undefined) updates.lastName = body.lastName;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.defaultShippingAddress !== undefined) updates.defaultShippingAddress = body.defaultShippingAddress;
  if (body.defaultBillingAddress !== undefined) updates.defaultBillingAddress = body.defaultBillingAddress;
  if (body.addressBook !== undefined) updates.addressBook = body.addressBook;

  const [updated] = await db.update(storeCustomers)
    .set(updates)
    .where(and(eq(storeCustomers.id, session.customerId), eq(storeCustomers.websiteId, parseInt(siteId))))
    .returning();

  return NextResponse.json({
    success: true,
    data: {
      id: updated.id,
      email: updated.email,
      firstName: updated.firstName,
      lastName: updated.lastName,
      phone: updated.phone,
      defaultShippingAddress: updated.defaultShippingAddress,
      defaultBillingAddress: updated.defaultBillingAddress,
      addressBook: updated.addressBook,
    },
  });
}
