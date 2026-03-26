import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  storeSettings, products, productImages, productOptions,
  productOptionValues, productVariants, bulkPricingRules, productCategories,
} from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string; slug: string }> }
) {
  try {
    const { siteId, slug } = await params;
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

    // Fetch active product by slug
    const [product] = await db.select().from(products)
      .where(and(
        eq(products.websiteId, websiteId),
        eq(products.slug, slug),
        eq(products.status, 'active'),
      ))
      .limit(1);

    if (!product) {
      return NextResponse.json({ success: false, message: 'Product not found' }, { status: 404 });
    }

    // Fetch related data in parallel
    const [images, options, variants, bulkRules, category] = await Promise.all([
      db.select().from(productImages)
        .where(eq(productImages.productId, product.id))
        .orderBy(asc(productImages.order)),

      db.select().from(productOptions)
        .where(eq(productOptions.productId, product.id))
        .orderBy(asc(productOptions.order)),

      db.select().from(productVariants)
        .where(and(
          eq(productVariants.productId, product.id),
          eq(productVariants.active, true),
        )),

      db.select().from(bulkPricingRules)
        .where(eq(bulkPricingRules.productId, product.id))
        .orderBy(asc(bulkPricingRules.minQuantity)),

      product.categoryId
        ? db.select({ id: productCategories.id, name: productCategories.name, slug: productCategories.slug })
            .from(productCategories)
            .where(eq(productCategories.id, product.categoryId))
            .limit(1)
            .then(rows => rows[0] || null)
        : Promise.resolve(null),
    ]);

    // Fetch option values for each option
    const optionIds = options.map(o => o.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const optionValuesMap: Record<number, any[]> = {};

    if (optionIds.length > 0) {
      const values = await Promise.all(
        optionIds.map(optId =>
          db.select().from(productOptionValues)
            .where(eq(productOptionValues.optionId, optId))
            .orderBy(asc(productOptionValues.order))
        )
      );

      for (let i = 0; i < optionIds.length; i++) {
        optionValuesMap[optionIds[i]] = values[i];
      }
    }

    const optionsWithValues = options.map(opt => ({
      ...opt,
      values: optionValuesMap[opt.id] || [],
    }));

    return NextResponse.json({
      success: true,
      data: {
        ...product,
        images,
        options: optionsWithValues,
        variants,
        bulkPricing: bulkRules,
        category,
      },
    });
  } catch (err) {
    console.error('Storefront product detail error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
