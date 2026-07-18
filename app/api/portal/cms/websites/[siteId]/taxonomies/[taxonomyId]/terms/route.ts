import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { clientWebsites, taxonomies, taxonomyTerms } from '@/lib/db/schema';
import { and, asc, eq, isNull, or } from 'drizzle-orm';

async function verifyTaxonomyAccess(siteId: string, taxonomyId: string) {
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
  if (!site) return null;

  // Taxonomy must belong to this site or be a global built-in
  const [taxonomy] = await db
    .select()
    .from(taxonomies)
    .where(and(
      eq(taxonomies.id, parseInt(taxonomyId)),
      or(eq(taxonomies.websiteId, site.id), and(eq(taxonomies.builtIn, true), isNull(taxonomies.websiteId)))
    ))
    .limit(1);

  return taxonomy ? { site, taxonomy } : null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string; taxonomyId: string }> },
) {
  const { siteId, taxonomyId } = await params;
  const access = await verifyTaxonomyAccess(siteId, taxonomyId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const terms = await db
    .select()
    .from(taxonomyTerms)
    .where(eq(taxonomyTerms.taxonomyId, access.taxonomy.id))
    .orderBy(asc(taxonomyTerms.sortOrder), asc(taxonomyTerms.name));

  return NextResponse.json({ success: true, data: terms });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string; taxonomyId: string }> },
) {
  const { siteId, taxonomyId } = await params;
  const access = await verifyTaxonomyAccess(siteId, taxonomyId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { name, slug, description, color, parentId } = body;

  if (!name || !slug) {
    return NextResponse.json({ success: false, message: 'Name and slug are required' }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: taxonomyTerms.id })
    .from(taxonomyTerms)
    .where(and(eq(taxonomyTerms.slug, slug), eq(taxonomyTerms.taxonomyId, access.taxonomy.id)))
    .limit(1);

  if (existing) {
    return NextResponse.json({ success: false, message: 'A term with this slug already exists' }, { status: 409 });
  }

  const [created] = await db.insert(taxonomyTerms).values({
    taxonomyId: access.taxonomy.id,
    name,
    slug,
    description: description || null,
    color: color || null,
    parentId: parentId || null,
    sortOrder: 0,
  }).returning();

  return NextResponse.json({ success: true, data: created }, { status: 201 });
}
