// Site snapshots — portable export/import of an entire client website.
// Lets agencies clone configured sites (blocks + posts + nav + custom code +
// post types + block templates) into a new site, either within the same
// client or as a reusable template. `isPublic` is a forward-looking flag for
// a future marketplace; no logic gates on it yet.

import { pgTable, serial, varchar, text, timestamp, boolean, integer, json } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { clients, clientWebsites } from './sites';

export const siteSnapshots = pgTable('site_snapshots', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  // Source site this snapshot was taken from (nullable — externally-uploaded
  // snapshots have no source site; cleared if the source site is deleted).
  sourceSiteId: integer('source_site_id').references(() => clientWebsites.id, { onDelete: 'set null' }),
  // The actual portable payload — see lib/snapshots/types.ts for shape.
  payload: json('payload').notNull(),
  version: integer('version').default(1).notNull(),
  // Forward-looking flag for a future marketplace; no current logic.
  isPublic: boolean('is_public').default(false).notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
