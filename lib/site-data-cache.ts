/**
 * Caching for the per-tenant site data fetchers, in two layers.
 *
 * LAYER 1 — React `cache()`, per request. The underlying functions in
 * `lib/actions/client-sites.ts` are server actions (`'use server'` file) with no
 * memoization, and both `generateMetadata` and the page component call
 * `getClientWebsiteByDomain` / `getClientHomePage` during the same render, so
 * without dedup each DB query runs twice. Keep this file separate from the
 * 'use server' module so the two can compose — server actions can't be wrapped
 * in cache() themselves.
 *
 * LAYER 2 — `siteCached()`, across requests. Public client-site routes are
 * `force-dynamic`, so before this every visitor re-ran the whole chain against
 * Postgres and the HTML document didn't finish streaming for ~2s, which delayed
 * every stylesheet and image behind it. See lib/sites/site-cache.ts for why the
 * tenant id is a required argument there rather than a convention.
 *
 * PREVIEW IS NEVER CACHED. `getClientPage(websiteId, slug, preview)` drops the
 * `published = true` predicate when preview is truthy, so a cached preview entry
 * would be a durable copy of UNPUBLISHED content sitting in a shared cache. The
 * cached fetchers below therefore have no preview parameter at all — it is not
 * that we pass `false`, it is that there is nothing to pass — and the preview
 * path calls the raw server action directly. Removing the parameter is the
 * enforcement; a boolean in the cache key would not be.
 */
import { cache } from 'react';
import * as actions from './actions/client-sites';
import * as branding from './branding';
import { siteCached } from './sites/site-cache';

/** Published-only reads. No `preview` parameter by construction — see the note above. */
const getPublishedPage = (websiteId: number, slug: string) => actions.getClientPage(websiteId, slug, false);
const getPublishedHomePage = (websiteId: number) => actions.getClientHomePage(websiteId, false);

export const getClientWebsiteByDomainCached = cache(actions.getClientWebsiteByDomain);

export const getClientPageCached = cache((websiteId: number, slug: string, preview = false) =>
  preview
    ? actions.getClientPage(websiteId, slug, true)
    : siteCached(websiteId, 'page', getPublishedPage, [websiteId, slug]),
);

export const getClientHomePageCached = cache((websiteId: number, preview = false) =>
  preview
    ? actions.getClientHomePage(websiteId, true)
    : siteCached(websiteId, 'home', getPublishedHomePage, [websiteId]),
);

export const getPostTypeForPostCached = cache((websiteId: number, postType: string) =>
  siteCached(websiteId, 'posttype', actions.getPostTypeForPost, [websiteId, postType]),
);

export const getClientSiteNavItemsCached = cache((websiteId: number) =>
  siteCached(websiteId, 'nav', actions.getClientSiteNavItems, [websiteId]),
);

export const getBrandingByWebsiteIdCached = cache((websiteId: number) =>
  siteCached(websiteId, 'branding', branding.getBrandingByWebsiteId, [websiteId]),
);
