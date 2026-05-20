import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { storeSettings, shippingZones, shippingRates } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  resolveProvider,
  CarrierProviderError,
  type Address,
  type Parcel,
} from '@/lib/shipping/providers';

type RateRow = {
  id: number | string;
  name: string;
  rateType: string;
  price: number;
  freeAbove: number | null;
  minDeliveryDays: number | null;
  maxDeliveryDays: number | null;
  zoneName: string;
  provider?: string;
  carrier?: string;
  service?: string;
  shipmentId?: string;
  rateToken?: string;
};

function toPositiveNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function parseClientParcel(raw: string | null): Parcel | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    const l = toPositiveNumber((obj as Record<string, unknown>).lengthIn);
    const w = toPositiveNumber((obj as Record<string, unknown>).widthIn);
    const h = toPositiveNumber((obj as Record<string, unknown>).heightIn);
    const oz = toPositiveNumber((obj as Record<string, unknown>).weightOz);
    if (l && w && h && oz) return { lengthIn: l, widthIn: w, heightIn: h, weightOz: oz };
    return null;
  } catch {
    return null;
  }
}

function parcelFromSettings(s: typeof storeSettings.$inferSelect): Parcel | null {
  const l = toPositiveNumber(s.defaultParcelLengthIn);
  const w = toPositiveNumber(s.defaultParcelWidthIn);
  const h = toPositiveNumber(s.defaultParcelHeightIn);
  const oz = toPositiveNumber(s.defaultParcelWeightOz);
  if (l && w && h && oz) return { lengthIn: l, widthIn: w, heightIn: h, weightOz: oz };
  return null;
}

const DEFAULT_PARCEL: Parcel = { lengthIn: 6, widthIn: 4, heightIn: 2, weightOz: 8 };

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
    const postalCode = url.searchParams.get('postalCode');
    const parcelParam = url.searchParams.get('parcel');

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

    // Collect all rate rows in matching zones for both manual emission and
    // for use as live-rate carrier/service filters.
    const zoneRowsByZoneId = new Map<number, typeof shippingRates.$inferSelect[]>();
    for (const zoneId of matchingZoneIds) {
      const zoneRates = await db.select().from(shippingRates)
        .where(and(
          eq(shippingRates.zoneId, zoneId),
          eq(shippingRates.active, true),
        ));
      zoneRowsByZoneId.set(zoneId, zoneRates);
    }

    // Manual rates: every active row in a matching zone EXCEPT live-rate-only rows.
    const manualRates: RateRow[] = [];
    for (const zoneId of matchingZoneIds) {
      const zone = zones.find(z => z.id === zoneId)!;
      const zoneRates = zoneRowsByZoneId.get(zoneId) ?? [];
      for (const rate of zoneRates) {
        if (rate.liveRateOnly) continue;
        manualRates.push({
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

    // Live rates (EasyPost) — only when configured, ship-from address present, and postalCode given.
    let liveRates: RateRow[] = [];
    const wantsLive =
      store.shippingProvider === 'easypost' &&
      store.shipFromAddress != null &&
      !!postalCode;

    if (wantsLive) {
      try {
        const resolved = await resolveProvider(websiteId);
        if (resolved) {
          // Derive carrier/service filters from live-rate-only rows in matching zones.
          const carriers = new Set<string>();
          const services = new Set<string>();
          for (const zoneId of matchingZoneIds) {
            const zoneRates = zoneRowsByZoneId.get(zoneId) ?? [];
            for (const r of zoneRates) {
              if (!r.liveRateOnly) continue;
              if (r.carrierCode) carriers.add(r.carrierCode);
              if (r.serviceCode) services.add(r.serviceCode);
            }
          }
          const carrierFilter = carriers.size > 0 ? Array.from(carriers) : undefined;
          const serviceFilter = services.size > 0 ? Array.from(services) : undefined;

          // Effective parcel: client → settings → small-box default.
          const parcel: Parcel =
            parseClientParcel(parcelParam) ??
            parcelFromSettings(store) ??
            DEFAULT_PARCEL;

          const from = store.shipFromAddress as Address;
          const to: Address = {
            line1: '',
            line2: '',
            city: '',
            state: state ?? '',
            postalCode: postalCode!,
            country,
            phone: '',
          };

          const { shipmentId, rates: quotes } = await resolved.provider.getRates({
            from,
            to,
            parcel,
            carrierFilter,
            serviceFilter,
          });

          liveRates = quotes.map((r) => ({
            id: `live:${r.id}`,
            name: `${r.carrier} ${r.service}`,
            rateType: 'live',
            price: r.amountCents,
            freeAbove: null,
            minDeliveryDays: r.estDeliveryDays,
            maxDeliveryDays: r.estDeliveryDays,
            zoneName: 'Live carrier rate',
            provider: 'easypost',
            carrier: r.carrier,
            service: r.service,
            shipmentId: shipmentId,
            rateToken: r.id,
          }));
        }
      } catch (err) {
        if (err instanceof CarrierProviderError) {
          if (store.liveRatesFallback === false) {
            return NextResponse.json(
              { success: false, message: 'Live shipping rates unavailable' },
              { status: 502 },
            );
          }
          console.warn('[storefront shipping] live rates failed', err.code, err.message);
        } else {
          throw err;
        }
      }
    }

    return NextResponse.json({ success: true, data: [...manualRates, ...liveRates] });
  } catch (err) {
    console.error('Storefront shipping error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
