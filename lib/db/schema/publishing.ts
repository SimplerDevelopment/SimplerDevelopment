// Publishing Command Center — multi-channel publishing workflow.
//
// Publishing is a "system" kanban project per client (one row in `projects`
// flagged via `projects.system_kind = 'publishing'`). The board itself reuses
// `kanban_cards` / `kanban_columns` / `kanban_card_artifacts`; this file owns
// the two tables that are specific to publishing:
//
//   - `publishing_campaigns` — cross-channel groupings ("Fall 2026 outbound")
//   - `publishing_permissions` — per-user selective stage/action gating
//
// Polymorphic content references live on `kanban_card_artifacts`. Tag
// polymorphism is introduced in a separate migration (PUB-7) via the new
// `taggings` table; tags themselves stay in `tags` (defined in cms.ts).

import { pgTable, serial, varchar, text, timestamp, integer, boolean, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { clients } from './sites';

export const publishingCampaigns = pgTable('publishing_campaigns', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  description: text('description'),
  // 7-char hex (#rrggbb); rendered as the campaign chip color on cards.
  color: varchar('color', { length: 7 }).default('#6366f1').notNull(),
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  // active | completed | archived
  status: varchar('status', { length: 20 }).default('active').notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('publishing_campaigns_client_slug_idx').on(t.clientId, t.slug),
  index('publishing_campaigns_client_status_idx').on(t.clientId, t.status),
]);

// Per-user selective abilities for the client's Publishing board. Default
// posture: client owners + admins (resolved from client_members.role) have
// every permission implicitly with no row here; non-admin members start with
// view-only. Rows in this table grant the specified permission to the given
// user. Absent row = inherit default.
export const publishingPermissions = pgTable('publishing_permissions', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // One of the keys in lib/publishing/permissions.ts PUBLISHING_PERMISSION_KEYS.
  // Stage-transition keys: move_to_idea, move_to_draft, move_to_in_review,
  // move_to_scheduled, move_to_published, move_to_archived.
  // Card-action keys: create_card, delete_card.
  // Admin-action keys: manage_campaigns, manage_tags, manage_permissions.
  permissionKey: varchar('permission_key', { length: 40 }).notNull(),
  grantedBy: integer('granted_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('publishing_permissions_client_user_key_idx').on(t.clientId, t.userId, t.permissionKey),
  index('publishing_permissions_client_user_idx').on(t.clientId, t.userId),
]);
