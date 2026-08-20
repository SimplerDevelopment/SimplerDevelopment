// Public-site host gate used by middleware: is this incoming Host header a
// hostname some tenant has actually claimed (a verified custom domain or a
// *.simplerdevelopment.com subdomain)? The regex check (isPlausibleTenantHost)
// only confirms a host LOOKS like a domain; this confirms it BELONGS to a real
// site before we rewrite the request into the /sites/<host> renderer. Closes
// the mild-SSRF / host-injection surface where any valid-looking FQDN was
// accepted and rewritten.
//
// Mirrors the resolution in lib/actions/client-sites.ts (getClientWebsiteByDomain)
// but is middleware-safe (no 'use server', no React cache) and returns only a
// boolean. Uses the same cache + timeout + fail-open shape as
// lib/agency/custom-domain.ts so a slow/unreachable DB degrades to the prior
// regex-only behaviour instead of 504-ing every request.

import { db } from '@/lib/db';
import { clientWebsites, websiteDomains, posts, abExperiments } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

const CACHE_TTL_MS = 60_000;
const DB_LOOKUP_TIMEOUT_MS = 1_000;

/**
 * What middleware needs to know about a host in ONE lookup: whether it belongs
 * to a real tenant, and whether that tenant's HTML is safe to put in a shared
 * CDN cache.
 *
 * `null` means "not a known tenant host".
 */
export interface SiteHostInfo {
  siteId: number;
  publicAccess: boolean;
  cdnCacheEnabled: boolean;
  hasRunningExperiment: boolean;
}

// Resolution result per host. `info: null` = definitively not a tenant host.
const cache = new Map<string, { info: SiteHostInfo | null; expiresAt: number }>();

async function lookup(host: string): Promise<SiteHostInfo | null> {
  // 1. Exact custom domain on the legacy column.
  const cols = {
    id: clientWebsites.id,
    publicAccess: clientWebsites.publicAccess,
    cdnCacheEnabled: clientWebsites.cdnCacheEnabled,
  };
  const direct = await db
    .select(cols)
    .from(clientWebsites)
    .where(and(eq(clientWebsites.domain, host), eq(clientWebsites.active, true)))
    .limit(1);
  if (direct[0]) return withExperimentState(direct[0]);

  // 2. Multi-domain table — only VERIFIED domains may route (pending/failed
  //    rows must not be able to claim traffic).
  const viaDomains = await db
    .select(cols)
    .from(websiteDomains)
    .innerJoin(clientWebsites, eq(websiteDomains.websiteId, clientWebsites.id))
    .where(
      and(
        eq(websiteDomains.domain, host),
        eq(websiteDomains.status, 'verified'),
        eq(clientWebsites.active, true),
      ),
    )
    .limit(1);
  if (viaDomains[0]) return withExperimentState(viaDomains[0]);

  // 3. Platform subdomain (<sub>.simplerdevelopment.com → clientWebsites.subdomain).
  const sub = host.match(/^([^.]+)\.simplerdevelopment\.com$/);
  if (sub) {
    const subSite = await db
      .select(cols)
      .from(clientWebsites)
      .where(and(eq(clientWebsites.subdomain, sub[1]), eq(clientWebsites.active, true)))
      .limit(1);
    if (subSite[0]) return withExperimentState(subSite[0]);
  }

  return null;
}

/**
 * A running A/B experiment makes the page vary per visitor, so its HTML must
 * never enter a shared cache. Experiments target posts, so site-level state is
 * a join through posts.website_id. Only asked when the site has opted in to CDN
 * caching — for every other site the answer cannot change the outcome, so we
 * skip the query.
 */
async function withExperimentState(
  row: { id: number; publicAccess: boolean; cdnCacheEnabled: boolean },
): Promise<SiteHostInfo> {
  const base = {
    siteId: row.id,
    publicAccess: row.publicAccess,
    cdnCacheEnabled: row.cdnCacheEnabled,
  };
  if (!row.cdnCacheEnabled) return { ...base, hasRunningExperiment: false };

  const running = await db
    .select({ id: abExperiments.id })
    .from(abExperiments)
    .innerJoin(posts, eq(posts.id, abExperiments.targetId))
    .where(and(eq(abExperiments.status, 'running'), eq(posts.websiteId, row.id)))
    .limit(1);

  return { ...base, hasRunningExperiment: !!running[0] };
}

/**
 * Resolve a host to its tenant, with the facts middleware needs to decide
 * whether the response may be shared-cached.
 *
 * Fails OPEN for routing (a DB hiccup must not 404 legitimate tenants) but
 * CLOSED for caching: the fail-open result carries cdnCacheEnabled: false, so a
 * database problem can never accidentally start caching a tenant's HTML.
 */
export async function resolveSiteForHost(hostname: string): Promise<SiteHostInfo | null> {
  if (!hostname) return null;
  const key = hostname.split(':')[0].toLowerCase();
  const now = Date.now();

  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.info;

  let info: SiteHostInfo | null;
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('site-host lookup timeout')), DB_LOOKUP_TIMEOUT_MS),
    );
    info = await Promise.race([lookup(key), timeout]);
  } catch {
    // DB slow/unreachable — fail open for ROUTING so the request still reaches
    // the /sites renderer (which 404s unknown hosts at the layout anyway), but
    // closed for CACHING. Not cached, so the next request retries.
    return { siteId: -1, publicAccess: false, cdnCacheEnabled: false, hasRunningExperiment: false };
  }

  cache.set(key, { info, expiresAt: now + CACHE_TTL_MS });
  return info;
}

/**
 * Whether `hostname` belongs to a real, active tenant site. Thin wrapper over
 * resolveSiteForHost so the host gate and the cache decision share one lookup.
 */
export async function isKnownSiteHost(hostname: string): Promise<boolean> {
  return (await resolveSiteForHost(hostname)) !== null;
}

/** Test/admin hook: clear the in-memory host cache. */
export function clearSiteHostCache(): void {
  cache.clear();
}
