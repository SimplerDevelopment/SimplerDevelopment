// Coverage for MediaPanel — image and video block routing.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MediaPanel } from '@/components/blocks/visual/block-settings/panels/MediaPanel';
import type { Block, ImageBlock, VideoBlock } from '@/types/blocks';

beforeAll(() => {
  if (typeof window !== 'undefined') {
    // @ts-expect-error — jsdom doesn't ship fetch
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

describe('MediaPanel', () => {
  it('renders the image-block alt-text input', () => {
    const block: ImageBlock = {
      id: 'i1',
      type: 'image',
      url: 'https://example.com/i.png',
      alt: 'My pic',
      order: 1,
    };
    const onChange = vi.fn();
    render(<MediaPanel block={block as Block} onChange={onChange} {...baseProps} />);
    expect(screen.getByDisplayValue('My pic')).toBeInTheDocument();
  });

  it('emits alt updates from the image-block input', () => {
    const block: ImageBlock = {
      id: 'i1',
      type: 'image',
      url: 'https://example.com/i.png',
      alt: 'Old',
      order: 1,
    };
    const onChange = vi.fn();
    render(<MediaPanel block={block as Block} onChange={onChange} {...baseProps} />);

    const altInput = screen.getByDisplayValue('Old') as HTMLInputElement;
    fireEvent.change(altInput, { target: { value: 'New alt' } });
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls[0][0]).toMatchObject({ alt: 'New alt' });
  });

  it('renders the video-block panel with autoplay/controls toggles', () => {
    const block: VideoBlock = {
      id: 'v1',
      type: 'video',
      url: 'https://example.com/v.mp4',
      order: 1,
    } as VideoBlock;
    const onChange = vi.fn();
    render(<MediaPanel block={block as Block} onChange={onChange} {...baseProps} />);
    // Video panel renders its own preview + Autoplay / Show Controls checkboxes.
    expect(screen.getByLabelText('Autoplay')).toBeInTheDocument();
    expect(screen.getByLabelText('Show Controls')).toBeInTheDocument();
  });

  it('renders nothing for a block type outside the media category', () => {
    const block: Block = {
      id: 'h1',
      type: 'heading',
      content: 'x',
      level: 2,
      order: 1,
    } as Block;
    const onChange = vi.fn();
    const { container } = render(<MediaPanel block={block} onChange={onChange} {...baseProps} />);
    // MediaPanel only handles media types; heading should fall through to null.
    expect(container.firstChild).toBeNull();
  });
});
