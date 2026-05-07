// Billing artifacts: AI credit ledger, usage metering, invoices, AI conversations.

import { pgTable, serial, varchar, text, timestamp, boolean, integer, json, numeric, index, uniqueIndex } from 'drizzle-orm/pg-core';
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

// ── BYOK (Bring Your Own Key) ─────────────────────────────────────────────────
//
// Foundation for the pricing pivot away from managed AI credits. A client
// connects their own Anthropic / OpenAI key and we proxy through it instead of
// metering tokens against an internal ledger. The `encryptedKey` column holds
// AES-256-GCM ciphertext produced by lib/crypto/api-key.ts (NOT the raw key).
// `lastUsedAt` is bumped opportunistically by call sites — it is NOT a strict
// audit log; for that, see future BYOK call-site telemetry.
//
// Multi-tenant: every row is keyed by `clientId`. Cascading delete keeps key
// rows from outliving their tenant. A single client may store multiple keys
// per provider (e.g. one for prod and one for staging) — `label` is the human
// disambiguator.

export const clientApiKeys = pgTable('client_api_keys', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 32 }).notNull(), // 'anthropic' | 'openai'
  encryptedKey: text('encrypted_key').notNull(), // AES-256-GCM blob — NEVER the raw key
  label: varchar('label', { length: 100 }), // human disambiguator: "prod", "staging", etc.
  lastUsedAt: timestamp('last_used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('client_api_keys_client_id_idx').on(table.clientId),
  index('client_api_keys_provider_idx').on(table.clientId, table.provider),
]);

// ── Usage Meter Events ────────────────────────────────────────────────────────
//
// Event-shaped sibling to the older aggregated `usage_meters` table (which
// stores running totals + included/overage rates against a hand-coded
// category vocabulary in lib/usage-metering.ts).
//
// `usage_meter_events` is intentionally a different shape and was added as
// part of the pricing-tier / BYOK foundation: rows here are append-only
// observations from external sources (Resend, Vercel, Railway) bucketed by
// YYYY-MM period. The cron sync workers upsert one row per (clientId,
// period, resource) so totals can be rebuilt by SUM(amount). Numeric column
// instead of integer so fractional GB / token counts survive without
// scaling tricks.

export const usageMeterEvents = pgTable('usage_meter_events', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  resource: varchar('resource', { length: 50 }).notNull(), // 'email_send' | 'hosting_bandwidth_gb' | 'hosting_invocations' | 'ai_tokens'
  period: varchar('period', { length: 7 }).notNull(), // YYYY-MM
  amount: numeric('amount', { precision: 18, scale: 4 }).default('0').notNull(),
  source: varchar('source', { length: 32 }).notNull(), // 'resend' | 'vercel' | 'railway' | 'manual'
  recordedAt: timestamp('recorded_at').defaultNow().notNull(),
}, (table) => [
  index('usage_meter_events_client_period_resource_idx').on(table.clientId, table.period, table.resource),
]);

// ── Metered Stripe Billing ────────────────────────────────────────────────────
//
// Stripe pass-through resale of usage-based costs (Vercel hosting + Resend
// email). The agency tier is a flat monthly Stripe Subscription; on top of
// that we attach metered Subscription Items keyed by `resource`. Each row
// here corresponds to ONE Stripe Subscription Item — the bridge between an
// internal resource counter (rolled up from `usage_meter_events`) and the
// Stripe item we report `usage_records` against.
//
// `includedQuantity` is the per-period free allowance (e.g. first 50GB of
// hosting bandwidth bundled with the tier). The rollup worker subtracts it
// before pushing usage. `unitPriceCents` is captured at config time as a
// hint / audit; the actual price lives on the Stripe Price the
// Subscription Item points at.

export const meteredSubscriptionItems = pgTable('metered_subscription_items', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }).notNull(),
  stripeSubscriptionItemId: varchar('stripe_subscription_item_id', { length: 255 }).notNull(),
  resource: varchar('resource', { length: 50 }).notNull(), // 'hosting_bandwidth_gb' | 'email_send' | 'hosting_invocations' | ...
  unitPriceCents: integer('unit_price_cents').notNull(),
  includedQuantity: numeric('included_quantity', { precision: 18, scale: 4 }).default('0').notNull(),
  status: varchar('status', { length: 20 }).default('active').notNull(), // 'active' | 'paused' | 'cancelled'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('metered_subscription_items_client_status_resource_idx').on(table.clientId, table.status, table.resource),
]);

// Per-period audit row: one entry per (clientId, period, resource) capturing
// the rollup result. `stripeUsageRecordId` is null when the Stripe push
// failed — re-running the rollup will retry. The unique index lets us
// upsert idempotently without double-pushing usage on re-run.

export const usageBillingPeriods = pgTable('usage_billing_periods', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  period: varchar('period', { length: 7 }).notNull(), // YYYY-MM
  resource: varchar('resource', { length: 50 }).notNull(),
  totalQuantity: numeric('total_quantity', { precision: 18, scale: 4 }).default('0').notNull(),
  includedQuantity: numeric('included_quantity', { precision: 18, scale: 4 }).default('0').notNull(),
  billableQuantity: numeric('billable_quantity', { precision: 18, scale: 4 }).default('0').notNull(),
  unitPriceCents: integer('unit_price_cents').default(0).notNull(),
  billedAmountCents: integer('billed_amount_cents').default(0).notNull(),
  stripeUsageRecordId: varchar('stripe_usage_record_id', { length: 255 }),
  reportedAt: timestamp('reported_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('usage_billing_periods_client_period_resource_unique').on(table.clientId, table.period, table.resource),
]);

// ─── EMAIL MARKETING ──────────────────────────────────────────────────────────

