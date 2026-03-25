import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { categories } from '@/lib/db/schema';
import { resolveClientSite } from '@/lib/portal-client';
import { eq, and } from 'drizzle-orm';

export async function PUT(req: Request, { params }: { params: Promise<{ siteId: string; id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, id } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const categoryId = parseInt(id);
  const body = await req.json();
  const { name, slug, description, color } = body;

  // Check slug uniqueness if changed
  if (slug) {
    const [conflict] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.slug, slug.trim()), eq(categories.websiteId, site.id)))
      .limit(1);
    if (conflict && conflict.id !== categoryId) {
      return NextResponse.json({ success: false, message: 'A category with this slug already exists' }, { status: 400 });
    }
  }

  const [updated] = await db
    .update(categories)
    .set({
      ...(name !== undefined && { name: name.trim() }),
      ...(slug !== undefined && { slug: slug.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(color !== undefined && { color: color?.trim() || null }),
    })
    .where(and(eq(categories.id, categoryId), eq(categories.websiteId, site.id)))
    .returning();

  if (!updated) return NextResponse.json({ success: false, message: 'Category not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ siteId: string; id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, id } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const [deleted] = await db
    .delete(categories)
    .where(and(eq(categories.id, parseInt(id)), eq(categories.websiteId, site.id)))
    .returning();

  if (!deleted) return NextResponse.json({ success: false, message: 'Category not found' }, { status: 404 });
  return NextResponse.json({ success: true, message: 'Category deleted' });
}
