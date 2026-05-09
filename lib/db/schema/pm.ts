// Projects, sprints, kanban boards (cards/labels/checklists), webhooks, support tickets.

import { pgTable, serial, varchar, text, timestamp, boolean, integer, json, jsonb, primaryKey, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { clients } from './sites';
import { SurveyField } from './cms';

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  projectKey: varchar('project_key', { length: 10 }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 50 }).default('active').notNull(), // active, paused, completed, archived
  // is_private is retained for audit/back-compat. As of 2026-05 the unified
  // permission model uses project_members.role and `staff` resolution; new
  // routes must NOT branch on isPrivate.
  isPrivate: boolean('is_private').default(false).notNull(),
  startDate: timestamp('start_date'),
  dueDate: timestamp('due_date'),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Per-project member roles. Staff (admin/employee) have implicit owner-equivalent
// access on every project and do not need a row here; non-staff portal users
// (the client + their team) must be members to view/edit.
//   owner    — full control: rename, delete, manage members, all editor rights
//   editor   — create/edit cards, columns, sprints, labels, files, webhooks
//   commenter— comment, log time, attach files; cannot mutate structure
//   viewer   — read-only
export const projectMembers = pgTable('project_members', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).default('viewer').notNull(),
  addedBy: integer('added_by').references(() => users.id, { onDelete: 'set null' }),
  addedAt: timestamp('added_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('project_members_project_user_idx').on(t.projectId, t.userId),
  index('project_members_user_idx').on(t.userId),
]);

