import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clientWebsites, siteNavigation, siteBranding } from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';

// Public endpoint for starter repos to fetch navigation + branding
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;

  const [site] = await db
    .select({ id: clientWebsites.id, name: clientWebsites.name })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, parseInt(siteId)), eq(clientWebsites.active, true)))
    .limit(1);

  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const [navItems, [branding]] = await Promise.all([
    // Explicit field projection — must NOT include `draft` (draft jsonb stages
    // unpublished nav edits; leaking it here would expose unpublished changes
    // to the public site renderer / starter repos).
    db
      .select({
        id: siteNavigation.id,
        websiteId: siteNavigation.websiteId,
        label: siteNavigation.label,
        href: siteNavigation.href,
        parentId: siteNavigation.parentId,
        sortOrder: siteNavigation.sortOrder,
        openInNewTab: siteNavigation.openInNewTab,
        isButton: siteNavigation.isButton,
        description: siteNavigation.description,
        icon: siteNavigation.icon,
        featuredImage: siteNavigation.featuredImage,
        columnGroup: siteNavigation.columnGroup,
      })
      .from(siteNavigation)
      .where(eq(siteNavigation.websiteId, site.id))
      .orderBy(asc(siteNavigation.sortOrder)),
    db
      .select()
      .from(siteBranding)
      .where(eq(siteBranding.websiteId, site.id))
      .limit(1),
  ]);

  // Build nested structure
  const topLevel = navItems.filter(i => !i.parentId);
  const children = navItems.filter(i => i.parentId);
  const nested = topLevel.map(item => ({
    ...item,
    children: children.filter(c => c.parentId === item.id),
  }));

  return NextResponse.json({
    success: true,
    data: {
      siteName: site.name,
      navigation: nested,
      branding: branding || {
        logoUrl: '',
        primaryColor: '#2563eb',
        secondaryColor: '#1e40af',
        accentColor: '#f59e0b',
        backgroundColor: '#ffffff',
        textColor: '#111827',
        navTemplate: 'classic',
        navPosition: 'top',
        navBackground: '#ffffff',
        navTextColor: '#111827',
      },
    },
  }, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
