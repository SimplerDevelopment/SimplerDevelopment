import { NextResponse } from 'next/server';
import { getClientWebsiteByDomainCached as getClientWebsiteByDomain } from '@/lib/site-data-cache';
import { siteBaseUrl } from '@/lib/sites/site-base-url';

// Explicit route handler replacing the former app/sites/[domain]/robots.ts
// metadata route (same Next 16.3 bare-invocation params bug as the sitemap —
// see sitemap.xml/route.ts). Gated/unknown sites get a full disallow.
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ domain: string }> }) {
  const { domain } = await ctx.params;
  const site = await getClientWebsiteByDomain(domain);

  const body =
    !site || !site.publicAccess
      ? 'User-agent: *\nDisallow: /\n'
      : `User-agent: *\nAllow: /\n\nSitemap: ${siteBaseUrl(site)}/sitemap.xml\n`;

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
