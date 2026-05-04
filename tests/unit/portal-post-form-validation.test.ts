import { describe, it, expect } from 'vitest';
import {
  generateSlug,
  generateCustomFieldSlug,
  sanitizeSlugInput,
  parseContentToBlocks,
  serializeBlocksForSave,
  fingerprintLoops,
} from '@/components/portal/post-form/_lib/validation';
import type { Block } from '@/types/blocks';

describe('post-form validation — generateSlug', () => {
  it('lowercases and dasherizes a multi-word title', () => {
    expect(generateSlug('About Us')).toBe('about-us');
  });

  it('strips leading/trailing dashes and collapses runs', () => {
    expect(generateSlug('  Hello---World  ')).toBe('hello-world');
  });

  it('drops every non-alphanumeric character', () => {
    expect(generateSlug('What is 2+2?')).toBe('what-is-2-2');
  });

  it('returns empty string for an all-symbol title', () => {
    expect(generateSlug('!!!')).toBe('');
  });
});

describe('post-form validation — generateCustomFieldSlug', () => {
  it('uses underscores instead of dashes', () => {
    expect(generateCustomFieldSlug('Author Name')).toBe('author_name');
  });

  it('strips leading/trailing underscores', () => {
    expect(generateCustomFieldSlug('  Author Name  ')).toBe('author_name');
  });
});

describe('post-form validation — sanitizeSlugInput', () => {
  it('lowercases and replaces unsafe characters with dashes', () => {
    expect(sanitizeSlugInput('Hello World!')).toBe('hello-world-');
  });

  it('collapses runs of dashes', () => {
    expect(sanitizeSlugInput('a   b')).toBe('a-b');
  });
});

describe('post-form validation — parseContentToBlocks', () => {
  it('returns [] for empty/missing content', () => {
    expect(parseContentToBlocks('')).toEqual([]);
  });

  it('returns [] for non-JSON content', () => {
    expect(parseContentToBlocks('not json')).toEqual([]);
  });

  it('returns the blocks array from a valid JSON envelope', () => {
    const json = JSON.stringify({ blocks: [{ id: 'a', type: 'text' }], version: '1.0' });
    expect(parseContentToBlocks(json)).toEqual([{ id: 'a', type: 'text' }]);
  });

  it('returns [] when JSON is parseable but missing blocks', () => {
    expect(parseContentToBlocks('{}')).toEqual([]);
  });
});

describe('post-form validation — serializeBlocksForSave', () => {
  it('wraps blocks in the BlockEditorData envelope', () => {
    const out = serializeBlocksForSave([{ id: 'a', type: 'text' } as unknown as Block]);
    expect(JSON.parse(out)).toEqual({
      blocks: [{ id: 'a', type: 'text' }],
      version: '1.0',
    });
  });
});

describe('post-form validation — fingerprintLoops', () => {
  it('returns empty string for blocks with no html-render loops', () => {
    expect(fingerprintLoops([
      { id: 'a', type: 'text' } as unknown as Block,
    ])).toBe('');
  });

  it('captures top-level html-render loop config', () => {
    const blocks = [
      { id: 'a', type: 'html-render', loop: { postType: 'blog', limit: 3 } } as unknown as Block,
    ];
    expect(fingerprintLoops(blocks)).toBe('a:{"postType":"blog","limit":3}');
  });

  it('changes when loop config changes', () => {
    const a = [
      { id: 'x', type: 'html-render', loop: { limit: 3 } } as unknown as Block,
    ];
    const b = [
      { id: 'x', type: 'html-render', loop: { limit: 6 } } as unknown as Block,
    ];
    expect(fingerprintLoops(a)).not.toBe(fingerprintLoops(b));
  });

  it('descends into columns / tabs / sections', () => {
    const blocks = [
      {
        id: 's', type: 'section',
        blocks: [
          { id: 'h', type: 'html-render', loop: { postType: 'page' } },
        ],
      } as unknown as Block,
    ];
    expect(fingerprintLoops(blocks)).toBe('h:{"postType":"page"}');
  });

  it('skips html-render blocks that have no loop', () => {
    const blocks = [
      { id: 'a', type: 'html-render' } as unknown as Block,
    ];
    expect(fingerprintLoops(blocks)).toBe('');
  });
});
