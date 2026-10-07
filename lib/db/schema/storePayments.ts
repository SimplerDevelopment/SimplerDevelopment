// Checkout inventory and payment-event ownership live with the store.
import { pgTable, serial, integer, varchar, text, json, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { clients, clientWebsites } from './sites';
import { orders } from './store';
import { giftCertificates } from './tools';

export const storeCheckoutReservations = pgTable('store_checkout_reservations', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  state: varchar('state', { length: 20 }).default('reserved').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  items: json('items').$type<Array<{ productId: number; variantId: number | null; quantity: number }>>().notNull(),
  giftCertificateId: integer('gift_certificate_id').references(() => giftCertificates.id, { onDelete: 'restrict' }),
  giftCertificateAmount: integer('gift_certificate_amount').default(0).notNull(),
  discountCode: varchar('discount_code', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('store_checkout_reservations_order_idx').on(t.orderId),
  index('store_checkout_reservations_due_idx').on(t.state, t.expiresAt),
  index('store_checkout_reservations_client_idx').on(t.clientId, t.websiteId),
]);

export const storePaymentEvents = pgTable('store_payment_events', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  eventId: text('event_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('store_payment_events_site_event_idx').on(t.websiteId, t.eventId)]);
