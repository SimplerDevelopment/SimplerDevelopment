// Plugin proxy helpers used by `middleware.ts` to gate + rewrite
// `/portal/apps/<slug>/*` to a registered remote app.
//
// Responsibilities:
//   1. `loadActiveAppBySlug` — look up a plugin row by slug (status='active'
//      only). 30s in-memory cache so the per-request hot path doesn't slam
//      Postgres; plugin metadata changes very rarely.
//   2. `isClientEntitled` — answer "may this client see this plugin?" by
//      consulting the row's visibility model:
//        - 'global'     → every authenticated tenant
//        - 'allowlist'  → clientId must appear in `allowedClientIds`
//        - 'entitled'   → there must be an active `client_services` row
//                          joining to `services.id = app.billingServiceId`
//      30s cache keyed by (clientId, appId).
//   3. `invalidateAppCache` / `invalidateEntitlementCache` — hooks for admin
//      mutations and manifest refresh; safe to call with no args to flush
//      everything.
//   4. `buildProxyUrl` — construct the proxied URL safely. Refuses non-https
//      hostUrls, and always builds via the WHATWG URL parser (never string
//      concatenation) so path traversal `..` is normalised by the URL spec
//      before it reaches the plugin origin.
//
// The middleware that consumes this module is in the project root
// `middleware.ts`. See `.planning/plugin-registry-spec.md` for the full
// architecture.

import { and, eq } from 'drizzle-orm';
import { unstable_cache, revalidateTag } from 'next/cache';
import { db } from '@/lib/db';
import {
  registeredApps,
  clientServices,
  services,
  type RegisteredApp,
} from '@/lib/db/schema';

// Tag used by the cross-request `unstable_cache` layer for the plugin
// registry. Invalidated from `invalidateAppCache()` so admin mutations
// flush every serverless instance, not just the one that handled the call.
const PLUGIN_REGISTRY_TAG = 'plugin-registry';

// ─── Caches ────────────────────────────────────────────────────────────────

const APP_CACHE_TTL_MS = 30_000;
const ENTITLEMENT_CACHE_TTL_MS = 30_000;

interface AppCacheEntry {
  app: RegisteredApp | null; // null = negative cache: row missing or non-active
  expiresAt: number;
}

interface EntitlementCacheEntry {
  entitled: boolean;
  expiresAt: number;
}

const APP_CACHE = new Map<string, AppCacheEntry>();
const ENTITLEMENT_CACHE = new Map<string, EntitlementCacheEntry>();

function entitlementCacheKey(clientId: number, appId: number): string {
  return `${clientId}:${appId}`;
}

// ─── App lookup ────────────────────────────────────────────────────────────

/**
 * Inner DB lookup for a plugin app by slug. Extracted so it can be wrapped
 * with `unstable_cache` for cross-request reuse.
 */
async function fetchAppBySlug(slug: string): Promise<RegisteredApp | null> {
  const rows = await db
    .select()
    .from(registeredApps)
    .where(eq(registeredApps.slug, slug))
    .limit(1);
  const row = rows[0];
  return row && row.status === 'active' ? row : null;
}

const fetchAppBySlugCached = unstable_cache(
  fetchAppBySlug,
  ['plugin-registry-app'],
  { revalidate: 300, tags: [PLUGIN_REGISTRY_TAG] },
);

async function fetchAppBySlugWithFallback(slug: string): Promise<RegisteredApp | null> {
  try {
    return await fetchAppBySlugCached(slug);
  } catch {
    // Outside a request context (tests/cron/MCP) — incrementalCache unavailable.
    return fetchAppBySlug(slug);
  }
}

/**
 * Load an active plugin app by slug. Returns null if not found OR if status is
 * not 'active'. Two-tier cache: 30s in-memory + 5min cross-instance via
 * `unstable_cache` (tag `plugin-registry`). Admin mutations flush both layers
 * via `invalidateAppCache()`.
 */
export async function loadActiveAppBySlug(
  slug: string,
): Promise<RegisteredApp | null> {
  const now = Date.now();
  const cached = APP_CACHE.get(slug);
  if (cached && cached.expiresAt > now) {
    return cached.app;
  }
  const app = await fetchAppBySlugWithFallback(slug);
  APP_CACHE.set(slug, { app, expiresAt: now + APP_CACHE_TTL_MS });
  return app;
}

// ─── Entitlement ───────────────────────────────────────────────────────────

/**
 * Determine entitlement for (client, app). Returns true if any of:
 *   - app.visibility === 'global'
 *   - app.visibility === 'allowlist' AND clientId ∈ app.allowedClientIds
 *   - app.visibility === 'entitled' AND there's an active client_services row
 *     joining services where services.id === app.billingServiceId
 *
 * 30-second cache per (clientId, appId).
 */
