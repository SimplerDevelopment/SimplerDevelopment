// @vitest-environment node
/**
 * Unit tests for the sequential (always-valid) test + SRM guardrail added to
 * lib/ab/stats.ts. Verified against textbook chi-square critical values and the
 * mSPRT's mathematical invariants.
 */
import { describe, it, expect } from 'vitest';
import {
  chiSquareSurvival,
  sampleRatioMismatch,
  sequentialPValue,
} from '@/lib/ab/stats';

describe('chiSquareSurvival', () => {
  // 95th-percentile critical values → survival ≈ 0.05.
  it('matches textbook critical values', () => {
    expect(chiSquareSurvival(3.8415, 1)).toBeCloseTo(0.05, 3);
    expect(chiSquareSurvival(5.9915, 2)).toBeCloseTo(0.05, 3);
    expect(chiSquareSurvival(7.8147, 3)).toBeCloseTo(0.05, 3);
    // 99th percentile, df=1
    expect(chiSquareSurvival(6.635, 1)).toBeCloseTo(0.01, 3);
  });
  it('is 1 at x<=0 and ~0 far in the tail', () => {
    expect(chiSquareSurvival(0, 1)).toBe(1);
    expect(chiSquareSurvival(100, 1)).toBeLessThan(1e-10);
  });
});

describe('sampleRatioMismatch', () => {
  it('passes an on-target equal split', () => {
    const r = sampleRatioMismatch([505, 495]);
    expect(r.mismatch).toBe(false);
    expect(r.df).toBe(1);
    expect(r.pValue).toBeGreaterThan(0.1);
  });
  it('flags a clear mismatch (600/400 vs expected 500/500)', () => {
    const r = sampleRatioMismatch([600, 400]);
    expect(r.chiSquare).toBeCloseTo(40, 6);
    expect(r.mismatch).toBe(true);
    expect(r.pValue).toBeLessThan(0.001);
  });
  it('honors custom expected ratios (90/10) — a 90/10 split is fine', () => {
    const r = sampleRatioMismatch([900, 100], [0.9, 0.1]);
    expect(r.mismatch).toBe(false);
  });
  it('is a no-op with <2 arms or zero traffic', () => {
    expect(sampleRatioMismatch([10]).mismatch).toBe(false);
    expect(sampleRatioMismatch([0, 0]).mismatch).toBe(false);
  });
});

describe('sequentialPValue (mSPRT)', () => {
  it('does not call a winner when there is no effect', () => {
    const r = sequentialPValue({ n: 1000, x: 100 }, { n: 1000, x: 100 });
    expect(r.pValue).toBeGreaterThan(0.05);
    expect(r.lambda).toBeLessThan(1);
  });
  it('detects a large, well-powered effect (10% → 20%)', () => {
    const r = sequentialPValue({ n: 1000, x: 100 }, { n: 1000, x: 200 });
    expect(r.pValue).toBeLessThan(0.05);
    expect(r.lambda).toBeGreaterThan(1);
  });
  it('is monotone — a bigger gap is more significant', () => {
    const small = sequentialPValue({ n: 2000, x: 200 }, { n: 2000, x: 240 });
    const big = sequentialPValue({ n: 2000, x: 200 }, { n: 2000, x: 360 });
    expect(big.pValue).toBeLessThan(small.pValue);
  });
  it('returns a non-significant p when an arm is empty', () => {
    expect(sequentialPValue({ n: 0, x: 0 }, { n: 100, x: 50 }).pValue).toBe(1);
  });
  it('keeps p within [0,1]', () => {
    const r = sequentialPValue({ n: 5000, x: 250 }, { n: 5000, x: 1500 });
    expect(r.pValue).toBeGreaterThanOrEqual(0);
    expect(r.pValue).toBeLessThanOrEqual(1);
  });
});
