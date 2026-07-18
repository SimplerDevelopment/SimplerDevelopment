import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { categories } from '@/lib/db/schema';
import { resolveClientSite } from '@/lib/portal-client';
import { eq, and } from 'drizzle-orm';
import { parseSiteIdParam } from '@/lib/api/parse-params';

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const parsed = parseSiteIdParam(siteId);
  if (!parsed.ok) return parsed.response;

  const site = await resolveClientSite(parseInt(session.user.id, 10), parsed.value);
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const data = await db
    .select()
    .from(categories)
    .where(eq(categories.websiteId, site.id))
    .orderBy(categories.name);

  return NextResponse.json({ success: true, data });
}

export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const parsed = parseSiteIdParam(siteId);
  if (!parsed.ok) return parsed.response;

  const site = await resolveClientSite(parseInt(session.user.id, 10), parsed.value);
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { name, slug, description, color } = body;

  if (!name?.trim() || !slug?.trim()) {
    return NextResponse.json({ success: false, message: 'Name and slug are required' }, { status: 400 });
  }

  // Check slug uniqueness within this website
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.slug, slug.trim()), eq(categories.websiteId, site.id)))
    .limit(1);
  if (existing) {
    return NextResponse.json({ success: false, message: 'A category with this slug already exists' }, { status: 400 });
  }

  const [category] = await db.insert(categories).values({
    name: name.trim(),
    slug: slug.trim(),
    description: description?.trim() || null,
    color: color?.trim() || null,
    websiteId: site.id,
  }).returning();

  return NextResponse.json({ success: true, data: category }, { status: 201 });
}
