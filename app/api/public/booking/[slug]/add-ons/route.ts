import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookingPages, bookingAddOns, products, productVariants, productImages } from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const [page] = await db.select().from(bookingPages)
      .where(and(eq(bookingPages.slug, slug), eq(bookingPages.active, true)))
      .limit(1);

    if (!page) {
      return NextResponse.json({ success: false, message: 'Booking page not found' }, { status: 404 });
    }

    if (!page.enableAddOns) {
      return NextResponse.json({ success: true, data: [] });
    }

    const addOns = await db.select().from(bookingAddOns)
      .where(and(
        eq(bookingAddOns.bookingPageId, page.id),
        eq(bookingAddOns.active, true),
      ))
      .orderBy(asc(bookingAddOns.order));

    // Resolve product-linked add-ons with live data
    const resolved = await Promise.all(addOns.map(async (addOn) => {
      if (addOn.source === 'product' && addOn.productId) {
        const [product] = await db.select().from(products)
          .where(and(eq(products.id, addOn.productId), eq(products.status, 'active')))
          .limit(1);

        if (!product) {
          return null; // Product deleted or deactivated — skip this add-on
        }

        let price = product.price;
        let variantName: string | null = null;

        if (addOn.variantId) {
          const [variant] = await db.select().from(productVariants)
            .where(and(eq(productVariants.id, addOn.variantId), eq(productVariants.active, true)))
            .limit(1);
          if (variant) {
            price = variant.price ?? product.price;
            variantName = variant.name;
          }
        }

        // Get first product image
        const [image] = await db.select({ url: productImages.url }).from(productImages)
          .where(eq(productImages.productId, product.id))
          .orderBy(asc(productImages.order))
          .limit(1);

        return {
          id: addOn.id,
          source: 'product' as const,
          name: product.name,
          description: product.shortDescription || product.description,
          price,
          image: image?.url || null,
          variantName,
          maxQuantity: addOn.maxQuantity,
        };
      }

      return {
        id: addOn.id,
        source: 'custom' as const,
        name: addOn.name,
        description: addOn.description,
        price: addOn.price,
        image: addOn.image,
        variantName: null,
        maxQuantity: addOn.maxQuantity,
      };
    }));

    return NextResponse.json({
      success: true,
      data: resolved.filter(Boolean),
    });
  } catch (err) {
    console.error('Booking add-ons error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
