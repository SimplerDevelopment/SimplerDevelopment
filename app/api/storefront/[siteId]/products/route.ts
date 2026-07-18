import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { storeSettings, products, productImages, productCategories } from '@/lib/db/schema';
import { eq, and, desc, asc, sql, like, or } from 'drizzle-orm';

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
    const category = url.searchParams.get('category');
    const search = url.searchParams.get('search');
    const sort = url.searchParams.get('sort') || 'newest';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '24', 10)));
    const offset = (page - 1) * limit;

    // Build conditions
    const conditions = [
      eq(products.websiteId, websiteId),
      eq(products.status, 'active'),
    ];

    if (category) {
      const [cat] = await db.select({ id: productCategories.id })
        .from(productCategories)
        .where(and(
          eq(productCategories.websiteId, websiteId),
          eq(productCategories.slug, category),
        ))
        .limit(1);
      if (cat) {
        conditions.push(eq(products.categoryId, cat.id));
      }
    }

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          like(products.name, pattern),
          like(products.shortDescription, pattern),
        )!
      );
    }

    // Sort
    let orderBy;
    switch (sort) {
      case 'price_asc':
        orderBy = asc(products.price);
        break;
      case 'price_desc':
        orderBy = desc(products.price);
        break;
      case 'featured':
        orderBy = desc(products.featured);
        break;
      case 'newest':
      default:
        orderBy = desc(products.createdAt);
        break;
    }

    // Count total
    const [{ total }] = await db.select({ total: sql<number>`count(*)` })
      .from(products)
      .where(and(...conditions));

    // Fetch products
    const rows = await db.select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      shortDescription: products.shortDescription,
      price: products.price,
      compareAtPrice: products.compareAtPrice,
      featured: products.featured,
      categoryId: products.categoryId,
      createdAt: products.createdAt,
    })
      .from(products)
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    // Fetch first image + category name for each product
    const productIds = rows.map(r => r.id);

    const imagesMap: Record<number, string> = {};
    const categoriesMap: Record<number, string> = {};

    if (productIds.length > 0) {
      const images = await db.select({
        productId: productImages.productId,
        url: productImages.url,
      })
        .from(productImages)
        .where(sql`${productImages.productId} IN ${productIds}`)
        .orderBy(asc(productImages.order));

      // Take first image per product
      for (const img of images) {
        if (!imagesMap[img.productId]) {
          imagesMap[img.productId] = img.url;
        }
      }

      const categoryIds = [...new Set(rows.filter(r => r.categoryId).map(r => r.categoryId!))];
      if (categoryIds.length > 0) {
        const cats = await db.select({
          id: productCategories.id,
          name: productCategories.name,
        })
          .from(productCategories)
          .where(sql`${productCategories.id} IN ${categoryIds}`);

        for (const cat of cats) {
          categoriesMap[cat.id] = cat.name;
        }
      }
    }

    const data = rows.map(row => ({
      ...row,
      image: imagesMap[row.id] || null,
      categoryName: row.categoryId ? (categoriesMap[row.categoryId] || null) : null,
    }));

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / limit),
      },
    });
  } catch (err) {
    console.error('Storefront products error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
