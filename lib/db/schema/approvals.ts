// Approval queue for portal MCP-issued changes (pending → approved/rejected/applied).

import { pgTable, serial, varchar, text, timestamp, integer, json } from 'drizzle-orm/pg-core';
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
});

// --- OAuth 2.1 for MCP (claude.ai custom connector + similar) ----------------
// These power the OAuth flow that lets a remote MCP client (Claude.ai web) add
// the SimplerDevelopment MCP server with one click. The portal user logs in,
// approves scopes, and Claude exchanges the resulting code for an access token
// stored in `oauthAccessTokens`. `lib/mcp-auth.ts` accepts both the legacy
// `sd_mcp_…` keys (in `portalApiKeys`) and the new `sd_oauth_…` access tokens.

/** Public OAuth clients registered via RFC 7591 dynamic client registration. */

