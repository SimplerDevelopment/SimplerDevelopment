// Magamommy autonomous-shop tables. The pipeline is:
//
//   researcher  → magamommy_briefs       (raw topic harvest)
//   concept-writer → magamommy_concepts  (winning shirt concept)
//   designer    → designs (existing) + S3 mockup
//   publisher   → products + product_variants (existing)
//
// magamommy_drops is the orchestrator's state row — one per Monday cron firing.

import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  date,
  uuid,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { clientWebsites } from './sites';
import { products } from './store';

export const magamommyBriefs = pgTable('magamommy_briefs', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  weekOf: date('week_of').notNull(), // Monday of the drop week, UTC
  // [{ slug, headline, context, sourceUrls: string[] }]
  topics: jsonb('topics').$type<Array<{
    slug: string;
    headline: string;
    context: string;
    sourceUrls: string[];
  }>>().notNull().default([]),
  rawModelResponse: text('raw_model_response'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('magamommy_briefs_website_idx').on(t.websiteId),
  index('magamommy_briefs_week_idx').on(t.weekOf),
]);

export const magamommyConcepts = pgTable('magamommy_concepts', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  briefId: integer('brief_id').notNull().references(() => magamommyBriefs.id, { onDelete: 'cascade' }),
  topicSlug: varchar('topic_slug', { length: 120 }).notNull(),
  slogan: varchar('slogan', { length: 120 }).notNull(),
  tagline: text('tagline').notNull(),
  visualPrompt: text('visual_prompt').notNull(),
  // [{ name, hex }]
  palette: jsonb('palette').$type<Array<{ name: string; hex: string }>>().notNull().default([]),
  placement: varchar('placement', { length: 20 }).notNull().default('front'), // 'front' | 'back'
  style: varchar('style', { length: 20 }).notNull().default('bold'),          // 'bold' | 'satire' | 'classic'
  // Other generated alternatives we rejected — audit trail.
  alternatives: jsonb('alternatives').$type<Array<{
    slogan: string;
    visualPrompt: string;
    rejectionReason?: string;
  }>>().notNull().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('magamommy_concepts_website_idx').on(t.websiteId),
  index('magamommy_concepts_brief_idx').on(t.briefId),
]);

export const magamommyDrops = pgTable('magamommy_drops', {
  id: serial('id').primaryKey(),
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  weekOf: date('week_of').notNull(), // Monday of the drop week, UTC
  // Pipeline state machine.
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  //   pending → researching → concepting → designing → publishing → live
  //                                                                ↘ failed (at any stage)
  briefId: integer('brief_id').references(() => magamommyBriefs.id, { onDelete: 'set null' }),
  conceptId: integer('concept_id').references(() => magamommyConcepts.id, { onDelete: 'set null' }),
  designId: uuid('design_id'), // FK to designs.id added at runtime to avoid circular reference
  productId: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
  error: text('error'),
  errorStage: varchar('error_stage', { length: 30 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  // One drop per week per site — guarantees idempotence under cron-retry.
  uniqueIndex('magamommy_drops_site_week_uidx').on(t.websiteId, t.weekOf),
  index('magamommy_drops_status_idx').on(t.status),
]);

export type MagamommyBrief = typeof magamommyBriefs.$inferSelect;
export type NewMagamommyBrief = typeof magamommyBriefs.$inferInsert;
export type MagamommyConcept = typeof magamommyConcepts.$inferSelect;
export type NewMagamommyConcept = typeof magamommyConcepts.$inferInsert;
export type MagamommyDrop = typeof magamommyDrops.$inferSelect;
export type NewMagamommyDrop = typeof magamommyDrops.$inferInsert;
