import { pgTable, serial, varchar, text, timestamp, boolean, integer, json, uniqueIndex, numeric } from 'drizzle-orm/pg-core';

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  postType: varchar('post_type', { length: 50 }).default('blog').notNull(),
  excerpt: text('excerpt'),
  content: text('content').notNull(),
  coverImage: varchar('cover_image', { length: 500 }),
  published: boolean('published').default(false).notNull(),
  publishedAt: timestamp('published_at'),
  // SEO fields
  seoTitle: varchar('seo_title', { length: 255 }),
  seoDescription: text('seo_description'),
  ogImage: varchar('og_image', { length: 500 }),
  noIndex: boolean('no_index').default(false).notNull(),
  canonicalUrl: varchar('canonical_url', { length: 500 }),
  // null = agency website; non-null = client website
  websiteId: integer('website_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  description: text('description'),
  color: varchar('color', { length: 7 }),
  websiteId: integer('website_id').references(() => clientWebsites.id, { onDelete: 'cascade' }), // null = global/admin
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('categories_slug_website_idx').on(t.slug, t.websiteId),
]);

export const postCategories = pgTable('post_categories', {
  id: serial('id').primaryKey(),
  postId: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  categoryId: integer('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
});

export const tags = pgTable('tags', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 50 }).notNull(),
  slug: varchar('slug', { length: 50 }).notNull(),
  websiteId: integer('website_id').references(() => clientWebsites.id, { onDelete: 'cascade' }), // null = global/admin
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('tags_slug_website_idx').on(t.slug, t.websiteId),
]);

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
  websiteId: integer('website_id').references(() => clientWebsites.id, { onDelete: 'cascade' }), // null = global/admin
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
export const githubConnections = pgTable('github_connections', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  githubUserId: integer('github_user_id').notNull(),
  githubUsername: varchar('github_username', { length: 100 }).notNull(),
  accessToken: text('access_token').notNull(),
  scope: varchar('scope', { length: 500 }),
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

// ─── HOSTING & DNS ────────────────────────────────────────────────────────────

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
  vercelProjectId: varchar('vercel_project_id', { length: 255 }),
  vercelProjectUrl: varchar('vercel_project_url', { length: 500 }),
  vercelDomain: varchar('vercel_domain', { length: 255 }),
  deploymentStatus: varchar('deployment_status', { length: 50 }).default('pending'), // pending, provisioning, active, failed
  lastDeployedAt: timestamp('last_deployed_at'),
  provisionError: text('provision_error'),
  logApiKey: varchar('log_api_key', { length: 64 }), // secret key for request log ingestion
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
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

export interface PitchDeckSlide {
  id: string;
  type: 'cover' | 'problem' | 'solution' | 'features' | 'process' | 'metrics' | 'testimonial' | 'team' | 'pricing' | 'cta' | 'custom';
  headline?: string;
  subheadline?: string;
  body?: string;
  bullets?: string[];
  stats?: { label: string; value: string }[];
  steps?: { title: string; description: string }[];
  members?: { name: string; role: string; image?: string }[];
  tiers?: { name: string; price: string; features: string[]; highlighted?: boolean }[];
  columns?: number; // controls grid columns for items (2, 3, 4, etc.)
  image?: string;
  notes?: string;
}

export interface PitchDeckTheme {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  logo?: string;
}

export const pitchDecks = pgTable('pitch_decks', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).default('draft').notNull(), // draft, published, archived
  slides: json('slides').$type<PitchDeckSlide[]>().default([]),
  theme: json('theme').$type<PitchDeckTheme>().default({
    primaryColor: '#2563eb',
    accentColor: '#60a5fa',
    backgroundColor: '#0f172a',
    textColor: '#f8fafc',
    headingFont: 'Inter',
    bodyFont: 'Inter',
  }),
  sourceUrl: varchar('source_url', { length: 500 }), // website used for branding
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const pitchDeckVersions = pgTable('pitch_deck_versions', {
  id: serial('id').primaryKey(),
  deckId: integer('deck_id').notNull().references(() => pitchDecks.id, { onDelete: 'cascade' }),
  slides: json('slides').$type<PitchDeckSlide[]>().notNull(),
  theme: json('theme').$type<PitchDeckTheme>().notNull(),
  label: varchar('label', { length: 255 }), // null = auto-save, string = manual checkpoint
  trigger: varchar('trigger', { length: 50 }).notNull(), // 'manual', 'ai_generate', 'ai_slide_edit', 'ai_regenerate'
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── BOOKING TOOL ─────────────────────────────────────────────────────────────

export interface BookingAvailabilitySlot {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sunday
  startTime: string; // "09:00"
  endTime: string;   // "17:00"
  enabled: boolean;
}

export interface BookingQuestion {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  required: boolean;
  options?: string[];
}

export const bookingPages = pgTable('booking_pages', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  description: text('description'),
  duration: integer('duration').default(30).notNull(), // minutes
  bufferBefore: integer('buffer_before').default(0).notNull(), // minutes
  bufferAfter: integer('buffer_after').default(15).notNull(), // minutes
  maxAdvanceDays: integer('max_advance_days').default(60).notNull(),
  minNoticeMins: integer('min_notice_mins').default(60).notNull(),
  timezone: varchar('timezone', { length: 100 }).default('America/New_York').notNull(),
  availability: json('availability').$type<BookingAvailabilitySlot[]>().default([
    { day: 1, startTime: '09:00', endTime: '17:00', enabled: true },
    { day: 2, startTime: '09:00', endTime: '17:00', enabled: true },
    { day: 3, startTime: '09:00', endTime: '17:00', enabled: true },
    { day: 4, startTime: '09:00', endTime: '17:00', enabled: true },
    { day: 5, startTime: '09:00', endTime: '17:00', enabled: true },
    { day: 0, startTime: '09:00', endTime: '17:00', enabled: false },
    { day: 6, startTime: '09:00', endTime: '17:00', enabled: false },
  ]),
  questions: json('questions').$type<BookingQuestion[]>().default([]),
  color: varchar('color', { length: 7 }).default('#2563eb'),
  active: boolean('active').default(true).notNull(),
  googleCalendarSync: boolean('google_calendar_sync').default(false).notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const bookings = pgTable('bookings', {
  id: serial('id').primaryKey(),
  bookingPageId: integer('booking_page_id').notNull().references(() => bookingPages.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  guestName: varchar('guest_name', { length: 255 }).notNull(),
  guestEmail: varchar('guest_email', { length: 255 }).notNull(),
  guestPhone: varchar('guest_phone', { length: 50 }),
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time').notNull(),
  timezone: varchar('timezone', { length: 100 }).notNull(),
  status: varchar('status', { length: 20 }).default('confirmed').notNull(), // confirmed, cancelled, completed, no_show
  answers: json('answers').$type<Record<string, string>>(),
  notes: text('notes'),
  googleEventId: varchar('google_event_id', { length: 255 }),
  cancelToken: varchar('cancel_token', { length: 64 }).notNull(),
  cancelledAt: timestamp('cancelled_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const googleCalendarTokens = pgTable('google_calendar_tokens', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }).unique(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  calendarId: varchar('calendar_id', { length: 255 }).default('primary').notNull(),
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

// Saved payment methods (mirrors Stripe PaymentMethod objects)
export const paymentMethods = pgTable('payment_methods', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  stripePaymentMethodId: varchar('stripe_payment_method_id', { length: 255 }).notNull(),
  brand: varchar('brand', { length: 50 }).notNull(), // visa, mastercard, amex, etc.
  last4: varchar('last4', { length: 4 }).notNull(),
  expMonth: integer('exp_month').notNull(),
  expYear: integer('exp_year').notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── GOOGLE WEBSITE INTEGRATIONS ─────────────────────────────────────────────

// Per-website Google OAuth tokens for Search Console + Analytics
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
export const storeSettings = pgTable('store_settings', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }).unique(),
  enabled: boolean('enabled').default(false).notNull(),
  storeName: varchar('store_name', { length: 255 }),
  currency: varchar('currency', { length: 3 }).default('USD').notNull(),
  taxRate: numeric('tax_rate', { precision: 5, scale: 4 }).default('0'), // e.g. 0.0825 = 8.25%
  taxInclusive: boolean('tax_inclusive').default(false).notNull(),
  // Stripe Connect for payouts to the website owner
  stripeAccountId: varchar('stripe_account_id', { length: 255 }),
  stripeOnboardingComplete: boolean('stripe_onboarding_complete').default(false).notNull(),
  payoutSchedule: varchar('payout_schedule', { length: 20 }).default('weekly'), // daily, weekly, monthly
  platformFeePercent: numeric('platform_fee_percent', { precision: 5, scale: 2 }).default('5.00'), // agency platform fee %
  // General settings
  requiresShipping: boolean('requires_shipping').default(true).notNull(),
  lowStockThreshold: integer('low_stock_threshold').default(5).notNull(),
  orderPrefix: varchar('order_prefix', { length: 10 }).default('ORD'),
  enableReviews: boolean('enable_reviews').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Product categories (separate from CMS post categories)
export const productCategories = pgTable('product_categories', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  description: text('description'),
  image: varchar('image', { length: 500 }),
  parentId: integer('parent_id'), // self-referencing for sub-categories
  order: integer('order').default(0).notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('product_categories_slug_website_idx').on(t.slug, t.websiteId),
]);

// Main products table
export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  categoryId: integer('category_id').references(() => productCategories.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  description: text('description'),
  shortDescription: varchar('short_description', { length: 500 }),
  price: integer('price').notNull(), // in cents
  compareAtPrice: integer('compare_at_price'),
  costPrice: integer('cost_price'),
  sku: varchar('sku', { length: 100 }),
  barcode: varchar('barcode', { length: 100 }),
  trackInventory: boolean('track_inventory').default(true).notNull(),
  quantity: integer('quantity').default(0).notNull(),
  weight: numeric('weight', { precision: 10, scale: 2 }),
  weightUnit: varchar('weight_unit', { length: 5 }).default('g'),
  status: varchar('status', { length: 20 }).default('draft').notNull(), // draft, active, archived
  featured: boolean('featured').default(false).notNull(),
  seoTitle: varchar('seo_title', { length: 255 }),
  seoDescription: text('seo_description'),
  tags: json('tags').$type<string[]>().default([]),
  metadata: json('metadata').$type<Record<string, string>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('products_slug_website_idx').on(t.slug, t.websiteId),
]);

export const productImages = pgTable('product_images', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  url: varchar('url', { length: 500 }).notNull(),
  alt: varchar('alt', { length: 255 }),
  order: integer('order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const productOptions = pgTable('product_options', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  order: integer('order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const productOptionValues = pgTable('product_option_values', {
  id: serial('id').primaryKey(),
  optionId: integer('option_id').notNull().references(() => productOptions.id, { onDelete: 'cascade' }),
  value: varchar('value', { length: 100 }).notNull(),
  label: varchar('label', { length: 100 }),
  order: integer('order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const productVariants = pgTable('product_variants', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  sku: varchar('sku', { length: 100 }),
  barcode: varchar('barcode', { length: 100 }),
  price: integer('price').notNull(),
  compareAtPrice: integer('compare_at_price'),
  costPrice: integer('cost_price'),
  quantity: integer('quantity').default(0).notNull(),
  weight: numeric('weight', { precision: 10, scale: 2 }),
  image: varchar('image', { length: 500 }),
  optionValues: json('option_values').$type<{ optionId: number; valueId: number }[]>().default([]),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const bulkPricingRules = pgTable('bulk_pricing_rules', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  variantId: integer('variant_id').references(() => productVariants.id, { onDelete: 'cascade' }),
  minQuantity: integer('min_quantity').notNull(),
  maxQuantity: integer('max_quantity'),
  priceType: varchar('price_type', { length: 20 }).default('fixed').notNull(), // fixed, percent_off
  amount: integer('amount').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const shippingZones = pgTable('shipping_zones', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  countries: json('countries').$type<string[]>().default([]),
  states: json('states').$type<string[]>().default([]),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const shippingRates = pgTable('shipping_rates', {
  id: serial('id').primaryKey(),
  zoneId: integer('zone_id').notNull().references(() => shippingZones.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  rateType: varchar('rate_type', { length: 20 }).default('flat').notNull(), // flat, weight_based, price_based, free
  price: integer('price').default(0).notNull(),
  weightTiers: json('weight_tiers').$type<{ minWeight: number; maxWeight: number; price: number }[]>(),
  freeAbove: integer('free_above'),
  minDeliveryDays: integer('min_delivery_days'),
  maxDeliveryDays: integer('max_delivery_days'),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const carts = pgTable('carts', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  sessionId: varchar('session_id', { length: 255 }),
  customerEmail: varchar('customer_email', { length: 255 }),
  status: varchar('status', { length: 20 }).default('active').notNull(),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const cartItems = pgTable('cart_items', {
  id: serial('id').primaryKey(),
  cartId: integer('cart_id').notNull().references(() => carts.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  variantId: integer('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
  quantity: integer('quantity').default(1).notNull(),
  unitPrice: integer('unit_price').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  orderNumber: varchar('order_number', { length: 50 }).notNull(),
  customerEmail: varchar('customer_email', { length: 255 }).notNull(),
  customerName: varchar('customer_name', { length: 255 }).notNull(),
  customerPhone: varchar('customer_phone', { length: 50 }),
  shippingAddress: json('shipping_address').$type<{
    line1: string; line2?: string; city: string; state: string; postalCode: string; country: string;
  }>(),
  billingAddress: json('billing_address').$type<{
    line1: string; line2?: string; city: string; state: string; postalCode: string; country: string;
  }>(),
  subtotal: integer('subtotal').notNull(),
  shippingTotal: integer('shipping_total').default(0).notNull(),
  taxTotal: integer('tax_total').default(0).notNull(),
  discountTotal: integer('discount_total').default(0).notNull(),
  total: integer('total').notNull(),
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),
  stripeChargeId: varchar('stripe_charge_id', { length: 255 }),
  paymentStatus: varchar('payment_status', { length: 20 }).default('pending').notNull(),
  paidAt: timestamp('paid_at'),
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  shippingMethod: varchar('shipping_method', { length: 255 }),
  trackingNumber: varchar('tracking_number', { length: 255 }),
  trackingUrl: varchar('tracking_url', { length: 500 }),
  shippedAt: timestamp('shipped_at'),
  deliveredAt: timestamp('delivered_at'),
  customerNote: text('customer_note'),
  internalNote: text('internal_note'),
  platformFee: integer('platform_fee'),
  transferId: varchar('transfer_id', { length: 255 }),
  discountCode: varchar('discount_code', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productId: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
  variantId: integer('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
  productName: varchar('product_name', { length: 255 }).notNull(),
  variantName: varchar('variant_name', { length: 255 }),
  sku: varchar('sku', { length: 100 }),
  unitPrice: integer('unit_price').notNull(),
  quantity: integer('quantity').notNull(),
  total: integer('total').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const orderStatusHistory = pgTable('order_status_history', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull(),
  note: text('note'),
  changedBy: integer('changed_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const discountCodes = pgTable('discount_codes', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 50 }).notNull(),
  description: varchar('description', { length: 255 }),
  discountType: varchar('discount_type', { length: 20 }).notNull(), // percent, fixed_amount, free_shipping
  amount: integer('amount').notNull(),
  minOrderAmount: integer('min_order_amount'),
  maxUses: integer('max_uses'),
  usedCount: integer('used_count').default(0).notNull(),
  startsAt: timestamp('starts_at'),
  expiresAt: timestamp('expires_at'),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('discount_codes_code_website_idx').on(t.code, t.websiteId),
]);
