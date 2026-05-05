// Projects, sprints, kanban boards (cards/labels/checklists), webhooks, support tickets.

import { pgTable, serial, varchar, text, timestamp, boolean, integer, json, jsonb, primaryKey } from 'drizzle-orm/pg-core';
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
  isPrivate: boolean('is_private').default(false).notNull(), // false = agency project, true = client-managed
  startDate: timestamp('start_date'),
  dueDate: timestamp('due_date'),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

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
  status: varchar('status', { length: 50 }).default('open').notNull(), // open, in_progress, waiting, resolved, closed
  priority: varchar('priority', { length: 20 }).default('medium').notNull(), // low, medium, high, urgent
  category: varchar('category', { length: 50 }).default('general'), // general, billing, technical, domain, hosting
  assignedTo: integer('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  resolvedAt: timestamp('resolved_at'),
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

