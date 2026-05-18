-- Product Designer integration — hand-authored migration.
-- See .planning/product-designer-integration.md for the integration spec.
-- Drizzle tracker is out of sync in this repo; do NOT run via drizzle-kit.
-- Apply this manually to Railway Postgres (staging+prod share one DB).
-- Idempotent: uses IF NOT EXISTS / DROP TRIGGER guards so reruns are safe.

-- ─── products.is_designable ────────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_designable boolean NOT NULL DEFAULT false;

-- ─── product_design_surfaces ───────────────────────────────────────────────
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

-- ─── designs ───────────────────────────────────────────────────────────────
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
  created_at         timestamp NOT NULL DEFAULT now(),
  updated_at         timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS designs_website_idx  ON designs (website_id);
CREATE INDEX IF NOT EXISTS designs_customer_idx ON designs (customer_id);
CREATE INDEX IF NOT EXISTS designs_session_idx  ON designs (session_id);
CREATE INDEX IF NOT EXISTS designs_product_idx  ON designs (product_id);

-- ─── design_assets ─────────────────────────────────────────────────────────
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

-- ─── cart_items.design_id ──────────────────────────────────────────────────
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