export const sprints = pgTable('sprints', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  goal: text('goal'),
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  status: varchar('status', { length: 20 }).default('planning').notNull(), // planning, active, completed
  order: integer('order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const kanbanColumns = pgTable('kanban_columns', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  order: integer('order').default(0).notNull(),
  color: varchar('color', { length: 7 }),
  isDone: boolean('is_done').default(false).notNull(),
  wipLimit: integer('wip_limit'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const kanbanCards = pgTable('kanban_cards', {
  id: serial('id').primaryKey(),
  columnId: integer('column_id').notNull().references(() => kanbanColumns.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  number: integer('number'),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  dueDate: timestamp('due_date'),
  priority: varchar('priority', { length: 20 }).default('medium'), // low, medium, high, urgent
  order: integer('order').default(0).notNull(),
  sprintId: integer('sprint_id').references(() => sprints.id, { onDelete: 'set null' }),
  sprintOrder: integer('sprint_order'),
  // Agile foundation (added 2026-05). Workflow state is intentionally separate
  // from column position so a project can model a workflow that doesn't map 1:1
  // to physical columns (e.g. parallel review/qa columns that all = in_review).
  storyPoints: integer('story_points'),
  cardType: varchar('card_type', { length: 20 }).default('task').notNull(), // task, story, epic, bug, spike
  parentCardId: integer('parent_card_id'),
  workflowState: varchar('workflow_state', { length: 20 }).default('todo').notNull(), // todo, in_progress, in_review, done, canceled
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const supportTickets = pgTable('support_tickets', {
  id: serial('id').primaryKey(),
  number: integer('number').notNull(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  subject: varchar('subject', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }).default('open').notNull(), // open, in_progress, waiting_on_customer (legacy: waiting), resolved, closed
  priority: varchar('priority', { length: 20 }).default('medium').notNull(), // low, medium, high, urgent
  category: varchar('category', { length: 50 }).default('general'), // general, billing, technical, domain, hosting
  assignedTo: integer('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  resolvedAt: timestamp('resolved_at'),
  // SLA targets — populated on create from priority via lib/tickets/sla.ts
  firstResponseDueAt: timestamp('first_response_due_at'),
  firstResponseAt: timestamp('first_response_at'),
  resolutionDueAt: timestamp('resolution_due_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const ticketMessages = pgTable('ticket_messages', {
  id: serial('id').primaryKey(),
  ticketId: integer('ticket_id').notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
  authorId: integer('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  isInternal: boolean('is_internal').default(false).notNull(), // staff-only notes hidden from client
  attachments: json('attachments').$type<{ url: string; filename: string; mimeType: string; fileSize: number }[]>().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Survey / intake form field definition

export const kanbanCardFiles = pgTable('kanban_card_files', {
  id: serial('id').primaryKey(),
  cardId: integer('card_id').notNull().references(() => kanbanCards.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  commentId: integer('comment_id'), // set after comment is created; null = direct card attachment
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  storedFilename: varchar('stored_filename', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  fileSize: integer('file_size').notNull(),
  url: varchar('url', { length: 500 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const kanbanCardComments = pgTable('kanban_card_comments', {
  id: serial('id').primaryKey(),
  cardId: integer('card_id').notNull().references(() => kanbanCards.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  body: text('body').notNull(),
  mentions: json('mentions').$type<number[]>().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const kanbanCardTimeLogs = pgTable('kanban_card_time_logs', {
  id: serial('id').primaryKey(),
  cardId: integer('card_id').notNull().references(() => kanbanCards.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  minutes: integer('minutes').notNull(),
  note: text('note'),
  loggedAt: timestamp('logged_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const kanbanLabels = pgTable('kanban_labels', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 50 }).notNull(),
  color: varchar('color', { length: 7 }).default('#6366f1').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const kanbanCardLabels = pgTable('kanban_card_labels', {
  cardId: integer('card_id').notNull().references(() => kanbanCards.id, { onDelete: 'cascade' }),
  labelId: integer('label_id').notNull().references(() => kanbanLabels.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.cardId, t.labelId] }) }));

export const kanbanCardActivities = pgTable('kanban_card_activities', {
  id: serial('id').primaryKey(),
  cardId: integer('card_id').notNull().references(() => kanbanCards.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  type: varchar('type', { length: 50 }).notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const kanbanCardChecklistItems = pgTable('kanban_card_checklist_items', {
  id: serial('id').primaryKey(),
  cardId: integer('card_id').notNull().references(() => kanbanCards.id, { onDelete: 'cascade' }),
  text: varchar('text', { length: 500 }).notNull(),
  completed: boolean('completed').default(false).notNull(),
  order: integer('order').default(0).notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  completedBy: integer('completed_by').references(() => users.id, { onDelete: 'set null' }),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const kanbanCardAssignees = pgTable('kanban_card_assignees', {
  cardId: integer('card_id').notNull().references(() => kanbanCards.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.cardId, t.userId] }) }));

export const kanbanCardWatchers = pgTable('kanban_card_watchers', {
  cardId: integer('card_id').notNull().references(() => kanbanCards.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.cardId, t.userId] }) }));

export const kanbanCardDependencies = pgTable('kanban_card_dependencies', {
  blockedCardId: integer('blocked_card_id').notNull().references(() => kanbanCards.id, { onDelete: 'cascade' }),
  blockerCardId: integer('blocker_card_id').notNull().references(() => kanbanCards.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.blockedCardId, t.blockerCardId] }) }));

// Event-log of every change to a sprint's scope. This is what powers burndown/
// velocity charts — by replaying events between sprint.startDate and a point in
// time, you reconstruct (a) committed point total at sprint start, (b) remaining
// open points at any moment, (c) completed points by end. Snapshots are written
// from lib/portal/sprint-snapshots.ts on: card added to sprint, card removed
// from sprint, card moved to a `is_done` column, card reopened from done, and a
// `sprint_started` synthetic row at sprint.status → active. `points` records the
// card's storyPoints at the moment of the event so post-hoc point edits don't
// retroactively change historical charts.
export const sprintScopeHistory = pgTable('sprint_scope_history', {
  id: serial('id').primaryKey(),
  sprintId: integer('sprint_id').notNull().references(() => sprints.id, { onDelete: 'cascade' }),
  cardId: integer('card_id').references(() => kanbanCards.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 20 }).notNull(), // sprint_started, added, removed, completed, reopened
  points: integer('points'), // snapshot of card.storyPoints at time of event; null if untyped
  occurredAt: timestamp('occurred_at').defaultNow().notNull(),
  occurredBy: integer('occurred_by').references(() => users.id, { onDelete: 'set null' }),
}, (t) => [
  index('sprint_scope_history_sprint_idx').on(t.sprintId, t.occurredAt),
]);

export const kanbanCardArtifacts = pgTable('kanban_card_artifacts', {
  id: serial('id').primaryKey(),
  cardId: integer('card_id').notNull().references(() => kanbanCards.id, { onDelete: 'cascade' }),
  artifactType: varchar('artifact_type', { length: 50 }).notNull(), // website, email_campaign, pitch_deck, proposal, booking, survey, project
  artifactId: integer('artifact_id').notNull(),
  displayTitle: varchar('display_title', { length: 255 }).notNull(),
  pinned: boolean('pinned').default(false).notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const projectWebhooks = pgTable('project_webhooks', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  url: varchar('url', { length: 500 }).notNull(),
  secret: varchar('secret', { length: 64 }).notNull(),
  events: jsonb('events').$type<string[]>().default([]).notNull(),
  active: boolean('active').default(true).notNull(),
  lastFiredAt: timestamp('last_fired_at'),
  lastStatus: integer('last_status'),
  failureCount: integer('failure_count').default(0).notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const projectWebhookDeliveries = pgTable('project_webhook_deliveries', {
  id: serial('id').primaryKey(),
  webhookId: integer('webhook_id').notNull().references(() => projectWebhooks.id, { onDelete: 'cascade' }),
  event: varchar('event', { length: 50 }).notNull(),
  status: integer('status'),
  error: text('error'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Recurring card creation. A scheduler (Vercel cron, Railway cron, etc.)
// hits /api/cron/pm-recurrences periodically; the processor reads rows where
// next_fire_at <= now() and active = true, materializes a card on the
// configured column (optionally seeded from a card_template), then advances
// next_fire_at. last_fired_at + last_fired_card_id are kept for audit.
export const cardRecurrences = pgTable('card_recurrences', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  columnId: integer('column_id').notNull().references(() => kanbanColumns.id, { onDelete: 'cascade' }),
  templateId: integer('template_id').references(() => cardTemplates.id, { onDelete: 'set null' }),
  // Fallback fields used when templateId is null. titlePattern can include
  // `{{date}}` which the processor replaces with the firing date in
  // YYYY-MM-DD form, so weekly status cards get unique titles.
  titlePattern: varchar('title_pattern', { length: 255 }),
  description: text('description'),
  cadence: varchar('cadence', { length: 20 }).notNull(), // daily, weekly, monthly
  dayOfWeek: integer('day_of_week'),  // 0=Sun..6=Sat — required for weekly
  dayOfMonth: integer('day_of_month'), // 1..28 — required for monthly
  hourUtc: integer('hour_utc').default(9).notNull(),    // 0..23
  active: boolean('active').default(true).notNull(),
  lastFiredAt: timestamp('last_fired_at'),
  lastFiredCardId: integer('last_fired_card_id'),
  nextFireAt: timestamp('next_fire_at').notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('card_recurrences_due_idx').on(t.active, t.nextFireAt),
  index('card_recurrences_project_idx').on(t.projectId),
]);

// Reusable card templates. projectId=null means a client-wide template
// (visible across every project of the client); projectId set scopes the
// template to one project. The payload is intentionally a free-form blob so
// the writer can evolve fields without a migration — runtime code applies
// only the keys it knows about.
export const cardTemplates = pgTable('card_templates', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  payload: jsonb('payload').$type<{
    titlePattern?: string;
    description?: string;
    cardType?: string;
    priority?: string;
    storyPoints?: number;
    workflowState?: string;
    labelIds?: number[];
    checklist?: { text: string; order: number }[];
  }>().default({}).notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('card_templates_client_idx').on(t.clientId),
  index('card_templates_project_idx').on(t.projectId),
]);

// Saved views for the kanban board, backlog, and reports surfaces. A view
// captures a name + a filterJson that the corresponding UI knows how to
// interpret (e.g. backlog: { typeFilter, sizedOnly, search }). Per-user
// views (userId set) are private to that user; project-wide views (userId
// null) are visible to every project member and editable by owners +
// editors.
export const projectSavedViews = pgTable('project_saved_views', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  scope: varchar('scope', { length: 20 }).notNull(), // backlog, board, reports
  name: varchar('name', { length: 100 }).notNull(),
  filterJson: jsonb('filter_json').$type<Record<string, unknown>>().default({}).notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('project_saved_views_project_idx').on(t.projectId, t.scope),
  index('project_saved_views_user_idx').on(t.userId, t.projectId),
]);

// In-app notifications. Written alongside the email-notification flow in
// lib/pm-notifications.ts so the inbox UI and the email channel stay in
// sync. `kind` mirrors the kanban_card_activities.type vocabulary plus
// 'comment.mention' for direct @-mentions of users who aren't watchers.
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 50 }).notNull(),
  cardId: integer('card_id').references(() => kanbanCards.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  actorUserId: integer('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body'),
  payload: jsonb('payload').$type<Record<string, unknown>>(),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('notifications_user_unread_idx').on(t.userId, t.readAt),
  index('notifications_card_idx').on(t.cardId),
]);

// Suggested projects shown to clients in the portal

export const suggestedProjects = pgTable('suggested_projects', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 100 }).default('development').notNull(), // website, ecommerce, mobile, maintenance, branding, other
  estimatedPrice: integer('estimated_price'), // in cents, nullable = quote on request
  estimatedTimeline: varchar('estimated_timeline', { length: 100 }), // e.g. "2–4 weeks"
  features: json('features').$type<string[]>().default([]),
  icon: varchar('icon', { length: 50 }).default('rocket_launch').notNull(),
  active: boolean('active').default(true).notNull(),
  clientId: integer('client_id').references(() => clients.id, { onDelete: 'cascade' }), // null = global (all clients)
  order: integer('order').default(0).notNull(),
  surveyFields: json('survey_fields').$type<SurveyField[]>().default([]),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const suggestedProjectRequests = pgTable('suggested_project_requests', {
  id: serial('id').primaryKey(),
  suggestedProjectId: integer('suggested_project_id').notNull().references(() => suggestedProjects.id, { onDelete: 'restrict' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 50 }).default('pending').notNull(), // pending, reviewed, approved, rejected
  answers: json('answers').$type<Record<string, unknown>>(),
  message: text('message'),
  adminNotes: text('admin_notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

