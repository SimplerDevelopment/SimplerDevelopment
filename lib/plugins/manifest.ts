// Manifest fetcher + in-memory cache + cross-check.
//
// The portal hits `<app.manifestUrl>` to learn what nav items + callback
// routes a plugin exposes. Manifests are short-lived (60s in-memory cache):
// long enough to dampen burst traffic during a request fan-out, short enough
// that a plugin's nav redeploy shows up quickly. On fetch failure we fall
// back to the last good cached value with `stale: true` so a flaky plugin
// host doesn't break the portal sidebar.
//
// Cross-checks (after Zod parse):
//   - `manifest.id === app.slug`         — plugin can't impersonate another
//   - `requiredScopes ⊆ app.defaultScopes` — plugin can't escalate
//
// The scope subset check honors wildcard scopes: `foo:bar:*` covers both
// `foo:bar:read` and `foo:bar:write`; `foo:*` covers everything under `foo`.
// `isScopeCovered` is exported because the callback router uses the same
// check when comparing a JWT's `scopes` claim against a handler's required
// scope.

import type { RegisteredApp } from '@/lib/db/schema';
import { ManifestSchema, type Manifest } from './manifest-schema';

const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 5_000;

interface CacheEntry {
  manifest: Manifest;
  fetchedAt: number;
}

const cache = new Map<number, CacheEntry>();

export type ManifestFetchResult =
  | { ok: true; manifest: Manifest; stale: false }
  | { ok: true; manifest: Manifest; stale: true; reason: string }
  | {
      ok: false;
      reason:
        | 'fetch-failed'
        | 'parse-failed'
        | 'validation-failed'
        | 'id-mismatch'
        | 'scope-superset';
      details?: string;
    };

type AppForManifest = Pick<
  RegisteredApp,
  'id' | 'slug' | 'manifestUrl' | 'defaultScopes'
>;

interface FetchOpts {
  /** Bypass the in-memory cache and always hit the network. */
  force?: boolean;
  /** Override `Date.now()` — for tests that simulate cache aging. */
  now?: number;
}

/**
 * Returns true if `granted` includes `required` either exactly OR via a
 * wildcard match. Wildcards are suffix-only: `foo:*` and `foo:bar:*` match;
 * `*:bar:read` is NOT a wildcard (treated as a literal scope).
 *
 *   isScopeCovered('foo:bar:read', ['foo:bar:*']) → true
 *   isScopeCovered('foo:bar:read', ['foo:*'])     → true
 *   isScopeCovered('foo:bar:*',    ['foo:*'])     → true
 *   isScopeCovered('foo:bar:read', ['foo:baz:*']) → false
 */
export function isScopeCovered(required: string, granted: string[]): boolean {
  if (granted.includes(required)) return true;
  for (const g of granted) {
    if (!g.endsWith(':*')) continue;
    const prefix = g.slice(0, -1); // 'foo:bar:*' → 'foo:bar:'
    if (required.startsWith(prefix)) return true;
    // Also: a wildcard scope in `granted` covers a more-specific wildcard
    // in `required` (e.g. granted `foo:*` covers required `foo:bar:*`).
    if (required.endsWith(':*')) {
      const reqPrefix = required.slice(0, -1);
      if (reqPrefix.startsWith(prefix)) return true;
    }
  }
  return false;
}

/** Clear the in-memory manifest cache. Pass an `appId` to clear a single
 *  entry; pass nothing to wipe everything (e.g. between tests). */
export function clearManifestCache(appId?: number): void {
  if (appId === undefined) {
    cache.clear();
  } else {
    cache.delete(appId);
  }
}

function isCacheFresh(entry: CacheEntry, now: number): boolean {
  return now - entry.fetchedAt < CACHE_TTL_MS;
}

async function fetchManifestJson(
  url: string,
): Promise<{ ok: true; json: unknown } | { ok: false; reason: string }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      return { ok: false, reason: `fetch-failed: ${res.status}` };
    }
    const json = (await res.json()) as unknown;
    return { ok: true, json };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `fetch-failed: ${message}` };
  }
}

/**
 * Fetch a plugin's manifest, validate it, cross-check it against the
 * `registered_apps` row, and cache the result. On transient fetch failures
 * with a populated cache, return the cached value flagged stale rather than
 * failing — the portal sidebar should keep rendering through a brief plugin
 * outage.
 */
export async function fetchAndCacheManifest(
  app: AppForManifest,
  opts: FetchOpts = {},
): Promise<ManifestFetchResult> {
  const now = opts.now ?? Date.now();
  const cached = cache.get(app.id);

  // Cache hit and fresh: short-circuit unless caller forced a refresh.
  if (!opts.force && cached && isCacheFresh(cached, now)) {
    return { ok: true, manifest: cached.manifest, stale: false };
  }

  const fetched = await fetchManifestJson(app.manifestUrl);
  if (!fetched.ok) {
    // Network/HTTP failure: fall back to cache (stale) if we have one.
    if (cached) {
      return {
        ok: true,
        manifest: cached.manifest,
        stale: true,
        reason: fetched.reason,
      };
    }
    return { ok: false, reason: 'fetch-failed', details: fetched.reason };
  }

  const parsed = ManifestSchema.safeParse(fetched.json);
  if (!parsed.success) {
    // We treat malformed JSON (caught upstream) and schema-violating JSON the
    // same way — fail closed. We never substitute stale data here because a
    // valid HTTP 200 with bad shape is a deploy bug, not a transient flake.
    return {
      ok: false,
      reason: 'validation-failed',
      details: parsed.error.message,
    };
  }

  const manifest = parsed.data;

  if (manifest.id !== app.slug) {
    return {
      ok: false,
      reason: 'id-mismatch',
      details: `manifest.id="${manifest.id}" but registered_apps.slug="${app.slug}"`,
    };
  }

  const granted = app.defaultScopes ?? [];
  const uncoveredScopes = manifest.requiredScopes.filter(
    (s) => !isScopeCovered(s, granted),
  );
  if (uncoveredScopes.length > 0) {
    return {
      ok: false,
      reason: 'scope-superset',
      details: `requiredScopes not covered by defaultScopes: ${uncoveredScopes.join(', ')}`,
    };
  }

  cache.set(app.id, { manifest, fetchedAt: now });
  return { ok: true, manifest, stale: false };
}
