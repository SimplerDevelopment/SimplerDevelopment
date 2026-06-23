import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { products, productVariants } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';

type Params = { params: Promise<{ siteId: string; productId: string; variantId: string }> };

async function resolveVariant(userId: number, siteId: string, productId: string, variantId: string) {
  const site = await resolveClientSite(userId, parseInt(siteId));
  if (!site) return null;

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, parseInt(productId)), eq(products.websiteId, site.id)))
    .limit(1);
  if (!product) return null;

  const [variant] = await db
    .select()
    .from(productVariants)
    .where(and(eq(productVariants.id, parseInt(variantId)), eq(productVariants.productId, product.id)))
    .limit(1);

  return variant || null;
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, productId, variantId } = await params;
  const variant = await resolveVariant(parseInt(session.user.id, 10), siteId, productId, variantId);
  if (!variant) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (body.name !== undefined) updateData.name = body.name;
  if (body.sku !== undefined) updateData.sku = body.sku;
  if (body.barcode !== undefined) updateData.barcode = body.barcode;
  if (body.price !== undefined) updateData.price = parseInt(String(body.price));
  if (body.compareAtPrice !== undefined) updateData.compareAtPrice = body.compareAtPrice != null ? parseInt(String(body.compareAtPrice)) : null;
  if (body.costPrice !== undefined) updateData.costPrice = body.costPrice != null ? parseInt(String(body.costPrice)) : null;
  if (body.quantity !== undefined) updateData.quantity = body.quantity;
  if (body.weight !== undefined) updateData.weight = body.weight != null ? String(body.weight) : null;
  if (body.image !== undefined) updateData.image = body.image;
  if (body.optionValues !== undefined) updateData.optionValues = body.optionValues;
  if (body.active !== undefined) updateData.active = body.active;

  const [updated] = await db
    .update(productVariants)
    .set(updateData)
    .where(eq(productVariants.id, variant.id))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, productId, variantId } = await params;
  const variant = await resolveVariant(parseInt(session.user.id, 10), siteId, productId, variantId);
  if (!variant) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  await db.delete(productVariants).where(eq(productVariants.id, variant.id));

  return NextResponse.json({ success: true, message: 'Variant deleted' });
}
