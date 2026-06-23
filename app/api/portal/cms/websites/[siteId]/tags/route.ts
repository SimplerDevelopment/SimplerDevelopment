import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { tags } from '@/lib/db/schema';
import { resolveClientSite } from '@/lib/portal-client';
import { eq, and } from 'drizzle-orm';

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const data = await db
    .select()
    .from(tags)
    .where(eq(tags.websiteId, site.id))
    .orderBy(tags.name);

  return NextResponse.json({ success: true, data });
}

export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { name, slug } = body;

  if (!name?.trim() || !slug?.trim()) {
    return NextResponse.json({ success: false, message: 'Name and slug are required' }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.slug, slug.trim()), eq(tags.websiteId, site.id)))
    .limit(1);
  if (existing) {
    return NextResponse.json({ success: false, message: 'A tag with this slug already exists' }, { status: 400 });
  }

  const [tag] = await db.insert(tags).values({
    name: name.trim(),
    slug: slug.trim(),
    websiteId: site.id,
  }).returning();

  return NextResponse.json({ success: true, data: tag }, { status: 201 });
}
