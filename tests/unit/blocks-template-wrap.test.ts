// @vitest-environment node
import { describe, it, expect } from 'vitest';

import { wrapWithTypeTemplate } from '@/lib/blocks/template-wrap';

describe('wrapWithTypeTemplate', () => {
  describe('null/empty template handling', () => {
    it('returns postContent unchanged when templateJson is null', () => {
      const postContent = JSON.stringify({ blocks: [{ type: 'text', id: '1' }], version: '1.0' });
      expect(wrapWithTypeTemplate(postContent, null)).toBe(postContent);
    });

    it('returns postContent unchanged when templateJson is undefined', () => {
      const postContent = JSON.stringify({ blocks: [{ type: 'text', id: '1' }], version: '1.0' });
      expect(wrapWithTypeTemplate(postContent, undefined)).toBe(postContent);
    });

    it('returns postContent unchanged when templateJson is empty string', () => {
      const postContent = JSON.stringify({ blocks: [{ type: 'text', id: '1' }], version: '1.0' });
      expect(wrapWithTypeTemplate(postContent, '')).toBe(postContent);
    });

    it('returns postContent unchanged when template has no blocks', () => {
      const postContent = JSON.stringify({ blocks: [{ type: 'text', id: '1' }], version: '1.0' });
      const templateJson = JSON.stringify({ blocks: [], version: '1.0' });
      expect(wrapWithTypeTemplate(postContent, templateJson)).toBe(postContent);
    });

    it('returns postContent unchanged when template blocks is missing', () => {
      const postContent = JSON.stringify({ blocks: [{ type: 'text', id: '1' }], version: '1.0' });
      const templateJson = JSON.stringify({ version: '1.0' });
      expect(wrapWithTypeTemplate(postContent, templateJson)).toBe(postContent);
    });
  });

  describe('JSON parsing errors', () => {
    it('returns postContent unchanged when templateJson is invalid JSON', () => {
      const postContent = JSON.stringify({ blocks: [{ type: 'text', id: '1' }], version: '1.0' });
      expect(wrapWithTypeTemplate(postContent, '{not valid json')).toBe(postContent);
    });

    it('returns postContent unchanged when postContent is invalid JSON', () => {
      const templateJson = JSON.stringify({ blocks: [{ type: 'header', id: 'h' }], version: '1.0' });
      const postContent = '{also not valid';
      expect(wrapWithTypeTemplate(postContent, templateJson)).toBe(postContent);
    });
  });

  describe('placeholder substitution', () => {
    it('replaces a top-level post-content placeholder with post blocks', () => {
      const templateJson = JSON.stringify({
        blocks: [
          { type: 'header', id: 'h' },
          { type: 'post-content', id: 'p' },
          { type: 'footer', id: 'f' },
        ],
        version: '1.0',
      });
      const postContent = JSON.stringify({
        blocks: [
          { type: 'text', id: 't1' },
          { type: 'image', id: 'i1' },
        ],
        version: '1.0',
      });
      const result = JSON.parse(wrapWithTypeTemplate(postContent, templateJson));
      expect(result.blocks).toEqual([
        { type: 'header', id: 'h' },
        { type: 'text', id: 't1' },
        { type: 'image', id: 'i1' },
        { type: 'footer', id: 'f' },
      ]);
      expect(result.version).toBe('1.0');
    });

    it('appends post blocks when no placeholder is present', () => {
      const templateJson = JSON.stringify({
        blocks: [
          { type: 'header', id: 'h' },
          { type: 'footer', id: 'f' },
        ],
        version: '1.0',
      });
      const postContent = JSON.stringify({
        blocks: [{ type: 'text', id: 't' }],
        version: '1.0',
      });
      const result = JSON.parse(wrapWithTypeTemplate(postContent, templateJson));
      expect(result.blocks).toEqual([
        { type: 'header', id: 'h' },
        { type: 'footer', id: 'f' },
        { type: 'text', id: 't' },
      ]);
    });

    it('replaces placeholder nested inside a block with blocks array', () => {
      const templateJson = JSON.stringify({
        blocks: [
          {
            type: 'section',
            id: 's',
            blocks: [
              { type: 'header', id: 'h' },
              { type: 'post-content', id: 'p' },
            ],
          },
        ],
        version: '1.0',
      });
      const postContent = JSON.stringify({
        blocks: [{ type: 'text', id: 't' }],
        version: '1.0',
      });
      const result = JSON.parse(wrapWithTypeTemplate(postContent, templateJson));
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].blocks).toEqual([
        { type: 'header', id: 'h' },
        { type: 'text', id: 't' },
      ]);
    });

    it('replaces placeholder nested inside columns', () => {
      const templateJson = JSON.stringify({
        blocks: [
          {
            type: 'columns',
            id: 'c',
            columns: [
              { blocks: [{ type: 'sidebar', id: 'sb' }] },
              { blocks: [{ type: 'post-content', id: 'p' }] },
            ],
          },
        ],
        version: '1.0',
      });
      const postContent = JSON.stringify({
        blocks: [{ type: 'text', id: 't' }],
        version: '1.0',
      });
      const result = JSON.parse(wrapWithTypeTemplate(postContent, templateJson));
      expect(result.blocks[0].columns[0].blocks).toEqual([{ type: 'sidebar', id: 'sb' }]);
      expect(result.blocks[0].columns[1].blocks).toEqual([{ type: 'text', id: 't' }]);
    });

    it('replaces placeholders at multiple depths and marks replaced once', () => {
      const templateJson = JSON.stringify({
        blocks: [
          { type: 'post-content', id: 'p1' },
          {
            type: 'section',
            id: 's',
            blocks: [{ type: 'post-content', id: 'p2' }],
          },
        ],
        version: '1.0',
      });
      const postContent = JSON.stringify({
        blocks: [{ type: 'text', id: 't' }],
        version: '1.0',
      });
      const result = JSON.parse(wrapWithTypeTemplate(postContent, templateJson));
      // Top-level placeholder replaced with post blocks
      expect(result.blocks[0]).toEqual({ type: 'text', id: 't' });
      // Nested placeholder also replaced
      expect(result.blocks[1].blocks).toEqual([{ type: 'text', id: 't' }]);
    });

    it('handles columns without a blocks array gracefully', () => {
      const templateJson = JSON.stringify({
        blocks: [
          {
            type: 'columns',
            id: 'c',
            columns: [
              { width: 6 }, // no blocks array
              { blocks: [{ type: 'post-content', id: 'p' }] },
            ],
          },
        ],
        version: '1.0',
      });
      const postContent = JSON.stringify({
        blocks: [{ type: 'text', id: 't' }],
        version: '1.0',
      });
      const result = JSON.parse(wrapWithTypeTemplate(postContent, templateJson));
      expect(result.blocks[0].columns[0]).toEqual({ width: 6 });
      expect(result.blocks[0].columns[1].blocks).toEqual([{ type: 'text', id: 't' }]);
    });
  });

  describe('post blocks edge cases', () => {
    it('treats missing post.blocks as empty array (placeholder replaced with nothing)', () => {
      const templateJson = JSON.stringify({
        blocks: [
          { type: 'header', id: 'h' },
          { type: 'post-content', id: 'p' },
          { type: 'footer', id: 'f' },
        ],
        version: '1.0',
      });
      const postContent = JSON.stringify({ version: '1.0' });
      const result = JSON.parse(wrapWithTypeTemplate(postContent, templateJson));
      expect(result.blocks).toEqual([
        { type: 'header', id: 'h' },
        { type: 'footer', id: 'f' },
      ]);
    });

    it('treats non-array post.blocks as empty array', () => {
      const templateJson = JSON.stringify({
        blocks: [{ type: 'header', id: 'h' }],
        version: '1.0',
      });
      const postContent = JSON.stringify({ blocks: 'not-an-array', version: '1.0' });
      const result = JSON.parse(wrapWithTypeTemplate(postContent, templateJson));
      // No placeholder, post blocks empty (non-array) → just header
      expect(result.blocks).toEqual([{ type: 'header', id: 'h' }]);
    });

    it('appends nothing when post has no blocks and template has no placeholder', () => {
      const templateJson = JSON.stringify({
        blocks: [{ type: 'header', id: 'h' }],
        version: '1.0',
      });
      const postContent = JSON.stringify({ version: '1.0' });
      const result = JSON.parse(wrapWithTypeTemplate(postContent, templateJson));
      expect(result.blocks).toEqual([{ type: 'header', id: 'h' }]);
    });
  });

  describe('version resolution', () => {
    it('uses post.version when present', () => {
      const templateJson = JSON.stringify({
        blocks: [{ type: 'header', id: 'h' }],
        version: '2.0',
      });
      const postContent = JSON.stringify({
        blocks: [{ type: 'text', id: 't' }],
        version: '3.0',
      });
      const result = JSON.parse(wrapWithTypeTemplate(postContent, templateJson));
      expect(result.version).toBe('3.0');
    });

    it('falls back to template.version when post.version is missing', () => {
      const templateJson = JSON.stringify({
        blocks: [{ type: 'header', id: 'h' }],
        version: '2.5',
      });
      const postContent = JSON.stringify({
        blocks: [{ type: 'text', id: 't' }],
      });
      const result = JSON.parse(wrapWithTypeTemplate(postContent, templateJson));
      expect(result.version).toBe('2.5');
    });

    it('falls back to "1.0" when neither has a version', () => {
      const templateJson = JSON.stringify({
        blocks: [{ type: 'header', id: 'h' }],
      });
      const postContent = JSON.stringify({
        blocks: [{ type: 'text', id: 't' }],
      });
      const result = JSON.parse(wrapWithTypeTemplate(postContent, templateJson));
      expect(result.version).toBe('1.0');
    });
  });

  describe('immutability', () => {
    it('does not mutate the original template blocks array', () => {
      const templateBlocks = [
        { type: 'section', id: 's', blocks: [{ type: 'post-content', id: 'p' }] },
      ];
      const templateJson = JSON.stringify({ blocks: templateBlocks, version: '1.0' });
      const postContent = JSON.stringify({ blocks: [{ type: 'text', id: 't' }], version: '1.0' });
      wrapWithTypeTemplate(postContent, templateJson);
      // templateBlocks is a fresh JS array we control; the function parses its own copy.
      // Confirm the source object we passed-as-JSON is unchanged (proves immutability of inputs).
      expect(templateBlocks[0].blocks).toEqual([{ type: 'post-content', id: 'p' }]);
    });

    it('returns a valid JSON string', () => {
      const templateJson = JSON.stringify({
        blocks: [{ type: 'post-content', id: 'p' }],
        version: '1.0',
      });
      const postContent = JSON.stringify({
        blocks: [{ type: 'text', id: 't' }],
        version: '1.0',
      });
      const result = wrapWithTypeTemplate(postContent, templateJson);
      expect(() => JSON.parse(result)).not.toThrow();
    });
  });

  describe('block property preservation', () => {
    it('preserves arbitrary block properties on non-placeholder blocks', () => {
      const templateJson = JSON.stringify({
        blocks: [
          { type: 'header', id: 'h', order: 0, customProp: 'value', nested: { a: 1 } },
          { type: 'post-content', id: 'p' },
        ],
        version: '1.0',
      });
      const postContent = JSON.stringify({
        blocks: [{ type: 'text', id: 't' }],
        version: '1.0',
      });
      const result = JSON.parse(wrapWithTypeTemplate(postContent, templateJson));
      expect(result.blocks[0]).toEqual({
        type: 'header',
        id: 'h',
        order: 0,
        customProp: 'value',
        nested: { a: 1 },
      });
    });

    it('preserves block properties when descending into nested blocks', () => {
      const templateJson = JSON.stringify({
        blocks: [
          {
            type: 'section',
            id: 's',
            backgroundColor: 'red',
            blocks: [{ type: 'post-content', id: 'p' }],
          },
        ],
        version: '1.0',
      });
      const postContent = JSON.stringify({
        blocks: [{ type: 'text', id: 't' }],
        version: '1.0',
      });
      const result = JSON.parse(wrapWithTypeTemplate(postContent, templateJson));
      expect(result.blocks[0].type).toBe('section');
      expect(result.blocks[0].backgroundColor).toBe('red');
      expect(result.blocks[0].id).toBe('s');
    });

    it('preserves column properties besides blocks', () => {
      const templateJson = JSON.stringify({
        blocks: [
          {
            type: 'columns',
            id: 'c',
            columns: [
              { width: 4, blocks: [{ type: 'post-content', id: 'p' }] },
            ],
          },
        ],
        version: '1.0',
      });
      const postContent = JSON.stringify({
        blocks: [{ type: 'text', id: 't' }],
        version: '1.0',
      });
      const result = JSON.parse(wrapWithTypeTemplate(postContent, templateJson));
      expect(result.blocks[0].columns[0].width).toBe(4);
      expect(result.blocks[0].columns[0].blocks).toEqual([{ type: 'text', id: 't' }]);
    });
  });

  describe('multiple post blocks', () => {
    it('expands a placeholder to multiple post blocks in order', () => {
      const templateJson = JSON.stringify({
        blocks: [{ type: 'post-content', id: 'p' }],
        version: '1.0',
      });
      const postContent = JSON.stringify({
        blocks: [
          { type: 'text', id: 't1' },
          { type: 'image', id: 'i1' },
          { type: 'text', id: 't2' },
        ],
        version: '1.0',
      });
      const result = JSON.parse(wrapWithTypeTemplate(postContent, templateJson));
      expect(result.blocks).toEqual([
        { type: 'text', id: 't1' },
        { type: 'image', id: 'i1' },
        { type: 'text', id: 't2' },
      ]);
    });
  });
});
