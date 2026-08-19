import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
// ITM-028: metric-adjusted @font-face fallbacks (Montserrat/Inter) that
// reduce hero-text CLS on the font swap. See the file for the full
// rationale/math — deliberately NOT folded into the brandStyles block below.
// (Re-landed: the original shipped inside #64 and was collateral of that
// revert — this CSS is pure metrics, unrelated to the sharp outage.)
import '../font-metric-fallbacks.css';
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
import { SiteRouteProgress } from '@/components/sites/SiteRouteProgress';
import { siteBaseUrl } from '@/lib/sites/site-base-url';
import { organizationSchema, webSiteSchema, jsonLd } from '@/lib/sites/structured-data';

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
  theme?: { background?: string; text?: string; heading?: string; border?: string };
}> = {
  // ponytail: intentionally empty — per-site contact data belongs in the
  // branding profile, not platform source. Populate via tenant config.
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
    sitePathname.startsWith('/designer') ||
    sitePathname.startsWith('/design/')
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
    // Map the brand primary onto the THEME token inside the tenant wrapper.
    // Typed blocks color accents with Tailwind's `text-primary`/`bg-primary`
    // (e.g. Card icons, card-title hover), which resolve to the PLATFORM's
    // `--primary` unless the site overrides it — so every tenant's icon cards
    // showed the platform default (a blue) instead of their brand color
    // (operator-reported). Scoped to .force-light (the tenant wrapper on both
    // layout branches); this <style> renders in <body>, after globals.css, so
    // it wins the equal-specificity cascade. `--secondary` is deliberately NOT
    // mapped: in the theme it is a muted surface token, and painting it with
    // a dark brand color would repaint neutral backgrounds site-wide.
    branding.primaryColor && `.force-light { --primary: ${branding.primaryColor}; }`,
    branding.headingFont && `h1, h2, h3, h4, h5, h6 { font-family: ${cssFontStack(branding.headingFont, 'system-ui, sans-serif')}; }`,
    // Scoped to CLASSLESS anchors: these rules exist to color prose links,
    // but a bare `a:hover` (specificity 0,1,1) also beats every styled
    // button's resting color (.some-btn = 0,1,0) — flipping button text to
    // the link-hover color on hover (unreadable accent-on-accent, operator-
    // reported). Component-styled anchors carry classes and own their colors.
    branding.linkColor && `a:not([class]) { color: ${branding.linkColor}; }`,
    branding.linkHoverColor && `a:not([class]):hover { color: ${branding.linkHoverColor}; }`,
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

  // Organization + WebSite JSON-LD, once per page, from real site fields
  // (name / canonical base URL / description / branding logo) — the AEO/SEO
  // baseline every tenant site should carry. BlogPosting is emitted per-post
  // by the page route.
  const ldBaseUrl = siteBaseUrl(site);
  const ldJson = [
    organizationSchema({ name: site.name, baseUrl: ldBaseUrl, description: site.description, logoUrl: branding.logoUrl }),
    webSiteSchema({ name: site.name, baseUrl: ldBaseUrl, description: site.description }),
  ].map(jsonLd);
  const ldScripts = ldJson.map((j, i) => (
    <script key={`ld-${i}`} type="application/ld+json" dangerouslySetInnerHTML={{ __html: j }} />
  ));

  // Custom layout mode: blocks handle their own nav/footer/styling
  if (site.customLayout) {
    return (
      <>
        <TrackingNoscriptBody config={trackingConfig} />
        <TrackingScripts config={trackingConfig} />
        {ldScripts}
        {brandStyles && <style dangerouslySetInnerHTML={{ __html: brandStyles }} />}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {googleFontsUrl && <DeferredStylesheet href={googleFontsUrl} />}
        {/* Pin an explicit light background/text color here, same as the
            standard branch below (same branding fields, same fallbacks).
            Without this, the div has no background/color of its own, so any
            block content that doesn't set its own (relying on an inherited
            "ambient" light page, as most non-hero sections do) falls through
            to `body`'s `--background`/`--foreground` CSS vars — which flip to
            near-black/near-white under `prefers-color-scheme: dark` (see
            app/globals.css) whenever the visitor's OS/browser is in dark mode.
            The standard layout never has this problem because its wrapper
            already paints over body with these same explicit colors. */}
        <div
          // force-light: tenant sites keep their brand palette — never the
          // viewer's dark mode (typed blocks consume theme tokens; see
          // .force-light in globals.css).
          className="force-light min-h-screen"
          style={{
            backgroundColor: branding.backgroundColor || '#ffffff',
            color: branding.textColor || '#1e293b',
            scrollBehavior: 'smooth',
            fontFamily: cssFontStack(branding.bodyFont, 'system-ui, sans-serif') || 'system-ui, sans-serif',
          }}
        >
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
  // is reached via its own host (e.g. tenant.simplerdevelopment.com),
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
      <SiteRouteProgress color={branding.primaryColor || '#cfa122'} />
      {brandStyles && <style dangerouslySetInnerHTML={{ __html: brandStyles }} />}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      {googleFontsUrl && <link href={googleFontsUrl} rel="stylesheet" />}
      {ldScripts}
      <div
        // force-light: tenant sites keep their brand palette — never the
        // viewer's dark mode (see .force-light in globals.css).
        className="force-light min-h-screen flex flex-col"
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
