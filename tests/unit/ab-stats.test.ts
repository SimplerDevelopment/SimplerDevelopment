import { describe, it, expect } from 'vitest';
import { erf, normalCdf, twoProportionZTest } from '@/lib/ab/stats';

describe('lib/ab/stats', () => {
  describe('erf', () => {
    it('matches textbook values', () => {
      // Reference: NIST/Abramowitz tables.
      expect(erf(0)).toBeCloseTo(0, 6);
      expect(erf(0.5)).toBeCloseTo(0.5204998778, 4);
      expect(erf(1)).toBeCloseTo(0.8427007929, 4);
      expect(erf(2)).toBeCloseTo(0.9953222650, 4);
      expect(erf(-1)).toBeCloseTo(-0.8427007929, 4);
    });
  });

  describe('normalCdf', () => {
    it('matches textbook Φ values', () => {
      expect(normalCdf(0)).toBeCloseTo(0.5, 4);
      expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
      expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
      expect(normalCdf(2.58)).toBeCloseTo(0.995, 3);
    });
  });

  describe('twoProportionZTest', () => {
    it('returns z=0, p=1, lift=0 for equal arms', () => {
      const r = twoProportionZTest({ n: 1000, x: 100 }, { n: 1000, x: 100 });
      expect(r.z).toBeCloseTo(0, 6);
      expect(r.p).toBeCloseTo(0.5, 4);
      expect(r.lift).toBeCloseTo(0, 6);
    });

    it('matches textbook calculation for a 10% vs 12% conversion comparison', () => {
      // pA = 100/1000 = 0.10, pB = 120/1000 = 0.12.
      // Pooled p = 220/2000 = 0.11; SE = sqrt(0.11*0.89*(1/1000 + 1/1000)) ≈ 0.013998
      // z = (0.12 - 0.10) / 0.013998 ≈ 1.4288
      const r = twoProportionZTest({ n: 1000, x: 100 }, { n: 1000, x: 120 });
      expect(r.z).toBeCloseTo(1.4288, 2);
      // One-tailed p ≈ 0.0765
      expect(r.p).toBeGreaterThan(0.05);
      expect(r.p).toBeLessThan(0.1);
      expect(r.lift).toBeCloseTo(0.2, 4); // (12% - 10%) / 10% = 20%
    });

    it('flags a clear winner with p < 0.01', () => {
      // Strong effect: 10% vs 15% over 5000 each.
      const r = twoProportionZTest({ n: 5000, x: 500 }, { n: 5000, x: 750 });
      expect(r.z).toBeGreaterThan(2.5);
      expect(r.p).toBeLessThan(0.01);
      expect(r.lift).toBeCloseTo(0.5, 4);
    });

    it('handles zero-trial inputs without throwing', () => {
      const r = twoProportionZTest({ n: 0, x: 0 }, { n: 0, x: 0 });
      expect(r.z).toBe(0);
      expect(r.p).toBe(1);
      expect(r.lift).toBe(0);
    });

    it('returns 0 lift when control rate is 0', () => {
      const r = twoProportionZTest({ n: 100, x: 0 }, { n: 100, x: 5 });
      expect(r.lift).toBe(0);
    });

    it('returns p ≈ 0.5 when variant matches control exactly', () => {
      const r = twoProportionZTest({ n: 1000, x: 200 }, { n: 1000, x: 200 });
      expect(r.p).toBeCloseTo(0.5, 4);
    });

    it('produces a negative z when variant underperforms control', () => {
      const r = twoProportionZTest({ n: 1000, x: 150 }, { n: 1000, x: 100 });
      expect(r.z).toBeLessThan(0);
      // One-tailed p (B beats A) > 0.5 since B is worse.
      expect(r.p).toBeGreaterThan(0.5);
    });
  });
});
