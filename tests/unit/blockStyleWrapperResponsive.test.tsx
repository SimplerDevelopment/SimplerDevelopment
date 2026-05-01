/**
 * Tests that the universal BlockStyleWrapper consumes `block.responsive`
 * (margin/padding/visibility/fontSize) and emits real CSS in a scoped
 * <style> tag. Regression guard for the "margin/padding controls don't
 * apply to the live editor" bug.
 *
 * Covers BOTH:
 *   - SpacingSize tokens (none/xs/sm/md/lg/xl/2xl) — the legacy preset path
 *   - Custom values (px/%/rem) — the path that silently dropped before
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BlockStyleWrapper } from '@/components/blocks/render/BlockStyleWrapper';
import { generateResponsiveStyles, parseShorthandSide } from '@/lib/utils/responsiveCss';
import type { Block, TextBlock, HeadingBlock, ImageBlock } from '@/types/blocks';

function makeBlock<T extends Partial<Block>>(overrides: T): Block {
  return {
    id: 'b1',
    type: 'text',
    order: 0,
    content: 'hi',
    ...overrides,
  } as Block;
}

describe('generateResponsiveStyles', () => {
  it('returns null when responsive is undefined', () => {
    const block = makeBlock({});
    expect(generateResponsiveStyles(block)).toBeNull();
  });

  it('returns null when responsive is empty', () => {
    const block = makeBlock({ responsive: {} });
    expect(generateResponsiveStyles(block)).toBeNull();
  });

  it('emits desktop margin-top from a custom px value', () => {
    const block = makeBlock({
      responsive: { marginTop: { desktop: '87px' } },
    });
    const result = generateResponsiveStyles(block);
    expect(result).not.toBeNull();
    expect(result!.className).toBe('bsr-b1');
    expect(result!.css).toContain('@media (min-width: 1024px)');
    expect(result!.css).toContain('.bsr-b1{margin-top: 87px}');
  });

  it('emits tablet margin-bottom from a SpacingSize token (lg → 1.5rem)', () => {
    const block = makeBlock({
      responsive: { marginBottom: { tablet: 'lg' } },
    });
    const result = generateResponsiveStyles(block);
    expect(result!.css).toContain('@media (min-width: 768px)');
    expect(result!.css).toContain('margin-bottom: 1.5rem');
  });

  it('emits mobile-base styles without a media query', () => {
    const block = makeBlock({
      responsive: { paddingTop: { mobile: 'md' } },
    });
    const result = generateResponsiveStyles(block);
    // Mobile-first: no @media wrapper around the base styles
    expect(result!.css).toMatch(/^\.bsr-b1\{padding-top: 1rem\}/);
  });

  it('emits all four sides of margin and padding at desktop', () => {
    const block = makeBlock({
      responsive: {
        marginTop: { desktop: '10px' },
        marginRight: { desktop: '20px' },
        marginBottom: { desktop: '30px' },
        marginLeft: { desktop: '40px' },
        paddingTop: { desktop: '1rem' },
        paddingRight: { desktop: '2rem' },
        paddingBottom: { desktop: '3rem' },
        paddingLeft: { desktop: '4rem' },
      },
    });
    const result = generateResponsiveStyles(block);
    expect(result!.css).toContain('margin-top: 10px');
    expect(result!.css).toContain('margin-right: 20px');
    expect(result!.css).toContain('margin-bottom: 30px');
    expect(result!.css).toContain('margin-left: 40px');
    expect(result!.css).toContain('padding-top: 1rem');
    expect(result!.css).toContain('padding-right: 2rem');
    expect(result!.css).toContain('padding-bottom: 3rem');
    expect(result!.css).toContain('padding-left: 4rem');
  });

  it('combines multiple breakpoints with separate @media blocks', () => {
    const block = makeBlock({
      responsive: {
        marginTop: { mobile: '4px', tablet: '8px', desktop: '16px' },
      },
    });
    const result = generateResponsiveStyles(block);
    // Mobile → base (no media)
    expect(result!.css).toMatch(/\.bsr-b1\{margin-top: 4px\}/);
    // Tablet → 768px
    expect(result!.css).toMatch(/@media \(min-width: 768px\)\{\.bsr-b1\{margin-top: 8px\}\}/);
    // Desktop → 1024px
    expect(result!.css).toMatch(/@media \(min-width: 1024px\)\{\.bsr-b1\{margin-top: 16px\}\}/);
  });

  it('emits display:none when visibility is false at a breakpoint', () => {
    const block = makeBlock({
      responsive: { visibility: { mobile: false } },
    });
    const result = generateResponsiveStyles(block);
    expect(result!.css).toContain('display: none');
  });

  it('emits font-size CSS for typography tokens', () => {
    const block = makeBlock({
      responsive: { fontSize: { desktop: '2xl' } },
    });
    const result = generateResponsiveStyles(block);
    expect(result!.css).toContain('font-size: 1.5rem');
  });

  it('passes raw rem/% values through unchanged', () => {
    const block = makeBlock({
      responsive: {
        marginTop: { desktop: '2rem' },
        paddingLeft: { desktop: '5%' },
      },
    });
    const result = generateResponsiveStyles(block);
    expect(result!.css).toContain('margin-top: 2rem');
    expect(result!.css).toContain('padding-left: 5%');
  });

  it('sanitizes block.id with non-css-safe characters', () => {
    const block = makeBlock({
      id: 'block.with:weird/chars',
      responsive: { marginTop: { desktop: '10px' } },
    });
    const result = generateResponsiveStyles(block);
    expect(result!.className).toBe('bsr-blockwithweirdchars');
  });

  it('falls back to bsr-noid when id is missing', () => {
    const block = makeBlock({ id: undefined as unknown as string, responsive: { marginTop: { desktop: '5px' } } });
    const result = generateResponsiveStyles(block);
    expect(result!.className).toBe('bsr-noid');
  });

  it('treats an empty-string spacing value as unset', () => {
    const block = makeBlock({
      responsive: { marginTop: { desktop: '' } },
    });
    expect(generateResponsiveStyles(block)).toBeNull();
  });
});

describe('BlockStyleWrapper — responsive integration', () => {
  it('renders a <style> tag when responsive is set', () => {
    const block: TextBlock = {
      id: 'tb1',
      type: 'text',
      order: 0,
      content: 'x',
      responsive: { marginTop: { desktop: '87px' } },
    };
    const { container } = render(
      <BlockStyleWrapper block={block}>
        <span>content</span>
      </BlockStyleWrapper>,
    );
    const styleTag = container.querySelector('style');
    expect(styleTag).not.toBeNull();
    expect(styleTag!.innerHTML).toContain('margin-top: 87px');
  });

  it('attaches the bsr-{id} class to the wrapper div', () => {
    const block: TextBlock = {
      id: 'tb2',
      type: 'text',
      order: 0,
      content: 'x',
      responsive: { paddingTop: { desktop: '10px' } },
    };
    const { container } = render(
      <BlockStyleWrapper block={block}>
        <span>content</span>
      </BlockStyleWrapper>,
    );
    const wrapper = container.querySelector('div');
    expect(wrapper?.className).toContain('bsr-tb2');
  });

  it('does NOT emit a <style> tag when there is no responsive data', () => {
    const block: TextBlock = {
      id: 'tb3',
      type: 'text',
      order: 0,
      content: 'x',
      style: { backgroundColor: '#ff0000' },
    };
    const { container } = render(
      <BlockStyleWrapper block={block}>
        <span>content</span>
      </BlockStyleWrapper>,
    );
    expect(container.querySelector('style')).toBeNull();
  });

  it('renders for blocks that have ONLY responsive (no static style)', () => {
    const block: TextBlock = {
      id: 'tb4',
      type: 'text',
      order: 0,
      content: 'x',
      responsive: { marginTop: { desktop: '50px' } },
    };
    const { container } = render(
      <BlockStyleWrapper block={block}>
        <span data-testid="kid">content</span>
      </BlockStyleWrapper>,
    );
    expect(container.querySelector('div')).not.toBeNull();
    expect(container.querySelector('style')!.innerHTML).toContain('margin-top: 50px');
  });

  // Per-side assertions read via the DOM `el.style.paddingTop` accessors
  // rather than regex-matching the serialized `style` attribute. The CSSOM
  // collapses four equal longhand sides into the shorthand on serialization,
  // which would mask correct per-side state. Per-side accessors return the
  // resolved value regardless of how it was serialized.

  it('keeps static padding when no responsive padding is set', () => {
    const block: TextBlock = {
      id: 'tb5',
      type: 'text',
      order: 0,
      content: 'x',
      style: { padding: '20px' },
    };
    const { container } = render(
      <BlockStyleWrapper block={block}>
        <span>content</span>
      </BlockStyleWrapper>,
    );
    const el = container.querySelector('div') as HTMLElement;
    expect(el.style.paddingTop).toBe('20px');
    expect(el.style.paddingRight).toBe('20px');
    expect(el.style.paddingBottom).toBe('20px');
    expect(el.style.paddingLeft).toBe('20px');
  });

  it('prefers responsive padding over static for the side responsive owns, keeps other sides', () => {
    const block: TextBlock = {
      id: 'tb6',
      type: 'text',
      order: 0,
      content: 'x',
      style: { padding: '10px 20px 30px 40px' },
      responsive: { paddingTop: { desktop: '50px' } },
    };
    const { container } = render(
      <BlockStyleWrapper block={block}>
        <span>content</span>
      </BlockStyleWrapper>,
    );
    const el = container.querySelector('div') as HTMLElement;
    // The responsive-owned side (top) is NOT in inline — it lives in the <style> tag.
    expect(el.style.paddingTop).toBe('');
    // Other sides survive — this is the regression we're guarding against.
    expect(el.style.paddingRight).toBe('20px');
    expect(el.style.paddingBottom).toBe('30px');
    expect(el.style.paddingLeft).toBe('40px');
    expect(container.querySelector('style')!.innerHTML).toContain('padding-top: 50px');
  });

  it('per-side: setting one responsive margin does not drop the other static margin sides', () => {
    const block: TextBlock = {
      id: 'tb7',
      type: 'text',
      order: 0,
      content: 'x',
      style: { margin: '10px 20px 30px 40px' },
      responsive: { marginTop: { desktop: '1rem' } },
    };
    const { container } = render(
      <BlockStyleWrapper block={block}>
        <span>content</span>
      </BlockStyleWrapper>,
    );
    const el = container.querySelector('div') as HTMLElement;
    expect(el.style.marginTop).toBe('');
    expect(el.style.marginRight).toBe('20px');
    expect(el.style.marginBottom).toBe('30px');
    expect(el.style.marginLeft).toBe('40px');
    expect(container.querySelector('style')!.innerHTML).toContain('margin-top: 1rem');
  });

  it('reads longhand style.marginTop set by visual editor drag handles', () => {
    const block = {
      id: 'tb8',
      type: 'text',
      order: 0,
      content: 'x',
      style: { marginTop: '15px' },
    } as unknown as TextBlock;
    const { container } = render(
      <BlockStyleWrapper block={block}>
        <span>content</span>
      </BlockStyleWrapper>,
    );
    const el = container.querySelector('div') as HTMLElement;
    expect(el.style.marginTop).toBe('15px');
    expect(el.style.marginRight).toBe('');
    expect(el.style.marginBottom).toBe('');
    expect(el.style.marginLeft).toBe('');
  });

  it('longhand style.marginTop wins over a shorthand value on the same side', () => {
    const block = {
      id: 'tb9',
      type: 'text',
      order: 0,
      content: 'x',
      style: { margin: '5px', marginTop: '99px' },
    } as unknown as TextBlock;
    const { container } = render(
      <BlockStyleWrapper block={block}>
        <span>content</span>
      </BlockStyleWrapper>,
    );
    const el = container.querySelector('div') as HTMLElement;
    expect(el.style.marginTop).toBe('99px');
    expect(el.style.marginRight).toBe('5px');
    expect(el.style.marginBottom).toBe('5px');
    expect(el.style.marginLeft).toBe('5px');
  });

  it('two-token shorthand expands correctly (vertical/horizontal)', () => {
    const block: TextBlock = {
      id: 'tb10',
      type: 'text',
      order: 0,
      content: 'x',
      style: { padding: '10px 30px' },
    };
    const { container } = render(
      <BlockStyleWrapper block={block}>
        <span>content</span>
      </BlockStyleWrapper>,
    );
    const el = container.querySelector('div') as HTMLElement;
    expect(el.style.paddingTop).toBe('10px');
    expect(el.style.paddingBottom).toBe('10px');
    expect(el.style.paddingRight).toBe('30px');
    expect(el.style.paddingLeft).toBe('30px');
  });

  it('three-token shorthand expands correctly (top, h, bottom)', () => {
    const block: TextBlock = {
      id: 'tb11',
      type: 'text',
      order: 0,
      content: 'x',
      style: { margin: '10px 20px 30px' },
    };
    const { container } = render(
      <BlockStyleWrapper block={block}>
        <span>content</span>
      </BlockStyleWrapper>,
    );
    const el = container.querySelector('div') as HTMLElement;
    expect(el.style.marginTop).toBe('10px');
    expect(el.style.marginRight).toBe('20px');
    expect(el.style.marginLeft).toBe('20px');
    expect(el.style.marginBottom).toBe('30px');
  });

  it('all four sides responsive: no static margin in inline style', () => {
    const block: TextBlock = {
      id: 'tb12',
      type: 'text',
      order: 0,
      content: 'x',
      style: { margin: '10px 20px 30px 40px' },
      responsive: {
        marginTop: { desktop: '1rem' },
        marginRight: { desktop: '2rem' },
        marginBottom: { desktop: '3rem' },
        marginLeft: { desktop: '4rem' },
      },
    };
    const { container } = render(
      <BlockStyleWrapper block={block}>
        <span>content</span>
      </BlockStyleWrapper>,
    );
    const el = container.querySelector('div') as HTMLElement;
    expect(el.style.marginTop).toBe('');
    expect(el.style.marginRight).toBe('');
    expect(el.style.marginBottom).toBe('');
    expect(el.style.marginLeft).toBe('');
    const inline = el.getAttribute('style') ?? '';
    expect(inline).not.toMatch(/margin-top/);
    expect(inline).not.toMatch(/margin-right/);
    expect(inline).not.toMatch(/margin-bottom/);
    expect(inline).not.toMatch(/margin-left/);
  });
});

describe('parseShorthandSide', () => {
  it('returns null for empty/undefined input', () => {
    expect(parseShorthandSide(undefined, 'top')).toBeNull();
    expect(parseShorthandSide('', 'top')).toBeNull();
    expect(parseShorthandSide('   ', 'top')).toBeNull();
  });

  it('1 token: applies to all sides', () => {
    expect(parseShorthandSide('5px', 'top')).toBe('5px');
    expect(parseShorthandSide('5px', 'right')).toBe('5px');
    expect(parseShorthandSide('5px', 'bottom')).toBe('5px');
    expect(parseShorthandSide('5px', 'left')).toBe('5px');
  });

  it('2 tokens: vertical / horizontal', () => {
    expect(parseShorthandSide('10px 20px', 'top')).toBe('10px');
    expect(parseShorthandSide('10px 20px', 'bottom')).toBe('10px');
    expect(parseShorthandSide('10px 20px', 'right')).toBe('20px');
    expect(parseShorthandSide('10px 20px', 'left')).toBe('20px');
  });

  it('3 tokens: top, horizontal, bottom', () => {
    expect(parseShorthandSide('10px 20px 30px', 'top')).toBe('10px');
    expect(parseShorthandSide('10px 20px 30px', 'right')).toBe('20px');
    expect(parseShorthandSide('10px 20px 30px', 'left')).toBe('20px');
    expect(parseShorthandSide('10px 20px 30px', 'bottom')).toBe('30px');
  });

  it('4 tokens: top, right, bottom, left', () => {
    expect(parseShorthandSide('10px 20px 30px 40px', 'top')).toBe('10px');
    expect(parseShorthandSide('10px 20px 30px 40px', 'right')).toBe('20px');
    expect(parseShorthandSide('10px 20px 30px 40px', 'bottom')).toBe('30px');
    expect(parseShorthandSide('10px 20px 30px 40px', 'left')).toBe('40px');
  });

  it('handles units other than px (rem/%/auto)', () => {
    expect(parseShorthandSide('1rem 5%', 'top')).toBe('1rem');
    expect(parseShorthandSide('1rem 5%', 'right')).toBe('5%');
    expect(parseShorthandSide('auto', 'left')).toBe('auto');
  });

  it('collapses multiple spaces between tokens', () => {
    expect(parseShorthandSide('10px    20px', 'right')).toBe('20px');
  });
});

// Per-block-type smoke test: every block type that touches responsive
// margin/padding through the universal wrapper must emit the same CSS,
// regardless of the renderer attached to it. We test the wrapper directly
// (not through BlockRenderer) so this is fast and rerunnable in CI.
describe('BlockStyleWrapper — applies to common block types', () => {
  const types: Array<Block['type']> = [
    'text', 'heading', 'image', 'button', 'spacer', 'divider', 'quote',
    'code', 'video', 'youtube', 'columns', 'tabs', 'accordion', 'hero',
    'cta', 'testimonial', 'stats', 'card-grid', 'section', 'gallery',
    'metric-cards', 'flip-card-grid', 'logo-strip', 'bento-grid',
    'team-showcase', 'timeline',
  ];

  for (const type of types) {
    it(`type=${type}: responsive marginTop renders into <style>`, () => {
      const block = {
        id: `b-${type}`,
        type,
        order: 0,
        content: 'x',
        responsive: { marginTop: { desktop: '42px' } },
      } as unknown as Block;
      const { container } = render(
        <BlockStyleWrapper block={block}>
          <span>x</span>
        </BlockStyleWrapper>,
      );
      const styleTag = container.querySelector('style');
      expect(styleTag, `${type}: <style> tag missing`).not.toBeNull();
      expect(styleTag!.innerHTML, `${type}: marginTop 42px not in CSS`).toContain('margin-top: 42px');
    });
  }
});
