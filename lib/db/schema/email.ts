// Email marketing: lists, subscribers, campaigns, segments, templates, and per-website transactional templates.

import { pgTable, serial, varchar, text, timestamp, boolean, integer, json, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { clientWebsites, clients } from './sites';
import { brandingProfiles } from './cms';

export const emailLists = pgTable('email_lists', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  clientId: integer('client_id').references(() => clients.id, { onDelete: 'cascade' }), // null = global (agency newsletter etc.)
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('email_lists_client_id_idx').on(t.clientId),
]);

export const emailSubscribers = pgTable('email_subscribers', {
  id: serial('id').primaryKey(),
  listId: integer('list_id').notNull().references(() => emailLists.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }),
  status: varchar('status', { length: 20 }).default('active').notNull(), // active, unsubscribed, bounced, complained
  unsubscribeToken: varchar('unsubscribe_token', { length: 64 }).notNull().unique(),
  metadata: json('metadata').$type<Record<string, string>>(),
  subscribedAt: timestamp('subscribed_at').defaultNow().notNull(),
  unsubscribedAt: timestamp('unsubscribed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('email_subscribers_list_id_idx').on(t.listId),
  index('email_subscribers_list_status_idx').on(t.listId, t.status),
  uniqueIndex('email_subscribers_list_email_uniq_idx').on(t.listId, t.email),
  // Plain (listId, subscribedAt) covers both ASC and DESC scans for "newest
  // subscribers first" pagination over a single list. .desc() not in use
  // elsewhere in this codebase; the planner reverse-scans cleanly.
  index('email_subscribers_list_subscribed_at_idx').on(t.listId, t.subscribedAt),
]);

export const emailCampaigns = pgTable('email_campaigns', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(), // internal name
  subject: varchar('subject', { length: 255 }).notNull(),
  previewText: varchar('preview_text', { length: 255 }),
  fromName: varchar('from_name', { length: 255 }).notNull(),
  fromEmail: varchar('from_email', { length: 255 }).notNull(),
  replyTo: varchar('reply_to', { length: 255 }),
  listId: integer('list_id').notNull().references(() => emailLists.id, { onDelete: 'restrict' }),
  clientId: integer('client_id').references(() => clients.id, { onDelete: 'set null' }), // which client this is for (optional)
  htmlContent: text('html_content').notNull(), // final rendered HTML
  blockContent: json('block_content'), // BlockEditorData JSON when created via visual editor
  contentBlocks: json('content_blocks'), // Block[] tree for the new block-builder send path (parallel to template/htmlContent)
  useBlockEditor: boolean('use_block_editor').default(false).notNull(), // when true, render from contentBlocks at send time
  status: varchar('status', { length: 20 }).default('draft').notNull(), // draft, scheduled, sending, sent, cancelled
  scheduledAt: timestamp('scheduled_at'),
  sentAt: timestamp('sent_at'),
  totalRecipients: integer('total_recipients').default(0).notNull(),
  totalSent: integer('total_sent').default(0).notNull(),
  totalOpened: integer('total_opened').default(0).notNull(),
  totalClicked: integer('total_clicked').default(0).notNull(),
  totalBounced: integer('total_bounced').default(0).notNull(),
  totalUnsubscribed: integer('total_unsubscribed').default(0).notNull(),
  // ── Subject A/B test (standalone — independent of lib/ab/* engine) ──
  // When abEnabled, the send path splits the first abTestSizePct of the list
  // evenly into "A" (subject) and "B" (abSubjectB). The remaining recipients
  // are held until a winner is decided by abWinnerMetric, after which the
  // winning subject is recorded in abWinnerSubject and the remainder sent.
  abEnabled: boolean('ab_enabled').default(false).notNull(),
  abSubjectB: varchar('ab_subject_b', { length: 255 }), // second subject line variant
  abWinnerMetric: varchar('ab_winner_metric', { length: 20 }).default('open'), // 'open' | 'click'
  abTestSizePct: integer('ab_test_size_pct').default(10), // % of list to split between A/B before promoting
  abWinnerSubject: varchar('ab_winner_subject', { length: 255 }), // populated when winner is decided
  abDecidedAt: timestamp('ab_decided_at'), // when winner was selected and remainder dispatched
  // Lightweight fork pointer — set by email_campaigns_fork. Points to
  // email_campaigns.id of the campaign this row was duplicated from.
  parentCampaignId: integer('parent_campaign_id'),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('email_campaigns_client_created_at_idx').on(t.clientId, t.createdAt),
  index('email_campaigns_list_id_idx').on(t.listId),
  index('email_campaigns_status_scheduled_at_idx').on(t.status, t.scheduledAt),
]);

