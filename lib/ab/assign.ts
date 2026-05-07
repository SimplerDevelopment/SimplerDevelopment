// Deterministic variant assignment.
//
// Given an experiment + a visitor id, returns the same variant key every
// time. The bucket is derived from a 32-bit FNV-1a hash of
// `${experimentId}:${visitorId}` mod 100, then mapped to the cumulative
// `variantSplit` ranges. If the split sums to ≠100 we renormalize (so the
// caller can pass `{ a: 1, b: 1 }` as a 50/50 shorthand).
//
// No DB writes here — the recorder upserts to `ab_assignments`. Pure and
// safe to call in middleware / server components / tests.

import type { AbExperiment, AbVariantSplit } from '@/lib/db/schema/ab';

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // Equivalent to: hash *= 0x01000193, but kept in 32-bit unsigned space.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash >>> 0;
}

export function bucket(experimentId: number | string, visitorId: string): number {
  return fnv1a32(`${experimentId}:${visitorId}`) % 100;
}

/**
 * Pick a variant key for `(experiment, visitor)`.
 *
 * Returns null only if the split is empty/invalid. The caller treats that
 * as "no experiment running, render the post as-is".
 */
export function assignVariant(
  experiment: Pick<AbExperiment, 'id' | 'variantSplit'>,
  visitorId: string,
): string | null {
  const split = experiment.variantSplit;
  if (!split || typeof split !== 'object') return null;

  // Sort keys so the cumulative ranges are stable regardless of JSON key order.
  const entries = (Object.entries(split) as Array<[string, number]>)
    .filter(([, weight]) => typeof weight === 'number' && weight > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  if (entries.length === 0) return null;

  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return null;

  // Bucket in [0, 100). Renormalize each weight to a /100 cumulative range.
  const slot = bucket(experiment.id, visitorId);
  let cumulative = 0;
  for (const [key, weight] of entries) {
    cumulative += (weight / total) * 100;
    if (slot < cumulative) return key;
  }
  // Floating-point fallback: hand the slot to the last variant.
  return entries[entries.length - 1][0];
}

export function normalizeSplit(split: AbVariantSplit): AbVariantSplit {
  const entries = (Object.entries(split) as Array<[string, number]>)
    .filter(([, w]) => typeof w === 'number' && w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return {};
  const out: AbVariantSplit = {};
  for (const [key, w] of entries) {
    out[key] = Math.round((w / total) * 100);
  }
  return out;
}
