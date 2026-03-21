import { pgTable, serial, varchar, text, timestamp, boolean, integer, json } from 'drizzle-orm/pg-core';

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  postType: varchar('post_type', { length: 50 }).default('blog').notNull(),
  excerpt: text('excerpt'),
  content: text('content').notNull(),
  coverImage: varchar('cover_image', { length: 500 }),
  published: boolean('published').default(false).notNull(),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  description: text('description'),
  color: varchar('color', { length: 7 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const postCategories = pgTable('post_categories', {
  id: serial('id').primaryKey(),
  postId: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  categoryId: integer('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
});

export const tags = pgTable('tags', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 50 }).notNull().unique(),
  slug: varchar('slug', { length: 50 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const postTags = pgTable('post_tags', {
  id: serial('id').primaryKey(),
  postId: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  tagId: integer('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).default('editor').notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const postTypes = pgTable('post_types', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  description: text('description'),
  icon: varchar('icon', { length: 50 }).default('article'),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const customFields = pgTable('custom_fields', {
  id: serial('id').primaryKey(),
  postTypeId: integer('post_type_id').notNull().references(() => postTypes.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  fieldType: varchar('field_type', { length: 50 }).notNull(), // text, textarea, number, date, select, checkbox, url, email, etc.
  options: json('options'), // For select/radio - stores array of options
  required: boolean('required').default(false).notNull(),
  defaultValue: text('default_value'),
  helpText: text('help_text'),
  order: integer('order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const postCustomFieldValues = pgTable('post_custom_field_values', {
  id: serial('id').primaryKey(),
  postId: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  customFieldId: integer('custom_field_id').notNull().references(() => customFields.id, { onDelete: 'cascade' }),
  value: text('value'), // Store as text, will parse JSON if needed
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Block Templates - saved reusable block configurations
export const blockTemplates = pgTable('block_templates', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  description: text('description'),
  category: varchar('category', { length: 100 }).default('custom').notNull(), // custom, section, global
  scope: varchar('scope', { length: 50 }).default('block').notNull(), // block (single), section (multi-block), global (synced)
  blocks: json('blocks').notNull(), // JSON array of Block objects
  thumbnail: varchar('thumbnail', { length: 500 }), // preview image URL
  tags: json('tags').$type<string[]>().default([]), // searchable tags
  lockedFields: json('locked_fields').$type<string[]>().default([]), // field paths that can't be edited (e.g., "0.type", "0.style.backgroundColor")
  version: integer('version').default(1).notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Tracks which posts use global templates (for sync)
export const blockTemplateUsages = pgTable('block_template_usages', {
  id: serial('id').primaryKey(),
  templateId: integer('template_id').notNull().references(() => blockTemplates.id, { onDelete: 'cascade' }),
  postId: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  blockPath: varchar('block_path', { length: 255 }).notNull(), // JSON path to the block in the post content (e.g., "blocks[2]" or "blocks[0].columns[1].blocks[0]")
  syncedVersion: integer('synced_version').default(1).notNull(), // which template version this usage is on
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const media = pgTable('media', {
  id: serial('id').primaryKey(),
  filename: varchar('filename', { length: 255 }).notNull(),
  storedFilename: varchar('stored_filename', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  fileSize: integer('file_size').notNull(),
  width: integer('width'),
  height: integer('height'),
  url: varchar('url', { length: 500 }).notNull(),
  thumbnailUrl: varchar('thumbnail_url', { length: 500 }),
  alt: text('alt'),
  caption: text('caption'),
  uploadedBy: integer('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── CLIENT PORTAL ────────────────────────────────────────────────────────────

// Extended profile for users with role='client'
export const clients = pgTable('clients', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  company: varchar('company', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  website: varchar('website', { length: 255 }),
  address: text('address'),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  notes: text('notes'), // internal staff notes
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 50 }).default('active').notNull(), // active, paused, completed, archived
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const kanbanCards = pgTable('kanban_cards', {
  id: serial('id').primaryKey(),
  columnId: integer('column_id').notNull().references(() => kanbanColumns.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  assignedTo: integer('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  dueDate: timestamp('due_date'),
  priority: varchar('priority', { length: 20 }).default('medium'), // low, medium, high, urgent
  order: integer('order').default(0).notNull(),
  sprintId: integer('sprint_id').references(() => sprints.id, { onDelete: 'set null' }),
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Survey / intake form field definition
export interface SurveyField {
  id: string;
  type: 'text' | 'textarea' | 'number' | 'email' | 'phone' | 'url' | 'select' | 'radio' | 'checkbox' | 'toggle' | 'date' | 'rating' | 'heading' | 'slider';
  label: string;
  placeholder?: string;
  helpText?: string;
  required: boolean;
  options?: string[]; // for select / radio / checkbox
  min?: number; // for slider
  max?: number; // for slider
  step?: number; // for slider
  showIf?: { fieldId: string; values: string[] }; // show this field only when another field matches
  conditionalOptions?: { fieldId: string; map: Record<string, string[]>; default?: string[] }; // swap options based on another field
  order: number;
}

// White-label service catalog (domains, hosting, dev, maintenance)
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
  notes: text('notes'),
  metadata: json('metadata'), // domain name, server details, etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const invoices = pgTable('invoices', {
  id: serial('id').primaryKey(),
  number: varchar('number', { length: 50 }).notNull().unique(), // INV-2026-001
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 50 }).default('draft').notNull(), // draft, sent, paid, overdue, cancelled
  dueDate: timestamp('due_date'),
  paidAt: timestamp('paid_at'),
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),
  stripeCheckoutSessionId: varchar('stripe_checkout_session_id', { length: 255 }),
  subtotal: integer('subtotal').notNull(), // in cents
  tax: integer('tax').default(0).notNull(),
  total: integer('total').notNull(),
  notes: text('notes'),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const invoiceItems = pgTable('invoice_items', {
  id: serial('id').primaryKey(),
  invoiceId: integer('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  description: varchar('description', { length: 255 }).notNull(),
  quantity: integer('quantity').default(1).notNull(),
  unitPrice: integer('unit_price').notNull(), // in cents
  total: integer('total').notNull(), // in cents
  serviceId: integer('service_id').references(() => services.id, { onDelete: 'set null' }),
});

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

export const aiConversations = pgTable('ai_conversations', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).default('New Conversation').notNull(),
  flagged: boolean('flagged').default(false).notNull(),
  totalInputTokens: integer('total_input_tokens').default(0).notNull(),
  totalOutputTokens: integer('total_output_tokens').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const aiMessages = pgTable('ai_messages', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id').notNull().references(() => aiConversations.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull(), // user, assistant
  content: text('content').notNull(),
  toolCalls: json('tool_calls').$type<{ name: string; input: Record<string, unknown>; result: unknown }[]>(),
  injectedBy: integer('injected_by').references(() => users.id, { onDelete: 'set null' }),
  inputTokens: integer('input_tokens').default(0).notNull(),
  outputTokens: integer('output_tokens').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── EMAIL MARKETING ──────────────────────────────────────────────────────────

export const emailLists = pgTable('email_lists', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  clientId: integer('client_id').references(() => clients.id, { onDelete: 'cascade' }), // null = global (agency newsletter etc.)
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

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
});

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
  status: varchar('status', { length: 20 }).default('draft').notNull(), // draft, scheduled, sending, sent, cancelled
  scheduledAt: timestamp('scheduled_at'),
  sentAt: timestamp('sent_at'),
  totalRecipients: integer('total_recipients').default(0).notNull(),
  totalSent: integer('total_sent').default(0).notNull(),
  totalOpened: integer('total_opened').default(0).notNull(),
  totalClicked: integer('total_clicked').default(0).notNull(),
  totalBounced: integer('total_bounced').default(0).notNull(),
  totalUnsubscribed: integer('total_unsubscribed').default(0).notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const emailCampaignSends = pgTable('email_campaign_sends', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id').notNull().references(() => emailCampaigns.id, { onDelete: 'cascade' }),
  subscriberId: integer('subscriber_id').notNull().references(() => emailSubscribers.id, { onDelete: 'cascade' }),
  resendEmailId: varchar('resend_email_id', { length: 255 }), // ID returned by Resend
  sentAt: timestamp('sent_at'),
  openedAt: timestamp('opened_at'),
  clickedAt: timestamp('clicked_at'),
  bouncedAt: timestamp('bounced_at'),
  complainedAt: timestamp('complained_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
