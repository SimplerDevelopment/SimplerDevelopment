// Surveys / intake forms with recommendation engine, AI summaries, and partial-response capture.

import { pgTable, serial, varchar, text, timestamp, boolean, integer, json } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { clients } from './sites';
import { brandingProfiles } from './cms';

export interface SurveyRecommendationOffering {
  key: string;
  name: string;
  tagline: string;
  youGet: string;
  price: string;
  duration: string;
}

export interface SurveyRecommendationQuestion {
  /** Field ID in the survey (e.g. 'q1') */
  fieldId: string;
  /** One narrative phrase per option text (used to build the "you're X" sentence) */
  context?: Record<string, string>;
  /** Map option text → offering key for vote tally */
  optionToOffering: Record<string, string>;
}

export interface SurveyRecommendationHybridRule {
  /** Map of fieldId → required option text. All must match for hybrid to fire. */
  whenAnswers: Record<string, string>;
  /** Title for the hybrid card (e.g. "A Snapshot into a Roadmap.") */
  title: string;
  /** Body copy explaining the sequence */
  body: string;
  /** Ordered offerings shown in the hybrid card */
  offeringKeys: string[];
}

export interface SurveyRecommendationConfig {
  offerings: SurveyRecommendationOffering[];
  /** Per-question voting config. Order matters for narrative phrasing. */
  questions: SurveyRecommendationQuestion[];
  /**
   * Override rule — if any answer matches, force this offering as primary
   * (e.g. q3=D OR q2=D → advisory). First match wins.
   */
  overrides?: {
    whenAnyAnswer: { fieldId: string; values: string[] }[];
    forceOfferingKey: string;
  }[];
  hybrid?: SurveyRecommendationHybridRule;
  /** Always-shown bottom card (e.g. "advisory" as a backstop suggestion) */
  alwaysAlsoOfferingKey?: string;
  /** Book-call URL for the primary CTA */
  bookUrl: string;
  /** Header label for the result screen */
  eyebrow?: string;
  /** Lead-in narrative template — supports {{primary}} and {{q1Context}}/{{q2Context}}/{{q3Context}} */
  narrativeTemplate?: string;
}

export interface ShowIfRule {
  fieldId: string;
  operator: 'equals' | 'not_equals';
  values: string[];
}

export interface ShowIfCondition {
  combinator: 'AND';
  rules: ShowIfRule[];
}

export interface SurveyFieldDef {
  id: string;
  type: 'text' | 'textarea' | 'number' | 'email' | 'phone' | 'url'
    | 'select' | 'radio' | 'checkbox' | 'toggle' | 'date' | 'rating' | 'heading' | 'slider'
    | 'page_break';
  label: string;
  placeholder: string;
  helpText: string;
  required: boolean;
  options: string[];
  min?: number;
  max?: number;
  step?: number;
  showIf?: { fieldId: string; values: string[] } | ShowIfCondition;
  conditionalOptions?: { fieldId: string; map: Record<string, string[]>; default?: string[] };
  // Logic branching: if answer matches a value, jump to page N (0-indexed)
  goToPage?: Record<string, number>; // { "option_value": pageIndex }
  order: number;
  page?: number; // which page this field belongs to (0-indexed, default 0)
}

export interface SurveyPageDef {
  title?: string;
  description?: string;
}

/** Per-survey style overrides. Takes precedence over branding profile. */

export interface SurveyStyling {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  headingFont?: string;
  bodyFont?: string;
  borderRadius?: string;
  buttonPrimaryBg?: string;
  buttonPrimaryText?: string;
  buttonBorderRadius?: string;
  formBg?: string;
  inputBg?: string;
  inputTextColor?: string;
  inputOptionTextColor?: string;
  hideTitle?: boolean;
  hideLogo?: boolean;
}

