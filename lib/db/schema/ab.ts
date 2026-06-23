// A/B testing — entity-polymorphic.
//
// One experiment per (target_type, target_id) pair. Today's targets:
//   - 'post' — variant overrides the post's block tree
//   - 'deck' — variant overrides the pitch deck's slides array
//   - 'survey' / 'email' — reserved; no rendering hookup yet
//
// Assignments are sticky per visitor (cookie-bound). Events log views + goal
// hits. Stats live in `lib/ab/stats.ts`.
//
// Back-compat: `post_id` is preserved so older code paths and the existing
// post FK keep working. New writes mirror `target_id` into `post_id` when
// target_type='post' and leave it NULL otherwise.

import { pgTable, serial, varchar, text, timestamp, integer, json, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { posts } from './cms';

export type AbExperimentStatus = 'draft' | 'running' | 'completed' | 'archived';
export type AbGoalMetric = 'page_view' | 'cta_click' | 'form_submit';
export type AbTargetType = 'post' | 'deck' | 'survey' | 'email';
export type AbVariantSplit = Record<string, number>;

export const AB_TARGET_TYPES: readonly AbTargetType[] = ['post', 'deck', 'survey', 'email'] as const;

export const abExperiments = pgTable('ab_experiments', {
  id: serial('id').primaryKey(),
  // Polymorphic target. `target_type` keys into the table the experiment
  // applies to; `target_id` is the row id within that table.
  targetType: varchar('target_type', { length: 20 }).$type<AbTargetType>().default('post').notNull(),
  targetId: integer('target_id').notNull(),
  // Legacy column. Kept (nullable) for back-compat with existing rows + the
  // post FK. New writes mirror target_id here only when target_type='post'.
  postId: integer('post_id').references(() => posts.id, { onDelete: 'cascade' }),
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
  index('ab_experiments_target_idx').on(t.targetType, t.targetId, t.status),
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
