// Coverage for the ContentPanel slice that handles `heading` blocks.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContentPanel } from '@/components/blocks/visual/block-settings/panels/ContentPanel';
import type { Block, HeadingBlock } from '@/types/blocks';

const baseProps = {
  currentViewport: 'desktop' as const,
};

describe('ContentPanel — heading', () => {
  it('renders heading-level select with H1..H6', () => {
    const block: HeadingBlock = {
      id: 'h1',
      type: 'heading',
      content: 'Hello',
      level: 3,
      order: 1,
    };
    const onChange = vi.fn();

    render(<ContentPanel block={block as Block} onChange={onChange} {...baseProps} />);

    expect(screen.getByText('Heading Level')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'H1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'H6' })).toBeInTheDocument();
  });

  it('emits typed level on change', () => {
    const block: HeadingBlock = {
      id: 'h1',
      type: 'heading',
      content: 'Hello',
      level: 2,
      order: 1,
    };
    const onChange = vi.fn();

    const { container } = render(<ContentPanel block={block as Block} onChange={onChange} {...baseProps} />);

    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '4' } });
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls[0][0].level).toBe(4);
  });

  it('renders nothing for an unrelated block type', () => {
    const block: Block = {
      id: 'b1',
      type: 'image',
      url: '',
      alt: '',
      order: 1,
    } as Block;
    const onChange = vi.fn();
    const { container } = render(<ContentPanel block={block} onChange={onChange} {...baseProps} />);
    // No content panel slice handles 'image'; expect empty render.
    expect(container.querySelector('select')).toBeNull();
  });
});
