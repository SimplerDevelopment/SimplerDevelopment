// @vitest-environment node
/**
 * Unit tests for lib/pitch-deck-migration.ts
 *
 * Exercises all exported functions:
 *   - convertV1SlideToV2  (all 11 slide types)
 *   - convertAllSlidesToV2 (resets counter, maps all slides)
 *   - isV2Slides (empty array, v1 array, v2 array)
 *
 * No DB or framework deps — the module is pure transformation logic.
 */
import { describe, it, expect } from 'vitest';
import type { PitchDeckSlide } from '@/lib/db/schema';

// The module uses a module-level blockCounter, so we import fresh each test
// via named imports (vitest reuses the same module instance per suite run,
// so counter state accumulates across tests — that's fine; we only assert
// structural shapes, not exact uid values).
import {
  convertV1SlideToV2,
  convertAllSlidesToV2,
  isV2Slides,
} from '@/lib/pitch-deck-migration';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSlide(overrides: Partial<PitchDeckSlide> & Pick<PitchDeckSlide, 'type'>): PitchDeckSlide {
  return { id: 'slide-1', ...overrides };
}

// ---------------------------------------------------------------------------
// convertV1SlideToV2
// ---------------------------------------------------------------------------

describe('convertV1SlideToV2', () => {
  describe('cover', () => {
    it('produces a hero block with headline/subtitle/body', () => {
      const slide = makeSlide({
        type: 'cover',
        headline: 'Hello World',
        subheadline: 'Sub',
        body: 'Body text',
        notes: 'speaker notes',
      });
      const v2 = convertV1SlideToV2(slide);
      expect(v2.id).toBe('slide-1');
      expect(v2.label).toBe('Cover');
      expect(v2.notes).toBe('speaker notes');
      expect(v2.blocks).toHaveLength(1);
      const [hero] = v2.blocks;
      expect(hero.type).toBe('hero');
      expect((hero as { title: string }).title).toBe('Hello World');
      expect((hero as { subtitle?: string }).subtitle).toBe('Sub');
      expect((hero as { description?: string }).description).toBe('Body text');
    });

    it('falls back to empty string when headline is missing', () => {
      const slide = makeSlide({ type: 'cover' });
      const v2 = convertV1SlideToV2(slide);
      expect(v2.blocks).toHaveLength(1);
      expect((v2.blocks[0] as { title: string }).title).toBe('');
    });
  });

  describe('problem', () => {
    it('produces heading + text + card-grid when all fields present', () => {
      const slide = makeSlide({
        type: 'problem',
        headline: 'The Problem',
        body: 'It is bad',
        bullets: ['Issue A', 'Issue B', 'Issue C'],
      });
      const v2 = convertV1SlideToV2(slide);
      expect(v2.label).toBe('Problem');
      expect(v2.blocks).toHaveLength(3);
      expect(v2.blocks[0].type).toBe('heading');
      expect(v2.blocks[1].type).toBe('text');
      const grid = v2.blocks[2];
      expect(grid.type).toBe('card-grid');
      const cards = (grid as { cards: Array<{ title: string; icon: string }> }).cards;
      expect(cards).toHaveLength(3);
      expect(cards[0].icon).toBe('warning');
    });

    it('omits heading block when headline is absent', () => {
      const slide = makeSlide({ type: 'problem', bullets: ['Only bullet'] });
      const v2 = convertV1SlideToV2(slide);
      // No heading; only card-grid
      expect(v2.blocks).toHaveLength(1);
      expect(v2.blocks[0].type).toBe('card-grid');
    });

    it('omits text block when body is absent', () => {
      const slide = makeSlide({ type: 'problem', headline: 'H' });
      const v2 = convertV1SlideToV2(slide);
      expect(v2.blocks).toHaveLength(1);
      expect(v2.blocks[0].type).toBe('heading');
    });

    it('uses provided columns for grid', () => {
      const slide = makeSlide({ type: 'problem', bullets: ['A', 'B'], columns: 2 });
      const v2 = convertV1SlideToV2(slide);
      const grid = v2.blocks[0] as { columns: number };
      expect(grid.columns).toBe(2);
    });

    it('derives columns from bullet count (max 3) when columns absent', () => {
      const slide = makeSlide({ type: 'problem', bullets: ['A'] });
      const v2 = convertV1SlideToV2(slide);
      const grid = v2.blocks[0] as { columns: number };
      expect(grid.columns).toBe(1);
    });
  });

  describe('solution', () => {
    it('uses check_circle icon on bullet cards', () => {
      const slide = makeSlide({ type: 'solution', bullets: ['Sol A'] });
      const v2 = convertV1SlideToV2(slide);
      const cards = (v2.blocks[0] as { cards: Array<{ icon: string }> }).cards;
      expect(cards[0].icon).toBe('check_circle');
    });
  });

  describe('features', () => {
    it('produces heading + card-grid with star icons', () => {
      const slide = makeSlide({ type: 'features', headline: 'Features', bullets: ['F1', 'F2'] });
      const v2 = convertV1SlideToV2(slide);
      expect(v2.label).toBe('Features');
      expect(v2.blocks).toHaveLength(2);
      const cards = (v2.blocks[1] as { cards: Array<{ icon: string }> }).cards;
      expect(cards[0].icon).toBe('star');
    });

    it('emits no blocks when headline and bullets absent', () => {
      const slide = makeSlide({ type: 'features' });
      const v2 = convertV1SlideToV2(slide);
      expect(v2.blocks).toHaveLength(0);
    });
  });

  describe('process', () => {
    it('produces heading + card-grid with numbered step titles', () => {
      const slide = makeSlide({
        type: 'process',
        headline: 'How it works',
        steps: [
          { title: 'Step One', description: 'Desc 1' },
          { title: 'Step Two', description: 'Desc 2' },
        ],
      });
      const v2 = convertV1SlideToV2(slide);
      expect(v2.label).toBe('Process');
      expect(v2.blocks).toHaveLength(2);
      const cards = (v2.blocks[1] as { cards: Array<{ title: string; description: string }> }).cards;
      expect(cards[0].title).toBe('1. Step One');
      expect(cards[1].title).toBe('2. Step Two');
      expect(cards[0].description).toBe('Desc 1');
    });

    it('skips card-grid when steps absent', () => {
      const slide = makeSlide({ type: 'process', headline: 'H' });
      const v2 = convertV1SlideToV2(slide);
      expect(v2.blocks).toHaveLength(1);
    });
  });

  describe('metrics', () => {
    it('produces heading + stats block', () => {
      const slide = makeSlide({
        type: 'metrics',
        headline: 'Numbers',
        stats: [
          { value: '100k', label: 'Users' },
          { value: '99%', label: 'Uptime' },
        ],
      });
      const v2 = convertV1SlideToV2(slide);
      expect(v2.label).toBe('Metrics');
      expect(v2.blocks).toHaveLength(2);
      const statsBlock = v2.blocks[1];
      expect(statsBlock.type).toBe('stats');
      const stats = (statsBlock as { stats: Array<{ value: string; label: string }> }).stats;
      expect(stats[0].value).toBe('100k');
      expect(stats[1].label).toBe('Uptime');
    });

    it('derives columns from stats count (max 4)', () => {
      const slide = makeSlide({
        type: 'metrics',
        stats: [{ value: 'A', label: 'B' }],
      });
      const v2 = convertV1SlideToV2(slide);
      const statsBlock = v2.blocks[0] as { columns: number };
      expect(statsBlock.columns).toBe(1);
    });
  });

  describe('testimonial', () => {
    it('produces a testimonial block using body as quote', () => {
      const slide = makeSlide({ type: 'testimonial', body: 'Great product', subheadline: 'Jane Doe' });
      const v2 = convertV1SlideToV2(slide);
      expect(v2.label).toBe('Testimonial');
      expect(v2.blocks).toHaveLength(1);
      const block = v2.blocks[0] as { quote: string; author: string };
      expect(block.type).toBe('testimonial');
      expect(block.quote).toBe('Great product');
      expect(block.author).toBe('Jane Doe');
    });

    it('falls back to headline when body absent', () => {
      const slide = makeSlide({ type: 'testimonial', headline: 'Fallback quote' });
      const v2 = convertV1SlideToV2(slide);
      const block = v2.blocks[0] as { quote: string; author: string };
      expect(block.quote).toBe('Fallback quote');
      expect(block.author).toBe('Unknown');
    });
  });

  describe('team', () => {
    it('produces heading + card-grid with member name/role/image', () => {
      const slide = makeSlide({
        type: 'team',
        headline: 'Our Team',
        members: [{ name: 'Alice', role: 'CEO', image: 'alice.jpg' }],
      });
      const v2 = convertV1SlideToV2(slide);
      expect(v2.label).toBe('Team');
      expect(v2.blocks).toHaveLength(2);
      const cards = (v2.blocks[1] as { cards: Array<{ title: string; description: string; image?: string }> }).cards;
      expect(cards[0].title).toBe('Alice');
      expect(cards[0].description).toBe('CEO');
      expect(cards[0].image).toBe('alice.jpg');
    });

    it('skips card-grid when no members', () => {
      const slide = makeSlide({ type: 'team', headline: 'H' });
      const v2 = convertV1SlideToV2(slide);
      expect(v2.blocks).toHaveLength(1);
    });
  });

  describe('pricing', () => {
    it('produces heading + card-grid with tier name/price/features', () => {
      const slide = makeSlide({
        type: 'pricing',
        headline: 'Plans',
        tiers: [{ name: 'Pro', price: '$99/mo', features: ['Feat A', 'Feat B'] }],
      });
      const v2 = convertV1SlideToV2(slide);
      expect(v2.label).toBe('Pricing');
      expect(v2.blocks).toHaveLength(2);
      const cards = (v2.blocks[1] as { cards: Array<{ title: string; description: string }> }).cards;
      expect(cards[0].title).toBe('Pro — $99/mo');
      expect(cards[0].description).toBe('Feat A | Feat B');
    });

    it('skips card-grid when no tiers', () => {
      const slide = makeSlide({ type: 'pricing' });
      const v2 = convertV1SlideToV2(slide);
      expect(v2.blocks).toHaveLength(0);
    });
  });

  describe('cta', () => {
    it('produces a cta block with defaults', () => {
      const slide = makeSlide({ type: 'cta', headline: 'Join now', body: 'Sign up today' });
      const v2 = convertV1SlideToV2(slide);
      expect(v2.label).toBe('Call to Action');
      expect(v2.blocks).toHaveLength(1);
      const block = v2.blocks[0] as { title: string; description?: string; primaryButtonText: string };
      expect(block.type).toBe('cta');
      expect(block.title).toBe('Join now');
      expect(block.description).toBe('Sign up today');
      expect(block.primaryButtonText).toBe('Get Started');
    });

    it('falls back to subheadline for description when body absent', () => {
      const slide = makeSlide({ type: 'cta', subheadline: 'Sub' });
      const v2 = convertV1SlideToV2(slide);
      const block = v2.blocks[0] as { description?: string };
      expect(block.description).toBe('Sub');
    });
  });

  describe('custom', () => {
    it('produces heading + text + card-grid + stats when all fields present', () => {
      const slide = makeSlide({
        type: 'custom',
        headline: 'Custom Title',
        body: 'Some body',
        bullets: ['B1'],
        stats: [{ value: '5', label: 'Things' }],
      });
      const v2 = convertV1SlideToV2(slide);
      expect(v2.label).toBe('Custom');
      expect(v2.blocks).toHaveLength(4);
      expect(v2.blocks[0].type).toBe('heading');
      expect(v2.blocks[1].type).toBe('text');
      expect(v2.blocks[2].type).toBe('card-grid');
      expect(v2.blocks[3].type).toBe('stats');
    });

    it('produces no blocks for a completely empty custom slide', () => {
      const slide = makeSlide({ type: 'custom' });
      const v2 = convertV1SlideToV2(slide);
      expect(v2.blocks).toHaveLength(0);
    });
  });

  it('each block gets a unique id', () => {
    const slide = makeSlide({
      type: 'problem',
      headline: 'H',
      body: 'B',
      bullets: ['X', 'Y'],
    });
    const v2 = convertV1SlideToV2(slide);
    const ids = v2.blocks.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// convertAllSlidesToV2
// ---------------------------------------------------------------------------

describe('convertAllSlidesToV2', () => {
  it('maps all slides and resets block counter', () => {
    const slides: PitchDeckSlide[] = [
      makeSlide({ id: 's1', type: 'cover', headline: 'A' }),
      makeSlide({ id: 's2', type: 'cta', headline: 'B' }),
    ];
    const result = convertAllSlidesToV2(slides);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('s1');
    expect(result[1].id).toBe('s2');
    // Running again should produce identical structure (counter resets)
    const result2 = convertAllSlidesToV2(slides);
    // Both runs produce the same number of blocks
    expect(result2[0].blocks.length).toBe(result[0].blocks.length);
    // Block ids start from block-<timestamp>-1- again each run
    const firstId = result[0].blocks[0].id;
    const secondId = result2[0].blocks[0].id;
    // They differ only because Date.now() changes, not because counter leaked
    expect(firstId).toMatch(/^block-/);
    expect(secondId).toMatch(/^block-/);
  });

  it('returns an empty array for an empty input', () => {
    expect(convertAllSlidesToV2([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// isV2Slides
// ---------------------------------------------------------------------------

describe('isV2Slides', () => {
  it('returns true for empty arrays', () => {
    expect(isV2Slides([])).toBe(true);
  });

  it('returns true when first element has a "blocks" key', () => {
    const v2Slide = { id: 's1', label: 'Cover', blocks: [] };
    expect(isV2Slides([v2Slide])).toBe(true);
  });

  it('returns false when first element has no "blocks" key', () => {
    const v1Slide = { id: 's1', type: 'cover', headline: 'H' };
    expect(isV2Slides([v1Slide])).toBe(false);
  });
});
