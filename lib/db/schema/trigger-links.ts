// Trigger links: tracked shortlinks that redirect to a destination URL while
// recording each click. Designed to feed downstream automation triggers
// ("when contact X clicks link Y, do Z") via the `trigger_link_clicks` table —
// that wiring is intentionally NOT included in this initial cut. The
// `contactFieldKey` column is a forward-looking hook: when a known contact
// clicks a link, the future automation runner will set that contact's custom
// field. For now we just persist it.
//
// Slugs are unique platform-wide (single global namespace) to keep the public
// `/go/<slug>` redirect resolver simple — the alternative (per-client
// namespacing in the URL) was rejected as unnecessary friction. Collisions
// are prevented by the `UNIQUE` constraint on `slug`; the API's auto-generator
// uses a random base32 token so collision probability is negligible.

import { pgTable, serial, varchar, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { clients } from './sites';

export const triggerLinks = pgTable('trigger_links', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  // Globally-unique short token used in /go/<slug>. Lowercase alnum + dashes only.
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  destinationUrl: text('destination_url').notNull(),
  label: varchar('label', { length: 255 }),
  // Future hook: contact custom-field key to set when clicked by an
  // identified contact. Stored, not yet acted on.
  contactFieldKey: text('contact_field_key'),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('trigger_links_client_id_idx').on(table.clientId),
]);

export const triggerLinkClicks = pgTable('trigger_link_clicks', {
  id: serial('id').primaryKey(),
  linkId: integer('link_id').notNull().references(() => triggerLinks.id, { onDelete: 'cascade' }),
  // Denormalized so click queries scoped to a client don't have to join.
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  // Optional — the contact who clicked (when resolvable via cookie/email/etc).
  // Today we never populate this; future automation work will.
  contactId: integer('contact_id'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  referer: text('referer'),
  occurredAt: timestamp('occurred_at').defaultNow().notNull(),
}, (table) => [
  index('trigger_link_clicks_link_id_occurred_at_idx').on(table.linkId, table.occurredAt),
  index('trigger_link_clicks_client_id_idx').on(table.clientId),
]);
