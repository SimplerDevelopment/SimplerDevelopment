// Unified conversations & messages — the single store for WebChat, WhatsApp,
// Instagram, Messenger, and Email.
//
// Historically this was web-chat-specific (`chat_widgets` + widgetId/visitorId
// NOT NULL). It is now the omnichannel conversation core: WebChat rows keep
// `widgetId`/`visitorId`; other channels leave them null and set `channel`,
// `provider`, `connectionId`, `contactId`, and `externalConversationId`.
//
// Realtime: changes are broadcast via Postgres LISTEN/NOTIFY (see
// lib/chat/realtime.ts). Visitors connect through SSE with an ephemeral
// HMAC token that scopes them to a single conversationId; portal agents
// connect with a NextAuth session and subscribe to their clientId.
//
// Multi-tenant — every row is keyed by clientId.

import { pgTable, serial, varchar, text, timestamp, boolean, integer, json, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { clients, clientWebsites } from './sites';
import { crmContacts } from './crm';

export const CHAT_AI_MODES = ['ai', 'human', 'paused', 'hybrid', 'closed'] as const;
export type ChatAiMode = (typeof CHAT_AI_MODES)[number];

export const chatWidgets = pgTable('chat_widgets', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  siteId: integer('site_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').default(true).notNull(),
  greetingMessage: text('greeting_message'),
  position: varchar('position', { length: 32 }).default('bottom-right').notNull(),
  primaryColor: varchar('primary_color', { length: 7 }).default('#0070f3').notNull(),
  awayMessage: text('away_message'),
  // Explicit opt-in to automated first-line reception; human handoffs retain their mode.
  brainEnabled: boolean('brain_enabled').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('chat_widgets_site_idx').on(t.siteId),
]);

export const chatConversations = pgTable('chat_conversations', {
  id: serial('id').primaryKey(),
  // Null for non-WebChat channels. WebChat rows keep this set.
  widgetId: integer('widget_id').references(() => chatWidgets.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  // Stable per-browser identifier provided by the widget loader (localStorage UUID).
  // Null for non-WebChat channels.
  visitorId: varchar('visitor_id', { length: 64 }),
  visitorName: varchar('visitor_name', { length: 255 }),
  visitorEmail: varchar('visitor_email', { length: 255 }),
  status: varchar('status', { length: 20 }).default('open').notNull(), // open | assigned | closed
  assignedUserId: integer('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
  lastMessageAt: timestamp('last_message_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  closedAt: timestamp('closed_at'),

  // ── Omnichannel columns (added for the platform expansion) ──────────────────
  // `channel` is the coarse bucket; `provider` is the adapter key
  // ("meta-whatsapp", "meta-instagram", "meta-messenger", "resend", "webchat").
  channel: varchar('channel', { length: 20 }).default('webchat').notNull(),
  provider: varchar('provider', { length: 40 }).default('webchat').notNull(),
  connectionId: integer('connection_id'),
  contactId: integer('contact_id').references(() => crmContacts.id, { onDelete: 'set null' }),
  externalConversationId: varchar('external_conversation_id', { length: 255 }),
  // AI mode: ai | human | paused | hybrid | closed. `ai` = agent answers;
  // `human` = a person answers (AI stays silent); `hybrid` = human answers with
  // AI suggestions; `paused` = nobody answers; `closed` = terminal.
  aiMode: varchar('ai_mode', { length: 20 }).default('human').notNull(),
  priority: varchar('priority', { length: 20 }).default('medium').notNull(), // low | medium | high | urgent
  dealId: integer('deal_id'),
  labels: json('labels').$type<string[]>().default([]).notNull(),
  unreadCount: integer('unread_count').default(0).notNull(),
  lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }),
  lastOutboundAt: timestamp('last_outbound_at', { withTimezone: true }),
}, (t) => [
  index('chat_conversations_inbox_idx').on(t.clientId, t.status, t.lastMessageAt),
  index('chat_conversations_widget_visitor_idx').on(t.widgetId, t.visitorId),
  index('chat_conversations_channel_idx').on(t.clientId, t.channel, t.status),
  // Idempotent conversation resolution per provider.
  index('chat_conversations_external_idx').on(t.connectionId, t.externalConversationId),
]);

// Append-only — never UPDATE or DELETE in the hot path.
export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id').notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  authorKind: varchar('author_kind', { length: 20 }).notNull(), // visitor | agent | system
  authorUserId: integer('author_user_id').references(() => users.id, { onDelete: 'set null' }),
  authorName: varchar('author_name', { length: 255 }),
  body: text('body').notNull(),
  attachments: json('attachments').$type<unknown[]>().default([]).notNull(),
  occurredAt: timestamp('occurred_at').defaultNow().notNull(),

  // ── Omnichannel columns ─────────────────────────────────────────────────────
  channel: varchar('channel', { length: 20 }).default('webchat').notNull(),
  provider: varchar('provider', { length: 40 }).default('webchat').notNull(),
  connectionId: integer('connection_id'),
  direction: varchar('direction', { length: 10 }).default('inbound').notNull(), // inbound | outbound
  // Provider message id — idempotency key for inbound webhooks.
  externalMessageId: varchar('external_message_id', { length: 255 }),
  replyToExternalMessageId: varchar('reply_to_external_message_id', { length: 255 }),
  senderIdentity: json('sender_identity').$type<{ kind: string; value: string }>(),
  recipientIdentity: json('recipient_identity').$type<{ kind: string; value: string }>(),
  messageType: varchar('message_type', { length: 20 }).default('text').notNull(),
  // Structured media (image/audio/video/document/location/interactive payload).
  media: json('media').$type<unknown[]>(),
  status: varchar('status', { length: 20 }).default('sent').notNull(), // queued|sent|delivered|read|failed
  metadata: json('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  receivedAt: timestamp('received_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  readAt: timestamp('read_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
}, (t) => [
  index('chat_messages_conv_occurred_idx').on(t.conversationId, t.occurredAt),
  // Idempotency: one row per (provider connection, external message id).
  uniqueIndex('chat_messages_connection_external_idx').on(t.connectionId, t.externalMessageId),
]);

export type ChatWidget = typeof chatWidgets.$inferSelect;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
