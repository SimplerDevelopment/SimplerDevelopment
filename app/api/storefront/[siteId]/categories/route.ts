import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { storeSettings, productCategories, products } from '@/lib/db/schema';
import { eq, and, sql, asc } from 'drizzle-orm';

export async function GET(
  _req: Request,
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

    // Fetch categories with product counts
    const rows = await db.select({
      id: productCategories.id,
      name: productCategories.name,
      slug: productCategories.slug,
      description: productCategories.description,
      image: productCategories.image,
      parentId: productCategories.parentId,
      order: productCategories.order,
      productCount: sql<number>`(
        SELECT count(*) FROM products
        WHERE products.category_id = ${productCategories.id}
        AND products.status = 'active'
      )`,
    })
      .from(productCategories)
      .where(and(
        eq(productCategories.websiteId, websiteId),
        eq(productCategories.active, true),
      ))
      .orderBy(asc(productCategories.order), asc(productCategories.name));

    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('Storefront categories error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
