// Company Brain: meetings, AI-extracted review items, relationships, notes, and the automation engine.

import { pgTable, serial, varchar, text, timestamp, boolean, integer, json, uniqueIndex, index, vector } from 'drizzle-orm/pg-core';
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
  /**
   * Action dispatcher key. Two name spaces:
   *   - executePortalTool name (e.g. 'create_support_ticket') — runs the
   *     matching portal-tool handler with `params`.
   *   - 'start_playbook' — special bridge into the Brain playbooks engine.
   *     `params` must include `playbookId` (number) OR `playbookSlug`
   *     (string) and may include `label`, `context`, `links`. Templated
   *     against the event payload via `{{event.field}}` like every other
   *     action. See lib/automation/engine.ts dispatcher branch + the
   *     bridge mental-model doc in .planning/brain-automations-bridge.
   */
  tool: string;
  params: Record<string, unknown>; // static params + {{event.field}} template vars
  delay?: number; // delay in seconds before executing (0 = immediate)
}

/**
 * Time-based trigger config attached to an automation rule. When set, the
 * scheduler cron (app/api/cron/process-scheduled-automations) fires the rule
 * unconditionally according to this cadence — the row's `trigger.event` is
 * effectively a sentinel (typically 'automation.scheduled') because event
 * matching is skipped for scheduled rules.
 *
 * v1 is UTC-only: `time` is interpreted as UTC and no timezone field is
 * exposed. Cron expressions are also evaluated in UTC. DST is not handled.
 */
export interface AutomationSchedule {
  cadence: 'daily' | 'weekly' | 'monthly' | 'cron';
  /** 'HH:mm' in 24h UTC. Required for daily/weekly/monthly. */
  time?: string;
  /** 0 (Sun) - 6 (Sat). Required for weekly. */
  dayOfWeek?: number;
  /** 1-31. Required for monthly. Clamped to last day if month is shorter. */
  dayOfMonth?: number;
  /** Raw 5-field cron expression. Required for cadence='cron'. */
  cronExpression?: string;
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
  // Time-based trigger config. Null = event-driven (current behavior). When
  // set, the scheduler cron drives execution and `next_run_at` is the next
  // firing time. The partial index `automation_rules_next_run_at_idx` keeps
  // the per-minute scan cheap.
  schedule: json('schedule').$type<AutomationSchedule>(),
  nextRunAt: timestamp('next_run_at'),
  executionCount: integer('execution_count').default(0).notNull(),
  lastExecutedAt: timestamp('last_executed_at'),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  // E2 perf — automations admin filters by clientId; the per-tenant rules
  // list is the hot path. (The partial 'failed' index on automation_logs is
  // declared in SQL only since Drizzle doesn't support partial indexes here.)
  index('automation_rules_client_idx').on(t.clientId),
]);

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
  source: varchar('source', { length: 50 }).default('paste').notNull(), // 'paste' | 'upload' | 'google_doc' | 'google_drive_watch' | 'google_meet_recording' | 'teams_transcript' | 'zoom'
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
  | 'crm_company_create'
  | 'project_artifact_link'
  // Phase 1 brain-restructure: AI-proposed attachment of one or more
  // brain_topics to an existing entity. Approval calls attachTopics from
  // lib/brain/topics.ts.
  | 'topic_assign';

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

/**
 * Decision review-item payload. Approval promotes this into a `brain_decisions`
 * row (see lib/brain/review.ts). The richer fields here mirror the columns on
 * `brain_decisions`. Phase 1+ replaced the legacy `{ title, details }` shape —
 * 0075's migration copies any in-flight `details` into `rationale`.
 */
export interface BrainReviewItemDecisionPayload {
  title: string;
  context?: string;
  decision: string;
  rationale: string;
  alternativesConsidered?: string;
  reversibility?: 'one_way' | 'two_way';
  decidedAt?: string;  // ISO
}

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

/**
 * Entity types that can have brain_topics attached via the polymorphic
 * `brain_entity_topics` join. Declared here (ahead of its table definition
 * lower in the file) so the review-item payload can reference it.
 */
export type BrainTopicEntityType =
  | 'note'
  | 'meeting'
  | 'task'
  | 'decision'
  | 'relationship_overlay'
  | 'initiative'
  | 'person';

/**
 * Topic-assignment proposal payload. Approval calls `attachTopics` from
 * `lib/brain/topics.ts` to insert rows into `brain_entity_topics` for each
 * `(targetEntityType, targetEntityId, topicId)`. The dispatcher rejects
 * unknown topic ids or cross-tenant attachment attempts.
 */
export interface BrainReviewItemTopicAssignPayload {
  targetEntityType: BrainTopicEntityType;
  targetEntityId: number;
  topicIds: number[];
  rationale?: string;
}

export interface BrainReviewItemProjectArtifactLinkPayload {
  projectId: number;
  artifactType: 'website' | 'email_campaign' | 'pitch_deck' | 'proposal' | 'booking' | 'survey' | 'post' | 'brain_note';
  artifactId: number;
  /** Optional human-friendly title used for the link's display row. */
  displayTitle?: string;
  pinned?: boolean;
  /** Free-form reason the proposal was made; useful when reviewing in the UI. */
  rationale?: string;
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
  | BrainReviewItemProjectArtifactLinkPayload
  | BrainReviewItemTopicAssignPayload
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
  // Routing-by-expertise — Phase 6. Populated by lib/brain/review-routing.ts.
  // SUGGESTIONS, not assignments — the actual reviewer on approval is recorded
  // in reviewedBy. A person can query "items routed to me" via the index below.
  suggestedReviewerPersonId: integer('suggested_reviewer_person_id').references((): any => brainPeople.id, { onDelete: 'set null' }),
  suggestedReviewerScore: integer('suggested_reviewer_score'),
  suggestedReviewerReason: text('suggested_reviewer_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('brain_ai_review_items_suggested_reviewer_idx').on(t.suggestedReviewerPersonId),
  // E2 perf — admin/approvals dashboard filters by (clientId, status) sorted
  // by createdAt; the review queue panel also scans by status only.
  index('brain_ai_review_items_client_status_created_idx').on(t.clientId, t.status, t.createdAt),
  index('brain_ai_review_items_status_idx').on(t.status),
]);

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

