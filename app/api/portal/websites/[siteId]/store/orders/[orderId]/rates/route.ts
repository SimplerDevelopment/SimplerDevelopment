import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { orders, orderItems, products, productVariants } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';
import {
  resolveProvider,
  CarrierProviderError,
  type Address,
  type Parcel,
} from '@/lib/shipping/providers';

type Params = { params: Promise<{ siteId: string; orderId: string }> };

function toPositiveNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function toOunces(weight: number, unit: string | null | undefined): number {
  const u = (unit ?? 'g').toLowerCase();
  switch (u) {
    case 'g':
      return weight * 0.0353;
    case 'kg':
      return weight * 35.274;
    case 'oz':
      return weight;
    case 'lb':
      return weight * 16;
    default:
      // Unknown unit — treat as grams (the schema default).
      return weight * 0.0353;
  }
}

export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { siteId, orderId } = await params;
  const userId = parseInt(session.user.id, 10);
  const site = await resolveClientSite(userId, parseInt(siteId, 10));
  if (!site) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, parseInt(orderId, 10)), eq(orders.websiteId, site.id)))
    .limit(1);

  if (!order) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  // Load order items + joined product/variant dimensions
  const itemRows = await db
    .select({
      itemId: orderItems.id,
      quantity: orderItems.quantity,
      productWeight: products.weight,
      productWeightUnit: products.weightUnit,
      productLength: products.lengthIn,
      productWidth: products.widthIn,
      productHeight: products.heightIn,
      variantWeight: productVariants.weight,
      variantLength: productVariants.lengthIn,
      variantWidth: productVariants.widthIn,
      variantHeight: productVariants.heightIn,
    })
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .leftJoin(productVariants, eq(orderItems.variantId, productVariants.id))
    .where(eq(orderItems.orderId, order.id));

  // Resolve provider + settings
  const resolved = await resolveProvider(site.id);
  if (!resolved) {
    return NextResponse.json(
      { success: false, message: 'EasyPost not configured' },
      { status: 400 },
    );
  }
  const { provider, settings } = resolved;

  // Compute parcel weight (oz). Fall back to store defaults if any item lacks weight.
  let weightOz = 0;
  let weightMissing = false;
  for (const row of itemRows) {
    const rawWeight = toPositiveNumber(row.variantWeight) ?? toPositiveNumber(row.productWeight);
    if (rawWeight == null) {
      weightMissing = true;
      break;
    }
    const qty = row.quantity ?? 1;
    weightOz += toOunces(rawWeight, row.productWeightUnit) * qty;
  }
  if (weightMissing || weightOz <= 0) {
    const fallback = toPositiveNumber(settings.defaultParcelWeightOz);
    if (fallback == null) {
      return NextResponse.json(
        {
          success: false,
          code: 'no_weight',
          message:
            'Order items are missing weight and no default parcel weight is configured in store settings.',
        },
        { status: 400 },
      );
    }
    weightOz = fallback;
  }

  // Compute parcel dimensions — take the max of (variant ?? product) lengthIn/widthIn/heightIn across items.
  let lengthIn: number | null = null;
  let widthIn: number | null = null;
  let heightIn: number | null = null;
  for (const row of itemRows) {
    const l = toPositiveNumber(row.variantLength) ?? toPositiveNumber(row.productLength);
    const w = toPositiveNumber(row.variantWidth) ?? toPositiveNumber(row.productWidth);
    const h = toPositiveNumber(row.variantHeight) ?? toPositiveNumber(row.productHeight);
    if (l != null) lengthIn = lengthIn == null ? l : Math.max(lengthIn, l);
    if (w != null) widthIn = widthIn == null ? w : Math.max(widthIn, w);
    if (h != null) heightIn = heightIn == null ? h : Math.max(heightIn, h);
  }
  if (lengthIn == null) lengthIn = toPositiveNumber(settings.defaultParcelLengthIn);
  if (widthIn == null) widthIn = toPositiveNumber(settings.defaultParcelWidthIn);
  if (heightIn == null) heightIn = toPositiveNumber(settings.defaultParcelHeightIn);

  if (lengthIn == null || widthIn == null || heightIn == null) {
    return NextResponse.json(
      {
        success: false,
        code: 'no_dimensions',
        message:
          'Order items are missing dimensions and no default parcel dimensions are configured in store settings.',
      },
      { status: 400 },
    );
  }

  const parcel: Parcel = {
    lengthIn,
    widthIn,
    heightIn,
    weightOz: Math.round(weightOz * 100) / 100,
  };

  if (!settings.shipFromAddress) {
    return NextResponse.json(
      { success: false, message: 'Ship-from address required' },
      { status: 400 },
    );
  }

  if (!order.shippingAddress) {
    return NextResponse.json(
      { success: false, message: 'Order has no shipping address' },
      { status: 400 },
    );
  }

  try {
    const { shipmentId, rates } = await provider.getRates({
      from: settings.shipFromAddress as Address,
      to: order.shippingAddress as Address,
      parcel,
    });

    // Persist shipmentId on the order so a subsequent buyLabel call can use it.
    await db
      .update(orders)
      .set({ easypostShipmentId: shipmentId, updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    return NextResponse.json({
      success: true,
      data: { shipmentId, parcel, rates },
    });
  } catch (err) {
    if (err instanceof CarrierProviderError) {
      return NextResponse.json(
        { success: false, message: err.message, code: err.code },
        { status: 400 },
      );
    }
    console.error('[orders/rates] failed:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to compute rates' },
      { status: 500 },
    );
  }
}
