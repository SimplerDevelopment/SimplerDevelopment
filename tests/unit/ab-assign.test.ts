import { describe, it, expect } from 'vitest';
import { assignVariant, bucket, normalizeSplit } from '@/lib/ab/assign';

describe('lib/ab/assign', () => {
  describe('bucket', () => {
    it('is deterministic for the same (experiment, visitor)', () => {
      const a = bucket(42, 'visitor-abc-123');
      const b = bucket(42, 'visitor-abc-123');
      expect(a).toBe(b);
    });

    it('produces values in [0, 100)', () => {
      for (let i = 0; i < 1000; i++) {
        const v = bucket(7, `v-${i}`);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(100);
      }
    });

    it('differs for different visitors most of the time', () => {
      const counts = new Set<number>();
      for (let i = 0; i < 200; i++) {
        counts.add(bucket(1, `visitor-${i}`));
      }
      // 200 visitors → many distinct buckets (not all 200, but well over 30).
      expect(counts.size).toBeGreaterThan(30);
    });
  });

  describe('assignVariant', () => {
    it('returns a stable variant for the same visitor', () => {
      const exp = { id: 12, variantSplit: { a: 50, b: 50 } };
      const first = assignVariant(exp, 'visitor-stable');
      const second = assignVariant(exp, 'visitor-stable');
      const third = assignVariant(exp, 'visitor-stable');
      expect(first).toBe(second);
      expect(second).toBe(third);
    });

    it('approximates the configured 50/50 split over 10k visitors', () => {
      const exp = { id: 99, variantSplit: { a: 50, b: 50 } };
      const counts = { a: 0, b: 0 } as Record<string, number>;
      for (let i = 0; i < 10000; i++) {
        const v = assignVariant(exp, `v-${i}`);
        if (v) counts[v] = (counts[v] ?? 0) + 1;
      }
      // Expect each bucket within ±2% of the target.
      expect(counts.a).toBeGreaterThan(4700);
      expect(counts.a).toBeLessThan(5300);
      expect(counts.b).toBeGreaterThan(4700);
      expect(counts.b).toBeLessThan(5300);
    });

    it('approximates an asymmetric 80/20 split', () => {
      const exp = { id: 13, variantSplit: { a: 80, b: 20 } };
      const counts = { a: 0, b: 0 } as Record<string, number>;
      for (let i = 0; i < 10000; i++) {
        const v = assignVariant(exp, `vv-${i}`);
        if (v) counts[v] = (counts[v] ?? 0) + 1;
      }
      // 80% ± 2% and 20% ± 2%.
      expect(counts.a).toBeGreaterThan(7800);
      expect(counts.a).toBeLessThan(8200);
      expect(counts.b).toBeGreaterThan(1800);
      expect(counts.b).toBeLessThan(2200);
    });

    it('renormalizes splits that do not sum to 100', () => {
      const exp = { id: 5, variantSplit: { a: 1, b: 1 } };
      const counts = { a: 0, b: 0 } as Record<string, number>;
      for (let i = 0; i < 4000; i++) {
        const v = assignVariant(exp, `vr-${i}`);
        if (v) counts[v] = (counts[v] ?? 0) + 1;
      }
      // 50/50 within ±3%.
      expect(counts.a).toBeGreaterThan(1880);
      expect(counts.a).toBeLessThan(2120);
    });

    it('handles three-arm splits', () => {
      const exp = { id: 8, variantSplit: { a: 33, b: 33, c: 34 } };
      const counts: Record<string, number> = {};
      for (let i = 0; i < 6000; i++) {
        const v = assignVariant(exp, `t-${i}`);
        if (v) counts[v] = (counts[v] ?? 0) + 1;
      }
      // Each arm ≈ 2000 ± 200.
      expect(counts.a).toBeGreaterThan(1800);
      expect(counts.a).toBeLessThan(2200);
      expect(counts.b).toBeGreaterThan(1800);
      expect(counts.b).toBeLessThan(2200);
      expect(counts.c).toBeGreaterThan(1800);
      expect(counts.c).toBeLessThan(2200);
    });

    it('returns null for an empty split', () => {
      const exp = { id: 1, variantSplit: {} };
      expect(assignVariant(exp, 'v')).toBeNull();
    });

    it('ignores zero-weight variants', () => {
      const exp = { id: 1, variantSplit: { a: 100, b: 0 } };
      for (let i = 0; i < 200; i++) {
        expect(assignVariant(exp, `z-${i}`)).toBe('a');
      }
    });
  });

  describe('normalizeSplit', () => {
    it('rescales any positive weights to sum to ~100', () => {
      const out = normalizeSplit({ a: 1, b: 1 });
      expect(out.a + out.b).toBe(100);
    });

    it('drops invalid weights', () => {
      const out = normalizeSplit({ a: 1, b: 0, c: -2 } as Record<string, number>);
      expect(out.a).toBe(100);
      expect('b' in out).toBe(false);
    });
  });
});
