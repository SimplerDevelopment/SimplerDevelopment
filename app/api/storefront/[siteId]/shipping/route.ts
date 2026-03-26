import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { storeSettings, shippingZones, shippingRates } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params;
    const websiteId = parseInt(siteId, 10);
    if (isNaN(websiteId)) {
      return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });
    }

    // Verify store is enabled
    const [store] = await db.select().from(storeSettings)
      .where(and(eq(storeSettings.websiteId, websiteId), eq(storeSettings.enabled, true)))
      .limit(1);

    if (!store) {
      return NextResponse.json({ success: false, message: 'Store not found' }, { status: 404 });
    }

    const url = new URL(req.url);
    const country = url.searchParams.get('country');
    const state = url.searchParams.get('state');

    if (!country) {
      return NextResponse.json({ success: false, message: 'country parameter is required' }, { status: 400 });
    }

    // Find matching shipping zones
    const zones = await db.select().from(shippingZones)
      .where(and(
        eq(shippingZones.websiteId, websiteId),
        eq(shippingZones.active, true),
      ));

    const matchingZoneIds: number[] = [];

    for (const zone of zones) {
      const countries = (zone.countries as string[]) || [];
      const states = (zone.states as string[]) || [];

      // Match if zone has no countries (worldwide) or country is included
      const countryMatch = countries.length === 0 || countries.includes(country);
      // Match if zone has no states filter or state is included
      const stateMatch = !state || states.length === 0 || states.includes(state);

      if (countryMatch && stateMatch) {
        matchingZoneIds.push(zone.id);
      }
    }

    if (matchingZoneIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Fetch active rates for matching zones
    const rates: {
      id: number;
      name: string;
      rateType: string;
      price: number;
      freeAbove: number | null;
      minDeliveryDays: number | null;
      maxDeliveryDays: number | null;
      zoneName: string;
    }[] = [];

    for (const zoneId of matchingZoneIds) {
      const zone = zones.find(z => z.id === zoneId)!;
      const zoneRates = await db.select().from(shippingRates)
        .where(and(
          eq(shippingRates.zoneId, zoneId),
          eq(shippingRates.active, true),
        ));

      for (const rate of zoneRates) {
        rates.push({
          id: rate.id,
          name: rate.name,
          rateType: rate.rateType,
          price: rate.price,
          freeAbove: rate.freeAbove,
          minDeliveryDays: rate.minDeliveryDays,
          maxDeliveryDays: rate.maxDeliveryDays,
          zoneName: zone.name,
        });
      }
    }

    return NextResponse.json({ success: true, data: rates });
  } catch (err) {
    console.error('Storefront shipping error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
