-- Wave 1A of the product-designer integration (ported from
-- ~/monorepo/packages/philaprints): per-product custom designer schema.
--
-- Adds four new tables — product_styles, product_sides, design_assets,
-- product_designs — plus three column additions on existing tables
-- (products.designable, cart_items.design_id, order_items.design_id).
--
-- NOTE: hand-written rather than `drizzle-kit generate` output because the
-- repo's drizzle migration tracker is drifted (project memory). Mirrors
-- lib/db/schema/productDesigner.ts and the additions to
-- lib/db/schema/store.ts exactly. Idempotent — safe to re-run against an
-- environment that already has parts of this applied.

-- ─── product_styles ─────────────────────────────────────────────────────────
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

-- ─── product_sides ──────────────────────────────────────────────────────────
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

-- ─── design_assets ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "design_assets" (
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

-- ─── product_designs ────────────────────────────────────────────────────────
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

-- ─── products.designable ────────────────────────────────────────────────────
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "designable" boolean DEFAULT false NOT NULL;

-- ─── cart_items.design_id / order_items.design_id ───────────────────────────
-- Forward references to product_designs; declared in store.ts without a
-- drizzle .references() clause to avoid the circular import with
-- productDesigner.ts. Adding the FK constraint here at the DB layer keeps the
-- data model honest.
ALTER TABLE "cart_items"
  ADD COLUMN IF NOT EXISTS "design_id" integer
    REFERENCES "product_designs"("id") ON DELETE SET NULL;

ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "design_id" integer
    REFERENCES "product_designs"("id") ON DELETE SET NULL;
