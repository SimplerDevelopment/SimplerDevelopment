// Authentication & user identity (users, API keys, OAuth integrations).

import { pgTable, serial, varchar, text, timestamp, boolean, integer, json } from 'drizzle-orm/pg-core';
import { clientWebsites, clients } from './sites';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).default('editor').notNull(),
  active: boolean('active').default(true).notNull(),
  inviteToken: varchar('invite_token', { length: 255 }),
  inviteExpiresAt: timestamp('invite_expires_at'),
  passwordResetToken: varchar('password_reset_token', { length: 255 }),
  passwordResetExpires: timestamp('password_reset_expires'),
  defaultClientId: integer('default_client_id'), // preferred portal for multi-client users
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const githubConnections = pgTable('github_connections', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  githubUserId: integer('github_user_id').notNull(),
  githubUsername: varchar('github_username', { length: 100 }).notNull(),
  accessToken: text('access_token').notNull(),
  scope: varchar('scope', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const apiKeys = pgTable('api_keys', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  key: varchar('key', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  scopes: json('scopes').$type<string[]>().default([]),
  rateLimitPerMinute: integer('rate_limit_per_minute').default(60),
  active: boolean('active').default(true).notNull(),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── CRM DEAL ARTIFACTS & COMMENTS ──────────────────────────────────────────

export const portalApiKeys = pgTable('portal_api_keys', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  keyHash: varchar('key_hash', { length: 128 }).notNull().unique(),
  keyPreview: varchar('key_preview', { length: 20 }).notNull(),
  scopes: json('scopes').$type<string[]>().default([]).notNull(),
  active: boolean('active').default(true).notNull(),
  /** When true, CMS-write MCP tools stage to mcp_pending_changes instead of
   * applying directly. Defaults to TRUE so any newly issued client key is
   * gated by default — admins can flip it off per key for trusted automation.
   * (Reverted from a `false` default after a client-side incident; see
   * 0110_draft_overlays.sql.) */
  requireCmsApproval: boolean('require_cms_approval').default(true).notNull(),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/** Staging table for CMS writes originating from MCP keys flagged with
 * requireCmsApproval. Staff approve/reject via approvals_* tools or portal UI. */

