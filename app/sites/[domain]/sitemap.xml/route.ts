import { NextResponse } from 'next/server';
import { getClientWebsiteByDomainCached as getClientWebsiteByDomain } from '@/lib/site-data-cache';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { siteBaseUrl } from '@/lib/sites/site-base-url';

// Explicit route handler replacing the former app/sites/[domain]/sitemap.ts
// metadata route: Next 16.3 invokes a nested dynamic-segment sitemap() with
// no arguments at request time, so its `{ params }` destructure threw on
// every tenant-host request (the long-red nightly "Cannot destructure
// property 'params'" failure). Route handlers receive params reliably.
export const dynamic = 'force-dynamic';

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function GET(_req: Request, ctx: { params: Promise<{ domain: string }> }) {
  const { domain } = await ctx.params;
  const site = await getClientWebsiteByDomain(domain);
  if (!site || !site.publicAccess) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const baseUrl = siteBaseUrl(site);

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
        isNull(posts.canonicalUrl),
      ),
    );

  const urls: Array<{ loc: string; lastmod?: string; priority: string }> = [
    { loc: baseUrl, priority: '1.0' },
  ];
  for (const post of sitePosts) {
    if (post.noIndex) continue;
    const loc =
      post.postType === 'blog'
        ? `${baseUrl}/blog/${post.slug}`
        : post.postType === 'home'
          ? baseUrl
          : `${baseUrl}/${post.slug}`;
    if (loc === baseUrl) continue;
    const lastmod = (post.updatedAt ?? post.publishedAt)?.toISOString();
    urls.push({ loc, lastmod, priority: post.postType === 'blog' ? '0.6' : '0.8' });
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url><loc>${xmlEscape(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<changefreq>weekly</changefreq><priority>${u.priority}</priority></url>`,
      )
      .join('\n') +
    `\n</urlset>\n`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
