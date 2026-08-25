// Omnichannel: channel connections, contact identities, merge suggestions,
// per-channel consent, and the outbound message outbox.
//
// Tenancy: every row is keyed by `clientId`. Credentials live in
// `encryptedCredentials` (AES-256-GCM via the `encryptedText` column type) and
// must never be selected for a client response — strip the field server-side.

import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  json,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { encryptedText } from './columns';
import { users } from './auth';
import { clients } from './sites';
import { crmContacts } from './crm';

export const CHANNEL_PROVIDERS = ['whatsapp', 'instagram', 'messenger', 'webchat', 'email'] as const;
export type ChannelProvider = (typeof CHANNEL_PROVIDERS)[number];

export const CHANNEL_CONNECTION_STATUSES = [
  'connected',
  'disconnected',
  'error',
  'token_expired',
  'incomplete',
] as const;
export type ChannelConnectionStatus = (typeof CHANNEL_CONNECTION_STATUSES)[number];

export const CONTACT_IDENTITY_KINDS = [
  'phone',
  'email',
  'whatsapp',
  'instagram',
  'facebook',
  'webchat',
] as const;
export type ContactIdentityKind = (typeof CONTACT_IDENTITY_KINDS)[number];

export const CHANNEL_OUTBOX_STATUSES = [
  'queued',
  'processing',
  'sent',
  'delivered',
  'read',
  'retrying',
  'failed',
] as const;
export type ChannelOutboxStatus = (typeof CHANNEL_OUTBOX_STATUSES)[number];

// ─── CONNECTIONS ──────────────────────────────────────────────────────────────
// One row per tenant channel connection (a WABA phone number, an IG business
// account, a Facebook page, a web widget, or an email address). `provider` is
// the coarse channel; the adapter key (e.g. "meta-whatsapp") is derivable from
// it. Credentials are JSON-stringified and encrypted at rest — never select
// them back to the frontend.

