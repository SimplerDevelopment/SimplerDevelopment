// Approval queue for portal MCP-issued changes (pending → approved/rejected/applied).

import { pgTable, serial, varchar, text, timestamp, integer, json, index } from 'drizzle-orm/pg-core';
import { portalApiKeys, users } from './auth';
import { clients } from './sites';

export const mcpPendingChanges = pgTable('mcp_pending_changes', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  keyId: integer('key_id').references(() => portalApiKeys.id, { onDelete: 'set null' }),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: integer('entity_id'),
  operation: varchar('operation', { length: 20 }).notNull(),
  summary: varchar('summary', { length: 500 }),
  payload: json('payload').notNull(),
  originalSnapshot: json('original_snapshot'),
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  reviewerId: integer('reviewer_id').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at'),
  reviewNote: text('review_note'),
  appliedAt: timestamp('applied_at'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  // Approvals dashboard filters by (client, status) sorted by createdAt desc;
  // the admin pending-changes queue scans by status only.
  index('mcp_pending_changes_client_status_created_idx').on(t.clientId, t.status, t.createdAt),
  index('mcp_pending_changes_status_idx').on(t.status),
]);

// Public-shareable approval links. Every MCP create/update of reviewable
// content (posts, pitch decks, email campaigns, block templates) mints a row
// here, so the tool can hand back a token-bearing URL that opens the draft in
// a non-authenticated reviewer flow. Two link shapes share the table:
//   - linkType = 'entity'         → direct pointer to a draft entity row,
//                                   approve = publish, reject = mark rejected.
//   - linkType = 'pending_change' → wraps an mcp_pending_changes row staged by
//                                   a require_cms_approval key; approve =
//                                   apply the staged change.
// The `token` is 64 hex chars (crypto.randomBytes(32).toString('hex')) and is
// the only credential the reviewer carries. Always scope reads/writes via
// clientId after token lookup so a leaked token can't read other tenants.

export const mcpApprovalLinks = pgTable('mcp_approval_links', {
  id: serial('id').primaryKey(),
  token: varchar('token', { length: 64 }).notNull().unique(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  linkType: varchar('link_type', { length: 20 }).notNull(), // 'entity' | 'pending_change'
  entityType: varchar('entity_type', { length: 50 }).notNull(), // 'post' | 'pitch_deck' | 'email_campaign' | 'block_template'
  entityId: integer('entity_id'),
  pendingChangeId: integer('pending_change_id').references(() => mcpPendingChanges.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).default('pending').notNull(), // 'pending' | 'approved' | 'rejected' | 'expired'
  summary: varchar('summary', { length: 500 }),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  keyId: integer('key_id').references(() => portalApiKeys.id, { onDelete: 'set null' }),
  // Captured at approve/reject time — reviewers are usually not logged in.
  reviewerName: varchar('reviewer_name', { length: 255 }),
  reviewerEmail: varchar('reviewer_email', { length: 255 }),
  reviewNote: text('review_note'),
  reviewedAt: timestamp('reviewed_at'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- OAuth 2.1 for MCP (claude.ai custom connector + similar) ----------------
// These power the OAuth flow that lets a remote MCP client (Claude.ai web) add
// the SimplerDevelopment MCP server with one click. The portal user logs in,
// approves scopes, and Claude exchanges the resulting code for an access token
// stored in `oauthAccessTokens`. `lib/mcp-auth.ts` accepts both the legacy
// `sd_mcp_…` keys (in `portalApiKeys`) and the new `sd_oauth_…` access tokens.

/** Public OAuth clients registered via RFC 7591 dynamic client registration. */
