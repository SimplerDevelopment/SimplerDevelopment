// Authentication & user identity (users, API keys, OAuth integrations).

import { pgTable, serial, varchar, text, timestamp, boolean, integer, json, jsonb, unique } from 'drizzle-orm/pg-core';
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
  // ── Self-serve signup (public /portal/signup funnel) ───────────────────────
  // Null = legacy/invited user (implicitly trusted) OR self-serve signup that
  // hasn't clicked the verification link yet. The signup API blocks login-time
  // checkout until verified; a cron purges never-verified accounts after 7 days.
  emailVerifiedAt: timestamp('email_verified_at'),
  emailVerificationToken: varchar('email_verification_token', { length: 64 }),
  emailVerificationExpires: timestamp('email_verification_expires'),
  // Google OAuth subject (sub claim) — set on first "Continue with Google";
  // links the Google identity to this row so email+password and Google both
  // resolve to the same user.
  // NOTE: uniqueness is enforced by a hand-applied index
  // (scripts/billing/002_signup_funnel.sql), intentionally NOT declared here:
  // drizzle-kit push hits an interactive "truncate users?" prompt when adding
  // a unique constraint to a populated table, which crashes the no-TTY
  // integration-test template heal (same class of issue as the HNSW index on
  // brain_embeddings). App code never inserts duplicates — the index is a
  // race guard on real DBs only.
  googleId: varchar('google_id', { length: 64 }),
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
  // Keys are stored hashed at rest (SHA-256 hex of the raw `sd_live_…` token),
  // never in plaintext. keyPreview is a display-safe masked form (first 12 + …
  // + last 4). The raw key is shown to the caller exactly once at creation.
  keyHash: varchar('key_hash', { length: 64 }).notNull().unique(),
  keyPreview: varchar('key_preview', { length: 32 }).notNull(),
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

// ─── ONBOARDING STATE ────────────────────────────────────────────────────────

/**
 * Per-user onboarding wizard state. One row per user, created on first visit
 * to `/portal/onboarding`. `completedAt` is the gate — if NULL, the dashboard
 * redirects the user back into the wizard; if set, the user can re-launch
 * the wizard from settings but isn't forced through it.
 *
 * `answers` stores the raw responses so we can re-render saved progress when
 * the user resumes mid-flow. The wizard ALSO writes the structured outputs
 * into the right downstream tables (brandingProfiles, brandingMessaging,
 * clients.company) — `answers` is the source-of-truth for the wizard, not
 * for the rest of the app.
 */
export const userOnboarding = pgTable('user_onboarding', {
  userId: integer('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').references(() => clients.id, { onDelete: 'cascade' }),
  /** Last step the user landed on. Used to resume mid-flow. */
  step: varchar('step', { length: 50 }).default('welcome').notNull(),
  /** Raw wizard answers — see lib/onboarding/types.ts for shape. */
  answers: json('answers').$type<{
    role?: string;
    timezone?: string;
    companySize?: string;
    industry?: string;
    websiteUrl?: string;
    brandTones?: string[];
    primaryColor?: string;
    mission?: string;
    featuresInterested?: string[];
    skillsDownloaded?: boolean;
    mcpKeyCreatedId?: number;
  }>().default({}).notNull(),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── DASHBOARD WIDGET PREFERENCES ────────────────────────────────────────────

/**
 * Per-user, per-client dashboard widget layout preferences.
 * Stores which widgets are visible, their order, and collapsed state.
 * One row per (userId, clientId) pair — upserted on change, never deleted.
 */
export const userDashboardPreferences = pgTable(
  'user_dashboard_preferences',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
    /** Shape: { order?: string[]; hidden?: string[]; collapsed?: string[] } */
    prefs: jsonb('prefs').notNull().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [unique().on(t.userId, t.clientId)],
);

