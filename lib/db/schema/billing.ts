// Billing artifacts: AI credit ledger, usage metering, invoices, AI conversations.

import { pgTable, serial, varchar, text, timestamp, boolean, integer, json } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { clients, services } from './sites';
import { projects } from './pm';

export const aiCreditLedger = pgTable('ai_credit_ledger', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 20 }).notNull(), // grant, usage, purchase, refund, expiry
  amount: integer('amount').notNull(), // positive for grants/purchases, negative for usage
  balanceAfter: integer('balance_after').notNull(),
  description: text('description'),
  serviceCategory: varchar('service_category', { length: 50 }), // which service triggered this
  referenceId: varchar('reference_id', { length: 255 }), // conversation ID, deck ID, stripe payment ID
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const aiCreditBalances = pgTable('ai_credit_balances', {
  clientId: integer('client_id').primaryKey().references(() => clients.id, { onDelete: 'cascade' }),
  balance: integer('balance').default(0).notNull(),
  monthlyGrant: integer('monthly_grant').default(0).notNull(), // total monthly tokens from all subscriptions
  payAsYouGo: boolean('pay_as_you_go').default(false).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const aiCreditPackages = pgTable('ai_credit_packages', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  tokens: integer('tokens').notNull(),
  price: integer('price').notNull(), // cents
  stripePriceId: varchar('stripe_price_id', { length: 255 }),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Usage Metering ────────────────────────────────────────────────────────────

export const usageMeters = pgTable('usage_meters', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  category: varchar('category', { length: 50 }).notNull(), // email_sends, hosting_storage, hosting_bandwidth
  period: varchar('period', { length: 7 }).notNull(), // YYYY-MM
  usage: integer('usage').default(0).notNull(),
  included: integer('included').default(0).notNull(), // free tier limit for this period
  overageRate: integer('overage_rate').default(0).notNull(), // cents per unit above included
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const invoices = pgTable('invoices', {
  id: serial('id').primaryKey(),
  number: varchar('number', { length: 50 }).notNull().unique(), // INV-2026-001
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 50 }).default('draft').notNull(), // draft, sent, paid, overdue, cancelled
  dueDate: timestamp('due_date'),
  paidAt: timestamp('paid_at'),
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),
  stripeCheckoutSessionId: varchar('stripe_checkout_session_id', { length: 255 }),
  subtotal: integer('subtotal').notNull(), // in cents
  tax: integer('tax').default(0).notNull(),
  total: integer('total').notNull(),
  notes: text('notes'),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const invoiceItems = pgTable('invoice_items', {
  id: serial('id').primaryKey(),
  invoiceId: integer('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  description: varchar('description', { length: 255 }).notNull(),
  quantity: integer('quantity').default(1).notNull(),
  unitPrice: integer('unit_price').notNull(), // in cents
  total: integer('total').notNull(), // in cents
  serviceId: integer('service_id').references(() => services.id, { onDelete: 'set null' }),
});

export const aiConversations = pgTable('ai_conversations', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).default('New Conversation').notNull(),
  flagged: boolean('flagged').default(false).notNull(),
  totalInputTokens: integer('total_input_tokens').default(0).notNull(),
  totalOutputTokens: integer('total_output_tokens').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const aiMessages = pgTable('ai_messages', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id').notNull().references(() => aiConversations.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull(), // user, assistant
  content: text('content').notNull(),
  toolCalls: json('tool_calls').$type<{ name: string; input: Record<string, unknown>; result: unknown }[]>(),
  injectedBy: integer('injected_by').references(() => users.id, { onDelete: 'set null' }),
  inputTokens: integer('input_tokens').default(0).notNull(),
  outputTokens: integer('output_tokens').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── EMAIL MARKETING ──────────────────────────────────────────────────────────

