// Resolve an A/B experiment for a given target + visitor.
//
// Used by public render paths (post pages today, decks next): given a target
// type/id and the visitor's `sd_visitor` cookie, look up any running
// experiment, assign a variant, optionally substitute the variant's payload
// override into the rendered content, and fire-and-forget a `view` event +
// idempotent assignment row.
//
// Key constraints:
//   - One running experiment per (target_type, target_id) wins (most recent).
//     Concurrent experiments on the same target are out of scope.
//   - Never block the response on DB writes — the caller awaits only the
//     synchronous lookup; writes are dispatched as detached promises.
//   - Always falls back to the original `content` on any error so a broken
//     experiment never takes down a page.

import { db } from '@/lib/db';
import { abExperiments, abVariants, abAssignments, abEvents } from '@/lib/db/schema';
import type { AbTargetType } from '@/lib/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { assignVariant } from './assign';

export interface AbResolution {
  experimentId: number;
  variantKey: string;
  /** True if the variant has its own block-tree override. */
  swapped: boolean;
  goalMetric: string;
  goalSelector: string | null;
}

export interface ResolvedRender {
  content: string;
  ab: AbResolution | null;
}

/** Stringify a block-tree override into the same shape posts.content uses. */
function blockTreeToContent(override: unknown): string | null {
  if (!override) return null;
  try {
    if (typeof override === 'string') return override;
    return JSON.stringify(override);
  } catch {
    return null;
  }
}

/**
 * Look up the most recent running experiment on this target. Returns null
 * when there's nothing to do.
 */
export async function findRunningExperimentForTarget(targetType: AbTargetType, targetId: number) {
  try {
    const [experiment] = await db
      .select()
      .from(abExperiments)
      .where(and(
        eq(abExperiments.targetType, targetType),
        eq(abExperiments.targetId, targetId),
        eq(abExperiments.status, 'running'),
      ))
      .orderBy(desc(abExperiments.startedAt))
      .limit(1);
    return experiment ?? null;
  } catch {
    return null;
  }
}

/**
 * Back-compat wrapper for the post-only call path.
 * @deprecated prefer `findRunningExperimentForTarget('post', postId)`.
 */
export async function findRunningExperiment(postId: number) {
  return findRunningExperimentForTarget('post', postId);
}

/**
 * Resolve `content` for the given target + visitor. If a running experiment
 * exists, may substitute the chosen variant's payload override. Always
 * returns a usable string — falls through to the unmodified content on any
 * error.
 *
 * `content` is the serialized payload native to the target type (post block
 * tree, deck slides, etc). Variants store their override in the same shape.
 */
export async function resolveAbContent(
  postId: number,
  visitorId: string | null,
  postContent: string,
): Promise<ResolvedRender> {
  return resolveAbContentForTarget('post', postId, visitorId, postContent);
}

export async function resolveAbContentForTarget(
  targetType: AbTargetType,
  targetId: number,
  visitorId: string | null,
  content: string,
): Promise<ResolvedRender> {
  if (!visitorId) return { content, ab: null };

  const experiment = await findRunningExperimentForTarget(targetType, targetId);
  if (!experiment) return { content, ab: null };

  const variantKey = assignVariant(experiment, visitorId);
  if (!variantKey) return { content: content, ab: null };

  let variantRow: { blockTreeOverride: unknown } | undefined;
  try {
    [variantRow] = await db
      .select({ blockTreeOverride: abVariants.blockTreeOverride })
      .from(abVariants)
      .where(and(eq(abVariants.experimentId, experiment.id), eq(abVariants.key, variantKey)))
      .limit(1);
  } catch {
    return { content: content, ab: null };
  }

  const overrideContent = variantRow ? blockTreeToContent(variantRow.blockTreeOverride) : null;
  const finalContent = overrideContent ?? content;

  // Fire-and-forget: record assignment + view. Best-effort. Detaches from the
  // response so DB latency never blocks first-byte.
  void recordExposure(experiment.id, variantKey, visitorId).catch(() => {
    /* swallowed — instrumentation must never break the page */
  });

  return {
    content: finalContent,
    ab: {
      experimentId: experiment.id,
      variantKey,
      swapped: !!overrideContent,
      goalMetric: experiment.goalMetric,
      goalSelector: experiment.goalSelector ?? null,
    },
  };
}

/**
 * Idempotent upsert into `ab_assignments` + insert a `view` event into
 * `ab_events`. Safe to call repeatedly for the same (experiment, visitor).
 *
 * Detached on purpose — caller does NOT await.
 */
export async function recordExposure(experimentId: number, variantKey: string, visitorId: string) {
  // Assignment is sticky — only the first call per (experiment, visitor)
  // does anything, but every call is harmless thanks to ON CONFLICT.
  try {
    await db
      .insert(abAssignments)
      .values({ experimentId, variantKey, visitorId })
      .onConflictDoNothing({ target: [abAssignments.experimentId, abAssignments.visitorId] });
  } catch {
    // ignore — the unique index will reject duplicates if onConflict isn't
    // honored (e.g. older Postgres). Still want to fire the view event.
  }

  // Best-effort throttle: only count one `view` per (experiment, visitor)
  // per call. We accept that browser refreshes generate multiple views;
  // dashboards de-dupe by visitor when needed.
  try {
    await db.insert(abEvents).values({ experimentId, variantKey, visitorId, kind: 'view' });
  } catch {
    /* ignore */
  }
}
