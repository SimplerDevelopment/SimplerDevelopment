import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { products, productCategories, productImages, productVariants } from '@/lib/db/schema';
import { and, eq, ilike, sql, count, desc, asc } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'store' });
  if (isAuthError(authResult)) return authResult.response;

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const category = url.searchParams.get('category');
  const search = url.searchParams.get('search');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '25')));
  const offset = (page - 1) * limit;

  const conditions = [eq(products.websiteId, site.id)];
  if (status) conditions.push(eq(products.status, status));
  if (category) conditions.push(eq(products.categoryId, parseInt(category)));
  if (search) conditions.push(ilike(products.name, `%${search}%`));

  const where = and(...conditions);

  const [totalResult] = await db
    .select({ total: count() })
    .from(products)
    .where(where);

  const rows = await db
    .select({
      product: products,
      categoryName: productCategories.name,
    })
    .from(products)
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .where(where)
    .orderBy(desc(products.createdAt))
    .limit(limit)
    .offset(offset);

  // Fetch images and variant counts for all returned products
  const productIds = rows.map((r) => r.product.id);

  const imagesMap: Record<number, typeof productImages.$inferSelect[]> = {};
  const variantCountMap: Record<number, number> = {};

  if (productIds.length > 0) {
    const allImages = await db
      .select()
      .from(productImages)
      .where(sql`${productImages.productId} IN (${sql.join(productIds.map(id => sql`${id}`), sql`, `)})`)
      .orderBy(asc(productImages.order));

    for (const img of allImages) {
      if (!imagesMap[img.productId]) imagesMap[img.productId] = [];
      imagesMap[img.productId].push(img);
    }

    const variantCounts = await db
      .select({ productId: productVariants.productId, count: count() })
      .from(productVariants)
      .where(sql`${productVariants.productId} IN (${sql.join(productIds.map(id => sql`${id}`), sql`, `)})`)
      .groupBy(productVariants.productId);

    for (const vc of variantCounts) {
      variantCountMap[vc.productId] = vc.count;
    }
  }

  const data = rows.map((r) => ({
    ...r.product,
    categoryName: r.categoryName,
    images: imagesMap[r.product.id] || [],
    variantsCount: variantCountMap[r.product.id] || 0,
  }));

  return NextResponse.json({
    success: true,
    data,
    pagination: {
      page,
      limit,
      total: totalResult.total,
      totalPages: Math.ceil(totalResult.total / limit),
    },
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'store' });
  if (isAuthError(authResult)) return authResult.response;

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const {
    name, slug, description, shortDescription, price, compareAtPrice, costPrice,
    sku, barcode, trackInventory, quantity, weight, weightUnit, status,
    featured, categoryId, tags, seoTitle, seoDescription, images, isDesignable,
    designable, metadata,
  } = body;

  if (!name || !slug || price === undefined) {
    return NextResponse.json({ success: false, message: 'name, slug, and price are required' }, { status: 400 });
  }

  // Reject negative prices (allow 0 for free items, null already excluded).
  const priceNum = Number(price);
  if (Number.isFinite(priceNum) && priceNum < 0) {
    return NextResponse.json(
      { success: false, error: 'price must be >= 0' },
      { status: 400 }
    );
  }
  if (compareAtPrice != null && Number(compareAtPrice) < 0) {
    return NextResponse.json(
      { success: false, error: 'compareAtPrice must be >= 0' },
      { status: 400 }
    );
  }
  if (costPrice != null && Number(costPrice) < 0) {
    return NextResponse.json(
      { success: false, error: 'costPrice must be >= 0' },
      { status: 400 }
    );
  }

  // Check slug uniqueness within website
  const [existing] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.websiteId, site.id), eq(products.slug, slug)))
    .limit(1);

  if (existing) {
    return NextResponse.json({ success: false, message: 'A product with this slug already exists' }, { status: 409 });
  }

  const [product] = await db
    .insert(products)
    .values({
      websiteId: site.id,
      name,
      slug,
      description: description || null,
      shortDescription: shortDescription || null,
      price: parseInt(String(price)),
      compareAtPrice: compareAtPrice != null ? parseInt(String(compareAtPrice)) : null,
      costPrice: costPrice != null ? parseInt(String(costPrice)) : null,
      sku: sku || null,
      barcode: barcode || null,
      trackInventory: trackInventory ?? true,
      quantity: quantity ?? 0,
      weight: weight != null ? String(weight) : null,
      weightUnit: weightUnit || 'g',
      status: status || 'draft',
      featured: featured ?? false,
      isDesignable: isDesignable ?? false,
      designable: designable ?? false,
      categoryId: categoryId ? parseInt(String(categoryId)) : null,
      tags: tags || [],
      metadata: metadata ?? null,
      seoTitle: seoTitle || null,
      seoDescription: seoDescription || null,
    })
    .returning();

  // Insert images if provided
  if (images && Array.isArray(images) && images.length > 0) {
    await db.insert(productImages).values(
      images.map((img: { url: string; alt?: string }, idx: number) => ({
        productId: product.id,
        url: img.url,
        alt: img.alt || null,
        order: idx,
      })),
    );
  }

  // Fetch the product with images
  const allImages = await db
    .select()
    .from(productImages)
    .where(eq(productImages.productId, product.id))
    .orderBy(asc(productImages.order));

  return NextResponse.json({
    success: true,
    data: { ...product, images: allImages },
  }, { status: 201 });
}
