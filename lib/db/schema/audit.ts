// Audit-style infrastructure: OAuth 2.1 server tables (clients, codes, tokens).

import { pgTable, serial, varchar, timestamp, integer, json } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { clients } from './sites';

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
  expiresAt: timestamp('expires_at'),
  revokedAt: timestamp('revoked_at'),
  lastUsedAt: timestamp('last_used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

