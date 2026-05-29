import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { resolveFaviconUrlForClient } from '@/lib/branding';
import {
  getClientWebsiteByDomainCached as getClientWebsiteByDomain,
  getClientSiteNavItemsCached as getClientSiteNavItems,
  getBrandingByWebsiteIdCached as getBrandingByWebsiteId,
} from '@/lib/site-data-cache';
import Link from 'next/link';
import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { siteTracking } from '@/lib/db/schema';
import { SiteNavClient } from './SiteNavClient';
import { SiteFooter } from './SiteFooter';
import { TrackingScripts, TrackingNoscriptBody } from '@/components/sites/TrackingScripts';
import { cssFontStack, googleFontsHref } from '@/lib/blocks/page-fonts';
import { DeferredStylesheet } from '@/components/sites/DeferredStylesheet';

// Per-site footer contact overrides — keyed by subdomain. Hardcoded for now
// because brandingProfile schema doesn't yet have contact fields. When the
// branding schema gains those columns, drop this map and read from there.
const SITE_CONTACT_OVERRIDES: Record<string, {
  contactEmail?: string;
  contactPhone?: string;
  contactAddress?: string[];
  legalLinks?: Array<{ label: string; href: string }>;
  complianceNotes?: string[];
  trustBadges?: Array<{ src: string; alt: string; href?: string; width?: number; height?: number }>;
}> = {
  'cardiff-main': {
    contactEmail: 'info@cardiff.co',
    contactPhone: '888-234-0166',
    contactAddress: ['322 7th Street #2562', 'Del Mar, CA 92014'],
    legalLinks: [
      { label: 'Privacy Policy', href: '/privacy-policy' },
      { label: 'Legal Notices', href: '/legal-notices' },
      { label: 'Mobile Terms', href: '/mobile-terms-and-conditions' },
    ],
    complianceNotes: [
      'Cardiff is a registered trademark of Cardiff, used under license.',
      'California Lender License 60DBO-129171',
    ],
    trustBadges: [
      { src: 'https://cardiff.b-cdn.net/img/Seals/BBB-Logo.png', alt: 'BBB Accredited Business', width: 100, height: 37 },
      { src: 'https://cardiff.b-cdn.net/img/Seals/Secured-SSL-Logo.png', alt: 'Secured by SSL', width: 100, height: 37 },
    ],
  },
};

function getSiteContactInfo(subdomain: string | null) {
  return (subdomain && SITE_CONTACT_OVERRIDES[subdomain]) || {};
}

// 1:1 with clientWebsites — null means the row hasn't been initialised yet.
async function getTrackingConfigForWebsite(websiteId: number) {
  const rows = await db
    .select()
    .from(siteTracking)
    .where(eq(siteTracking.websiteId, websiteId))
    .limit(1);
  return rows[0] ?? null;
}

export const dynamic = 'force-dynamic';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ domain: string }>;
}

export async function generateMetadata({ params }: { params: Promise<{ domain: string }> }): Promise<Metadata> {
  const { domain } = await params;
  const site = await getClientWebsiteByDomain(domain);
  if (!site) return { title: 'Site Not Found' };

  if (!site.publicAccess) {
    return {
      title: site.name,
      robots: { index: false, follow: false },
    };
  }

  const branding = await getBrandingByWebsiteId(site.id);

  // Canonical URL based on the site's primary domain. Used for og:url and
  // metadataBase so client sites never leak the agency's simplerdevelopment.com.
  const canonicalUrl = `https://${site.domain}`;
  const description = site.description || undefined;
  // OG image fallback chain — prefer an explicit OG image, then any logo
  // the site has uploaded so X/Facebook share previews always have an image.
  const ogImageUrl =
    branding.ogImageUrl ||
    branding.logoUrl ||
    branding.logoSquareUrl ||
    undefined;
  const ogImages = ogImageUrl ? [{ url: ogImageUrl }] : undefined;

  const metadata: Metadata = {
    metadataBase: new URL(canonicalUrl),
    // `absolute` prevents the root layout's `%s | SimplerDevelopment`
    // template from being applied to this site layout's title. Pages
    // override this with their own absolute title via generateMetadata.
    title: { absolute: site.name },
    description,
    // Explicitly reset agency-level fields from the root layout's defaultSEO
    // so SimplerDevelopment branding never leaks into client sites.
    keywords: null,
    authors: null,
    creator: null,
    publisher: null,
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url: canonicalUrl,
      siteName: site.name,
      title: site.name,
      description,
      images: ogImages,
    },
    twitter: {
      card: 'summary_large_image',
      title: site.name,
      description,
      images: ogImageUrl ? [ogImageUrl] : undefined,
    },
  };

  const faviconUrl = await resolveFaviconUrlForClient(site.clientId, branding);
  if (faviconUrl) {
    // sizes:'any' marks the icon as scalable so browsers prefer it over any
    // ICO/PNG with a fixed size that may slip into the head from elsewhere.
    metadata.icons = { icon: [{ url: faviconUrl, sizes: 'any' }] };
  }

  // Search-engine verification meta tags. We already short-circuited above for
  // gated sites, so reaching this branch implies the site is publicly indexed
  // — only then do verification tags carry any value.
  const trackingConfig = await getTrackingConfigForWebsite(site.id);
  if (trackingConfig && trackingConfig.enabled !== false) {
    const otherVerification: Record<string, string> = {};
    if (trackingConfig.bingVerification) {
      otherVerification['msvalidate.01'] = trackingConfig.bingVerification;
    }
    if (trackingConfig.pinterestVerification) {
      otherVerification['p:domain_verify'] = trackingConfig.pinterestVerification;
    }
    const hasGoogle = !!trackingConfig.gscVerification;
    const hasOther = Object.keys(otherVerification).length > 0;
    if (hasGoogle || hasOther) {
      metadata.verification = {
        ...(hasGoogle ? { google: trackingConfig.gscVerification as string } : {}),
        ...(hasOther ? { other: otherVerification } : {}),
      };
    }
  }

  return metadata;
}

