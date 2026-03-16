import { describe, it, expect } from 'vitest';
import { parseRichContent, convertNodesToBlocks } from '@/lib/utils/richPaste';
import { Block } from '@/types/blocks';

describe('richPaste utility', () => {
  describe('parseRichContent', () => {
    it('parses HTML headings to heading blocks', () => {
      const html = '<h1>Main Title</h1><h2>Subtitle</h2><h3>Section</h3>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(3);
      expect(blocks[0]).toMatchObject({
        type: 'heading',
        content: 'Main Title',
        level: 1,
        alignment: 'left',
      });
      expect(blocks[1]).toMatchObject({
        type: 'heading',
        content: 'Subtitle',
        level: 2,
        alignment: 'left',
      });
      expect(blocks[2]).toMatchObject({
        type: 'heading',
        content: 'Section',
        level: 3,
        alignment: 'left',
      });
    });

    it('parses HTML paragraphs to text blocks', () => {
      const html = '<p>First paragraph</p><p>Second paragraph</p>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        type: 'text',
        content: 'First paragraph',
        alignment: 'left',
        size: 'base',
      });
      expect(blocks[1]).toMatchObject({
        type: 'text',
        content: 'Second paragraph',
        alignment: 'left',
        size: 'base',
      });
    });

    it('preserves inline formatting (bold, italic, links)', () => {
      const html = '<p>This is <strong>bold</strong> and <em>italic</em> and <a href="https://example.com">a link</a></p>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].content).toContain('<strong>bold</strong>');
      expect(blocks[0].content).toContain('<em>italic</em>');
      expect(blocks[0].content).toContain('<a href="https://example.com">a link</a>');
    });

    it('parses blockquotes to quote blocks', () => {
      const html = '<blockquote>Quoted text here</blockquote>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: 'quote',
        content: 'Quoted text here',
        author: '',
        citation: '',
      });
    });

    it('parses images to image blocks', () => {
      const html = '<img src="https://example.com/image.jpg" alt="Test image" />';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: 'image',
        url: 'https://example.com/image.jpg',
        alt: 'Test image',
        caption: '',
      });
    });

    it('parses unordered lists to list blocks', () => {
      const html = '<ul><li>First item</li><li>Second item</li><li>Third item</li></ul>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: 'text',
        content: '• First item\n• Second item\n• Third item',
        alignment: 'left',
        size: 'base',
      });
    });

    it('parses ordered lists to list blocks', () => {
      const html = '<ol><li>First</li><li>Second</li><li>Third</li></ol>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: 'text',
        content: '1. First\n2. Second\n3. Third',
        alignment: 'left',
        size: 'base',
      });
    });

    it('strips proprietary Word/Google Docs classes and styles', () => {
      const html = '<p class="MsoNormal" style="margin-left: 0.5in; color: rgb(0, 0, 0);">Clean content</p>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].content).toBe('Clean content');
      expect(blocks[0].content).not.toContain('MsoNormal');
      expect(blocks[0].content).not.toContain('margin-left');
    });

    it('handles mixed content types', () => {
      const html = `
        <h1>Title</h1>
        <p>Intro paragraph</p>
        <blockquote>A quote</blockquote>
        <ul><li>List item</li></ul>
        <img src="test.jpg" alt="Image" />
      `;
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(5);
      expect(blocks[0].type).toBe('heading');
      expect(blocks[1].type).toBe('text');
      expect(blocks[2].type).toBe('quote');
      expect(blocks[3].type).toBe('text');
      expect(blocks[4].type).toBe('image');
    });

    it('handles empty or whitespace-only HTML', () => {
      const html = '   \n\n   ';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(0);
    });

    it('generates unique IDs for each block', () => {
      const html = '<p>First</p><p>Second</p>';
      const blocks = parseRichContent(html);

      expect(blocks[0].id).toBeTruthy();
      expect(blocks[1].id).toBeTruthy();
      expect(blocks[0].id).not.toBe(blocks[1].id);
    });

    it('assigns sequential order values', () => {
      const html = '<p>First</p><p>Second</p><p>Third</p>';
      const blocks = parseRichContent(html);

      expect(blocks[0].order).toBe(0);
      expect(blocks[1].order).toBe(1);
      expect(blocks[2].order).toBe(2);
    });

    it('handles base64 image data', () => {
      const html = '<img src="data:image/png;base64,iVBORw0KGgoAAAANS..." alt="Pasted image" />';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('image');
      expect(blocks[0].url).toContain('data:image/png;base64');
    });

    it('skips unsupported elements', () => {
      const html = '<p>Good content</p><video src="video.mp4"></video><p>More good content</p>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(2);
      expect(blocks[0].type).toBe('text');
      expect(blocks[1].type).toBe('text');
    });
  });

  describe('convertNodesToBlocks', () => {
    it('converts heading nodes with correct levels', () => {
      const parser = new DOMParser();
      const doc = parser.parseFromString('<h1>Test</h1>', 'text/html');
      const nodes = Array.from(doc.body.childNodes);
      const blocks = convertNodesToBlocks(nodes);

      expect(blocks[0]).toMatchObject({
        type: 'heading',
        level: 1,
        content: 'Test',
      });
    });

    it('converts paragraph nodes to text blocks', () => {
      const parser = new DOMParser();
      const doc = parser.parseFromString('<p>Test paragraph</p>', 'text/html');
      const nodes = Array.from(doc.body.childNodes);
      const blocks = convertNodesToBlocks(nodes);

      expect(blocks[0]).toMatchObject({
        type: 'text',
        content: 'Test paragraph',
      });
    });

    it('converts blockquote nodes to quote blocks', () => {
      const parser = new DOMParser();
      const doc = parser.parseFromString('<blockquote>Quote</blockquote>', 'text/html');
      const nodes = Array.from(doc.body.childNodes);
      const blocks = convertNodesToBlocks(nodes);

      expect(blocks[0]).toMatchObject({
        type: 'quote',
        content: 'Quote',
      });
    });

    it('converts ul/ol nodes to list blocks', () => {
      const parser = new DOMParser();
      const doc = parser.parseFromString('<ul><li>A</li><li>B</li></ul>', 'text/html');
      const nodes = Array.from(doc.body.childNodes);
      const blocks = convertNodesToBlocks(nodes);

      expect(blocks[0]).toMatchObject({
        type: 'text',
        content: '• A\n• B',
        alignment: 'left',
        size: 'base',
      });
    });

    it('converts img nodes to image blocks', () => {
      const parser = new DOMParser();
      const doc = parser.parseFromString('<img src="https://example.com/test.jpg" alt="Alt text" />', 'text/html');
      const nodes = Array.from(doc.body.childNodes);
      const blocks = convertNodesToBlocks(nodes);

      expect(blocks[0]).toMatchObject({
        type: 'image',
        url: 'https://example.com/test.jpg',
        alt: 'Alt text',
      });
    });

    it('skips text nodes with only whitespace', () => {
      const parser = new DOMParser();
      const doc = parser.parseFromString('  \n  <p>Content</p>  \n  ', 'text/html');
      const nodes = Array.from(doc.body.childNodes);
      const blocks = convertNodesToBlocks(nodes);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('text');
    });
  });
});
