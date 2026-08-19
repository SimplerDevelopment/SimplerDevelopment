import { unstable_cache, revalidateTag } from 'next/cache';

/**
 * Cross-request caching for the public tenant-site render path.
 *
 * Every public client-site page is `force-dynamic` (app/sites/[domain]/layout.tsx
 * and [[...slug]]/page.tsx) and lib/site-data-cache.ts only wraps the fetchers in
 * React `cache()`, which dedups within a single request and nothing beyond it. So
 * every visitor to every client site re-runs the whole chain —
 * getClientWebsiteByDomain -> getBrandingByWebsiteId -> getClientPage ->
 * expandLoopsInContent -> prefetchHtmlEmbeds — against Postgres. On the
 * integratouch homepage that showed up as the HTML document not finishing until
 * ~2s, which in turn delayed every stylesheet and image on the page.
 *
 * WHY THE WRAPPER TAKES siteId AS ITS FIRST ARGUMENT
 *
 * `unstable_cache` keys on `keyParts` plus the JSON of the wrapped function's
 * arguments. The failure mode is a closure:
 *
 *     unstable_cache(() => fetchNav(siteId), ['nav'], ...)   // WRONG
 *
 * `siteId` is captured rather than passed, so the argument list is empty and
 * EVERY TENANT COLLIDES ON ONE CACHE ENTRY — one client's navigation served on
 * another client's site. That is a cross-tenant content leak, and it is one
 * careless refactor away at any time.
 *
 * `siteCached` makes that mistake unrepresentable: the tenant id is a required
 * positional parameter, and it goes into the key AND the tag. Do not call
 * `unstable_cache` directly anywhere in the public render path — use this.
 */

/** Milliseconds a cached site read stays fresh before Next revalidates it. */
const DEFAULT_REVALIDATE_SECONDS = 300;

export function siteTag(siteId: number, name?: string): string {
  return name ? `site:${siteId}:${name}` : `site:${siteId}`;
}

/**
 * Cache a per-tenant read.
 *
 * @param siteId  clientWebsites.id — the tenant boundary. Always in the key.
 * @param name    short stable name for the read ('branding', 'nav', 'page', ...)
 * @param fn      the fetcher; receives `args` so its own arguments join the key
 * @param args    the fetcher's arguments — must include everything that varies
 */
export function siteCached<TArgs extends readonly unknown[], TOut>(
  siteId: number,
  name: string,
  fn: (...args: TArgs) => Promise<TOut>,
  args: TArgs,
  opts?: { revalidate?: number },
): Promise<TOut> {
  const keyParts = ['site', String(siteId), name, ...args.map((a) => JSON.stringify(a) ?? 'undefined')];

  try {
    return unstable_cache(fn, keyParts, {
      tags: [siteTag(siteId), siteTag(siteId, name)],
      revalidate: opts?.revalidate ?? DEFAULT_REVALIDATE_SECONDS,
    })(...args);
  } catch {
    // Outside a request context (scripts, cron, some MCP paths) the incremental
    // cache is unavailable and unstable_cache throws. Fall through to the raw
    // fetcher rather than taking those callers down — same defensive pattern as
    // lib/branding.ts and lib/blocks/prefetch-embeds.ts.
    return fn(...args);
  }
}

/**
 * Purge a tenant's CONTENT reads (pages, home, blog index, post types).
 * Call after any write that changes what a published page renders.
 */
export function revalidateSiteContent(siteId: number): void {
  for (const name of ['page', 'home', 'blog-index', 'posttype']) {
    revalidateTag(siteTag(siteId, name), 'max');
  }
}

/**
 * Purge a tenant's CHROME reads (branding, navigation, tracking).
 * Call after a branding, nav, custom-code or tracking change.
 */
export function revalidateSiteChrome(siteId: number): void {
  for (const name of ['branding', 'nav', 'tracking']) {
    revalidateTag(siteTag(siteId, name), 'max');
  }
}

/** Purge everything for one tenant. Use when a domain changes, or as a big hammer. */
export function revalidateSiteAll(siteId: number): void {
  revalidateSiteContent(siteId);
  revalidateSiteChrome(siteId);
  revalidateTag(siteTag(siteId), 'max');
  // Domain -> site resolution is keyed by hostname, not siteId, so it has its
  // own tag and has to be purged explicitly.
  revalidateTag('site-by-domain', 'max');
}
