-- Per-tenant opt-in to shared-CDN caching of a client site's public HTML.
--
-- middleware.ts sets `Cache-Control: public, s-maxage=60, stale-while-revalidate`
-- on the tenant rewrite only when this flag is on AND the request is provably
-- one-size-fits-all (public site, GET, no preview/edit params, no session or
-- unlock cookie, no running A/B experiment). See lib/sites/host-resolver.ts.
--
-- DEFAULT false is the point: this column is the kill switch. Caching a
-- tenant's HTML at a shared edge is the highest-blast-radius change in the
-- public render path, so it is opt-in per site and can be flipped back
-- instantly with an UPDATE. An env var was rejected for the same job because
-- edge middleware only picks up env changes on redeploy, which is far too slow
-- for a kill switch.
--
-- Additive only (ADD COLUMN with a default), so the "Prod schema sync
-- (additive)" workflow can apply it; re-runnable via IF NOT EXISTS.

ALTER TABLE client_websites
  ADD COLUMN IF NOT EXISTS cdn_cache_enabled boolean DEFAULT false NOT NULL;

-- Enable for the IntegraTouch site only, as the first tenant. Everything else
-- stays on the existing uncached path until this one is verified in production
-- (expect `x-vercel-cache: HIT` on a repeat anonymous GET of a published page).
UPDATE client_websites
   SET cdn_cache_enabled = true
 WHERE subdomain = 'integratouch'
   AND cdn_cache_enabled = false;
