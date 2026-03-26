import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { productCategories } from '@/lib/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const categories = await db
    .select()
    .from(productCategories)
    .where(eq(productCategories.websiteId, site.id))
    .orderBy(asc(productCategories.order), asc(productCategories.name));

  return NextResponse.json({ success: true, data: categories });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { name, slug, description, image, parentId, order, active } = body;

  if (!name || !slug) {
    return NextResponse.json({ success: false, message: 'name and slug are required' }, { status: 400 });
  }

  // Check slug uniqueness within website
  const [existing] = await db
    .select({ id: productCategories.id })
    .from(productCategories)
    .where(and(eq(productCategories.websiteId, site.id), eq(productCategories.slug, slug)))
    .limit(1);

  if (existing) {
    return NextResponse.json({ success: false, message: 'A category with this slug already exists' }, { status: 409 });
  }

  const [category] = await db
    .insert(productCategories)
    .values({
      websiteId: site.id,
      name,
      slug,
      description: description || null,
      image: image || null,
      parentId: parentId ? parseInt(String(parentId)) : null,
      order: order ?? 0,
      active: active ?? true,
    })
    .returning();

  return NextResponse.json({ success: true, data: category }, { status: 201 });
}
