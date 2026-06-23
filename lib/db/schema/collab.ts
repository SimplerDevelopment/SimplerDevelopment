// Real-time collaboration: cross-surface document comments (post, pitch deck,
// email campaign). Threaded, anchored to a block / slide / coordinate / form
// field. Tenant-scoped via clientId.

import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  json,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { clients } from './sites';

/** Anchor describing where a comment sticks. All fields optional. */
export interface CommentAnchor {
  /** ID of the block the comment is attached to (post / email / deck slide block). */
  blockId?: string;
  /** Index of the slide (decks only). */
  slideIndex?: number;
  /** X coordinate in iframe / preview document space (px). Optional. */
  x?: number;
  /** Y coordinate in iframe / preview document space (px). Optional. */
  y?: number;
  /** Form-field path for free-form anchored notes (e.g. "blocks[2].props.headline"). */
  fieldPath?: string;
}

export const documentComments = pgTable('document_comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  // Which surface the comment lives on.
  entityType: varchar('entity_type', { length: 20 }).notNull(), // 'post' | 'deck' | 'email'
  entityId: text('entity_id').notNull(),
  // Thread root + parent. Root has parentId=null and threadId=id (set on insert).
  threadId: uuid('thread_id').notNull(),
  parentId: uuid('parent_id'),
  authorId: integer('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  mentionedUserIds: json('mentioned_user_ids').$type<number[]>().default([]).notNull(),
  anchor: json('anchor').$type<CommentAnchor>(),
  resolvedAt: timestamp('resolved_at'),
  resolvedBy: integer('resolved_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Soft-export of the row type for convenience in handlers.
export type DocumentComment = typeof documentComments.$inferSelect;
export type NewDocumentComment = typeof documentComments.$inferInsert;

// (Snapshot/persistence note: the realtime-server writes Y.Doc snapshots back
// to posts.content / pitch_decks.slides / email_campaigns.block_content
// directly via raw SQL — we do NOT mirror those into a separate table.)

// Re-export uuid + serial from drizzle to silence unused-import in callers.
void serial;
