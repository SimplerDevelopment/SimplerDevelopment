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
import { clientWebsites, websiteDomains } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

const CACHE_TTL_MS = 60_000;
const DB_LOOKUP_TIMEOUT_MS = 1_000;

// true = known tenant host, false = definitively unknown. Cached per host.
const cache = new Map<string, { known: boolean; expiresAt: number }>();

async function lookup(host: string): Promise<boolean> {
  // 1. Exact custom domain on the legacy column.
  const direct = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.domain, host), eq(clientWebsites.active, true)))
    .limit(1);
  if (direct[0]) return true;

  // 2. Multi-domain table — only VERIFIED domains may route (pending/failed
  //    rows must not be able to claim traffic).
  const viaDomains = await db
    .select({ id: clientWebsites.id })
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
  if (viaDomains[0]) return true;

  // 3. Platform subdomain (<sub>.simplerdevelopment.com → clientWebsites.subdomain).
  const sub = host.match(/^([^.]+)\.simplerdevelopment\.com$/);
  if (sub) {
    const subSite = await db
      .select({ id: clientWebsites.id })
      .from(clientWebsites)
      .where(and(eq(clientWebsites.subdomain, sub[1]), eq(clientWebsites.active, true)))
      .limit(1);
    if (subSite[0]) return true;
  }

  return false;
}

/**
 * Whether `hostname` belongs to a real, active tenant site. Fails OPEN: on a DB
 * timeout/error it returns `true` so a database hiccup can't 404 legitimate
 * tenants — the request then falls through to the /sites renderer, which 404s
 * unknown hosts at the layout anyway (so the gate is defense-in-depth, not the
 * sole check). A definitive DB "no match" returns `false` and is cached.
 */
export async function isKnownSiteHost(hostname: string): Promise<boolean> {
  if (!hostname) return false;
  const key = hostname.split(':')[0].toLowerCase();
  const now = Date.now();

  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.known;

  let known: boolean;
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('site-host lookup timeout')), DB_LOOKUP_TIMEOUT_MS),
    );
    known = await Promise.race([lookup(key), timeout]);
  } catch {
    // DB slow/unreachable — fail open (don't cache) so the next request retries.
    return true;
  }

  cache.set(key, { known, expiresAt: now + CACHE_TTL_MS });
  return known;
}

/** Test/admin hook: clear the in-memory host cache. */
export function clearSiteHostCache(): void {
  cache.clear();
}
