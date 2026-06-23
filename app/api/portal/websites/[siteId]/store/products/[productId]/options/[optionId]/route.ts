import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { products, productOptions, productOptionValues } from '@/lib/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';

type Params = { params: Promise<{ siteId: string; productId: string; optionId: string }> };

async function resolveOption(userId: number, siteId: string, productId: string, optionId: string) {
  const site = await resolveClientSite(userId, parseInt(siteId));
  if (!site) return null;

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, parseInt(productId)), eq(products.websiteId, site.id)))
    .limit(1);
  if (!product) return null;

  const [option] = await db
    .select()
    .from(productOptions)
    .where(and(eq(productOptions.id, parseInt(optionId)), eq(productOptions.productId, product.id)))
    .limit(1);

  return option || null;
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, productId, optionId } = await params;
  const option = await resolveOption(parseInt(session.user.id, 10), siteId, productId, optionId);
  if (!option) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();

  // Update option name if provided
  if (body.name !== undefined) {
    await db
      .update(productOptions)
      .set({ name: body.name })
      .where(eq(productOptions.id, option.id));
  }

  // Replace option values if provided
  if (body.values && Array.isArray(body.values)) {
    await db.delete(productOptionValues).where(eq(productOptionValues.optionId, option.id));

    if (body.values.length > 0) {
      await db.insert(productOptionValues).values(
        body.values.map((v: { value: string; label?: string }, idx: number) => ({
          optionId: option.id,
          value: v.value,
          label: v.label || null,
          order: idx,
        })),
      );
    }
  }

  // Return updated option with values
  const [updatedOption] = await db
    .select()
    .from(productOptions)
    .where(eq(productOptions.id, option.id))
    .limit(1);

  const values = await db
    .select()
    .from(productOptionValues)
    .where(eq(productOptionValues.optionId, option.id))
    .orderBy(asc(productOptionValues.order));

  return NextResponse.json({
    success: true,
    data: { ...updatedOption, values },
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, productId, optionId } = await params;
  const option = await resolveOption(parseInt(session.user.id, 10), siteId, productId, optionId);
  if (!option) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  // Cascade delete will handle option values
  await db.delete(productOptions).where(eq(productOptions.id, option.id));

  return NextResponse.json({ success: true, message: 'Option deleted' });
}