export const channelConnections = pgTable(
  'channel_connections',
  {
    id: serial('id').primaryKey(),
    clientId: integer('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 20 }).notNull(),
    // Stable provider-scoped account id: WABA id, IG business id, page id,
    // widget id, or email address. Combined with provider for idempotent
    // connection upsert.
    externalAccountId: varchar('external_account_id', { length: 255 }),
    displayName: varchar('display_name', { length: 255 }),
    status: varchar('status', { length: 20 }).default('incomplete').notNull(),
    // JSON string of provider credentials (access token, phone_number_id,
    // app secret, etc.) — encrypted at rest. Never returned to clients.
    encryptedCredentials: encryptedText('encrypted_credentials'),
    metadata: json('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    lastWebhookAt: timestamp('last_webhook_at', { withTimezone: true }),
    lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }),
    lastOutboundAt: timestamp('last_outbound_at', { withTimezone: true }),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
    lastErrorCode: varchar('last_error_code', { length: 100 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('channel_connections_client_provider_account_idx').on(
      t.clientId,
      t.provider,
      t.externalAccountId,
    ),
    index('channel_connections_client_provider_idx').on(t.clientId, t.provider),
  ],
);

// ─── CONTACT IDENTITIES ───────────────────────────────────────────────────────
// Maps every channel handle (phone, email, IG id, PSID, web visitor id) back to
// a single CRM contact, so a customer on WhatsApp and the same person on email
// resolve to the same `crm_contacts` row. Resolution is always scoped by
// clientId; never merge two contacts on weak evidence — that is what
// `suggested_merges` is for.

export const contactIdentities = pgTable(
  'contact_identities',
  {
    id: serial('id').primaryKey(),
    clientId: integer('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    contactId: integer('contact_id')
      .notNull()
      .references(() => crmContacts.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 20 }).notNull(),
    // Normalized value: phone in E.164, lowercase email, raw provider ids otherwise.
    value: varchar('value', { length: 320 }).notNull(),
    verified: boolean('verified').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    // One handle resolves to one contact per tenant (idempotent resolution).
    uniqueIndex('contact_identities_client_kind_value_idx').on(t.clientId, t.kind, t.value),
    index('contact_identities_contact_idx').on(t.contactId),
  ],
);

// ─── SUGGESTED MERGES ─────────────────────────────────────────────────────────
// Weak-evidence candidate pairs surfaced for a human to accept or reject. The
// platform NEVER auto-merges contacts based on these.

export const suggestedMerges = pgTable(
  'suggested_merges',
  {
    id: serial('id').primaryKey(),
    clientId: integer('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    contactAId: integer('contact_a_id')
      .notNull()
      .references(() => crmContacts.id, { onDelete: 'cascade' }),
    contactBId: integer('contact_b_id')
      .notNull()
      .references(() => crmContacts.id, { onDelete: 'cascade' }),
    // Human-readable reason, e.g. "same email, different phone".
    evidence: text('evidence'),
    status: varchar('status', { length: 20 }).default('suggested').notNull(), // suggested | accepted | rejected
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedBy: integer('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('suggested_merges_pair_idx').on(t.clientId, t.contactAId, t.contactBId),
  ],
);

// ─── CONSENT ──────────────────────────────────────────────────────────────────
// Channel-level opt-in/opt-out with a policy version. Sales sequences and any
// outbound send must consult this before sending. The opt-out row wins.

export const channelConsent = pgTable(
  'channel_consent',
  {
    id: serial('id').primaryKey(),
    clientId: integer('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    contactId: integer('contact_id').references(() => crmContacts.id, { onDelete: 'cascade' }),
    channel: varchar('channel', { length: 20 }).notNull(),
    kind: varchar('kind', { length: 20 }).notNull(), // identity kind the consent was recorded against
    identityValue: varchar('identity_value', { length: 320 }).notNull(),
    // 'opt_in' | 'opt_out'
    status: varchar('status', { length: 10 }).notNull(),
    source: varchar('source', { length: 50 }).default('manual').notNull(), // manual | webhook | sequence | portal
    policyVersion: varchar('policy_version', { length: 40 }),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('channel_consent_contact_channel_idx').on(t.contactId, t.channel),
    index('channel_consent_identity_idx').on(t.clientId, t.channel, t.kind, t.identityValue),
  ],
);

// ─── OUTBOX ───────────────────────────────────────────────────────────────────
// Durable, idempotent queue of outbound channel messages. One row per logical
// send; retries are recorded on the same row (never insert a second row for the
// same externalMessageId). Drained by a cron that scans queued/retrying rows
// whose nextAttemptAt <= now().

export const channelOutbox = pgTable(
  'channel_outbox',
  {
    id: serial('id').primaryKey(),
    clientId: integer('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    connectionId: integer('connection_id')
      .notNull()
      .references(() => channelConnections.id, { onDelete: 'cascade' }),
    conversationId: integer('conversation_id'),
    contactId: integer('contact_id').references(() => crmContacts.id, { onDelete: 'set null' }),
    channel: varchar('channel', { length: 20 }).notNull(),
    provider: varchar('provider', { length: 40 }).notNull(),
    // Provider message id, once known; unique per (connection) for idempotency.
    externalMessageId: varchar('external_message_id', { length: 255 }),
    recipientIdentity: json('recipient_identity').$type<{ kind: string; value: string }>().notNull(),
    senderIdentity: json('sender_identity').$type<{ kind: string; value: string }>(),
    messageType: varchar('message_type', { length: 20 }).default('text').notNull(),
    body: text('body'),
    media: json('media').$type<unknown[]>(),
    status: varchar('status', { length: 20 }).default('queued').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(6).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).defaultNow().notNull(),
    lastError: text('last_error'),
    lastErrorCode: varchar('last_error_code', { length: 100 }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('channel_outbox_connection_external_idx').on(t.connectionId, t.externalMessageId),
    index('channel_outbox_due_idx').on(t.clientId, t.status, t.nextAttemptAt),
  ],
);

export type ChannelConnection = typeof channelConnections.$inferSelect;
export type NewChannelConnection = typeof channelConnections.$inferInsert;
export type ContactIdentity = typeof contactIdentities.$inferSelect;
export type NewContactIdentity = typeof contactIdentities.$inferInsert;
export type ChannelConsent = typeof channelConsent.$inferSelect;
export type ChannelOutbox = typeof channelOutbox.$inferSelect;
