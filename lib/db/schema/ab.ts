// A/B testing for pages.
//
// One experiment per post (single-page only — cross-page experiments are out
// of scope for v1). Variants override the post's serialized block tree;
// assignments are sticky per visitor (cookie-bound) and events log views +
// goal hits. Stats live in `lib/ab/stats.ts`.

import { pgTable, serial, varchar, text, timestamp, integer, json, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { posts } from './cms';

export type AbExperimentStatus = 'draft' | 'running' | 'completed' | 'archived';
export type AbGoalMetric = 'page_view' | 'cta_click' | 'form_submit';
export type AbVariantSplit = Record<string, number>;

export const abExperiments = pgTable('ab_experiments', {
  id: serial('id').primaryKey(),
  postId: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  hypothesis: text('hypothesis'),
  // 'draft' | 'running' | 'completed' | 'archived'
  status: varchar('status', { length: 20 }).default('draft').notNull(),
  // e.g. { "a": 50, "b": 50 } — keys must equal `ab_variants.key`. Sums to 100
  // by convention; the assignment helper renormalizes if not.
  variantSplit: json('variant_split').$type<AbVariantSplit>().notNull(),
  // 'page_view' | 'cta_click' | 'form_submit'
  goalMetric: varchar('goal_metric', { length: 50 }).default('page_view').notNull(),
  // CSS selector or block id — only meaningful for cta_click/form_submit
  goalSelector: text('goal_selector'),
  startedAt: timestamp('started_at'),
  endedAt: timestamp('ended_at'),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('ab_experiments_post_idx').on(t.postId),
  index('ab_experiments_status_idx').on(t.status),
]);

export const abVariants = pgTable('ab_variants', {
  id: serial('id').primaryKey(),
  experimentId: integer('experiment_id').notNull().references(() => abExperiments.id, { onDelete: 'cascade' }),
  // 'a' | 'b' | 'c' … short stable handle used in cookies + analytics
  key: varchar('key', { length: 8 }).notNull(),
  label: varchar('label', { length: 255 }).notNull(),
  // Full block tree — same `{ blocks, version }` shape as posts.content. When
  // assigned, this REPLACES the post's content for the rendered response. Null
  // means "no override" (the control variant matches the live post).
  blockTreeOverride: json('block_tree_override'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('ab_variants_experiment_key_idx').on(t.experimentId, t.key),
]);

export const abAssignments = pgTable('ab_assignments', {
  id: serial('id').primaryKey(),
  experimentId: integer('experiment_id').notNull().references(() => abExperiments.id, { onDelete: 'cascade' }),
  variantKey: varchar('variant_key', { length: 8 }).notNull(),
  // sd_visitor cookie value
  visitorId: varchar('visitor_id', { length: 64 }).notNull(),
  occurredAt: timestamp('occurred_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('ab_assignments_experiment_visitor_idx').on(t.experimentId, t.visitorId),
]);

export const abEvents = pgTable('ab_events', {
  id: serial('id').primaryKey(),
  experimentId: integer('experiment_id').notNull().references(() => abExperiments.id, { onDelete: 'cascade' }),
  variantKey: varchar('variant_key', { length: 8 }).notNull(),
  visitorId: varchar('visitor_id', { length: 64 }).notNull(),
  // 'view' (auto-fired server-side on render) | 'goal' (fired client-side)
  kind: varchar('kind', { length: 20 }).notNull(),
  occurredAt: timestamp('occurred_at').defaultNow().notNull(),
}, (t) => [
  index('ab_events_experiment_occurred_idx').on(t.experimentId, t.occurredAt),
  index('ab_events_experiment_visitor_kind_idx').on(t.experimentId, t.visitorId, t.kind),
]);

// Convenient row types
export type AbExperiment = typeof abExperiments.$inferSelect;
export type NewAbExperiment = typeof abExperiments.$inferInsert;
export type AbVariant = typeof abVariants.$inferSelect;
export type NewAbVariant = typeof abVariants.$inferInsert;
export type AbAssignment = typeof abAssignments.$inferSelect;
export type AbEvent = typeof abEvents.$inferSelect;