// Brain saved searches — Tana-style "Search Nodes" / Notion-style favorites.
// A row captures the knowledge sidebar's current filter state (search query,
// tag prefix / exact tags, pinned-only, sort/order, trashed) as a named pin
// in the sidebar. Clicking the pin re-applies all those filters. `userId`
// nullable: null = shared across the tenant; set = personal pin scoped to
// one user. Tenant boundary is `clientId` regardless.

export interface BrainSavedSearchFilters {
  search?: string;
  tagPrefix?: string;
  tags?: string[];
  pinnedOnly?: boolean;
  trashed?: boolean;
  sort?: 'updated' | 'created' | 'title';
  order?: 'asc' | 'desc';
}

export const brainSavedSearches = pgTable('brain_saved_searches', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 150 }).notNull(),
  icon: varchar('icon', { length: 50 }).default('bookmark').notNull(),
  filters: json('filters').$type<BrainSavedSearchFilters>().notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

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

// Embedding storage. One row per (entity, chunk). Vectors are written via raw
// SQL in lib/brain/embeddings.ts (pgvector accepts a `[1,2,…]::vector` literal,
// which is cheaper than round-tripping through the ORM mapper for 1536-dim
// floats). The Drizzle declaration exists primarily so `drizzle-kit push` sees
// the table and does not try to drop it as "extra" — we lost this table once
// and had to recover from a prod dump.
//
// HNSW vector index brain_embeddings_vector_hnsw_idx (vector_cosine_ops,
// m=16, ef_construction=64) is managed manually via drizzle/0061_brain_embeddings.sql
// and NOT declared here. drizzle-kit push cannot reconcile pgvector HNSW
// indexes against the introspected schema — declaring it triggers a duplicate
// CREATE INDEX on every push, and omitting it lets push --force silently drop
// the index. Solution: keep the index out of the schema, and DO NOT run
// `drizzle-kit push --force` against any DB that contains real brain data.
// Use `bun run db:migrate` for journaled migrations only. If push ever drops
// it, rebuild with:
//   CREATE INDEX brain_embeddings_vector_hnsw_idx ON brain_embeddings
//     USING hnsw (vector vector_cosine_ops) WITH (m=16, ef_construction=64);
export const brainEmbeddings = pgTable('brain_embeddings', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: integer('entity_id').notNull(),
  chunkIndex: integer('chunk_index').default(0).notNull(),
  content: text('content').notNull(),
  vector: vector('vector', { dimensions: 1536 }).notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  dim: integer('dim').notNull(),
  tokens: integer('tokens'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('brain_embeddings_client_idx').on(t.clientId),
  index('brain_embeddings_entity_idx').on(t.entityType, t.entityId),
  uniqueIndex('brain_embeddings_entity_chunk_idx').on(t.entityType, t.entityId, t.chunkIndex),
]);

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

// ─── BRAIN INITIATIVES + GOALS ───────────────────────────────────────────────
// Phase 3 — Initiatives are the multi-quarter umbrella every other brain entity
// hangs from. Goals (OKR-shaped) belong to one initiative as the measurable
// child. brain_initiative_links is a polymorphic join — entityType is a string
// (not an FK to brain_decisions / brain_topics / kanban_cards / etc.) so this
// schema lands cleanly whether the sibling brain-restructure branch has merged
// or not. App-layer code resolves the linked entity from (entityType, entityId).

export type BrainInitiativeStatus = 'planned' | 'active' | 'paused' | 'completed' | 'cancelled';
export type BrainInitiativePriority = 'low' | 'medium' | 'high' | 'critical';

export const brainInitiatives = pgTable('brain_initiatives', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 150 }).notNull(),         // unique per tenant
  description: text('description'),
  status: varchar('status', { length: 20 }).$type<BrainInitiativeStatus>().default('planned').notNull(),
  priority: varchar('priority', { length: 20 }).$type<BrainInitiativePriority>().default('medium').notNull(),
  ownerId: integer('owner_id').references(() => users.id, { onDelete: 'set null' }),
  sponsorId: integer('sponsor_id').references(() => users.id, { onDelete: 'set null' }), // optional exec sponsor
  startDate: timestamp('start_date'),
  targetDate: timestamp('target_date'),
  closedAt: timestamp('closed_at'),                          // set when status -> completed/cancelled
  closeReason: text('close_reason'),                         // free text, captured on close
  // Soft cancellation outcome — what we learned. Promoted to a brain_note on close.
  lessonsLearned: text('lessons_learned'),
  confidentialityLevel: varchar('confidentiality_level', { length: 20 }).default('standard').notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('brain_initiatives_client_slug_idx').on(t.clientId, t.slug),
  index('brain_initiatives_client_status_idx').on(t.clientId, t.status),
  index('brain_initiatives_target_idx').on(t.targetDate),
]);

export type BrainGoalStatus = 'open' | 'on_track' | 'at_risk' | 'off_track' | 'achieved' | 'missed';