export async function isClientEntitled(
  clientId: number,
  app: RegisteredApp,
): Promise<boolean> {
  const now = Date.now();
  const key = entitlementCacheKey(clientId, app.id);
  const cached = ENTITLEMENT_CACHE.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.entitled;
  }

  let entitled = false;
  switch (app.visibility) {
    case 'global':
      entitled = true;
      break;
    case 'allowlist': {
      const allowed = Array.isArray(app.allowedClientIds)
        ? app.allowedClientIds
        : [];
      entitled = allowed.includes(clientId);
      break;
    }
    case 'entitled': {
      if (app.billingServiceId == null) {
        // No billing service configured — can't possibly be entitled via this
        // path. Fail closed.
        entitled = false;
        break;
      }
      const rows = await db
        .select({ id: clientServices.id })
        .from(clientServices)
        .innerJoin(services, eq(services.id, clientServices.serviceId))
        .where(
          and(
            eq(clientServices.clientId, clientId),
            eq(clientServices.status, 'active'),
            eq(services.id, app.billingServiceId),
          ),
        )
        .limit(1);
      entitled = rows.length > 0;
      break;
    }
    default:
      // Unknown visibility — fail closed.
      entitled = false;
  }

  ENTITLEMENT_CACHE.set(key, {
    entitled,
    expiresAt: now + ENTITLEMENT_CACHE_TTL_MS,
  });
  return entitled;
}

// ─── Cache invalidation ────────────────────────────────────────────────────

/**
 * Invalidate the per-slug app cache. With no argument, flushes the entire
 * cache. Call from admin mutation routes that change a plugin row.
 */
export function invalidateAppCache(slug?: string): void {
  if (slug === undefined) {
    APP_CACHE.clear();
  } else {
    APP_CACHE.delete(slug);
  }
  // Also flush the cross-instance cache so other serverless workers see
  // the change on their next call instead of waiting out the 5-min revalidate.
  try {
    revalidateTag(PLUGIN_REGISTRY_TAG, 'max');
  } catch {
    // Non-route context (e.g. test harness) — in-memory clear above is
    // sufficient; revalidateTag is unavailable.
  }
}

/**
 * Invalidate the entitlement cache. Both args are optional:
 *   - both omitted: flush everything
 *   - only clientId: flush all entries for that client
 *   - only appId: flush all entries for that app
 *   - both: flush exactly that pair
 */
export function invalidateEntitlementCache(
  clientId?: number,
  appId?: number,
): void {
  if (clientId === undefined && appId === undefined) {
    ENTITLEMENT_CACHE.clear();
    return;
  }
  if (clientId !== undefined && appId !== undefined) {
    ENTITLEMENT_CACHE.delete(entitlementCacheKey(clientId, appId));
    return;
  }
  // Partial: iterate keys.
  for (const key of Array.from(ENTITLEMENT_CACHE.keys())) {
    const [c, a] = key.split(':');
    if (clientId !== undefined && Number(c) === clientId) {
      ENTITLEMENT_CACHE.delete(key);
      continue;
    }
    if (appId !== undefined && Number(a) === appId) {
      ENTITLEMENT_CACHE.delete(key);
    }
  }
}

// ─── URL building ──────────────────────────────────────────────────────────

/**
 * Build a proxied URL for the plugin origin.
 *
 *  - `hostUrl` is the registered `registered_apps.host_url`, e.g.
 *    `https://content-tools.simplerdevelopment.com` (no trailing slash).
 *  - `pathSuffix` is the portion after `/portal/apps/<slug>` — e.g.
 *    `/briefs/42` or `''` for the dashboard root.
 *  - `search` is `request.nextUrl.search` (e.g. `?page=2`), forwarded as-is.
 *
 * Always built with the WHATWG `URL` parser so any `..` segments are
 * normalised before the request leaves the proxy. Throws if `hostUrl` is not
 * https:// — http:// remote plugins are not permitted (no MITM exposure).
 */
export function buildProxyUrl(
  hostUrl: string,
  pathSuffix: string,
  search: string,
): URL {
  let base: URL;
  try {
    base = new URL(hostUrl);
  } catch {
    throw new Error(`buildProxyUrl: invalid hostUrl ${JSON.stringify(hostUrl)}`);
  }
  if (base.protocol !== 'https:') {
    throw new Error(
      `buildProxyUrl: hostUrl must be https:// (got ${base.protocol})`,
    );
  }

  // Combine the registered hostUrl path (usually `/`) with the requested
  // suffix. Resolve using the URL constructor's relative-resolution rules so
  // path-traversal segments (`..`, `.`) are normalised by the spec. Any
  // accidental absolute-path suffix (`/abs`) will replace the base path —
  // which is the behaviour we want.
  let normalisedSuffix = pathSuffix || '';
  if (normalisedSuffix && !normalisedSuffix.startsWith('/')) {
    normalisedSuffix = `/${normalisedSuffix}`;
  }
  // Build relative to the base origin (not base.href), so the base path on the
  // registered hostUrl (if any) is not concatenated. Plugins are mounted at
  // their origin root.
  const target = new URL(normalisedSuffix || '/', base.origin);

  // Re-apply search string if present.
  if (search) {
    // `search` from NextRequest.nextUrl is either '' or starts with '?'.
    target.search = search.startsWith('?') ? search : `?${search}`;
  }

  return target;
}
