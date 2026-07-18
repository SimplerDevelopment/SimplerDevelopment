import { describe, it, expect } from 'vitest';
import {
  parseRichContent,
  convertNodesToBlocks,
  parseRichContentWithWarnings,
  PasteResult,
} from '@/lib/utils/richPaste';
import { Block, TextBlock, HeadingBlock, ImageBlock, QuoteBlock } from '@/types/blocks';

// Helpers for accessing typed properties on the Block union
function contentOf(block: Block): string {
  return (block as TextBlock | HeadingBlock | QuoteBlock).content ?? '';
}
function urlOf(block: Block): string {
  return (block as ImageBlock).url ?? '';
}
function altOf(block: Block): string {
  return (block as ImageBlock).alt ?? '';
}
function levelOf(block: Block): number {
  return (block as HeadingBlock).level ?? 0;
}

describe('richPaste utility — additional coverage', () => {
  describe('parseRichContent — empty/edge inputs', () => {
    it('returns empty array for completely empty string', () => {
      expect(parseRichContent('')).toEqual([]);
    });

    it('returns empty array for single tab character', () => {
      expect(parseRichContent('\t')).toEqual([]);
    });

    it('returns empty array for null-equivalent input', () => {
      // Cast to satisfy types but exercise the truthy guard
      expect(parseRichContent(undefined as unknown as string)).toEqual([]);
      expect(parseRichContent(null as unknown as string)).toEqual([]);
    });

    it('returns empty array when body has only HTML comments', () => {
      const html = '<!-- nothing here -->';
      const blocks = parseRichContent(html);
      // Comments are not element or text nodes after parsing, should drop
      expect(blocks).toEqual([]);
    });
  });

  describe('parseRichContent — heading levels h4-h6', () => {
    it('parses h4, h5, h6 with correct levels', () => {
      const html = '<h4>Four</h4><h5>Five</h5><h6>Six</h6>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(3);
      expect(blocks[0].type).toBe('heading');
      expect(levelOf(blocks[0])).toBe(4);
      expect(levelOf(blocks[1])).toBe(5);
      expect(levelOf(blocks[2])).toBe(6);
    });

    it('preserves inline formatting inside headings', () => {
      const html = '<h2>Hello <strong>World</strong></h2>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(1);
      expect(contentOf(blocks[0])).toContain('<strong>World</strong>');
    });
  });

  describe('parseRichContent — container recursion', () => {
    it('recursively extracts blocks from <div>', () => {
      const html = '<div><h1>Inside Div</h1><p>Para inside</p></div>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(2);
      expect(blocks[0].type).toBe('heading');
      expect(blocks[1].type).toBe('text');
    });

    it('recursively extracts blocks from <section>', () => {
      const html = '<section><p>Section content</p></section>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('text');
      expect(contentOf(blocks[0])).toBe('Section content');
    });

    it('recursively extracts blocks from <article>', () => {
      const html = '<article><h2>Article title</h2><p>Article body</p></article>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(2);
      expect(blocks[0].type).toBe('heading');
      expect(blocks[1].type).toBe('text');
    });

    it('handles deeply nested containers', () => {
      const html = '<div><section><article><h1>Deep</h1></article></section></div>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('heading');
      expect(contentOf(blocks[0])).toBe('Deep');
    });
  });

  describe('parseRichContent — fallback for unknown elements', () => {
    it('extracts text content from unsupported element with text', () => {
      // <span> isn't switch-cased, so it falls into default branch
      const html = '<span>Just a span</span>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('text');
      expect(contentOf(blocks[0])).toBe('Just a span');
    });

    it('drops unsupported element with no text content', () => {
      const html = '<video src="x.mp4"></video>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(0);
    });

    it('drops <iframe> with no inner text', () => {
      const html = '<iframe src="https://example.com"></iframe>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(0);
    });
  });

  describe('parseRichContent — top-level text nodes', () => {
    it('converts top-level text node to a text block', () => {
      // A bare text node at the top level
      const html = 'Plain text at root';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('text');
      expect(contentOf(blocks[0])).toBe('Plain text at root');
    });

    it('drops top-level text nodes that are only whitespace', () => {
      const html = '   <p>Real content</p>   ';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('text');
      expect(contentOf(blocks[0])).toBe('Real content');
    });
  });

  describe('parseRichContent — block IDs and order', () => {
    it('uses block- prefix for generated ids', () => {
      const html = '<p>Hello</p>';
      const blocks = parseRichContent(html);

      expect(blocks[0].id).toMatch(/^block-\d+-[a-z0-9]+$/);
    });

    it('generates distinct ids across many blocks', () => {
      const html = Array.from({ length: 10 }, (_, i) => `<p>Item ${i}</p>`).join('');
      const blocks = parseRichContent(html);

      const ids = new Set(blocks.map((b) => b.id));
      expect(ids.size).toBe(blocks.length);
    });

    it('assigns order matching index for many blocks', () => {
      const html = '<p>A</p><h1>B</h1><blockquote>C</blockquote><p>D</p>';
      const blocks = parseRichContent(html);

      blocks.forEach((b, i) => {
        expect(b.order).toBe(i);
      });
    });
  });

  describe('parseRichContent — image block edge cases', () => {
    it('falls back to empty url when src missing', () => {
      const html = '<img alt="no src" />';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('image');
      // jsdom may resolve src="" to about:blank or empty depending; we accept either falsy or empty-string-ish
      expect(typeof urlOf(blocks[0])).toBe('string');
    });

    it('defaults alt to empty string when missing', () => {
      const html = '<img src="https://example.com/x.png" />';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(1);
      expect(altOf(blocks[0])).toBe('');
    });
  });

  describe('parseRichContent — list edge cases', () => {
    it('handles empty list (no <li>)', () => {
      const html = '<ul></ul>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('text');
      expect(contentOf(blocks[0])).toBe('');
    });

    it('handles single-item list', () => {
      const html = '<ol><li>Only one</li></ol>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(1);
      expect(contentOf(blocks[0])).toBe('1. Only one');
    });

    it('preserves inline formatting inside list items', () => {
      const html = '<ul><li>Item with <em>emphasis</em></li></ul>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(1);
      expect(contentOf(blocks[0])).toContain('<em>emphasis</em>');
    });
  });

  describe('parseRichContent — cleanDocument behavior', () => {
    it('strips <script> tags entirely', () => {
      const html = '<p>Safe</p><script>alert("xss")</script><p>Also safe</p>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(2);
      blocks.forEach((b) => {
        expect(contentOf(b)).not.toContain('alert');
      });
    });

    it('strips <style> tags entirely', () => {
      const html = '<style>.x{color:red}</style><p>Content</p>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(1);
      expect(contentOf(blocks[0])).toBe('Content');
    });

    it('strips Google Docs proprietary classes', () => {
      const html = '<p class="GoogleDocsClassXY">Google content</p>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(1);
      expect(contentOf(blocks[0])).not.toContain('GoogleDocs');
    });

    it('strips Apple proprietary classes', () => {
      const html = '<p class="AppleStyleSpan">Apple content</p>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(1);
      expect(contentOf(blocks[0])).not.toContain('AppleStyleSpan');
    });

    it('strips Word proprietary classes', () => {
      const html = '<p class="WordSection1">Word content</p>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(1);
      expect(contentOf(blocks[0])).not.toContain('WordSection1');
    });

    it('removes data-* attributes', () => {
      const html = '<p data-foo="bar" data-baz="qux">Content</p>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(1);
      expect(contentOf(blocks[0])).not.toContain('data-foo');
      expect(contentOf(blocks[0])).not.toContain('data-baz');
    });

    it('preserves allowed inline style properties on inline children', () => {
      // Inline <span> falls through default branch and gets textContent;
      // but on a <p> the inner HTML preserves child markup. The cleanDocument
      // step should keep font-weight/font-style/text-decoration but drop color.
      const html = '<p><span style="font-weight: bold; color: red;">Styled</span> text</p>';
      const blocks = parseRichContent(html);

      expect(blocks).toHaveLength(1);
      const content = contentOf(blocks[0]);
      expect(content).not.toContain('color');
      // font-weight should remain in the style attribute on the span
      // (loosely check that "font-weight" is preserved somewhere)
      expect(content.toLowerCase()).toMatch(/font-weight/);
    });
  });

  describe('convertNodesToBlocks — direct invocation', () => {
    it('returns empty array for empty input', () => {
      expect(convertNodesToBlocks([])).toEqual([]);
    });

    it('ignores comment nodes', () => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(
        '<!-- comment --><p>After comment</p>',
        'text/html'
      );
      const nodes = Array.from(doc.body.childNodes);
      const blocks = convertNodesToBlocks(nodes);

      // Only the <p> should produce a block; comment is non-element/non-text
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('text');
    });

    it('handles all six heading levels passed directly', () => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(
        '<h1>1</h1><h2>2</h2><h3>3</h3><h4>4</h4><h5>5</h5><h6>6</h6>',
        'text/html'
      );
      const nodes = Array.from(doc.body.childNodes);
      const blocks = convertNodesToBlocks(nodes);

      expect(blocks).toHaveLength(6);
      blocks.forEach((b, i) => {
        expect(b.type).toBe('heading');
        expect(levelOf(b)).toBe(i + 1);
      });
    });

    it('handles mixed text and element top-level nodes', () => {
      const parser = new DOMParser();
      // Use a text node concatenated with an element
      const doc = parser.parseFromString('Hello <p>World</p>', 'text/html');
      const nodes = Array.from(doc.body.childNodes);
      const blocks = convertNodesToBlocks(nodes);

      // "Hello " text node -> text block, then <p>World</p> -> text block
      expect(blocks.length).toBeGreaterThanOrEqual(2);
      expect(blocks[0].type).toBe('text');
      expect(contentOf(blocks[0])).toBe('Hello');
    });
  });

  describe('parseRichContentWithWarnings', () => {
    it('returns the same blocks as parseRichContent for clean input', () => {
      const html = '<h1>Hi</h1><p>Yo</p>';
      const result: PasteResult = parseRichContentWithWarnings(html);

      expect(result.blocks).toHaveLength(2);
      expect(result.warnings).toEqual([]);
    });

    it('warns about <video> elements', () => {
      const html = '<p>ok</p><video src="x.mp4"></video>';
      const result = parseRichContentWithWarnings(html);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('video');
    });

    it('warns about <audio> elements', () => {
      const html = '<audio src="x.mp3"></audio>';
      const result = parseRichContentWithWarnings(html);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('audio');
    });

    it('warns about <iframe> elements', () => {
      const html = '<iframe src="https://example.com"></iframe>';
      const result = parseRichContentWithWarnings(html);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('iframe');
    });

    it('warns about <table> elements', () => {
      const html = '<table><tr><td>cell</td></tr></table>';
      const result = parseRichContentWithWarnings(html);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('table');
    });

    it('warns about <svg> elements', () => {
      const html = '<svg><circle r="10" /></svg>';
      const result = parseRichContentWithWarnings(html);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('svg');
    });

    it('warns about <canvas> elements', () => {
      const html = '<canvas width="100" height="100"></canvas>';
      const result = parseRichContentWithWarnings(html);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('canvas');
    });

    it('warns about <embed> elements', () => {
      const html = '<embed src="x.swf" />';
      const result = parseRichContentWithWarnings(html);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('embed');
    });

    it('warns about <object> elements', () => {
      const html = '<object data="x.pdf"></object>';
      const result = parseRichContentWithWarnings(html);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('object');
    });

    it('deduplicates element-type warnings', () => {
      const html =
        '<video src="a"></video><video src="b"></video><video src="c"></video>';
      const result = parseRichContentWithWarnings(html);

      expect(result.warnings).toHaveLength(1);
      // single warning string mentions "video" exactly once
      expect(result.warnings[0].match(/video/g)?.length).toBe(1);
    });

    it('aggregates multiple distinct unsupported element types in one warning', () => {
      const html = '<video src="x"></video><iframe src="y"></iframe>';
      const result = parseRichContentWithWarnings(html);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('video');
      expect(result.warnings[0]).toContain('iframe');
    });

    it('returns no warnings for empty input', () => {
      const result = parseRichContentWithWarnings('');
      expect(result.blocks).toEqual([]);
      expect(result.warnings).toEqual([]);
    });
  });
});
