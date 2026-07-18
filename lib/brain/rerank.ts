/**
 * Reciprocal Rank Fusion (RRF) — a principled reranker for hybrid retrieval.
 *
 * The brain search runs two independent signals (lexical ILIKE + semantic
 * pgvector) and used to fuse them by adding their 0..1 scores
 * (`min(1, lex + sem*0.5)`) — a hand-tuned heuristic. RRF is the standard,
 * score-scale-free alternative: it fuses *ranked lists* by summing
 * `1 / (k + rank)` across the lists an item appears in, so an item ranked
 * highly by either signal floats up without either signal's raw score
 * magnitude dominating. k dampens the contribution of low ranks (k=60 is the
 * canonical default from Cormack et al., 2009).
 *
 * Pure + deterministic → unit-tested in isolation. The caller is responsible
 * for any score-band renormalization it needs (see `mergeNoteHits`), because
 * RRF scores are not on the same 0..1 scale as the rest of the result set.
 */

/** A ranked list, best-first, identified by stable id. */
export type RankedIds = Array<string | number>;

/**
 * Fuse N ranked lists into a single RRF score per id.
 * @param lists  each list is ids in rank order (index 0 = best)
 * @param k      rank-dampening constant (default 60)
 * @returns Map of id → summed RRF score (higher is better)
 */
export function reciprocalRankFusion(lists: RankedIds[], k = 60): Map<string | number, number> {
  const scores = new Map<string | number, number>();
  for (const list of lists) {
    for (let rank = 0; rank < list.length; rank++) {
      const id = list[rank];
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    }
  }
  return scores;
}

/**
 * Linearly map a value from [srcMin, srcMax] into [dstMin, dstMax].
 * Degenerate source range (all-equal) maps to dstMax (preserves the top of
 * the band rather than collapsing to the bottom). Used to renormalize RRF
 * scores back into an existing 0..1 score band so fused items stay comparable
 * to other entity types in a shared global sort.
 */
export function rescale(value: number, srcMin: number, srcMax: number, dstMin: number, dstMax: number): number {
  if (srcMax <= srcMin) return dstMax;
  const t = (value - srcMin) / (srcMax - srcMin);
  return dstMin + t * (dstMax - dstMin);
}
