import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { clientWebsites, siteNavigation } from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';

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

  const items = await db
    .select()
    .from(siteNavigation)
    .where(eq(siteNavigation.websiteId, site.id))
    .orderBy(asc(siteNavigation.sortOrder));

  return NextResponse.json({ success: true, data: items });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const site = await verifySiteAccess(siteId);
  if (!site) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { items } = await req.json() as {
    items: { id?: number; label: string; href: string; parentId?: number | null; sortOrder: number; openInNewTab?: boolean; isButton?: boolean; description?: string; icon?: string; featuredImage?: string; columnGroup?: number }[];
  };

  if (!Array.isArray(items)) {
    return NextResponse.json({ success: false, message: 'items array required' }, { status: 400 });
  }

  // Delete existing and re-insert (simpler than diffing for ordered lists)
  await db.delete(siteNavigation).where(eq(siteNavigation.websiteId, site.id));

  if (items.length > 0) {
    const parentMap = new Map<number, number>(); // old temp id -> new real id

    // Insert top-level items first
    const topLevel = items.filter(i => !i.parentId);
    const children = items.filter(i => i.parentId);

    for (const item of topLevel) {
      const [inserted] = await db.insert(siteNavigation).values({
        websiteId: site.id,
        label: item.label,
        href: item.href,
        parentId: null,
        sortOrder: item.sortOrder,
        openInNewTab: item.openInNewTab ?? false,
        isButton: item.isButton ?? false,
        description: item.description || null,
        icon: item.icon || null,
        featuredImage: item.featuredImage || null,
        columnGroup: item.columnGroup ?? null,
      }).returning();
      if (item.id) parentMap.set(item.id, inserted.id);
    }

    // Insert children with resolved parent IDs
    for (const item of children) {
      const resolvedParentId = item.parentId ? (parentMap.get(item.parentId) ?? item.parentId) : null;
      await db.insert(siteNavigation).values({
        websiteId: site.id,
        label: item.label,
        href: item.href,
        parentId: resolvedParentId,
        sortOrder: item.sortOrder,
        openInNewTab: item.openInNewTab ?? false,
        isButton: item.isButton ?? false,
        description: item.description || null,
        icon: item.icon || null,
        featuredImage: item.featuredImage || null,
        columnGroup: item.columnGroup ?? null,
      });
    }
  }

  const updated = await db
    .select()
    .from(siteNavigation)
    .where(eq(siteNavigation.websiteId, site.id))
    .orderBy(asc(siteNavigation.sortOrder));

  return NextResponse.json({ success: true, data: updated });
}
