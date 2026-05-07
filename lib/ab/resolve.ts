// Resolve an A/B experiment for a given post + visitor.
//
// Used by the public site render path: given the post id and the visitor's
// `sd_visitor` cookie value, look up any running experiment, assign a
// variant, optionally substitute the variant's block tree into `content`,
// and fire-and-forget a `view` event + idempotent assignment row.
//
// Key constraints:
//   - One running experiment per post wins (we pick the most recent).
//     Concurrent experiments on the same post are out of scope for v1.
//   - Never block the response on DB writes — the caller awaits only the
//     synchronous lookup; writes are dispatched as detached promises.
//   - Always falls back to the original `content` on any error so a broken
//     experiment never takes down a page.

import { db } from '@/lib/db';
import { abExperiments, abVariants, abAssignments, abEvents } from '@/lib/db/schema';
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
 * Look up the most recent running experiment on this post. Returns null when
 * there's nothing to do (no experiment / no visitor id).
 */
export async function findRunningExperiment(postId: number) {
  try {
    const [experiment] = await db
      .select()
      .from(abExperiments)
      .where(and(eq(abExperiments.postId, postId), eq(abExperiments.status, 'running')))
      .orderBy(desc(abExperiments.startedAt))
      .limit(1);
    return experiment ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve `content` for the given post + visitor. If a running experiment
 * exists, may substitute the chosen variant's block tree. Always returns a
 * usable string — falls through to the unmodified post content on any
 * error.
 */
export async function resolveAbContent(
  postId: number,
  visitorId: string | null,
  postContent: string,
): Promise<ResolvedRender> {
  if (!visitorId) return { content: postContent, ab: null };

  const experiment = await findRunningExperiment(postId);
  if (!experiment) return { content: postContent, ab: null };

  const variantKey = assignVariant(experiment, visitorId);
  if (!variantKey) return { content: postContent, ab: null };

  let variantRow: { blockTreeOverride: unknown } | undefined;
  try {
    [variantRow] = await db
      .select({ blockTreeOverride: abVariants.blockTreeOverride })
      .from(abVariants)
      .where(and(eq(abVariants.experimentId, experiment.id), eq(abVariants.key, variantKey)))
      .limit(1);
  } catch {
    return { content: postContent, ab: null };
  }

  const overrideContent = variantRow ? blockTreeToContent(variantRow.blockTreeOverride) : null;
  const finalContent = overrideContent ?? postContent;

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
