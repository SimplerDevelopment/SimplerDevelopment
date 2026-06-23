-- Per-site tracking-script configuration. 1:1 with `client_websites` (unique
-- website_id). Column names mirror `PROVIDERS[*].key` in
-- `lib/site-tracking/providers.ts` — that file is the single source of truth
-- for which fields exist, how to label/validate them, and how the public
-- renderer emits them. Adding a provider means: append to PROVIDERS, add a
-- matching column here, regen/hand-write the next migration, then update
-- `components/sites/TrackingScripts.tsx`.
--
-- `enabled` is a global per-row kill switch — when false, the renderer
-- emits nothing regardless of which IDs are populated. `custom_head_html`
-- and `custom_body_html` are escape hatches for vendor tags we don't have
-- first-class support for yet; the API still strips `javascript:` URLs in
-- `normalizeTrackingValue`.
--
-- NOTE: hand-written. The drizzle meta snapshot is stuck on a pre-existing
-- collision (project_sd2026_drizzle_tracker_drift). Mirrors the
-- `siteTracking` table in `lib/db/schema/sites.ts`. Follows the same
-- idempotent DO $$ ... EXCEPTION pattern as 0114_plugin_registry.sql so it
-- can be re-applied safely against an already-migrated database.

CREATE TABLE IF NOT EXISTS "site_tracking" (
  "id" serial PRIMARY KEY NOT NULL,
  "website_id" integer NOT NULL,
  "ga_measurement_id" varchar(50),
  "gtm_container_id" varchar(50),
  "meta_pixel_id" varchar(50),
  "clarity_project_id" varchar(50),
  "hotjar_site_id" varchar(50),
  "linkedin_partner_id" varchar(50),
  "tiktok_pixel_id" varchar(50),
  "gsc_verification" varchar(255),
  "bing_verification" varchar(255),
  "pinterest_verification" varchar(255),
  "custom_head_html" text,
  "custom_body_html" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "site_tracking_website_id_unique" UNIQUE("website_id")
);

DO $$ BEGIN
  ALTER TABLE "site_tracking"
    ADD CONSTRAINT "site_tracking_website_id_client_websites_id_fk"
    FOREIGN KEY ("website_id") REFERENCES "client_websites"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
