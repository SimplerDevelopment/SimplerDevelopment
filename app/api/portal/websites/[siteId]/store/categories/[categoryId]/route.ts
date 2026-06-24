import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { productCategories } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolveStoreSite } from '@/lib/portal-auth';

type Params = { params: Promise<{ siteId: string; categoryId: string }> };

async function resolveCategory(userId: number, siteId: string, categoryId: string) {
  const site = await resolveStoreSite(userId, parseInt(siteId));
  if (!site) return null;

  const [category] = await db
    .select()
    .from(productCategories)
    .where(and(eq(productCategories.id, parseInt(categoryId)), eq(productCategories.websiteId, site.id)))
    .limit(1);

  return category || null;
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, categoryId } = await params;
  const category = await resolveCategory(parseInt(session.user.id, 10), siteId, categoryId);
  if (!category) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (body.name !== undefined) updateData.name = body.name;
  if (body.slug !== undefined) updateData.slug = body.slug;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.image !== undefined) updateData.image = body.image;
  if (body.parentId !== undefined) updateData.parentId = body.parentId ? parseInt(String(body.parentId)) : null;
  if (body.order !== undefined) updateData.order = body.order;
  if (body.active !== undefined) updateData.active = body.active;

  // Check slug uniqueness if slug is being updated
  if (body.slug && body.slug !== category.slug) {
    const site = await resolveStoreSite(parseInt(session.user.id, 10), parseInt(siteId));
    if (site) {
      const [existing] = await db
        .select({ id: productCategories.id })
        .from(productCategories)
        .where(and(eq(productCategories.websiteId, site.id), eq(productCategories.slug, body.slug)))
        .limit(1);
      if (existing) {
        return NextResponse.json({ success: false, message: 'A category with this slug already exists' }, { status: 409 });
      }
    }
  }

  const [updated] = await db
    .update(productCategories)
    .set(updateData)
    .where(eq(productCategories.id, category.id))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, categoryId } = await params;
  const category = await resolveCategory(parseInt(session.user.id, 10), siteId, categoryId);
  if (!category) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  await db.delete(productCategories).where(eq(productCategories.id, category.id));

  return NextResponse.json({ success: true, message: 'Category deleted' });
}
