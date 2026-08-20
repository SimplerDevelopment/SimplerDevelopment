import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { resolveCustomDomain } from '@/lib/agency/custom-domain';
import { resolveSiteForHost } from '@/lib/sites/host-resolver';
import { mayShareCache } from '@/lib/sites/edge-cache-policy';
import { getPortalClient } from '@/lib/portal-client';
import {
  loadActiveAppBySlug,
  isClientEntitled,
} from '@/lib/plugins/proxy';
import { signPluginJwt } from '@/lib/plugins/jwt';
import { pluginTenantCookieOptions } from '@/lib/plugins/tenant-cookie';
import { ensureVisitorCookie } from '@/lib/ab/visitor';
import { ensureAttributionCookie } from '@/lib/attribution';
import { APPROVAL_COOKIE } from '@/lib/mcp/approval-cookie';
import { isApprovalWriteBlocked } from '@/lib/mcp/approval-write-gate';

/** Paths that never represent a lead arriving: APIs, authenticated app
 *  surfaces, OAuth, the embeddable widget, and Next internals. */
const ATTRIBUTION_EXCLUDED_PATH = /^\/(api|portal|admin|oauth|widget|_next)(\/|$)/;

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
  'staging.simplerdevelopment.com',
  'dev.simplerdevelopment.com',
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
 * This is the cheap first pass (no I/O). The fuller DB-lookup gate that 404s
 * hosts no tenant has claimed now runs after it — see isKnownSiteHost below,
 * enabled by the middleware Node runtime (`export const runtime = 'nodejs'`).
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

/**
 * Refuse writes from a reviewer in approval mode. Returns a response to send, or
 * null to continue. The decision itself lives in `lib/mcp/approval-write-gate.ts`
 * so it can be unit-tested rather than only exercised through the edge runtime.
 */
function blockApprovalWrite(req: NextRequest): NextResponse | null {
  const blocked = isApprovalWriteBlocked({
    method: req.method,
    pathname: req.nextUrl.pathname,
    hasApprovalCookie: !!req.cookies.get(APPROVAL_COOKIE),
  });
  if (!blocked) return null;

  return NextResponse.json(
    {
      success: false,
      message: 'This is a draft preview for approval — changes are not saved.',
      approvalMode: true,
    },
    { status: 403 },
  );
}

