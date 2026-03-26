import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { shippingZones, shippingRates } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';

type Params = { params: Promise<{ siteId: string; zoneId: string; rateId: string }> };

async function resolveRate(userId: number, siteId: string, zoneId: string, rateId: string) {
  const site = await resolveClientSite(userId, parseInt(siteId));
  if (!site) return null;

  const [zone] = await db
    .select()
    .from(shippingZones)
    .where(and(eq(shippingZones.id, parseInt(zoneId)), eq(shippingZones.websiteId, site.id)))
    .limit(1);
  if (!zone) return null;

  const [rate] = await db
    .select()
    .from(shippingRates)
    .where(and(eq(shippingRates.id, parseInt(rateId)), eq(shippingRates.zoneId, zone.id)))
    .limit(1);

  return rate || null;
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, zoneId, rateId } = await params;
  const rate = await resolveRate(parseInt(session.user.id, 10), siteId, zoneId, rateId);
  if (!rate) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const updateData: Record<string, unknown> = {};

  if (body.name !== undefined) updateData.name = body.name;
  if (body.rateType !== undefined) updateData.rateType = body.rateType;
  if (body.price !== undefined) updateData.price = parseInt(String(body.price));
  if (body.weightTiers !== undefined) updateData.weightTiers = body.weightTiers;
  if (body.freeAbove !== undefined) updateData.freeAbove = body.freeAbove != null ? parseInt(String(body.freeAbove)) : null;
  if (body.minDeliveryDays !== undefined) updateData.minDeliveryDays = body.minDeliveryDays != null ? parseInt(String(body.minDeliveryDays)) : null;
  if (body.maxDeliveryDays !== undefined) updateData.maxDeliveryDays = body.maxDeliveryDays != null ? parseInt(String(body.maxDeliveryDays)) : null;
  if (body.active !== undefined) updateData.active = body.active;

  const [updated] = await db
    .update(shippingRates)
    .set(updateData)
    .where(eq(shippingRates.id, rate.id))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, zoneId, rateId } = await params;
  const rate = await resolveRate(parseInt(session.user.id, 10), siteId, zoneId, rateId);
  if (!rate) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  await db.delete(shippingRates).where(eq(shippingRates.id, rate.id));

  return NextResponse.json({ success: true, message: 'Shipping rate deleted' });
}