export const brainGoals = pgTable('brain_goals', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  initiativeId: integer('initiative_id').notNull().references(() => brainInitiatives.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 20 }).$type<BrainGoalStatus>().default('open').notNull(),
  ownerId: integer('owner_id').references(() => users.id, { onDelete: 'set null' }),
  // Free-form metric shape — kept loose intentionally. Examples:
  //   { unit: 'percent', target: 30, current: 12 }
  //   { unit: 'usd_cents', target: 500000000, current: 320000000 }
  //   { unit: 'count', target: 50, current: 12 }
  // UI renders progress as currentMetric / targetMetric, capped at 100%.
  unit: varchar('unit', { length: 30 }),                     // 'percent' | 'usd_cents' | 'count' | 'boolean' | null
  targetMetric: integer('target_metric'),
  currentMetric: integer('current_metric'),
  // Optional ad-hoc progress note. Latest-check-in only — for history use brain_goal_progress (future branch).
  lastProgressNote: text('last_progress_note'),
  lastCheckedInAt: timestamp('last_checked_in_at'),
  targetDate: timestamp('target_date'),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('brain_goals_client_initiative_idx').on(t.clientId, t.initiativeId),
  index('brain_goals_status_idx').on(t.status),
]);

// Polymorphic join — initiative ↔ (task | note | meeting | decision | topic |
// crm_deal | crm_company). Mirrors the brain_entity_topics pattern. NO FK on
// (entityType, entityId) — app-layer code resolves each link by type. Lets the
// table coexist with whichever of brain_decisions / brain_topics has shipped.
export type BrainInitiativeLinkType =
  | 'task'
  | 'note'
  | 'meeting'
  | 'decision'
  | 'topic'
  | 'crm_deal'
  | 'crm_company'
  | 'person'
  | 'org_unit'
  | 'glossary_term';

export const brainInitiativeLinks = pgTable('brain_initiative_links', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  initiativeId: integer('initiative_id').notNull().references(() => brainInitiatives.id, { onDelete: 'cascade' }),
  entityType: varchar('entity_type', { length: 30 }).$type<BrainInitiativeLinkType>().notNull(),
  entityId: integer('entity_id').notNull(),
  pinned: boolean('pinned').default(false).notNull(),         // pin in the initiative detail UI
  note: text('note'),                                         // optional reason for the link
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('brain_initiative_links_init_entity_idx').on(t.initiativeId, t.entityType, t.entityId),
  index('brain_initiative_links_client_entity_idx').on(t.clientId, t.entityType, t.entityId),
]);

// ─── BRAIN DECISIONS ────────────────────────────────────────────────────────
// First-class immutable-ish decision records. Mutations to rationale /
// decision / context never edit-in-place — instead, create a successor and
// link via `superseded_by_decision_id`. Title/links remain mutable for typo
// fixes; lib/brain/decisions.ts enforces the rule and writes an audit row
// for every change. Phase 1 brain-restructure (see
// .planning/brain-restructure/PLAN.md).

export type BrainDecisionReversibility = 'one_way' | 'two_way';
export type BrainDecisionStatus = 'proposed' | 'accepted' | 'superseded' | 'rejected';

export const brainDecisions = pgTable('brain_decisions', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  context: text('context'),                              // problem statement / situation
  decision: text('decision').notNull(),                  // what was decided
  rationale: text('rationale').notNull(),                // why
  alternativesConsidered: text('alternatives_considered'),
  reversibility: varchar('reversibility', { length: 20 }).$type<BrainDecisionReversibility>().default('two_way').notNull(),
  status: varchar('status', { length: 20 }).$type<BrainDecisionStatus>().default('accepted').notNull(),
  decisionMakerId: integer('decision_maker_id').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at').defaultNow().notNull(),
  // Supersede chain (immutable replacement, never edit-in-place). Self-FK
  // declared via the `(): any => brainDecisions.id` pattern to break the
  // circular type inference Drizzle would otherwise hit.
  supersededByDecisionId: integer('superseded_by_decision_id').references((): any => brainDecisions.id, { onDelete: 'set null' }),
  // Optional anchors — usually one of these is set.
  meetingId: integer('meeting_id').references(() => brainMeetings.id, { onDelete: 'set null' }),
  noteId: integer('note_id').references(() => brainNotes.id, { onDelete: 'set null' }),
  companyId: integer('company_id').references(() => crmCompanies.id, { onDelete: 'set null' }),
  dealId: integer('deal_id').references(() => crmDeals.id, { onDelete: 'set null' }),
  // Provenance — 'manual' for user-authored, 'ai_review' when promoted from
  // a brain_ai_review_items row of type 'decision'.
  source: varchar('source', { length: 50 }).default('manual').notNull(),
  reviewItemId: integer('review_item_id').references(() => brainAiReviewItems.id, { onDelete: 'set null' }),
  confidentialityLevel: varchar('confidentiality_level', { length: 20 }).default('standard').notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('brain_decisions_client_idx').on(t.clientId),
  index('brain_decisions_decided_at_idx').on(t.decidedAt),
  index('brain_decisions_status_idx').on(t.status),
]);

// ─── BRAIN TOPICS ──────────────────────────────────────────────────────────
// Hierarchical taxonomy that cross-cuts every brain entity via the polymorphic
// `brain_entity_topics` join below. `parentId` is a self-FK; `slug` is unique
// per tenant for stable URLs; `path` is a materialized '/'-joined string of
// ancestor slugs used for cheap subtree queries — lib/brain/topics.ts keeps
// it in sync on insert/rename/move/merge.