export async function middleware(req: NextRequest) {
  const host = req.headers.get('host') || '';

  // ── Approval mode is read-only, enforced here (PUX-067) ─────────────────
  // A reviewer holding an approval cookie is looking at a draft on the REAL
  // product surface — a live deck, a live survey form, a live booking funnel.
  // Every one of those can write: partial responses, A/B enrolment, holds,
  // payments. This is the single choke point that stops all of it.
  //
  // Deliberately default-deny: a write path added later is blocked without
  // anyone remembering it exists. Endpoints that need the reviewer's UI to
  // complete normally opt IN via APPROVAL_SHIMMED_PATHS and return a synthetic
  // response themselves. Forgetting a shim breaks a preview; forgetting the
  // gate would write data — only one of those is a correctness bug, and it is
  // the one that cannot happen.
  const approvalWriteBlock = blockApprovalWrite(req);
  if (approvalWriteBlock) return approvalWriteBlock;

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

    // Tenant SEO files must reach the per-domain route handlers under
    // /sites/[domain]/ — the root app's sitemap/robots emit the AGENCY's own
    // URLs, which is wrong (and misleading to crawlers) on a tenant host.
    // Must run BEFORE the generic file-extension bypass below, which would
    // otherwise fall through to those root routes. Unknown/gated sites are
    // handled inside the route handlers (404 / full disallow).
    if (pathname === '/sitemap.xml' || pathname === '/robots.txt' || pathname === '/llms.txt') {
      const url = req.nextUrl.clone();
      url.pathname = `/sites/${host.split(':')[0]}${pathname}`;
      return NextResponse.rewrite(url);
    }

    // Bypass rewrite for requests to files in /public/ (e.g. /iconLogo.png,
    // /logo.png, /site.webmanifest). These live on the main app and must be
    // served as-is on every host, not routed through the tenant sites
    // renderer which would 404 them.
    // Match any pathname whose last segment has a file extension.
    if (/\.[a-z0-9]{2,5}(?:\?|$)/i.test(pathname)) {
      return NextResponse.next();
    }

    // Portal paths are only valid on the main app domain. Any subdomain that
    // reaches here (e.g. a client subdomain with /portal in the path) gets
    // redirected to the canonical app URL so portal auth + session work correctly.
    const subdomain = extractSubdomain(host);
    if (subdomain && pathname.startsWith('/portal')) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.simplerdevelopment.com';
      const target = new URL(req.nextUrl.toString());
      target.host = new URL(appUrl).host;
      return NextResponse.redirect(target.toString(), { status: 308 });
    }

    // Booking subdomain passthrough — /book is used on client subdomains legitimately
    if (subdomain && pathname.startsWith('/book')) {
      return NextResponse.next();
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

    // DB-lookup host gate (replaces the regex-only Wave-3 TODO). The request is
    // not a portal custom domain (resolveCustomDomain returned null), so it is
    // destined for the public /sites renderer — only proceed if some tenant has
    // actually claimed this host (verified custom domain or platform subdomain).
    // Definitively-unknown hosts 404 at the edge instead of being rewritten into
    // /sites/<attacker-host>; the lookup fails open on DB trouble.
    const siteInfo = await resolveSiteForHost(bareHost);
    if (!siteInfo) {
      return new NextResponse('Not Found', { status: 404 });
    }

    // Rewrite to internal /sites/[domain]/[...slug] route.
    // Lowercased: Host headers are case-insensitive, but `domain` becomes a
    // route param that getClientWebsiteByDomain matches case-SENSITIVELY, so
    // `Host: Acme.com` used to pass the gate and then 404 at the renderer. It
    // also matters for caching — the CDN keys on the URL, so mixed-case hosts
    // would each get their own entry for identical content.
    const domain = bareHost.toLowerCase();
    const url = req.nextUrl.clone();
    const slug = pathname === '/' ? '' : pathname;
    url.pathname = `/sites/${domain}${slug}`;
    const response = NextResponse.rewrite(url);
    // Pass the resolved path so layouts can detect specific routes
    response.headers.set('x-site-pathname', slug || '/');
    // Surface the tenant domain so deep components that don't get route params
    // (e.g. not-found.tsx) can still resolve branding without re-parsing the URL.
    response.headers.set('x-site-domain', domain);
    const cacheable = mayShareCache(
      { method: req.method, url: req.url, cookie: req.headers.get('cookie') ?? '' },
      siteInfo,
    );
    if (cacheable) {
      // Shared-cache the rendered HTML at the edge. The CDN key is
      // scheme+host+path+query, and the host IS the tenant, so an entry can
      // never be served to a different tenant.
      //
      // s-maxage is short and paired with a long stale-while-revalidate: edge
      // entries are TTL-invalidated, not tag-invalidated, so revalidateTag()
      // does not reach them. 60s bounds how long a publish can look stale;
      // stale-while-revalidate keeps the fast path warm for everyone else.
      response.headers.set(
        'Cache-Control',
        'public, s-maxage=60, stale-while-revalidate=86400',
      );
      // Deliberately NOT calling ensureVisitorCookie here. A Set-Cookie on a
      // shared-cacheable response either poisons the cache or gets stripped;
      // mayShareCache() already guarantees no experiment is running, so no
      // visitor id is needed to render this page correctly.
    } else {
      response.headers.set('Cache-Control', 'private, no-store');
      // QAD-044: persist the A/B visitor id on the public-site render (the SSR
      // page can't set cookies itself).
      ensureVisitorCookie(req, response);
    }
    return response;
  }

  // For the app's own hostname — set x-site-pathname for /sites/ routes
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/sites/')) {
    const sitePath = pathname.replace(/^\/sites\/[^/]+/, '') || '/';
    // Extract the {domain} segment so not-found.tsx / error.tsx can recover it.
    const domainMatch = pathname.match(/^\/sites\/([^/]+)/);
    const siteDomain = domainMatch ? domainMatch[1] : '';
    const headers: Record<string, string> = {
      'x-site-pathname': sitePath,
      // NEVER shared-cache /sites/* on the APP host. The internal path is
      // identical to the tenant-host request, but basePath is computed from
      // whether the request host equals the site domain (see
      // app/sites/[domain]/layout.tsx), so the two render different link URLs.
      // One cache entry serving both audiences would give one of them a page
      // full of broken links.
      'Cache-Control': 'private, no-store',
    };
    if (siteDomain) headers['x-site-domain'] = siteDomain;
    // Forward the same markers as REQUEST headers too, so server components
    // (e.g. the root layout's marketing-chrome detection) can tell this is a
    // client-site route even on an app host like staging.simplerdevelopment.com,
    // where the marketing site and client sites share one hostname.
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-site-pathname', sitePath);
    if (siteDomain) requestHeaders.set('x-site-domain', siteDomain);
    const response = NextResponse.next({ request: { headers: requestHeaders }, headers });
    // QAD-044: persist the A/B visitor id for public-site renders served on the
    // app host (e.g. staging where marketing + client sites share a hostname).
    ensureVisitorCookie(req, response);
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
  const authResponse = await (auth as unknown as (req: NextRequest) => Promise<NextResponse>)(req);

  // If the auth middleware decided to redirect (or otherwise own the response),
  // honor it as-is.
  if (authResponse.headers.get('location')) return authResponse;

  // Re-issue the passthrough with x-pathname stamped on the REQUEST headers so
  // server layouts (e.g. app/admin/layout.tsx) can read the path via headers().
  // NOTE: a *response* header (the previous approach) is NOT readable by RSCs —
  // it must be on the request. Carry over the session-refresh cookies the auth
  // middleware set so we don't drop a refreshed session.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-pathname', pathname);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const cookie of authResponse.headers.getSetCookie()) {
    response.headers.append('set-cookie', cookie);
  }

  // QAD-044: persist the A/B visitor id on public deck/slide renders served on
  // the app host (these fall through here, not the /sites branch above). Scoped
  // to the public A/B-eligible routes so we don't stamp portal/admin pages.
  if (pathname.startsWith('/pitch-deck') || pathname.startsWith('/slides')) {
    ensureVisitorCookie(req, response);
  }

  // First-touch attribution across OUR OWN public surfaces — marketing pages,
  // blog, booking, surveys, decks. A denylist rather than a route list so a
  // new marketing page is covered the day it ships instead of the day someone
  // remembers to add it here.
  //
  // Excludes authenticated and machine surfaces, where a utm_* param is noise
  // rather than a lead source. Cheap on the excluded paths too: the helper
  // returns immediately once the cookie exists, and never writes at all
  // without a campaign or external referrer (see lib/attribution.ts).
  if (!ATTRIBUTION_EXCLUDED_PATH.test(pathname)) {
    ensureAttributionCookie(req, response);
  }

  // Stamp dev CORS headers on API responses going back to the mobile client. The
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
  // Cookie scope mirrors the session cookie (lib/plugins/tenant-cookie.ts) so
  // the handoff sets in dev/preview/self-host, not only the production apex
  // (QAD-043). httpOnly=false on the slug — the page reads it client-side to
  // render the iframe src.
  response.cookies.set('sd-plugin-tenant', jwt, pluginTenantCookieOptions(true));
  response.cookies.set('sd-plugin-tenant-slug', app.slug, pluginTenantCookieOptions(false));
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
