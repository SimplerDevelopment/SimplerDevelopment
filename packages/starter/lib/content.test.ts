import { describe, it, expect } from 'vitest';
import { parseBlocks, isLegacyHtml } from './content';

describe('parseBlocks', () => {
  it('reads the documented { blocks, version } envelope', () => {
    const content = JSON.stringify({
      version: '1.0',
      blocks: [{ id: 'a', type: 'heading', order: 0, content: 'Hi' }],
    });
    expect(parseBlocks(content)).toEqual([{ id: 'a', type: 'heading', order: 0, content: 'Hi' }]);
  });

  it('accepts a bare array, which older content is sometimes stored as', () => {
    expect(parseBlocks(JSON.stringify([{ type: 'text', content: 'x' }]))).toHaveLength(1);
  });

  it('sorts by `order` — the array is not guaranteed to arrive sorted', () => {
    const content = JSON.stringify({
      blocks: [
        { type: 'b', order: 2 },
        { type: 'a', order: 1 },
      ],
    });
    expect(parseBlocks(content).map(b => b.type)).toEqual(['a', 'b']);
  });

  it('keeps array position when blocks have no order at all', () => {
    const content = JSON.stringify({ blocks: [{ type: 'first' }, { type: 'second' }] });
    expect(parseBlocks(content).map(b => b.type)).toEqual(['first', 'second']);
  });

  it('drops entries that are not blocks rather than rendering junk', () => {
    const content = JSON.stringify({ blocks: [{ type: 'text' }, null, 'nope', { noType: true }] });
    expect(parseBlocks(content)).toEqual([{ type: 'text' }]);
  });

  // The whole point of the module: a bad document costs a section, not the page.
  it.each([
    ['empty string', ''],
    ['whitespace', '   '],
    ['null', null],
    ['undefined', undefined],
    ['invalid JSON', '{ not json'],
    ['legacy HTML', '<p>hello</p>'],
    ['JSON without blocks', '{"version":"1.0"}'],
    ['blocks not an array', '{"blocks":"nope"}'],
  ])('returns [] for %s instead of throwing', (_label, input) => {
    expect(parseBlocks(input as string | null | undefined)).toEqual([]);
  });
});

describe('isLegacyHtml', () => {
  it('is true for markup and false for a block document', () => {
    expect(isLegacyHtml('<p>hello</p>')).toBe(true);
    expect(isLegacyHtml('{"blocks":[]}')).toBe(false);
    expect(isLegacyHtml('')).toBe(false);
  });
});
