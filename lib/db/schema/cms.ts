// Posts, post-types, taxonomies, media, branding profiles, and reusable block templates.

import { pgTable, serial, varchar, text, timestamp, boolean, integer, json, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { clientWebsites, clients } from './sites';

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
  // Per-post custom CSS/JS — injected at render time, scoped to the page.
  customCss: text('custom_css'),
  customJs: text('custom_js'),
  // null = agency website; non-null = client website
  websiteId: integer('website_id'),
  // Lightweight fork pointer — set by posts_fork. Points to posts.id of the
  // post this row was forked from. No FK constraint (self-reference + nullable
  // makes drizzle's typegen unhappy); the column is informational only.
  parentPostId: integer('parent_post_id'),
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

export const postTypes = pgTable('post_types', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  description: text('description'),
  icon: varchar('icon', { length: 50 }).default('article'),
  active: boolean('active').default(true).notNull(),
  websiteId: integer('website_id').references(() => clientWebsites.id, { onDelete: 'cascade' }), // null = global/admin
  // Type-wide custom CSS/JS — applied to every post of this content type on
  // this website. Cascades after site customCss/customJs and before per-post.
  customCss: text('custom_css'),
  customJs: text('custom_js'),
  // Optional template wrapping every post of this type — same shape as
  // posts.content (`{ blocks: Block[], version: '1.0' }`). At render time the
  // post's own blocks are substituted in place of any `{ type: 'post-content' }`
  // placeholder block. Null = no wrapper, render the post's blocks as-is.
  template: text('template'),
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

export interface BlockTemplateDraft {
  name?: string;
  description?: string | null;
  category?: string;
  scope?: string;
  blocks?: unknown;
  thumbnail?: string | null;
  tags?: string[];
  lockedFields?: string[];
  pendingCreate?: boolean;
  pendingDelete?: boolean;
  updatedAt?: string;
  updatedBy?: number;
}

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
  // Multi-tenant scope: NULL = platform-global template (admin-curated, visible
  // to every tenant); non-NULL = scoped to that client's tenant. Portal
  // SaveAsTemplate writes set this to the editing site's clientId so client A
  // never sees client B's templates. Listing endpoints OR together client-scope
  // and global rows.
  clientId: integer('client_id').references(() => clients.id, { onDelete: 'cascade' }),
  version: integer('version').default(1).notNull(),
  // Draft overlay — MCP writes land here by default. Public block-template
  // pickers and the "use this template" insertion path read live fields only.
  // `block_templates_publish` copies draft → live and clears draft.
  draft: json('draft').$type<BlockTemplateDraft | null>(),
  // Lightweight fork pointer — set by block_templates_fork. Points to
  // block_templates.id of the template this row was duplicated from.
  parentTemplateId: integer('parent_template_id'),
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
  // Bumped on every replace; prior states live in media_versions.
  version: integer('version').default(1).notNull(),
  uploadedBy: integer('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  clientId: integer('client_id').references(() => clients.id, { onDelete: 'cascade' }), // null = admin-only media
  websiteId: integer('website_id').references(() => clientWebsites.id, { onDelete: 'cascade' }), // null = global/admin
  brandingProfileId: integer('branding_profile_id').references(() => brandingProfiles.id, { onDelete: 'set null' }), // shared across services using same branding
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  // E2 perf — portal/media list filters by clientId ordered by createdAt desc.
  index('media_client_created_idx').on(t.clientId, t.createdAt),
]);

// Snapshots of prior media states — written on /replace + /restore so that
// any version can be restored without losing the bytes. Restore copies the
// snapshot back onto `media` and pushes the just-replaced state as a new row.

export const mediaVersions = pgTable('media_versions', {
  id: serial('id').primaryKey(),
  mediaId: integer('media_id').notNull().references(() => media.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  filename: varchar('filename', { length: 255 }).notNull(),
  storedFilename: varchar('stored_filename', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  fileSize: integer('file_size').notNull(),
  url: varchar('url', { length: 500 }).notNull(),
  uploadedBy: integer('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── CLIENT PORTAL ────────────────────────────────────────────────────────────

// Extended profile for users with role='client'

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
  /** Named button presets — clients define N named styles referenced by ButtonBlock.presetId. */
  buttonPresets: json('button_presets').$type<Array<{
    id: string;
    name: string;
    backgroundColor?: string;
    color?: string;
    hoverBackgroundColor?: string;
    hoverColor?: string;
    borderColor?: string;
    borderWidth?: string;
    borderStyle?: 'solid' | 'dashed' | 'dotted' | 'none';
    borderRadius?: string;
    fontWeight?: string;
    textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
    letterSpacing?: string;
    paddingX?: string;
    paddingY?: string;
    description?: string;
  }>>(),
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

// ─── Branding Messaging────────────────────────────────────────────────────

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
  // Structured tone axes — each value -1.0 to 1.0 along a named dimension
  toneAxes: json('tone_axes').$type<{
    formal?: number;        // -1 = casual, +1 = formal
    playful?: number;       // -1 = serious, +1 = playful
    traditional?: number;   // -1 = innovative, +1 = traditional
    authoritative?: number; // -1 = friendly, +1 = authoritative
  }>(),
  // Voice sample library — short exemplars that show how the brand writes
  voiceSamples: json('voice_samples').$type<Array<{ context: string; text: string }>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── CRM ─────────────────────────────────────────────────────────────────────

