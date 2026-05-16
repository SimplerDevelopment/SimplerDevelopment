// E-commerce: products, options/variants, inventory, carts, orders, customers, and store messaging.

import { pgTable, serial, varchar, text, timestamp, boolean, integer, json, uniqueIndex, numeric } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { clientWebsites, clients } from './sites';

export const paymentMethods = pgTable('payment_methods', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  stripePaymentMethodId: varchar('stripe_payment_method_id', { length: 255 }).notNull(),
  brand: varchar('brand', { length: 50 }).notNull(), // visa, mastercard, amex, etc.
  last4: varchar('last4', { length: 4 }).notNull(),
  expMonth: integer('exp_month').notNull(),
  expYear: integer('exp_year').notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── GOOGLE WEBSITE INTEGRATIONS ─────────────────────────────────────────────

// Per-website Google OAuth tokens for Search Console + Analytics

export const storeSettings = pgTable('store_settings', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }).unique(),
  enabled: boolean('enabled').default(false).notNull(),
  storeName: varchar('store_name', { length: 255 }),
  currency: varchar('currency', { length: 3 }).default('USD').notNull(),
  taxRate: numeric('tax_rate', { precision: 5, scale: 4 }).default('0'), // e.g. 0.0825 = 8.25%
  taxInclusive: boolean('tax_inclusive').default(false).notNull(),
  // Stripe Connect for payouts to the website owner
  stripeAccountId: varchar('stripe_account_id', { length: 255 }),
  stripeOnboardingComplete: boolean('stripe_onboarding_complete').default(false).notNull(),
  payoutSchedule: varchar('payout_schedule', { length: 20 }).default('weekly'), // daily, weekly, monthly
  platformFeePercent: numeric('platform_fee_percent', { precision: 5, scale: 2 }).default('5.00'), // agency platform fee %
  // General settings
  requiresShipping: boolean('requires_shipping').default(true).notNull(),
  lowStockThreshold: integer('low_stock_threshold').default(5).notNull(),
  orderPrefix: varchar('order_prefix', { length: 10 }).default('ORD'),
  enableReviews: boolean('enable_reviews').default(true).notNull(),
  // Customer portal settings
  enableCustomerAccounts: boolean('enable_customer_accounts').default(true).notNull(),
  enableGuestCheckout: boolean('enable_guest_checkout').default(true).notNull(),
  enableWishlist: boolean('enable_wishlist').default(true).notNull(),
  enableOrderTracking: boolean('enable_order_tracking').default(true).notNull(),
  enableCustomerSupport: boolean('enable_customer_support').default(true).notNull(),
  customerPortalWelcomeMessage: text('customer_portal_welcome_message'),
  supportEmail: varchar('support_email', { length: 255 }),
  returnPolicyUrl: varchar('return_policy_url', { length: 500 }),
  shippingPolicyUrl: varchar('shipping_policy_url', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Product categories (separate from CMS post categories)

export const productCategories = pgTable('product_categories', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  description: text('description'),
  image: varchar('image', { length: 500 }),
  parentId: integer('parent_id'), // self-referencing for sub-categories
  order: integer('order').default(0).notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('product_categories_slug_website_idx').on(t.slug, t.websiteId),
]);

// Main products table

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  categoryId: integer('category_id').references(() => productCategories.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  description: text('description'),
  shortDescription: varchar('short_description', { length: 500 }),
  price: integer('price').notNull(), // in cents
  compareAtPrice: integer('compare_at_price'),
  costPrice: integer('cost_price'),
  sku: varchar('sku', { length: 100 }),
  barcode: varchar('barcode', { length: 100 }),
  trackInventory: boolean('track_inventory').default(true).notNull(),
  quantity: integer('quantity').default(0).notNull(),
  weight: numeric('weight', { precision: 10, scale: 2 }),
  weightUnit: varchar('weight_unit', { length: 5 }).default('g'),
  status: varchar('status', { length: 20 }).default('draft').notNull(), // draft, active, archived
  featured: boolean('featured').default(false).notNull(),
  seoTitle: varchar('seo_title', { length: 255 }),
  seoDescription: text('seo_description'),
  tags: json('tags').$type<string[]>().default([]),
  metadata: json('metadata').$type<Record<string, string>>(),
  // When true, this product is opened in the custom designer (see
  // lib/db/schema/productDesigner.ts). Storefront/admin checks this to flip
  // the "Design it" CTA on and gate productStyles/productSides reads.
  designable: boolean('designable').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('products_slug_website_idx').on(t.slug, t.websiteId),
]);

