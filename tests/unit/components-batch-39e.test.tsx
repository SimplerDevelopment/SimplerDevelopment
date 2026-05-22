// @vitest-environment jsdom
/**
 * Unit tests for 4 small block render components (batch 39e):
 *
 *   - SocialLinksBlockRender  (components/blocks/render/SocialLinksBlockRender.tsx)
 *   - VideoBlockRender        (components/blocks/render/VideoBlockRender.tsx)
 *   - StatsBlockRender        (components/blocks/render/StatsBlockRender.tsx)
 *   - YoutubeBlockRender      (components/blocks/render/YoutubeBlockRender.tsx)
 *
 * These are pure presentational client components. They take a single `block`
 * prop and return JSX with no router, fetch, or server-only imports. We render
 * each with @testing-library/react in jsdom and assert against the produced DOM.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { SocialLinksBlockRender } from '@/components/blocks/render/SocialLinksBlockRender';
import { VideoBlockRender } from '@/components/blocks/render/VideoBlockRender';
import { StatsBlockRender } from '@/components/blocks/render/StatsBlockRender';
import { YoutubeBlockRender } from '@/components/blocks/render/YoutubeBlockRender';

// Loose any-cast factory helpers — the type union for blocks is sprawling and
// these tests only need to confirm runtime DOM output for the discriminant +
// a few optional fields. Strict typing here would just add noise.
function makeSocial(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sl1',
    type: 'social-links',
    order: 0,
    ...overrides,
  } as unknown as Parameters<typeof SocialLinksBlockRender>[0]['block'];
}

function makeVideo(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    type: 'video',
    order: 0,
    ...overrides,
  } as unknown as Parameters<typeof VideoBlockRender>[0]['block'];
}

function makeStats(overrides: Record<string, unknown> = {}) {
  return {
    id: 'st1',
    type: 'stats',
    order: 0,
    ...overrides,
  } as unknown as Parameters<typeof StatsBlockRender>[0]['block'];
}

function makeYoutube(overrides: Record<string, unknown> = {}) {
  return {
    id: 'yt1',
    type: 'youtube',
    order: 0,
    ...overrides,
  } as unknown as Parameters<typeof YoutubeBlockRender>[0]['block'];
}

describe('SocialLinksBlockRender', () => {
  it('renders one anchor per link with target=_blank and aria-label', () => {
    const block = makeSocial({
      links: [
        { platform: 'twitter', url: 'https://x.com/foo' },
        { platform: 'linkedin', url: 'https://linkedin.com/in/foo' },
      ],
    });
    const { container } = render(<SocialLinksBlockRender block={block} />);
    const anchors = container.querySelectorAll('a');
    expect(anchors.length).toBe(2);
    expect(anchors[0].getAttribute('href')).toBe('https://x.com/foo');
    expect(anchors[0].getAttribute('target')).toBe('_blank');
    expect(anchors[0].getAttribute('rel')).toBe('noopener noreferrer');
    // Twitter maps to the friendly label "X (Twitter)".
    expect(anchors[0].getAttribute('aria-label')).toBe('X (Twitter)');
    expect(anchors[1].getAttribute('aria-label')).toBe('LinkedIn');
  });

  it.each([
    ['left', 'justify-start'],
    ['center', 'justify-center'],
    ['right', 'justify-end'],
  ] as const)('aligns the link row via %s -> %s', (alignment, expected) => {
    const { container } = render(
      <SocialLinksBlockRender block={makeSocial({ alignment, links: [] })} />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain(expected);
  });

  it('defaults to center alignment when alignment is omitted', () => {
    const { container } = render(
      <SocialLinksBlockRender block={makeSocial({ links: [] })} />,
    );
    expect((container.firstChild as HTMLElement).className).toContain(
      'justify-center',
    );
  });

  it('falls back to the raw platform string for unknown platforms', () => {
    const block = makeSocial({
      links: [{ platform: 'mastodon', url: 'https://mas.to/@foo' }],
    });
    const { container } = render(<SocialLinksBlockRender block={block} />);
    const anchor = container.querySelector('a');
    expect(anchor!.getAttribute('aria-label')).toBe('mastodon');
  });

  it('renders an empty wrapper when no links are provided', () => {
    const { container } = render(
      <SocialLinksBlockRender block={makeSocial()} />,
    );
    expect(container.querySelectorAll('a').length).toBe(0);
    expect(container.firstChild).toBeTruthy();
  });
});

describe('VideoBlockRender', () => {
  it('renders a <video> element with src + default controls when url is set', () => {
    const { container } = render(
      <VideoBlockRender
        block={makeVideo({ url: 'https://cdn.example.com/clip.mp4' })}
      />,
    );
    const video = container.querySelector('video');
    expect(video).toBeTruthy();
    expect(video!.getAttribute('src')).toBe('https://cdn.example.com/clip.mp4');
    // controls defaults to true (i.e. omitted/true -> present)
    expect(video!.hasAttribute('controls')).toBe(true);
  });

  it('omits <video> entirely when no url is provided', () => {
    const { container } = render(<VideoBlockRender block={makeVideo()} />);
    expect(container.querySelector('video')).toBeNull();
  });

  it('disables controls when controls=false', () => {
    const { container } = render(
      <VideoBlockRender
        block={makeVideo({ url: 'foo.mp4', controls: false })}
      />,
    );
    const video = container.querySelector('video');
    expect(video!.hasAttribute('controls')).toBe(false);
  });

  it('renders a caption paragraph when caption is set', () => {
    const { container } = render(
      <VideoBlockRender
        block={makeVideo({ url: 'foo.mp4', caption: 'A short clip.' })}
      />,
    );
    const caption = container.querySelector('p');
    expect(caption).toBeTruthy();
    expect(caption!.textContent).toBe('A short clip.');
  });

  it('omits the caption paragraph when caption is absent', () => {
    const { container } = render(
      <VideoBlockRender block={makeVideo({ url: 'foo.mp4' })} />,
    );
    expect(container.querySelector('p')).toBeNull();
  });
});

describe('StatsBlockRender', () => {
  it('renders one stat per entry with value and label', () => {
    const block = makeStats({
      stats: [
        { id: 'a', value: '100+', label: 'Customers' },
        { id: 'b', value: '24/7', label: 'Support' },
      ],
    });
    const { container } = render(<StatsBlockRender block={block} />);
    const text = container.textContent ?? '';
    expect(text).toContain('100+');
    expect(text).toContain('Customers');
    expect(text).toContain('24/7');
    expect(text).toContain('Support');
  });

  it('uses md:grid-cols-2 when columns=2', () => {
    const { container } = render(
      <StatsBlockRender block={makeStats({ columns: 2, stats: [] })} />,
    );
    const grid = container.querySelector('.grid');
    expect(grid).toBeTruthy();
    expect(grid!.className).toContain('md:grid-cols-2');
  });

  it('defaults to a 3-column layout when columns is omitted', () => {
    const { container } = render(
      <StatsBlockRender block={makeStats({ stats: [] })} />,
    );
    const grid = container.querySelector('.grid');
    expect(grid!.className).toContain('lg:grid-cols-3');
  });

  it('uses lg:grid-cols-4 when columns=4', () => {
    const { container } = render(
      <StatsBlockRender block={makeStats({ columns: 4, stats: [] })} />,
    );
    const grid = container.querySelector('.grid');
    expect(grid!.className).toContain('lg:grid-cols-4');
  });

  it('renders the title via dangerouslySetInnerHTML when set', () => {
    const { container } = render(
      <StatsBlockRender
        block={makeStats({
          title: 'Numbers <em>that</em> matter',
          stats: [],
        })}
      />,
    );
    const h2 = container.querySelector('h2');
    expect(h2).toBeTruthy();
    expect(h2!.querySelector('em')).toBeTruthy();
    expect(h2!.getAttribute('data-editable-field')).toBe('title');
  });

  it('omits the title heading when title is absent', () => {
    const { container } = render(
      <StatsBlockRender block={makeStats({ stats: [] })} />,
    );
    expect(container.querySelector('h2')).toBeNull();
  });

  it('falls back to a stable key when stat.id is missing (no React warning)', () => {
    // Two id-less stats — older LLM-authored decks omit ids; the renderer
    // backfills `stat-${i}` to keep React happy.
    const block = makeStats({
      stats: [
        { value: '1', label: 'one' },
        { value: '2', label: 'two' },
      ],
    });
    const { container } = render(<StatsBlockRender block={block} />);
    expect(container.textContent).toContain('one');
    expect(container.textContent).toContain('two');
  });
});

describe('YoutubeBlockRender', () => {
  it('embeds youtube.com/watch?v=ID by mapping to /embed/ID', () => {
    const { container } = render(
      <YoutubeBlockRender
        block={makeYoutube({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })}
      />,
    );
    const iframe = container.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe!.getAttribute('src')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    );
  });

  it('strips ?t= query suffix from watch URLs', () => {
    const { container } = render(
      <YoutubeBlockRender
        block={makeYoutube({
          url: 'https://www.youtube.com/watch?v=abc123&t=42s',
        })}
      />,
    );
    const iframe = container.querySelector('iframe');
    expect(iframe!.getAttribute('src')).toBe(
      'https://www.youtube.com/embed/abc123',
    );
  });

  it('embeds youtu.be/ID short links', () => {
    const { container } = render(
      <YoutubeBlockRender
        block={makeYoutube({ url: 'https://youtu.be/short42' })}
      />,
    );
    const iframe = container.querySelector('iframe');
    expect(iframe!.getAttribute('src')).toBe(
      'https://www.youtube.com/embed/short42',
    );
  });

  it('strips ?query suffix from youtu.be short links', () => {
    const { container } = render(
      <YoutubeBlockRender
        block={makeYoutube({ url: 'https://youtu.be/short42?si=ABC' })}
      />,
    );
    const iframe = container.querySelector('iframe');
    expect(iframe!.getAttribute('src')).toBe(
      'https://www.youtube.com/embed/short42',
    );
  });

  it('passes through an already-embed URL untouched', () => {
    const { container } = render(
      <YoutubeBlockRender
        block={makeYoutube({
          url: 'https://www.youtube.com/embed/preformatted',
        })}
      />,
    );
    const iframe = container.querySelector('iframe');
    expect(iframe!.getAttribute('src')).toBe(
      'https://www.youtube.com/embed/preformatted',
    );
  });

  it('treats a bare video ID as an embed URL suffix', () => {
    const { container } = render(
      <YoutubeBlockRender block={makeYoutube({ url: 'bareId' })} />,
    );
    const iframe = container.querySelector('iframe');
    expect(iframe!.getAttribute('src')).toBe(
      'https://www.youtube.com/embed/bareId',
    );
  });

  it('omits the iframe entirely when url is absent', () => {
    const { container } = render(<YoutubeBlockRender block={makeYoutube()} />);
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('renders a caption paragraph when caption is set', () => {
    const { container } = render(
      <YoutubeBlockRender
        block={makeYoutube({ url: 'https://youtu.be/x', caption: 'Watch this' })}
      />,
    );
    const caption = container.querySelector('p');
    expect(caption).toBeTruthy();
    expect(caption!.textContent).toBe('Watch this');
  });
});
