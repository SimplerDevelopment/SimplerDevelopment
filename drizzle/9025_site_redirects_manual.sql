-- PUX-095: per-tenant redirects.
--
-- Why a table instead of next.config.ts: redirects there are global to the
-- whole platform, so one client's retired URLs would ship to every tenant --
-- the same class of mistake as hardcoding one client's copy into a shared
-- component (see PUX-093). Found Delivery Co. needed three retired pages to
-- keep resolving and a domain consolidation; neither is expressible today.
--
-- from_path is matched EXACTLY and lowercased in middleware, not as a pattern.
-- Wildcards were deliberately left out: a regex per row on the request hot
-- path is a footgun (catastrophic backtracking on attacker-controlled URLs),
-- and nobody has asked for one. Add prefix matching when a real case appears.
--
-- The unique index is the load-bearing part. Two enabled rows with the same
-- from_path would make the winning redirect depend on row order, which is not
-- something anyone can debug from the outside.
--
-- Host-level canonicalisation is NOT here on purpose: it is driven by
-- website_domains.is_primary, which already exists and was previously inert
-- bookkeeping that nothing read. One source of truth for "which domain is the
-- real one" beats two that can disagree.
--
-- Additive only (CREATE TABLE IF NOT EXISTS), but "Prod schema sync (additive)"
-- is gated on a PROD_DATABASE_URL secret that is NOT set and silently skips.
-- Apply to metro BY HAND at merge:
--   psql "$METRO" -v ON_ERROR_STOP=1 -f drizzle/9025_site_redirects_manual.sql
-- Re-runnable via IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS site_redirects (
  id            serial PRIMARY KEY,
  website_id    integer NOT NULL REFERENCES client_websites(id) ON DELETE CASCADE,
  from_path     varchar(500) NOT NULL,
  to_path       varchar(2000) NOT NULL,
  status_code   integer DEFAULT 301 NOT NULL,
  enabled       boolean DEFAULT true NOT NULL,
  created_at    timestamp DEFAULT now() NOT NULL,
  updated_at    timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS site_redirects_site_from_idx
  ON site_redirects (website_id, from_path);

-- Lookup is per site on every cache miss in lib/sites/host-resolver.ts.
CREATE INDEX IF NOT EXISTS site_redirects_website_idx
  ON site_redirects (website_id);
