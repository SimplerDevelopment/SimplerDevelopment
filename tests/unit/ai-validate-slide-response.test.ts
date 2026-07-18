// @vitest-environment node
/**
 * Unit tests for `validateSlideResponse` in lib/ai/validate-slide-response.ts.
 *
 * Exercises the normalization layer that hardens AI-generated slide JSON
 * before it hits the DB: id pinning, label defaults, blocks-array repair,
 * per-block id/order assignment, unknown-type warnings, color validation,
 * and elementStyles cleanup. Uses the real block-schemas registry because
 * it's pure data.
 */
import { describe, it, expect } from 'vitest';
import { validateSlideResponse } from '@/lib/ai/validate-slide-response';

const ORIGINAL_ID = 'slide-original-123';

describe('validateSlideResponse', () => {
  describe('top-level guard', () => {
    it('rejects null', () => {
      const r = validateSlideResponse(null, ORIGINAL_ID);
      expect(r.valid).toBe(false);
      expect(r.warnings).toEqual(['Response is not an object']);
    });

    it('rejects undefined', () => {
      const r = validateSlideResponse(undefined, ORIGINAL_ID);
      expect(r.valid).toBe(false);
      expect(r.warnings).toEqual(['Response is not an object']);
    });

    it('rejects a string', () => {
      const r = validateSlideResponse('not-an-object', ORIGINAL_ID);
      expect(r.valid).toBe(false);
      expect(r.warnings).toEqual(['Response is not an object']);
    });

    it('rejects a number', () => {
      const r = validateSlideResponse(42, ORIGINAL_ID);
      expect(r.valid).toBe(false);
      expect(r.warnings).toEqual(['Response is not an object']);
    });

    it('rejects a boolean', () => {
      const r = validateSlideResponse(true, ORIGINAL_ID);
      expect(r.valid).toBe(false);
      expect(r.warnings).toEqual(['Response is not an object']);
    });

    it('returns an empty-shaped slide when invalid', () => {
      const r = validateSlideResponse(null, ORIGINAL_ID);
      // Empty stand-in slide so downstream code can still narrow safely.
      expect(r.slide).toEqual({});
    });
  });

  describe('id pinning', () => {
    it('overwrites a missing id with the original slide id', () => {
      const r = validateSlideResponse(
        { label: 'A', blocks: [] },
        ORIGINAL_ID,
      );
      expect((r.slide as { id: string }).id).toBe(ORIGINAL_ID);
    });

    it('overwrites a different incoming id with the original slide id', () => {
      const r = validateSlideResponse(
        { id: 'wrong-id', label: 'A', blocks: [] },
        ORIGINAL_ID,
      );
      expect((r.slide as { id: string }).id).toBe(ORIGINAL_ID);
    });
  });

  describe('label normalization', () => {
    it('defaults missing label with a warning', () => {
      const r = validateSlideResponse({ blocks: [] }, ORIGINAL_ID);
      expect((r.slide as { label: string }).label).toBe('Untitled Slide');
      expect(r.warnings).toContain(
        'Missing slide label, defaulted to "Untitled Slide"',
      );
    });

    it('defaults empty-string label with a warning', () => {
      const r = validateSlideResponse(
        { label: '', blocks: [] },
        ORIGINAL_ID,
      );
      expect((r.slide as { label: string }).label).toBe('Untitled Slide');
      expect(r.warnings).toContain(
        'Missing slide label, defaulted to "Untitled Slide"',
      );
    });

    it('defaults non-string label with a warning', () => {
      const r = validateSlideResponse(
        { label: 123, blocks: [] },
        ORIGINAL_ID,
      );
      expect((r.slide as { label: string }).label).toBe('Untitled Slide');
      expect(r.warnings).toContain(
        'Missing slide label, defaulted to "Untitled Slide"',
      );
    });

    it('preserves a non-empty string label without warning', () => {
      const r = validateSlideResponse(
        { label: 'My Slide', blocks: [] },
        ORIGINAL_ID,
      );
      expect((r.slide as { label: string }).label).toBe('My Slide');
      expect(
        r.warnings.find((w) => w.includes('Missing slide label')),
      ).toBeUndefined();
    });
  });

  describe('notes normalization', () => {
    it('leaves undefined notes alone', () => {
      const r = validateSlideResponse(
        { label: 'A', blocks: [] },
        ORIGINAL_ID,
      );
      expect((r.slide as { notes?: string }).notes).toBeUndefined();
    });

    it('preserves a string notes value', () => {
      const r = validateSlideResponse(
        { label: 'A', notes: 'speaker notes', blocks: [] },
        ORIGINAL_ID,
      );
      expect((r.slide as { notes: string }).notes).toBe('speaker notes');
    });

    it('coerces non-string notes to a string', () => {
      const r = validateSlideResponse(
        { label: 'A', notes: 42, blocks: [] },
        ORIGINAL_ID,
      );
      expect((r.slide as { notes: string }).notes).toBe('42');
    });

    it('coerces object notes via String()', () => {
      const r = validateSlideResponse(
        { label: 'A', notes: { foo: 1 }, blocks: [] },
        ORIGINAL_ID,
      );
      expect((r.slide as { notes: string }).notes).toBe('[object Object]');
    });
  });

  describe('blocks array repair', () => {
    it('defaults a missing blocks key to an empty array with warning', () => {
      const r = validateSlideResponse({ label: 'A' }, ORIGINAL_ID);
      expect((r.slide as { blocks: unknown[] }).blocks).toEqual([]);
      expect(r.warnings).toContain(
        'Missing blocks array, defaulted to empty',
      );
    });

    it('defaults a non-array blocks value to an empty array with warning', () => {
      const r = validateSlideResponse(
        { label: 'A', blocks: 'not an array' },
        ORIGINAL_ID,
      );
      expect((r.slide as { blocks: unknown[] }).blocks).toEqual([]);
      expect(r.warnings).toContain(
        'Missing blocks array, defaulted to empty',
      );
    });

    it('keeps an empty blocks array as-is without warning', () => {
      const r = validateSlideResponse(
        { label: 'A', blocks: [] },
        ORIGINAL_ID,
      );
      expect((r.slide as { blocks: unknown[] }).blocks).toEqual([]);
      expect(
        r.warnings.find((w) => w.includes('Missing blocks array')),
      ).toBeUndefined();
    });
  });

  describe('per-block normalization', () => {
    it('removes a null block with warning', () => {
      const r = validateSlideResponse(
        {
          label: 'A',
          blocks: [
            null,
            { id: 'b1', type: 'heading', content: 'X' },
          ],
        },
        ORIGINAL_ID,
      );
      const blocks = (r.slide as { blocks: { id: string }[] }).blocks;
      expect(blocks).toHaveLength(1);
      expect(blocks[0].id).toBe('b1');
      expect(r.warnings).toContain('Block at index 0 is not an object, removed');
    });

    it('removes a non-object block with warning', () => {
      const r = validateSlideResponse(
        {
          label: 'A',
          blocks: ['raw-string', { id: 'b1', type: 'heading' }],
        },
        ORIGINAL_ID,
      );
      const blocks = (r.slide as { blocks: { id: string }[] }).blocks;
      expect(blocks).toHaveLength(1);
      expect(blocks[0].id).toBe('b1');
      expect(r.warnings).toContain('Block at index 0 is not an object, removed');
    });

    it('removes consecutive invalid blocks and continues iteration', () => {
      const r = validateSlideResponse(
        {
          label: 'A',
          blocks: [null, null, { id: 'b1', type: 'heading' }],
        },
        ORIGINAL_ID,
      );
      const blocks = (r.slide as { blocks: { id: string }[] }).blocks;
      expect(blocks).toHaveLength(1);
      expect(blocks[0].id).toBe('b1');
      expect(
        r.warnings.filter((w) => w.includes('is not an object, removed'))
          .length,
      ).toBe(2);
    });

    it('preserves an existing string block id', () => {
      const r = validateSlideResponse(
        { label: 'A', blocks: [{ id: 'keep-me', type: 'heading' }] },
        ORIGINAL_ID,
      );
      const blocks = (r.slide as { blocks: { id: string }[] }).blocks;
      expect(blocks[0].id).toBe('keep-me');
    });

    it('generates a new id when block.id is missing', () => {
      const r = validateSlideResponse(
        { label: 'A', blocks: [{ type: 'heading' }] },
        ORIGINAL_ID,
      );
      const blocks = (r.slide as { blocks: { id: string }[] }).blocks;
      expect(blocks[0].id).toMatch(/^block-\d+-[a-z0-9]{1,4}$/);
    });

    it('generates a new id when block.id is empty string', () => {
      const r = validateSlideResponse(
        { label: 'A', blocks: [{ id: '', type: 'heading' }] },
        ORIGINAL_ID,
      );
      const blocks = (r.slide as { blocks: { id: string }[] }).blocks;
      expect(blocks[0].id).toMatch(/^block-\d+-[a-z0-9]{1,4}$/);
    });

    it('generates a new id when block.id is non-string', () => {
      const r = validateSlideResponse(
        { label: 'A', blocks: [{ id: 123, type: 'heading' }] },
        ORIGINAL_ID,
      );
      const blocks = (r.slide as { blocks: { id: string }[] }).blocks;
      expect(blocks[0].id).toMatch(/^block-\d+-[a-z0-9]{1,4}$/);
    });

    it('reassigns order to 1-based index for every kept block', () => {
      const r = validateSlideResponse(
        {
          label: 'A',
          blocks: [
            { id: 'b1', type: 'heading', order: 99 },
            { id: 'b2', type: 'text', order: 7 },
            { id: 'b3', type: 'heading' },
          ],
        },
        ORIGINAL_ID,
      );
      const blocks = (r.slide as {
        blocks: { id: string; order: number }[];
      }).blocks;
      expect(blocks.map((b) => b.order)).toEqual([1, 2, 3]);
    });

    it('recomputes order correctly after removing invalid blocks', () => {
      const r = validateSlideResponse(
        {
          label: 'A',
          blocks: [
            { id: 'b1', type: 'heading' },
            null,
            { id: 'b2', type: 'text' },
          ],
        },
        ORIGINAL_ID,
      );
      const blocks = (r.slide as {
        blocks: { id: string; order: number }[];
      }).blocks;
      expect(blocks).toHaveLength(2);
      expect(blocks.map((b) => b.order)).toEqual([1, 2]);
    });

    it('drops a block with no type and warns using its (now ensured) id', () => {
      const r = validateSlideResponse(
        {
          label: 'A',
          blocks: [{ id: 'b-no-type' }, { id: 'b1', type: 'heading' }],
        },
        ORIGINAL_ID,
      );
      const blocks = (r.slide as { blocks: { id: string }[] }).blocks;
      expect(blocks).toHaveLength(1);
      expect(blocks[0].id).toBe('b1');
      expect(r.warnings).toContain('Block b-no-type has no type, removed');
    });

    it('drops a block whose type is non-string', () => {
      const r = validateSlideResponse(
        {
          label: 'A',
          blocks: [{ id: 'b-bad', type: 42 }, { id: 'b1', type: 'heading' }],
        },
        ORIGINAL_ID,
      );
      const blocks = (r.slide as { blocks: { id: string }[] }).blocks;
      expect(blocks).toHaveLength(1);
      expect(blocks[0].id).toBe('b1');
      expect(r.warnings).toContain('Block b-bad has no type, removed');
    });
  });

  describe('unknown type warnings', () => {
    it('warns on unknown block type but keeps the block', () => {
      const r = validateSlideResponse(
        {
          label: 'A',
          blocks: [{ id: 'custom1', type: 'totally-made-up-block' }],
        },
        ORIGINAL_ID,
      );
      const blocks = (r.slide as { blocks: { id: string; type: string }[] })
        .blocks;
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('totally-made-up-block');
      expect(r.warnings).toContain(
        'Block "custom1" uses unknown type "totally-made-up-block" — kept as-is',
      );
    });

    it('does not warn for a known block type (heading)', () => {
      const r = validateSlideResponse(
        { label: 'A', blocks: [{ id: 'h1', type: 'heading', content: 'X' }] },
        ORIGINAL_ID,
      );
      expect(
        r.warnings.find((w) => w.includes('unknown type')),
      ).toBeUndefined();
    });
  });

  describe('style color validation', () => {
    it.each([
      ['hex 3', '#abc'],
      ['hex 4', '#abcd'],
      ['hex 6', '#aabbcc'],
      ['hex 8', '#aabbccdd'],
      ['rgb', 'rgb(1, 2, 3)'],
      ['rgba', 'rgba(1, 2, 3, 0.5)'],
      ['linear-gradient', 'linear-gradient(to right, red, blue)'],
      ['radial-gradient', 'radial-gradient(circle, red, blue)'],
    ])('accepts %s color value', (_label, color) => {
      const r = validateSlideResponse(
        {
          label: 'A',
          blocks: [
            {
              id: 'b1',
              type: 'heading',
              style: { backgroundColor: color },
            },
          ],
        },
        ORIGINAL_ID,
      );
      expect(
        r.warnings.find((w) => w.includes('is not a valid color')),
      ).toBeUndefined();
    });

    it('warns for an invalid backgroundColor', () => {
      const r = validateSlideResponse(
        {
          label: 'A',
          blocks: [
            {
              id: 'b1',
              type: 'heading',
              style: { backgroundColor: 'banana' },
            },
          ],
        },
        ORIGINAL_ID,
      );
      expect(r.warnings).toContain(
        'Block "b1" style.backgroundColor="banana" is not a valid color',
      );
    });

    it('warns for invalid color and borderColor on the same block', () => {
      const r = validateSlideResponse(
        {
          label: 'A',
          blocks: [
            {
              id: 'b1',
              type: 'heading',
              style: { color: 'notacolor', borderColor: 'alsonope' },
            },
          ],
        },
        ORIGINAL_ID,
      );
      expect(r.warnings).toContain(
        'Block "b1" style.color="notacolor" is not a valid color',
      );
      expect(r.warnings).toContain(
        'Block "b1" style.borderColor="alsonope" is not a valid color',
      );
    });

    it('ignores empty-string color values (no warning)', () => {
      const r = validateSlideResponse(
        {
          label: 'A',
          blocks: [
            {
              id: 'b1',
              type: 'heading',
              style: { backgroundColor: '', color: '' },
            },
          ],
        },
        ORIGINAL_ID,
      );
      expect(
        r.warnings.find((w) => w.includes('is not a valid color')),
      ).toBeUndefined();
    });

    it('ignores non-string color values (no warning, no crash)', () => {
      const r = validateSlideResponse(
        {
          label: 'A',
          blocks: [
            {
              id: 'b1',
              type: 'heading',
              style: { backgroundColor: 123, color: null },
            },
          ],
        },
        ORIGINAL_ID,
      );
      expect(
        r.warnings.find((w) => w.includes('is not a valid color')),
      ).toBeUndefined();
    });

    it('ignores blocks with no style object', () => {
      const r = validateSlideResponse(
        { label: 'A', blocks: [{ id: 'b1', type: 'heading' }] },
        ORIGINAL_ID,
      );
      expect(
        r.warnings.find((w) => w.includes('is not a valid color')),
      ).toBeUndefined();
    });

    it('ignores blocks with non-object style', () => {
      const r = validateSlideResponse(
        {
          label: 'A',
          blocks: [{ id: 'b1', type: 'heading', style: 'oops' }],
        },
        ORIGINAL_ID,
      );
      expect(
        r.warnings.find((w) => w.includes('is not a valid color')),
      ).toBeUndefined();
    });

    it('ignores style.style with null value', () => {
      const r = validateSlideResponse(
        {
          label: 'A',
          blocks: [{ id: 'b1', type: 'heading', style: null }],
        },
        ORIGINAL_ID,
      );
      expect(
        r.warnings.find((w) => w.includes('is not a valid color')),
      ).toBeUndefined();
    });
  });

  describe('elementStyles normalization', () => {
    it('keeps valid object element styles', () => {
      const r = validateSlideResponse(
        {
          label: 'A',
          blocks: [
            {
              id: 'b1',
              type: 'heading',
              elementStyles: {
                title: { color: '#fff' },
                subtitle: { fontSize: '12px' },
              },
            },
          ],
        },
        ORIGINAL_ID,
      );
      const blocks = (
        r.slide as {
          blocks: { elementStyles: Record<string, unknown> }[];
        }
      ).blocks;
      expect(blocks[0].elementStyles).toEqual({
        title: { color: '#fff' },
        subtitle: { fontSize: '12px' },
      });
      expect(
        r.warnings.find((w) => w.includes('elementStyles')),
      ).toBeUndefined();
    });

    it('removes non-object element-style entries and warns', () => {
      const r = validateSlideResponse(
        {
          label: 'A',
          blocks: [
            {
              id: 'b1',
              type: 'heading',
              elementStyles: {
                ok: { color: '#fff' },
                bad: 'not-an-object',
                alsoBad: null,
              },
            },
          ],
        },
        ORIGINAL_ID,
      );
      const blocks = (
        r.slide as {
          blocks: { elementStyles: Record<string, unknown> }[];
        }
      ).blocks;
      expect(blocks[0].elementStyles).toEqual({ ok: { color: '#fff' } });
      expect(r.warnings).toContain(
        'Block "b1" elementStyles.bad is not an object, removed',
      );
      expect(r.warnings).toContain(
        'Block "b1" elementStyles.alsoBad is not an object, removed',
      );
    });

    it('ignores non-object elementStyles', () => {
      const r = validateSlideResponse(
        {
          label: 'A',
          blocks: [
            { id: 'b1', type: 'heading', elementStyles: 'oops' },
          ],
        },
        ORIGINAL_ID,
      );
      expect(
        r.warnings.find((w) => w.includes('elementStyles')),
      ).toBeUndefined();
    });

    it('ignores null elementStyles', () => {
      const r = validateSlideResponse(
        {
          label: 'A',
          blocks: [{ id: 'b1', type: 'heading', elementStyles: null }],
        },
        ORIGINAL_ID,
      );
      expect(
        r.warnings.find((w) => w.includes('elementStyles')),
      ).toBeUndefined();
    });

    it('ignores missing elementStyles', () => {
      const r = validateSlideResponse(
        { label: 'A', blocks: [{ id: 'b1', type: 'heading' }] },
        ORIGINAL_ID,
      );
      expect(
        r.warnings.find((w) => w.includes('elementStyles')),
      ).toBeUndefined();
    });
  });

  describe('integration', () => {
    it('returns valid=true and a warnings array (possibly empty) for a clean slide', () => {
      const r = validateSlideResponse(
        {
          label: 'Hello',
          blocks: [
            {
              id: 'h1',
              type: 'heading',
              content: 'Title',
              style: { backgroundColor: '#fff' },
              elementStyles: { title: { color: '#000' } },
            },
            {
              id: 't1',
              type: 'text',
              content: 'Body',
            },
          ],
        },
        ORIGINAL_ID,
      );
      expect(r.valid).toBe(true);
      expect(Array.isArray(r.warnings)).toBe(true);
      expect(r.warnings).toEqual([]);
      const slide = r.slide as {
        id: string;
        label: string;
        blocks: { id: string; order: number }[];
      };
      expect(slide.id).toBe(ORIGINAL_ID);
      expect(slide.label).toBe('Hello');
      expect(slide.blocks).toHaveLength(2);
      expect(slide.blocks.map((b) => b.order)).toEqual([1, 2]);
    });

    it('accumulates multiple warnings across categories', () => {
      const r = validateSlideResponse(
        {
          blocks: [
            null,
            {
              type: 'super-unknown',
              style: { backgroundColor: 'banana' },
              elementStyles: { bad: 'oops' },
            },
            { id: 'no-type-block' },
          ],
        },
        ORIGINAL_ID,
      );
      expect(r.valid).toBe(true);
      // label default
      expect(r.warnings).toContain(
        'Missing slide label, defaulted to "Untitled Slide"',
      );
      // null block removed
      expect(r.warnings).toContain(
        'Block at index 0 is not an object, removed',
      );
      // unknown type kept
      expect(
        r.warnings.find((w) => w.includes('unknown type "super-unknown"')),
      ).toBeDefined();
      // invalid color
      expect(
        r.warnings.find((w) => w.includes('is not a valid color')),
      ).toBeDefined();
      // bad elementStyles entry
      expect(
        r.warnings.find((w) => w.includes('elementStyles.bad')),
      ).toBeDefined();
      // no-type block removed
      expect(r.warnings).toContain(
        'Block no-type-block has no type, removed',
      );
    });

    it('returns the same object reference as slide (mutates in place)', () => {
      const input: Record<string, unknown> = {
        label: 'X',
        blocks: [],
      };
      const r = validateSlideResponse(input, ORIGINAL_ID);
      expect(r.slide).toBe(input as unknown);
    });
  });
});