export const emailTemplates = pgTable('email_templates', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').references(() => clients.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 50 }).default('custom').notNull(), // welcome, newsletter, promotion, transactional, custom
  subject: varchar('subject', { length: 255 }),
  htmlContent: text('html_content').notNull(),
  blockContent: json('block_content'), // BlockEditorData JSON when created via visual editor
  thumbnailUrl: varchar('thumbnail_url', { length: 500 }),
  isGlobal: boolean('is_global').default(false).notNull(), // admin-created templates available to all
  usageCount: integer('usage_count').default(0).notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const emailSubscriberTags = pgTable('email_subscriber_tags', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  color: varchar('color', { length: 20 }).default('#6366f1'),
  subscriberCount: integer('subscriber_count').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const emailSubscriberTagAssignments = pgTable('email_subscriber_tag_assignments', {
  id: serial('id').primaryKey(),
  subscriberId: integer('subscriber_id').notNull().references(() => emailSubscribers.id, { onDelete: 'cascade' }),
  tagId: integer('tag_id').notNull().references(() => emailSubscriberTags.id, { onDelete: 'cascade' }),
}, (t) => [
  index('email_subscriber_tag_assignments_subscriber_idx').on(t.subscriberId),
  index('email_subscriber_tag_assignments_tag_idx').on(t.tagId),
]);

export const emailSegments = pgTable('email_segments', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  rules: json('rules').$type<{ field: string; operator: string; value: string }[]>().default([]),
  matchType: varchar('match_type', { length: 10 }).default('all').notNull(), // 'all' or 'any'
  subscriberCount: integer('subscriber_count').default(0).notNull(),
  lastCalculatedAt: timestamp('last_calculated_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('email_segments_client_id_idx').on(t.clientId),
]);

// ─── HOSTING & DNS ────────────────────────────────────────────────────────────

export const emailCampaignSends = pgTable('email_campaign_sends', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id').notNull().references(() => emailCampaigns.id, { onDelete: 'cascade' }),
  subscriberId: integer('subscriber_id').notNull().references(() => emailSubscribers.id, { onDelete: 'cascade' }),
  resendEmailId: varchar('resend_email_id', { length: 255 }), // ID returned by Resend
  // Subject A/B variant tag: 'a' | 'b' | 'winner' | null. NULL means "not part
  // of an A/B test" so non-A/B campaigns leave it empty. Used by the winner-
  // promotion endpoint to aggregate open/click counts per variant.
  abVariant: varchar('ab_variant', { length: 10 }),
  sentAt: timestamp('sent_at'),
  openedAt: timestamp('opened_at'),
  clickedAt: timestamp('clicked_at'),
  bouncedAt: timestamp('bounced_at'),
  complainedAt: timestamp('complained_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('email_campaign_sends_campaign_idx').on(t.campaignId),
  index('email_campaign_sends_subscriber_idx').on(t.subscriberId),
  uniqueIndex('email_campaign_sends_campaign_subscriber_uniq_idx').on(t.campaignId, t.subscriberId),
]);

// Saved payment methods (mirrors Stripe PaymentMethod objects)

export interface EmailTemplateVariable {
  key: string;        // e.g. 'firstName'
  label: string;      // e.g. 'First Name'
  description: string; // e.g. 'Customer first name from order'
  sampleValue: string; // e.g. 'Jane'
}

// ─── EMAIL BLOCK RENDER CACHE ─────────────────────────────────────────────────
//
// Cached output of `renderBlocksToEmailHtml(contentBlocks)` keyed by sha256
// hash of the content blocks. Lets the send path reuse one render across all
// recipients, and lets the preview endpoint short-circuit when the same tree
// is re-submitted. Multi-tenant — every row joins back to a campaign whose
// clientId scopes access.

export const emailRenders = pgTable('email_renders', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id').notNull().references(() => emailCampaigns.id, { onDelete: 'cascade' }),
  blocksHash: varchar('blocks_hash', { length: 64 }).notNull(), // sha256 hex digest of the canonical blocks JSON
  html: text('html').notNull(),
  subject: text('subject'),
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
}, (table) => [
  index('email_renders_campaign_hash_idx').on(table.campaignId, table.blocksHash),
]);

export const websiteEmailTemplates = pgTable('website_email_templates', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  event: varchar('event', { length: 100 }).notNull(), // e.g. 'order.confirmed'
  name: varchar('name', { length: 255 }).notNull(),
  subject: varchar('subject', { length: 255 }).notNull(),
  description: text('description'),
  htmlContent: text('html_content').notNull().default(''),
  blockContent: json('block_content'), // BlockEditorData JSON
  variables: json('variables').$type<EmailTemplateVariable[]>().default([]),
  brandingProfileId: integer('branding_profile_id').references(() => brandingProfiles.id, { onDelete: 'set null' }),
  enabled: boolean('enabled').default(true).notNull(),
  isRequired: boolean('is_required').default(false).notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// API keys for public SDK/API access

// ─── EMAIL JOURNEYS ───────────────────────────────────────────────────────────
//
// Branching drip-journey automation. A Journey defines an ordered sequence of
// steps (email / wait / condition / tag / exit). Subscribers are enrolled via
// trigger (list_join / event / manual) and advanced by the
// process-journey-enrollments cron using a CAS-claim on nextRunAt.

export interface EmailStepConfig {
  campaignId?: number;       // for 'email' steps — reference an existing campaign
  subject?: string;          // inline subject (if no campaignId)
  htmlContent?: string;      // inline body (if no campaignId)
  fromName?: string;
  fromEmail?: string;
}

export interface WaitConfig {
  delayHours: number;
}

export interface ConditionConfig {
  metric: 'opened' | 'clicked' | 'no_engage';
  windowHours: number;
  yesStepOrder: number;
  noStepOrder: number;
}

export const emailJourneys = pgTable('email_journeys', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 20 }).default('draft').notNull(), // draft | active | paused | archived
  triggerType: varchar('trigger_type', { length: 30 }).default('manual').notNull(), // event | manual | list_join
  triggerConfig: json('trigger_config').$type<{ event?: string; listId?: number; filters?: Record<string, unknown> }>(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('email_journeys_client_idx').on(t.clientId),
  index('email_journeys_client_status_idx').on(t.clientId, t.status),
]);

