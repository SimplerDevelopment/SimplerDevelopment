import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { products, productVariants } from '@/lib/db/schema';
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

  const variants = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, product.id))
    .orderBy(asc(productVariants.createdAt));

  return NextResponse.json({ success: true, data: variants });
}

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, productId } = await params;
  const product = await resolveProduct(parseInt(session.user.id, 10), siteId, productId);
  if (!product) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { name, sku, barcode, price, compareAtPrice, costPrice, quantity, weight, image, optionValues } = body;

  if (!name || price === undefined) {
    return NextResponse.json({ success: false, message: 'name and price are required' }, { status: 400 });
  }

  const [variant] = await db
    .insert(productVariants)
    .values({
      productId: product.id,
      name,
      sku: sku || null,
      barcode: barcode || null,
      price: parseInt(String(price)),
      compareAtPrice: compareAtPrice != null ? parseInt(String(compareAtPrice)) : null,
      costPrice: costPrice != null ? parseInt(String(costPrice)) : null,
      quantity: quantity ?? 0,
      weight: weight != null ? String(weight) : null,
      image: image || null,
      optionValues: optionValues || [],
    })
    .returning();

  return NextResponse.json({ success: true, data: variant }, { status: 201 });
}
