import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  clients, clientMembers, clientWebsites, products, productImages, productOptions, productOptionValues,
  productVariants, bulkPricingRules,
} from '@/lib/db/schema';
import { and, eq, asc, or } from 'drizzle-orm';

type Params = { params: Promise<{ siteId: string; productId: string }> };

async function resolveProduct(userId: number, siteId: string, productId: string) {
  const [site] = await db
    .select({ site: clientWebsites })
    .from(clientWebsites)
    .innerJoin(clients, eq(clients.id, clientWebsites.clientId))
    .leftJoin(
      clientMembers,
      and(eq(clientMembers.clientId, clients.id), eq(clientMembers.userId, userId)),
    )
    .where(
      and(
        eq(clientWebsites.id, parseInt(siteId)),
        or(eq(clients.userId, userId), eq(clientMembers.userId, userId)),
      ),
    )
    .limit(1)
    .then((rows) => rows.map((row) => row.site));
  if (!site) return { site: null, product: null };

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, parseInt(productId)), eq(products.websiteId, site.id)))
    .limit(1);

  return { site, product: product || null };
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, productId } = await params;
  const { product } = await resolveProduct(parseInt(session.user.id, 10), siteId, productId);
  if (!product) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  // Fetch related data in parallel
  const [images, options, variants, bulkRules] = await Promise.all([
    db.select().from(productImages).where(eq(productImages.productId, product.id)).orderBy(asc(productImages.order)),
    db.select().from(productOptions).where(eq(productOptions.productId, product.id)).orderBy(asc(productOptions.order)),
    db.select().from(productVariants).where(eq(productVariants.productId, product.id)).orderBy(asc(productVariants.createdAt)),
    db.select().from(bulkPricingRules).where(eq(bulkPricingRules.productId, product.id)).orderBy(asc(bulkPricingRules.minQuantity)),
  ]);

  // Fetch option values for each option
  const optionIds = options.map((o) => o.id);
  const optionValuesMap: Record<number, typeof productOptionValues.$inferSelect[]> = {};
  if (optionIds.length > 0) {
    const allValues = await db
      .select()
      .from(productOptionValues)
      .where(
        optionIds.length === 1
          ? eq(productOptionValues.optionId, optionIds[0])
          : eq(productOptionValues.optionId, optionIds[0]), // fallback, handled below
      )
      .orderBy(asc(productOptionValues.order));

    // Re-fetch all values properly if multiple options
    if (optionIds.length > 1) {
      const { sql } = await import('drizzle-orm');
      const vals = await db
        .select()
        .from(productOptionValues)
        .where(sql`${productOptionValues.optionId} IN (${sql.join(optionIds.map(id => sql`${id}`), sql`, `)})`)
        .orderBy(asc(productOptionValues.order));
      for (const v of vals) {
        if (!optionValuesMap[v.optionId]) optionValuesMap[v.optionId] = [];
        optionValuesMap[v.optionId].push(v);
      }
    } else {
      for (const v of allValues) {
        if (!optionValuesMap[v.optionId]) optionValuesMap[v.optionId] = [];
        optionValuesMap[v.optionId].push(v);
      }
    }
  }

  const optionsWithValues = options.map((o) => ({
    ...o,
    values: optionValuesMap[o.id] || [],
  }));

  return NextResponse.json({
    success: true,
    data: {
      ...product,
      images,
      options: optionsWithValues,
      variants,
      bulkPricingRules: bulkRules,
    },
  });
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, productId } = await params;
  const { site, product } = await resolveProduct(parseInt(session.user.id, 10), siteId, productId);
  if (!product || !site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();

  // Reject negative monetary values (allow 0 for free items, null to clear).
  for (const f of ['price', 'compareAtPrice', 'costPrice'] as const) {
    if (body[f] !== undefined && body[f] !== null) {
      const n = Number(body[f]);
      if (Number.isFinite(n) && n < 0) {
        return NextResponse.json(
          { success: false, error: `${f} must be >= 0` },
          { status: 400 }
        );
      }
    }
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  const fields = [
    'name', 'slug', 'description', 'shortDescription', 'sku', 'barcode',
    'weightUnit', 'status', 'seoTitle', 'seoDescription',
  ];
  for (const f of fields) {
    if (body[f] !== undefined) updateData[f] = body[f];
  }

  const intFields = ['price', 'compareAtPrice', 'costPrice', 'quantity', 'categoryId'];
  for (const f of intFields) {
    if (body[f] !== undefined) updateData[f] = body[f] != null ? parseInt(String(body[f])) : null;
  }

  const boolFields = ['trackInventory', 'featured', 'isDesignable', 'designable'];
  for (const f of boolFields) {
    if (body[f] !== undefined) updateData[f] = body[f];
  }

  if (body.weight !== undefined) updateData.weight = body.weight != null ? String(body.weight) : null;
  if (body.tags !== undefined) updateData.tags = body.tags;
  if (body.metadata !== undefined) updateData.metadata = body.metadata;

  // Check slug uniqueness if slug is being updated
  if (body.slug && body.slug !== product.slug) {
    const [existing] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.websiteId, site.id), eq(products.slug, body.slug)))
      .limit(1);
    if (existing) {
      return NextResponse.json({ success: false, message: 'A product with this slug already exists' }, { status: 409 });
    }
  }

  // Update images if provided
  if (body.images && Array.isArray(body.images)) {
    await db.delete(productImages).where(eq(productImages.productId, product.id));
    if (body.images.length > 0) {
      await db.insert(productImages).values(
        body.images.map((img: { url: string; alt?: string }, idx: number) => ({
          productId: product.id,
          url: img.url,
          alt: img.alt || null,
          order: idx,
        })),
      );
    }
  }

  const [updated] = await db
    .update(products)
    .set(updateData)
    .where(eq(products.id, product.id))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, productId } = await params;
  const { product } = await resolveProduct(parseInt(session.user.id, 10), siteId, productId);
  if (!product) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  await db.delete(products).where(eq(products.id, product.id));

  return NextResponse.json({ success: true, message: 'Product deleted' });
}
