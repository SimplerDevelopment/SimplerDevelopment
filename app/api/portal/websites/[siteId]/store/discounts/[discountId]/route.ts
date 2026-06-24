import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { discountCodes } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolveStoreSite } from '@/lib/portal-auth';

type Params = { params: Promise<{ siteId: string; discountId: string }> };

async function resolveDiscount(userId: number, siteId: string, discountId: string) {
  const site = await resolveStoreSite(userId, parseInt(siteId));
  if (!site) return null;

  const [discount] = await db
    .select()
    .from(discountCodes)
    .where(and(eq(discountCodes.id, parseInt(discountId)), eq(discountCodes.websiteId, site.id)))
    .limit(1);

  return discount || null;
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, discountId } = await params;
  const discount = await resolveDiscount(parseInt(session.user.id, 10), siteId, discountId);
  if (!discount) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (body.code !== undefined) updateData.code = body.code.toUpperCase();
  if (body.description !== undefined) updateData.description = body.description;
  if (body.discountType !== undefined) updateData.discountType = body.discountType;
  if (body.amount !== undefined) updateData.amount = parseInt(String(body.amount));
  if (body.minOrderAmount !== undefined) updateData.minOrderAmount = body.minOrderAmount != null ? parseInt(String(body.minOrderAmount)) : null;
  if (body.maxUses !== undefined) updateData.maxUses = body.maxUses != null ? parseInt(String(body.maxUses)) : null;
  if (body.startsAt !== undefined) updateData.startsAt = body.startsAt ? new Date(body.startsAt) : null;
  if (body.expiresAt !== undefined) updateData.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (body.active !== undefined) updateData.active = body.active;
  if (body.applicableTo !== undefined) updateData.applicableTo = body.applicableTo;

  // Check code uniqueness if code is being updated
  if (body.code && body.code.toUpperCase() !== discount.code) {
    const site = await resolveStoreSite(parseInt(session.user.id, 10), parseInt(siteId));
    if (site) {
      const [existing] = await db
        .select({ id: discountCodes.id })
        .from(discountCodes)
        .where(and(eq(discountCodes.websiteId, site.id), eq(discountCodes.code, body.code.toUpperCase())))
        .limit(1);
      if (existing) {
        return NextResponse.json({ success: false, message: 'A discount with this code already exists' }, { status: 409 });
      }
    }
  }

  const [updated] = await db
    .update(discountCodes)
    .set(updateData)
    .where(eq(discountCodes.id, discount.id))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, discountId } = await params;
  const discount = await resolveDiscount(parseInt(session.user.id, 10), siteId, discountId);
  if (!discount) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  await db.delete(discountCodes).where(eq(discountCodes.id, discount.id));

  return NextResponse.json({ success: true, message: 'Discount code deleted' });
}
