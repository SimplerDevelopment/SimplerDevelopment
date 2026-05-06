// Company Brain: meetings, AI-extracted review items, relationships, notes, and the automation engine.

import { pgTable, serial, varchar, text, timestamp, boolean, integer, json, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { clients } from './sites';
import { crmCompanies, crmContacts, crmDeals } from './crm';
import { kanbanCards } from './pm';

export interface AutomationTrigger {
  event: string; // e.g. 'booking.created', 'crm.deal.updated', 'form.submitted'
  filters?: Record<string, unknown>; // optional field-level filters, e.g. { status: 'confirmed' }
}

export interface AutomationCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt' | 'exists' | 'not_exists';
  value?: unknown;
}

export interface AutomationAction {
  tool: string; // maps to executePortalTool name, e.g. 'create_support_ticket'
  params: Record<string, unknown>; // static params + {{event.field}} template vars
  delay?: number; // delay in seconds before executing (0 = immediate)
}

export const automationRules = pgTable('automation_rules', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'), // NLP original text or user description
  trigger: json('trigger').$type<AutomationTrigger>().notNull(),
  conditions: json('conditions').$type<AutomationCondition[]>().default([]),
  actions: json('actions').$type<AutomationAction[]>().notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  source: varchar('source', { length: 20 }).default('nlp').notNull(), // 'nlp' | 'settings' | 'manual'
  productScope: varchar('product_scope', { length: 50 }), // null = cross-product, or 'booking', 'email', 'crm', etc.
  executionCount: integer('execution_count').default(0).notNull(),
  lastExecutedAt: timestamp('last_executed_at'),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── SURVEYS ────────────────────────────────────────────────────────────────

export const automationLogs = pgTable('automation_logs', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  ruleId: integer('rule_id').notNull().references(() => automationRules.id, { onDelete: 'cascade' }),
  triggerEvent: varchar('trigger_event', { length: 100 }).notNull(),
  triggerPayload: json('trigger_payload').$type<Record<string, unknown>>(),
  actionsExecuted: json('actions_executed').$type<{ tool: string; params: Record<string, unknown>; result: unknown; error?: string }[]>().default([]),
  status: varchar('status', { length: 20 }).default('success').notNull(), // 'success' | 'partial' | 'failed'
  duration: integer('duration'), // ms
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export interface BrainEnabledModules {
  meetings: boolean;
  tasks: boolean;
  prospects: boolean;
  knowledge: boolean;
  ask: boolean;
  automations: boolean;
  calendar: boolean;
}

export const brainProfiles = pgTable('brain_profiles', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }).unique(),
  name: varchar('name', { length: 255 }).notNull(),
  industryTemplate: varchar('industry_template', { length: 50 }).default('generic').notNull(), // 'generic' | 'wealth_advisory' | …
  enabled: boolean('enabled').default(false).notNull(),
  defaultConfidentiality: varchar('default_confidentiality', { length: 20 }).default('standard').notNull(), // 'standard' | 'restricted' | 'confidential'
  aiProvider: varchar('ai_provider', { length: 50 }).default('anthropic').notNull(),
  embeddingProvider: varchar('embedding_provider', { length: 50 }), // null = embeddings disabled
  enabledModules: json('enabled_modules').$type<BrainEnabledModules>().default({
    meetings: true,
    tasks: true,
    prospects: false,
    knowledge: true,
    ask: false,
    automations: true,
    calendar: true,
  }).notNull(),
  serviceLines: json('service_lines').$type<string[]>().default([]).notNull(),
  // Per-tenant token for the inbound email gateway. Inbound mail at
  // `brain+<token>@simplerdevelopment.com` is routed to this profile. Treat
  // as a shared secret — rotate to revoke external sender access.
  emailIngestToken: varchar('email_ingest_token', { length: 64 }),
  // When true, inbound brain emails skip the manual Process step — the AI
  // pipeline (attachment analysis, link OG previews, transcript summary)
  // runs automatically as the meeting is created.
  autoProcessEmail: boolean('auto_process_email').default(false).notNull(),
  // When true, the brain pipeline runs an additional CRM-classification step
  // after transcript AI: upserts the sender as a crm_contact, links the
  // meeting to a crm_company on unambiguous domain match, and proposes
  // contact classification / deal links / brain-aware action items via the
  // brain_ai_review_items queue.
  autoLinkCrm: boolean('auto_link_crm').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Meeting status: draft → processing → needs_review → approved (terminal)

export type BrainMeetingStatus = 'draft' | 'processing' | 'needs_review' | 'approved';

export const brainMeetings = pgTable('brain_meetings', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  // Phase 2 keeps relationships informal; FK to crm_companies/crm_deals lands in Phase 1.
  companyId: integer('company_id').references(() => crmCompanies.id, { onDelete: 'set null' }),
  dealId: integer('deal_id').references(() => crmDeals.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 255 }).notNull(),
  meetingDate: timestamp('meeting_date'),
  transcript: text('transcript'),
  aiSummary: text('ai_summary'),
  humanSummary: text('human_summary'),
  status: varchar('status', { length: 20 }).$type<BrainMeetingStatus>().default('draft').notNull(),
  reviewedBy: integer('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at'),
  confidentialityLevel: varchar('confidentiality_level', { length: 20 }).default('standard').notNull(),
  source: varchar('source', { length: 50 }).default('paste').notNull(), // 'paste' | 'upload' | 'google_doc' | 'google_drive_watch' | 'google_meet_recording' | 'zoom'
  sourceRef: varchar('source_ref', { length: 500 }).notNull(), // adapter-supplied dedupe key; (clientId, sourceRef) unique
  sourceMetadata: json('source_metadata').$type<Record<string, unknown>>().default({}),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [uniqueIndex('brain_meetings_client_source_ref_idx').on(t.clientId, t.sourceRef)]);

