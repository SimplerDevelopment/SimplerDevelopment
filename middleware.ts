import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { resolveCustomDomain } from '@/lib/agency/custom-domain';

// Hostnames that belong to the app itself (not client sites)
const APP_HOSTNAMES = new Set([
  'localhost',
  'localhost:3000',
  'localhost:3001',
  'localhost:3005',
  '127.0.0.1',
  '127.0.0.1:3000',
  'simplerdevelopment.com',
  'www.simplerdevelopment.com',
]);

function getAppHostname(): string | null {
  const url = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function isAppHostname(host: string): boolean {
  if (APP_HOSTNAMES.has(host)) return true;
  const appHost = getAppHostname();
  if (appHost && host === appHost) return true;
  // Vercel preview/prod defaults (e.g. simplerdevelopment.vercel.app,
  // simplerdevelopment-git-<branch>-<team>.vercel.app)
  if (host.endsWith('.vercel.app')) return true;
  // Legacy Railway default domains — kept for any lingering deployments
  if (host.endsWith('.up.railway.app')) return true;
  return false;
}

/**
 * Extract the subdomain from a hostname if it's a *.simplerdevelopment.com address.
 * Returns null for bare simplerdevelopment.com or non-matching hostnames.
 */
function extractSubdomain(host: string): string | null {
  const bare = host.split(':')[0]; // strip port
  const appDomains = ['simplerdevelopment.com', 'www.simplerdevelopment.com'];
  for (const base of appDomains) {
    if (bare === base) return null; // bare domain, not a subdomain
  }
  if (bare.endsWith('.simplerdevelopment.com')) {
    const sub = bare.replace('.simplerdevelopment.com', '');
    if (sub && !sub.includes('.')) return sub;
  }
  return null;
}

export async function middleware(req: NextRequest) {
  const host = req.headers.get('host') || '';

  // If this is a custom domain (not the app itself), rewrite to the sites renderer
  if (host && !isAppHostname(host)) {
    const { pathname } = req.nextUrl;

    // Don't rewrite API routes, static files, or Next.js internals
    if (
      pathname.startsWith('/api/') ||
      pathname.startsWith('/_next/') ||
      pathname.startsWith('/favicon.ico')
    ) {
      return NextResponse.next();
    }

    // Bypass rewrite for requests to files in /public/ (e.g. /iconLogo.png,
    // /logo.png, /site.webmanifest). These live on the main app and must be
    // served as-is on every host, not routed through the tenant sites
    // renderer which would 404 them.
    // Match any pathname whose last segment has a file extension.
    if (/\.[a-z0-9]{2,5}(?:\?|$)/i.test(pathname)) {
      return NextResponse.next();
    }

    // Subdomain portal/booking access: let these through to the main app
    const subdomain = extractSubdomain(host);
    if (subdomain && (pathname.startsWith('/portal') || pathname.startsWith('/book'))) {
      const response = NextResponse.next();
      if (pathname.startsWith('/portal')) response.headers.set('x-portal-subdomain', subdomain);
      return response;
    }

    // ── White-label custom domain ────────────────────────────────────────────
    // If the host doesn't belong to *.simplerdevelopment.com, before falling
    // through to the public-site renderer we check whether some agency has
    // claimed + DNS-verified this hostname as their portal custom domain.
    // If so, rewrite as if the request had arrived at /portal on the
    // matching client's app subdomain (so existing portal auth + active-
    // client cookie resolution all keep working).
    const bareHost = host.split(':')[0];
    const customMatch = await resolveCustomDomain(bareHost);
    if (customMatch && customMatch.clientId > 0) {
      // Custom-domain agencies expect their domain to be "the portal" — root
      // requests go to /portal, and any path that already starts with /portal
      // stays there. Public-website paths are not exposed on a portal custom
      // domain (the public site continues to live on its own canonical
      // hostname).
      const url = req.nextUrl.clone();
      if (!pathname.startsWith('/portal') && !pathname.startsWith('/book')) {
        url.pathname = pathname === '/' ? '/portal' : `/portal${pathname}`;
      }
      const response = NextResponse.rewrite(url);
      response.headers.set('x-agency-client-id', String(customMatch.clientId));
      response.headers.set('x-custom-portal-domain', bareHost);
      return response;
    }

    // Rewrite to internal /sites/[domain]/[...slug] route
    const domain = bareHost;
    const url = req.nextUrl.clone();
    const slug = pathname === '/' ? '' : pathname;
    url.pathname = `/sites/${domain}${slug}`;
    const response = NextResponse.rewrite(url);
    // Pass the resolved path so layouts can detect specific routes
    response.headers.set('x-site-pathname', slug || '/');
    return response;
  }

  // For the app's own hostname — set x-site-pathname for /sites/ routes
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/sites/')) {
    const sitePath = pathname.replace(/^\/sites\/[^/]+/, '') || '/';
    const response = NextResponse.next({
      headers: { 'x-site-pathname': sitePath },
    });
    return response;
  }

  // For the app's own hostname, run the standard NextAuth middleware
  return (auth as unknown as (req: NextRequest) => Promise<NextResponse>)(req);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
