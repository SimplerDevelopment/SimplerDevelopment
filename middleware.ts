import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { resolveCustomDomain } from '@/lib/agency/custom-domain';
import { getPortalClient } from '@/lib/portal-client';
import {
  loadActiveAppBySlug,
  isClientEntitled,
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

/**
 * Dev-only CORS prelude for `/api/portal/*` so the Expo web client at
 * `localhost:8081` can call this server at `localhost:3000` during local
 * development. Production runs both surfaces on the same origin, so we no-op
 * outside dev. Handles the preflight OPTIONS request directly (204 + headers)
 * and stamps the same headers on real responses on the way out.
 */
function isAllowedDevOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (process.env.NODE_ENV === 'production') return false;
  try {
    const u = new URL(origin);
    // Mobile dev server (Expo web on 8081) and any localhost port — the mobile
    // app is the only legitimate cross-origin caller here.
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
  } catch {
    return false;
  }
  return false;
}

function applyDevCors(response: NextResponse, origin: string) {
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  );
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, Accept, Cache-Control, Last-Event-ID, X-Requested-With',
  );
  response.headers.set('Access-Control-Max-Age', '600');
  response.headers.append('Vary', 'Origin');
}

export async function middleware(req: NextRequest) {
  const host = req.headers.get('host') || '';

  // ── Dev CORS for the mobile client ──────────────────────────────────────
  // Mobile (Expo web on :8081) hits this server's /api/portal/* endpoints
  // cross-origin during local dev. Stamp the Allow-Origin headers BEFORE any
  // other logic so OPTIONS preflights short-circuit cleanly.
  const reqOrigin = req.headers.get('origin');
  const { pathname: prePath } = req.nextUrl;
  if (prePath.startsWith('/api/') && isAllowedDevOrigin(reqOrigin)) {
    if (req.method === 'OPTIONS') {
      const preflight = new NextResponse(null, { status: 204 });
      applyDevCors(preflight, reqOrigin as string);
      return preflight;
    }
  }

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
    // Surface the tenant domain so deep components that don't get route params
    // (e.g. not-found.tsx) can still resolve branding without re-parsing the URL.
    response.headers.set('x-site-domain', domain);
    return response;
  }

  // For the app's own hostname — set x-site-pathname for /sites/ routes
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/sites/')) {
    const sitePath = pathname.replace(/^\/sites\/[^/]+/, '') || '/';
    // Extract the {domain} segment so not-found.tsx / error.tsx can recover it.
    const domainMatch = pathname.match(/^\/sites\/([^/]+)/);
    const siteDomain = domainMatch ? domainMatch[1] : '';
    const headers: Record<string, string> = { 'x-site-pathname': sitePath };
    if (siteDomain) headers['x-site-domain'] = siteDomain;
    const response = NextResponse.next({ headers });
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
  const response = await (auth as unknown as (req: NextRequest) => Promise<NextResponse>)(req);

  // Stamp dev CORS headers on responses going back to the mobile client. The
  // OPTIONS preflight already short-circuited above; this handles the real
  // GET / POST / PATCH / DELETE responses.
  if (prePath.startsWith('/api/') && reqOrigin && isAllowedDevOrigin(reqOrigin)) {
    applyDevCors(response, reqOrigin);
  }
  return response;
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

  // 5. Mint a user-context tenancy JWT for the iframe handoff. The
  //    catch-all page renders an <iframe> pointing at the plugin host; the
  //    plugin host needs the JWT to authenticate the user. We drop the JWT
  //    into a cookie scoped to `.simplerdevelopment.com` so the browser
  //    sends it on the iframe's cross-subdomain request. SameSite=Lax is
  //    fine because the portal and the plugin host share an eTLD+1.
  //
  //    TTL is longer than the system-dispatch JWT's 60s because this token
  //    lives for the duration of the user's iframe session, not a single
  //    request. 10 minutes is the same window we'd accept for a normal
  //    cookie-based admin action — replay risk is bounded by the next page
  //    render refreshing it.
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
      { ttlSeconds: 600 },
    );
  } catch {
    return null;
  }

  // 6. Let the Next.js route tree render the page (catch-all renders the
  //    iframe). Attach the JWT as a cookie scoped to the apex domain so the
  //    plugin host (a sibling subdomain) sees it on the iframe request.
  //
  //    The previous architecture reverse-proxied the plugin's HTML into the
  //    portal at this point; that broke the plugin's `/_next/static/*` asset
  //    URLs (resolved against the portal origin) and stripped the portal
  //    chrome (sidebar). The iframe approach keeps each side rendering its
  //    own page tree, joined by this cookie handoff.
  const response = NextResponse.next();
  response.cookies.set('sd-plugin-tenant', jwt, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    domain: '.simplerdevelopment.com',
    path: '/',
    maxAge: 600,
  });
  response.cookies.set('sd-plugin-tenant-slug', app.slug, {
    httpOnly: false, // page reads this client-side to render the iframe src
    secure: true,
    sameSite: 'lax',
    domain: '.simplerdevelopment.com',
    path: '/',
    maxAge: 600,
  });
  response.headers.set('x-plugin-app', app.slug);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

// Switch the middleware to Node.js runtime so it can pull in lib/plugins/{jwt,kms}
// (which use node:crypto via jsonwebtoken). Edge runtime can't load node: modules.
// Next 16+ recognizes a top-level `runtime` export on middleware.
export const runtime = 'nodejs';
