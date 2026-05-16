// Server-only helper that loads the set of plugin apps the active client may
// see in the portal sidebar / cmd-K palette. The portal sidebar calls this at
// render time via the server-component `PortalShell` wrapper around the
// existing `'use client'` portal layout body.
//
// Behavior:
//   1. SELECT registered_apps WHERE status='active'
//   2. Filter via isClientEntitledToApp(clientId, app) — uses the canonical
//      visibility rules (allowlist | entitled | global)
//   3. For each entitled app, fetchAndCacheManifest(app):
//        - success → use manifest.nav
//        - failure with cached → use cached, mark `manifestStale: true`
//        - failure without cached → degrade gracefully (navItems: []),
//          the slug-root link still appears under the "Apps" group
//   4. Cache the whole result (per clientId) in process memory for 30s so
//      back-to-back page navs don't re-hit the DB + manifest hosts.
//   5. Sort by (navPosition ASC, name ASC).
//
// Tenancy: the cache key is `clientId`. A user switching active clients on
// the same Node instance gets a fresh load on first nav after the switch
// because each clientId has its own cache entry (no cross-tenant leak).

import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { registeredApps } from '@/lib/db/schema/plugins';
import { isClientEntitledToApp } from './entitlement';
import { fetchAndCacheManifest } from './manifest';
import type { ManifestNavItem } from './manifest-schema';

export interface UserAppNavMeta {
  /** registered_apps.slug — used to build /portal/apps/<slug> hrefs. */
  slug: string;
  /** Display name for the sidebar. Honors `navLabel` override when set. */
  name: string;
  /** Material icon name. Falls back to 'apps' when the app row has no icon. */
  icon: string;
  /** Nav items declared by the plugin's manifest. May be empty when the
   *  manifest fetch failed and we have no cached fallback. */
  navItems: ManifestNavItem[];
  /** True when the manifest is being served from cache after a failed
   *  refresh. Surfaces to the caller in case it wants to warn the user. */
  manifestStale: boolean;
}

interface CacheEntry {
  apps: UserAppNavMeta[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<number, CacheEntry>();

/** Wipe the in-process cache. Pass a clientId to clear one entry; pass
 *  nothing to clear everything. Exported for tests + admin tooling. */
export function clearUserAppsCache(clientId?: number): void {
  if (clientId === undefined) {
    cache.clear();
  } else {
    cache.delete(clientId);
  }
}

/**
 * Returns the plugin apps the given client can see in the portal sidebar.
 *
 * Errors are absorbed: an individual app whose manifest fails to fetch (and
 * has no cached fallback) still appears in the list with `navItems: []` so
 * the user can navigate to the slug-root and the proxy will surface the
 * outage there. A wholesale DB failure throws — that's a portal-level
 * problem worth bubbling.
 */
export async function loadUserApps(clientId: number): Promise<UserAppNavMeta[]> {
  const now = Date.now();
  const cached = cache.get(clientId);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.apps;
  }

  const rows = await db
    .select()
    .from(registeredApps)
    .where(and(eq(registeredApps.status, 'active')));

  const entitled = [] as typeof rows;
  for (const app of rows) {
    if (await isClientEntitledToApp(clientId, app)) {
      entitled.push(app);
    }
  }

  // Sort once entitlement filtering is done so the order is stable in the
  // sidebar regardless of which rows fell out.
  entitled.sort((a, b) => {
    if (a.navPosition !== b.navPosition) return a.navPosition - b.navPosition;
    return a.name.localeCompare(b.name);
  });

  const apps: UserAppNavMeta[] = [];
  for (const app of entitled) {
    let navItems: ManifestNavItem[] = [];
    let manifestStale = false;

    const result = await fetchAndCacheManifest(app);
    if (result.ok) {
      navItems = result.manifest.nav;
      manifestStale = result.stale === true;
    }
    // result.ok === false: leave navItems empty so we degrade gracefully —
    // the user still gets the top-level /portal/apps/<slug> link under
    // "Apps" and the proxy or upsell layout takes it from there.

    apps.push({
      slug: app.slug,
      name: app.navLabel ?? app.name,
      icon: app.icon ?? 'apps',
      navItems,
      manifestStale,
    });
  }

  cache.set(clientId, { apps, fetchedAt: now });
  return apps;
}
