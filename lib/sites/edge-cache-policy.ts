/**
 * Decides whether a public tenant-site response may enter a SHARED (CDN) cache.
 *
 * Lives here rather than inline in middleware.ts so it can be unit-tested
 * directly — middleware isn't importable under vitest, and this is the one
 * function in the public render path where a wrong answer means one visitor
 * sees another's page, or an unpublished draft goes public. It is deliberately
 * pure: facts in, boolean out, no I/O.
 *
 * The default is "do not cache". Every `return false` below names a specific
 * way the same URL renders differently for two visitors.
 */

/** The subset of SiteHostInfo this decision needs (see lib/sites/host-resolver.ts). */
export interface SiteHostInfoLike {
  siteId: number;
  publicAccess: boolean;
  cdnCacheEnabled: boolean;
  hasRunningExperiment: boolean;
}

/** The subset of the request this decision needs. */
export interface EdgeCacheRequest {
  method: string;
  url: string;
  cookie: string;
}

// Anchored at a cookie boundary so a cookie merely CONTAINING the name — say
// `not_sd_unlocked_42` — doesn't trip the check.
const SESSION_COOKIE = /(^|;\s*)(__Secure-)?(next-auth|authjs)\.session-token=/;
const UNLOCK_COOKIE = /(^|;\s*)sd_unlocked_/;

/** Params that mean "render unpublished content". */
const PREVIEW_PARAMS = ['_edit', '_preview', '_token'] as const;

export function mayShareCache(req: EdgeCacheRequest, info: SiteHostInfoLike): boolean {
  // The kill switch. Opt-in per tenant via clientWebsites.cdn_cache_enabled —
  // a DB flag takes effect immediately, where an env var would need a redeploy
  // before edge middleware saw it.
  if (!info.cdnCacheEnabled) return false;

  // A running experiment varies content per visitor; caching would pin one
  // variant for everyone.
  if (info.hasRunningExperiment) return false;

  // A gated site renders either the access wall or the unlocked content
  // depending on a signed cookie, so it is never one-size-fits-all.
  if (!info.publicAccess) return false;

  if (req.method !== 'GET') return false;

  // Preview/edit render UNPUBLISHED content. The token is verified in the page,
  // not here — middleware decides caching, never authorization — so the mere
  // presence of a preview-shaped param is enough to refuse.
  let params: URLSearchParams;
  try {
    params = new URL(req.url).searchParams;
  } catch {
    return false; // unparseable URL: refuse rather than guess
  }
  if (PREVIEW_PARAMS.some((p) => params.has(p))) return false;

  // A session cookie means a signed-in viewer who may see editor affordances;
  // an unlock cookie means someone past a gated site's wall. Presence alone is
  // enough — a false positive costs a cache miss, which is the safe direction.
  if (SESSION_COOKIE.test(req.cookie)) return false;
  if (UNLOCK_COOKIE.test(req.cookie)) return false;

  return true;
}
