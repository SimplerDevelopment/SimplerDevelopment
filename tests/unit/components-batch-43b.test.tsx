// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

import type {
  HeadingBlock,
  QuoteBlock,
  VideoBlock,
  YoutubeBlock,
} from '@/types/blocks';

import { HeadingBlockPreview } from '@/components/blocks/visual/HeadingBlockPreview';
import { QuoteBlockPreview } from '@/components/blocks/visual/QuoteBlockPreview';
import { VideoBlockPreview } from '@/components/blocks/visual/VideoBlockPreview';
import { YoutubeBlockPreview } from '@/components/blocks/visual/YoutubeBlockPreview';

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// HeadingBlockPreview
// ---------------------------------------------------------------------------
describe('HeadingBlockPreview', () => {
  function makeBlock(overrides: Partial<HeadingBlock> = {}): HeadingBlock {
    return {
      id: 'h1',
      type: 'heading',
      order: 0,
      content: 'Hello world',
      level: 2,
      ...overrides,
    };
  }

  it('renders the correct heading tag for each level', () => {
    for (const lvl of [1, 2, 3, 4, 5, 6] as const) {
      const { container, unmount } = render(
        <HeadingBlockPreview
          block={makeBlock({ level: lvl, content: `lv${lvl}` })}
          isSelected={false}
          onChange={vi.fn()}
        />,
      );
      const tag = container.querySelector(`h${lvl}`);
      expect(tag).toBeTruthy();
      // After mount effect, ContentEditable injects html into the element
      expect(tag?.innerHTML).toBe(`lv${lvl}`);
      unmount();
    }
  });

  it('applies the matching size + weight classes for each level', () => {
    const expected: Record<number, string> = {
      1: 'text-4xl',
      2: 'text-3xl',
      3: 'text-2xl',
      4: 'text-xl',
      5: 'text-lg',
      6: 'text-base',
    };
    for (const lvl of [1, 2, 3, 4, 5, 6] as const) {
      const { container, unmount } = render(
        <HeadingBlockPreview
          block={makeBlock({ level: lvl })}
          isSelected={false}
          onChange={vi.fn()}
        />,
      );
      const tag = container.querySelector(`h${lvl}`) as HTMLElement;
      expect(tag.className).toContain(expected[lvl]);
      unmount();
    }
  });

  it('applies left alignment by default and overrides when set', () => {
    const { container, rerender } = render(
      <HeadingBlockPreview
        block={makeBlock({ alignment: undefined })}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    expect(container.querySelector('h2')!.className).toContain('text-left');

    rerender(
      <HeadingBlockPreview
        block={makeBlock({ alignment: 'center' })}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    expect(container.querySelector('h2')!.className).toContain('text-center');

    rerender(
      <HeadingBlockPreview
        block={makeBlock({ alignment: 'right' })}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    expect(container.querySelector('h2')!.className).toContain('text-right');
  });

  it('uses text-foreground when no custom style.color is set', () => {
    const { container } = render(
      <HeadingBlockPreview
        block={makeBlock()}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    expect(container.querySelector('h2')!.className).toContain('text-foreground');
  });

  it('omits text-foreground when block.style.color is provided', () => {
    const { container } = render(
      <HeadingBlockPreview
        block={makeBlock({ style: { color: '#ff0000' } })}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    expect(container.querySelector('h2')!.className).not.toContain('text-foreground');
  });

  it('forwards edits to onChange when the contentEditable receives input', () => {
    const onChange = vi.fn();
    const { container } = render(
      <HeadingBlockPreview
        block={makeBlock({ content: 'initial' })}
        isSelected={false}
        onChange={onChange}
      />,
    );
    const h2 = container.querySelector('h2') as HTMLElement;
    h2.innerHTML = 'edited heading';
    fireEvent.input(h2);
    expect(onChange).toHaveBeenCalledWith({ content: 'edited heading' });
  });
});

// ---------------------------------------------------------------------------
// QuoteBlockPreview
// ---------------------------------------------------------------------------
describe('QuoteBlockPreview', () => {
  function makeBlock(overrides: Partial<QuoteBlock> = {}): QuoteBlock {
    return {
      id: 'q1',
      type: 'quote',
      order: 0,
      content: 'Be kind.',
      ...overrides,
    };
  }

  it('renders a blockquote with the quote content', () => {
    const { container } = render(
      <QuoteBlockPreview
        block={makeBlock()}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    const bq = container.querySelector('blockquote');
    expect(bq).toBeTruthy();
    // ContentEditable injects html via effect after mount
    const editable = bq!.querySelector('[contenteditable]') as HTMLElement;
    expect(editable.innerHTML).toBe('Be kind.');
  });

  it('renders the curly opening + closing quote marks', () => {
    const { container } = render(
      <QuoteBlockPreview
        block={makeBlock()}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    expect(container.textContent).toContain('“');
    expect(container.textContent).toContain('”');
  });

  it('omits the footer entirely when neither author nor citation are provided', () => {
    const { container } = render(
      <QuoteBlockPreview
        block={makeBlock()}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    expect(container.querySelector('footer')).toBeNull();
    expect(container.querySelector('cite')).toBeNull();
  });

  it('renders the author when provided', () => {
    const { container } = render(
      <QuoteBlockPreview
        block={makeBlock({ author: 'Ada Lovelace' })}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    const cite = container.querySelector('cite');
    expect(cite).toBeTruthy();
    expect(cite!.textContent).toContain('Ada Lovelace');
    expect(container.textContent).toContain('—'); // em-dash
  });

  it('renders the citation when provided, even without an author', () => {
    const { container } = render(
      <QuoteBlockPreview
        block={makeBlock({ citation: 'Notes on Babbage' })}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    expect(container.querySelector('footer')).toBeTruthy();
    expect(container.textContent).toContain('Notes on Babbage');
    // No author, so cite element should not appear
    expect(container.querySelector('cite')).toBeNull();
  });

  it('uses default font size and muted color when no custom style is set', () => {
    const { container } = render(
      <QuoteBlockPreview
        block={makeBlock()}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    const bq = container.querySelector('blockquote') as HTMLElement;
    expect(bq.className).toContain('text-lg');
    expect(bq.className).toContain('text-muted-foreground');
  });

  it('drops default font size when style.fontSize is provided', () => {
    const { container } = render(
      <QuoteBlockPreview
        block={makeBlock({ style: { fontSize: '24px' } })}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    const bq = container.querySelector('blockquote') as HTMLElement;
    expect(bq.className).not.toContain('text-lg');
  });

  it('forwards edits via onChange when the editable region receives input', () => {
    const onChange = vi.fn();
    const { container } = render(
      <QuoteBlockPreview
        block={makeBlock()}
        isSelected={false}
        onChange={onChange}
      />,
    );
    const editable = container.querySelector('[contenteditable]') as HTMLElement;
    editable.innerHTML = 'new quote';
    fireEvent.input(editable);
    expect(onChange).toHaveBeenCalledWith({ content: 'new quote' });
  });
});

// ---------------------------------------------------------------------------
// VideoBlockPreview
// ---------------------------------------------------------------------------
describe('VideoBlockPreview', () => {
  function makeBlock(overrides: Partial<VideoBlock> = {}): VideoBlock {
    return {
      id: 'v1',
      type: 'video',
      order: 0,
      url: '',
      ...overrides,
    };
  }

  it('renders the empty-state placeholder when url is missing', () => {
    const { container } = render(
      <VideoBlockPreview
        block={makeBlock()}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    expect(container.textContent).toContain('No video URL provided');
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('.material-icons')?.textContent).toBe('movie');
  });

  it('renders a <video> tag with the url when url is set', () => {
    const { container } = render(
      <VideoBlockPreview
        block={makeBlock({ url: 'https://cdn.example/clip.mp4' })}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    const v = container.querySelector('video') as HTMLVideoElement;
    expect(v).toBeTruthy();
    expect(v.getAttribute('src')).toBe('https://cdn.example/clip.mp4');
  });

  it('defaults controls to true when not specified', () => {
    const { container } = render(
      <VideoBlockPreview
        block={makeBlock({ url: 'a.mp4' })}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    const v = container.querySelector('video') as HTMLVideoElement;
    expect(v.controls).toBe(true);
  });

  it('respects controls=false', () => {
    const { container } = render(
      <VideoBlockPreview
        block={makeBlock({ url: 'a.mp4', controls: false })}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    const v = container.querySelector('video') as HTMLVideoElement;
    expect(v.controls).toBe(false);
  });

  it('defaults autoplay to false', () => {
    const { container } = render(
      <VideoBlockPreview
        block={makeBlock({ url: 'a.mp4' })}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    const v = container.querySelector('video') as HTMLVideoElement;
    expect(v.autoplay).toBe(false);
  });

  it('respects autoplay=true', () => {
    const { container } = render(
      <VideoBlockPreview
        block={makeBlock({ url: 'a.mp4', autoplay: true })}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    const v = container.querySelector('video') as HTMLVideoElement;
    expect(v.autoplay).toBe(true);
  });

  it('renders a caption when provided', () => {
    const { container } = render(
      <VideoBlockPreview
        block={makeBlock({ url: 'a.mp4', caption: 'A cool clip' })}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    expect(container.textContent).toContain('A cool clip');
  });

  it('omits the caption paragraph when caption is empty', () => {
    const { container } = render(
      <VideoBlockPreview
        block={makeBlock({ url: 'a.mp4' })}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    // No "italic" caption <p> should be there
    const ps = container.querySelectorAll('p');
    for (const p of Array.from(ps)) {
      expect(p.className).not.toContain('italic');
    }
  });
});

// ---------------------------------------------------------------------------
// YoutubeBlockPreview
// ---------------------------------------------------------------------------
describe('YoutubeBlockPreview', () => {
  function makeBlock(overrides: Partial<YoutubeBlock> = {}): YoutubeBlock {
    return {
      id: 'y1',
      type: 'youtube',
      order: 0,
      url: '',
      ...overrides,
    };
  }

  it('renders the empty-state when url is missing', () => {
    const { container } = render(
      <YoutubeBlockPreview
        block={makeBlock()}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    expect(container.textContent).toContain('No YouTube URL provided');
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('.material-icons')?.textContent).toBe(
      'smart_display',
    );
  });

  it('embeds a youtube.com/watch?v= URL via /embed/<id>', () => {
    const { container } = render(
      <YoutubeBlockPreview
        block={makeBlock({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    expect(iframe.getAttribute('src')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    );
  });

  it('strips extra query params from a watch?v= URL', () => {
    const { container } = render(
      <YoutubeBlockPreview
        block={makeBlock({
          url: 'https://www.youtube.com/watch?v=abc123&t=42s',
        })}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe(
      'https://www.youtube.com/embed/abc123',
    );
  });

  it('embeds a youtu.be/<id> short URL', () => {
    const { container } = render(
      <YoutubeBlockPreview
        block={makeBlock({ url: 'https://youtu.be/xyz789?si=foo' })}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe(
      'https://www.youtube.com/embed/xyz789',
    );
  });

  it('passes through an already-embed URL unchanged', () => {
    const { container } = render(
      <YoutubeBlockPreview
        block={makeBlock({ url: 'https://www.youtube.com/embed/preformed' })}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe(
      'https://www.youtube.com/embed/preformed',
    );
  });

  it('treats a bare token as a video id', () => {
    const { container } = render(
      <YoutubeBlockPreview
        block={makeBlock({ url: 'rawId' })}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe(
      'https://www.youtube.com/embed/rawId',
    );
  });

  it('renders a caption when provided alongside an iframe', () => {
    const { container } = render(
      <YoutubeBlockPreview
        block={makeBlock({
          url: 'https://www.youtube.com/watch?v=zz',
          caption: 'Demo clip',
        })}
        isSelected={false}
        onChange={vi.fn()}
      />,
    );
    expect(container.textContent).toContain('Demo clip');
  });
});
