import type { MetadataRoute } from 'next';
import {
  getClientWebsiteByDomainCached as getClientWebsiteByDomain,
} from '@/lib/site-data-cache';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';

interface RouteParams {
  params: Promise<{ domain: string }>;
}

export default async function sitemap({ params }: RouteParams): Promise<MetadataRoute.Sitemap> {
  const { domain } = await params;
  const site = await getClientWebsiteByDomain(domain);

  // If site not found, not public, or overall noindex — return empty sitemap
  if (!site || !site.publicAccess) return [];

  // Determine base URL: prefer custom domain, fall back to vercel subdomain
  const baseUrl = site.domain
    ? `https://${site.domain}`
    : site.vercelDomain
      ? `https://${site.vercelDomain}`
      : `https://${site.subdomain}.simplerdevelopment.com`;

  // Fetch all published, indexable posts for this site
  const sitePosts = await db
    .select({
      slug: posts.slug,
      postType: posts.postType,
      noIndex: posts.noIndex,
      publishedAt: posts.publishedAt,
      updatedAt: posts.updatedAt,
    })
    .from(posts)
    .where(
      and(
        eq(posts.websiteId, site.id),
        eq(posts.published, true),
        isNull(posts.canonicalUrl), // posts with a canonical pointing elsewhere are not the source
      ),
    );

  const entries: MetadataRoute.Sitemap = [];

  // Always include the root URL
  entries.push({
    url: baseUrl,
    changeFrequency: 'weekly',
    priority: 1.0,
  });

  for (const post of sitePosts) {
    // Skip individually no-indexed posts
    if (post.noIndex) continue;

    const lastModified = post.updatedAt ?? post.publishedAt ?? undefined;

    let url: string;
    if (post.postType === 'blog') {
      url = `${baseUrl}/blog/${post.slug}`;
    } else if (post.postType === 'page' || post.postType === 'home') {
      // Home-page post maps to /, other pages to /<slug>
      url = post.postType === 'home' ? baseUrl : `${baseUrl}/${post.slug}`;
    } else {
      // Custom post types: render under /<slug> (same as the site router)
      url = `${baseUrl}/${post.slug}`;
    }

    // Skip root duplicate (already added above)
    if (url === baseUrl || url === `${baseUrl}/`) continue;

    entries.push({
      url,
      lastModified,
      changeFrequency: 'weekly',
      priority: post.postType === 'blog' ? 0.6 : 0.8,
    });
  }

  return entries;
}
