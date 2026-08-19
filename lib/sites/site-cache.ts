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

/**
 * Seconds a cached site read stays fresh before Next revalidates it on its own.
 *
 * This is a BACKSTOP, not the primary freshness mechanism. Every write that
 * changes what a public page renders purges by tag — post save/publish/delete
 * and the scheduled-publish cron call revalidateSiteContent, and nav publish,
 * custom-code publish and branding save call revalidateSiteChrome — so an edit
 * is live immediately regardless of this number.
 *
 * It was 300s while only the content purges existed, which meant a cache miss
 * every five minutes and measurable run-to-run swing (Lighthouse LCP on the
 * integratouch homepage varied 2.9s-5.1s purely on hit vs miss). With the chrome
 * purges wired the TTL only has to cover a write path nobody hooked up, so an
 * hour is the right order of magnitude: misses become rare, and the failure mode
 * of a missed hook is bounded staleness rather than a permanently wrong page.
 */
const DEFAULT_REVALIDATE_SECONDS = 3600;

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
 * revalidateTag() throws "Invariant: static generation store missing" when
 * called outside a request or static-generation context — which happens for
 * real: publishAllNavDrafts runs from the MCP approval path and
 * process-scheduled-posts runs from cron. A cache purge failing must never take
 * down the publish that triggered it, so failures are logged and swallowed. The
 * cost of a missed purge is bounded staleness (see DEFAULT_REVALIDATE_SECONDS);
 * the cost of throwing here would be a failed publish.
 */
function purgeTag(tag: string): void {
  try {
    revalidateTag(tag, 'max');
  } catch (err) {
    console.warn(`[site-cache] purge failed for ${tag}:`, err);
  }
}

function purge(siteId: number, names: string[]): void {
  for (const name of names) purgeTag(siteTag(siteId, name));
}

/**
 * Purge a tenant's CONTENT reads (pages, home, blog index, post types).
 * Call after any write that changes what a published page renders.
 */
export function revalidateSiteContent(siteId: number): void {
  purge(siteId, ['page', 'home', 'blog-index', 'posttype']);
}

/**
 * Purge a tenant's CHROME reads (branding, navigation, tracking).
 * Call after a branding, nav, custom-code or tracking change.
 */
export function revalidateSiteChrome(siteId: number): void {
  purge(siteId, ['branding', 'nav', 'tracking']);
}

/** Purge everything for one tenant. Use when a domain changes, or as a big hammer. */
export function revalidateSiteAll(siteId: number): void {
  revalidateSiteContent(siteId);
  revalidateSiteChrome(siteId);
  purgeTag(siteTag(siteId));
  // Domain -> site resolution is keyed by hostname, not siteId, so it has its
  // own tag and has to be purged explicitly.
  purgeTag('site-by-domain');
}
