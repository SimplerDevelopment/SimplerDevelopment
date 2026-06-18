-- Shared global POD catalog tables (mirror of lib/db/schema/catalog.ts).
--
-- Applied directly via psql because `drizzle-kit generate` is currently blocked
-- by a pre-existing drizzle/meta snapshot collision (0004/0070/0072). When the
-- meta chain is repaired, regenerate the canonical migration; these CREATE TABLE
-- statements match what drizzle would emit. Idempotent (IF NOT EXISTS).
--
--   psql -d "$DATABASE_URL_DB" -f scripts/catalog/001_catalog_schema.sql

CREATE TABLE IF NOT EXISTS catalog_products (
  id                serial PRIMARY KEY,
  source_id         integer NOT NULL,
  inksoft_id        integer,
  brand             varchar(100),
  supplier_name     varchar(255),
  name              varchar(255) NOT NULL,
  slug              varchar(255) NOT NULL,
  long_description  text,
  can_print         boolean DEFAULT false NOT NULL,
  can_digital_print boolean DEFAULT false NOT NULL,
  can_screen_print  boolean DEFAULT false NOT NULL,
  can_embroider     boolean DEFAULT false NOT NULL,
  active            boolean DEFAULT true NOT NULL,
  complete          boolean DEFAULT true NOT NULL,
  seo_title         varchar(255),
  seo_description   text,
  seo_keywords      text,
  created_at        timestamp DEFAULT now() NOT NULL,
  updated_at        timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_products_source_idx ON catalog_products (source_id);
CREATE INDEX IF NOT EXISTS catalog_products_brand_idx ON catalog_products (brand);
CREATE INDEX IF NOT EXISTS catalog_products_slug_idx ON catalog_products (slug);

CREATE TABLE IF NOT EXISTS catalog_styles (
  id                       serial PRIMARY KEY,
  source_id                integer NOT NULL,
  inksoft_id               integer,
  catalog_product_id       integer NOT NULL REFERENCES catalog_products (id) ON DELETE CASCADE,
  name                     varchar(255) NOT NULL,
  color_hex_1              varchar(7),
  color_hex_2              varchar(7),
  is_default               boolean DEFAULT false NOT NULL,
  is_light_color           boolean DEFAULT false NOT NULL,
  is_dark_color            boolean DEFAULT false NOT NULL,
  is_heathered             boolean DEFAULT false NOT NULL,
  unit_price_cents         integer,
  source_image_path_front  varchar(600),
  front_image_url          varchar(500),
  created_at               timestamp DEFAULT now() NOT NULL,
  updated_at               timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_styles_source_idx ON catalog_styles (source_id);
CREATE INDEX IF NOT EXISTS catalog_styles_product_idx ON catalog_styles (catalog_product_id);

CREATE TABLE IF NOT EXISTS catalog_sides (
  id                 serial PRIMARY KEY,
  source_id          integer NOT NULL,
  inksoft_id         integer,
  catalog_style_id   integer NOT NULL REFERENCES catalog_styles (id) ON DELETE CASCADE,
  side               varchar(50) NOT NULL,
  source_image_path  varchar(600),
  image_url          varchar(500),
  width              integer,
  height             integer,
  created_at         timestamp DEFAULT now() NOT NULL,
  updated_at         timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_sides_source_idx ON catalog_sides (source_id);
CREATE INDEX IF NOT EXISTS catalog_sides_style_idx ON catalog_sides (catalog_style_id);

CREATE TABLE IF NOT EXISTS catalog_sizes (
  id                serial PRIMARY KEY,
  source_id         integer NOT NULL,
  inksoft_id        integer,
  catalog_style_id  integer NOT NULL REFERENCES catalog_styles (id) ON DELETE CASCADE,
  name              varchar(100),
  long_name         varchar(255),
  unit_price_cents  integer,
  weight            real,
  in_stock          boolean DEFAULT true NOT NULL,
  created_at        timestamp DEFAULT now() NOT NULL,
  updated_at        timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_sizes_source_idx ON catalog_sizes (source_id);
CREATE INDEX IF NOT EXISTS catalog_sizes_style_idx ON catalog_sizes (catalog_style_id);

CREATE TABLE IF NOT EXISTS catalog_optins (
  id                 serial PRIMARY KEY,
  website_id         integer NOT NULL REFERENCES client_websites (id) ON DELETE CASCADE,
  catalog_product_id integer NOT NULL REFERENCES catalog_products (id) ON DELETE CASCADE,
  product_id         integer NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  created_at         timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_optins_site_product_idx ON catalog_optins (website_id, catalog_product_id);
CREATE INDEX IF NOT EXISTS catalog_optins_website_idx ON catalog_optins (website_id);
