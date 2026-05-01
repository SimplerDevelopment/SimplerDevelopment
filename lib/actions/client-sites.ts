'use server';

import { db } from '@/lib/db';
import { clientWebsites, posts, categories, postCategories, pitchDecks, clients, siteNavigation, websiteDomains, postTypes } from '@/lib/db/schema';
import { eq, and, or, asc, isNull, sql } from 'drizzle-orm';

export async function getClientWebsiteByDomain(domain: string) {
  // Try exact match on the legacy primary-domain column first
  const [site] = await db
    .select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.domain, domain), eq(clientWebsites.active, true)))
    .limit(1);

  if (site) return site;

  // Try the website_domains table, which stores every custom domain attached
  // to a site (including secondary / non-primary ones used by shared hosting).
  const [via] = await db
    .select({ site: clientWebsites })
    .from(websiteDomains)
    .innerJoin(clientWebsites, eq(websiteDomains.websiteId, clientWebsites.id))
    .where(and(eq(websiteDomains.domain, domain), eq(clientWebsites.active, true)))
    .limit(1);

  if (via?.site) return via.site;

  // Fall back to subdomain match (e.g. sd-testing.simplerdevelopment.com → subdomain "sd-testing")
  const subdomainMatch = domain.match(/^([^.]+)\.simplerdevelopment\.com$/);
  if (subdomainMatch) {
    const [subSite] = await db
      .select()
      .from(clientWebsites)
      .where(and(eq(clientWebsites.subdomain, subdomainMatch[1]), eq(clientWebsites.active, true)))
      .limit(1);
    return subSite ?? null;
  }

  return null;
}

export async function getClientPage(websiteId: number, slug: string, preview = false) {
  // Match any post type — pages, blog posts, and any custom post type
  // (solution, service, case-study, guide, portal-demo, …) can all live at
  // /<slug>. The slug is the full URL path (e.g. "solution/admissions") for
  // CPTs whose WordPress URLs include a type prefix; this preserves the
  // original site structure when mirroring.
  const conditions = [
    eq(posts.websiteId, websiteId),
    eq(posts.slug, slug),
  ];
  if (!preview) conditions.push(eq(posts.published, true));

  const [page] = await db
    .select()
    .from(posts)
    .where(and(...conditions))
    .limit(1);

  return page ?? null;
}

/**
 * Resolve the post_types row that matches a post (by slug) on this website,
 * falling back to a built-in (websiteId IS NULL) row of the same slug. Used
 * to apply per-CPT custom CSS / JS / template at render time.
 */
export async function getPostTypeForPost(websiteId: number, postType: string) {
  if (!postType) return null;
  const [row] = await db
    .select()
    .from(postTypes)
    .where(and(
      eq(postTypes.slug, postType),
      or(eq(postTypes.websiteId, websiteId), isNull(postTypes.websiteId))
    ))
    // Site-specific overrides win over global built-ins. websiteId IS NULL
    // for built-ins; we want non-NULL first → desc with NULLS-last semantics.
    // Drizzle's `desc()` puts NULLs LAST in Postgres, which is what we want.
    .orderBy(sql`${postTypes.websiteId} DESC NULLS LAST`)
    .limit(1);
  return row ?? null;
}

export async function getClientHomePage(websiteId: number, preview = false) {
  // Try to find a page with slug 'home' or 'index', fall back to first published page
  for (const slug of ['home', 'index']) {
    const page = await getClientPage(websiteId, slug, preview);
    if (page) return page;
  }

  // Fall back to the first page (published only unless preview)
  const conditions = [
    eq(posts.websiteId, websiteId),
    eq(posts.postType, 'page'),
  ];
  if (!preview) conditions.push(eq(posts.published, true));

  const [page] = await db
    .select()
    .from(posts)
    .where(and(...conditions))
    .limit(1);

  return page ?? null;
}

export async function getClientBlogPosts(websiteId: number) {
  return db
    .select()
    .from(posts)
    .where(
      and(
        eq(posts.websiteId, websiteId),
        eq(posts.published, true),
        eq(posts.postType, 'blog'),
      )
    )
    .orderBy(posts.publishedAt);
}

export async function getPitchDeckByDomainAndSlug(domain: string, slug: string) {
  // Find client by domain or subdomain
  const website = await getClientWebsiteByDomain(domain);
  if (!website) return null;
  const site = { clientId: website.clientId };

  const [deck] = await db
    .select()
    .from(pitchDecks)
    .where(
      and(
        eq(pitchDecks.clientId, site.clientId),
        eq(pitchDecks.slug, slug),
        eq(pitchDecks.status, 'published'),
      )
    )
    .limit(1);

  return deck ?? null;
}

export async function getClientPitchDecks(domain: string) {
  const website = await getClientWebsiteByDomain(domain);
  if (!website) return [];
  const site = { clientId: website.clientId };

  return db
    .select({ id: pitchDecks.id, title: pitchDecks.title, slug: pitchDecks.slug })
    .from(pitchDecks)
    .where(and(eq(pitchDecks.clientId, site.clientId), eq(pitchDecks.status, 'published')));
}

export async function getClientSiteNav(websiteId: number) {
  // Return published pages for navigation
  return db
    .select({ id: posts.id, title: posts.title, slug: posts.slug, postType: posts.postType })
    .from(posts)
    .where(
      and(
        eq(posts.websiteId, websiteId),
        eq(posts.published, true),
        eq(posts.postType, 'page'),
      )
    )
    .orderBy(posts.createdAt);
}

export type NavItem = {
  id: number;
  label: string;
  href: string;
  parentId: number | null;
  sortOrder: number;
  openInNewTab: boolean;
  isButton: boolean;
  children?: NavItem[];
};

export async function getClientSiteNavItems(websiteId: number): Promise<NavItem[]> {
  const rows = await db
    .select()
    .from(siteNavigation)
    .where(eq(siteNavigation.websiteId, websiteId))
    .orderBy(asc(siteNavigation.sortOrder));

  // Build tree: top-level items with nested children
  const topLevel = rows.filter(r => !r.parentId);
  return topLevel.map(item => ({
    id: item.id,
    label: item.label,
    href: item.href,
    parentId: item.parentId,
    sortOrder: item.sortOrder,
    openInNewTab: item.openInNewTab,
    isButton: item.isButton,
    children: rows
      .filter(r => r.parentId === item.id)
      .map(child => ({
        id: child.id,
        label: child.label,
        href: child.href,
        parentId: child.parentId,
        sortOrder: child.sortOrder,
        openInNewTab: child.openInNewTab,
        isButton: child.isButton,
      })),
  }));
}
