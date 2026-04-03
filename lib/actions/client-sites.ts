'use server';

import { db } from '@/lib/db';
import { clientWebsites, posts, categories, postCategories, pitchDecks, clients } from '@/lib/db/schema';
import { eq, and, or } from 'drizzle-orm';

export async function getClientWebsiteByDomain(domain: string) {
  // Try exact domain match first
  const [site] = await db
    .select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.domain, domain), eq(clientWebsites.active, true)))
    .limit(1);

  if (site) return site;

  // Try subdomain match (e.g. sd-testing.simplerdevelopment.com → subdomain "sd-testing")
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
  const conditions = [
    eq(posts.websiteId, websiteId),
    eq(posts.slug, slug),
    or(eq(posts.postType, 'page'), eq(posts.postType, 'blog')),
  ];
  if (!preview) conditions.push(eq(posts.published, true));

  const [page] = await db
    .select()
    .from(posts)
    .where(and(...conditions))
    .limit(1);

  return page ?? null;
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
