/**
 * Request-scoped cache wrappers for the per-tenant site data fetchers.
 *
 * The underlying functions in `lib/actions/client-sites.ts` are server actions
 * (`'use server'` file) and have no built-in memoization. Both `generateMetadata`
 * and the page component itself call `getClientWebsiteByDomain` / `getClientHomePage`
 * during the same render, so without dedup we run each DB query twice.
 *
 * React's `cache()` memoizes per-request inside the React Server Components
 * render. Keep this file separate from the 'use server' module so we can
 * compose them — server actions can't themselves be wrapped in cache().
 */
import { cache } from 'react';
import * as actions from './actions/client-sites';
import * as branding from './branding';

export const getClientWebsiteByDomainCached = cache(actions.getClientWebsiteByDomain);
export const getClientHomePageCached = cache(actions.getClientHomePage);
export const getClientPageCached = cache(actions.getClientPage);
export const getPostTypeForPostCached = cache(actions.getPostTypeForPost);
export const getClientSiteNavItemsCached = cache(actions.getClientSiteNavItems);
export const getBrandingByWebsiteIdCached = cache(branding.getBrandingByWebsiteId);
