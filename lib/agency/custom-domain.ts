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
    [row] = await db
      .select({ id: clients.id, defaultWebsiteId: clients.defaultWebsiteId })
      .from(clients)
      .where(
        and(
          eq(clients.customDomain, key),
          isNotNull(clients.customDomainVerifiedAt),
        ),
      )
      .limit(1);
  } catch {
    // DB unreachable — fail open to "no match" so we don't 500 every request.
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
