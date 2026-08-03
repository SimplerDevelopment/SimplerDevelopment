// Audit-style infrastructure: OAuth 2.1 server tables (clients, codes, tokens)
// and the high-risk-tool encrypted argument capture.

import { pgTable, serial, varchar, text, timestamp, integer, json, boolean, index } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { clients } from './sites';
import { agentAuditLogs } from './agenticOs';

export const oauthClients = pgTable('oauth_clients', {
  id: serial('id').primaryKey(),
  /** Public identifier shared with the OAuth client. Looks like `oc_…`. */
  clientId: varchar('client_id', { length: 64 }).notNull().unique(),
  clientName: varchar('client_name', { length: 200 }).notNull(),
  /** RFC 7591 — at least one redirect URI must match exactly on /authorize. */
  redirectUris: json('redirect_uris').$type<string[]>().notNull(),
  /** Optional metadata from the registration request. */
  clientUri: varchar('client_uri', { length: 500 }),
  logoUri: varchar('logo_uri', { length: 500 }),
  tosUri: varchar('tos_uri', { length: 500 }),
  policyUri: varchar('policy_uri', { length: 500 }),
  /** "none" for PKCE-only public clients (default — the MCP web case),
   *  "client_secret_basic" or "client_secret_post" for confidential clients
   *  minted via the admin path. */
  tokenEndpointAuthMethod: varchar('token_endpoint_auth_method', { length: 32 }).default('none').notNull(),
  /** SHA-256 of the issued client_secret. Null for public/PKCE clients. The
   *  raw secret is shown to the admin exactly once at creation/rotation. */
  clientSecretHash: varchar('client_secret_hash', { length: 128 }),
  /** UI preview of the secret (`sd_cs_xxxx…yyyy`) for the admin list view. */
  clientSecretPreview: varchar('client_secret_preview', { length: 32 }),
  clientSecretCreatedAt: timestamp('client_secret_created_at'),
  clientSecretRotatedAt: timestamp('client_secret_rotated_at'),
  /** Free-form software identifiers from the DCR request. */
  softwareId: varchar('software_id', { length: 200 }),
  softwareVersion: varchar('software_version', { length: 64 }),
  /** Tenant ownership for self-service confidential clients minted from the
   *  portal (`/portal/settings/api-keys`). NULL = a global/admin registration
   *  (Claude.ai connector, admin-minted client) with no single owning tenant.
   *  When set, the client may only be authorized by users of this same portal
   *  client (enforced in /oauth/authorize/decision), and only this tenant can
   *  list / rotate / delete it. */
  ownerClientId: integer('owner_client_id').references(() => clients.id, { onDelete: 'cascade' }),
  /** The portal user who minted the self-service client (audit only). */
  ownerUserId: integer('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/** Single-use authorization codes from /oauth/authorize → /oauth/token. */

export const oauthAuthorizationCodes = pgTable('oauth_authorization_codes', {
  id: serial('id').primaryKey(),
  /** SHA-256 of the actual code; raw value is only sent to the redirect URI. */
  codeHash: varchar('code_hash', { length: 128 }).notNull().unique(),
  oauthClientId: integer('oauth_client_id').notNull().references(() => oauthClients.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  /** Granted scopes — may be a subset of those requested. */
  scopes: json('scopes').$type<string[]>().notNull(),
  /** Must match the value sent to /oauth/token exactly. */
  redirectUri: varchar('redirect_uri', { length: 500 }).notNull(),
  /** PKCE — RFC 7636. We require S256 for public clients; confidential
   *  clients (Basic/Post auth) may omit PKCE entirely, so this is nullable. */
  codeChallenge: varchar('code_challenge', { length: 256 }),
  codeChallengeMethod: varchar('code_challenge_method', { length: 16 }),
  /** RFC 8707 resource indicator (the MCP server URL). */
  resource: varchar('resource', { length: 500 }),
  expiresAt: timestamp('expires_at').notNull(),
  consumedAt: timestamp('consumed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/** Bearer access tokens issued by /oauth/token. Token strings are
 *  `sd_oauth_…`; only the SHA-256 hash is stored. */

export const oauthAccessTokens = pgTable('oauth_access_tokens', {
  id: serial('id').primaryKey(),
  tokenHash: varchar('token_hash', { length: 128 }).notNull().unique(),
  tokenPreview: varchar('token_preview', { length: 24 }).notNull(),
  oauthClientId: integer('oauth_client_id').notNull().references(() => oauthClients.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  scopes: json('scopes').$type<string[]>().notNull(),
  resource: varchar('resource', { length: 500 }),
  /** When true, CMS-write MCP tools stage to mcp_pending_changes instead of
   * applying directly — same gate as portal_api_keys.require_cms_approval, but
   * per OAuth connection. Defaults to FALSE (preserve the historical behavior
   * where OAuth-connected agents wrote directly); a client can flip it on per
   * connection to require human approval. NOTE the asymmetry with
   * portal_api_keys, which defaults TRUE — revisit if OAuth should also be
   * gated-by-default. Before this column, the approval gate read this token's
   * numeric id against portal_api_keys (a different id space) and silently
   * bypassed / cross-read an unrelated key — see QAD-048. */
  requireCmsApproval: boolean('require_cms_approval').default(false).notNull(),
  expiresAt: timestamp('expires_at'),
  revokedAt: timestamp('revoked_at'),
  lastUsedAt: timestamp('last_used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/** Refresh tokens issued alongside short-lived access tokens (OAuth 2.1 §4.3 /
 *  RFC 9700 BCP). Token strings are `sd_oart_…`; only the SHA-256 hash is stored.
 *  Rotated on every use: redeeming one sets `consumedAt` and issues a fresh
 *  token carrying the same `familyId`. Presenting an already-consumed token
 *  (replay / theft) revokes the whole `familyId` lineage — OAuth 2.1 mandatory
 *  refresh-token-rotation reuse detection for public clients. */

export const oauthRefreshTokens = pgTable('oauth_refresh_tokens', {
  id: serial('id').primaryKey(),
  tokenHash: varchar('token_hash', { length: 128 }).notNull().unique(),
  tokenPreview: varchar('token_preview', { length: 24 }).notNull(),
  oauthClientId: integer('oauth_client_id').notNull().references(() => oauthClients.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  scopes: json('scopes').$type<string[]>().notNull(),
  resource: varchar('resource', { length: 500 }),
  /** Rotation lineage. All tokens descended from one authorization share an id;
   *  reuse of a consumed token revokes every row with the same value. */
  familyId: varchar('family_id', { length: 64 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  /** Set when this token is redeemed at /oauth/token (single-use). */
  consumedAt: timestamp('consumed_at'),
  /** Set when the lineage is force-revoked (reuse detected, or user logout). */
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── High-risk agent-tool argument capture ──────────────────────────────────
//
// Per `vault/04 - Decisions/ADR high-risk-agent-arg-capture.md` (AAF-001):
// `agent_action_logs` (see `lib/db/schema/agenticOs.ts`) stores a redacted,
// 4KB-truncated inputs summary for EVERY tool call — that's forensically
// insufficient for high-risk tools (sends, deletes, authority mutations),
// where after a suspected prompt injection you need to RECONSTRUCT exactly
// what was sent, not just verify a guess against a hash.
//
// This table is an ADDITIVE, encrypted (AES-256-GCM via
// `lib/crypto/api-key.ts`), access-controlled, 90-day-retained record of the
// full (secrets-redacted, not truncated) argument set — written only for
// tools where `lib/mcp/high-risk-tools.ts: isHighRiskTool()` is true. It
// never replaces the hash log or the redacted summary log, and the write is
// fire-and-forget (see `lib/mcp/telemetry.ts`) — a capture failure must never
// block or delay the tool call.
//
// Decryption is restricted to a super-admin/security role and every read is
// itself audit-logged (see `app/api/admin/agent-captures/[id]/route.ts`) —
// there is no un-audited read path. A daily cron
// (`app/api/cron/purge-agent-captures/route.ts`) hard-purges ciphertext
// older than 90 days; the hash + redacted logs are retained longer/indefinitely.

export const agentActionCaptures = pgTable('agent_action_captures', {
  id: serial('id').primaryKey(),
  // Tenant — NOT NULL; every row belongs to exactly one client.
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  // The agent_action_logs row this capture reconstructs, when cheaply
  // linkable at write time. Nullable — the audit insert this capture rides
  // alongside does not always have a returned id available.
  auditLogId: integer('audit_log_id').references(() => agentAuditLogs.id, { onDelete: 'set null' }),
  toolName: varchar('tool_name', { length: 120 }).notNull(),
  // Credential attribution (portal API key or OAuth token id) — not an FK,
  // mirrors agent_action_logs.api_key_id (two different id spaces share the
  // column; see QAD-048 for why that distinction matters elsewhere).
  keyId: integer('key_id'),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  // AES-256-GCM blob (base64: iv | tag | ciphertext) from encryptApiKey() of
  // JSON.stringify(redactSecretsOnly(args)) — secrets stripped, PII/content
  // retained, no 4KB truncation.
  ciphertext: text('ciphertext').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('agent_action_captures_client_created_idx').on(table.clientId, table.createdAt),
]);

export type AgentActionCapture = typeof agentActionCaptures.$inferSelect;
export type NewAgentActionCapture = typeof agentActionCaptures.$inferInsert;

