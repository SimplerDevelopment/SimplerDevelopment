-- Product Designer integration — hand-authored migration.
-- See .planning/product-designer-integration.md for the integration spec.
-- Drizzle tracker is out of sync in this repo; do NOT run via drizzle-kit.
-- Apply this manually to Railway Postgres (staging+prod share one DB).
-- Idempotent: uses IF NOT EXISTS / DROP TRIGGER guards so reruns are safe.
--
-- This migration covers both integration approaches:
--   1. Fabric.js surface-based designer (from feat/product-designer):
--      product_design_surfaces, designs, design_assets tables + uuid FKs
--   2. Philaprints style/side-based designer (from feat/product-designer-integration):
--      product_styles, product_sides, product_designs tables + integer FKs
--
-- Apply the full file; individual blocks are idempotent.

-- ─── products.is_designable (Fabric.js designer) ───────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_designable boolean NOT NULL DEFAULT false;

-- ─── products.designable (philaprints designer) ────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS designable boolean NOT NULL DEFAULT false;

-- ─── product_design_surfaces (Fabric.js surface config) ────────────────────
CREATE TABLE IF NOT EXISTS product_design_surfaces (
  id                 serial PRIMARY KEY,
  product_id         integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name               varchar(80) NOT NULL,
  slug               varchar(80) NOT NULL,
  display_order      integer NOT NULL DEFAULT 0,
  mockup_image       varchar(500) NOT NULL,
  canvas_width       integer NOT NULL DEFAULT 800,
  canvas_height      integer NOT NULL DEFAULT 600,
  print_area_x       integer NOT NULL DEFAULT 100,
  print_area_y       integer NOT NULL DEFAULT 100,
  print_area_width   integer NOT NULL DEFAULT 600,
  print_area_height  integer NOT NULL DEFAULT 400,
  print_dpi          integer NOT NULL DEFAULT 300,
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamp NOT NULL DEFAULT now(),
  updated_at         timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_design_surfaces_product_slug_idx
  ON product_design_surfaces (product_id, slug);

-- ─── designs (Fabric.js saved customer designs, uuid PK) ───────────────────
CREATE TABLE IF NOT EXISTS designs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id         integer NOT NULL REFERENCES client_websites(id) ON DELETE CASCADE,
  product_id         integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id        integer,
  session_id         varchar(255),
  name               varchar(255) NOT NULL DEFAULT 'Untitled design',
  layers_by_surface  jsonb NOT NULL DEFAULT '{}'::jsonb,
  canvas_size        jsonb NOT NULL DEFAULT '{"width":800,"height":600,"dpi":72}'::jsonb,
  thumbnail_url      varchar(500),
  rendered_url       varchar(500),
  status             varchar(20) NOT NULL DEFAULT 'draft',
  is_template        boolean NOT NULL DEFAULT false,
  created_at         timestamp NOT NULL DEFAULT now(),
  updated_at         timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS designs_website_idx    ON designs (website_id);
CREATE INDEX IF NOT EXISTS designs_customer_idx   ON designs (customer_id);
CREATE INDEX IF NOT EXISTS designs_session_idx    ON designs (session_id);
CREATE INDEX IF NOT EXISTS designs_product_idx    ON designs (product_id);
CREATE INDEX IF NOT EXISTS designs_template_idx   ON designs (is_template);

-- ─── design_assets (per-design uploaded images for Fabric.js designer) ──────
CREATE TABLE IF NOT EXISTS design_assets (
  id                serial PRIMARY KEY,
  design_id         uuid NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  url               varchar(500) NOT NULL,
  stored_filename   varchar(255),
  original_filename varchar(255),
  mime_type         varchar(80),
  width             integer,
  height            integer,
  file_size         integer,
  created_at        timestamp NOT NULL DEFAULT now()
);

-- ─── cart_items.design_id (uuid → designs) ────────────────────────────────
ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS design_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cart_items_design_id_fkey'
  ) THEN
    ALTER TABLE cart_items
      ADD CONSTRAINT cart_items_design_id_fkey
      FOREIGN KEY (design_id) REFERENCES designs(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── order_items.design_id / design_snapshot / print_ready_url ─────────────
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS design_id uuid,
  ADD COLUMN IF NOT EXISTS design_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS print_ready_url varchar(500);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_design_id_fkey'
  ) THEN
    ALTER TABLE order_items
      ADD CONSTRAINT order_items_design_id_fkey
      FOREIGN KEY (design_id) REFERENCES designs(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── product_styles (philaprints: product variants with mockup imagery) ──────
CREATE TABLE IF NOT EXISTS "product_styles" (
  "id" serial PRIMARY KEY NOT NULL,
  "product_id" integer NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "color_hex" varchar(7),
  "thumbnail_url" varchar(500),
  "price_cents" integer,
  "order" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- ─── product_sides (philaprints: front/back/sleeve images per style) ─────────
CREATE TABLE IF NOT EXISTS "product_sides" (
  "id" serial PRIMARY KEY NOT NULL,
  "style_id" integer NOT NULL REFERENCES "product_styles"("id") ON DELETE CASCADE,
  "side" varchar(50) NOT NULL,
  "label" varchar(100),
  "image_url" varchar(500) NOT NULL,
  "printable_x" integer DEFAULT 0 NOT NULL,
  "printable_y" integer DEFAULT 0 NOT NULL,
  "printable_width" integer,
  "printable_height" integer,
  "order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- ─── philaprints_design_assets (shared icon/art library per website) ─────────
-- Note: table named to avoid conflict with design_assets above (per-design uploads).
-- If consolidating later, merge these two tables.
CREATE TABLE IF NOT EXISTS "philaprints_design_assets" (
  "id" serial PRIMARY KEY NOT NULL,
  "website_id" integer NOT NULL REFERENCES "client_websites"("id") ON DELETE CASCADE,
  "type" varchar(20) NOT NULL,
  "category" varchar(100),
  "name" varchar(255) NOT NULL,
  "icon_name" varchar(100),
  "icon_pack" varchar(20),
  "image_url" varchar(500),
  "tags" json DEFAULT '[]'::json,
  "order" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- ─── product_designs (philaprints: saved customer designs, int PK + uuid) ────
CREATE TABLE IF NOT EXISTS "product_designs" (
  "id" serial PRIMARY KEY NOT NULL,
  "uuid" varchar(36) NOT NULL UNIQUE,
  "website_id" integer NOT NULL REFERENCES "client_websites"("id") ON DELETE CASCADE,
  "product_id" integer NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "style_id" integer REFERENCES "product_styles"("id") ON DELETE SET NULL,
  "customer_id" integer REFERENCES "store_customers"("id") ON DELETE SET NULL,
  "session_id" varchar(255),
  "name" varchar(255) DEFAULT 'Untitled Design' NOT NULL,
  "description" text,
  "layers" json DEFAULT '[]'::json,
  "style_overrides" json DEFAULT '{}'::json,
  "thumbnail_url" varchar(500),
  "is_public" boolean DEFAULT false NOT NULL,
  "is_template" boolean DEFAULT false NOT NULL,
  "last_accessed_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_designs_uuid_idx" ON "product_designs" ("uuid");
CREATE INDEX IF NOT EXISTS "product_designs_website_customer_idx" ON "product_designs" ("website_id", "customer_id");
CREATE INDEX IF NOT EXISTS "product_designs_website_session_idx" ON "product_designs" ("website_id", "session_id");
