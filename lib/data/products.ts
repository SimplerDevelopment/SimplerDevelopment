import { db } from '@/lib/db';
import {
  storeSettings, products, productImages, productOptions,
  productOptionValues, productVariants, bulkPricingRules, productCategories,
} from '@/lib/db/schema';
import { eq, and, desc, asc, sql, like, or } from 'drizzle-orm';

export interface ListProductsFilters {
  category?: string | null;
  search?: string | null;
  sort?: string | null;
  page?: number;
  limit?: number;
}

async function verifyStoreEnabled(websiteId: number) {
  const [store] = await db.select().from(storeSettings)
    .where(and(eq(storeSettings.websiteId, websiteId), eq(storeSettings.enabled, true)))
    .limit(1);
  return !!store;
}

export async function listProducts(siteId: number, filters: ListProductsFilters = {}) {
  const storeEnabled = await verifyStoreEnabled(siteId);
  if (!storeEnabled) return null;

  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 24));
  const offset = (page - 1) * limit;
  const sort = filters.sort || 'newest';

  const conditions = [
    eq(products.websiteId, siteId),
    eq(products.status, 'active'),
  ];

  if (filters.category) {
    const [cat] = await db.select({ id: productCategories.id })
      .from(productCategories)
      .where(and(eq(productCategories.websiteId, siteId), eq(productCategories.slug, filters.category)))
      .limit(1);
    if (cat) conditions.push(eq(products.categoryId, cat.id));
  }

  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(or(like(products.name, pattern), like(products.shortDescription, pattern))!);
  }

  let orderBy;
  switch (sort) {
    case 'price_asc': orderBy = asc(products.price); break;
    case 'price_desc': orderBy = desc(products.price); break;
    case 'featured': orderBy = desc(products.featured); break;
    default: orderBy = desc(products.createdAt); break;
  }

  const [{ total }] = await db.select({ total: sql<number>`count(*)` })
    .from(products).where(and(...conditions));

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

  const productIds = rows.map(r => r.id);
  const imagesMap: Record<number, string> = {};
  const categoriesMap: Record<number, string> = {};

  if (productIds.length > 0) {
    const images = await db.select({ productId: productImages.productId, url: productImages.url })
      .from(productImages)
      .where(sql`${productImages.productId} IN ${productIds}`)
      .orderBy(asc(productImages.order));

    for (const img of images) {
      if (!imagesMap[img.productId]) imagesMap[img.productId] = img.url;
    }

    const categoryIds = [...new Set(rows.filter(r => r.categoryId).map(r => r.categoryId!))];
    if (categoryIds.length > 0) {
      const cats = await db.select({ id: productCategories.id, name: productCategories.name })
        .from(productCategories)
        .where(sql`${productCategories.id} IN ${categoryIds}`);
      for (const cat of cats) categoriesMap[cat.id] = cat.name;
    }
  }

  const data = rows.map(row => ({
    ...row,
    image: imagesMap[row.id] || null,
    categoryName: row.categoryId ? (categoriesMap[row.categoryId] || null) : null,
  }));

  return {
    data,
    pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) },
  };
}

export async function getProductBySlug(siteId: number, slug: string) {
  const storeEnabled = await verifyStoreEnabled(siteId);
  if (!storeEnabled) return null;

  const [product] = await db.select().from(products)
    .where(and(eq(products.websiteId, siteId), eq(products.slug, slug), eq(products.status, 'active')))
    .limit(1);

  if (!product) return null;

  const [images, options, variants, bulkRules, category] = await Promise.all([
    db.select().from(productImages)
      .where(eq(productImages.productId, product.id))
      .orderBy(asc(productImages.order)),
    db.select().from(productOptions)
      .where(eq(productOptions.productId, product.id))
      .orderBy(asc(productOptions.order)),
    db.select().from(productVariants)
      .where(and(eq(productVariants.productId, product.id), eq(productVariants.active, true))),
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

  return {
    ...product,
    images,
    options: options.map(opt => ({ ...opt, values: optionValuesMap[opt.id] || [] })),
    variants,
    bulkPricing: bulkRules,
    category,
  };
}

export async function listProductCategories(siteId: number) {
  const storeEnabled = await verifyStoreEnabled(siteId);
  if (!storeEnabled) return null;

  return db.select({
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
    .where(and(eq(productCategories.websiteId, siteId), eq(productCategories.active, true)))
    .orderBy(asc(productCategories.order), asc(productCategories.name));
}
