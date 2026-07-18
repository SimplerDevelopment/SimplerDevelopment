// Shared, GLOBAL print-on-demand catalog of blank designable goods, imported
// from the legacy InkSoft "catalog_db" (see scripts/catalog/import-gildan.ts).
//
// Unlike the rest of the store, these tables are TENANT-AGNOSTIC reference
// data — there is intentionally NO websiteId here. They are a shared library
// (conceptually like block_templates): every client website can "opt in" a
// catalog product, which SNAPSHOTS the rows into the per-tenant store
// (store.products + productStyles/productSides + product_variants). The opt-in
// write path is where tenancy applies — these source tables never are.
//
// Provenance back to catalog_db is preserved on every row via:
//   - sourceId  : the catalog_db primary-key id (the stable join key; unique)
//   - inksoftId : the original InkSoft id (may be null)
//
// Hierarchy mirrors the source: product -> style (colorway) -> side (canvas)
//                                              \-> size (orderable SKU)

import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  real,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { clientWebsites } from './sites';
import { products } from './store';

// ─── CATALOG PRODUCTS (the blank good, e.g. "Gildan Softstyle T-Shirt") ──────

export const catalogProducts = pgTable('catalog_products', {
  id: serial('id').primaryKey(),
  sourceId: integer('source_id').notNull(),            // catalog_db.products.id
  inksoftId: integer('inksoft_id'),
  // brands table in catalog_db was empty + brand_id null on every row, so brand
  // is derived by name-match at import time (e.g. 'Gildan').
  brand: varchar('brand', { length: 100 }),
  supplierName: varchar('supplier_name', { length: 255 }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  longDescription: text('long_description'),
  // Decoration capabilities (drives which print methods the designer offers).
  canPrint: boolean('can_print').default(false).notNull(),
  canDigitalPrint: boolean('can_digital_print').default(false).notNull(),
  canScreenPrint: boolean('can_screen_print').default(false).notNull(),
  canEmbroider: boolean('can_embroider').default(false).notNull(),
  active: boolean('active').default(true).notNull(),
  // false when the product has no usable styles-with-sides+sizes (e.g. Gildan
  // 435 has 25 colorways but 0 sides/sizes) — not designable/sellable yet.
  complete: boolean('complete').default(true).notNull(),
  seoTitle: varchar('seo_title', { length: 255 }),
  seoDescription: text('seo_description'),
  seoKeywords: text('seo_keywords'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('catalog_products_source_idx').on(t.sourceId),
  index('catalog_products_brand_idx').on(t.brand),
  index('catalog_products_slug_idx').on(t.slug),
]);

// ─── CATALOG STYLES (colorways: "Black", "Sport Grey", …) ────────────────────

export const catalogStyles = pgTable('catalog_styles', {
  id: serial('id').primaryKey(),
  sourceId: integer('source_id').notNull(),            // catalog_db.styles.id
  inksoftId: integer('inksoft_id'),
  catalogProductId: integer('catalog_product_id')
    .notNull()
    .references(() => catalogProducts.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),    // colorway name
  colorHex1: varchar('color_hex_1', { length: 7 }),    // normalized "#rrggbb"
  colorHex2: varchar('color_hex_2', { length: 7 }),    // for two-tone / heather
  isDefault: boolean('is_default').default(false).notNull(),
  isLightColor: boolean('is_light_color').default(false).notNull(),
  isDarkColor: boolean('is_dark_color').default(false).notNull(),
  isHeathered: boolean('is_heathered').default(false).notNull(),
  unitPriceCents: integer('unit_price_cents'),         // base cost in cents
  // Cleaned source path (no ?decache=… query) — the mapping key used by the
  // photo-ingest phase to locate the file on disk. Replaced by frontImageUrl
  // once images are uploaded to S3.
  sourceImagePathFront: varchar('source_image_path_front', { length: 600 }),
  frontImageUrl: varchar('front_image_url', { length: 500 }), // S3 proxy url (Phase B)
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('catalog_styles_source_idx').on(t.sourceId),
  index('catalog_styles_product_idx').on(t.catalogProductId),
]);

// ─── CATALOG SIDES (the printable canvases: front/back/sleeveleft/sleeveright)─

export const catalogSides = pgTable('catalog_sides', {
  id: serial('id').primaryKey(),
  sourceId: integer('source_id').notNull(),            // catalog_db.sides.id
  inksoftId: integer('inksoft_id'),
  catalogStyleId: integer('catalog_style_id')
    .notNull()
    .references(() => catalogStyles.id, { onDelete: 'cascade' }),
  side: varchar('side', { length: 50 }).notNull(),     // front/back/sleeveleft/sleeveright
  // Cleaned source path (no ?decache=…) — the per-side mockup mapping key.
  sourceImagePath: varchar('source_image_path', { length: 600 }),
  imageUrl: varchar('image_url', { length: 500 }),     // S3 proxy url (Phase B)
  // Canvas pixel dimensions — null in catalog_db; backfilled from the actual
  // image files during photo ingest (Phase B).
  width: integer('width'),
  height: integer('height'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('catalog_sides_source_idx').on(t.sourceId),
  index('catalog_sides_style_idx').on(t.catalogStyleId),
]);

// ─── CATALOG SIZES (orderable SKUs per colorway: S/M/L/XL/…) ─────────────────

export const catalogSizes = pgTable('catalog_sizes', {
  id: serial('id').primaryKey(),
  sourceId: integer('source_id').notNull(),            // catalog_db.sizes.id
  inksoftId: integer('inksoft_id'),
  catalogStyleId: integer('catalog_style_id')
    .notNull()
    .references(() => catalogStyles.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }),              // "S", "M", "2XL"
  longName: varchar('long_name', { length: 255 }),
  unitPriceCents: integer('unit_price_cents'),         // per-size cost in cents
  weight: real('weight'),
  inStock: boolean('in_stock').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('catalog_sizes_source_idx').on(t.sourceId),
  index('catalog_sizes_style_idx').on(t.catalogStyleId),
]);

// ─── CATALOG OPT-INS (which tenant website adopted which catalog product) ────
// The "opt-in" ledger: a store opts a shared catalog product into its own store,
// which SNAPSHOTS it into store.products (+ productStyles/productSides + variants).
// This is the one tenant-scoped table in the catalog domain (has websiteId).
// unique(websiteId, catalogProductId) makes opt-in idempotent.

export const catalogOptins = pgTable('catalog_optins', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id')
    .notNull()
    .references(() => clientWebsites.id, { onDelete: 'cascade' }),
  catalogProductId: integer('catalog_product_id')
    .notNull()
    .references(() => catalogProducts.id, { onDelete: 'cascade' }),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('catalog_optins_site_product_idx').on(t.websiteId, t.catalogProductId),
  index('catalog_optins_website_idx').on(t.websiteId),
]);
