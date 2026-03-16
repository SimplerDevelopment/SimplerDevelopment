import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VisualBlockEditorComplete } from '@/components/blocks/VisualBlockEditorComplete';
import { Block } from '@/types/blocks';
import { parseRichContent } from '@/lib/utils/richPaste';

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

    expect(screen.getByText('Existing content')).toBeInTheDocument();
    expect(container.querySelector('[data-block-editor]')).toBeInTheDocument();
  });

  it('parseRichContent converts headings correctly', () => {
    const html = '<h1>Main Title</h1><h2>Subtitle</h2>';
    const blocks = parseRichContent(html);

    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('heading');
    expect(blocks[0].content).toBe('Main Title');
    expect(blocks[1].type).toBe('heading');
    expect(blocks[1].content).toBe('Subtitle');
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
    expect(blocks[0].content).toContain('<strong>bold</strong>');
    expect(blocks[0].content).toContain('<em>italic</em>');
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
    expect(blocks.some(b => b.type === 'text' && b.content.includes('•'))).toBe(true);
  });

  it('parseRichContent strips Word/Google Docs styles', () => {
    const html = '<p class="MsoNormal" style="margin-left: 0.5in;">Clean content</p>';
    const blocks = parseRichContent(html);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toBe('Clean content');
    expect(blocks[0].content).not.toContain('MsoNormal');
  });
});