export const brainTopics = pgTable('brain_topics', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  parentId: integer('parent_id').references((): any => brainTopics.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 150 }).notNull(),
  slug: varchar('slug', { length: 150 }).notNull(),
  path: varchar('path', { length: 1000 }).notNull(),    // '/ops/hiring/eng' — derived, kept in sync
  description: text('description'),
  color: varchar('color', { length: 20 }),              // optional UI hint, e.g. '#06b6d4'
  icon: varchar('icon', { length: 50 }),                // optional Material Icons name
  sortOrder: integer('sort_order').default(0).notNull(),
  // Set when the topic was migrated from a flat tag string by
  // `brain_topics_import_from_tags`.
  derivedFromTag: varchar('derived_from_tag', { length: 100 }),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('brain_topics_client_slug_idx').on(t.clientId, t.slug),
  index('brain_topics_client_parent_idx').on(t.clientId, t.parentId),
  index('brain_topics_path_idx').on(t.path),
]);

// Polymorphic join — topics attach to notes, meetings, tasks, decisions, and
// relationship overlays. `(entity_type, entity_id, topic_id)` is unique so
// idempotent attach calls are safe. `clientId` is denormalized here for
// tenant-scoped lookups without a join through `brain_topics`.

export const brainEntityTopics = pgTable('brain_entity_topics', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  topicId: integer('topic_id').notNull().references(() => brainTopics.id, { onDelete: 'cascade' }),
  entityType: varchar('entity_type', { length: 30 }).$type<BrainTopicEntityType>().notNull(),
  entityId: integer('entity_id').notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('brain_entity_topics_entity_topic_idx').on(t.entityType, t.entityId, t.topicId),
  index('brain_entity_topics_topic_idx').on(t.topicId),
  index('brain_entity_topics_client_entity_idx').on(t.clientId, t.entityType, t.entityId),
]);

// ─── BRAIN PEOPLE + ORG GRAPH (Phase 4) ──────────────────────────────────────
// Internal humans (employees, advisors, contractors) — distinct from
// CRM contacts (external). People have a reports-to chain (self-FK
// managerId), can belong to many org_units (many-to-many via
// brain_person_org_units), and carry expertise tags used by review-item
// routing ("send this to whoever knows kubernetes"). Optional FK to
// users.id when the person is also a portal-user account; most rows
// (board members, advisors) won't be.

export type BrainPersonStatus = 'active' | 'inactive' | 'departed';

export const brainPeople = pgTable('brain_people', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  // If this person is also a portal-user account.
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  fullName: varchar('full_name', { length: 200 }).notNull(),
  email: varchar('email', { length: 255 }),
  // Reports-to chain (self-FK). Null = top of chain (CEO/founder/independent).
  managerId: integer('manager_id').references((): any => brainPeople.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 200 }),
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  status: varchar('status', { length: 20 }).$type<BrainPersonStatus>().default('active').notNull(),
  // Free-form notes for things that don't fit the structured expertise table.
  notes: text('notes'),
  // External profile URLs (LinkedIn, GitHub, internal directory, etc.)
  profileUrls: json('profile_urls').$type<{ label: string; url: string }[]>().default([]).notNull(),
  // Provenance — most rows are 'manual' (a human created them). 'import' for batch ingest.
  source: varchar('source', { length: 50 }).default('manual').notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('brain_people_client_idx').on(t.clientId),
  index('brain_people_client_status_idx').on(t.clientId, t.status),
  index('brain_people_manager_idx').on(t.managerId),
  index('brain_people_user_idx').on(t.userId),
]);

export type BrainPerson = typeof brainPeople.$inferSelect;
export type NewBrainPerson = typeof brainPeople.$inferInsert;

// Hierarchical org units — teams, departments, squads. Mirrors the
// ltree-style pattern used elsewhere in brain (denormalized `path`
// column for fast subtree reads). `leadPersonId` is an optional unit
// head; must belong to the same client (enforced app-layer).

export const brainOrgUnits = pgTable('brain_org_units', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  parentId: integer('parent_id').references((): any => brainOrgUnits.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 150 }).notNull(),
  slug: varchar('slug', { length: 150 }).notNull(),
  path: varchar('path', { length: 1000 }).notNull(),
  description: text('description'),
  // Optional unit head — must belong to the same client.
  leadPersonId: integer('lead_person_id').references((): any => brainPeople.id, { onDelete: 'set null' }),
  color: varchar('color', { length: 20 }),
  icon: varchar('icon', { length: 50 }),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('brain_org_units_client_slug_idx').on(t.clientId, t.slug),
  index('brain_org_units_client_parent_idx').on(t.clientId, t.parentId),
  index('brain_org_units_path_idx').on(t.path),
]);

export type BrainOrgUnit = typeof brainOrgUnits.$inferSelect;
export type NewBrainOrgUnit = typeof brainOrgUnits.$inferInsert;

// Many-to-many — a person can be in multiple units (rare but real:
// a PM split between two teams). `primary` designates the one to
// surface as the headline membership (app-layer invariant: at most
// one primary per person).

export const brainPersonOrgUnits = pgTable('brain_person_org_units', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  personId: integer('person_id').notNull().references(() => brainPeople.id, { onDelete: 'cascade' }),
  orgUnitId: integer('org_unit_id').notNull().references(() => brainOrgUnits.id, { onDelete: 'cascade' }),
  // If the person has multiple unit memberships, exactly one is primary (app-layer invariant).
  primary: boolean('primary').default(false).notNull(),
  // Optional role within this specific unit ("Tech lead", "Designer", "Stakeholder")
  roleInUnit: varchar('role_in_unit', { length: 150 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('brain_person_org_units_person_unit_idx').on(t.personId, t.orgUnitId),
  index('brain_person_org_units_unit_idx').on(t.orgUnitId),
]);

export type BrainPersonOrgUnit = typeof brainPersonOrgUnits.$inferSelect;
export type NewBrainPersonOrgUnit = typeof brainPersonOrgUnits.$inferInsert;

// Per-tenant tag namespace for expertise — flat (no hierarchy,
// intentionally — tags like "kubernetes" / "fundraising" / "ASC 606"
// stay denormalized). `source` distinguishes user-created tags from
// AI-suggested ones surfaced for tag-merging cleanup.

export const brainExpertiseTags = pgTable('brain_expertise_tags', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  description: text('description'),
  // Suggested by AI based on review-item content. UI can show these for tag-merging cleanup.
  source: varchar('source', { length: 30 }).default('manual').notNull(), // 'manual' | 'ai_suggested'
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('brain_expertise_tags_client_slug_idx').on(t.clientId, t.slug),
]);

