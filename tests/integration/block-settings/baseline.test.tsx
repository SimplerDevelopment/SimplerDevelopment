// Baseline harness: lock in BlockSettings panel UI before refactor.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BlockSettings } from '@/components/blocks/visual/BlockSettings';
import type { Block, HeadingBlock, ImageBlock, ButtonBlock, ColumnsBlock } from '@/types/blocks';

// Stub network calls — MediaPicker (image block) calls /api/media on mount.
beforeAll(() => {
  if (typeof window !== 'undefined') {
    // @ts-expect-error — jsdom doesn't ship fetch; we just stub the calls
    window.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { items: [], pagination: { total: 0, limit: 24, offset: 0 } } }),
    }));
  }
});

const baseProps = {
  currentViewport: 'desktop' as const,
};

describe('BlockSettings baseline', () => {
  it('renders heading-level selector for a heading block', () => {
    const block: HeadingBlock = {
      id: 'h1',
      type: 'heading',
      content: 'Hello',
      level: 2,
      order: 1,
    };
    const onChange = vi.fn();

    render(<BlockSettings block={block as Block} onChange={onChange} {...baseProps} />);

    // The heading-level <select> is rendered with H1..H6 options.
    expect(screen.getByText('Heading Level')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'H1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'H6' })).toBeInTheDocument();
  });

  it('fires onChange when heading level changes', () => {
    const block: HeadingBlock = {
      id: 'h1',
      type: 'heading',
      content: 'Hello',
      level: 2,
      order: 1,
    };
    const onChange = vi.fn();

    const { container } = render(<BlockSettings block={block as Block} onChange={onChange} {...baseProps} />);

    // First <select> in the General tab is the heading-level picker.
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select).not.toBeNull();
    fireEvent.change(select, { target: { value: '3' } });

    expect(onChange).toHaveBeenCalled();
    const call = onChange.mock.calls[0][0];
    expect(call.level).toBe(3);
  });

  it('renders alt-text input for an image block', () => {
    const block: ImageBlock = {
      id: 'i1',
      type: 'image',
      url: 'https://example.com/img.png',
      alt: 'Example',
      order: 1,
    };
    const onChange = vi.fn();

    render(<BlockSettings block={block as Block} onChange={onChange} {...baseProps} />);

    // Alt-text input is present and seeded with current value.
    const altInput = screen.getByDisplayValue('Example') as HTMLInputElement;
    expect(altInput).toBeInTheDocument();
    expect(altInput.tagName).toBe('INPUT');
  });

  it('renders text/url inputs for a button block', () => {
    const block: ButtonBlock = {
      id: 'b1',
      type: 'button',
      text: 'Click me',
      url: 'https://example.com',
      order: 1,
    };
    const onChange = vi.fn();

    render(<BlockSettings block={block as Block} onChange={onChange} {...baseProps} />);

    expect(screen.getByDisplayValue('Click me')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://example.com')).toBeInTheDocument();
  });

  it('shows column count for a columns layout block', () => {
    const block: ColumnsBlock = {
      id: 'c1',
      type: 'columns',
      order: 1,
      columns: [
        { id: 'col-a', width: 50, blocks: [] },
        { id: 'col-b', width: 50, blocks: [] },
      ],
    };
    const onChange = vi.fn();

    render(<BlockSettings block={block as Block} onChange={onChange} {...baseProps} />);

    // Layout summary lives in the General tab and reads "<n> columns".
    expect(screen.getByText('2 columns')).toBeInTheDocument();
    expect(screen.getByText('Gap Between Columns')).toBeInTheDocument();
  });
});
