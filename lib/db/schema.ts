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

export const postRevisions = pgTable('post_revisions', {
  id: serial('id').primaryKey(),
  postId: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  trigger: varchar('trigger', { length: 20 }).notNull(), // 'autosave' | 'manual' | 'publish'
  createdBy: integer('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
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
  inviteToken: varchar('invite_token', { length: 255 }),
  inviteExpiresAt: timestamp('invite_expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const postTypes = pgTable('post_types', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  description: text('description'),
  icon: varchar('icon', { length: 50 }).default('article'),
  active: boolean('active').default(true).notNull(),
  websiteId: integer('website_id').references(() => clientWebsites.id, { onDelete: 'cascade' }), // null = global/admin
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Custom taxonomies — extensible alternative to just categories/tags
export const taxonomies = pgTable('taxonomies', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(), // e.g. "Category", "Tag", "Genre"
  slug: varchar('slug', { length: 100 }).notNull(), // e.g. "category", "tag", "genre"
  description: text('description'),
  icon: varchar('icon', { length: 50 }).default('label'),
  hierarchical: boolean('hierarchical').default(false).notNull(), // categories-style (parent/child) vs tags-style (flat)
  websiteId: integer('website_id').references(() => clientWebsites.id, { onDelete: 'cascade' }), // null = global
  builtIn: boolean('built_in').default(false).notNull(), // true for "category" and "tag"
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('taxonomies_slug_website_idx').on(t.slug, t.websiteId),
]);

export const taxonomyTerms = pgTable('taxonomy_terms', {
  id: serial('id').primaryKey(),
  taxonomyId: integer('taxonomy_id').notNull().references(() => taxonomies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  description: text('description'),
  color: varchar('color', { length: 7 }),
  parentId: integer('parent_id'), // for hierarchical taxonomies
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('taxonomy_terms_slug_taxonomy_idx').on(t.slug, t.taxonomyId),
]);

export const postTaxonomyTerms = pgTable('post_taxonomy_terms', {
  id: serial('id').primaryKey(),
  postId: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  termId: integer('term_id').notNull().references(() => taxonomyTerms.id, { onDelete: 'cascade' }),
});

export const customFields = pgTable('custom_fields', {
  id: serial('id').primaryKey(),
  postTypeId: integer('post_type_id').notNull().references(() => postTypes.id, { onDelete: 'cascade' }),
  parentId: integer('parent_id'), // Self-ref FK for sub-fields of repeaters/groups (added by migration, FK set up there)
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  fieldType: varchar('field_type', { length: 50 }).notNull(), // text, textarea, number, date, select, checkbox, url, email, image, user_select, repeater, group
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
  emailPrefix: varchar('email_prefix', { length: 50 }), // prefix@simplerdevelopment.com for AI email gateway
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
  includedAiCredits: integer('included_ai_credits').default(0).notNull(), // tokens included per billing cycle
  usageLimits: json('usage_limits').$type<Record<string, number>>().default({}), // per-period usage limits
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
  creditsGrantedAt: timestamp('credits_granted_at'), // when last monthly AI credit grant was applied
  notes: text('notes'),
  metadata: json('metadata'), // domain name, server details, etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── AI Credit System ──────────────────────────────────────────────────────────

export const aiCreditLedger = pgTable('ai_credit_ledger', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 20 }).notNull(), // grant, usage, purchase, refund, expiry
  amount: integer('amount').notNull(), // positive for grants/purchases, negative for usage
  balanceAfter: integer('balance_after').notNull(),
  description: text('description'),
  serviceCategory: varchar('service_category', { length: 50 }), // which service triggered this
  referenceId: varchar('reference_id', { length: 255 }), // conversation ID, deck ID, stripe payment ID
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const aiCreditBalances = pgTable('ai_credit_balances', {
  clientId: integer('client_id').primaryKey().references(() => clients.id, { onDelete: 'cascade' }),
  balance: integer('balance').default(0).notNull(),
  monthlyGrant: integer('monthly_grant').default(0).notNull(), // total monthly tokens from all subscriptions
  payAsYouGo: boolean('pay_as_you_go').default(false).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const aiCreditPackages = pgTable('ai_credit_packages', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  tokens: integer('tokens').notNull(),
  price: integer('price').notNull(), // cents
  stripePriceId: varchar('stripe_price_id', { length: 255 }),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Usage Metering ────────────────────────────────────────────────────────────

export const usageMeters = pgTable('usage_meters', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  category: varchar('category', { length: 50 }).notNull(), // email_sends, hosting_storage, hosting_bandwidth
  period: varchar('period', { length: 7 }).notNull(), // YYYY-MM
  usage: integer('usage').default(0).notNull(),
  included: integer('included').default(0).notNull(), // free tier limit for this period
  overageRate: integer('overage_rate').default(0).notNull(), // cents per unit above included
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
  blockContent: json('block_content'), // BlockEditorData JSON when created via visual editor
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
});

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
  deployBranch: varchar('deploy_branch', { length: 100 }).default('main'), // branch to deploy from
  vercelProjectId: varchar('vercel_project_id', { length: 255 }),
  vercelProjectUrl: varchar('vercel_project_url', { length: 500 }),
  vercelDomain: varchar('vercel_domain', { length: 255 }),
  deploymentStatus: varchar('deployment_status', { length: 50 }).default('pending'), // pending, provisioning, active, failed
  lastDeployedAt: timestamp('last_deployed_at'),
  provisionError: text('provision_error'),
  logApiKey: varchar('log_api_key', { length: 64 }), // secret key for request log ingestion
  customLayout: boolean('custom_layout').default(false).notNull(), // true = site blocks handle nav/footer, skip default layout chrome
  publicAccess: boolean('public_access').default(false).notNull(), // false = gated (noindex, coming-soon wall); admin must enable
  brandingProfileId: integer('branding_profile_id'), // FK to branding_profiles — resolved at runtime to avoid circular ref
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Multiple custom domains per website
export const websiteDomains = pgTable('website_domains', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  domain: varchar('domain', { length: 255 }).notNull(),
  isPrimary: boolean('is_primary').default(false).notNull(),
  status: varchar('status', { length: 50 }).default('pending').notNull(), // pending, verified, failed
  verifiedAt: timestamp('verified_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Website environments (production + staging per site)
export const websiteEnvironments = pgTable('website_environments', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 50 }).notNull(), // production, staging
  vercelTarget: varchar('vercel_target', { length: 50 }).notNull(), // production, preview
  previewUrl: varchar('preview_url', { length: 500 }), // staging preview URL
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Environment variables per environment
export const websiteEnvVars = pgTable('website_env_vars', {
  id: serial('id').primaryKey(),
  environmentId: integer('environment_id').notNull().references(() => websiteEnvironments.id, { onDelete: 'cascade' }),
  key: varchar('key', { length: 255 }).notNull(),
  value: text('value').notNull(),
  syncedToVercel: boolean('synced_to_vercel').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Point-in-time backups of environment state (env vars + settings)
export const websiteBackups = pgTable('website_backups', {
  id: serial('id').primaryKey(),
  environmentId: integer('environment_id').notNull().references(() => websiteEnvironments.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  snapshot: json('snapshot').$type<{
    envVars: Array<{ key: string; value: string }>;
    branding: Record<string, unknown> | null;
    navigation: Record<string, unknown> | null;
    storeSettings: Record<string, unknown> | null;
  }>().notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
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

// V2: Slides built with the CMS block editor
export interface PitchDeckSlideV2 {
  id: string;
  label: string; // Display name in sidebar ("Cover", "Problem", etc.)
  blocks: import('@/types/blocks').Block[];
  pageSettings?: import('@/types/blocks').PageSettings;
  notes?: string; // Speaker notes
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
  slides: json('slides').$type<PitchDeckSlide[] | PitchDeckSlideV2[]>().default([]),
  formatVersion: integer('format_version').default(1).notNull(), // 1 = legacy, 2 = block editor
  theme: json('theme').$type<PitchDeckTheme>().default({
    primaryColor: '#2563eb',
    accentColor: '#60a5fa',
    backgroundColor: '#0f172a',
    textColor: '#f8fafc',
    headingFont: 'Inter',
    bodyFont: 'Inter',
  }),
  sourceUrl: varchar('source_url', { length: 500 }), // website used for branding
  brandingProfileId: integer('branding_profile_id'), // FK to branding_profiles
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const pitchDeckVersions = pgTable('pitch_deck_versions', {
  id: serial('id').primaryKey(),
  deckId: integer('deck_id').notNull().references(() => pitchDecks.id, { onDelete: 'cascade' }),
  slides: json('slides').$type<PitchDeckSlide[] | PitchDeckSlideV2[]>().notNull(),
  theme: json('theme').$type<PitchDeckTheme>().notNull(),
  formatVersion: integer('format_version').default(1).notNull(),
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
  brandingProfileId: integer('branding_profile_id').references(() => brandingProfiles.id, { onDelete: 'set null' }),
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
  // Customer portal settings
  enableCustomerAccounts: boolean('enable_customer_accounts').default(true).notNull(),
  enableGuestCheckout: boolean('enable_guest_checkout').default(true).notNull(),
  enableWishlist: boolean('enable_wishlist').default(true).notNull(),
  enableOrderTracking: boolean('enable_order_tracking').default(true).notNull(),
  enableCustomerSupport: boolean('enable_customer_support').default(true).notNull(),
  customerPortalWelcomeMessage: text('customer_portal_welcome_message'),
  supportEmail: varchar('support_email', { length: 255 }),
  returnPolicyUrl: varchar('return_policy_url', { length: 500 }),
  shippingPolicyUrl: varchar('shipping_policy_url', { length: 500 }),
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
  customerId: integer('customer_id'), // FK added at runtime to avoid circular ref with storeCustomers
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
  customerId: integer('customer_id'), // FK to store_customers — links order to a customer account (null for guest checkout)
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

// ─── CUSTOMER PORTAL ────────────────────────────────────────────────────────

export const storeCustomers = pgTable('store_customers', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  phone: varchar('phone', { length: 50 }),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  // Default addresses (JSON: { line1, line2, city, state, postalCode, country })
  defaultShippingAddress: json('default_shipping_address').$type<{
    line1: string; line2?: string; city: string; state: string; postalCode: string; country: string;
  }>(),
  defaultBillingAddress: json('default_billing_address').$type<{
    line1: string; line2?: string; city: string; state: string; postalCode: string; country: string;
  }>(),
  // Saved address book (array of named addresses)
  addressBook: json('address_book').$type<Array<{
    id: string; label: string; line1: string; line2?: string; city: string; state: string; postalCode: string; country: string; isDefault?: boolean;
  }>>().default([]),
  emailVerified: boolean('email_verified').default(false).notNull(),
  emailVerifyToken: varchar('email_verify_token', { length: 100 }),
  passwordResetToken: varchar('password_reset_token', { length: 100 }),
  passwordResetExpires: timestamp('password_reset_expires'),
  lastLoginAt: timestamp('last_login_at'),
  status: varchar('status', { length: 20 }).default('active').notNull(), // active, disabled
  orderCount: integer('order_count').default(0).notNull(),
  totalSpent: integer('total_spent').default(0).notNull(), // in cents
  notes: text('notes'), // internal notes for store owner
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('store_customers_email_website_idx').on(t.email, t.websiteId),
]);

export const storeCustomerSessions = pgTable('store_customer_sessions', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').notNull().references(() => storeCustomers.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const storeWishlists = pgTable('store_wishlists', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').notNull().references(() => storeCustomers.id, { onDelete: 'cascade' }),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).default('My Wishlist').notNull(),
  isDefault: boolean('is_default').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const storeWishlistItems = pgTable('store_wishlist_items', {
  id: serial('id').primaryKey(),
  wishlistId: integer('wishlist_id').notNull().references(() => storeWishlists.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  variantId: integer('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
  addedAt: timestamp('added_at').defaultNow().notNull(),
});

export const storeCustomerMessages = pgTable('store_customer_messages', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  customerId: integer('customer_id').notNull().references(() => storeCustomers.id, { onDelete: 'cascade' }),
  orderId: integer('order_id').references(() => orders.id, { onDelete: 'set null' }),
  subject: varchar('subject', { length: 255 }).notNull(),
  category: varchar('category', { length: 50 }).default('general').notNull(), // general, order, shipping, return, product
  status: varchar('status', { length: 20 }).default('open').notNull(), // open, replied, resolved, closed
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const storeCustomerMessageReplies = pgTable('store_customer_message_replies', {
  id: serial('id').primaryKey(),
  messageId: integer('message_id').notNull().references(() => storeCustomerMessages.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  isStaff: boolean('is_staff').default(false).notNull(), // true = store owner reply, false = customer
  authorName: varchar('author_name', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const storeProductReviews = pgTable('store_product_reviews', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  customerId: integer('customer_id').references(() => storeCustomers.id, { onDelete: 'set null' }),
  orderId: integer('order_id').references(() => orders.id, { onDelete: 'set null' }),
  rating: integer('rating').notNull(), // 1-5
  title: varchar('title', { length: 255 }),
  body: text('body'),
  status: varchar('status', { length: 20 }).default('pending').notNull(), // pending, approved, rejected
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── NAVIGATION & BRANDING ──────────────────────────────────────────────────

export const siteNavigation = pgTable('site_navigation', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  label: varchar('label', { length: 255 }).notNull(),
  href: varchar('href', { length: 500 }).notNull(),
  parentId: integer('parent_id'),
  sortOrder: integer('sort_order').default(0).notNull(),
  openInNewTab: boolean('open_in_new_tab').default(false).notNull(),
  isButton: boolean('is_button').default(false).notNull(),
  // Mega menu fields
  description: text('description'),
  icon: varchar('icon', { length: 100 }),
  featuredImage: varchar('featured_image', { length: 500 }),
  columnGroup: integer('column_group'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const siteBranding = pgTable('site_branding', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }).unique(),
  logoUrl: varchar('logo_url', { length: 500 }),
  logoAlt: varchar('logo_alt', { length: 255 }),
  primaryColor: varchar('primary_color', { length: 20 }).default('#2563eb'),
  secondaryColor: varchar('secondary_color', { length: 20 }).default('#1e40af'),
  accentColor: varchar('accent_color', { length: 20 }).default('#f59e0b'),
  backgroundColor: varchar('background_color', { length: 20 }).default('#ffffff'),
  textColor: varchar('text_color', { length: 20 }).default('#111827'),
  navTemplate: varchar('nav_template', { length: 50 }).default('classic'), // classic, centered, minimal, modern, transparent, mega
  navPosition: varchar('nav_position', { length: 20 }).default('top'), // top, left
  navBackground: varchar('nav_background', { length: 20 }).default('#ffffff'),
  navTextColor: varchar('nav_text_color', { length: 20 }).default('#111827'),
  // Fonts
  headingFont: varchar('heading_font', { length: 255 }),
  bodyFont: varchar('body_font', { length: 255 }),
  // Per-element typography: { h1: { font, size, weight, lineHeight, letterSpacing }, h2: ..., p: ..., etc. }
  typography: json('typography').$type<Record<string, { font?: string; size?: string; weight?: string; lineHeight?: string; letterSpacing?: string }>>(),
  // Logo variants
  logoSquareUrl: varchar('logo_square_url', { length: 500 }),
  logoRectUrl: varchar('logo_rect_url', { length: 500 }),
  logoText: varchar('logo_text', { length: 255 }),
  logoIconUrl: varchar('logo_icon_url', { length: 500 }),
  // Style
  borderRadius: varchar('border_radius', { length: 20 }).default('8px'),
  linkColor: varchar('link_color', { length: 20 }),
  linkHoverColor: varchar('link_hover_color', { length: 20 }),
  buttonStyle: json('button_style').$type<{
    primaryBg?: string; primaryText?: string; primaryHoverBg?: string;
    secondaryBg?: string; secondaryText?: string; secondaryHoverBg?: string;
    borderRadius?: string; variant?: 'filled' | 'outline';
  }>(),
  faviconUrl: varchar('favicon_url', { length: 500 }),
  ogImageUrl: varchar('og_image_url', { length: 500 }),
  // Dark mode overrides (colors + logos)
  darkMode: json('dark_mode').$type<{
    primaryColor?: string; secondaryColor?: string; accentColor?: string;
    backgroundColor?: string; textColor?: string;
    navBackground?: string; navTextColor?: string;
    logoUrl?: string; logoSquareUrl?: string; logoRectUrl?: string; logoIconUrl?: string;
  }>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Branding Profiles ──────────────────────────────────────────────────────

export const brandingProfiles = pgTable('branding_profiles', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  // Colors
  primaryColor: varchar('primary_color', { length: 20 }).default('#2563eb'),
  secondaryColor: varchar('secondary_color', { length: 20 }).default('#1e40af'),
  accentColor: varchar('accent_color', { length: 20 }).default('#f59e0b'),
  backgroundColor: varchar('background_color', { length: 20 }).default('#ffffff'),
  textColor: varchar('text_color', { length: 20 }).default('#111827'),
  // Navigation
  navTemplate: varchar('nav_template', { length: 50 }).default('classic'),
  navPosition: varchar('nav_position', { length: 20 }).default('top'),
  navBackground: varchar('nav_background', { length: 20 }).default('#ffffff'),
  navTextColor: varchar('nav_text_color', { length: 20 }).default('#111827'),
  // Fonts
  headingFont: varchar('heading_font', { length: 255 }),
  bodyFont: varchar('body_font', { length: 255 }),
  typography: json('typography').$type<Record<string, { font?: string; size?: string; weight?: string; lineHeight?: string }>>(),
  // Logos
  logoUrl: varchar('logo_url', { length: 500 }),
  logoAlt: varchar('logo_alt', { length: 255 }),
  logoSquareUrl: varchar('logo_square_url', { length: 500 }),
  logoRectUrl: varchar('logo_rect_url', { length: 500 }),
  logoText: varchar('logo_text', { length: 255 }),
  logoIconUrl: varchar('logo_icon_url', { length: 500 }),
  // Style
  borderRadius: varchar('border_radius', { length: 20 }).default('8px'),
  linkColor: varchar('link_color', { length: 20 }),
  linkHoverColor: varchar('link_hover_color', { length: 20 }),
  buttonStyle: json('button_style').$type<{
    primaryBg?: string; primaryText?: string; primaryHoverBg?: string;
    secondaryBg?: string; secondaryText?: string; secondaryHoverBg?: string;
    borderRadius?: string; variant?: 'filled' | 'outline';
  }>(),
  faviconUrl: varchar('favicon_url', { length: 500 }),
  ogImageUrl: varchar('og_image_url', { length: 500 }),
  // Dark mode overrides
  darkMode: json('dark_mode').$type<{
    primaryColor?: string; secondaryColor?: string; accentColor?: string;
    backgroundColor?: string; textColor?: string;
    navBackground?: string; navTextColor?: string;
    logoUrl?: string; logoSquareUrl?: string; logoRectUrl?: string; logoIconUrl?: string;
  }>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Branding Messaging ────────────────────────────────────────────────────

export const brandingMessaging = pgTable('branding_messaging', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  brandingProfileId: integer('branding_profile_id').references(() => brandingProfiles.id, { onDelete: 'cascade' }),
  // Company Identity
  companyName: varchar('company_name', { length: 255 }),
  tagline: varchar('tagline', { length: 500 }),
  missionStatement: text('mission_statement'),
  visionStatement: text('vision_statement'),
  valueProposition: text('value_proposition'),
  // Brand Voice
  toneOfVoice: varchar('tone_of_voice', { length: 255 }), // e.g. "Professional, Approachable, Innovative"
  brandPersonality: text('brand_personality'),
  writingStyle: text('writing_style'), // guidelines for written content
  // Key Messaging
  elevatorPitch: text('elevator_pitch'),
  boilerplate: text('boilerplate'), // standard company description
  keyDifferentiators: json('key_differentiators').$type<string[]>(),
  targetAudience: text('target_audience'),
  // Industry & Context
  industry: varchar('industry', { length: 255 }),
  yearFounded: varchar('year_founded', { length: 10 }),
  companySize: varchar('company_size', { length: 100 }),
  headquarters: varchar('headquarters', { length: 255 }),
  websiteUrl: varchar('website_url', { length: 500 }),
  // Social Proof
  socialProof: text('social_proof'), // testimonials, awards, press mentions
  keyClients: text('key_clients'),
  certifications: text('certifications'),
  // Additional Context
  additionalContext: text('additional_context'), // anything else AI should know
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── CRM ─────────────────────────────────────────────────────────────────────

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
  notes: text('notes'),
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
  title: varchar('title', { length: 150 }), // job title
  source: varchar('source', { length: 100 }), // web, referral, cold-call, event, etc.
  status: varchar('status', { length: 50 }).default('active').notNull(), // active, inactive, lead, customer
  avatarUrl: varchar('avatar_url', { length: 500 }),
  address: text('address'),
  notes: text('notes'),
  lastContactedAt: timestamp('last_contacted_at'),
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
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

// ─── AUTOMATION ENGINE ────────────────────────────────────────────────────────

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
  showIf?: { fieldId: string; values: string[] };
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
  // Meta
  responseCount: integer('response_count').default(0).notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const surveyResponses = pgTable('survey_responses', {
  id: serial('id').primaryKey(),
  surveyId: integer('survey_id').notNull().references(() => surveys.id, { onDelete: 'cascade' }),
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============================================================================
// Website Email Templates — Transactional / Event-Triggered
// ============================================================================

export interface EmailTemplateVariable {
  key: string;        // e.g. 'firstName'
  label: string;      // e.g. 'First Name'
  description: string; // e.g. 'Customer first name from order'
  sampleValue: string; // e.g. 'Jane'
}

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
export const apiKeys = pgTable('api_keys', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  key: varchar('key', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  scopes: json('scopes').$type<string[]>().default([]),
  rateLimitPerMinute: integer('rate_limit_per_minute').default(60),
  active: boolean('active').default(true).notNull(),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

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
