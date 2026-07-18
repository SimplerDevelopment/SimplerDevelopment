import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { products, productStyles, productSides } from '@/lib/db/schema';
import { and, asc, eq, inArray } from 'drizzle-orm';

// GET /api/storefront/[siteId]/products/[slug]/styles
//
// Public. Lists styles (with their sides nested) for a product.
// `[slug]` accepts either the numeric productId (what the editor sends) or
// the product slug (storefront convention). 404 unless the product belongs
// to the given site.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ siteId: string; slug: string }> },
) {
  const { siteId, slug } = await params;
  const websiteId = parseInt(siteId, 10);
  if (Number.isNaN(websiteId)) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  // Resolve product by numeric id or slug.
  let product:
    | { id: number; websiteId: number }
    | undefined;
  if (/^\d+$/.test(slug)) {
    const pid = parseInt(slug, 10);
    [product] = await db.select({ id: products.id, websiteId: products.websiteId })
      .from(products)
      .where(eq(products.id, pid))
      .limit(1);
  } else {
    [product] = await db.select({ id: products.id, websiteId: products.websiteId })
      .from(products)
      .where(and(
        eq(products.websiteId, websiteId),
        eq(products.slug, slug),
      ))
      .limit(1);
  }

  if (!product || product.websiteId !== websiteId) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const styles = await db.select()
    .from(productStyles)
    .where(and(
      eq(productStyles.productId, product.id),
      eq(productStyles.active, true),
    ))
    .orderBy(asc(productStyles.order), asc(productStyles.id));

  if (styles.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  const styleIds = styles.map(s => s.id);
  const sides = await db.select()
    .from(productSides)
    .where(inArray(productSides.styleId, styleIds))
    .orderBy(asc(productSides.order), asc(productSides.id));

  const byStyle = new Map<number, typeof sides>();
  for (const s of sides) {
    const arr = byStyle.get(s.styleId) ?? [];
    arr.push(s);
    byStyle.set(s.styleId, arr);
  }

  const data = styles.map(style => ({
    ...style,
    sides: byStyle.get(style.id) ?? [],
  }));

  return NextResponse.json({ success: true, data });
}
