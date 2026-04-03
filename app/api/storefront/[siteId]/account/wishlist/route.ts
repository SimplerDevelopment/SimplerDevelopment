import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { storeWishlists, storeWishlistItems, products, productImages } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireCustomer } from '@/lib/storefront/customer-auth';

/**
 * GET /api/storefront/[siteId]/account/wishlist — Get wishlist with product details
 * POST — Add item to wishlist
 * DELETE — Remove item from wishlist (body: { productId })
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const websiteId = parseInt(siteId);
  const session = await requireCustomer(req, websiteId);
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  // Get or create default wishlist
  let [wishlist] = await db.select()
    .from(storeWishlists)
    .where(and(eq(storeWishlists.customerId, session.customerId), eq(storeWishlists.websiteId, websiteId)))
    .limit(1);

  if (!wishlist) {
    [wishlist] = await db.insert(storeWishlists).values({
      customerId: session.customerId,
      websiteId,
      name: 'My Wishlist',
      isDefault: true,
    }).returning();
  }

  // Get items with product data
  const items = await db.select({
    id: storeWishlistItems.id,
    productId: storeWishlistItems.productId,
    variantId: storeWishlistItems.variantId,
    addedAt: storeWishlistItems.addedAt,
    productName: products.name,
    productSlug: products.slug,
    productPrice: products.price,
    productCompareAtPrice: products.compareAtPrice,
    productStatus: products.status,
  })
    .from(storeWishlistItems)
    .innerJoin(products, eq(storeWishlistItems.productId, products.id))
    .where(eq(storeWishlistItems.wishlistId, wishlist.id));

  // Get first image for each product
  const productIds = [...new Set(items.map(i => i.productId))];
  const images = productIds.length > 0
    ? await db.select({ productId: productImages.productId, url: productImages.url, alt: productImages.alt })
        .from(productImages)
        .where(eq(productImages.order, 0))
    : [];
  const imageMap = new Map(images.map(i => [i.productId, i]));

  const enriched = items.map(item => ({
    ...item,
    image: imageMap.get(item.productId) ?? null,
  }));

  return NextResponse.json({ success: true, data: { wishlist, items: enriched } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const websiteId = parseInt(siteId);
  const session = await requireCustomer(req, websiteId);
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { productId, variantId } = await req.json();
  if (!productId) return NextResponse.json({ success: false, message: 'productId is required' }, { status: 400 });

  // Get or create default wishlist
  let [wishlist] = await db.select()
    .from(storeWishlists)
    .where(and(eq(storeWishlists.customerId, session.customerId), eq(storeWishlists.websiteId, websiteId)))
    .limit(1);

  if (!wishlist) {
    [wishlist] = await db.insert(storeWishlists).values({
      customerId: session.customerId,
      websiteId,
      name: 'My Wishlist',
      isDefault: true,
    }).returning();
  }

  // Check if already in wishlist
  const [existing] = await db.select({ id: storeWishlistItems.id })
    .from(storeWishlistItems)
    .where(and(
      eq(storeWishlistItems.wishlistId, wishlist.id),
      eq(storeWishlistItems.productId, productId),
    ))
    .limit(1);

  if (existing) {
    return NextResponse.json({ success: true, message: 'Already in wishlist', data: existing });
  }

  const [item] = await db.insert(storeWishlistItems).values({
    wishlistId: wishlist.id,
    productId,
    variantId: variantId ?? null,
  }).returning();

  return NextResponse.json({ success: true, data: item }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const websiteId = parseInt(siteId);
  const session = await requireCustomer(req, websiteId);
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { productId } = await req.json();
  if (!productId) return NextResponse.json({ success: false, message: 'productId is required' }, { status: 400 });

  const [wishlist] = await db.select({ id: storeWishlists.id })
    .from(storeWishlists)
    .where(and(eq(storeWishlists.customerId, session.customerId), eq(storeWishlists.websiteId, websiteId)))
    .limit(1);

  if (wishlist) {
    await db.delete(storeWishlistItems).where(and(
      eq(storeWishlistItems.wishlistId, wishlist.id),
      eq(storeWishlistItems.productId, productId),
    ));
  }

  return NextResponse.json({ success: true });
}
