import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { resolveClientSite } from '@/lib/portal-client';
import { resolveProvider, CarrierProviderError } from '@/lib/shipping/providers';
import type { Address } from '@/lib/shipping/providers';

/**
 * Connection test for the configured EasyPost provider on this site.
 *
 * Posts a tiny synthetic shipment (8 oz, 6×4×2 in) from the configured
 * ship-from address to a fixed San Francisco destination and asks EasyPost
 * to quote rates. Surfaces the rate count + 5 sample rates so the operator
 * can confirm credentials + carriers + ship-from + parcel defaults are all
 * wired correctly before the storefront starts billing real customers.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const resolved = await resolveProvider(site.id);
  if (!resolved) {
    return NextResponse.json(
      { success: false, message: 'EasyPost not configured' },
      { status: 400 },
    );
  }
  const { provider, settings } = resolved;
  if (!settings.shipFromAddress) {
    return NextResponse.json(
      { success: false, message: 'Ship-from address required' },
      { status: 400 },
    );
  }

  try {
    const { rates } = await provider.getRates({
      from: settings.shipFromAddress as Address,
      to: {
        line1: '388 Townsend St',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94107',
        country: 'US',
      },
      parcel: { lengthIn: 6, widthIn: 4, heightIn: 2, weightOz: 8 },
    });
    return NextResponse.json({
      success: true,
      data: {
        rateCount: rates.length,
        sampleRates: rates.slice(0, 5).map((r) => ({
          carrier: r.carrier,
          service: r.service,
          amountCents: r.amountCents,
          estDeliveryDays: r.estDeliveryDays,
        })),
      },
    });
  } catch (err) {
    if (err instanceof CarrierProviderError) {
      return NextResponse.json(
        { success: false, message: err.message, code: err.code },
        { status: 400 },
      );
    }
    throw err;
  }
}