export const brainMeetingParticipants = pgTable('brain_meeting_participants', {
  id: serial('id').primaryKey(),
  meetingId: integer('meeting_id').notNull().references(() => brainMeetings.id, { onDelete: 'cascade' }),
  contactId: integer('contact_id').references(() => crmContacts.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  roleInMeeting: varchar('role_in_meeting', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type BrainTaskStatus = 'open' | 'in_progress' | 'blocked' | 'done';

export const brainTasks = pgTable('brain_tasks', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  meetingId: integer('meeting_id').references(() => brainMeetings.id, { onDelete: 'set null' }),
  // Optional CRM-relationship link. At most one of (companyId, dealId) is non-null in practice.
  companyId: integer('company_id').references(() => crmCompanies.id, { onDelete: 'set null' }),
  dealId: integer('deal_id').references(() => crmDeals.id, { onDelete: 'set null' }),
  // Phase 3 promotion target.
  linkedKanbanCardId: integer('linked_kanban_card_id').references(() => kanbanCards.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  ownerId: integer('owner_id').references(() => users.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 20 }).$type<BrainTaskStatus>().default('open').notNull(),
  priority: varchar('priority', { length: 20 }).default('medium').notNull(), // low | medium | high | urgent
  dueDate: timestamp('due_date'),
  blockedReason: text('blocked_reason'),
  source: varchar('source', { length: 50 }).default('manual').notNull(), // 'manual' | 'meeting' | 'ai_suggestion'
  createdByAi: boolean('created_by_ai').default(false).notNull(),
  needsReview: boolean('needs_review').default(false).notNull(),
  complianceFlag: boolean('compliance_flag').default(false).notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// What kind of record an AI proposal would become if approved.

export type BrainReviewItemType =
  | 'task'
  | 'note'
  | 'decision'
  | 'commitment'
  | 'relationship_update'
  | 'follow_up'
  | 'compliance_warning'
  // CRM-linkage proposals (created by the brain → CRM auto-linking step;
  // see lib/brain/classify-crm.ts). Approval mutates CRM rows directly.
  | 'crm_contact_classify'
  | 'crm_deal_link'
  | 'crm_deal_create'
  | 'crm_company_link'
  | 'crm_company_create';

export type BrainReviewItemStatus = 'pending' | 'approved' | 'rejected' | 'edited';

export interface BrainReviewItemTaskPayload {
  title: string;
  description?: string;
  ownerHint?: string;     // free-form; AI guess at owner
  ownerEmail?: string;
  dueDate?: string;       // ISO
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  complianceFlag?: boolean;
  // Set by classify-crm when an action item was surfaced via brain context
  // (rather than the transcript alone). Free-form pointer like
  // "Follow-up on brain_task #42 (2026-03-10 — Send Q2 proposal to Acme)".
  relatesToBrainHit?: string;
}

export interface BrainReviewItemDecisionPayload { title: string; details?: string; }

export interface BrainReviewItemCommitmentPayload { who: string; what: string; when?: string; }

export interface BrainReviewItemRelationshipUpdatePayload { field: string; value: string; rationale?: string; }

export interface BrainReviewItemNotePayload { title?: string; body: string; tags?: string[]; }

export interface BrainReviewItemComplianceWarningPayload { message: string; severity?: 'low' | 'medium' | 'high'; }

// CRM-linkage proposal payloads. Approval handlers in lib/brain/review.ts
// mutate the relevant CRM table and (where appropriate) link the meeting.

export interface BrainReviewItemCrmContactClassifyPayload {
  contactId: number;                                  // existing crm_contacts.id (auto-upserted on ingest)
  proposedStatus?: 'active' | 'inactive' | 'lead' | 'customer';
  proposedSeniority?: string;
  proposedDepartment?: string;
  proposedTitle?: string;
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
}

export interface BrainReviewItemCrmDealLinkPayload {
  dealId: number;                                     // existing crm_deals.id
  rationale: string;
}

export interface BrainReviewItemCrmDealCreatePayload {
  title: string;
  contactId?: number;
  companyId?: number;
  value?: number;                                     // cents
  currency?: string;
  priority?: 'low' | 'medium' | 'high';
  expectedCloseDate?: string;                         // ISO
  rationale: string;
}

export interface BrainReviewItemCrmCompanyLinkPayload {
  companyId: number;                                  // existing crm_companies.id
  rationale: string;
  // When the sender's domain matched multiple companies, list all candidates
  // so the reviewer can pick the right one in the UI.
  candidateCompanyIds?: number[];
}

export interface BrainReviewItemCrmCompanyCreatePayload {
  name: string;
  domain?: string;
  website?: string;
  industry?: string;
  rationale: string;
}

export type BrainReviewItemPayload =
  | BrainReviewItemTaskPayload
  | BrainReviewItemDecisionPayload
  | BrainReviewItemCommitmentPayload
  | BrainReviewItemRelationshipUpdatePayload
  | BrainReviewItemNotePayload
  | BrainReviewItemComplianceWarningPayload
  | BrainReviewItemCrmContactClassifyPayload
  | BrainReviewItemCrmDealLinkPayload
  | BrainReviewItemCrmDealCreatePayload
  | BrainReviewItemCrmCompanyLinkPayload
  | BrainReviewItemCrmCompanyCreatePayload
  | Record<string, unknown>;

export const brainAiReviewItems = pgTable('brain_ai_review_items', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  sourceType: varchar('source_type', { length: 50 }).notNull(), // 'meeting' | 'document' | 'manual'
  sourceId: integer('source_id').notNull(),
  proposedType: varchar('proposed_type', { length: 50 }).$type<BrainReviewItemType>().notNull(),
  proposedPayload: json('proposed_payload').$type<BrainReviewItemPayload>().notNull(),
  status: varchar('status', { length: 20 }).$type<BrainReviewItemStatus>().default('pending').notNull(),
  reviewedBy: integer('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at'),
  resultEntityType: varchar('result_entity_type', { length: 50 }), // 'brain_task' | 'brain_note' | …  (set on approve)
  resultEntityId: integer('result_entity_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type BrainAiJobType = 'process_meeting' | 'embed' | 'summarize_doc' | 'crm_classify';

export type BrainAiJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export const brainAiJobs = pgTable('brain_ai_jobs', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  jobType: varchar('job_type', { length: 50 }).$type<BrainAiJobType>().notNull(),
  status: varchar('status', { length: 20 }).$type<BrainAiJobStatus>().default('queued').notNull(),
  input: json('input').$type<Record<string, unknown>>().default({}),
  output: json('output').$type<Record<string, unknown>>().default({}),
  error: text('error'),
  inputTokens: integer('input_tokens').default(0).notNull(),
  outputTokens: integer('output_tokens').default(0).notNull(),
  creditsCharged: integer('credits_charged').default(0).notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
});

export const brainAuditLogs = pgTable('brain_audit_logs', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  actorId: integer('actor_id').references(() => users.id, { onDelete: 'set null' }), // null = AI / system
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 50 }),
  entityId: integer('entity_id'),
  metadata: json('metadata').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type BrainRelationshipPriority = 'low' | 'medium' | 'high' | 'critical';

export type BrainRelationshipStatus = 'active' | 'paused' | 'archived';

/**
 * Phase 1 — overlay pattern. A `brain_relationship_overlays` row attaches
 * Brain-only fields (priorities, open loops, next-review, confidentiality,
 * compliance flags, stale-after) to an existing CRM company OR deal. Exactly
 * one of (companyId, dealId) is non-null per row, enforced at the app layer
 * and via partial unique indexes.
 */

export const brainRelationshipOverlays = pgTable('brain_relationship_overlays', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  companyId: integer('company_id').references(() => crmCompanies.id, { onDelete: 'cascade' }),
  dealId: integer('deal_id').references(() => crmDeals.id, { onDelete: 'cascade' }),
  relationshipType: varchar('relationship_type', { length: 50 }).default('generic').notNull(),
  status: varchar('status', { length: 20 }).$type<BrainRelationshipStatus>().default('active').notNull(),
  ownerId: integer('owner_id').references(() => users.id, { onDelete: 'set null' }),
  secondaryOwnerId: integer('secondary_owner_id').references(() => users.id, { onDelete: 'set null' }),
  priority: varchar('priority', { length: 20 }).$type<BrainRelationshipPriority>().default('medium').notNull(),
  serviceLines: json('service_lines').$type<string[]>().default([]).notNull(),
  summary: text('summary'),
  currentPriorities: text('current_priorities'),
  openLoops: text('open_loops'),
  lastTouchAt: timestamp('last_touch_at'),
  nextReviewAt: timestamp('next_review_at'),
  confidentialityLevel: varchar('confidentiality_level', { length: 20 }).default('standard').notNull(),
  complianceFlags: json('compliance_flags').$type<string[]>().default([]).notNull(),
  sourceSystem: varchar('source_system', { length: 100 }),
  externalUrl: varchar('external_url', { length: 1000 }),
  staleAfterDays: integer('stale_after_days'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── BRAIN KNOWLEDGE ─────────────────────────────────────────────────────────
// Free-form notes/documents linked to relationships, deals, contacts, or
// meetings. Body is plain text (markdown). Confidentiality inherits from the
// brain profile default at creation time and may be tightened per note.

export const brainNotes = pgTable('brain_notes', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body').default('').notNull(),
  // Optional anchors to other brain/CRM records. At most one of these is
  // typically set, but multiple are allowed (e.g. a note about a deal that
  // also references the underlying company).
  meetingId: integer('meeting_id').references(() => brainMeetings.id, { onDelete: 'set null' }),
  relationshipOverlayId: integer('relationship_overlay_id').references(() => brainRelationshipOverlays.id, { onDelete: 'set null' }),
  companyId: integer('company_id').references(() => crmCompanies.id, { onDelete: 'set null' }),
  dealId: integer('deal_id').references(() => crmDeals.id, { onDelete: 'set null' }),
  contactId: integer('contact_id').references(() => crmContacts.id, { onDelete: 'set null' }),
  tags: json('tags').$type<string[]>().default([]).notNull(),
  confidentialityLevel: varchar('confidentiality_level', { length: 20 }).default('standard').notNull(),
  pinned: boolean('pinned').default(false).notNull(),
  // Provenance — 'manual' for user-authored, 'ai_review' when promoted from a
  // brain_ai_review_items row of type 'note', 'document_import' for future
  // upload pipelines.
  source: varchar('source', { length: 50 }).default('manual').notNull(),
  reviewItemId: integer('review_item_id').references(() => brainAiReviewItems.id, { onDelete: 'set null' }),
  // Where this note's content originally came from — set for AI-driven web
  // crawls and document imports. Lets MCP clients dedupe before re-ingesting
  // the same URL ("does a note already exist for https://docs.example.com/x?").
  sourceUrl: varchar('source_url', { length: 1000 }),
  // Optional file attachment. When set, the note is "file-based" — the body
  // typically holds commentary about the file. Files are stored in S3 via
  // lib/s3/upload; the URL is a proxy path like `/api/media/proxy/<key>`.
  // attachmentStoredKey is kept so DELETE can clean up the S3 object.
  attachmentUrl: varchar('attachment_url', { length: 1000 }),
  attachmentFilename: varchar('attachment_filename', { length: 500 }),
  attachmentMimeType: varchar('attachment_mime_type', { length: 200 }),
  attachmentFileSize: integer('attachment_file_size'),
  attachmentStoredKey: varchar('attachment_stored_key', { length: 500 }),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

// Brain note templates — reusable note bodies a tenant can apply manually, via
// slash command, on a daily cron, or auto-attached to a new meeting. Bodies
// are markdown with `{{variables}}` resolved by lib/brain/template.ts. The
// daily-note cron (app/api/cron/brain-daily-notes) materializes one
// brain_notes row per (template.id, YYYY-MM-DD) using
// `source_url = 'daily://<templateId>/<YYYY-MM-DD>'` as its idempotency key.

export type BrainNoteTemplateTrigger = 'manual' | 'daily' | 'meeting' | 'slash';

export const brainNoteTemplates = pgTable('brain_note_templates', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 150 }).notNull(),
  body: text('body').notNull(),
  trigger: varchar('trigger', { length: 50 }).$type<BrainNoteTemplateTrigger>().default('manual').notNull(),
  // Variable names this template references — used as UI hints only; the
  // template engine re-parses the body on apply.
  variables: json('variables').$type<string[]>(),
  enabled: boolean('enabled').default(true).notNull(),
  // Tags pre-attached to notes created from this template. Merged with any
  // call-site tags (e.g. the daily cron always adds 'daily').
  defaultTags: json('default_tags').$type<string[]>(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [uniqueIndex('brain_note_templates_client_name_idx').on(t.clientId, t.name)]);

// Brain custom fields — same shape as crm_custom_fields/values but a separate
// table pair so Brain and CRM custom-field admin/lifecycles stay decoupled.
// `source` distinguishes user-created defs from auto-derived ones (importers
// can create defs for unknown frontmatter keys without polluting the manual
// definition list).

export const brainCustomFields = pgTable('brain_custom_fields', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  entityType: varchar('entity_type', { length: 20 }).notNull(), // 'note' | 'meeting' | 'relationship'
  fieldName: varchar('field_name', { length: 100 }).notNull(),
  fieldLabel: varchar('field_label', { length: 150 }),
  fieldType: varchar('field_type', { length: 20 }).notNull(), // 'text'|'number'|'date'|'datetime'|'url'|'email'|'select'|'multiselect'|'tags'|'boolean'|'json'
  options: json('options').$type<string[]>(),
  required: boolean('required').default(false).notNull(),
  filterable: boolean('filterable').default(false).notNull(),
  category: varchar('category', { length: 100 }),
  sortOrder: integer('sort_order').default(0).notNull(),
  source: varchar('source', { length: 50 }).default('manual').notNull(), // 'manual' | 'auto-derived'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const brainCustomFieldValues = pgTable('brain_custom_field_values', {
  id: serial('id').primaryKey(),
  customFieldId: integer('custom_field_id').notNull().references(() => brainCustomFields.id, { onDelete: 'cascade' }),
  entityType: varchar('entity_type', { length: 20 }).notNull(),
  entityId: integer('entity_id').notNull(),
  value: text('value'), // stored as text, parsed by fieldType
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Embedding job queue. Write paths enqueue here, a cron worker drains it.
// Idempotent on (entity_type, entity_id) via the unique index — re-enqueues
// while a job is processing just reset it to pending.

export const brainEmbeddingJobs = pgTable('brain_embedding_jobs', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: integer('entity_id').notNull(),
  status: varchar('status', { length: 20 }).default('pending').notNull(), // 'pending' | 'processing' | 'failed'
  attempts: integer('attempts').default(0).notNull(),
  lastError: text('last_error'),
  enqueuedAt: timestamp('enqueued_at').defaultNow().notNull(),
  startedAt: timestamp('started_at'),
});

// Obsidian-style link graph for KB-imported notes. Each row is one [[link]]
// or ![[embed]] found in a source note; backlinks come for free by querying
// the same table the other way. to_note_id is nullable for orphaned targets
// (Obsidian permits links to non-existent notes).

export const brainKbLinks = pgTable('brain_kb_links', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  fromNoteId: integer('from_note_id').notNull().references(() => brainNotes.id, { onDelete: 'cascade' }),
  toNoteId: integer('to_note_id').references(() => brainNotes.id, { onDelete: 'set null' }),
  rawTarget: varchar('raw_target', { length: 500 }).notNull(),
  anchor: varchar('anchor', { length: 255 }),
  displayText: varchar('display_text', { length: 500 }),
  linkType: varchar('link_type', { length: 20 }).default('wikilink').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── BRAIN CALENDAR ──────────────────────────────────────────────────────────
// Free-form scheduled items distinct from tasks (which have due dates) and
// meetings (which are records of past communications). Used to schedule things
// to happen on specific days. Phase C of the calendar feature will sync these
// bidirectionally with Google Calendar via the workspace OAuth scaffold; for
// now everything is `source = 'manual'` and `googleEventId` stays null.

export type BrainCalendarEventSource = 'manual' | 'google';

export const brainCalendarEvents = pgTable('brain_calendar_events', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  startAt: timestamp('start_at').notNull(),
  endAt: timestamp('end_at').notNull(),
  allDay: boolean('all_day').default(false).notNull(),
  timezone: varchar('timezone', { length: 100 }).default('UTC').notNull(),
  location: varchar('location', { length: 500 }),
  link: varchar('link', { length: 1000 }),
  // Optional anchors. A scheduled event might be "follow up on this task by
  // Friday" or "review session for this relationship next month".
  relatedTaskId: integer('related_task_id').references(() => brainTasks.id, { onDelete: 'set null' }),
  relatedMeetingId: integer('related_meeting_id').references(() => brainMeetings.id, { onDelete: 'set null' }),
  relatedRelationshipOverlayId: integer('related_relationship_overlay_id').references(() => brainRelationshipOverlays.id, { onDelete: 'set null' }),
  source: varchar('source', { length: 20 }).$type<BrainCalendarEventSource>().default('manual').notNull(),
  // Reserved for Phase C — populated when the event is mirrored to Google.
  googleEventId: varchar('google_event_id', { length: 255 }),
  googleCalendarId: varchar('google_calendar_id', { length: 255 }),
  // Reserved for Phase C — last successful one-way sync to Google (we use
  // last-write-wins on conflict).
  lastSyncedAt: timestamp('last_synced_at'),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

