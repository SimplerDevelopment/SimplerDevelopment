import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BlockStyleWrapper } from '@/components/blocks/render/BlockStyleWrapper';
import type { TextBlock } from '@/types/blocks';

function makeBlock(style: TextBlock['style']): TextBlock {
  return {
    id: 'b1',
    type: 'text',
    order: 0,
    content: 'hi',
    style,
  };
}

describe('BlockStyleWrapper — brand sentinel resolution', () => {
  it('resolves brand.primary backgroundColor to var(--brand-primary)', () => {
    const { container } = render(
      <BlockStyleWrapper block={makeBlock({ backgroundColor: 'brand.primary' })}>
        <span>content</span>
      </BlockStyleWrapper>,
    );
    const wrapper = container.querySelector('div');
    expect(wrapper?.getAttribute('style')).toContain('var(--brand-primary)');
  });

  it('resolves brand.text color to var(--brand-text)', () => {
    const { container } = render(
      <BlockStyleWrapper block={makeBlock({ color: 'brand.text' })}>
        <span>content</span>
      </BlockStyleWrapper>,
    );
    const wrapper = container.querySelector('div');
    expect(wrapper?.getAttribute('style')).toContain('var(--brand-text)');
  });

  it('resolves brand.accent borderColor to var(--brand-accent)', () => {
    const { container } = render(
      <BlockStyleWrapper block={makeBlock({ borderColor: 'brand.accent', borderWidth: '1px' })}>
        <span>content</span>
      </BlockStyleWrapper>,
    );
    const wrapper = container.querySelector('div');
    expect(wrapper?.getAttribute('style')).toContain('var(--brand-accent)');
  });

  it('resolves brand.radius borderRadius to var(--brand-border-radius)', () => {
    const { container } = render(
      <BlockStyleWrapper block={makeBlock({ borderRadius: 'brand.radius' })}>
        <span>content</span>
      </BlockStyleWrapper>,
    );
    const wrapper = container.querySelector('div');
    expect(wrapper?.getAttribute('style')).toContain('var(--brand-border-radius)');
  });

  it('resolves brand font sentinel to var(--brand-heading-font, sans-serif)', () => {
    const { container } = render(
      <BlockStyleWrapper block={makeBlock({ fontFamily: 'brand.headingFont' })}>
        <span>content</span>
      </BlockStyleWrapper>,
    );
    const wrapper = container.querySelector('div');
    expect(wrapper?.getAttribute('style')).toContain('var(--brand-heading-font');
    // Should NOT load a Google Font link — sentinel uses CSS var only
    expect(container.querySelector('link[rel="stylesheet"]')).toBeNull();
  });

  it('leaves literal hex colors untouched', () => {
    const { container } = render(
      <BlockStyleWrapper block={makeBlock({ backgroundColor: '#ff0000' })}>
        <span>content</span>
      </BlockStyleWrapper>,
    );
    const wrapper = container.querySelector('div');
    const style = wrapper?.getAttribute('style') || '';
    expect(style).toContain('rgb(255, 0, 0)'); // jsdom normalizes #ff0000
    expect(style).not.toContain('var(--brand');
  });

  it('loads Google Font link for raw font names', () => {
    const { container } = render(
      <BlockStyleWrapper block={makeBlock({ fontFamily: 'Inter' })}>
        <span>content</span>
      </BlockStyleWrapper>,
    );
    const link = container.querySelector('link[rel="stylesheet"]');
    expect(link?.getAttribute('href')).toContain('family=Inter');
  });
});
