// Per-tenant clients, services, hosted websites, and infrastructure metadata.

import { pgTable, serial, varchar, text, timestamp, boolean, integer, json } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { SurveyField } from './cms';

export const clients = pgTable('clients', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  company: varchar('company', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  website: varchar('website', { length: 255 }),
  address: text('address'),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  emailPrefix: varchar('email_prefix', { length: 50 }), // prefix@simplerdevelopment.com for AI email gateway
  defaultWebsiteId: integer('default_website_id'), // which website determines the portal subdomain
  notes: text('notes'), // internal staff notes
  // ── White-label / SaaS Mode (Tier 3 "Scale") ───────────────────────────────
  // Agencies on the Scale tier can map their own domain to the portal, override
  // brand chrome with their own agencyName/logo/colors, and (later) resell
  // sub-accounts. White-label cannot be enabled until customDomainVerifiedAt
  // is set — the API enforces this; the UI disables the toggle accordingly.
  customDomain: varchar('custom_domain', { length: 255 }).unique(), // e.g. "portal.acme-agency.com"
  customDomainVerifiedAt: timestamp('custom_domain_verified_at'),
  customDomainVerificationToken: varchar('custom_domain_verification_token', { length: 64 }), // DNS TXT verification value
  whiteLabelEnabled: boolean('white_label_enabled').default(false).notNull(),
  agencyName: varchar('agency_name', { length: 255 }), // overrides "Simpler Development" in portal chrome
  agencyLogoUrl: varchar('agency_logo_url', { length: 500 }), // overrides /iconLogo.png and login wordmark
  agencyPrimaryColor: varchar('agency_primary_color', { length: 20 }), // optional accent for portal chrome
  // Self-serve / PLG brain trial — when non-null and > now() the entitlement
  // helper grants brain access without requiring an explicit clientServices
  // row. Expired trials simply fall through to the paid-subscription check.
  brainTrialUntil: timestamp('brain_trial_until'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Audit trail for custom-domain mutations on the agency (clients) record.
// Independent of clients.* so admin/security can review domain history even
// after a client row is updated or the domain is reset.
export const customDomainHistory = pgTable('custom_domain_history', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  domain: varchar('domain', { length: 255 }).notNull(),
  action: varchar('action', { length: 20 }).notNull(), // added, verified, removed
  byUserId: integer('by_user_id').references(() => users.id, { onDelete: 'set null' }),
  occurredAt: timestamp('occurred_at').defaultNow().notNull(),
});

// Team members with access to a client account (many users → one client)

export const clientMembers = pgTable('client_members', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).default('member').notNull(), // owner, admin, member, viewer
  invitedBy: integer('invited_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// GitHub OAuth connections for portal users (repo collaborator access)

export const services = pgTable('services', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  description: text('description'),
  category: varchar('category', { length: 50 }).notNull(), // domain, hosting, development, maintenance
  price: integer('price').notNull(), // in cents
  billingCycle: varchar('billing_cycle', { length: 20 }).default('once'), // once, monthly, annually
  stripePriceId: varchar('stripe_price_id', { length: 255 }),
  stripeProductId: varchar('stripe_product_id', { length: 255 }),
  active: boolean('active').default(true).notNull(),
  features: json('features').$type<string[]>().default([]),
  surveyFields: json('survey_fields').$type<SurveyField[]>().default([]),
  includedAiCredits: integer('included_ai_credits').default(0).notNull(), // tokens included per billing cycle
  usageLimits: json('usage_limits').$type<Record<string, number>>().default({}), // per-period usage limits
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const clientServices = pgTable('client_services', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  serviceId: integer('service_id').notNull().references(() => services.id, { onDelete: 'restrict' }),
  status: varchar('status', { length: 50 }).default('active').notNull(), // pending, active, suspended, cancelled
  startDate: timestamp('start_date').defaultNow(),
  renewalDate: timestamp('renewal_date'),
  creditsGrantedAt: timestamp('credits_granted_at'), // when last monthly AI credit grant was applied
  notes: text('notes'),
  metadata: json('metadata'), // domain name, server details, etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── AI Credit System ──────────────────────────────────────────────────────────

export const serviceRequests = pgTable('service_requests', {
  id: serial('id').primaryKey(),
  serviceId: integer('service_id').notNull().references(() => services.id, { onDelete: 'restrict' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 50 }).default('pending').notNull(), // pending, reviewed, approved, rejected
  answers: json('answers').$type<Record<string, unknown>>(),
  message: text('message'),
  adminNotes: text('admin_notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export interface DnsInstruction {
  type: 'A' | 'CNAME' | 'TXT' | 'MX';
  host: string;   // e.g. "@" or "www"
  value: string;  // the value to point to
  ttl?: string;   // e.g. "Auto" or "3600"
  notes?: string;
}

// Client-owned websites managed through the portal CMS

export const clientWebsites = pgTable('client_websites', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  domain: varchar('domain', { length: 255 }),
  description: text('description'),
  active: boolean('active').default(true).notNull(),
  // Repository & deployment
  subdomain: varchar('subdomain', { length: 100 }), // slug for <slug>.simplerdevelopment.com
  githubRepoName: varchar('github_repo_name', { length: 255 }), // e.g. "simplerdevelopment/acme-main"
  githubRepoUrl: varchar('github_repo_url', { length: 500 }),
  deployBranch: varchar('deploy_branch', { length: 100 }).default('main'), // branch to deploy from
  vercelProjectId: varchar('vercel_project_id', { length: 255 }),
  vercelProjectUrl: varchar('vercel_project_url', { length: 500 }),
  vercelDomain: varchar('vercel_domain', { length: 255 }),
  deploymentStatus: varchar('deployment_status', { length: 50 }).default('pending'), // pending, provisioning, active, failed
  lastDeployedAt: timestamp('last_deployed_at'),
  provisionError: text('provision_error'),
  logApiKey: varchar('log_api_key', { length: 64 }), // secret key for request log ingestion
  customLayout: boolean('custom_layout').default(false).notNull(), // true = site blocks handle nav/footer, skip default layout chrome
  publicAccess: boolean('public_access').default(false).notNull(), // false = gated (noindex, coming-soon wall); admin must enable
  brandingProfileId: integer('branding_profile_id'), // FK to branding_profiles — resolved at runtime to avoid circular ref
  // Site-wide custom CSS/JS — applied to every page on this website. Cascades
  // before post-type custom code, which cascades before per-post custom code,
  // so a page can override a CPT-level rule which can override a site rule.
  customCss: text('custom_css'),
  customJs: text('custom_js'),
  // Draft custom CSS/JS — staged but not yet live. MCP writes from
  // `sites_update_custom_code` land here by default; the public renderer
  // ignores these columns. `sites_publish_custom_code` copies draft → live.
  draftCustomCss: text('draft_custom_css'),
  draftCustomJs: text('draft_custom_js'),
  // Timestamp of the most recent draft write; null when draft is in sync with live.
  draftUpdatedAt: timestamp('draft_updated_at'),
  draftUpdatedBy: integer('draft_updated_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Multiple custom domains per website

export const websiteDomains = pgTable('website_domains', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  domain: varchar('domain', { length: 255 }).notNull(),
  isPrimary: boolean('is_primary').default(false).notNull(),
  status: varchar('status', { length: 50 }).default('pending').notNull(), // pending, verified, failed
  verifiedAt: timestamp('verified_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Website environments (production + staging per site)

export const websiteEnvironments = pgTable('website_environments', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 50 }).notNull(), // production, staging
  vercelTarget: varchar('vercel_target', { length: 50 }).notNull(), // production, preview
  previewUrl: varchar('preview_url', { length: 500 }), // staging preview URL
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Environment variables per environment

export const websiteEnvVars = pgTable('website_env_vars', {
  id: serial('id').primaryKey(),
  environmentId: integer('environment_id').notNull().references(() => websiteEnvironments.id, { onDelete: 'cascade' }),
  key: varchar('key', { length: 255 }).notNull(),
  value: text('value').notNull(),
  syncedToVercel: boolean('synced_to_vercel').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Point-in-time backups of environment state (env vars + settings)

export const websiteBackups = pgTable('website_backups', {
  id: serial('id').primaryKey(),
  environmentId: integer('environment_id').notNull().references(() => websiteEnvironments.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  snapshot: json('snapshot').$type<{
    envVars: Array<{ key: string; value: string }>;
    branding: Record<string, unknown> | null;
    navigation: Record<string, unknown> | null;
    storeSettings: Record<string, unknown> | null;
  }>().notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// HTTP request logs sent from client websites via middleware

export const httpRequestLogs = pgTable('http_request_logs', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  method: varchar('method', { length: 10 }).notNull(),
  path: varchar('path', { length: 2000 }).notNull(),
  statusCode: integer('status_code').notNull(),
  duration: integer('duration').notNull(), // ms
  userAgent: varchar('user_agent', { length: 500 }),
  referer: varchar('referer', { length: 500 }),
  ip: varchar('ip', { length: 45 }),
  country: varchar('country', { length: 2 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const hostedSites = pgTable('hosted_sites', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(), // internal label e.g. "Acme E-commerce"
  customDomain: varchar('custom_domain', { length: 255 }), // e.g. "shop.acmecorp.com"
  railwayProjectId: varchar('railway_project_id', { length: 255 }),
  railwayServiceId: varchar('railway_service_id', { length: 255 }),
  railwayEnvironmentId: varchar('railway_environment_id', { length: 255 }),
  railwayDomain: varchar('railway_domain', { length: 500 }), // e.g. "xxx.up.railway.app"
  status: varchar('status', { length: 50 }).default('provisioning').notNull(), // provisioning, active, suspended, cancelled
  plan: varchar('plan', { length: 50 }).default('starter').notNull(), // starter, pro, enterprise
  renewalDate: timestamp('renewal_date'),
  notes: text('notes'),
  dnsInstructions: json('dns_instructions').$type<DnsInstruction[]>().default([]),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── PITCH DECKS (Tools) ─────────────────────────────────────────────────────

export const googleWebsiteTokens = pgTable('google_website_tokens', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }).unique(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  // Search Console
  gscSiteUrl: varchar('gsc_site_url', { length: 500 }), // e.g. "https://example.com/"
  // Analytics
  gaPropertyId: varchar('ga_property_id', { length: 100 }), // e.g. "properties/123456"
  gaMeasurementId: varchar('ga_measurement_id', { length: 50 }), // e.g. "G-XXXXXXXXXX"
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── ECOMMERCE ───────────────────────────────────────────────────────────────

// Per-website store settings

// Per-item draft overlay. When set, the visual editor reads `draft.*`;
// the public renderer always ignores `draft` and reads the live columns.
// `nav_publish` copies draft → live and clears draft.
// `pendingDelete` is a tombstone — set when a delete is staged but not yet
// published; the renderer still shows the item until publish.
export interface SiteNavigationDraft {
  label?: string;
  href?: string;
  parentId?: number | null;
  sortOrder?: number;
  openInNewTab?: boolean;
  isButton?: boolean;
  description?: string | null;
  icon?: string | null;
  featuredImage?: string | null;
  columnGroup?: number | null;
  pendingDelete?: boolean;
  pendingCreate?: boolean;
  updatedAt?: string;
  updatedBy?: number;
}

export const siteNavigation = pgTable('site_navigation', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  label: varchar('label', { length: 255 }).notNull(),
  href: varchar('href', { length: 500 }).notNull(),
  parentId: integer('parent_id'),
  sortOrder: integer('sort_order').default(0).notNull(),
  openInNewTab: boolean('open_in_new_tab').default(false).notNull(),
  isButton: boolean('is_button').default(false).notNull(),
  // Mega menu fields
  description: text('description'),
  icon: varchar('icon', { length: 100 }),
  featuredImage: varchar('featured_image', { length: 500 }),
  columnGroup: integer('column_group'),
  draft: json('draft').$type<SiteNavigationDraft | null>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const siteBranding = pgTable('site_branding', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }).unique(),
  logoUrl: varchar('logo_url', { length: 500 }),
  logoAlt: varchar('logo_alt', { length: 255 }),
  primaryColor: varchar('primary_color', { length: 20 }).default('#2563eb'),
  secondaryColor: varchar('secondary_color', { length: 20 }).default('#1e40af'),
  accentColor: varchar('accent_color', { length: 20 }).default('#f59e0b'),
  backgroundColor: varchar('background_color', { length: 20 }).default('#ffffff'),
  textColor: varchar('text_color', { length: 20 }).default('#111827'),
  navTemplate: varchar('nav_template', { length: 50 }).default('classic'), // classic, centered, minimal, modern, transparent, mega
  navPosition: varchar('nav_position', { length: 20 }).default('top'), // top, left
  navBackground: varchar('nav_background', { length: 20 }).default('#ffffff'),
  navTextColor: varchar('nav_text_color', { length: 20 }).default('#111827'),
  // Fonts
  headingFont: varchar('heading_font', { length: 255 }),
  bodyFont: varchar('body_font', { length: 255 }),
  // Per-element typography: { h1: { font, size, weight, lineHeight, letterSpacing }, h2: ..., p: ..., etc. }
  typography: json('typography').$type<Record<string, { font?: string; size?: string; weight?: string; lineHeight?: string; letterSpacing?: string }>>(),
  // Logo variants
  logoSquareUrl: varchar('logo_square_url', { length: 500 }),
  logoRectUrl: varchar('logo_rect_url', { length: 500 }),
  logoText: varchar('logo_text', { length: 255 }),
  logoIconUrl: varchar('logo_icon_url', { length: 500 }),
  // Style
  borderRadius: varchar('border_radius', { length: 20 }).default('8px'),
  linkColor: varchar('link_color', { length: 20 }),
  linkHoverColor: varchar('link_hover_color', { length: 20 }),
  buttonStyle: json('button_style').$type<{
    primaryBg?: string; primaryText?: string; primaryHoverBg?: string;
    secondaryBg?: string; secondaryText?: string; secondaryHoverBg?: string;
    borderRadius?: string; variant?: 'filled' | 'outline';
  }>(),
  faviconUrl: varchar('favicon_url', { length: 500 }),
  ogImageUrl: varchar('og_image_url', { length: 500 }),
  // Dark mode overrides (colors + logos)
  darkMode: json('dark_mode').$type<{
    primaryColor?: string; secondaryColor?: string; accentColor?: string;
    backgroundColor?: string; textColor?: string;
    navBackground?: string; navTextColor?: string;
    logoUrl?: string; logoSquareUrl?: string; logoRectUrl?: string; logoIconUrl?: string;
  }>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Branding Profiles ──────────────────────────────────────────────────────

