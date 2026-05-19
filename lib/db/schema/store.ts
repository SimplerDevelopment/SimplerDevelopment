// E-commerce: products, options/variants, inventory, carts, orders, customers, and store messaging.

import { pgTable, serial, varchar, text, timestamp, boolean, integer, json, jsonb, uniqueIndex, index, numeric, uuid } from 'drizzle-orm/pg-core';
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
  // ─── Shipping provider (manual vs. EasyPost-backed live rates + labels) ───
  shippingProvider: varchar('shipping_provider', { length: 20 }).default('manual').notNull(), // 'manual' | 'easypost'
  easypostApiKeyEncrypted: text('easypost_api_key_encrypted'), // ciphertext from lib/crypto/api-key.ts
  easypostMode: varchar('easypost_mode', { length: 10 }).default('test'), // 'test' | 'production'
  easypostWebhookSecret: varchar('easypost_webhook_secret', { length: 255 }), // HMAC secret from EasyPost
  shipFromAddress: jsonb('ship_from_address').$type<{
    name?: string; company?: string; line1: string; line2?: string; city: string; state: string; postalCode: string; country: string; phone?: string;
  }>(),
  defaultParcelLengthIn: numeric('default_parcel_length_in', { precision: 8, scale: 2 }),
  defaultParcelWidthIn: numeric('default_parcel_width_in', { precision: 8, scale: 2 }),
  defaultParcelHeightIn: numeric('default_parcel_height_in', { precision: 8, scale: 2 }),
  defaultParcelWeightOz: numeric('default_parcel_weight_oz', { precision: 8, scale: 2 }),
  liveRatesFallback: boolean('live_rates_fallback').default(true).notNull(),
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
  lengthIn: numeric('length_in', { precision: 8, scale: 2 }),
  widthIn: numeric('width_in', { precision: 8, scale: 2 }),
  heightIn: numeric('height_in', { precision: 8, scale: 2 }),
  status: varchar('status', { length: 20 }).default('draft').notNull(), // draft, active, archived
  featured: boolean('featured').default(false).notNull(),
  isDesignable: boolean('is_designable').default(false).notNull(),
  seoTitle: varchar('seo_title', { length: 255 }),
  seoDescription: text('seo_description'),
  tags: json('tags').$type<string[]>().default([]),
  metadata: json('metadata').$type<Record<string, string>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('products_slug_website_idx').on(t.slug, t.websiteId),
]);

// Per-product design surface configuration — front/back/sleeve/etc.
// Each surface has its own mockup image and print-area bounds.
export const productDesignSurfaces = pgTable('product_design_surfaces', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 80 }).notNull(),                  // "Front", "Back", "Left Sleeve"
  slug: varchar('slug', { length: 80 }).notNull(),                  // "front", "back", "left-sleeve"
  displayOrder: integer('display_order').default(0).notNull(),
  mockupImage: varchar('mockup_image', { length: 500 }).notNull(),  // S3 url to base product image
  canvasWidth: integer('canvas_width').default(800).notNull(),
  canvasHeight: integer('canvas_height').default(600).notNull(),
  // Print area in px relative to mockup image (the region a customer can place art into)
  printAreaX: integer('print_area_x').default(100).notNull(),
  printAreaY: integer('print_area_y').default(100).notNull(),
  printAreaWidth: integer('print_area_width').default(600).notNull(),
  printAreaHeight: integer('print_area_height').default(400).notNull(),
  printDpi: integer('print_dpi').default(300).notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('product_design_surfaces_product_slug_idx').on(t.productId, t.slug),
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
  lengthIn: numeric('length_in', { precision: 8, scale: 2 }),
  widthIn: numeric('width_in', { precision: 8, scale: 2 }),
  heightIn: numeric('height_in', { precision: 8, scale: 2 }),
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
  // Provider-aware columns — let a single zone mix manual fixed rates and EasyPost live-rate service filters.
  provider: varchar('provider', { length: 20 }).default('manual').notNull(), // 'manual' | 'easypost'
  carrierCode: varchar('carrier_code', { length: 30 }), // EasyPost carrier account code: 'USPS','UPSDAP','FedExDefault','DHLExpress'
  serviceCode: varchar('service_code', { length: 60 }), // EasyPost service code: 'Priority','Ground','Express'
  liveRateOnly: boolean('live_rate_only').default(false).notNull(), // true => row is a service filter, not a fixed rate
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
  designId: uuid('design_id'), // FK added at runtime to avoid circular ref with designs table below
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
  // ─── EasyPost label + tracking (nullable; populated when shippingProvider='easypost') ───
  carrier: varchar('carrier', { length: 50 }),
  easypostShipmentId: varchar('easypost_shipment_id', { length: 255 }),
  labelUrl: varchar('label_url', { length: 500 }),
  labelCostCents: integer('label_cost_cents'),
  labelPurchasedAt: timestamp('label_purchased_at'),
  latestTrackingStatus: varchar('latest_tracking_status', { length: 50 }), // pre_transit|in_transit|out_for_delivery|delivered|return_to_sender|failure|cancelled|error|unknown
  latestTrackingEventAt: timestamp('latest_tracking_event_at'),
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
  designId: uuid('design_id'), // FK added at runtime to designs.id
  // Frozen snapshot of layersBySurface + canvasSize at checkout, so deleting the design doesn't break fulfillment
  designSnapshot: jsonb('design_snapshot'),
  printReadyUrl: varchar('print_ready_url', { length: 500 }), // hi-res render, populated by Stripe webhook
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