export type BrainExpertiseTag = typeof brainExpertiseTags.$inferSelect;
export type NewBrainExpertiseTag = typeof brainExpertiseTags.$inferInsert;

// Person ↔ expertise junction with optional skill level (1=novice,
// 2=working, 3=advanced, 4=expert). Unique on (personId, expertiseTagId)
// so a tag is attached at most once per person.

export const brainPersonExpertise = pgTable('brain_person_expertise', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  personId: integer('person_id').notNull().references(() => brainPeople.id, { onDelete: 'cascade' }),
  expertiseTagId: integer('expertise_tag_id').notNull().references(() => brainExpertiseTags.id, { onDelete: 'cascade' }),
  // 1=novice, 2=working, 3=advanced, 4=expert. Optional.
  level: integer('level'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('brain_person_expertise_person_tag_idx').on(t.personId, t.expertiseTagId),
  index('brain_person_expertise_tag_idx').on(t.expertiseTagId),
]);

export type BrainPersonExpertise = typeof brainPersonExpertise.$inferSelect;
export type NewBrainPersonExpertise = typeof brainPersonExpertise.$inferInsert;

// ─── BRAIN GLOSSARY ──────────────────────────────────────────────────────────
// Tenant-specific terminology: acronyms, product codenames, customer segments,
// internal jargon. Flat (no hierarchy) — instead, terms carry `aliases` (a
// JSON string array, substring-matched on lookup) and `relatedTermIds` (a JSON
// number array of "see also" pointers, NOT FK-enforced because the user may
// reorder or delete; app-layer validates and prunes broken references).
//
// Surface today: humans look up "what does X mean here?" via /portal/brain/
// glossary; future use: an embedder injects matched glossary entries into Ask
// queries so acronyms resolve. The lookup endpoint that future logic will
// consume ships in Wave 2 of this phase.

export type BrainGlossaryStatus = 'active' | 'deprecated';

export const brainGlossaryTerms = pgTable('brain_glossary_terms', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  term: varchar('term', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 200 }).notNull(),
  definition: text('definition').notNull(),
  // Short definition shown when the term is matched inline in another doc
  // (e.g. Ask query expansion).
  shortDefinition: varchar('short_definition', { length: 500 }),
  // Alternate spellings, acronyms, related-but-not-canonical names.
  // Substring-matched on lookup.
  aliases: json('aliases').$type<string[]>().default([]).notNull(),
  status: varchar('status', { length: 20 }).$type<BrainGlossaryStatus>().default('active').notNull(),
  // Optional categorization — free-form. UI groups by category in list view.
  category: varchar('category', { length: 100 }),
  // Who owns the canonical answer — the person to ask if the definition
  // changes.
  ownerId: integer('owner_id').references(() => users.id, { onDelete: 'set null' }),
  // "See also" — related term ids. NOT FK-enforced because the user may
  // reorder or delete. Stored as JSON; app-layer validates and prunes broken
  // references.
  relatedTermIds: json('related_term_ids').$type<number[]>().default([]).notNull(),
  // Provenance — most rows are 'manual'; 'ai_suggested' when AI proposes a
  // missing term.
  source: varchar('source', { length: 50 }).default('manual').notNull(),
  // Set when the source is 'ai_suggested' — points at the
  // brain_ai_review_items.id that proposed it. NOT FK-enforced so a deleted
  // review item does not cascade-delete an accepted glossary entry.
  reviewItemId: integer('review_item_id'),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('brain_glossary_client_slug_idx').on(t.clientId, t.slug),
  index('brain_glossary_client_status_idx').on(t.clientId, t.status),
  index('brain_glossary_category_idx').on(t.category),
]);

export type BrainGlossaryTerm = typeof brainGlossaryTerms.$inferSelect;

// ─── BRAIN PLAYBOOKS ─────────────────────────────────────────────────────────
// Ordered, branching sequences of templates + tasks triggered by an event
// (new-hire, new-client, contract-renewal, incident). Different from
// automation_rules (one-shot reactions): playbooks are human-paced, multi-step,
// with state per run. Examples: new-hire onboarding (Day 1 / 3 / 7 / 30 / 90),
// contract-renewal countdown (T-90 / T-60 / T-30 / T-7), incident response
// (page on-call → notify customer → post-mortem → promote lesson to a
// brain_decision).
//
// Tables in declaration order (FK deps): brainPlaybooks → brainPlaybookSteps →
// brainPlaybookRuns → brainPlaybookRunSteps → brainPlaybookLinks.

export type BrainPlaybookStatus = 'draft' | 'active' | 'archived';
export type BrainPlaybookTriggerKind = 'manual' | 'event' | 'scheduled';

