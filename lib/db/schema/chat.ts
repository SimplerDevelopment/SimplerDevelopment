// Embeddable web chat widget — per-site widget config, conversations, messages.
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

export const chatWidgets = pgTable('chat_widgets', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  siteId: integer('site_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').default(true).notNull(),
  greetingMessage: text('greeting_message'),
  position: varchar('position', { length: 32 }).default('bottom-right').notNull(),
  primaryColor: varchar('primary_color', { length: 7 }).default('#0070f3').notNull(),
  awayMessage: text('away_message'),
  // Future: AI first-line answers from Company Brain. Schema-only flag for now.
  brainEnabled: boolean('brain_enabled').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('chat_widgets_site_idx').on(t.siteId),
]);

export const chatConversations = pgTable('chat_conversations', {
  id: serial('id').primaryKey(),
  widgetId: integer('widget_id').notNull().references(() => chatWidgets.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  // Stable per-browser identifier provided by the widget loader (localStorage UUID).
  visitorId: varchar('visitor_id', { length: 64 }).notNull(),
  visitorName: varchar('visitor_name', { length: 255 }),
  visitorEmail: varchar('visitor_email', { length: 255 }),
  status: varchar('status', { length: 20 }).default('open').notNull(), // open | assigned | closed
  assignedUserId: integer('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
  lastMessageAt: timestamp('last_message_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  closedAt: timestamp('closed_at'),
}, (t) => [
  index('chat_conversations_inbox_idx').on(t.clientId, t.status, t.lastMessageAt),
  index('chat_conversations_widget_visitor_idx').on(t.widgetId, t.visitorId),
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
  // Reserved for the future — see "Out of scope" in the spec.
  attachments: json('attachments').$type<unknown[]>().default([]).notNull(),
  occurredAt: timestamp('occurred_at').defaultNow().notNull(),
}, (t) => [
  index('chat_messages_conv_occurred_idx').on(t.conversationId, t.occurredAt),
]);

export type ChatWidget = typeof chatWidgets.$inferSelect;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
