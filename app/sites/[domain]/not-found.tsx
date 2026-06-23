/**
 * Tenant-scoped 404. Rendered whenever a route under /sites/[domain]/** calls
 * `notFound()` (or when the catch-all slug doesn't match a CMS post). Renders
 * inside the parent layout, so nav + footer + brand fonts + brand CSS vars
 * are already applied — this file only needs to fill the <main> slot with
 * branded body content.
 *
 * Next.js does NOT pass route params to not-found.tsx, so the domain is
 * recovered from the `x-site-domain` header that middleware.ts sets on every
 * /sites/[domain]/** request (both the custom-host rewrite branch and the
 * app-host pass-through branch). Branding + nav items are then loaded via
 * the same cached resolvers the layout uses, so there's no extra DB round
 * trip on warm requests.
 *
 * Multi-tenant safe: falls back to a neutral brand-agnostic 404 if the domain
 * can't be resolved (e.g. someone hits /sites/<unknown>/ directly).
 */

import Link from 'next/link';
import { headers } from 'next/headers';
import {
  getClientWebsiteByDomainCached as getClientWebsiteByDomain,
  getClientSiteNavItemsCached as getClientSiteNavItems,
  getBrandingByWebsiteIdCached as getBrandingByWebsiteId,
} from '@/lib/site-data-cache';

export default async function SiteNotFound() {
  const h = await headers();
  const domain = h.get('x-site-domain') || '';

  // Sensible defaults for the brand-agnostic fallback path.
  let siteName = 'this site';
  let primary = '#1c3370';
  let secondary = '#25418b';
  let accent = '#5ac96f';
  let popular: { label: string; href: string }[] = [];
  let basePath = '';

  if (domain) {
    const site = await getClientWebsiteByDomain(domain);
    if (site) {
      siteName = site.name;
      const branding = await getBrandingByWebsiteId(site.id);
      primary = branding.primaryColor || primary;
      secondary = branding.secondaryColor || secondary;
      accent = branding.accentColor || accent;

      // Top-level nav items become the "where to go next" grid. Restrict to
      // the first 6 so the section reads as a curated list, not a sitemap.
      const navItems = await getClientSiteNavItems(site.id);
      popular = navItems
        .filter(n => n.parentId === null)
        .slice(0, 6)
        .map(n => ({ label: n.label, href: n.href }));

      // Mirror the layout's basePath logic: when the request is served via the
      // main app host (e.g. localhost:3000/sites/<domain>/...) every internal
      // link needs the /sites/<domain> prefix; on the site's own host, root.
      const requestHost = (h.get('host') || '').split(':')[0];
      basePath = requestHost === domain ? '' : `/sites/${domain}`;
    }
  }

  const homeHref = basePath || '/';
  const prefix = (href: string) =>
    href.startsWith('http') || href.startsWith('mailto:') ? href : `${basePath}${href.startsWith('/') ? '' : '/'}${href}`;

  return (
    <div
      className="relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`,
        color: '#ffffff',
      }}
    >
      {/* Decorative diagonal accent — mirrors the site's hero treatment so
          the 404 reads as part of the same brand family rather than a generic
          Next.js fallback. */}
      <div
        aria-hidden
        className="absolute inset-y-0 right-0 w-1/2 opacity-20"
        style={{
          background: `linear-gradient(45deg, transparent 40%, ${accent} 100%)`,
          clipPath: 'polygon(20% 0, 100% 0, 100% 100%, 0 100%)',
        }}
      />

      <div className="relative max-w-5xl mx-auto px-6 py-24 sm:py-32 text-center">
        <span
          className="material-icons mb-6"
          style={{ fontSize: 72, color: accent }}
          aria-hidden
        >
          explore_off
        </span>

        <p
          className="text-sm font-semibold tracking-widest uppercase mb-3"
          style={{ color: accent, opacity: 0.95 }}
        >
          Error 404
        </p>

        <h1
          className="text-4xl sm:text-6xl font-bold mb-5 leading-tight"
          style={{ fontFamily: 'var(--brand-heading-font, inherit)' }}
        >
          We couldn&rsquo;t find that page.
        </h1>

        <p className="text-base sm:text-lg max-w-2xl mx-auto mb-10 opacity-90">
          The link may be out of date, or the page may have moved. Here are a
          few places on {siteName} that might help you get where you&rsquo;re going.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
          <Link
            href={homeHref}
            className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full font-semibold text-base transition-transform hover:scale-105"
            style={{
              backgroundColor: accent,
              color: '#0a1628',
            }}
          >
            <span className="material-icons text-lg" aria-hidden>home</span>
            Back to home
          </Link>
          <Link
            href={`${homeHref}#contact`}
            className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full font-semibold text-base border-2 transition-colors hover:bg-white/10"
            style={{ borderColor: '#ffffff', color: '#ffffff' }}
          >
            <span className="material-icons text-lg" aria-hidden>support_agent</span>
            Talk to a specialist
          </Link>
        </div>

        {popular.length > 0 && (
          <div className="border-t border-white/20 pt-10 mt-2">
            <h2 className="text-sm font-semibold tracking-widest uppercase mb-6 opacity-80">
              Popular pages
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-3xl mx-auto">
              {popular.map(item => (
                <Link
                  key={item.href}
                  href={prefix(item.href)}
                  className="group flex items-center justify-between gap-2 px-4 py-3 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-left text-sm font-medium"
                >
                  <span className="truncate">{item.label}</span>
                  <span
                    className="material-icons text-base opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
                    aria-hidden
                  >
                    arrow_forward
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
