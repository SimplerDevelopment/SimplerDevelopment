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

const CACHE_TTL_MS = 60_000;
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
 * Resolve a hostname to the agency client that has claimed + verified it
 * as their custom portal domain. Returns null if there is no verified
 * match — callers should fall through to the existing subdomain
 * resolution path in that case.
 *
 * Only returns hits where `customDomainVerifiedAt` is non-null. Pending
 * (un-verified) domains are deliberately invisible to the resolver so a
 * half-configured agency can't accidentally hijack traffic.
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

  let row: { id: number; defaultWebsiteId: number | null } | undefined;
  try {
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
    [row] = result;
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
 * Test/admin hook: clear the in-memory cache. Called by integration tests
 * and by the custom-domain mutation routes after a verify/remove so the
 * next request reflects the new state immediately.
 */
export function clearCustomDomainCache(): void {
  cache.clear();
}
