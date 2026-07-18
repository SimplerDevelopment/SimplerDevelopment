// Deterministic survey-variant assignment.
//
// Survey variants are independent of `lib/ab/*` and the `ab_experiments` table
// — they have a per-row `weight` integer (default 50) and an `enabled` flag,
// so the picker hashes `surveyId:visitorId` and walks the cumulative weighted
// ranges. Pure: no DB writes, no network. Safe to call from server components,
// route handlers, or tests.
//
// If no enabled variants are present the caller falls back to `surveys.fields`
// directly — there's nothing to fork between.

export interface SurveyVariantPickable {
  id: number;
  name: string;
  weight: number;
  enabled: boolean;
}

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash >>> 0;
}

export function bucket(surveyId: number | string, visitorId: string): number {
  return fnv1a32(`survey:${surveyId}:${visitorId}`) % 10000;
}

/**
 * Pick a variant for `(surveyId, visitorId)` from a list of variants.
 *
 * Returns `null` when no enabled variants are available — caller should render
 * the survey's default `fields` in that case.
 *
 * Weights are renormalized so callers can pass any positive integers (e.g. 50
 * + 50, 1 + 1, 70 + 30). Negative or non-numeric weights are skipped.
 */
export function assignSurveyVariant<T extends SurveyVariantPickable>(
  surveyId: number,
  visitorId: string,
  variants: T[],
): T | null {
  const enabled = variants.filter(
    (v) => v.enabled && typeof v.weight === 'number' && v.weight > 0,
  );
  if (enabled.length === 0) return null;

  // Sort by id so the cumulative ranges are stable regardless of caller order.
  const sorted = [...enabled].sort((a, b) => a.id - b.id);

  const total = sorted.reduce((sum, v) => sum + v.weight, 0);
  if (total <= 0) return null;

  const slot = bucket(surveyId, visitorId);
  let cumulative = 0;
  for (const v of sorted) {
    cumulative += (v.weight / total) * 10000;
    if (slot < cumulative) return v;
  }
  return sorted[sorted.length - 1];
}
