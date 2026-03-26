import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { clientWebsites, taxonomies } from '@/lib/db/schema';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';

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

  // Get site-specific taxonomies + global built-ins
  const items = await db
    .select()
    .from(taxonomies)
    .where(or(eq(taxonomies.websiteId, site.id), and(eq(taxonomies.builtIn, true), isNull(taxonomies.websiteId))))
    .orderBy(asc(taxonomies.name));

  return NextResponse.json({ success: true, data: items });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const site = await verifySiteAccess(siteId);
  if (!site) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, slug, description, icon, hierarchical } = body;

  if (!name || !slug) {
    return NextResponse.json({ success: false, message: 'Name and slug are required' }, { status: 400 });
  }

  // Check for slug conflict within this site
  const [existing] = await db
    .select({ id: taxonomies.id })
    .from(taxonomies)
    .where(and(eq(taxonomies.slug, slug), eq(taxonomies.websiteId, site.id)))
    .limit(1);

  if (existing) {
    return NextResponse.json({ success: false, message: 'A taxonomy with this slug already exists' }, { status: 409 });
  }

  const [created] = await db.insert(taxonomies).values({
    name,
    slug,
    description: description || null,
    icon: icon || 'label',
    hierarchical: hierarchical ?? false,
    websiteId: site.id,
    builtIn: false,
  }).returning();

  return NextResponse.json({ success: true, data: created }, { status: 201 });
}
