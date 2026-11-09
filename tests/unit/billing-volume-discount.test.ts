import { describe, expect, it } from 'vitest';
import {
  BUNDLE,
  applyVolumeDiscount,
  discountedModuleCents,
  nextVolumeTier,
  sumOfModulePricesCents,
  volumeTierFor,
} from '@/lib/billing/domain-catalog';

describe('volume tiers', () => {
  it('returns null below the first threshold', () => {
    expect(volumeTierFor(0)).toBeNull();
    expect(volumeTierFor(3)).toBeNull();
  });

  it('unlocks the best matching tier', () => {
    expect(volumeTierFor(4)?.percentOff).toBe(10);
    expect(volumeTierFor(7)?.percentOff).toBe(10);
    expect(volumeTierFor(8)?.percentOff).toBe(20);
    expect(volumeTierFor(11)?.percentOff).toBe(20);
    expect(volumeTierFor(12)?.percentOff).toBe(40);
    expect(volumeTierFor(13)?.percentOff).toBe(46);
    expect(volumeTierFor(99)?.percentOff).toBe(46);
  });

  it('nextVolumeTier points at the next unlock (nudge copy)', () => {
    expect(nextVolumeTier(3)).toEqual({ minModules: 4, percentOff: 10 });
    expect(nextVolumeTier(4)).toEqual({ minModules: 8, percentOff: 20 });
    expect(nextVolumeTier(12)).toEqual({ minModules: 13, percentOff: 46 });
    expect(nextVolumeTier(13)).toBeNull();
  });
});

describe('applyVolumeDiscount', () => {
  it('no discount below threshold, totals cohere', () => {
    expect(applyVolumeDiscount(10000, 2)).toEqual({
      discountPercent: 0,
      discountCents: 0,
      totalCents: 10000,
    });
  });

  it('applies the unlocked percent with half-up rounding', () => {
    // 10_000c @ 10% = 1_000c → 9_000c.
    expect(applyVolumeDiscount(10000, 4)).toEqual({
      discountPercent: 10,
      discountCents: 1000,
      totalCents: 9000,
    });
    // 199c @ 10% = 19.9c → rounds to 20c (JS Math.round, half up).
    const r = applyVolumeDiscount(199, 4);
    expect(r.discountCents).toBe(20);
    expect(r.totalCents).toBe(179);
  });

  it('never charges more than the bundle ceiling at full breadth', () => {
    const full = applyVolumeDiscount(sumOfModulePricesCents(), 13);
    expect(full.totalCents).toBeLessThanOrEqual(BUNDLE.monthlyPriceCents);
  });
});

describe('discountedModuleCents', () => {
  it('rounds per-line amounts', () => {
    expect(discountedModuleCents(1000, 10)).toBe(900);
    expect(discountedModuleCents(199, 10)).toBe(179);
    expect(discountedModuleCents(1000, 0)).toBe(1000);
  });
});
