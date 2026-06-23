// Per-product custom designer: stylable variants (color/colorway), printable
// sides with mockup images + printable-area bounds, per-website asset library
// (icons + clip-art), and saved customer designs (layer arrays).
//
// Ported from an upstream product-designer package. See lib/db/schema/store.ts —
// products.designable flips this on for a given product, and
// cartItems/orderItems carry a forward-declared `designId` FK back to
// productDesigns (declared here; see store.ts for the column).

import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  json,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { products } from './store';
import { clientWebsites } from './sites';
// NOTE: storeCustomers is imported as a value, but used here for the FK only.
// Drizzle resolves the reference lazily via the thunk, so there is no
// circular-init hazard at runtime.
import { storeCustomers } from './store';

// ─── PRODUCT STYLES (designable variants) ───────────────────────────────────
// A "style" is a designable variant of a product — e.g. a t-shirt color.
// Each style has its own set of sides (front/back/etc) with mockup images.

export const productStyles = pgTable('product_styles', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(), // "Black", "White", "Heather Grey"
  colorHex: varchar('color_hex', { length: 7 }), // optional swatch color e.g. "#000000"
  thumbnailUrl: varchar('thumbnail_url', { length: 500 }), // small thumb for picker
  priceCents: integer('price_cents'), // optional override; null = use product.price
  order: integer('order').default(0).notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── PRODUCT SIDES (per-style mockup images + printable bounds) ─────────────

export const productSides = pgTable('product_sides', {
  id: serial('id').primaryKey(),
  styleId: integer('style_id').notNull().references(() => productStyles.id, { onDelete: 'cascade' }),
  side: varchar('side', { length: 50 }).notNull(), // "front", "back", "left_sleeve", etc.
  label: varchar('label', { length: 100 }), // display name; default to side at app layer
  imageUrl: varchar('image_url', { length: 500 }).notNull(), // the mockup image
  printableX: integer('printable_x').default(0).notNull(), // printable-area top-left x (image px)
  printableY: integer('printable_y').default(0).notNull(),
  printableWidth: integer('printable_width'), // null = full image
  printableHeight: integer('printable_height'),
  order: integer('order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── DESIGN ASSETS (per-website icon + clip-art library) ────────────────────
// Two flavors keyed off `type`:
//   - 'icon' → react-icons reference (iconName + iconPack)
//   - 'art'  → a hosted SVG/PNG (imageUrl)

export const philaprintsDesignAssets = pgTable('philaprints_design_assets', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 20 }).notNull(), // 'icon' | 'art'
  category: varchar('category', { length: 100 }), // optional grouping (e.g. "Sports", "Holiday")
  name: varchar('name', { length: 255 }).notNull(),
  iconName: varchar('icon_name', { length: 100 }), // for type=icon, e.g. "FaStar"
  iconPack: varchar('icon_pack', { length: 20 }), // for type=icon, e.g. "fa6", "bs"
  imageUrl: varchar('image_url', { length: 500 }), // for type=art, the SVG/PNG URL
  tags: json('tags').$type<string[]>().default([]),
  order: integer('order').default(0).notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── PRODUCT DESIGNS (saved customer designs) ───────────────────────────────
// `layers` holds the canonical layer array (text/image/icon/etc) used by the
// designer canvas. `styleOverrides` lets a saved design pin per-style tweaks
// (e.g. a color the customer adjusted). `uuid` is the public share-link key.

export const productDesigns = pgTable('product_designs', {
  id: serial('id').primaryKey(),
  uuid: varchar('uuid', { length: 36 }).notNull().unique(), // for share links
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  styleId: integer('style_id').references(() => productStyles.id, { onDelete: 'set null' }),
  customerId: integer('customer_id').references(() => storeCustomers.id, { onDelete: 'set null' }),
  sessionId: varchar('session_id', { length: 255 }), // for anonymous customers
  name: varchar('name', { length: 255 }).default('Untitled Design').notNull(),
  description: text('description'),
  layers: json('layers').$type<unknown[]>().default([]),
  styleOverrides: json('style_overrides').$type<Record<string, unknown>>().default({}),
  thumbnailUrl: varchar('thumbnail_url', { length: 500 }),
  isPublic: boolean('is_public').default(false).notNull(),
  isTemplate: boolean('is_template').default(false).notNull(),
  lastAccessedAt: timestamp('last_accessed_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'), // soft-delete
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('product_designs_uuid_idx').on(t.uuid),
  index('product_designs_website_customer_idx').on(t.websiteId, t.customerId),
  index('product_designs_website_session_idx').on(t.websiteId, t.sessionId),
]);
