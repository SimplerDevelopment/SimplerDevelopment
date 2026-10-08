// @vitest-environment jsdom
// PUX-241 — HeroSlideshow only requests the active slide's backgroundImage plus its
// immediate neighbours, and the pagination dots expose a >=24x24 hit target.
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

import { HeroSlideshowBlockRender } from '@/components/blocks/render/HeroSlideshowBlockRender';
import type { HeroSlideshowBlock } from '@/types/blocks';

vi.mock('@/lib/security/sanitize-html', () => ({
  sanitizeRichHtml: vi.fn((s: string) => s),
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children }: { children: React.ReactNode }) => React.createElement('a', null, children),
}));

function makeBlock(count: number): HeroSlideshowBlock {
  return {
    id: 'hs-1',
    type: 'hero-slideshow',
    order: 0,
    autoplay: false,
    transitionDuration: 10,
    slides: Array.from({ length: count }, (_, i) => ({
      id: `s${i}`,
      title: `Slide ${i}`,
      backgroundImage: `/img/slide-${i}.webp`,
    })),
  } as unknown as HeroSlideshowBlock;
}

/** Slide indexes whose background-image URL is currently in the DOM. */
function renderedImages(container: HTMLElement): number[] {
  return Array.from(container.querySelectorAll<HTMLElement>('div[style*="background-image"]'))
    .map((el) => Number(/slide-(\d+)\.webp/.exec(el.style.backgroundImage)?.[1]))
    .sort((a, b) => a - b);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('HeroSlideshowBlockRender background images', () => {
  it('renders only the active slide and its immediate neighbours (wrapping)', () => {
    const { container } = render(<HeroSlideshowBlockRender block={makeBlock(5)} />);
    // active 0 -> neighbours 1 and 4 (wraps)
    expect(renderedImages(container)).toEqual([0, 1, 4]);
  });

  it('adds the next neighbour once a slide becomes active and keeps earlier ones', () => {
    vi.useFakeTimers();
    const { container } = render(<HeroSlideshowBlockRender block={makeBlock(5)} />);
    fireEvent.click(screen.getByLabelText('Next slide'));
    act(() => { vi.advanceTimersByTime(50); });
    // active 1 -> 0, 1, 2 wanted; 4 stays loaded so a mid fade-out layer never blanks
    expect(renderedImages(container)).toEqual([0, 1, 2, 4]);
  });

  it('renders every image for a 2-slide hero (all are neighbours)', () => {
    const { container } = render(<HeroSlideshowBlockRender block={makeBlock(2)} />);
    expect(renderedImages(container)).toEqual([0, 1]);
  });
});

describe('HeroSlideshowBlockRender pagination dots', () => {
  it('gives every dot button a hit target of at least 24x24 CSS px', () => {
    render(<HeroSlideshowBlockRender block={makeBlock(5)} />);
    for (let i = 1; i <= 5; i++) {
      const dot = screen.getByLabelText(`Go to slide ${i}`);
      expect(parseInt(dot.style.minWidth, 10)).toBeGreaterThanOrEqual(24);
      expect(parseInt(dot.style.height, 10)).toBeGreaterThanOrEqual(24);
    }
  });

  it('keeps the visible dot at its original 10px height inside the button', () => {
    render(<HeroSlideshowBlockRender block={makeBlock(3)} />);
    const dot = screen.getByLabelText('Go to slide 2').querySelector('span') as HTMLElement;
    expect(dot.style.height).toBe('10px');
    expect(dot.style.width).toBe('10px');
  });
});
