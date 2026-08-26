// @vitest-environment jsdom
/**
 * Unit tests for VEQA-032 step 3a — the first group of leaf renderers
 * (TextBlockRender, HeadingBlockRender, QuoteBlockRender,
 * TestimonialBlockRender) consuming the typography cascade
 * (components/blocks/render/typography-cascade.tsx, VEQA-032 step 1).
 *
 * Per leaf, four scenarios:
 *   1. No provider, no own style → theme fallback class present, no inline
 *      color/fontSize — proves zero behavior change for untouched content.
 *   2. Wrapped in a `TypographyCascadeProvider` with `own={{ color,
 *      fontSize }}` and no block-level style → the content node gets the
 *      inline values and the fallback classes are suppressed.
 *   3. Provider + the leaf's own `block.style.color` → the leaf's own value
 *      wins (fallback suppressed) and the ancestor's color is NOT applied
 *      inline by this leaf (own values are already carried via
 *      BlockStyleWrapper's CSS inheritance elsewhere in the tree — inlining
 *      them again here would be redundant, per the leaf-sweep spec).
 *   4. Chrome nodes (only TestimonialBlockRender's decorative quote-mark SVG
 *      here — the other three leaves have no chrome) are unaffected by the
 *      provider.
 *
 * `step 2` (the section/columns providers) is PR #186, unmerged — these
 * tests wrap each leaf directly in `TypographyCascadeProvider` rather than
 * depending on it.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TypographyCascadeProvider } from '@/components/blocks/render/typography-cascade';
import { TextBlockRender } from '@/components/blocks/render/TextBlockRender';
import { HeadingBlockRender } from '@/components/blocks/render/HeadingBlockRender';
import { QuoteBlockRender } from '@/components/blocks/render/QuoteBlockRender';
import { TestimonialBlockRender } from '@/components/blocks/render/TestimonialBlockRender';
import type { TextBlock, HeadingBlock, QuoteBlock } from '@/types/blocks';
import type { TestimonialBlock } from '@/types/blocks/components';

const ANCESTOR = { color: '#123456', fontSize: '22px' };

describe('TextBlockRender — VEQA-032 step 3a', () => {
  const baseBlock: TextBlock = { id: 't1', type: 'text', order: 0, content: 'Hello world' };

  it('no provider, no own style → fallback class present, no inline color/fontSize', () => {
    render(<TextBlockRender block={baseBlock} />);
    const content = screen.getByText('Hello world');
    expect(content).toHaveClass('text-foreground');
    expect(content).not.toHaveStyle({ color: expect.anything() });
    expect(content.style.color).toBe('');
    expect(content.style.fontSize).toBe('');
  });

  it('provider ancestor value → inline values applied, fallback class gone', () => {
    render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <TextBlockRender block={baseBlock} />
      </TypographyCascadeProvider>
    );
    const content = screen.getByText('Hello world');
    expect(content).not.toHaveClass('text-foreground');
    expect(content).toHaveStyle({ color: '#123456' });
  });

  it('own block.style.color beats provider ancestor value', () => {
    const ownBlock: TextBlock = { ...baseBlock, style: { color: '#abcdef' } };
    render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <TextBlockRender block={ownBlock} />
      </TypographyCascadeProvider>
    );
    const content = screen.getByText('Hello world');
    expect(content).not.toHaveClass('text-foreground');
    // own wins → this leaf does not inline the ancestor's color (own is
    // carried through BlockStyleWrapper's CSS inheritance elsewhere).
    expect(content.style.color).not.toBe('#123456');
  });
});

describe('HeadingBlockRender — VEQA-032 step 3a', () => {
  const baseBlock: HeadingBlock = { id: 'h1', type: 'heading', order: 0, content: 'A Heading', level: 2 };

  it('no provider, no own style → fallback class present, no inline color/fontSize', () => {
    render(<HeadingBlockRender block={baseBlock} />);
    const heading = screen.getByText('A Heading');
    expect(heading).toHaveClass('text-foreground');
    expect(heading.style.color).toBe('');
    expect(heading.style.fontSize).toBe('');
  });

  it('provider ancestor value → inline values applied, fallback classes gone', () => {
    render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <HeadingBlockRender block={baseBlock} />
      </TypographyCascadeProvider>
    );
    const heading = screen.getByText('A Heading');
    expect(heading).not.toHaveClass('text-foreground');
    expect(heading).toHaveStyle({ color: '#123456', fontSize: '22px' });
    // level-2 theme size class also suppressed since fontSize resolved
    expect(heading.className).not.toMatch(/text-3xl/);
  });

  it('own block.style.color beats provider ancestor value', () => {
    const ownBlock: HeadingBlock = { ...baseBlock, style: { color: '#abcdef' } };
    render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <HeadingBlockRender block={ownBlock} />
      </TypographyCascadeProvider>
    );
    const heading = screen.getByText('A Heading');
    expect(heading).not.toHaveClass('text-foreground');
    expect(heading.style.color).not.toBe('#123456');
  });
});

describe('QuoteBlockRender — VEQA-032 step 3a', () => {
  const baseBlock: QuoteBlock = { id: 'q1', type: 'quote', order: 0, content: 'To be or not to be', author: 'Shakespeare' };

  it('no provider, no own style → fallback class present, no inline color/fontSize', () => {
    render(<QuoteBlockRender block={baseBlock} />);
    const blockquote = screen.getByText((_, el) => el?.tagName === 'BLOCKQUOTE') as HTMLElement;
    expect(blockquote).toHaveClass('text-muted-foreground');
    expect(blockquote.style.color).toBe('');
    expect(blockquote.style.fontSize).toBe('');
  });

  it('provider ancestor value → inline values applied on blockquote + footer, fallback classes gone', () => {
    render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <QuoteBlockRender block={baseBlock} />
      </TypographyCascadeProvider>
    );
    const blockquote = screen.getByText((_, el) => el?.tagName === 'BLOCKQUOTE') as HTMLElement;
    expect(blockquote).not.toHaveClass('text-muted-foreground');
    expect(blockquote).toHaveStyle({ color: '#123456', fontSize: '22px' });

    const footer = blockquote.querySelector('footer') as HTMLElement;
    expect(footer).not.toHaveClass('text-foreground');
    expect(footer).toHaveStyle({ color: '#123456', fontSize: '22px' });
  });

  it('own block.style.color beats provider ancestor value', () => {
    const ownBlock: QuoteBlock = { ...baseBlock, style: { color: '#abcdef' } };
    render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <QuoteBlockRender block={ownBlock} />
      </TypographyCascadeProvider>
    );
    const blockquote = screen.getByText((_, el) => el?.tagName === 'BLOCKQUOTE') as HTMLElement;
    expect(blockquote).not.toHaveClass('text-muted-foreground');
    expect(blockquote.style.color).not.toBe('#123456');
  });

  it('elementStyles quoteText color still wins over ancestor (unaffected orthogonal mechanism)', () => {
    const elementStyledBlock: QuoteBlock = {
      ...baseBlock,
      elementStyles: { quoteText: { color: '#00ff00' } },
    };
    render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <QuoteBlockRender block={elementStyledBlock} />
      </TypographyCascadeProvider>
    );
    const content = document.querySelector('[data-editable-field="content"]') as HTMLElement;
    expect(content.style.color).toBe('rgb(0, 255, 0)');
  });
});

describe('TestimonialBlockRender — VEQA-032 step 3a', () => {
  const baseBlock: TestimonialBlock = { id: 'te1', type: 'testimonial', order: 0, quote: 'Great service', author: 'Jane Doe' };

  it('no provider, no own style → fallback classes present, no inline color/fontSize on quote or author', () => {
    render(<TestimonialBlockRender block={baseBlock} />);
    const quote = screen.getByText('Great service');
    const author = screen.getByText('Jane Doe');
    expect(quote).toHaveClass('text-foreground');
    expect(author).toHaveClass('text-foreground');
    expect(quote.style.color).toBe('');
    expect(author.style.color).toBe('');
  });

  it('provider ancestor value → inline values applied to quote and author, fallback classes gone', () => {
    render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <TestimonialBlockRender block={baseBlock} />
      </TypographyCascadeProvider>
    );
    const quote = screen.getByText('Great service');
    const author = screen.getByText('Jane Doe');
    expect(quote).not.toHaveClass('text-foreground');
    expect(quote).toHaveStyle({ color: '#123456', fontSize: '22px' });
    expect(author).not.toHaveClass('text-foreground');
    expect(author).toHaveStyle({ color: '#123456' });
  });

  it('own block.style.color beats provider ancestor value', () => {
    const ownBlock: TestimonialBlock = { ...baseBlock, style: { color: '#abcdef' } };
    render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <TestimonialBlockRender block={ownBlock} />
      </TypographyCascadeProvider>
    );
    const quote = screen.getByText('Great service');
    expect(quote).not.toHaveClass('text-foreground');
    expect(quote.style.color).not.toBe('#123456');
  });

  it('chrome: decorative quote-mark SVG is unaffected by the provider', () => {
    const { container } = render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <TestimonialBlockRender block={baseBlock} />
      </TypographyCascadeProvider>
    );
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.style.color).toBe('var(--brand-primary, currentColor)');
    expect(svg.style.width).toBe('64px');
  });
});
