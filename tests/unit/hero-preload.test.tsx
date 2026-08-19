// @vitest-environment node
/**
 * Pins HeroPreload's per-callsite preload count (ITM perf fix, 2026-08-19).
 *
 * Home/generic pages legitimately have TWO LCP candidates (desktop hero vs.
 * mobile grid image), so HeroPreload defaults to preloading the first 2
 * content images at fetchPriority=high. Blog posts do NOT: a blog post's 2nd
 * content image is always below-fold article body copy (the first inline
 * `<img loading="lazy">`, ~1500px+ down), never an LCP candidate on any
 * viewport. Preloading it anyway overrode its own lazy-loading and stole
 * high-priority bandwidth from the real LCP element (the banner) — measured
 * on prod as 15KB-220KB wasted per post (avg ~72KB) across 21/33 blog posts,
 * adding an estimated 400ms-2s to LCP.
 *
 * The fix is the `max` prop on <HeroPreload>: the blog callsite
 * (app/sites/[domain]/[[...slug]]/page.tsx) now passes max={1} while
 * home/generic pages keep the default of 2. This test locks that split in —
 * regressing it (e.g. dropping the blog callsite back to the 2-image
 * default) would silently reintroduce the wasted preload.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock factories are hoisted above normal top-level statements, so the
// mock fns must be created via vi.hoisted() to be visible inside the factory.
const { preloadMock, preconnectMock } = vi.hoisted(() => ({
  preloadMock: vi.fn(),
  preconnectMock: vi.fn(),
}));

vi.mock('react-dom', async () => {
  const actual: any = await vi.importActual('react-dom');
  return {
    ...actual,
    preload: preloadMock,
    preconnect: preconnectMock,
  };
});

import { HeroPreload } from '@/components/blocks/render/HeroPreload';

const HERO_URL = '/api/media/proxy/media/hero-banner.jpg';
const BODY_URL = '/api/media/proxy/media/article-inline.jpg';

// Two ordinary (non-html-render) blocks so resolveHtmlRenderCorpus serializes
// them as literal JSON in document order — first block's image url sorts
// first in the scan corpus, matching how a real hero-then-body-image post is
// laid out.
function twoImageContent() {
  return JSON.stringify([
    { id: 'hero', type: 'card-grid', cards: [{ id: 'h', title: 'hero', image: HERO_URL }] },
    { id: 'body', type: 'card-grid', cards: [{ id: 'b', title: 'body', image: BODY_URL }] },
  ]);
}

describe('HeroPreload max prop (blog vs. home/generic)', () => {
  beforeEach(() => {
    preloadMock.mockClear();
    preconnectMock.mockClear();
  });

  it('home/generic call path (default max=2) preloads both content images', () => {
    // HeroPreload is a plain server component (no hooks) — safe to call directly.
    HeroPreload({ content: twoImageContent() });

    expect(preloadMock).toHaveBeenCalledTimes(2);
    expect(preloadMock).toHaveBeenNthCalledWith(1, HERO_URL, expect.objectContaining({ as: 'image', fetchPriority: 'high' }));
    expect(preloadMock).toHaveBeenNthCalledWith(2, BODY_URL, expect.objectContaining({ as: 'image', fetchPriority: 'high' }));
  });

  it('blog call path (max=1) preloads only the hero image, not the below-fold body image', () => {
    HeroPreload({ content: twoImageContent(), max: 1 });

    expect(preloadMock).toHaveBeenCalledTimes(1);
    expect(preloadMock).toHaveBeenCalledWith(HERO_URL, expect.objectContaining({ as: 'image', fetchPriority: 'high' }));
    expect(preloadMock).not.toHaveBeenCalledWith(BODY_URL, expect.anything());
  });
});
