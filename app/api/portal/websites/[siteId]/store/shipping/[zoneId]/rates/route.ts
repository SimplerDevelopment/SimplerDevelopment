import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { shippingZones, shippingRates } from '@/lib/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';

type Params = { params: Promise<{ siteId: string; zoneId: string }> };

async function resolveZone(userId: number, siteId: string, zoneId: string) {
  const site = await resolveClientSite(userId, parseInt(siteId));
  if (!site) return null;

  const [zone] = await db
    .select()
    .from(shippingZones)
    .where(and(eq(shippingZones.id, parseInt(zoneId)), eq(shippingZones.websiteId, site.id)))
    .limit(1);

  return zone || null;
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, zoneId } = await params;
  const zone = await resolveZone(parseInt(session.user.id, 10), siteId, zoneId);
  if (!zone) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const rates = await db
    .select()
    .from(shippingRates)
    .where(eq(shippingRates.zoneId, zone.id))
    .orderBy(asc(shippingRates.createdAt));

  return NextResponse.json({ success: true, data: rates });
}

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, zoneId } = await params;
  const zone = await resolveZone(parseInt(session.user.id, 10), siteId, zoneId);
  if (!zone) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { name, rateType, price, weightTiers, freeAbove, minDeliveryDays, maxDeliveryDays, active } = body;

  if (!name) {
    return NextResponse.json({ success: false, message: 'name is required' }, { status: 400 });
  }

  const [rate] = await db
    .insert(shippingRates)
    .values({
      zoneId: zone.id,
      name,
      rateType: rateType || 'flat',
      price: price != null ? parseInt(String(price)) : 0,
      weightTiers: weightTiers || null,
      freeAbove: freeAbove != null ? parseInt(String(freeAbove)) : null,
      minDeliveryDays: minDeliveryDays != null ? parseInt(String(minDeliveryDays)) : null,
      maxDeliveryDays: maxDeliveryDays != null ? parseInt(String(maxDeliveryDays)) : null,
      active: active ?? true,
    })
    .returning();

  return NextResponse.json({ success: true, data: rate }, { status: 201 });
}