export const brainPlaybooks = pgTable('brain_playbooks', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 200 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 20 }).$type<BrainPlaybookStatus>().default('draft').notNull(),
  // What kicks this playbook off.
  triggerKind: varchar('trigger_kind', { length: 20 }).$type<BrainPlaybookTriggerKind>().default('manual').notNull(),
  // For triggerKind='event': event name (e.g. 'initiative.created'). For
  // 'scheduled': cron expression. For 'manual': null.
  triggerConfig: json('trigger_config').$type<{
    event?: string;
    filters?: Record<string, unknown>;
    cron?: string;
  }>(),
  // Category for UI grouping — free-form ('hr', 'sales', 'ops', 'compliance').
  category: varchar('category', { length: 100 }),
  ownerId: integer('owner_id').references(() => users.id, { onDelete: 'set null' }),
  // Suggested topic tags applied to all run-spawned entities.
  defaultTopicIds: json('default_topic_ids').$type<number[]>().default([]).notNull(),
  // 'manual' for user-authored, 'template' for built-in pack templates (none
  // in v1).
  source: varchar('source', { length: 50 }).default('manual').notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('brain_playbooks_client_slug_idx').on(t.clientId, t.slug),
  index('brain_playbooks_client_status_idx').on(t.clientId, t.status),
]);

export type BrainPlaybook = typeof brainPlaybooks.$inferSelect;
export type NewBrainPlaybook = typeof brainPlaybooks.$inferInsert;

// Ordered steps within a playbook. `nextStepKeys` is a JSON string array
// supporting branching (one step can fan out to multiple). `condition` is a
// JSON expression evaluated against the run context.

export type BrainPlaybookStepKind =
  | 'task'           // creates a brain_task
  | 'note'           // creates a brain_note from a template
  | 'meeting'        // creates a brain_calendar_event
  | 'decision'       // prompts for a decision record
  | 'review_item'    // creates a brain_ai_review_item
  | 'wait'           // pauses until a date / condition is met
  | 'branch';        // pure routing — no side effect, just picks a path

export const brainPlaybookSteps = pgTable('brain_playbook_steps', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  playbookId: integer('playbook_id').notNull().references(() => brainPlaybooks.id, { onDelete: 'cascade' }),
  // Step key — stable identifier within a playbook; used by nextStepKeys + run
  // state.
  key: varchar('key', { length: 100 }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  kind: varchar('kind', { length: 30 }).$type<BrainPlaybookStepKind>().notNull(),
  // Step-kind-specific config (templated against run context). Examples:
  //   task: { title: 'Send welcome packet to {{person.fullName}}', ownerHint: 'manager', dueOffsetDays: 1 }
  //   meeting: { title: 'Manager 1:1', startOffsetDays: 3, durationMin: 30 }
  //   wait: { untilOffsetDays: 7 }
  //   branch: (no config — uses condition + nextStepKeys)
  config: json('config').$type<Record<string, unknown>>().default({}).notNull(),
  // Run-time condition expression. JSON shape parsed by
  // lib/brain/playbook-condition.ts. null = unconditional.
  condition: json('condition').$type<{
    field: string;
    op: 'eq' | 'neq' | 'in' | 'not_in' | 'exists' | 'not_exists' | 'gt' | 'lt';
    value?: unknown;
  } | null>(),
  // Step keys this step can advance to. Multiple = branching. Empty =
  // terminal.
  nextStepKeys: json('next_step_keys').$type<string[]>().default([]).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('brain_playbook_steps_playbook_key_idx').on(t.playbookId, t.key),
  index('brain_playbook_steps_playbook_idx').on(t.playbookId),
]);

export type BrainPlaybookStep = typeof brainPlaybookSteps.$inferSelect;
export type NewBrainPlaybookStep = typeof brainPlaybookSteps.$inferInsert;

// A run instance. State is per-run; multiple runs of the same playbook
// coexist.

export type BrainPlaybookRunStatus = 'pending' | 'active' | 'paused' | 'completed' | 'aborted' | 'failed';

