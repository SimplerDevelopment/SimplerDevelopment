import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { products, bulkPricingRules } from '@/lib/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';

type Params = { params: Promise<{ siteId: string; productId: string }> };

async function resolveProduct(userId: number, siteId: string, productId: string) {
  const site = await resolveClientSite(userId, parseInt(siteId));
  if (!site) return null;
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, parseInt(productId)), eq(products.websiteId, site.id)))
    .limit(1);
  return product || null;
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, productId } = await params;
  const product = await resolveProduct(parseInt(session.user.id, 10), siteId, productId);
  if (!product) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const rules = await db
    .select()
    .from(bulkPricingRules)
    .where(eq(bulkPricingRules.productId, product.id))
    .orderBy(asc(bulkPricingRules.minQuantity));

  return NextResponse.json({ success: true, data: rules });
}

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, productId } = await params;
  const product = await resolveProduct(parseInt(session.user.id, 10), siteId, productId);
  if (!product) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { variantId, minQuantity, maxQuantity, priceType, amount } = body;

  if (minQuantity === undefined || amount === undefined) {
    return NextResponse.json({ success: false, message: 'minQuantity and amount are required' }, { status: 400 });
  }

  const [rule] = await db
    .insert(bulkPricingRules)
    .values({
      productId: product.id,
      variantId: variantId ? parseInt(String(variantId)) : null,
      minQuantity: parseInt(String(minQuantity)),
      maxQuantity: maxQuantity != null ? parseInt(String(maxQuantity)) : null,
      priceType: priceType || 'fixed',
      amount: parseInt(String(amount)),
    })
    .returning();

  return NextResponse.json({ success: true, data: rule }, { status: 201 });
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, productId } = await params;
  const product = await resolveProduct(parseInt(session.user.id, 10), siteId, productId);
  if (!product) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const url = new URL(req.url);
  const ruleId = url.searchParams.get('id');
  if (!ruleId) return NextResponse.json({ success: false, message: 'id query param is required' }, { status: 400 });

  const [existing] = await db
    .select()
    .from(bulkPricingRules)
    .where(and(eq(bulkPricingRules.id, parseInt(ruleId)), eq(bulkPricingRules.productId, product.id)))
    .limit(1);
  if (!existing) return NextResponse.json({ success: false, message: 'Rule not found' }, { status: 404 });

  const body = await req.json();
  const updateData: Record<string, unknown> = {};

  if (body.variantId !== undefined) updateData.variantId = body.variantId != null ? parseInt(String(body.variantId)) : null;
  if (body.minQuantity !== undefined) updateData.minQuantity = parseInt(String(body.minQuantity));
  if (body.maxQuantity !== undefined) updateData.maxQuantity = body.maxQuantity != null ? parseInt(String(body.maxQuantity)) : null;
  if (body.priceType !== undefined) updateData.priceType = body.priceType;
  if (body.amount !== undefined) updateData.amount = parseInt(String(body.amount));

  const [updated] = await db
    .update(bulkPricingRules)
    .set(updateData)
    .where(eq(bulkPricingRules.id, existing.id))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, productId } = await params;
  const product = await resolveProduct(parseInt(session.user.id, 10), siteId, productId);
  if (!product) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const url = new URL(_req.url);
  const ruleId = url.searchParams.get('id');
  if (!ruleId) return NextResponse.json({ success: false, message: 'id query param is required' }, { status: 400 });

  const [existing] = await db
    .select()
    .from(bulkPricingRules)
    .where(and(eq(bulkPricingRules.id, parseInt(ruleId)), eq(bulkPricingRules.productId, product.id)))
    .limit(1);
  if (!existing) return NextResponse.json({ success: false, message: 'Rule not found' }, { status: 404 });

  await db.delete(bulkPricingRules).where(eq(bulkPricingRules.id, existing.id));

  return NextResponse.json({ success: true, message: 'Rule deleted' });
}
