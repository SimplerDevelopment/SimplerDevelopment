// @vitest-environment node
/**
 * Unit tests for lib/ai/slide-edit-optimizer.ts.
 *
 * Covers:
 *  - classifyEdit(): style / content / structural / full classification across
 *    pure keywords, mixed keywords, tie-breaks, and unknown prompts.
 *  - minimizePayload(): style / content / structural / full branches and the
 *    block-stripping recursion (cards, columns, section nesting).
 *  - applyPatchResponse(): style patches, content patches, structural fallback,
 *    and malformed responses.
 *  - isPatchResponse(): true / false / null / non-object cases.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyEdit,
  minimizePayload,
  applyPatchResponse,
  isPatchResponse,
  type EditType,
} from '@/lib/ai/slide-edit-optimizer';

// The optimizer only structurally inspects the slide/block shapes — we don't
// need real schema types here. Cast minimal fixtures through `unknown` to
// satisfy the function signatures.
type AnySlide = Parameters<typeof minimizePayload>[0];
type AnyBlock = Record<string, unknown>;

function makeSlide(blocks: AnyBlock[], extra: Record<string, unknown> = {}): AnySlide {
  return {
    id: 'slide-1',
    label: 'Slide One',
    notes: 'Speaker notes',
    blocks,
    ...extra,
  } as unknown as AnySlide;
}

describe('classifyEdit', () => {
  it('classifies a pure style edit', () => {
    expect(classifyEdit('Make the font bigger')).toBe('style');
    expect(classifyEdit('Use blue color for the background')).toBe('style');
    expect(classifyEdit('Apply a gradient with rounded corners')).toBe('style');
  });

  it('classifies a pure content edit', () => {
    expect(classifyEdit('Rewrite the heading')).toBe('content');
    expect(classifyEdit('Update the title to Welcome')).toBe('content');
    expect(classifyEdit('Shorten this paragraph')).toBe('content');
  });

  it('classifies structural edits even when content keywords also match', () => {
    // "add a " is structural, "shorten" would normally be content
    expect(classifyEdit('add a new card and shorten the text')).toBe('structural');
    expect(classifyEdit('remove the second column')).toBe('structural');
    expect(classifyEdit('convert to a two column layout')).toBe('structural');
  });

  it('returns full when both style and content keywords match (no structural)', () => {
    // "bigger" (style) + "rewrite" (content)
    expect(classifyEdit('Make the title bigger and rewrite it')).toBe('full');
  });

  it('returns full when no keywords match at all', () => {
    expect(classifyEdit('Hello there friend')).toBe('full');
    expect(classifyEdit('')).toBe('full');
  });

  it('lowercases and trims input before classification', () => {
    expect(classifyEdit('   MAKE THE FONT BIGGER   ')).toBe('style');
    expect(classifyEdit('REWRITE THE HEADING')).toBe('content');
  });

  it('lets structural win on ties with style', () => {
    // Mix one structural and one style — structural wins per spec
    expect(classifyEdit('add a new card with bigger font')).toBe('structural');
  });
});

describe('minimizePayload — style branch', () => {
  it('strips content from blocks and emits style patch instructions', () => {
    const slide = makeSlide([
      {
        id: 'b1',
        type: 'heading',
        order: 0,
        content: 'Hello world',
        title: 'My Title',
        style: { color: 'red' },
        elementStyles: { heading: { fontSize: 24 } },
        level: 1,
        alignment: 'center',
      },
    ]);

    const result = minimizePayload(slide, 'style');

    expect(result.maxTokens).toBe(2048);
    expect(result.skipAdjacentSlides).toBe(true);
    expect(result.systemAddendum).toContain('STYLE PATCH');
    expect(result.userPrefix).toMatch(/content stripped/i);

    const block = (result.slide.blocks as AnyBlock[])[0];
    expect(block.id).toBe('b1');
    expect(block.type).toBe('heading');
    expect(block.style).toEqual({ color: 'red' });
    expect(block.elementStyles).toEqual({ heading: { fontSize: 24 } });
    expect(block.level).toBe(1);
    expect(block.alignment).toBe('center');
    // Content stripped
    expect(block.content).toBeUndefined();
    expect(block.title).toBeUndefined();
  });

  it('strips card-grid card descriptions but keeps id/icon', () => {
    const slide = makeSlide([
      {
        id: 'cg1',
        type: 'card-grid',
        order: 0,
        cards: [
          { id: 'c1', icon: 'star', title: 'A', description: 'desc-a' },
          { id: 'c2', icon: 'check', title: 'B', description: 'desc-b' },
        ],
        columns: 2,
      },
    ]);

    const result = minimizePayload(slide, 'style');
    const block = (result.slide.blocks as AnyBlock[])[0];
    const cards = block.cards as AnyBlock[];
    expect(cards).toHaveLength(2);
    expect(cards[0]).toEqual({ id: 'c1', icon: 'star' });
    expect(cards[1]).toEqual({ id: 'c2', icon: 'check' });
    // numeric columns preserved
    expect(block.columns).toBe(2);
  });

  it('recurses into columns blocks (style branch)', () => {
    const slide = makeSlide([
      {
        id: 'col1',
        type: 'columns',
        order: 0,
        columns: [
          {
            id: 'c1',
            width: 6,
            blocks: [
              { id: 'inner1', type: 'text', order: 0, content: 'inside', style: { padding: 8 } },
            ],
          },
        ],
      },
    ]);

    const result = minimizePayload(slide, 'style');
    const cols = (result.slide.blocks as AnyBlock[])[0].columns as AnyBlock[];
    expect(cols).toHaveLength(1);
    expect(cols[0].id).toBe('c1');
    expect(cols[0].width).toBe(6);
    const innerBlocks = cols[0].blocks as AnyBlock[];
    expect(innerBlocks[0].id).toBe('inner1');
    expect(innerBlocks[0].content).toBeUndefined();
    expect(innerBlocks[0].style).toEqual({ padding: 8 });
  });

  it('handles columns where col.blocks is not an array', () => {
    const slide = makeSlide([
      {
        id: 'col1',
        type: 'columns',
        order: 0,
        columns: [{ id: 'c1', width: 12, blocks: 'not-an-array' }],
      },
    ]);
    const result = minimizePayload(slide, 'style');
    const cols = (result.slide.blocks as AnyBlock[])[0].columns as AnyBlock[];
    expect(cols[0].blocks).toEqual([]);
  });

  it('recurses into section blocks and preserves padding/background fields', () => {
    const slide = makeSlide([
      {
        id: 'sec1',
        type: 'section',
        order: 0,
        backgroundColor: '#000',
        paddingTop: 10,
        paddingBottom: 20,
        paddingLeft: 5,
        paddingRight: 5,
        maxWidth: 1200,
        blocks: [
          { id: 'inner1', type: 'text', order: 0, content: 'inside', style: { color: 'red' } },
        ],
      },
    ]);

    const result = minimizePayload(slide, 'style');
    const sec = (result.slide.blocks as AnyBlock[])[0];
    expect(sec.backgroundColor).toBe('#000');
    expect(sec.paddingTop).toBe(10);
    expect(sec.paddingBottom).toBe(20);
    expect(sec.paddingLeft).toBe(5);
    expect(sec.paddingRight).toBe(5);
    expect(sec.maxWidth).toBe(1200);
    const inner = (sec.blocks as AnyBlock[])[0];
    expect(inner.content).toBeUndefined();
    expect(inner.style).toEqual({ color: 'red' });
  });

  it('preserves miscellaneous style-context fields (iconSize, size, variant, width, height)', () => {
    const slide = makeSlide([
      {
        id: 'b1',
        type: 'icon',
        order: 0,
        iconSize: 'lg',
        size: 'md',
        variant: 'primary',
        width: 100,
        height: 50,
      },
    ]);
    const block = (minimizePayload(slide, 'style').slide.blocks as AnyBlock[])[0];
    expect(block.iconSize).toBe('lg');
    expect(block.size).toBe('md');
    expect(block.variant).toBe('primary');
    expect(block.width).toBe(100);
    expect(block.height).toBe(50);
  });

  it('skips non-numeric columns field (e.g. for non-columns blocks)', () => {
    const slide = makeSlide([
      {
        id: 'b1',
        type: 'heading',
        order: 0,
        // not a number, so the numeric-columns branch should skip
        columns: 'two',
      },
    ]);
    const block = (minimizePayload(slide, 'style').slide.blocks as AnyBlock[])[0];
    expect(block.columns).toBeUndefined();
  });
});

describe('minimizePayload — content branch', () => {
  it('strips style/elementStyles from blocks and includes notes', () => {
    const slide = makeSlide([
      {
        id: 'b1',
        type: 'heading',
        order: 0,
        content: 'Hello',
        style: { color: 'red' },
        elementStyles: { heading: { fontSize: 24 } },
      },
    ]);

    const result = minimizePayload(slide, 'content');

    expect(result.maxTokens).toBe(4096);
    expect(result.skipAdjacentSlides).toBe(false);
    expect(result.systemAddendum).toContain('CONTENT PATCH');
    expect(result.userPrefix).toMatch(/styles stripped/i);
    expect(result.slide.notes).toBe('Speaker notes');

    const block = (result.slide.blocks as AnyBlock[])[0];
    expect(block.content).toBe('Hello');
    expect(block.style).toBeUndefined();
    expect(block.elementStyles).toBeUndefined();
  });

  it('recurses into nested section blocks (content branch)', () => {
    const slide = makeSlide([
      {
        id: 'sec1',
        type: 'section',
        order: 0,
        blocks: [
          { id: 'inner1', type: 'text', order: 0, content: 'inside', style: { color: 'red' } },
        ],
      },
    ]);
    const sec = (minimizePayload(slide, 'content').slide.blocks as AnyBlock[])[0];
    const inner = (sec.blocks as AnyBlock[])[0];
    expect(inner.content).toBe('inside');
    expect(inner.style).toBeUndefined();
  });

  it('recurses into nested columns blocks (content branch) and preserves non-array col.blocks', () => {
    const slide = makeSlide([
      {
        id: 'col1',
        type: 'columns',
        order: 0,
        columns: [
          {
            id: 'c1',
            width: 6,
            blocks: [
              { id: 'inner1', type: 'text', order: 0, content: 'inside', style: { color: 'red' } },
            ],
          },
          { id: 'c2', width: 6, blocks: 'not-an-array' },
        ],
      },
    ]);
    const result = minimizePayload(slide, 'content');
    const cols = (result.slide.blocks as AnyBlock[])[0].columns as AnyBlock[];
    const inner = (cols[0].blocks as AnyBlock[])[0];
    expect(inner.content).toBe('inside');
    expect(inner.style).toBeUndefined();
    // For the second column the non-array passthrough is preserved
    expect(cols[1].blocks).toBe('not-an-array');
  });
});

describe('minimizePayload — structural/full branch', () => {
  it('returns the slide as-is for structural edits', () => {
    const slide = makeSlide([{ id: 'b1', type: 'text', order: 0, content: 'x' }]);
    const result = minimizePayload(slide, 'structural');
    expect(result.systemAddendum).toBe('');
    expect(result.userPrefix).toBe('Current slide:');
    expect(result.skipAdjacentSlides).toBe(false);
    expect(result.slide).toBe(slide as unknown as Record<string, unknown>);
  });

  it('clamps maxTokens between 4096 and 16384 based on full size', () => {
    const small = makeSlide([{ id: 'b1', type: 'text', order: 0, content: 'x' }]);
    const smallResult = minimizePayload(small, 'full');
    expect(smallResult.maxTokens).toBe(4096);

    // Build a giant slide so ceil(size/2)+2048 exceeds 16384 → clamped to 16384.
    const bigBlock = {
      id: 'b1',
      type: 'text',
      order: 0,
      content: 'x'.repeat(100_000),
    };
    const big = makeSlide([bigBlock]);
    const bigResult = minimizePayload(big, 'full');
    expect(bigResult.maxTokens).toBe(16384);
  });

  it('falls through to default for unknown edit types', () => {
    const slide = makeSlide([{ id: 'b1', type: 'text', order: 0 }]);
    const result = minimizePayload(slide, 'bogus' as EditType);
    expect(result.userPrefix).toBe('Current slide:');
    expect(result.systemAddendum).toBe('');
  });
});

describe('applyPatchResponse — style', () => {
  it('merges style and elementStyles into the matching block', () => {
    const slide = makeSlide([
      {
        id: 'b1',
        type: 'heading',
        order: 0,
        style: { color: 'red', padding: 4 },
        elementStyles: { heading: { fontSize: 16, fontWeight: 700 } },
      },
      { id: 'b2', type: 'text', order: 1, style: { color: 'blue' } },
    ]) as unknown as Parameters<typeof applyPatchResponse>[0];

    const out = applyPatchResponse(
      slide,
      {
        patches: [
          {
            id: 'b1',
            style: { color: 'green' },
            elementStyles: { heading: { fontSize: 32 }, sub: { color: 'gray' } },
          },
        ],
      },
      'style',
    );

    const blocks = (out as unknown as { blocks: AnyBlock[] }).blocks;
    expect(blocks[0].style).toEqual({ color: 'green', padding: 4 });
    expect(blocks[0].elementStyles).toEqual({
      heading: { fontSize: 32, fontWeight: 700 },
      sub: { color: 'gray' },
    });
    // Untouched block stays the same shape
    expect(blocks[1].style).toEqual({ color: 'blue' });
  });

  it('initialises style/elementStyles when missing on the original block', () => {
    const slide = makeSlide([{ id: 'b1', type: 'heading', order: 0 }]) as unknown as Parameters<
      typeof applyPatchResponse
    >[0];

    const out = applyPatchResponse(
      slide,
      {
        patches: [
          { id: 'b1', style: { color: 'red' }, elementStyles: { heading: { fontSize: 14 } } },
        ],
      },
      'style',
    );
    const block = (out as unknown as { blocks: AnyBlock[] }).blocks[0];
    expect(block.style).toEqual({ color: 'red' });
    expect(block.elementStyles).toEqual({ heading: { fontSize: 14 } });
  });

  it('recurses style patches into section and columns descendants', () => {
    const slide = makeSlide([
      {
        id: 'sec1',
        type: 'section',
        order: 0,
        blocks: [
          {
            id: 'col1',
            type: 'columns',
            order: 0,
            columns: [
              {
                id: 'c1',
                width: 12,
                blocks: [{ id: 'deep', type: 'text', order: 0, style: { color: 'red' } }],
              },
              { id: 'c2', width: 0, blocks: 'not-an-array' },
            ],
          },
        ],
      },
    ]) as unknown as Parameters<typeof applyPatchResponse>[0];

    const out = applyPatchResponse(
      slide,
      { patches: [{ id: 'deep', style: { color: 'green', padding: 8 } }] },
      'style',
    );

    const sec = (out as unknown as { blocks: AnyBlock[] }).blocks[0];
    const cols = (sec.blocks as AnyBlock[])[0].columns as AnyBlock[];
    const deep = (cols[0].blocks as AnyBlock[])[0];
    expect(deep.style).toEqual({ color: 'green', padding: 8 });
    // Non-array col.blocks preserved
    expect(cols[1].blocks).toBe('not-an-array');
  });

  it('returns null when style edit response has no patches array', () => {
    const slide = makeSlide([{ id: 'b1', type: 'text', order: 0 }]) as unknown as Parameters<
      typeof applyPatchResponse
    >[0];
    const out = applyPatchResponse(slide, { foo: 'bar' }, 'style');
    expect(out).toBeNull();
  });
});

describe('applyPatchResponse — content', () => {
  it('merges content fields, label and notes', () => {
    const slide = makeSlide([
      {
        id: 'b1',
        type: 'heading',
        order: 0,
        content: 'Hello',
        title: 'Old',
        style: { color: 'red' },
      },
    ]) as unknown as Parameters<typeof applyPatchResponse>[0];

    const out = applyPatchResponse(
      slide,
      {
        patches: [
          {
            id: 'b1',
            content: 'New hello',
            title: 'New',
            // These should NOT overwrite the original — applyContentPatches
            // explicitly skips style/elementStyles keys.
            style: { color: 'purple' },
            elementStyles: { x: { y: 1 } },
          },
        ],
        label: 'Updated label',
        notes: 'Updated notes',
      },
      'content',
    );

    const result = out as unknown as { blocks: AnyBlock[]; label: string; notes: string };
    expect(result.blocks[0].content).toBe('New hello');
    expect(result.blocks[0].title).toBe('New');
    // style untouched
    expect(result.blocks[0].style).toEqual({ color: 'red' });
    expect(result.label).toBe('Updated label');
    expect(result.notes).toBe('Updated notes');
  });

  it('falls back to original label when patch label is missing, but accepts empty notes', () => {
    const slide = makeSlide(
      [{ id: 'b1', type: 'heading', order: 0, content: 'Hello' }],
    ) as unknown as Parameters<typeof applyPatchResponse>[0];

    const out = applyPatchResponse(
      slide,
      { patches: [{ id: 'b1', content: 'New' }], notes: '' },
      'content',
    );
    const result = out as unknown as { label: string; notes: string };
    // newLabel undefined → original
    expect(result.label).toBe('Slide One');
    // notes '' is defined so it overwrites
    expect(result.notes).toBe('');
  });

  it('keeps original notes when patch notes is undefined', () => {
    const slide = makeSlide(
      [{ id: 'b1', type: 'heading', order: 0, content: 'Hello' }],
    ) as unknown as Parameters<typeof applyPatchResponse>[0];

    const out = applyPatchResponse(
      slide,
      { patches: [{ id: 'b1', content: 'New' }] },
      'content',
    );
    const result = out as unknown as { notes: string };
    expect(result.notes).toBe('Speaker notes');
  });

  it('recurses content patches into nested section and columns blocks', () => {
    const slide = makeSlide([
      {
        id: 'sec1',
        type: 'section',
        order: 0,
        blocks: [
          {
            id: 'col1',
            type: 'columns',
            order: 0,
            columns: [
              {
                id: 'c1',
                width: 12,
                blocks: [{ id: 'deep', type: 'text', order: 0, content: 'old' }],
              },
              { id: 'c2', width: 0, blocks: 'not-an-array' },
            ],
          },
        ],
      },
    ]) as unknown as Parameters<typeof applyPatchResponse>[0];

    const out = applyPatchResponse(
      slide,
      { patches: [{ id: 'deep', content: 'new' }] },
      'content',
    );

    const sec = (out as unknown as { blocks: AnyBlock[] }).blocks[0];
    const cols = (sec.blocks as AnyBlock[])[0].columns as AnyBlock[];
    const deep = (cols[0].blocks as AnyBlock[])[0];
    expect(deep.content).toBe('new');
    expect(cols[1].blocks).toBe('not-an-array');
  });

  it('returns null when content response has no patches array', () => {
    const slide = makeSlide([{ id: 'b1', type: 'text', order: 0 }]) as unknown as Parameters<
      typeof applyPatchResponse
    >[0];
    expect(applyPatchResponse(slide, {}, 'content')).toBeNull();
    expect(applyPatchResponse(slide, { patches: 'oops' }, 'content')).toBeNull();
  });
});

describe('applyPatchResponse — structural / full', () => {
  it('returns null for structural edits regardless of input shape', () => {
    const slide = makeSlide([{ id: 'b1', type: 'text', order: 0 }]) as unknown as Parameters<
      typeof applyPatchResponse
    >[0];
    expect(applyPatchResponse(slide, { patches: [{ id: 'b1' }] }, 'structural')).toBeNull();
    expect(applyPatchResponse(slide, { patches: [{ id: 'b1' }] }, 'full')).toBeNull();
  });
});

describe('isPatchResponse', () => {
  it('returns true for objects with a patches array', () => {
    expect(isPatchResponse({ patches: [] })).toBe(true);
    expect(isPatchResponse({ patches: [{ id: 'x' }] })).toBe(true);
  });

  it('returns false when patches is missing or not an array', () => {
    expect(isPatchResponse({})).toBe(false);
    expect(isPatchResponse({ patches: 'nope' })).toBe(false);
    expect(isPatchResponse({ patches: null })).toBe(false);
    expect(isPatchResponse({ other: [] })).toBe(false);
  });

  it('returns false for null, primitives, and non-objects', () => {
    expect(isPatchResponse(null)).toBe(false);
    expect(isPatchResponse(undefined)).toBe(false);
    expect(isPatchResponse('patches')).toBe(false);
    expect(isPatchResponse(123)).toBe(false);
    expect(isPatchResponse(true)).toBe(false);
  });
});
