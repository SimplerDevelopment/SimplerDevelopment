// Custom-domain → client lookup used by middleware to route white-label
// portal traffic. Ships with a tiny in-memory TTL cache so we don't slam
// the DB on every request — this hot-path runs before any auth or
// rendering work.
//
// The cache is intentionally simple. v1 invalidation strategy is "wait
// out the TTL" (60s); operators can also bounce the process. If/when
// custom-domain churn picks up we'll wire in an event-driven invalidation
// hook from the API mutation routes.

import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { and, eq, isNotNull } from 'drizzle-orm';
import { unstable_cache, revalidateTag } from 'next/cache';

const CACHE_TTL_MS = 60_000;
// Cross-request (serverless-instance) cache via Next's data cache. Keyed on
// hostname, tagged so mutation routes can invalidate immediately rather than
// waiting out the in-memory TTL on every warm instance.
const CUSTOM_DOMAIN_TAG = 'custom-domain';
// Middleware runs on Vercel with a hard wall-clock budget (~25s), so the DB
// lookup must never block the request path for long. If Postgres is slow or
// unreachable we fail open to "no match" — the request falls through to the
// existing `/sites/<host>/...` rewrite, which is what 99% of tenants already
// hit. White-label agencies will be briefly demoted to the default rewrite
// (cached for CACHE_TTL_MS), which is a strictly better failure mode than
// returning 504 MIDDLEWARE_INVOCATION_TIMEOUT on every request.
const DB_LOOKUP_TIMEOUT_MS = 1_000;

interface CachedHit {
  clientId: number;
  defaultWebsiteId: number | null;
  expiresAt: number;
}

const cache = new Map<string, CachedHit | null>();

/**
 * Inner DB lookup — extracted so we can wrap it with `unstable_cache`. The
 * timeout race stays at this layer; `unstable_cache` will simply not cache
 * a thrown result, which is the desired behaviour for "DB is briefly slow".
 */
async function fetchCustomDomainRow(
  key: string,
): Promise<{ id: number; defaultWebsiteId: number | null } | null> {
  const lookup = db
    .select({ id: clients.id, defaultWebsiteId: clients.defaultWebsiteId })
    .from(clients)
    .where(
      and(
        eq(clients.customDomain, key),
        isNotNull(clients.customDomainVerifiedAt),
      ),
    )
    .limit(1);
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('custom-domain lookup timeout')), DB_LOOKUP_TIMEOUT_MS),
  );
  const result = (await Promise.race([lookup, timeout])) as Array<{
    id: number;
    defaultWebsiteId: number | null;
  }>;
  return result[0] ?? null;
}

// Cross-request cache layer. Note: `unstable_cache` keys the cache by the
// arguments to the wrapped function, so each unique hostname gets its own
// entry. We use 5 minutes here (longer than the 60s in-memory layer) because
// the mutation routes call `revalidateTag('custom-domain')` to flush
// instantly when an admin changes a domain.
const fetchCustomDomainRowCached = unstable_cache(
  fetchCustomDomainRow,
  ['agency-custom-domain'],
  { revalidate: 300, tags: [CUSTOM_DOMAIN_TAG] },
);

/**
 * Resolve a hostname to the agency client that has claimed + verified it
 * as their custom portal domain. Returns null if there is no verified
 * match — callers should fall through to the existing subdomain
 * resolution path in that case.
 *
 * Only returns hits where `customDomainVerifiedAt` is non-null. Pending
 * (un-verified) domains are deliberately invisible to the resolver so a
 * half-configured agency can't accidentally hijack traffic.
 *
 * Caching is two-tiered: a tiny in-memory TTL for sub-second amortisation
 * within a single hot serverless instance, and Next's data cache
 * (`unstable_cache`, tagged `custom-domain`) for cross-instance reuse.
 */
export async function resolveCustomDomain(
  hostname: string,
): Promise<{ clientId: number; defaultWebsiteId: number | null } | null> {
  if (!hostname) return null;
  const key = hostname.toLowerCase();
  const now = Date.now();

  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    if (cached === null) return null;
    return { clientId: cached.clientId, defaultWebsiteId: cached.defaultWebsiteId };
  }

  let row: { id: number; defaultWebsiteId: number | null } | null = null;
  try {
    row = await fetchCustomDomainRowCached(key);
  } catch {
    // DB unreachable or slow — fail open to "no match" so we don't 504 every
    // request via MIDDLEWARE_INVOCATION_TIMEOUT. We intentionally do NOT cache
    // the negative result here so the next request gets a fresh attempt; if
    // the DB recovers within a second, white-label routing is restored.
    return null;
  }

  if (!row) {
    cache.set(key, { clientId: -1, defaultWebsiteId: null, expiresAt: now + CACHE_TTL_MS });
    return null;
  }

  const hit: CachedHit = {
    clientId: row.id,
    defaultWebsiteId: row.defaultWebsiteId,
    expiresAt: now + CACHE_TTL_MS,
  };
  cache.set(key, hit);
  return { clientId: hit.clientId, defaultWebsiteId: hit.defaultWebsiteId };
}

/**
 * Test/admin hook: clear the in-memory cache AND revalidate the cross-request
 * data-cache tag. Called by integration tests and by the custom-domain
 * mutation routes after a verify/remove so the next request reflects the
 * new state immediately on every serverless instance.
 */
export function clearCustomDomainCache(): void {
  cache.clear();
  try {
    revalidateTag(CUSTOM_DOMAIN_TAG, 'max');
  } catch {
    // revalidateTag throws if called from a non-action / non-route context
    // (e.g. inside a test). Ignore — the in-memory clear() above is enough
    // for those callers, and real mutation routes are always in-context.
  }
}