export const productImages = pgTable('product_images', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  url: varchar('url', { length: 500 }).notNull(),
  alt: varchar('alt', { length: 255 }),
  order: integer('order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const productOptions = pgTable('product_options', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  order: integer('order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const productOptionValues = pgTable('product_option_values', {
  id: serial('id').primaryKey(),
  optionId: integer('option_id').notNull().references(() => productOptions.id, { onDelete: 'cascade' }),
  value: varchar('value', { length: 100 }).notNull(),
  label: varchar('label', { length: 100 }),
  order: integer('order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const productVariants = pgTable('product_variants', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  sku: varchar('sku', { length: 100 }),
  barcode: varchar('barcode', { length: 100 }),
  price: integer('price').notNull(),
  compareAtPrice: integer('compare_at_price'),
  costPrice: integer('cost_price'),
  quantity: integer('quantity').default(0).notNull(),
  weight: numeric('weight', { precision: 10, scale: 2 }),
  image: varchar('image', { length: 500 }),
  optionValues: json('option_values').$type<{ optionId: number; valueId: number }[]>().default([]),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const bulkPricingRules = pgTable('bulk_pricing_rules', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  variantId: integer('variant_id').references(() => productVariants.id, { onDelete: 'cascade' }),
  minQuantity: integer('min_quantity').notNull(),
  maxQuantity: integer('max_quantity'),
  priceType: varchar('price_type', { length: 20 }).default('fixed').notNull(), // fixed, percent_off
  amount: integer('amount').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const shippingZones = pgTable('shipping_zones', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  countries: json('countries').$type<string[]>().default([]),
  states: json('states').$type<string[]>().default([]),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const shippingRates = pgTable('shipping_rates', {
  id: serial('id').primaryKey(),
  zoneId: integer('zone_id').notNull().references(() => shippingZones.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  rateType: varchar('rate_type', { length: 20 }).default('flat').notNull(), // flat, weight_based, price_based, free
  price: integer('price').default(0).notNull(),
  weightTiers: json('weight_tiers').$type<{ minWeight: number; maxWeight: number; price: number }[]>(),
  freeAbove: integer('free_above'),
  minDeliveryDays: integer('min_delivery_days'),
  maxDeliveryDays: integer('max_delivery_days'),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const carts = pgTable('carts', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  customerId: integer('customer_id'), // FK added at runtime to avoid circular ref with storeCustomers
  sessionId: varchar('session_id', { length: 255 }),
  customerEmail: varchar('customer_email', { length: 255 }),
  status: varchar('status', { length: 20 }).default('active').notNull(),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const cartItems = pgTable('cart_items', {
  id: serial('id').primaryKey(),
  cartId: integer('cart_id').notNull().references(() => carts.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  variantId: integer('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
  // FK to product_designs added at runtime to avoid circular ref with the
  // designer schema (see lib/db/schema/productDesigner.ts). Mirrors the
  // `carts.customerId` forward-ref pattern just above.
  designId: integer('design_id'),
  quantity: integer('quantity').default(1).notNull(),
  unitPrice: integer('unit_price').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  customerId: integer('customer_id'), // FK to store_customers — links order to a customer account (null for guest checkout)
  orderNumber: varchar('order_number', { length: 50 }).notNull(),
  customerEmail: varchar('customer_email', { length: 255 }).notNull(),
  customerName: varchar('customer_name', { length: 255 }).notNull(),
  customerPhone: varchar('customer_phone', { length: 50 }),
  shippingAddress: json('shipping_address').$type<{
    line1: string; line2?: string; city: string; state: string; postalCode: string; country: string;
  }>(),
  billingAddress: json('billing_address').$type<{
    line1: string; line2?: string; city: string; state: string; postalCode: string; country: string;
  }>(),
  subtotal: integer('subtotal').notNull(),
  shippingTotal: integer('shipping_total').default(0).notNull(),
  taxTotal: integer('tax_total').default(0).notNull(),
  discountTotal: integer('discount_total').default(0).notNull(),
  total: integer('total').notNull(),
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),
  stripeChargeId: varchar('stripe_charge_id', { length: 255 }),
  paymentStatus: varchar('payment_status', { length: 20 }).default('pending').notNull(),
  paidAt: timestamp('paid_at'),
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  shippingMethod: varchar('shipping_method', { length: 255 }),
  trackingNumber: varchar('tracking_number', { length: 255 }),
  trackingUrl: varchar('tracking_url', { length: 500 }),
  shippedAt: timestamp('shipped_at'),
  deliveredAt: timestamp('delivered_at'),
  customerNote: text('customer_note'),
  internalNote: text('internal_note'),
  platformFee: integer('platform_fee'),
  transferId: varchar('transfer_id', { length: 255 }),
  discountCode: varchar('discount_code', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productId: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
  variantId: integer('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
  // FK to product_designs added at runtime to avoid circular ref with the
  // designer schema (see lib/db/schema/productDesigner.ts).
  designId: integer('design_id'),
  productName: varchar('product_name', { length: 255 }).notNull(),
  variantName: varchar('variant_name', { length: 255 }),
  sku: varchar('sku', { length: 100 }),
  unitPrice: integer('unit_price').notNull(),
  quantity: integer('quantity').notNull(),
  total: integer('total').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const orderStatusHistory = pgTable('order_status_history', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull(),
  note: text('note'),
  changedBy: integer('changed_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const discountCodes = pgTable('discount_codes', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 50 }).notNull(),
  description: varchar('description', { length: 255 }),
  discountType: varchar('discount_type', { length: 20 }).notNull(), // percent, fixed_amount, free_shipping
  amount: integer('amount').notNull(),
  minOrderAmount: integer('min_order_amount'),
  maxUses: integer('max_uses'),
  usedCount: integer('used_count').default(0).notNull(),
  startsAt: timestamp('starts_at'),
  expiresAt: timestamp('expires_at'),
  applicableTo: varchar('applicable_to', { length: 10 }).default('both').notNull(), // store, booking, both
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('discount_codes_code_website_idx').on(t.code, t.websiteId),
]);

// ─── CUSTOMER PORTAL ────────────────────────────────────────────────────────

export const storeCustomers = pgTable('store_customers', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  phone: varchar('phone', { length: 50 }),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  // Default addresses (JSON: { line1, line2, city, state, postalCode, country })
  defaultShippingAddress: json('default_shipping_address').$type<{
    line1: string; line2?: string; city: string; state: string; postalCode: string; country: string;
  }>(),
  defaultBillingAddress: json('default_billing_address').$type<{
    line1: string; line2?: string; city: string; state: string; postalCode: string; country: string;
  }>(),
  // Saved address book (array of named addresses)
  addressBook: json('address_book').$type<Array<{
    id: string; label: string; line1: string; line2?: string; city: string; state: string; postalCode: string; country: string; isDefault?: boolean;
  }>>().default([]),
  emailVerified: boolean('email_verified').default(false).notNull(),
  emailVerifyToken: varchar('email_verify_token', { length: 100 }),
  passwordResetToken: varchar('password_reset_token', { length: 100 }),
  passwordResetExpires: timestamp('password_reset_expires'),
  lastLoginAt: timestamp('last_login_at'),
  status: varchar('status', { length: 20 }).default('active').notNull(), // active, disabled
  orderCount: integer('order_count').default(0).notNull(),
  totalSpent: integer('total_spent').default(0).notNull(), // in cents
  notes: text('notes'), // internal notes for store owner
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('store_customers_email_website_idx').on(t.email, t.websiteId),
]);

export const storeCustomerSessions = pgTable('store_customer_sessions', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').notNull().references(() => storeCustomers.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const storeWishlists = pgTable('store_wishlists', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').notNull().references(() => storeCustomers.id, { onDelete: 'cascade' }),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).default('My Wishlist').notNull(),
  isDefault: boolean('is_default').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const storeWishlistItems = pgTable('store_wishlist_items', {
  id: serial('id').primaryKey(),
  wishlistId: integer('wishlist_id').notNull().references(() => storeWishlists.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  variantId: integer('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
  addedAt: timestamp('added_at').defaultNow().notNull(),
});

export const storeCustomerMessages = pgTable('store_customer_messages', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  customerId: integer('customer_id').notNull().references(() => storeCustomers.id, { onDelete: 'cascade' }),
  orderId: integer('order_id').references(() => orders.id, { onDelete: 'set null' }),
  subject: varchar('subject', { length: 255 }).notNull(),
  category: varchar('category', { length: 50 }).default('general').notNull(), // general, order, shipping, return, product
  status: varchar('status', { length: 20 }).default('open').notNull(), // open, replied, resolved, closed
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const storeCustomerMessageReplies = pgTable('store_customer_message_replies', {
  id: serial('id').primaryKey(),
  messageId: integer('message_id').notNull().references(() => storeCustomerMessages.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  isStaff: boolean('is_staff').default(false).notNull(), // true = store owner reply, false = customer
  authorName: varchar('author_name', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const storeProductReviews = pgTable('store_product_reviews', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  customerId: integer('customer_id').references(() => storeCustomers.id, { onDelete: 'set null' }),
  orderId: integer('order_id').references(() => orders.id, { onDelete: 'set null' }),
  rating: integer('rating').notNull(), // 1-5
  title: varchar('title', { length: 255 }),
  body: text('body'),
  status: varchar('status', { length: 20 }).default('pending').notNull(), // pending, approved, rejected
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── NAVIGATION & BRANDING ──────────────────────────────────────────────────