export default async function ClientSiteLayout({ children, params }: LayoutProps) {
  const { domain } = await params;
  const site = await getClientWebsiteByDomain(domain);

  if (!site) {
    notFound();
  }

  // Bare layout for preview pages and pitch decks (no nav/footer chrome).
  // /slides is the live deck route; /pitch-deck is the legacy path kept for
  // any old links still in the wild.
  const headersList = await headers();
  const sitePathname = headersList.get('x-site-pathname') || '';
  if (
    sitePathname.includes('/nav-preview') ||
    sitePathname.startsWith('/pitch-deck') ||
    sitePathname.startsWith('/slides') ||
    sitePathname.startsWith('/designer')
  ) {
    return <>{children}</>;
  }
  // Template preview keeps the layout wrapper so customCss / customJs cascade
  // identically to the live site (a `body { background: red }` rule on a
  // type, for example, has to contend with the same wrapping div on both
  // sides). The fixed nav is still hidden — the full-screen editor doesn't
  // need it and it'd cover the post-content slot.
  const isTemplatePreview = sitePathname.startsWith('/template-preview');

  const branding = await getBrandingByWebsiteId(site.id);

  // Tracking is suppressed on gated/in-development sites so unfinished URLs
  // never reach GA / Meta / etc. Preview-unlock logic lives in
  // [[...slug]]/page.tsx; mirroring it here would duplicate state.
  const trackingConfig = site.publicAccess ? await getTrackingConfigForWebsite(site.id) : null;

  // Build link + button brand styles.
  // The h1-h6 rule wires up `--brand-heading-font` (set by lib/branding/css-vars
  // via the site stylesheet) — without it, headings inherit the body font
  // and the brandingProfile.headingFont value silently has no effect.
  const brandStyles = [
    branding.headingFont && `h1, h2, h3, h4, h5, h6 { font-family: ${cssFontStack(branding.headingFont, 'system-ui, sans-serif')}; }`,
    branding.linkColor && `a { color: ${branding.linkColor}; }`,
    branding.linkHoverColor && `a:hover { color: ${branding.linkHoverColor}; }`,
    branding.buttonStyle?.primaryHoverBg && `.brand-btn-primary:hover { background-color: ${branding.buttonStyle.primaryHoverBg} !important; }`,
    branding.buttonStyle?.secondaryHoverBg && `.brand-btn-secondary:hover { background-color: ${branding.buttonStyle.secondaryHoverBg} !important; }`,
  ].filter(Boolean).join('\n');

  // Google Fonts for branding fonts.
  //
  // We deliberately request the family WITHOUT a weight specifier. The
  // explicit `:ital,wght@0,300;0,400;...;1,700` syntax fails silently for
  // single-weight display fonts (Alfa Slab One, Bungee, Anton, Ultra, etc.) —
  // when the API can't fulfill every requested weight it returns nothing for
  // that family, and the font never loads. Requesting just `family=Name`
  // returns every weight that font actually has (variable fonts return the
  // full axis; single-weight fonts return 400). Browsers faux-bold / faux-
  // italic as needed for any weight CSS the page actually uses.
  // Reduce each branding font to its bare family name before requesting it —
  // values may be stored as full CSS stacks ("Raleway, -apple-system, ...")
  // which produce a malformed (dead) css2 request. googleFontsHref dedupes and
  // appends display=swap.
  const googleFontsUrl = googleFontsHref([branding.headingFont, branding.bodyFont]);

  // Custom layout mode: blocks handle their own nav/footer/styling
  if (site.customLayout) {
    return (
      <>
        <TrackingNoscriptBody config={trackingConfig} />
        <TrackingScripts config={trackingConfig} />
        {brandStyles && <style dangerouslySetInnerHTML={{ __html: brandStyles }} />}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {googleFontsUrl && <DeferredStylesheet href={googleFontsUrl} />}
        <DeferredStylesheet href="https://fonts.googleapis.com/icon?family=Material+Icons" />
        <div className="min-h-screen" style={{ scrollBehavior: 'smooth', fontFamily: cssFontStack(branding.bodyFont, 'system-ui, sans-serif') || 'system-ui, sans-serif' }}>
          {children}
        </div>
      </>
    );
  }

  // Standard layout with branded nav
  const navItems = await getClientSiteNavItems(site.id);
  // When the site is being accessed via the main app host (e.g. localhost:3000
  // or the SimplerDevelopment portal domain), Next.js serves it under
  // /sites/{domain}/... so all internal hrefs need that prefix. When the site
  // is reached via its own host (e.g. postcaptain.simplerdevelopment.com),
  // middleware rewrites internally and the public URLs are at the root.
  const requestHost = headersList.get('host') || '';
  // Strip port for comparison; domain in DB never includes a port.
  const requestHostNoPort = requestHost.split(':')[0];
  const isOnSiteHost = requestHostNoPort === domain;
  const basePath = isOnSiteHost ? '' : `/sites/${domain}`;
  const isTransparent = branding.navTemplate === 'transparent';
  // The fixed nav is hidden when the branding template is 'none' OR when
  // we're rendering a template-preview iframe (the editor doesn't need
  // chrome and the fixed nav would cover the post-content slot).
  const hideNav = branding.navTemplate === 'none' || isTemplatePreview;
  const navBg = isTransparent ? 'transparent' : (branding.navBackground || '#ffffff');
  const navText = isTransparent ? '#ffffff' : (branding.navTextColor || '#1e293b');
  const primaryColor = branding.primaryColor || '#cfa122';
  const secondaryColor = branding.secondaryColor || '#0a1628';

  return (
    <>
      <TrackingNoscriptBody config={trackingConfig} />
      <TrackingScripts config={trackingConfig} />
      {brandStyles && <style dangerouslySetInnerHTML={{ __html: brandStyles }} />}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      {googleFontsUrl && <link href={googleFontsUrl} rel="stylesheet" />}
      <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
      <div
        className="min-h-screen flex flex-col"
        style={{
          backgroundColor: branding.backgroundColor || '#ffffff',
          color: branding.textColor || '#1e293b',
          fontFamily: cssFontStack(branding.bodyFont, 'system-ui, sans-serif') || 'system-ui, sans-serif',
          scrollBehavior: 'smooth',
        }}
      >
        {!hideNav && (
          <SiteNavClient
            siteName={site.name}
            navItems={navItems}
            isTransparent={isTransparent}
            navBg={navBg}
            navText={navText}
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            logoUrl={branding.logoUrl || undefined}
            logoAlt={branding.logoAlt || site.name}
            buttonStyle={branding.buttonStyle}
            headingFont={branding.headingFont || undefined}
            bodyFont={branding.bodyFont || undefined}
            navTemplate={branding.navTemplate || undefined}
            basePath={basePath}
          />
        )}

        {/* Reserve space for the fixed nav so the first block (typically a hero)
            isn't clipped underneath it. Only the opaque templates need this —
            the 'transparent' template deliberately overlays a full-bleed hero,
            and a hidden nav needs no offset. The 72px fallback matches the
            desktop nav height before SiteNavClient measures the real value. */}
        <main
          className="flex-1"
          style={!isTransparent && !hideNav ? { paddingTop: 'var(--site-nav-h, 72px)' } : undefined}
        >
          {children}
        </main>

        {/* Footer is universal — renders nav-derived columns + brand contact
            info. Sites with customLayout=true take the earlier return branch
            above and ship their own chrome (which is why this is only here). */}
        <SiteFooter
          siteName={site.name}
          navItems={navItems}
          primaryColor={primaryColor}
          secondaryColor={secondaryColor}
          logoUrl={branding.logoUrl || undefined}
          logoAlt={branding.logoAlt || site.name}
          headingFont={branding.headingFont || undefined}
          bodyFont={branding.bodyFont || undefined}
          basePath={basePath}
          {...getSiteContactInfo(site.subdomain)}
        />
      </div>
    </>
  );
}
