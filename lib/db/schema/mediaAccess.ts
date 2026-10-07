// Keys remain private after their source note/card is removed. A deleted
// tenant leaves a tombstone with no owner, which is always denied by the proxy.
import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { clients } from './sites';

export const privateMediaKeys = pgTable('private_media_keys', {
  key: text('key').primaryKey(),
  clientId: integer('client_id').references(() => clients.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