// ─── PRODUCT DESIGNER ───────────────────────────────────────────────────────

// Saved customer designs — one per "customize this product" session.
// Owned by either a logged-in storeCustomer (customerId) or a guest session (sessionId).
export const designs = pgTable('designs', {
  id: uuid('id').primaryKey().defaultRandom(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  customerId: integer('customer_id'),                  // FK to storeCustomers, nullable for guests
  sessionId: varchar('session_id', { length: 255 }),   // storefront guest session, nullable for logged-in
  name: varchar('name', { length: 255 }).notNull().default('Untitled design'),
  // layersBySurface is keyed by productDesignSurfaces.slug:
  //   { "front": LayerData[], "back": LayerData[], ... }
  // LayerData mirrors the productDesigner LayerData type (id, type, name, transform, data, zIndex)
  layersBySurface: jsonb('layers_by_surface').$type<Record<string, unknown[]>>().default({}).notNull(),
  canvasSize: jsonb('canvas_size').$type<{ width: number; height: number; dpi: number }>().default({ width: 800, height: 600, dpi: 72 }).notNull(),
  thumbnailUrl: varchar('thumbnail_url', { length: 500 }),
  renderedUrl: varchar('rendered_url', { length: 500 }),       // hi-res composite, populated by webhook
  status: varchar('status', { length: 20 }).default('draft').notNull(), // draft, finalized, rendered
  /** When true this row is a site-wide reusable template, not a customer design. */
  isTemplate: boolean('is_template').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('designs_website_idx').on(t.websiteId),
  index('designs_customer_idx').on(t.customerId),
  index('designs_session_idx').on(t.sessionId),
  index('designs_product_idx').on(t.productId),
  index('designs_template_idx').on(t.isTemplate),
]);

// User-uploaded image assets used inside a design (separate from the rendered output).
// Tracked so we can clean up S3 when a design is deleted.
export const designAssets = pgTable('design_assets', {
  id: serial('id').primaryKey(),
  designId: uuid('design_id').notNull().references(() => designs.id, { onDelete: 'cascade' }),
  url: varchar('url', { length: 500 }).notNull(),
  storedFilename: varchar('stored_filename', { length: 255 }),
  originalFilename: varchar('original_filename', { length: 255 }),
  mimeType: varchar('mime_type', { length: 80 }),
  width: integer('width'),
  height: integer('height'),
  fileSize: integer('file_size'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── EASYPOST WEBHOOK INGESTION ─────────────────────────────────────────────

// Raw EasyPost webhook events captured for idempotency + audit. eventId is the
// EasyPost-issued event.id; duplicate deliveries hit the unique index and are no-op'd.
export const easypostEvents = pgTable('easypost_events', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').references(() => clientWebsites.id, { onDelete: 'cascade' }),
  eventId: varchar('event_id', { length: 255 }).notNull(),  // EasyPost event.id, for idempotency
  eventType: varchar('event_type', { length: 100 }).notNull(),  // tracker.created, tracker.updated, etc.
  shipmentId: varchar('shipment_id', { length: 255 }),
  trackerId: varchar('tracker_id', { length: 255 }),
  orderId: integer('order_id').references(() => orders.id, { onDelete: 'set null' }),
  payload: jsonb('payload').notNull(),
  processedAt: timestamp('processed_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('easypost_events_event_id_idx').on(t.eventId),
  index('easypost_events_order_id_idx').on(t.orderId),
]);

// ─── NAVIGATION & BRANDING ──────────────────────────────────────────────────

