import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { clientWebsites, postTypes } from '@/lib/db/schema';
import { and, asc, eq, isNull, or } from 'drizzle-orm';

async function verifySiteAccess(siteId: string) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return null;
  const [site] = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, parseInt(siteId)), eq(clientWebsites.clientId, client.id)))
    .limit(1);
  return site || null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const site = await verifySiteAccess(siteId);
  if (!site) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  // Site-specific + global types
  const types = await db
    .select()
    .from(postTypes)
    .where(or(eq(postTypes.websiteId, site.id), isNull(postTypes.websiteId)))
    .orderBy(asc(postTypes.name));

  return NextResponse.json({ success: true, data: types });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const site = await verifySiteAccess(siteId);
  if (!site) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, slug, description, icon } = body;

  if (!name || !slug) {
    return NextResponse.json({ success: false, message: 'Name and slug are required' }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: postTypes.id })
    .from(postTypes)
    .where(and(eq(postTypes.slug, slug), or(eq(postTypes.websiteId, site.id), isNull(postTypes.websiteId))))
    .limit(1);

  if (existing) {
    return NextResponse.json({ success: false, message: 'A content type with this slug already exists' }, { status: 409 });
  }

  const [created] = await db.insert(postTypes).values({
    name,
    slug,
    description: description || null,
    icon: icon || 'article',
    active: true,
    websiteId: site.id,
  }).returning();

  return NextResponse.json({ success: true, data: created }, { status: 201 });
}