export const brainPlaybookRuns = pgTable('brain_playbook_runs', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  playbookId: integer('playbook_id').notNull().references(() => brainPlaybooks.id, { onDelete: 'cascade' }),
  // Human label for this run ("New hire: Jane Doe", "Contract renewal: Acme
  // Corp").
  label: varchar('label', { length: 255 }).notNull(),
  status: varchar('status', { length: 20 }).$type<BrainPlaybookRunStatus>().default('pending').notNull(),
  // Context — variables that step configs template against. Examples:
  //   { person: { id: 42, fullName: 'Jane Doe', email: '...' }, manager: { id: 9, ... } }
  //   { company: { id: 12, name: 'Acme' }, renewalDate: '2026-08-01', csm: { id: 7, ... } }
  context: json('context').$type<Record<string, unknown>>().default({}).notNull(),
  // What started this run.
  startedBy: integer('started_by').references(() => users.id, { onDelete: 'set null' }),
  // For event-triggered runs: the event payload that fired it.
  triggerPayload: json('trigger_payload').$type<Record<string, unknown>>(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  abortedAt: timestamp('aborted_at'),
  abortReason: text('abort_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('brain_playbook_runs_client_status_idx').on(t.clientId, t.status),
  index('brain_playbook_runs_playbook_idx').on(t.playbookId),
]);

export type BrainPlaybookRun = typeof brainPlaybookRuns.$inferSelect;
export type NewBrainPlaybookRun = typeof brainPlaybookRuns.$inferInsert;

// Per-run step state. Tracks which steps are active, completed, or skipped.

export type BrainPlaybookRunStepStatus = 'pending' | 'active' | 'completed' | 'skipped' | 'failed';

export const brainPlaybookRunSteps = pgTable('brain_playbook_run_steps', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  runId: integer('run_id').notNull().references(() => brainPlaybookRuns.id, { onDelete: 'cascade' }),
  stepId: integer('step_id').notNull().references(() => brainPlaybookSteps.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).$type<BrainPlaybookRunStepStatus>().default('pending').notNull(),
  // What this step produced — e.g. the brain_task id it created, the
  // brain_note id, etc.
  resultEntityType: varchar('result_entity_type', { length: 50 }),
  resultEntityId: integer('result_entity_id'),
  // For wait steps: when this step is eligible to advance.
  waitUntil: timestamp('wait_until'),
  // For failed steps: the error message.
  failureReason: text('failure_reason'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('brain_playbook_run_steps_run_step_idx').on(t.runId, t.stepId),
  index('brain_playbook_run_steps_status_idx').on(t.status),
  index('brain_playbook_run_steps_wait_until_idx').on(t.waitUntil),
]);

export type BrainPlaybookRunStep = typeof brainPlaybookRunSteps.$inferSelect;
export type NewBrainPlaybookRunStep = typeof brainPlaybookRunSteps.$inferInsert;

// Polymorphic links — a run can be anchored to an initiative, person,
// company, deal, etc.

export type BrainPlaybookLinkEntityType =
  | 'initiative'
  | 'person'
  | 'crm_company'
  | 'crm_deal'
  | 'meeting'
  | 'decision';

export const brainPlaybookLinks = pgTable('brain_playbook_links', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  runId: integer('run_id').notNull().references(() => brainPlaybookRuns.id, { onDelete: 'cascade' }),
  entityType: varchar('entity_type', { length: 30 }).$type<BrainPlaybookLinkEntityType>().notNull(),
  entityId: integer('entity_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('brain_playbook_links_run_entity_idx').on(t.runId, t.entityType, t.entityId),
  index('brain_playbook_links_client_entity_idx').on(t.clientId, t.entityType, t.entityId),
]);

export type BrainPlaybookLink = typeof brainPlaybookLinks.$inferSelect;
export type NewBrainPlaybookLink = typeof brainPlaybookLinks.$inferInsert;

// ─── BRAIN DOCUMENTS ────────────────────────────────────────────────────────
// Phase 7 — versioned, role-scoped SOPs / policies / required-reads with per-
// version acknowledgments. The "unfinished half" of the strategic review's
// Playbooks-vs-Documents split: Playbooks ship the *runnable* checklist;
// Documents ship the *canonical written answer* (a markdown body that grows
// version-by-version, can be required reading for People or whole org units,
// and tracks who has acknowledged which version).
//
// Five tables:
//   1) brain_documents               — top-level wrapper (title, slug, status,
//                                      pointers to current draft + current
//                                      published version).
//   2) brain_document_versions       — immutable per-version body + metadata.
//                                      Sequential versionNumber per document.
//   3) brain_document_required_reads — assigns a document (optionally pinned
//                                      to a specific version) as required
//                                      reading for a person OR an org unit.
//   4) brain_document_acknowledgments — one row per (document, version, person)
//                                       once acknowledged.
//   5) brain_document_links          — polymorphic "this document is about X"
//                                      (topic / initiative / decision / meeting
//                                      / glossary term / person).
//
// Circular-FK note: `brain_documents.currentPublishedVersionId` and
// `currentDraftVersionId` point at `brain_document_versions.id`, but
// `brain_document_versions.documentId` points back at `brain_documents.id`.
// We mirror the `brain_initiative_links.entityId` precedent — the version-id
// pointers on brain_documents are plain integer columns with NO FK constraint
// (validated at the app layer in lib/brain/documents.ts). This keeps the
// migration SQL linear (no deferred constraints, no ALTER TABLE round trip).

export type BrainDocumentStatus = 'draft' | 'published' | 'archived';
export type BrainDocumentCategory =
  | 'sop'
  | 'policy'
  | 'guide'
  | 'reference'
  | 'announcement'
  | 'other';

export const brainDocuments = pgTable('brain_documents', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  // Body lives in brain_document_versions rows, NOT here, to keep this table
  // light. Drafts edit currentDraftVersionId; publishing flips
  // currentPublishedVersionId.
  category: varchar('category', { length: 30 }).$type<BrainDocumentCategory>().default('reference').notNull(),
  status: varchar('status', { length: 20 }).$type<BrainDocumentStatus>().default('draft').notNull(),
  ownerId: integer('owner_id').references(() => users.id, { onDelete: 'set null' }),
  // Soft pointers — NO FK constraint (see header note about the circular FK).
  // App layer (lib/brain/documents.ts) validates both belong to the same doc.
  currentPublishedVersionId: integer('current_published_version_id'),
  currentDraftVersionId: integer('current_draft_version_id'),
  publishedAt: timestamp('published_at'),
  archivedAt: timestamp('archived_at'),
  // Soft cancellation reason.
  archiveReason: text('archive_reason'),
  // If promoted from a brain_note, points back at the source. Set-null on
  // delete so the document survives if the seed note is removed later.
  sourceNoteId: integer('source_note_id').references(() => brainNotes.id, { onDelete: 'set null' }),
  // Confidentiality / access scope. Same vocabulary as brain_decisions /
  // brain_playbooks — app layer enforces 'standard' | 'restricted' | 'secret'.
  confidentialityLevel: varchar('confidentiality_level', { length: 20 }).default('standard').notNull(),
  // Default topic ids — surfaced as topic chips on the document detail view.
  // Stored as JSON so we can ship the chips without spawning a third
  // brain_entity_topics row per document on every save. NOT FK-enforced; app
  // layer prunes stale ids.
  defaultTopicIds: json('default_topic_ids').$type<number[]>().default([]).notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('brain_documents_client_slug_idx').on(t.clientId, t.slug),
  index('brain_documents_client_status_idx').on(t.clientId, t.status),
  index('brain_documents_category_idx').on(t.category),
]);

export type BrainDocument = typeof brainDocuments.$inferSelect;
export type NewBrainDocument = typeof brainDocuments.$inferInsert;

