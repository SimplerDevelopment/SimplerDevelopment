/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment, react-hooks/rules-of-hooks, @typescript-eslint/no-require-imports */
// @vitest-environment jsdom
/**
 * Batch 44h — visual-editor preview and runtime renderer components.
 *
 * Four medium-sized React components covering both the editor-canvas preview
 * variants ("…BlockPreview") and the production runtime renderers
 * ("…BlockRender"). Each component is self-contained — the only external
 * dependency outside React is `getElementCSS` (a pure utility that converts
 * `elementStyles` to inline CSS) and, for `HtmlEmbedBlockRender`, the
 * `combineResponsiveClasses` util. Tests exercise both empty-state branches
 * and content-bearing branches.
 *
 * Components covered:
 *   - MarqueeBlockPreview     (components/blocks/visual/MarqueeBlockPreview.tsx)
 *   - GalleryBlockPreview     (components/blocks/visual/GalleryBlockPreview.tsx)
 *   - DeckNextSlideBlockRender / DeckJumpToBlockRender
 *                             (components/blocks/render/DeckNavBlockRender.tsx)
 *   - HtmlEmbedBlockRender    (components/blocks/render/HtmlEmbedBlockRender.tsx)
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { MarqueeBlockPreview } from '@/components/blocks/visual/MarqueeBlockPreview';
import { GalleryBlockPreview } from '@/components/blocks/visual/GalleryBlockPreview';
import {
  DeckNextSlideBlockRender,
  DeckJumpToBlockRender,
} from '@/components/blocks/render/DeckNavBlockRender';
import { HtmlEmbedBlockRender } from '@/components/blocks/render/HtmlEmbedBlockRender';

// ---------------------------------------------------------------------------
// MarqueeBlockPreview
// ---------------------------------------------------------------------------
describe('MarqueeBlockPreview', () => {
  it('renders the empty-state placeholder when items is empty', () => {
    const block: any = { id: 'm1', type: 'marquee', order: 0, items: [] };
    const { container } = render(
      <MarqueeBlockPreview block={block} isSelected={false} onChange={() => {}} />,
    );
    expect(container.textContent).toContain('No marquee items');
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders text items duplicated (the visual loop-indicator pattern)', () => {
    const block: any = {
      id: 'm2',
      type: 'marquee',
      order: 0,
      items: [
        { id: 'i1', type: 'text', content: 'Hello' },
        { id: 'i2', type: 'text', content: 'World' },
      ],
    };
    const { container } = render(
      <MarqueeBlockPreview block={block} isSelected={false} onChange={() => {}} />,
    );
    // Each item is rendered twice — once at full opacity, once faded.
    const spans = container.querySelectorAll('span');
    const helloCount = Array.from(spans).filter((s) => s.textContent === 'Hello').length;
    expect(helloCount).toBeGreaterThanOrEqual(2);
    const worldCount = Array.from(spans).filter((s) => s.textContent === 'World').length;
    expect(worldCount).toBeGreaterThanOrEqual(2);
    // Selection overlay must NOT show when not selected.
    expect(container.textContent).not.toContain('/ 50px/s');
  });

  it('renders image items with an <img> and prevents anchor default-nav when a link is set', () => {
    const block: any = {
      id: 'm3',
      type: 'marquee',
      order: 0,
      items: [
        {
          id: 'i1',
          type: 'image',
          imageUrl: 'https://cdn.example/x.png',
          imageAlt: 'logo',
          link: 'https://example.com',
        },
      ],
    };
    const { container } = render(
      <MarqueeBlockPreview block={block} isSelected={false} onChange={() => {}} />,
    );
    const imgs = container.querySelectorAll('img');
    expect(imgs.length).toBe(2); // duplicate scroll-pattern
    expect(imgs[0].getAttribute('src')).toBe('https://cdn.example/x.png');
    expect(imgs[0].getAttribute('alt')).toBe('logo');
    // Items with a link must be wrapped in an <a>.
    const anchors = container.querySelectorAll('a[href="https://example.com"]');
    expect(anchors.length).toBe(2);
  });

  it('renders icon items via material-icons span', () => {
    const block: any = {
      id: 'm4',
      type: 'marquee',
      order: 0,
      items: [{ id: 'i1', type: 'icon', content: 'star' }],
    };
    const { container } = render(
      <MarqueeBlockPreview block={block} isSelected={false} onChange={() => {}} />,
    );
    const icons = container.querySelectorAll('.material-icons');
    expect(icons.length).toBe(2);
    expect(icons[0].textContent).toBe('star');
  });

  it('renders the selection overlay with direction/speed/item-count/loop when isSelected', () => {
    const block: any = {
      id: 'm5',
      type: 'marquee',
      order: 0,
      direction: 'right',
      speed: 120,
      loop: 3,
      items: [
        { id: 'i1', type: 'text', content: 'A' },
        { id: 'i2', type: 'text', content: 'B' },
      ],
    };
    const { container } = render(
      <MarqueeBlockPreview block={block} isSelected={true} onChange={() => {}} />,
    );
    expect(container.textContent).toContain('right');
    expect(container.textContent).toContain('120px/s');
    expect(container.textContent).toContain('2 items');
    expect(container.textContent).toContain('loop 3');
  });

  it('falls back to "(empty)" text when a text item has no content', () => {
    const block: any = {
      id: 'm6',
      type: 'marquee',
      order: 0,
      items: [{ id: 'i1', type: 'text' }],
    };
    const { container } = render(
      <MarqueeBlockPreview block={block} isSelected={false} onChange={() => {}} />,
    );
    expect(container.textContent).toContain('(empty)');
  });
});

// ---------------------------------------------------------------------------
// GalleryBlockPreview
// ---------------------------------------------------------------------------
describe('GalleryBlockPreview', () => {
  it('renders the empty-state placeholder when images is empty', () => {
    const block: any = { id: 'g1', type: 'gallery', order: 0, images: [] };
    const { container } = render(
      <GalleryBlockPreview block={block} isSelected={false} onChange={() => {}} />,
    );
    expect(container.textContent).toContain('Gallery block - add images in settings panel');
    expect(container.querySelector('img')).toBeNull();
    // material-icons photo_library glyph appears in the empty state.
    expect(container.textContent).toContain('photo_library');
  });

  it('renders grid layout with the default 3-column responsive classes', () => {
    const block: any = {
      id: 'g2',
      type: 'gallery',
      order: 0,
      images: [
        { id: 'a', url: 'https://x/1.jpg', alt: 'one' },
        { id: 'b', url: 'https://x/2.jpg', alt: 'two' },
      ],
    };
    const { container } = render(
      <GalleryBlockPreview block={block} isSelected={false} onChange={() => {}} />,
    );
    const grid = container.querySelector('.grid');
    expect(grid).toBeTruthy();
    // 3-col defaults map to "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
    expect(grid?.className).toContain('grid-cols-1');
    expect(grid?.className).toContain('sm:grid-cols-2');
    expect(grid?.className).toContain('lg:grid-cols-3');
    // Default gap is md → 'gap-4'
    expect(grid?.className).toContain('gap-4');
    expect(container.querySelectorAll('img').length).toBe(2);
  });

  it('honors the columns + gap props on the grid container', () => {
    const block: any = {
      id: 'g3',
      type: 'gallery',
      order: 0,
      columns: 4,
      gap: 'lg',
      images: [{ id: 'a', url: 'https://x/1.jpg', alt: 'one' }],
    };
    const { container } = render(
      <GalleryBlockPreview block={block} isSelected={true} onChange={() => {}} />,
    );
    const grid = container.querySelector('.grid');
    expect(grid?.className).toContain('grid-cols-2');
    expect(grid?.className).toContain('sm:grid-cols-3');
    expect(grid?.className).toContain('lg:grid-cols-4');
    expect(grid?.className).toContain('gap-6');
  });

  it('renders masonry layout using CSS column-count instead of grid', () => {
    const block: any = {
      id: 'g4',
      type: 'gallery',
      order: 0,
      layout: 'masonry',
      columns: 3,
      gap: 'sm',
      images: [
        { id: 'a', url: 'https://x/1.jpg', alt: 'a', caption: 'First photo' },
        { id: 'b', url: 'https://x/2.jpg', alt: 'b' },
      ],
    };
    const { container } = render(
      <GalleryBlockPreview block={block} isSelected={false} onChange={() => {}} />,
    );
    // Masonry path does NOT use the `.grid` Tailwind class — it relies on
    // `columnCount` inline style.
    expect(container.querySelector('.grid')).toBeNull();
    const masonry = container.firstChild as HTMLElement | null;
    expect(masonry).not.toBeNull();
    expect(masonry!.style.columnCount).toBe('3');
    expect(masonry!.className).toContain('gap-2'); // gap=sm
    // Caption is rendered when present.
    expect(container.textContent).toContain('First photo');
  });
});

// ---------------------------------------------------------------------------
// DeckNextSlideBlockRender / DeckJumpToBlockRender
// ---------------------------------------------------------------------------
describe('DeckNextSlideBlockRender', () => {
  it('renders default size/align/variant and arrow_forward fallback icon', () => {
    const block: any = { id: 'd1', type: 'deck-next-slide', order: 0 };
    const { container } = render(<DeckNextSlideBlockRender block={block} />);
    const btn = container.querySelector('button[data-deck-action="next-slide"]');
    expect(btn).toBeTruthy();
    expect(btn?.textContent).toContain('Next');
    // Falls back to arrow_forward when no icon is supplied.
    const icons = container.querySelectorAll('.material-icons');
    expect(icons.length).toBe(1);
    expect(icons[0].textContent).toBe('arrow_forward');
    // Default 'md' size class
    expect(btn?.className).toContain('px-6 py-3 text-base');
    // Default 'center' align
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('justify-center');
  });

  it('renders custom text, left-positioned icon, and lg size when configured', () => {
    const block: any = {
      id: 'd2',
      type: 'deck-next-slide',
      order: 0,
      text: 'Continue',
      icon: 'chevron_right',
      iconPosition: 'left',
      size: 'lg',
      alignment: 'right',
      variant: 'secondary',
    };
    const { container } = render(<DeckNextSlideBlockRender block={block} />);
    const btn = container.querySelector('button') as HTMLButtonElement;
    expect(btn.textContent).toContain('Continue');
    // 'lg' size class
    expect(btn.className).toContain('px-8 py-4 text-lg');
    // Right alignment on the wrapper
    expect((container.firstChild as HTMLElement).className).toContain('justify-end');
    // Icon is the explicit configured one — not arrow_forward fallback.
    const icons = container.querySelectorAll('.material-icons');
    expect(icons.length).toBe(1);
    expect(icons[0].textContent).toBe('chevron_right');
    // Secondary variant inline style.
    expect(btn.style.backgroundColor).toContain('--slide-accent');
  });

  it('renders icon on the right (no left icon, no fallback) when iconPosition=right', () => {
    const block: any = {
      id: 'd3',
      type: 'deck-next-slide',
      order: 0,
      icon: 'east',
      iconPosition: 'right',
      variant: 'outline',
    };
    const { container } = render(<DeckNextSlideBlockRender block={block} />);
    const icons = container.querySelectorAll('.material-icons');
    expect(icons.length).toBe(1);
    expect(icons[0].textContent).toBe('east');
    // Outline variant — transparent background.
    const btn = container.querySelector('button') as HTMLButtonElement;
    expect(btn.style.backgroundColor).toBe('transparent');
    expect(btn.style.border).toContain('2px solid');
  });
});

describe('DeckJumpToBlockRender', () => {
  it('renders default "Go to Slide N" label with the targetSlide and exposes the data attribute', () => {
    const block: any = { id: 'j1', type: 'deck-jump-to', order: 0, targetSlide: 5 };
    const { container } = render(<DeckJumpToBlockRender block={block} />);
    const btn = container.querySelector('button[data-deck-action="jump-to"]') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.textContent).toContain('Go to Slide 5');
    expect(btn.getAttribute('data-deck-target')).toBe('5');
    // No fallback arrow_forward icon for jump-to (unlike next-slide).
    expect(container.querySelectorAll('.material-icons').length).toBe(0);
  });

  it('renders custom text and a right-positioned icon when configured', () => {
    const block: any = {
      id: 'j2',
      type: 'deck-jump-to',
      order: 0,
      targetSlide: 12,
      text: 'See appendix',
      icon: 'arrow_outward',
      iconPosition: 'right',
      size: 'sm',
      alignment: 'left',
    };
    const { container } = render(<DeckJumpToBlockRender block={block} />);
    const btn = container.querySelector('button') as HTMLButtonElement;
    expect(btn.textContent).toContain('See appendix');
    expect(btn.className).toContain('px-4 py-2 text-sm');
    expect((container.firstChild as HTMLElement).className).toContain('justify-start');
    const icons = container.querySelectorAll('.material-icons');
    expect(icons.length).toBe(1);
    expect(icons[0].textContent).toBe('arrow_outward');
  });
});

// ---------------------------------------------------------------------------
// HtmlEmbedBlockRender
// ---------------------------------------------------------------------------
describe('HtmlEmbedBlockRender', () => {
  it('renders the inline-HTML branch (SEO path) and includes the caption', () => {
    const block: any = {
      id: 'h1',
      type: 'html-embed',
      order: 0,
      url: 'https://cdn.example/embed.html',
      inlineHtml: '<p data-testid="inline-marker">hello inline</p>',
      caption: 'Captioned embed',
      width: 'contained',
    };
    const { container } = render(<HtmlEmbedBlockRender block={block} />);
    // Inline HTML must be injected via dangerouslySetInnerHTML.
    expect(container.querySelector('[data-testid="inline-marker"]')).toBeTruthy();
    expect(container.textContent).toContain('hello inline');
    expect(container.textContent).toContain('Captioned embed');
    // 'contained' width → max-w-5xl wrapper class.
    expect(container.querySelector('.max-w-5xl')).toBeTruthy();
    // The iframe path must NOT be taken when inlineHtml is set.
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('renders the no-URL empty state when both url and inlineHtml are missing', () => {
    const block: any = { id: 'h2', type: 'html-embed', order: 0 };
    const { container } = render(<HtmlEmbedBlockRender block={block} />);
    expect(container.textContent).toContain('No HTML file uploaded yet');
    // Uses the `code` material-icons glyph for the empty placeholder.
    expect(container.textContent).toContain('code');
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('renders the iframe branch with the default sandbox preset (allow-scripts) and full width', () => {
    const block: any = {
      id: 'h3',
      type: 'html-embed',
      order: 0,
      url: 'https://cdn.example/embed.html',
    };
    const { container } = render(<HtmlEmbedBlockRender block={block} />);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    expect(iframe.getAttribute('src')).toBe('https://cdn.example/embed.html?embed=1');
    // Default sandbox preset is 'scripts' → 'allow-scripts allow-popups allow-popups-to-escape-sandbox'.
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-popups allow-popups-to-escape-sandbox');
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(iframe.getAttribute('loading')).toBe('lazy');
    // Default height '600px'.
    expect(iframe.style.height).toBe('600px');
    // Default accessibility title.
    expect(iframe.getAttribute('title')).toBe('Embedded HTML content');
    // Default width is 'full' → w-full wrapper, NOT max-w-5xl.
    expect(container.querySelector('.max-w-5xl')).toBeNull();
    expect(container.querySelector('.w-full')).toBeTruthy();
  });

  it('honors a custom sandbox preset, iframeTitle, height and renders the caption below the iframe', () => {
    const block: any = {
      id: 'h4',
      type: 'html-embed',
      order: 0,
      url: 'https://cdn.example/form.html',
      sandbox: 'scripts-forms',
      iframeTitle: 'Signup form',
      height: '100vh',
      caption: 'Sign up for our newsletter',
    };
    const { container } = render(<HtmlEmbedBlockRender block={block} />);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox');
    expect(iframe.getAttribute('title')).toBe('Signup form');
    expect(iframe.style.height).toBe('100vh');
    expect(container.textContent).toContain('Sign up for our newsletter');
  });

  it('maps the strict sandbox preset to an empty sandbox attribute (opaque origin, no scripts)', () => {
    const block: any = {
      id: 'h5',
      type: 'html-embed',
      order: 0,
      url: 'https://cdn.example/static.html',
      sandbox: 'strict',
    };
    const { container } = render(<HtmlEmbedBlockRender block={block} />);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe.getAttribute('sandbox')).toBe('');
  });
});