export const surveys = pgTable('surveys', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  description: text('description'),
  fields: json('fields').$type<SurveyFieldDef[]>().default([]),
  pages: json('pages').$type<SurveyPageDef[]>().default([{ title: 'Page 1' }]),
  // Appearance
  thankYouTitle: varchar('thank_you_title', { length: 255 }).default('Thank you!'),
  thankYouMessage: text('thank_you_message').default('Your response has been recorded.'),
  redirectUrl: varchar('redirect_url', { length: 500 }),
  color: varchar('color', { length: 7 }).default('#2563eb'),
  brandingProfileId: integer('branding_profile_id').references(() => brandingProfiles.id, { onDelete: 'set null' }),
  styling: json('survey_styling').$type<SurveyStyling>().default({}),
  // Settings
  status: varchar('status', { length: 20 }).default('draft').notNull(), // draft, active, closed
  allowMultiple: boolean('allow_multiple').default(true).notNull(), // allow same email to submit multiple times
  requireEmail: boolean('require_email').default(false).notNull(),
  notifyOnResponse: boolean('notify_on_response').default(true).notNull(),
  notifyDigest: varchar('notify_digest', { length: 10 }).default('off').notNull(), // 'off', 'daily', 'weekly'
  closesAt: timestamp('closes_at'),
  maxResponses: integer('max_responses'),
  // Integration context — which system linked to this survey
  linkedType: varchar('linked_type', { length: 30 }), // 'email_campaign', 'crm_deal', 'crm_proposal', 'booking_page', 'website', 'pitch_deck'
  linkedId: integer('linked_id'),
  // Optional dynamic recommendation rendered after the thank-you. Lives on the
  // survey (not the deck slide) so it stays consistent everywhere the survey
  // is rendered. Pitch-deck slides surface this via `survey.recommendation`.
  recommendation: json('recommendation').$type<SurveyRecommendationConfig>(),
  // Meta
  responseCount: integer('response_count').default(0).notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const surveyResponses = pgTable('survey_responses', {
  id: serial('id').primaryKey(),
  surveyId: integer('survey_id').notNull().references(() => surveys.id, { onDelete: 'cascade' }),
  // Logical sub-grouping — required so the dashboard can segment custom-form
  // submissions (e.g. multiple HTML qualifier variants posting to the same
  // survey row). Defaults to 'main' for structured-survey submissions.
  formName: varchar('form_name', { length: 100 }).default('main').notNull(),
  answers: json('answers').$type<Record<string, unknown>>().notNull(),
  respondentEmail: varchar('respondent_email', { length: 255 }),
  respondentName: varchar('respondent_name', { length: 255 }),
  // Source tracking
  source: varchar('source', { length: 30 }).default('link').notNull(), // 'link', 'email', 'embed', 'crm', 'booking'
  sourceId: varchar('source_id', { length: 255 }), // campaign ID, booking ID, etc.
  // Context
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  completedAt: timestamp('completed_at'),
  // A/B variant reference — nullable, FK constraint defined in SQL migration (0042)
  variantId: integer('variant_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── SURVEY EXTENSION TABLES (Phase 1 schema migration) ─────────────────────

export const surveyPartialResponses = pgTable('survey_partial_responses', {
  id: serial('id').primaryKey(),
  surveyId: integer('survey_id').notNull().references(() => surveys.id, { onDelete: 'cascade' }),
  sessionId: varchar('session_id', { length: 64 }).notNull(),
  answers: json('answers').$type<Record<string, unknown>>().notNull().default({}),
  lastPage: integer('last_page').notNull().default(0),
  respondentEmail: varchar('respondent_email', { length: 255 }),
  source: varchar('source', { length: 30 }).default('link'),
  sourceId: varchar('source_id', { length: 255 }),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  completed: boolean('completed').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const surveyWebhooks = pgTable('survey_webhooks', {
  id: serial('id').primaryKey(),
  surveyId: integer('survey_id').notNull().references(() => surveys.id, { onDelete: 'cascade' }),
  url: varchar('url', { length: 500 }).notNull(),
  secret: varchar('secret', { length: 64 }),
  events: json('events').$type<string[]>().notNull().default(['response.submitted']),
  enabled: boolean('enabled').default(true).notNull(),
  // Delivery tracking — updated by the dispatcher after each attempt sequence.
  lastFiredAt: timestamp('last_fired_at'),
  lastStatus: integer('last_status'),
  failureCount: integer('failure_count').default(0).notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Delivery audit log for survey webhooks. One row per HTTP attempt — multiple
 * rows per logical event when the dispatcher retries. The pair (webhookId,
 * createdAt) gives the timeline; `attempt` is 1..N within a single dispatch.
 */
export const surveyWebhookDeliveries = pgTable('survey_webhook_deliveries', {
  id: serial('id').primaryKey(),
  webhookId: integer('webhook_id').notNull().references(() => surveyWebhooks.id, { onDelete: 'cascade' }),
  event: varchar('event', { length: 50 }).notNull(),
  attempt: integer('attempt').notNull().default(1),
  // 'success' | 'failed' | 'pending' — `pending` reserved for the future
  // BullMQ job pickup; today we only persist terminal states.
  status: varchar('status', { length: 20 }).notNull(),
  statusCode: integer('status_code'),
  requestBody: json('request_body').$type<Record<string, unknown>>(),
  responseBody: text('response_body'),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const surveyEmailSequences = pgTable('survey_email_sequences', {
  id: serial('id').primaryKey(),
  surveyId: integer('survey_id').notNull().references(() => surveys.id, { onDelete: 'cascade' }),
  subject: varchar('subject', { length: 255 }).notNull(),
  bodyHtml: text('body_html').notNull(),
  delayHours: integer('delay_hours').notNull().default(0),
  conditionField: varchar('condition_field', { length: 64 }),
  conditionValue: varchar('condition_value', { length: 255 }),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const surveyVariants = pgTable('survey_variants', {
  id: serial('id').primaryKey(),
  surveyId: integer('survey_id').notNull().references(() => surveys.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  fields: json('fields').$type<SurveyFieldDef[]>().notNull().default([]),
  weight: integer('weight').notNull().default(50),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const surveyAiSummaries = pgTable('survey_ai_summaries', {
  id: serial('id').primaryKey(),
  surveyId: integer('survey_id').notNull().unique().references(() => surveys.id, { onDelete: 'cascade' }),
  summary: text('summary').notNull(),
  sentiment: varchar('sentiment', { length: 20 }),
  themes: json('themes'),
  perQuestion: json('per_question'),
  responseCountAtGeneration: integer('response_count_at_generation'),
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
});

// ============================================================================
// Website Email Templates — Transactional / Event-Triggered
// ============================================================================

