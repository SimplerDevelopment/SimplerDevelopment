// Companies, contacts, pipelines, deals, proposals, contracts, and CRM-side custom fields.

import { pgTable, serial, varchar, text, timestamp, boolean, integer, json, numeric, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { clients } from './sites';

export const crmCompanies = pgTable('crm_companies', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  domain: varchar('domain', { length: 255 }),
  industry: varchar('industry', { length: 100 }),
  size: varchar('size', { length: 50 }), // 1-10, 11-50, 51-200, 201-500, 500+
  phone: varchar('phone', { length: 50 }),
  address: text('address'),
  website: varchar('website', { length: 500 }),
  logoUrl: varchar('logo_url', { length: 1000 }),
  notes: text('notes'),
  // GPS coordinates (WGS84). 7 decimal places ≈ 1cm precision.
  latitude: numeric('latitude', { precision: 10, scale: 7 }),
  longitude: numeric('longitude', { precision: 10, scale: 7 }),
  description: text('description'),
  revenue: varchar('revenue', { length: 100 }),
  employeeCount: integer('employee_count'),
  foundedYear: integer('founded_year'),
  linkedinUrl: varchar('linkedin_url', { length: 500 }),
  twitterUrl: varchar('twitter_url', { length: 500 }),
  facebookUrl: varchar('facebook_url', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const crmContacts = pgTable('crm_contacts', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  companyId: integer('company_id').references(() => crmCompanies.id, { onDelete: 'set null' }),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  linkedinUrl: varchar('linkedin_url', { length: 500 }),
  title: varchar('title', { length: 150 }), // job title
  source: varchar('source', { length: 100 }), // web, referral, cold-call, event, etc.
  status: varchar('status', { length: 50 }).default('active').notNull(), // active, inactive, lead, customer
  avatarUrl: varchar('avatar_url', { length: 500 }),
  address: text('address'),
  notes: text('notes'),
  lastContactedAt: timestamp('last_contacted_at'),
  ownerId: integer('owner_id').references(() => users.id, { onDelete: 'set null' }),
  score: integer('score').default(0).notNull(),
  seniority: varchar('seniority', { length: 100 }),
  department: varchar('department', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const crmPipelines = pgTable('crm_pipelines', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const crmPipelineStages = pgTable('crm_pipeline_stages', {
  id: serial('id').primaryKey(),
  pipelineId: integer('pipeline_id').notNull().references(() => crmPipelines.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  color: varchar('color', { length: 20 }).default('#6366f1'),
  sortOrder: integer('sort_order').default(0).notNull(),
  probability: integer('probability').default(0), // win probability percentage 0-100
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const crmDeals = pgTable('crm_deals', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  pipelineId: integer('pipeline_id').notNull().references(() => crmPipelines.id, { onDelete: 'cascade' }),
  stageId: integer('stage_id').notNull().references(() => crmPipelineStages.id, { onDelete: 'cascade' }),
  contactId: integer('contact_id').references(() => crmContacts.id, { onDelete: 'set null' }),
  companyId: integer('company_id').references(() => crmCompanies.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 255 }).notNull(),
  value: integer('value'), // in cents
  currency: varchar('currency', { length: 3 }).default('USD'),
  status: varchar('status', { length: 50 }).default('open').notNull(), // open, won, lost
  priority: varchar('priority', { length: 20 }).default('medium'), // low, medium, high
  expectedCloseDate: timestamp('expected_close_date'),
  closedAt: timestamp('closed_at'),
  notes: text('notes'),
  sortOrder: integer('sort_order').default(0).notNull(),
  recurringValue: integer('recurring_value'), // monthly recurring value in cents
  billingCycle: varchar('billing_cycle', { length: 20 }), // 'monthly' | 'quarterly' | 'annual' | 'one-time'
  ownerId: integer('owner_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const crmActivities = pgTable('crm_activities', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  contactId: integer('contact_id').references(() => crmContacts.id, { onDelete: 'cascade' }),
  dealId: integer('deal_id').references(() => crmDeals.id, { onDelete: 'cascade' }),
  companyId: integer('company_id').references(() => crmCompanies.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(), // call, email, meeting, note, task
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  dueDate: timestamp('due_date'),
  completedAt: timestamp('completed_at'),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  viaUserId: integer('via_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const crmTags = pgTable('crm_tags', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  color: varchar('color', { length: 20 }).default('#6366f1'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const crmContactTags = pgTable('crm_contact_tags', {
  id: serial('id').primaryKey(),
  contactId: integer('contact_id').notNull().references(() => crmContacts.id, { onDelete: 'cascade' }),
  tagId: integer('tag_id').notNull().references(() => crmTags.id, { onDelete: 'cascade' }),
});

// ─── CRM PROPOSALS ───────────────────────────────────────────────────────────

export interface ProposalSection {
  id: string;
  type: 'text' | 'heading' | 'image' | 'divider' | 'pricing' | 'terms' | 'signature';
  title?: string;
  content?: string; // HTML or markdown
  imageUrl?: string;
}

export interface ProposalLineItem {
  id: string;
  description: string;
  details?: string;
  quantity: number;
  unitPrice: number; // cents
  optional?: boolean;
  accepted?: boolean; // for optional items — client can toggle
}

export interface ProposalFee {
  label: string; // e.g. "Discount", "Tax"
  type: 'flat' | 'percent';
  amount: number; // cents for flat, basis points for percent (e.g. 1000 = 10%)
}

export const crmProposals = pgTable('crm_proposals', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  contactId: integer('contact_id').references(() => crmContacts.id, { onDelete: 'set null' }),
  companyId: integer('company_id').references(() => crmCompanies.id, { onDelete: 'set null' }),
  dealId: integer('deal_id').references(() => crmDeals.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 255 }).notNull(),
  summary: text('summary'), // brief intro shown at top
  status: varchar('status', { length: 50 }).default('draft').notNull(), // draft, sent, viewed, accepted, declined, expired
  sections: json('sections').$type<ProposalSection[]>().default([]),
  lineItems: json('line_items').$type<ProposalLineItem[]>().default([]),
  fees: json('fees').$type<ProposalFee[]>().default([]),
  currency: varchar('currency', { length: 3 }).default('USD'),
  validUntil: timestamp('valid_until'),
  // Client-facing access
  clientToken: varchar('client_token', { length: 64 }).notNull().unique(), // secret URL token
  // Signature
  signatureName: varchar('signature_name', { length: 255 }),
  signatureData: text('signature_data'), // base64 PNG or SVG path
  signedAt: timestamp('signed_at'),
  signedIp: varchar('signed_ip', { length: 45 }),
  // Tracking
  sentAt: timestamp('sent_at'),
  firstViewedAt: timestamp('first_viewed_at'),
  lastViewedAt: timestamp('last_viewed_at'),
  viewCount: integer('view_count').default(0).notNull(),
  acceptedAt: timestamp('accepted_at'),
  declinedAt: timestamp('declined_at'),
  declineReason: text('decline_reason'),
  // Branding
  accentColor: varchar('accent_color', { length: 20 }).default('#2563eb'),
  logoUrl: varchar('logo_url', { length: 500 }),
  coverImageUrl: varchar('cover_image_url', { length: 500 }),
  footerText: text('footer_text'),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const crmProposalTemplates = pgTable('crm_proposal_templates', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  sections: json('sections').$type<ProposalSection[]>().default([]),
  lineItems: json('line_items').$type<ProposalLineItem[]>().default([]),
  fees: json('fees').$type<ProposalFee[]>().default([]),
  accentColor: varchar('accent_color', { length: 20 }).default('#2563eb'),
  footerText: text('footer_text'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── CONTRACTS & E-SIGNATURES ─────────────────────────────────────────────────

export interface ContractClause {
  id: string;
  title: string;
  content: string; // HTML or markdown
  required: boolean; // must be explicitly accepted
}

export interface ContractEsignWebhookEvent {
  eventType: string;
  receivedAt: string; // ISO timestamp
  signatureRequestId?: string | null;
  signatureId?: string | null;
}

export const crmContracts = pgTable('crm_contracts', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  proposalId: integer('proposal_id').references(() => crmProposals.id, { onDelete: 'set null' }),
  dealId: integer('deal_id').references(() => crmDeals.id, { onDelete: 'set null' }),
  contactId: integer('contact_id').references(() => crmContacts.id, { onDelete: 'set null' }),
  companyId: integer('company_id').references(() => crmCompanies.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 255 }).notNull(),
  summary: text('summary'),
  status: varchar('status', { length: 30 }).default('draft').notNull(), // draft, sent, partially_signed, fully_executed, voided, expired
  clauses: json('clauses').$type<ContractClause[]>().default([]),
  lineItems: json('line_items').$type<ProposalLineItem[]>().default([]),
  fees: json('fees').$type<ProposalFee[]>().default([]),
  currency: varchar('currency', { length: 3 }).default('USD'),
  validUntil: timestamp('valid_until'),
  clientToken: varchar('client_token', { length: 64 }).notNull().unique(),
  documentHash: varchar('document_hash', { length: 64 }), // SHA-256 of content at send time for tamper detection
  // Branding
  accentColor: varchar('accent_color', { length: 20 }).default('#2563eb'),
  logoUrl: varchar('logo_url', { length: 500 }),
  footerText: text('footer_text'),
  // Tracking
  sentAt: timestamp('sent_at'),
  fullyExecutedAt: timestamp('fully_executed_at'),
  voidedAt: timestamp('voided_at'),
  voidReason: text('void_reason'),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  // E-signature provider integration (DropboxSign, future-proofed for swaps)
  esignProvider: varchar('esign_provider', { length: 20 }), // 'dropboxsign' | null
  esignProviderRequestId: varchar('esign_provider_request_id', { length: 255 }),
  esignSignerEmail: varchar('esign_signer_email', { length: 255 }),
  esignSignerName: varchar('esign_signer_name', { length: 255 }),
  esignStatus: varchar('esign_status', { length: 20 }).default('not_sent'), // 'not_sent' | 'sent' | 'viewed' | 'signed' | 'declined' | 'canceled'
  esignSentAt: timestamp('esign_sent_at'),
  esignSignedAt: timestamp('esign_signed_at'),
  esignDeclinedAt: timestamp('esign_declined_at'),
  esignAuditFileUrl: text('esign_audit_file_url'), // link to the signed PDF / audit trail
  esignWebhookEvents: json('esign_webhook_events').$type<ContractEsignWebhookEvent[]>().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const crmContractSigningEvents = pgTable('crm_contract_signing_events', {
  id: serial('id').primaryKey(),
  contractId: integer('contract_id').notNull().references(() => crmContracts.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 50 }).notNull(), // 'sent' | 'opened' | 'viewed' | 'signed' | 'declined' | 'canceled' | 'webhook'
  actorEmail: varchar('actor_email', { length: 255 }),
  payload: json('payload').$type<Record<string, unknown>>().default({}),
  occurredAt: timestamp('occurred_at').defaultNow().notNull(),
});

export const crmContractSigners = pgTable('crm_contract_signers', {
  id: serial('id').primaryKey(),
  contractId: integer('contract_id').notNull().references(() => crmContracts.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  role: varchar('role', { length: 100 }).default('signer').notNull(), // signer, witness, approver
  order: integer('order').default(0).notNull(), // signing order (0 = any order)
  token: varchar('token', { length: 64 }).notNull().unique(), // unique per-signer signing link
  status: varchar('status', { length: 20 }).default('pending').notNull(), // pending, viewed, signed, declined
  signatureName: varchar('signature_name', { length: 255 }),
  signatureData: text('signature_data'), // base64 PNG
  signedAt: timestamp('signed_at'),
  signedIp: varchar('signed_ip', { length: 45 }),
  viewedAt: timestamp('viewed_at'),
  declinedAt: timestamp('declined_at'),
  declineReason: text('decline_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const crmContractTemplates = pgTable('crm_contract_templates', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  clauses: json('clauses').$type<ContractClause[]>().default([]),
  lineItems: json('line_items').$type<ProposalLineItem[]>().default([]),
  fees: json('fees').$type<ProposalFee[]>().default([]),
  accentColor: varchar('accent_color', { length: 20 }).default('#2563eb'),
  footerText: text('footer_text'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── CRM NOTIFICATIONS ──────────────────────────────────────────────────────

export const crmNotifications = pgTable('crm_notifications', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(), // 'deal_stage_changed', 'proposal_viewed', 'proposal_signed', 'mention', 'deal_assigned', 'contact_created'
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body'),
  entityType: varchar('entity_type', { length: 20 }), // 'deal', 'contact', 'proposal', 'contract'
  entityId: integer('entity_id'),
  read: boolean('read').default(false).notNull(),
  // When `digest: true`, the row was created under a `digest_daily` preference
  // — a future digest cron should batch these into a single email and exclude
  // them from the live notification panel.
  metadata: json('metadata').$type<{ digest?: boolean } & Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── NOTIFICATION PREFERENCES ───────────────────────────────────────────────
// Per-user, per-tenant, per-notification-type delivery preference. Absence of
// a row is treated as `instant` (all-on) so adoption is non-breaking.

export const NOTIFICATION_TYPES = [
  'mention',
  'deal_stage_changed',
  'deal_assigned',
  'deal_stale',
  'contact_created',
  'proposal_viewed',
  'document_comment_mention',
  'task_assigned',
  'task_due_soon',
  'ticket_assigned',
  'ticket_status_changed',
  'automation_failing',
  'survey_zero_responses',
  'booking_hold_stuck',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationDelivery = 'instant' | 'digest_daily' | 'off';

export const NOTIFICATION_DELIVERIES: readonly NotificationDelivery[] = [
  'instant',
  'digest_daily',
  'off',
] as const;

export const notificationPreferences = pgTable('notification_preferences', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  notificationType: varchar('notification_type', { length: 64 }).notNull(),
  delivery: varchar('delivery', { length: 16 }).$type<NotificationDelivery>().default('instant').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('notification_preferences_client_user_type_idx').on(t.clientId, t.userId, t.notificationType),
]);

// ─── AUTOMATION ENGINE ────────────────────────────────────────────────────────

export const crmDealArtifacts = pgTable('crm_deal_artifacts', {
  id: serial('id').primaryKey(),
  dealId: integer('deal_id').notNull().references(() => crmDeals.id, { onDelete: 'cascade' }),
  artifactType: varchar('artifact_type', { length: 50 }).notNull(), // website, email_campaign, pitch_deck, proposal, booking, survey, project
  artifactId: integer('artifact_id').notNull(),
  displayTitle: varchar('display_title', { length: 255 }).notNull(),
  pinned: boolean('pinned').default(false).notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const crmDealComments = pgTable('crm_deal_comments', {
  id: serial('id').primaryKey(),
  dealId: integer('deal_id').notNull().references(() => crmDeals.id, { onDelete: 'cascade' }),
  authorId: integer('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body: text('body').notNull(), // supports @mentions as @[name](userId)
  attachments: json('attachments').$type<{ url: string; filename: string; mimeType: string; fileSize: number }[]>().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const crmCustomFields = pgTable('crm_custom_fields', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  entityType: varchar('entity_type', { length: 20 }).notNull(), // 'contact' | 'company' | 'deal'
  fieldName: varchar('field_name', { length: 100 }).notNull(),
  fieldType: varchar('field_type', { length: 20 }).notNull(), // 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'url' | 'email' | 'phone' | 'boolean'
  options: json('options').$type<string[]>(), // for select/multiselect types
  required: boolean('required').default(false).notNull(),
  filterable: boolean('filterable').default(false).notNull(), // shown as a filter dropdown on list pages
  category: varchar('category', { length: 100 }), // groups fields into tabs in the record view (null → "General")
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const crmCustomFieldValues = pgTable('crm_custom_field_values', {
  id: serial('id').primaryKey(),
  customFieldId: integer('custom_field_id').notNull().references(() => crmCustomFields.id, { onDelete: 'cascade' }),
  entityId: integer('entity_id').notNull(),
  entityType: varchar('entity_type', { length: 20 }).notNull(),
  value: text('value'), // stored as text, parsed by fieldType
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  // Required for the route handler's onConflictDoUpdate upsert (see
  // app/api/portal/crm/custom-fields/values/route.ts PUT). Without this
  // unique index, a non-empty values map raises 23P10.
  uniqueIndex('crm_custom_field_values_unique_idx').on(t.customFieldId, t.entityId, t.entityType),
]);

export const crmScoringRules = pgTable('crm_scoring_rules', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  eventType: varchar('event_type', { length: 50 }).notNull(), // 'form_submitted', 'booking_made', 'email_opened', 'proposal_viewed', 'deal_created', 'meeting_completed', 'page_visited'
  points: integer('points').notNull(),
  description: varchar('description', { length: 255 }),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Portal-user-scoped API keys for MCP server / programmatic access.
// Distinct from `apiKeys` which is public/read-only and tied to a single website.

export const crmSavedViews = pgTable('crm_saved_views', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  entityType: varchar('entity_type', { length: 20 }).notNull(), // 'contact' | 'company' | 'deal'
  name: varchar('name', { length: 100 }).notNull(),
  filters: json('filters').$type<Record<string, string>>().notNull(), // { status: 'lead', tag: '5', ownerId: '3', search: 'john' }
  isDefault: boolean('is_default').default(false).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- CRM Enrichment ---------------------------------------------------------------

export const crmEnrichmentConfig = pgTable('crm_enrichment_config', {
  clientId: integer('client_id').primaryKey().references(() => clients.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').default(false).notNull(),
  keySource: varchar('key_source', { length: 20 }).default('platform').notNull(), // 'platform' | 'own'
  ownApiKey: varchar('own_api_key', { length: 500 }), // TODO: encrypt before storing in production
  platformCreditBalance: integer('platform_credit_balance').default(0).notNull(),
  costPerEnrichment: integer('cost_per_enrichment').default(1).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const crmEnrichmentLog = pgTable('crm_enrichment_log', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  entityType: varchar('entity_type', { length: 20 }).notNull(), // 'contact' | 'company'
  entityId: integer('entity_id').notNull(),
  provider: varchar('provider', { length: 50 }).notNull(), // 'scrape' | 'apollo'
  fieldsPopulated: json('fields_populated').$type<string[]>().default([]),
  fieldChanges: json('field_changes').$type<Record<string, { from: unknown; to: unknown }>>().default({}),
  cost: integer('cost').default(0).notNull(), // credits consumed (0 for free scrape)
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── COMPANY BRAIN ────────────────────────────────────────────────────────────
// Per-client business intelligence layer. Phase 0 ships the profile/config row
// only; meeting + review tables follow in Phase 2.

