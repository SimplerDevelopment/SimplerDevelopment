import { describe, it, expect } from 'vitest';
import { estimateCostUsd, modelRate, FALLBACK_RATE } from '@/lib/ai/evals/cost';

describe('eval cost rates', () => {
  it('prices each registry suite at its model rate (all Sonnet → $3 in / $15 out per MTok)', () => {
    for (const suite of ['meeting-extractor', 'branding-messaging', 'branding-theme', 'deck-generator']) {
      expect(estimateCostUsd(suite, 1_000_000, 1_000_000)).toBeCloseTo(18, 6);
    }
  });

  it('mock runs (zero tokens) cost nothing', () => {
    expect(estimateCostUsd('deck-generator', 0, 0)).toBe(0);
  });

  it('falls back to the blended rate for an unknown suite', () => {
    expect(estimateCostUsd('does-not-exist', 1_000_000, 0)).toBeCloseTo(FALLBACK_RATE.input, 6);
  });

  it('modelRate maps known models and falls back otherwise', () => {
    expect(modelRate('claude-haiku-4-5')).toEqual({ input: 1, output: 5 });
    expect(modelRate('claude-opus-4-8')).toEqual({ input: 5, output: 25 });
    expect(modelRate(undefined)).toEqual(FALLBACK_RATE);
    expect(modelRate('nonexistent-model')).toEqual(FALLBACK_RATE);
  });
});
