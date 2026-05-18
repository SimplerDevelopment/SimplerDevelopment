/**
 * Per-merchant + per-design caps for AI image generation. These are the
 * "your customer just spammed Generate 400 times" backstop — distinct from
 * the plan-tier gate (which decides *whether* the call is allowed) and the
 * audit recorder (which logs *that* the call happened).
 *
 * Two independent ceilings, both enforced before we touch OpenAI:
 *
 *   * Daily client cap — counts every `usage_meter_events` row for the
 *     merchant in the current UTC day with `resource='ai_images'`. Default
 *     200/day. Tunable via `AI_IMAGE_DAILY_CAP_PER_CLIENT` env var so a
 *     merchant on Scale tier can ask ops to raise their ceiling without a
 *     code change.
 *
 *   * Per-design cap — counts how many AI assets already exist for the
 *     specific design (`design_assets` rows with an `/ai/` URL segment).
 *     Default 30. Protects against one stuck-on-Generate customer racking
 *     up images on a single t-shirt design even when the merchant has
 *     headroom for the day.
 *
 * `null` cap values disable that ceiling. Both checks short-circuit on
 * the first failure so a noisy session doesn't keep paging the DB.
 */

import { and, eq, gte, like, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { designAssets, usageMeterEvents } from '@/lib/db/schema';

const DEFAULT_DAILY_CAP = 200;
const DEFAULT_PER_DESIGN_CAP = 30;

function readNumericEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) return fallback;
  return parsed;
}

export type AiImageRateLimitReason = 'client_daily_cap' | 'design_cap';

export interface AiImageRateLimitVerdict {
  allowed: boolean;
  reason?: AiImageRateLimitReason;
  message?: string;
  /** Current count that triggered the block (helpful for error UX). */
  count?: number;
  /** The cap that was hit. */
  cap?: number;
}

interface CheckOpts {
  clientId: number;
  designId: string;
}

/**
 * Returns whether one more AI image generation is allowed for this
 * (client, design) pair right now. Two queries, both indexed columns —
 * cheap to run on every request.
 */
export async function checkAiImageRateLimit(
  opts: CheckOpts,
): Promise<AiImageRateLimitVerdict> {
  const clientDailyCap = readNumericEnv(
    'AI_IMAGE_DAILY_CAP_PER_CLIENT',
    DEFAULT_DAILY_CAP,
  );
  const perDesignCap = readNumericEnv(
    'AI_IMAGE_PER_DESIGN_CAP',
    DEFAULT_PER_DESIGN_CAP,
  );

  // ── client daily cap ────────────────────────────────────────────────
  if (clientDailyCap > 0) {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usageMeterEvents)
      .where(
        and(
          eq(usageMeterEvents.clientId, opts.clientId),
          eq(usageMeterEvents.resource, 'ai_images'),
          gte(usageMeterEvents.recordedAt, startOfDay),
        ),
      );
    const count = Number(row?.count ?? 0);
    if (count >= clientDailyCap) {
      return {
        allowed: false,
        reason: 'client_daily_cap',
        message:
          `Daily AI image limit reached (${clientDailyCap} per day). ` +
          `Try again tomorrow or ask the site owner to raise their quota.`,
        count,
        cap: clientDailyCap,
      };
    }
  }

  // ── per-design cap ──────────────────────────────────────────────────
  if (perDesignCap > 0) {
    // AI-generated assets live under `media/designs/<id>/ai/...` (see the
    // S3 key the route writes). Matching on the URL avoids needing a new
    // schema column to flag asset origin.
    const aiPathFragment = `%/designs/${opts.designId}/ai/%`;
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(designAssets)
      .where(
        and(
          eq(designAssets.designId, opts.designId),
          like(designAssets.url, aiPathFragment),
        ),
      );
    const count = Number(row?.count ?? 0);
    if (count >= perDesignCap) {
      return {
        allowed: false,
        reason: 'design_cap',
        message:
          `This design already has ${perDesignCap} AI-generated images. ` +
          `Delete some layers from the design before generating more.`,
        count,
        cap: perDesignCap,
      };
    }
  }

  return { allowed: true };
}
