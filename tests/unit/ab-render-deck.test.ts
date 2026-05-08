// @vitest-environment node
/**
 * Unit tests for `applyAbToDeckSlides` (lib/ab/render.ts).
 *
 * Pins down the safety contract that a malformed variant payload MUST NEVER
 * blank a presentation: any non-array / unparsable override has to fall
 * through to the original deck slides.
 *
 * Strategy: mock at the module boundary.
 *   - `lib/ab/visitor.ts`  → fake `ensureVisitorId` (no real cookies()).
 *   - `lib/ab/resolve.ts`  → fake `resolveAbContentForTarget` so each branch
 *      can be driven deterministically without touching the DB.
 *
 * Companion file `ab-resolve-target.test.ts` covers the resolver itself
 * with its own DB-level mocks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PitchDeckSlideV2 } from '@/lib/db/schema';

const ensureVisitorIdMock = vi.fn();
const resolveAbContentForTargetMock = vi.fn();

vi.mock('@/lib/ab/visitor', () => ({
  ensureVisitorId: ensureVisitorIdMock,
}));

vi.mock('@/lib/ab/resolve', () => ({
  resolveAbContentForTarget: resolveAbContentForTargetMock,
}));

function slide(id: string, label = id): PitchDeckSlideV2 {
  return { id, label, blocks: [] };
}

const ORIGINAL_SLIDES: PitchDeckSlideV2[] = [slide('s1', 'Cover'), slide('s2', 'Pitch')];
const VARIANT_SLIDES: PitchDeckSlideV2[] = [slide('v1', 'Cover B'), slide('v2', 'Pitch B')];

const ABRES_SWAPPED = {
  experimentId: 7,
  variantKey: 'b',
  swapped: true,
  goalMetric: 'click',
  goalSelector: null,
};
const ABRES_NO_SWAP = {
  experimentId: 7,
  variantKey: 'a',
  swapped: false,
  goalMetric: 'click',
  goalSelector: null,
};

describe('lib/ab/render — applyAbToDeckSlides', () => {
  beforeEach(() => {
    ensureVisitorIdMock.mockReset();
    resolveAbContentForTargetMock.mockReset();
    ensureVisitorIdMock.mockResolvedValue({ id: 'visitor-test-1', fresh: false });
  });

  it('skip:true returns originals + null ab + null visitorId, no DB calls', async () => {
    const { applyAbToDeckSlides } = await import('@/lib/ab/render');
    const result = await applyAbToDeckSlides({
      deckId: 99,
      slides: ORIGINAL_SLIDES,
      skip: true,
    });

    expect(result.slides).toBe(ORIGINAL_SLIDES);
    expect(result.ab).toBeNull();
    expect(result.visitorId).toBeNull();
    expect(ensureVisitorIdMock).not.toHaveBeenCalled();
    expect(resolveAbContentForTargetMock).not.toHaveBeenCalled();
  });

  it('returns originals + null ab when no experiment is running', async () => {
    resolveAbContentForTargetMock.mockResolvedValue({
      content: JSON.stringify(ORIGINAL_SLIDES),
      ab: null,
    });

    const { applyAbToDeckSlides } = await import('@/lib/ab/render');
    const result = await applyAbToDeckSlides({
      deckId: 1,
      slides: ORIGINAL_SLIDES,
    });

    expect(result.slides).toBe(ORIGINAL_SLIDES);
    expect(result.ab).toBeNull();
    expect(result.visitorId).toBe('visitor-test-1');
    expect(resolveAbContentForTargetMock).toHaveBeenCalledWith(
      'deck',
      1,
      'visitor-test-1',
      JSON.stringify(ORIGINAL_SLIDES),
    );
  });

  it('returns originals + ab metadata when chosen variant has no override (swapped:false)', async () => {
    resolveAbContentForTargetMock.mockResolvedValue({
      content: JSON.stringify(ORIGINAL_SLIDES),
      ab: ABRES_NO_SWAP,
    });

    const { applyAbToDeckSlides } = await import('@/lib/ab/render');
    const result = await applyAbToDeckSlides({
      deckId: 2,
      slides: ORIGINAL_SLIDES,
    });

    expect(result.slides).toBe(ORIGINAL_SLIDES);
    expect(result.ab).toEqual(ABRES_NO_SWAP);
    expect(result.ab?.swapped).toBe(false);
    expect(result.visitorId).toBe('visitor-test-1');
  });

  it('returns variant slides + swapped:true when override is a valid slide array', async () => {
    resolveAbContentForTargetMock.mockResolvedValue({
      content: JSON.stringify(VARIANT_SLIDES),
      ab: ABRES_SWAPPED,
    });

    const { applyAbToDeckSlides } = await import('@/lib/ab/render');
    const result = await applyAbToDeckSlides({
      deckId: 3,
      slides: ORIGINAL_SLIDES,
    });

    expect(result.slides).toEqual(VARIANT_SLIDES);
    expect(result.ab).toEqual(ABRES_SWAPPED);
    expect(result.ab?.swapped).toBe(true);
    expect(result.visitorId).toBe('visitor-test-1');
  });

  describe('malformed variant payloads — must fall back to originals (safety contract)', () => {
    it('falls back when override parses to a string', async () => {
      resolveAbContentForTargetMock.mockResolvedValue({
        content: JSON.stringify('hello'), // parses to "hello", not an array
        ab: ABRES_SWAPPED,
      });

      const { applyAbToDeckSlides } = await import('@/lib/ab/render');
      const result = await applyAbToDeckSlides({
        deckId: 4,
        slides: ORIGINAL_SLIDES,
      });

      expect(result.slides).toBe(ORIGINAL_SLIDES);
      expect(result.ab).toEqual(ABRES_SWAPPED);
    });

    it('falls back when override parses to a number', async () => {
      resolveAbContentForTargetMock.mockResolvedValue({
        content: '42',
        ab: ABRES_SWAPPED,
      });

      const { applyAbToDeckSlides } = await import('@/lib/ab/render');
      const result = await applyAbToDeckSlides({
        deckId: 5,
        slides: ORIGINAL_SLIDES,
      });

      expect(result.slides).toBe(ORIGINAL_SLIDES);
      expect(result.ab).toEqual(ABRES_SWAPPED);
    });

    it('falls back when override parses to an object (not array)', async () => {
      resolveAbContentForTargetMock.mockResolvedValue({
        content: JSON.stringify({ wat: true }),
        ab: ABRES_SWAPPED,
      });

      const { applyAbToDeckSlides } = await import('@/lib/ab/render');
      const result = await applyAbToDeckSlides({
        deckId: 6,
        slides: ORIGINAL_SLIDES,
      });

      expect(result.slides).toBe(ORIGINAL_SLIDES);
      expect(result.ab).toEqual(ABRES_SWAPPED);
    });

    it('falls back when override parses to null', async () => {
      resolveAbContentForTargetMock.mockResolvedValue({
        content: 'null',
        ab: ABRES_SWAPPED,
      });

      const { applyAbToDeckSlides } = await import('@/lib/ab/render');
      const result = await applyAbToDeckSlides({
        deckId: 7,
        slides: ORIGINAL_SLIDES,
      });

      expect(result.slides).toBe(ORIGINAL_SLIDES);
      expect(result.ab).toEqual(ABRES_SWAPPED);
    });

    it('falls back when override is not valid JSON at all', async () => {
      resolveAbContentForTargetMock.mockResolvedValue({
        content: 'this is not json {{{',
        ab: ABRES_SWAPPED,
      });

      const { applyAbToDeckSlides } = await import('@/lib/ab/render');
      const result = await applyAbToDeckSlides({
        deckId: 8,
        slides: ORIGINAL_SLIDES,
      });

      expect(result.slides).toBe(ORIGINAL_SLIDES);
      expect(result.ab).toEqual(ABRES_SWAPPED);
    });
  });

  it('handles empty original slides without throwing', async () => {
    resolveAbContentForTargetMock.mockResolvedValue({
      content: JSON.stringify(VARIANT_SLIDES),
      ab: ABRES_SWAPPED,
    });

    const { applyAbToDeckSlides } = await import('@/lib/ab/render');
    const result = await applyAbToDeckSlides({
      deckId: 9,
      slides: [],
    });

    expect(result.slides).toEqual(VARIANT_SLIDES);
    expect(result.ab?.swapped).toBe(true);
    expect(resolveAbContentForTargetMock).toHaveBeenCalledWith('deck', 9, 'visitor-test-1', '[]');
  });
});
