import type { MetadataRoute } from 'next';
import {
  getClientWebsiteByDomainCached as getClientWebsiteByDomain,
} from '@/lib/site-data-cache';

interface RouteParams {
  params: Promise<{ domain: string }>;
}

export default async function robots({ params }: RouteParams): Promise<MetadataRoute.Robots> {
  const { domain } = await params;
  const site = await getClientWebsiteByDomain(domain);

  // Determine base URL for the sitemap pointer
  const baseUrl = site?.domain
    ? `https://${site.domain}`
    : site?.vercelDomain
      ? `https://${site.vercelDomain}`
      : site?.subdomain
        ? `https://${site.subdomain}.simplerdevelopment.com`
        : `https://${domain}`;

  // Sites that are not publicly accessible (gated / coming-soon) should not
  // be indexed. Also disallow when the site record is not found.
  if (!site || !site.publicAccess) {
    return {
      rules: {
        userAgent: '*',
        disallow: '/',
      },
    };
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
