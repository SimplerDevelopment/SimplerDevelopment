// Surveys / intake forms with recommendation engine, AI summaries, and partial-response capture.

import { pgTable, serial, varchar, text, timestamp, boolean, integer, json, uniqueIndex, index } from 'drizzle-orm/pg-core';
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
  /**
   * Comparison operator applied to the dependency field's answer.
   *
   * - `equals` / `not_equals`: ANY of `values` matches the stringified answer.
   * - `contains` / `not_contains`: ANY of `values` is a case-insensitive substring of the stringified answer.
   * - `greater_than` / `less_than`: `Number(answer)` compared to `Number(values[0])`.
   * - `is_empty` / `is_not_empty`: presence check; `values` is ignored.
   */
  operator:
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'not_contains'
    | 'greater_than'
    | 'less_than'
    | 'is_empty'
    | 'is_not_empty';
  values: string[];
}

export interface ShowIfCondition {
  combinator: 'AND';
  rules: ShowIfRule[];
}

/**
 * SCORE-01: per-field scoring rule. JSON-only (lives inside `surveys.fields`
 * and `surveyVariants.fields`). The submit endpoint runs `computeSurveyScore`
 * over the served field set after a response is inserted and writes the total
 * back to `surveyResponses.score`.
 *
 * - `option_map`: select / radio / checkbox / toggle — map each option label
 *   (or "Yes"/"No" for toggles) to a numeric weight. Checkbox answers are
 *   string[]; the score is the sum of each selected option's mapped value.
 *   Unknown / missing keys contribute 0.
 * - `numeric`: rating / slider / number — `weight * Number(answer)` if the
 *   answer parses as a finite number, else 0.
 * - `nps`: rating / slider — 0-6 → -1 (detractor), 7-8 → 0 (passive),
 *   9-10 → +1 (promoter). Anything else → 0.
 */
export type FieldScoring =
  | { type: 'option_map'; options: Record<string, number> }
  | { type: 'numeric'; weight: number }
  | { type: 'nps' };

export interface SurveyFieldDef {
  id: string;
  type: 'text' | 'textarea' | 'number' | 'email' | 'phone' | 'url'
    | 'select' | 'radio' | 'checkbox' | 'toggle' | 'date' | 'rating' | 'heading' | 'slider'
    | 'page_break' | 'file';
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
  // SCORE-01: optional per-field scoring rule. See `FieldScoring` above.
  scoring?: FieldScoring;
}

/**
 * SCORE-02: survey-level scoring config — currently just the CRM auto-route
 * rule. Persisted in `surveys.scoring_config` (jsonb). When `autoRouteToCrm`
 * is enabled and a submitted response's score crosses `minScore` AND a
 * respondent email is captured, the submit endpoint creates a `crmDeals` row
 * in the chosen pipeline/stage. Failures are swallowed — a CRM hiccup must
 * never fail the public survey submit.
 */
export interface SurveyScoringConfig {
  autoRouteToCrm?: {
    enabled: boolean;
    minScore: number;           // create a deal when score >= minScore
    pipelineId: number;         // which CRM pipeline
    stageId: number;            // which stage to drop the deal into
    dealTitleTemplate?: string; // e.g. "Survey lead: {surveyTitle} ({respondentEmail})"
  };
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
  // DIST-03/04: when true, /s/{slug}/results renders an aggregated public
  // results page. Aggregate-only by API contract — no individual responses
  // are exposed. Off by default; surveys must explicitly opt in.
  publishResults: boolean('publish_results').default(false).notNull(),
  // PDF-01: when true, the public thank-you screen renders a "Download
  // Certificate" link that hits /api/surveys/{slug}/certificate to fetch a
  // branded completion PDF. Off by default; owners must opt in.
  certificateEnabled: boolean('certificate_enabled').default(false).notNull(),
  // DIST-02: field id whose truthy answer represents the respondent's consent
  // to receive post-submission follow-up email sequences. Nullable — when
  // null, presence of `respondentEmail` is treated as sufficient (back-compat
  // with surveys created before this column existed).
  consentField: varchar('consent_field', { length: 64 }),
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
  // SCORE-02: survey-level scoring config (CRM auto-route threshold rules).
  // Null means no scoring config; per-field rules in `fields[*].scoring` may
  // still produce a score, it just won't auto-create CRM deals.
  scoringConfig: json('scoring_config').$type<SurveyScoringConfig>(),
  // Meta
  responseCount: integer('response_count').default(0).notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  // Self-reference for the `surveys_fork` tool. Informational pointer only —
  // no FK to keep the parent-deleted case simple (matches posts/decks/email
  // campaigns / block_templates).
  parentSurveyId: integer('parent_survey_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  // E2 perf — portal/surveys list filters by clientId ordered by updatedAt desc.
  index('surveys_client_updated_idx').on(t.clientId, t.updatedAt),
]);

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
  // SCORE-01: computed total from `computeSurveyScore` over the served field
  // set. Null when the survey has no scoring rules configured. Integer so it
  // can be indexed / filtered cheaply later.
  score: integer('score'),
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
}, (t) => ({
  // RESP-02: one partial row per (survey, session). The upsert in
  // /api/surveys/[slug]/partial keys off this index.
  surveySessionUnique: uniqueIndex('survey_partial_responses_survey_session_idx').on(t.surveyId, t.sessionId),
}));

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

/**
 * Per-(sequence, response) send audit row (DIST-01).
 *
 * One row per actual send attempt. The unique index on
 * (sequenceId, surveyResponseId) is the idempotency guard for the cron
 * worker: even if two ticks pick up the same pending tuple, only the first
 * INSERT wins and the second silently no-ops via onConflictDoNothing.
 *
 * `resendEmailId` stores Resend's id so a future bounce/complaint webhook
 * can be correlated back to the sequence that triggered it. `error` captures
 * the resend failure message when the send blew up; the row still gets
 * inserted so we don't infinitely retry the same broken (sequence, response)
 * pair.
 */
export const surveyEmailSequenceSends = pgTable('survey_email_sequence_sends', {
  id: serial('id').primaryKey(),
  sequenceId: integer('sequence_id').notNull().references(() => surveyEmailSequences.id, { onDelete: 'cascade' }),
  surveyResponseId: integer('survey_response_id').notNull().references(() => surveyResponses.id, { onDelete: 'cascade' }),
  sentAt: timestamp('sent_at').defaultNow().notNull(),
  resendEmailId: varchar('resend_email_id', { length: 255 }),
  error: text('error'),
}, (t) => ({
  // Idempotency: each (sequence, response) tuple sends exactly once.
  sequenceResponseUnique: uniqueIndex('survey_email_sequence_sends_sequence_response_idx')
    .on(t.sequenceId, t.surveyResponseId),
}));

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

