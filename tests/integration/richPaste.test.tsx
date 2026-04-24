import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VisualBlockEditorComplete } from '@/components/blocks/VisualBlockEditorComplete';
import { Block, TextBlock, HeadingBlock } from '@/types/blocks';
import { parseRichContent } from '@/lib/utils/richPaste';

// Helper to access content property on parsed blocks (headings, text, quotes)
function contentOf(block: Block): string {
  return (block as TextBlock | HeadingBlock).content ?? '';
}

describe('Rich Paste Integration', () => {
  const initialBlocks: Block[] = [
    {
      id: 'block-1',
      type: 'text',
      content: 'Existing content',
      order: 1,
      alignment: 'left',
      size: 'base',
    },
  ];

  it('renders editor with data-block-editor attribute for paste handling', () => {
    const onChange = vi.fn();

    const { container } = render(
      <VisualBlockEditorComplete blocks={initialBlocks} onChange={onChange} />
    );

    // Block content renders in the editable body plus the preview/layers
    // mirrors — getAllByText tolerates the duplication that getByText rejects.
    expect(screen.getAllByText('Existing content').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-block-editor]')).toBeInTheDocument();
  });

  it('parseRichContent converts headings correctly', () => {
    const html = '<h1>Main Title</h1><h2>Subtitle</h2>';
    const blocks = parseRichContent(html);

    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('heading');
    expect(contentOf(blocks[0])).toBe('Main Title');
    expect(blocks[1].type).toBe('heading');
    expect(contentOf(blocks[1])).toBe('Subtitle');
  });

  it('parseRichContent converts paragraphs to text blocks', () => {
    const html = '<p>First paragraph</p><p>Second paragraph</p>';
    const blocks = parseRichContent(html);

    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('text');
    expect(blocks[1].type).toBe('text');
  });

  it('parseRichContent preserves inline formatting', () => {
    const html = '<p>Text with <strong>bold</strong> and <em>italic</em></p>';
    const blocks = parseRichContent(html);

    expect(blocks).toHaveLength(1);
    expect(contentOf(blocks[0])).toContain('<strong>bold</strong>');
    expect(contentOf(blocks[0])).toContain('<em>italic</em>');
  });

  it('parseRichContent handles mixed content types', () => {
    const html = `
      <h1>Title</h1>
      <p>Paragraph</p>
      <blockquote>Quote</blockquote>
      <ul><li>List item</li></ul>
    `;
    const blocks = parseRichContent(html);

    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.some(b => b.type === 'heading')).toBe(true);
    expect(blocks.some(b => b.type === 'text')).toBe(true);
    expect(blocks.some(b => b.type === 'quote')).toBe(true);
    expect(blocks.some(b => b.type === 'text' && contentOf(b).includes('•'))).toBe(true);
  });

  it('parseRichContent strips Word/Google Docs styles', () => {
    const html = '<p class="MsoNormal" style="margin-left: 0.5in;">Clean content</p>';
    const blocks = parseRichContent(html);

    expect(blocks).toHaveLength(1);
    expect(contentOf(blocks[0])).toBe('Clean content');
    expect(contentOf(blocks[0])).not.toContain('MsoNormal');
  });
});
