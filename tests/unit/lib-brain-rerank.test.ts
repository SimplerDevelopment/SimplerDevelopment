import { describe, it, expect } from 'vitest';
import { reciprocalRankFusion, rescale } from '@/lib/brain/rerank';

describe('reciprocalRankFusion', () => {
  it('ranks a single list by position (best-first gets the highest score)', () => {
    const rrf = reciprocalRankFusion([['a', 'b', 'c']]);
    expect(rrf.get('a')).toBeCloseTo(1 / 60, 10);
    expect(rrf.get('b')).toBeCloseTo(1 / 61, 10);
    expect(rrf.get('c')).toBeCloseTo(1 / 62, 10);
    expect(rrf.get('a')!).toBeGreaterThan(rrf.get('b')!);
    expect(rrf.get('b')!).toBeGreaterThan(rrf.get('c')!);
  });

  it('rewards items that appear in BOTH lists over single-signal items', () => {
    // 'b' is in both lists; 'a' tops list1 only, 'c' tops list2 only.
    const rrf = reciprocalRankFusion([
      ['a', 'b'],
      ['b', 'c'],
    ]);
    expect(rrf.get('b')!).toBeGreaterThan(rrf.get('a')!);
    expect(rrf.get('b')!).toBeGreaterThan(rrf.get('c')!);
    // b = 1/61 (rank1 in list1) + 1/60 (rank0 in list2)
    expect(rrf.get('b')).toBeCloseTo(1 / 61 + 1 / 60, 10);
  });

  it('honors a custom k', () => {
    const rrf = reciprocalRankFusion([['a']], 1);
    expect(rrf.get('a')).toBeCloseTo(1 / 1, 10);
  });

  it('returns an empty map for empty input', () => {
    expect(reciprocalRankFusion([]).size).toBe(0);
    expect(reciprocalRankFusion([[]]).size).toBe(0);
  });
});

describe('rescale (band preservation)', () => {
  it('maps the midpoint of the source range to the midpoint of the band', () => {
    expect(rescale(5, 0, 10, 0, 1)).toBeCloseTo(0.5, 10);
  });

  it('keeps outputs INSIDE the destination band and preserves order', () => {
    const rrfs = [0.03, 0.016, 0.05, 0.02];
    const rMin = Math.min(...rrfs);
    const rMax = Math.max(...rrfs);
    const band = [0.2, 0.9]; // the original note score band
    const out = rrfs.map((r) => rescale(r, rMin, rMax, band[0], band[1]));
    // every rescaled score stays within the band → cross-entity ranking safe
    for (const s of out) {
      expect(s).toBeGreaterThanOrEqual(band[0] - 1e-9);
      expect(s).toBeLessThanOrEqual(band[1] + 1e-9);
    }
    // order preserved: highest rrf → highest (==band max), lowest → band min
    const maxIdx = rrfs.indexOf(rMax);
    const minIdx = rrfs.indexOf(rMin);
    expect(out[maxIdx]).toBeCloseTo(band[1], 10);
    expect(out[minIdx]).toBeCloseTo(band[0], 10);
  });

  it('degenerate source range maps to the band top (no collapse)', () => {
    expect(rescale(0.016, 0.016, 0.016, 0.2, 0.9)).toBe(0.9);
  });
});