export const emailJourneySteps = pgTable('email_journey_steps', {
  id: serial('id').primaryKey(),
  journeyId: integer('journey_id').notNull().references(() => emailJourneys.id, { onDelete: 'cascade' }),
  stepOrder: integer('step_order').notNull(), // 0-based
  stepType: varchar('step_type', { length: 20 }).notNull(), // email | wait | condition | tag | exit
  config: json('config').$type<EmailStepConfig | WaitConfig | ConditionConfig>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('email_journey_steps_journey_order_idx').on(t.journeyId, t.stepOrder),
]);

export const emailJourneyEnrollments = pgTable('email_journey_enrollments', {
  id: serial('id').primaryKey(),
  journeyId: integer('journey_id').notNull().references(() => emailJourneys.id, { onDelete: 'cascade' }),
  subscriberId: integer('subscriber_id').notNull().references(() => emailSubscribers.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).default('active').notNull(), // active | completed | exited | error
  currentStepOrder: integer('current_step_order').default(0).notNull(),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }).defaultNow().notNull(),
  enrolledAt: timestamp('enrolled_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
}, (t) => [
  uniqueIndex('email_journey_enrollments_journey_subscriber_uniq_idx').on(t.journeyId, t.subscriberId),
  index('email_journey_enrollments_status_next_run_idx').on(t.status, t.nextRunAt),
  index('email_journey_enrollments_client_idx').on(t.clientId),
]);

export const emailJourneyStepSends = pgTable('email_journey_step_sends', {
  id: serial('id').primaryKey(),
  enrollmentId: integer('enrollment_id').notNull().references(() => emailJourneyEnrollments.id, { onDelete: 'cascade' }),
  stepId: integer('step_id').notNull().references(() => emailJourneySteps.id, { onDelete: 'cascade' }),
  subscriberId: integer('subscriber_id').notNull().references(() => emailSubscribers.id, { onDelete: 'cascade' }),
  resendEmailId: varchar('resend_email_id', { length: 255 }),
  sentAt: timestamp('sent_at').defaultNow().notNull(),
  openedAt: timestamp('opened_at'),
  clickedAt: timestamp('clicked_at'),
}, (t) => [
  uniqueIndex('email_journey_step_sends_enrollment_step_uniq_idx').on(t.enrollmentId, t.stepId),
  index('email_journey_step_sends_enrollment_idx').on(t.enrollmentId),
  index('email_journey_step_sends_subscriber_idx').on(t.subscriberId),
]);