export const brainDocumentVersions = pgTable('brain_document_versions', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  documentId: integer('document_id').notNull().references(() => brainDocuments.id, { onDelete: 'cascade' }),
  // Sequential version number within the document — 1, 2, 3, …
  versionNumber: integer('version_number').notNull(),
  // The document's body for this version. Markdown.
  body: text('body').notNull(),
  // Per-version metadata that may vary between versions. `title` is copied
  // from the parent document at publish time and frozen — the parent doc's
  // title can drift afterwards; this column preserves what was actually
  // signed off on.
  title: varchar('title', { length: 255 }).notNull(),
  summary: text('summary'),                            // optional executive summary
  // What changed since the previous version? Free-form. Surfaced in the
  // version history view.
  changeNotes: text('change_notes'),
  // Lifecycle. A row starts as `isDraft = true`; publishing sets it false
  // and stamps publishedAt + publishedBy.
  isDraft: boolean('is_draft').default(true).notNull(),
  publishedAt: timestamp('published_at'),
  publishedBy: integer('published_by').references(() => users.id, { onDelete: 'set null' }),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('brain_document_versions_doc_version_idx').on(t.documentId, t.versionNumber),
  index('brain_document_versions_doc_idx').on(t.documentId),
  index('brain_document_versions_draft_idx').on(t.isDraft),
]);

export type BrainDocumentVersion = typeof brainDocumentVersions.$inferSelect;
export type NewBrainDocumentVersion = typeof brainDocumentVersions.$inferInsert;

// Required-reads assign a document (optionally pinned to a specific version)
// to a person OR an entire org unit. `pinnedVersionId = null` means "always
// the current published version" — re-acknowledged on each new publish.

export type BrainDocumentRequiredReadTarget = 'person' | 'org_unit';

export const brainDocumentRequiredReads = pgTable('brain_document_required_reads', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  documentId: integer('document_id').notNull().references(() => brainDocuments.id, { onDelete: 'cascade' }),
  // Which version is required? Usually the current published version, but
  // can pin to a specific version. null = "always the current published
  // version" (re-acknowledged on each new publish).
  pinnedVersionId: integer('pinned_version_id').references(() => brainDocumentVersions.id, { onDelete: 'set null' }),
  targetType: varchar('target_type', { length: 30 }).$type<BrainDocumentRequiredReadTarget>().notNull(),
  // For 'person' target: a brain_people.id. For 'org_unit' target: a
  // brain_org_units.id. NOT FK-enforced because the column is polymorphic;
  // the app layer prunes broken references when a person/org-unit is hard
  // deleted.
  targetId: integer('target_id').notNull(),
  dueAt: timestamp('due_at'),
  assignedBy: integer('assigned_by').references(() => users.id, { onDelete: 'set null' }),
  assignedAt: timestamp('assigned_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('brain_document_required_reads_doc_target_idx').on(t.documentId, t.targetType, t.targetId),
  index('brain_document_required_reads_target_idx').on(t.targetType, t.targetId),
  index('brain_document_required_reads_due_idx').on(t.dueAt),
]);

export type BrainDocumentRequiredRead = typeof brainDocumentRequiredReads.$inferSelect;
export type NewBrainDocumentRequiredRead = typeof brainDocumentRequiredReads.$inferInsert;

// One row per (document, version, person) acknowledgment. Unique constraint
// prevents double-acks; cascading deletes on documentId/versionId/personId
// keep the table tidy if the upstream row goes away.

export const brainDocumentAcknowledgments = pgTable('brain_document_acknowledgments', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  documentId: integer('document_id').notNull().references(() => brainDocuments.id, { onDelete: 'cascade' }),
  versionId: integer('version_id').notNull().references(() => brainDocumentVersions.id, { onDelete: 'cascade' }),
  personId: integer('person_id').notNull().references(() => brainPeople.id, { onDelete: 'cascade' }),
  // Optional source: which required-read row prompted this acknowledgment.
  // Set-null so the ack survives if the required-read assignment is removed.
  requiredReadId: integer('required_read_id').references(() => brainDocumentRequiredReads.id, { onDelete: 'set null' }),
  // Optional note from the acknowledger ("read but have follow-up questions").
  acknowledgmentNote: text('acknowledgment_note'),
  acknowledgedAt: timestamp('acknowledged_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('brain_document_acks_doc_version_person_idx').on(t.documentId, t.versionId, t.personId),
  index('brain_document_acks_person_idx').on(t.personId),
  index('brain_document_acks_version_idx').on(t.versionId),
]);

export type BrainDocumentAcknowledgment = typeof brainDocumentAcknowledgments.$inferSelect;
export type NewBrainDocumentAcknowledgment = typeof brainDocumentAcknowledgments.$inferInsert;

// Polymorphic links — a document can be linked to topics, initiatives,
// decisions, meetings, glossary terms, or people. Mirrors the
// brain_initiative_links shape (entityType + entityId, NOT FK-enforced).

export type BrainDocumentLinkEntityType =
  | 'topic'
  | 'initiative'
  | 'decision'
  | 'meeting'
  | 'glossary_term'
  | 'person';

export const brainDocumentLinks = pgTable('brain_document_links', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  documentId: integer('document_id').notNull().references(() => brainDocuments.id, { onDelete: 'cascade' }),
  entityType: varchar('entity_type', { length: 30 }).$type<BrainDocumentLinkEntityType>().notNull(),
  entityId: integer('entity_id').notNull(),
  note: text('note'),                                       // optional reason for the link
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('brain_document_links_doc_entity_idx').on(t.documentId, t.entityType, t.entityId),
  index('brain_document_links_client_entity_idx').on(t.clientId, t.entityType, t.entityId),
]);

export type BrainDocumentLink = typeof brainDocumentLinks.$inferSelect;
export type NewBrainDocumentLink = typeof brainDocumentLinks.$inferInsert;

