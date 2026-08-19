/**
 * Canonical public base URL for a tenant site: custom domain first, then the
 * Vercel-attached domain, then the platform subdomain. Shared by the tenant
 * SEO surface (sitemap.xml / robots.txt / llms.txt route handlers).
 */
export function siteBaseUrl(site: {
  domain?: string | null;
  vercelDomain?: string | null;
  subdomain?: string | null;
}): string {
  return site.domain
    ? `https://${site.domain}`
    : site.vercelDomain
      ? `https://${site.vercelDomain}`
      : `https://${site.subdomain}.simplerdevelopment.com`;
}
