import { NextResponse } from 'next/server';
import { getClientWebsiteByDomainCached as getClientWebsiteByDomain } from '@/lib/site-data-cache';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { siteBaseUrl } from '@/lib/sites/site-base-url';

// llms.txt (https://llmstxt.org): a concise, markdown index of the site for
// AI/answer engines — H1 name, blockquote summary, then link sections.
// Assembled purely from real site data (site name/description, published
// posts' titles/excerpts) — nothing invented. Gated sites return 404.
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ domain: string }> }) {
  const { domain } = await ctx.params;
  const site = await getClientWebsiteByDomain(domain);
  if (!site || !site.publicAccess) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const baseUrl = siteBaseUrl(site);
  const rows = await db
    .select({
      slug: posts.slug,
      title: posts.title,
      postType: posts.postType,
      excerpt: posts.excerpt,
      seoDescription: posts.seoDescription,
      noIndex: posts.noIndex,
    })
    .from(posts)
    .where(and(eq(posts.websiteId, site.id), eq(posts.published, true)));

  const clean = (s: string | null | undefined) =>
    (s ?? '').replace(/\s+/g, ' ').trim();
  const line = (title: string, url: string, desc?: string | null) => {
    const d = clean(desc);
    return `- [${clean(title)}](${url})${d ? `: ${d.slice(0, 160)}` : ''}`;
  };

  const pages: string[] = [];
  const articles: string[] = [];
  for (const p of rows) {
    if (p.noIndex) continue;
    const desc = p.seoDescription || p.excerpt;
    if (p.postType === 'blog') {
      articles.push(line(p.title, `${baseUrl}/blog/${p.slug}`, desc));
    } else if (p.slug !== 'home' && p.slug !== 'blog') {
      pages.push(line(p.title, `${baseUrl}/${p.slug}`, desc));
    }
  }

  const parts = [
    `# ${site.name}`,
    '',
    ...(site.description ? [`> ${clean(site.description)}`, ''] : []),
    `Site: ${baseUrl}`,
    '',
    ...(pages.length ? ['## Pages', '', ...pages, ''] : []),
    ...(articles.length ? ['## Articles', '', ...articles, ''] : []),
    '## Optional',
    '',
    `- [Sitemap](${baseUrl}/sitemap.xml)`,
    '',
  ];

  return new NextResponse(parts.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
