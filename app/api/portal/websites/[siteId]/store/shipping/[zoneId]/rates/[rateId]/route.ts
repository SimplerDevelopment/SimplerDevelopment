import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { shippingZones, shippingRates } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolveStoreSite } from '@/lib/portal-auth';

type Params = { params: Promise<{ siteId: string; zoneId: string; rateId: string }> };

async function resolveRate(userId: number, siteId: string, zoneId: string, rateId: string) {
  const site = await resolveStoreSite(userId, parseInt(siteId));
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

  // Effective liveRateOnly after this PUT — fall back to the persisted value when not supplied.
  const effectiveLive =
    body.liveRateOnly !== undefined ? body.liveRateOnly === true : rate.liveRateOnly === true;

  if (body.provider !== undefined) {
    if (body.provider !== 'manual' && body.provider !== 'easypost') {
      return NextResponse.json(
        { success: false, message: "provider must be 'manual' or 'easypost'" },
        { status: 400 },
      );
    }
    updateData.provider = body.provider;
  }

  if (body.liveRateOnly !== undefined) updateData.liveRateOnly = body.liveRateOnly === true;

  if (body.carrierCode !== undefined) {
    updateData.carrierCode =
      body.carrierCode == null || body.carrierCode === '' ? null : String(body.carrierCode);
  }
  if (body.serviceCode !== undefined) {
    updateData.serviceCode =
      body.serviceCode == null || body.serviceCode === '' ? null : String(body.serviceCode);
  }

  if (body.name !== undefined) updateData.name = body.name;

  if (body.rateType !== undefined) {
    if (effectiveLive) {
      // Live filter row — allow 'live' (and any value) since the manual enum doesn't apply.
      updateData.rateType = body.rateType;
    } else {
      const allowed = ['flat', 'weight_based', 'price_based', 'free'];
      if (!allowed.includes(body.rateType)) {
        return NextResponse.json(
          { success: false, message: `rateType must be one of ${allowed.join(', ')}` },
          { status: 400 },
        );
      }
      updateData.rateType = body.rateType;
    }
  }

  if (body.price !== undefined) {
    if (effectiveLive) {
      updateData.price = 0;
    } else {
      const priceNum = parseInt(String(body.price));
      if (isNaN(priceNum) || priceNum < 0) {
        return NextResponse.json({ success: false, message: 'price must be >= 0' }, { status: 400 });
      }
      updateData.price = priceNum;
    }
  }

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
