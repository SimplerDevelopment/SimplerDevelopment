/**
 * BYOK / platform call audit. Each AI call resolution can append a row to
 * `usage_meter_events` with `resource='ai_tokens'` so we have an append-only
 * record of (a) which clients are using BYOK vs platform credits and (b)
 * how many tokens each call consumed.
 *
 * `usage_meter_events` is the event-shaped table introduced alongside the
 * pricing-tier work. Older aggregated metering (`usage_meters` +
 * `lib/usage-metering.ts`) is left untouched — this is additive.
 *
 * Best-effort: failures are logged and swallowed. AI call sites should
 * NEVER block on telemetry.
 */

import { db } from '@/lib/db';
import { usageMeterEvents } from '@/lib/db/schema';

export type AiUsageSource = 'byok' | 'platform';

export interface RecordAiUsageInput {
  clientId: number;
  /** 'byok' or 'platform' — mirrors the resolver's `source`. */
  source: AiUsageSource;
  /** input + output tokens. Pass 0 if you don't have a count yet. */
  tokens: number;
  /** YYYY-MM bucket; defaults to current UTC month. */
  period?: string;
}

function currentPeriod(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

/**
 * Append a `usage_meter_events` row for an AI call. Best-effort; logs and
 * swallows on failure.
 */
export async function recordAiUsage(input: RecordAiUsageInput): Promise<void> {
  const period = input.period ?? currentPeriod();
  try {
    await db.insert(usageMeterEvents).values({
      clientId: input.clientId,
      resource: 'ai_tokens',
      period,
      amount: String(input.tokens), // numeric column — drizzle wants string
      source: input.source,
    });
  } catch (err) {
    console.warn(
      `[recordAiUsage] failed for clientId=${input.clientId} source=${input.source} tokens=${input.tokens}`,
      err,
    );
  }
}
