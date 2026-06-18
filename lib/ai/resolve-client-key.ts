/**
 * Resolves the API key to use for an outbound AI call on behalf of a client.
 *
 * Order of resolution:
 *   1. BYOK lookup — `client_api_keys` row matching (clientId, provider).
 *      Decrypted via `lib/crypto/api-key.ts`. `lastUsedAt` is bumped
 *      opportunistically so portal UI can surface "last used" without a strict
 *      audit table. Source: `'byok'`.
 *   2. Platform fallback — env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`).
 *      Source: `'platform'`. Existing fallback semantics are preserved — call
 *      sites that previously read `process.env.X` keep working.
 *
 * Caching:
 *   A simple in-process LRU-ish Map keyed by `${clientId}:${provider}` caches
 *   resolution results for ~60s, so a single request that calls the resolver
 *   N times only does one DB hit + decrypt. Cached entries also short-circuit
 *   the `lastUsedAt` write to avoid hot-row contention.
 *
 * Multi-tenant: every lookup is keyed by `clientId`. Never returns another
 * tenant's key. Decryption errors fall through to the platform key (logged)
 * so a corrupt row can't take down a client's AI surface.
 */

import { db } from '@/lib/db';
import { clientApiKeys } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { decryptApiKey } from '@/lib/crypto/api-key';
import { getClientEntitlements } from '@/lib/billing/entitlements';

export type AiProvider = 'anthropic' | 'openai' | 'embedding';

export interface ResolvedClientKey {
  /** Decrypted plaintext key suitable for passing to an SDK client. */
  key: string;
  /** Where the key came from — drives audit / metering. */
  source: 'byok' | 'platform';
  /** The client this resolution belongs to (echoed for convenience). */
  clientId: number;
  /** The provider this resolution belongs to (echoed for convenience). */
  provider: AiProvider;
}

interface CacheEntry {
  value: ResolvedClientKey;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

function cacheKey(clientId: number, provider: AiProvider): string {
  return `${clientId}:${provider}`;
}

function getPlatformKey(provider: AiProvider): string | undefined {
  switch (provider) {
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY;
    case 'openai':
    case 'embedding':
      // Embeddings live on OpenAI today (text-embedding-3-*). Same env var.
      return process.env.OPENAI_API_KEY;
  }
}

/**
 * Map our internal provider tag to the value stored in `client_api_keys.provider`.
 * Embeddings share the OpenAI bucket — clients add ONE OpenAI key and we use it
 * for both chat and embeddings.
 */
function dbProvider(provider: AiProvider): 'anthropic' | 'openai' {
  return provider === 'embedding' ? 'openai' : provider;
}

export interface ResolveOptions {
  clientId: number;
  provider: AiProvider;
  /** Skip the cache (used by tests / forced re-fetch). */
  forceFresh?: boolean;
}

/**
 * Resolve the API key to use for `(clientId, provider)`. Always returns a
 * `{ key, source }` pair — throws only if neither BYOK nor platform key is
 * available, since AI call sites can't degrade gracefully without _some_ key.
 */
export async function resolveClientApiKey(opts: ResolveOptions): Promise<ResolvedClientKey> {
  const { clientId, provider, forceFresh = false } = opts;
  const k = cacheKey(clientId, provider);

  if (!forceFresh) {
    const cached = cache.get(k);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
  }

  let resolved: ResolvedClientKey | null = null;

  // Scale-only BYOK gate (the "inversion"). A client may only USE a stored
  // provider key while their tier is BYOK-eligible, so a Scale→lower downgrade
  // stops using a previously-saved key and falls back to the platform key —
  // we don't let an entitlement lapse leave the client spending on their own
  // key (or, conversely, keep a discount they no longer pay for). This lookup
  // sits inside the cached resolution, so it's amortised over the 60s TTL.
  let byokEligible = false;
  try {
    byokEligible = (await getClientEntitlements(clientId)).byokEligible;
  } catch (err) {
    // Fail closed for BYOK: if eligibility can't be confirmed, do NOT use a
    // client key — fall through to the platform key.
    console.warn(
      `[resolveClientApiKey] entitlement check failed for clientId=${clientId}; not using BYOK`,
      err,
    );
    byokEligible = false;
  }

  // BYOK lookup (only when eligible — otherwise we skip the query entirely and
  // fall through to the platform key). We pick the most recently used key as
  // the active one — the schema permits multiple labels per provider (prod /
  // staging) but v1 just uses whichever is freshest.
  try {
    const rows = byokEligible
      ? await db
          .select()
          .from(clientApiKeys)
          .where(
            and(
              eq(clientApiKeys.clientId, clientId),
              eq(clientApiKeys.provider, dbProvider(provider)),
            ),
          )
      : [];

    if (rows.length > 0) {
      // Prefer the row most recently used; otherwise newest by createdAt.
      const sorted = [...rows].sort((a, b) => {
        const aT = a.lastUsedAt?.getTime() ?? a.createdAt.getTime();
        const bT = b.lastUsedAt?.getTime() ?? b.createdAt.getTime();
        return bT - aT;
      });
      const row = sorted[0];
      try {
        const plaintext = decryptApiKey(row.encryptedKey);
        resolved = {
          key: plaintext,
          source: 'byok',
          clientId,
          provider,
        };
        // Best-effort lastUsedAt bump — never block resolution on it.
        void db
          .update(clientApiKeys)
          .set({ lastUsedAt: new Date() })
          .where(eq(clientApiKeys.id, row.id))
          .catch(() => { /* swallow — telemetry, not load-bearing */ });
      } catch (err) {
        console.warn(
          `[resolveClientApiKey] decrypt failed for clientId=${clientId} provider=${provider}; falling through to platform key`,
          err,
        );
      }
    }
  } catch (err) {
    // DB failure → fall through to platform. Logged so on-call sees it.
    console.warn(
      `[resolveClientApiKey] DB lookup failed for clientId=${clientId} provider=${provider}`,
      err,
    );
  }

  if (!resolved) {
    const platform = getPlatformKey(provider);
    if (!platform) {
      throw new Error(
        `[resolveClientApiKey] No BYOK row and no platform env var for provider=${provider} (clientId=${clientId}). ` +
        `Set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} or add a BYOK key.`,
      );
    }
    resolved = {
      key: platform,
      source: 'platform',
      clientId,
      provider,
    };
  }

  cache.set(k, { value: resolved, expiresAt: Date.now() + CACHE_TTL_MS });
  return resolved;
}

/**
 * Test / dev helper — purge the in-memory cache. Production callers never
 * need this; the 60s TTL is enough for hot paths.
 */
export function _clearResolveCache(): void {
  cache.clear();
}
