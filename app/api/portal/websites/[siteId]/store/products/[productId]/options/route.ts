import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { products, productOptions, productOptionValues } from '@/lib/db/schema';
import { and, eq, asc, sql } from 'drizzle-orm';
import { resolveStoreSite } from '@/lib/portal-auth';

type Params = { params: Promise<{ siteId: string; productId: string }> };

async function resolveProduct(userId: number, siteId: string, productId: string) {
  const site = await resolveStoreSite(userId, parseInt(siteId));
  if (!site) return null;
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, parseInt(productId)), eq(products.websiteId, site.id)))
    .limit(1);
  return product || null;
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, productId } = await params;
  const product = await resolveProduct(parseInt(session.user.id, 10), siteId, productId);
  if (!product) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const options = await db
    .select()
    .from(productOptions)
    .where(eq(productOptions.productId, product.id))
    .orderBy(asc(productOptions.order));

  const optionIds = options.map((o) => o.id);
  const optionValuesMap: Record<number, typeof productOptionValues.$inferSelect[]> = {};

  if (optionIds.length > 0) {
    const allValues = await db
      .select()
      .from(productOptionValues)
      .where(sql`${productOptionValues.optionId} IN (${sql.join(optionIds.map(id => sql`${id}`), sql`, `)})`)
      .orderBy(asc(productOptionValues.order));

    for (const v of allValues) {
      if (!optionValuesMap[v.optionId]) optionValuesMap[v.optionId] = [];
      optionValuesMap[v.optionId].push(v);
    }
  }

  const data = options.map((o) => ({
    ...o,
    values: optionValuesMap[o.id] || [],
  }));

  return NextResponse.json({ success: true, data });
}

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, productId } = await params;
  const product = await resolveProduct(parseInt(session.user.id, 10), siteId, productId);
  if (!product) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { name, values } = body;

  if (!name) {
    return NextResponse.json({ success: false, message: 'name is required' }, { status: 400 });
  }

  // Get the next order value
  const existingOptions = await db
    .select({ order: productOptions.order })
    .from(productOptions)
    .where(eq(productOptions.productId, product.id))
    .orderBy(asc(productOptions.order));
  const nextOrder = existingOptions.length > 0 ? existingOptions[existingOptions.length - 1].order + 1 : 0;

  const [option] = await db
    .insert(productOptions)
    .values({
      productId: product.id,
      name,
      order: nextOrder,
    })
    .returning();

  // Insert option values if provided
  let insertedValues: typeof productOptionValues.$inferSelect[] = [];
  if (values && Array.isArray(values) && values.length > 0) {
    insertedValues = await db
      .insert(productOptionValues)
      .values(
        values.map((v: { value: string; label?: string }, idx: number) => ({
          optionId: option.id,
          value: v.value,
          label: v.label || null,
          order: idx,
        })),
      )
      .returning();
  }

  return NextResponse.json({
    success: true,
    data: { ...option, values: insertedValues },
  }, { status: 201 });
}
