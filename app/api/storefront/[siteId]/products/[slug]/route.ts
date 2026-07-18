import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  storeSettings, products, productImages, productOptions,
  productOptionValues, productVariants, bulkPricingRules, productCategories,
  productStyles, productSides,
} from '@/lib/db/schema';
import { eq, and, asc, inArray } from 'drizzle-orm';

// GET /api/storefront/[siteId]/products/[slug]
//
// Dual-mode handler:
//   - If `[slug]` is a numeric string → product-designer editor mode:
//       returns { ...product, styles: [{ ...style, sides: [...] }] }.
//   - Otherwise → storefront product detail mode:
//       returns { ...product, images, options, variants, bulkPricing, category }.
//
// The two modes were originally split into [slug] and [productId] sibling
// folders, but Next.js considers sibling dynamic segments at the same level
// ambiguous and fails the build. Merging here is the smallest fix that
// preserves both public URLs the editor and storefront already call:
//   /api/storefront/{siteId}/products/{numericId}   → designer
//   /api/storefront/{siteId}/products/{slug}        → storefront
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

    // Numeric param → product-designer detail (styles + sides) ----------------
    if (/^\d+$/.test(slug)) {
      const pid = parseInt(slug, 10);
      const [product] = await db.select()
        .from(products)
        .where(eq(products.id, pid))
        .limit(1);

      if (!product || product.websiteId !== websiteId) {
        return NextResponse.json({ success: false, message: 'Product not found' }, { status: 404 });
      }

      const styles = await db.select()
        .from(productStyles)
        .where(and(
          eq(productStyles.productId, pid),
          eq(productStyles.active, true),
        ))
        .orderBy(asc(productStyles.order), asc(productStyles.id));

      let stylesWithSides: Array<typeof styles[number] & { sides: Array<typeof productSides.$inferSelect> }> = [];
      if (styles.length > 0) {
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

        stylesWithSides = styles.map(style => ({
          ...style,
          sides: byStyle.get(style.id) ?? [],
        }));
      }

      return NextResponse.json({
        success: true,
        data: {
          ...product,
          styles: stylesWithSides,
        },
      });
    }

    // Slug param → storefront product page detail -----------------------------

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
