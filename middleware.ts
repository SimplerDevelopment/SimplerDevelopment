import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { resolveCustomDomain } from '@/lib/agency/custom-domain';
import { getPortalClient } from '@/lib/portal-client';
import {
  loadActiveAppBySlug,
  isClientEntitled,
  buildProxyUrl,
} from '@/lib/plugins/proxy';
import { signPluginJwt } from '@/lib/plugins/jwt';

// Hostnames that belong to the app itself (not client sites)
const APP_HOSTNAMES = new Set([
  'localhost',
  'localhost:3000',
  'localhost:3001',
  'localhost:3005',
  'localhost:3100',
  '127.0.0.1',
  '127.0.0.1:3000',
  '127.0.0.1:3100',
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

/**
 * Hardening for the tenant-rewrite path: reject Host headers that don't look
 * like real hostnames before we trust them as a tenant identifier. This
 * narrows the surface for Next 16.1.1 GHSA-ggv3-7p47-pfv8 (request
 * smuggling in rewrites) and stops obvious SSRF-via-Host probes
 * ("169.254.169.254", "localhost.attacker.tld" with unusual chars, etc.).
 *
 * NOTE: a fuller fix is to look up the host in clientSites/clientWebsites and
 * 404 unknown ones. Doing that requires moving middleware to the Node runtime
 * (Drizzle/postgres.js are not Edge-safe). Tracked as Wave 3.
 */
function isPlausibleTenantHost(host: string): boolean {
  const bare = host.split(':')[0].toLowerCase();
  if (!bare) return false;
  // No raw IPs — they should never reach this branch (isAppHostname catches
  // localhost / 127.0.0.1; tenant rewrites must be FQDNs).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(bare)) return false;
  if (bare.includes(':')) return false; // IPv6 literal
  // Must contain a dot (TLD).
  if (!bare.includes('.')) return false;
  // Each label: 1-63 chars, alphanumeric / hyphen, no leading/trailing hyphen.
  // TLD must be at least 2 chars and all-alpha (allowing IDN puny `xn--`).
  const labels = bare.split('.');
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) return false;
  }
  const tld = labels[labels.length - 1];
  if (tld.length < 2) return false;
  if (!/^[a-z]{2,}$|^xn--[a-z0-9-]{2,}$/.test(tld)) return false;
  // Block metadata-style suspicious literals.
  if (bare === 'metadata.google.internal') return false;
  return true;
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

    // Reject obviously-non-tenant Host headers before we use the host as a
    // tenant identifier in the rewrite path. (Defense-in-depth alongside any
    // upstream proxy validation.)
    if (!isPlausibleTenantHost(host)) {
      return new NextResponse('Not Found', { status: 404 });
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

  // ── Plugin registry: /portal/apps/<slug>/* ─────────────────────────────
  // Reverse-proxy the request to the registered plugin's host_url, minting a
  // short-lived (60s) signed tenancy JWT that the plugin verifies. Cookies and
  // ambient Authorization headers are stripped so the plugin only ever sees
  // the JWT we mint — never portal session credentials.
  //
  // Order matters: this runs BEFORE the generic NextAuth `auth()` fallthrough
  // so we control the rewrite + response headers ourselves and avoid leaking
  // portal cookies to a different origin.
  if (pathname.startsWith('/portal/apps/')) {
    const pluginResp = await handlePluginRoute(req, pathname);
    if (pluginResp) return pluginResp;
    // Fell through (app not found, not entitled, or mint failure) — let
    // Next.js render the `/portal/apps/[appId]/...` route tree, which is
    // responsible for the 404 / upsell / error layouts.
    return NextResponse.next();
  }

  // For the app's own hostname, run the standard NextAuth middleware
  return (auth as unknown as (req: NextRequest) => Promise<NextResponse>)(req);
}

// ─── Plugin proxy handler ──────────────────────────────────────────────────
// Extracted so the main `middleware()` function stays readable. Returns a
// `NextResponse` when it took ownership of the request (rewrite or redirect),
// or `null` to let the caller fall through to the normal route tree (which
// renders 404 / upsell / error layouts from `app/portal/apps/[appId]/`).

async function handlePluginRoute(
  req: NextRequest,
  pathname: string,
): Promise<NextResponse | null> {
  // `/portal/apps/<slug>` or `/portal/apps/<slug>/<rest>`
  // Split off the prefix; first segment after `/portal/apps/` is the slug.
  const remainder = pathname.slice('/portal/apps/'.length);
  if (!remainder) return null; // bare `/portal/apps/` — let the page render
  const firstSlash = remainder.indexOf('/');
  const slug =
    firstSlash === -1 ? remainder : remainder.slice(0, firstSlash);
  const pathSuffix = firstSlash === -1 ? '' : remainder.slice(firstSlash);

  // 1. Authenticate. No session → bounce to login with `callbackUrl` so the
  //    user returns to the plugin page after sign-in.
  const session = await auth();
  if (!session?.user?.id) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/portal/login';
    loginUrl.search = '';
    loginUrl.searchParams.set(
      'callbackUrl',
      pathname + (req.nextUrl.search || ''),
    );
    return NextResponse.redirect(loginUrl);
  }
  const userId = parseInt(String(session.user.id), 10);

  // 2. Resolve active client. No client → portal dashboard.
  let client: { id: number } | null = null;
  try {
    client = await getPortalClient(userId);
  } catch {
    client = null;
  }
  if (!client) {
    const dashboardUrl = req.nextUrl.clone();
    dashboardUrl.pathname = '/portal/dashboard';
    dashboardUrl.search = '';
    return NextResponse.redirect(dashboardUrl);
  }

  // 3. Load the plugin app. Unknown / disabled → fall through so the Next
  //    route tree renders `not-found.tsx`.
  const app = await loadActiveAppBySlug(slug);
  if (!app) return null;

  // 4. Entitlement check. Unentitled → fall through so the entitlement layout
  //    renders the upsell. CRITICAL: we MUST NOT mint a JWT for unentitled
  //    users (data minimisation — never give an unentitled user a signed
  //    tenancy token to replay).
  const entitled = await isClientEntitled(client.id, app);
  if (!entitled) return null;

  // 5. Mint the tenancy JWT. On failure (DB unreachable, missing signing
  //    key, KMS error) we fall through so the error/upsell layout renders
  //    a graceful message instead of bubbling a 500 from middleware.
  let jwt: string;
  try {
    jwt = await signPluginJwt(
      app.id,
      {
        aud: app.slug,
        sub: String(userId),
        clientId: client.id,
        siteId: null, // site-context is deferred to v2
        scopes: app.defaultScopes ?? [],
      },
      { ttlSeconds: 60 },
    );
  } catch {
    return null;
  }

  // 6. Build the proxy URL. Throws if the registered host_url isn't https://
  //    (defence-in-depth — admin form should validate too).
  let target: URL;
  try {
    target = buildProxyUrl(app.hostUrl, pathSuffix, req.nextUrl.search);
  } catch {
    return null;
  }

  // 7. Construct the rewrite headers. Start from a CLEAN Headers instance
  //    so we don't accidentally leak anything from the inbound portal
  //    request. We forward only what the plugin needs.
  const requestId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const proxyHeaders = new Headers();

  // Forward a minimal set of safe request-side headers.
  const inbound = req.headers;
  const safeForward = [
    'accept',
    'accept-language',
    'user-agent',
    'content-type',
    'content-length',
  ];
  for (const name of safeForward) {
    const v = inbound.get(name);
    if (v != null) proxyHeaders.set(name, v);
  }

  // Tenancy + provenance
  proxyHeaders.set('x-sd-tenant', jwt);
  proxyHeaders.set('x-sd-request-id', requestId);
  proxyHeaders.set('x-sd-portal-origin', req.nextUrl.origin);
  // Avoid double-compression on the proxied response — the portal edge will
  // re-encode if appropriate.
  proxyHeaders.set('accept-encoding', 'identity');

  // CRITICAL: strip portal session cookies + ambient auth before crossing
  // origins. NEVER let these reach the plugin.
  proxyHeaders.set('cookie', '');
  proxyHeaders.set('authorization', '');

  // 8. Issue the rewrite. The new `request.headers` argument is what
  //    NextResponse forwards downstream.
  const response = NextResponse.rewrite(target, {
    request: { headers: proxyHeaders },
  });

  // 9. Defence-in-depth on the response surface: prevent the plugin's UI
  //    from being framed by any other origin (incl. our own), tag the
  //    response with the plugin slug + request id for log correlation.
  response.headers.set('content-security-policy', "frame-ancestors 'none'");
  response.headers.set('x-plugin-app', app.slug);
  response.headers.set('x-request-id', requestId);

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

// Switch the middleware to Node.js runtime so it can pull in lib/plugins/{jwt,kms}
// (which use node:crypto via jsonwebtoken). Edge runtime can't load node: modules.
// Next 16+ recognizes a top-level `runtime` export on middleware.
export const runtime = 'nodejs';
