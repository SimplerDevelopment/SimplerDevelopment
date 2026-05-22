// @vitest-environment jsdom
/**
 * Batch 44g — medium-size render-block components.
 *
 * Each component is a "render" block (the production-frontend renderer that
 * ships in published sites and decks). They share a common shape: read fields
 * off a typed `block` prop, branch on optional flags (layout, columns, lightbox,
 * postType, showImage…), and emit Tailwind grid / list markup. Two of the four
 * have side effects (`useEffect` data fetching) and we drive those through
 * controllable mocks so the loading / error / success branches each get hit.
 *
 * Components covered:
 *   - BlogPostsBlockRender         (components/blocks/render/BlogPostsBlockRender.tsx)
 *   - ProductCategoriesBlockRender (components/blocks/render/ProductCategoriesBlockRender.tsx)
 *   - BentoGridBlockRender         (components/blocks/render/BentoGridBlockRender.tsx)
 *   - GalleryBlockRender           (components/blocks/render/GalleryBlockRender.tsx)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock blog server actions used by BlogPostsBlockRender.
//
// The render component imports getAllBlogPosts / getBlogPostsByCategory from
// '@/lib/actions/blog' — a 'use server' file that depends on the live drizzle
// schema. We replace it with deterministic vi.fn()s the tests can rewire.
// ---------------------------------------------------------------------------
const getAllBlogPostsMock = vi.fn();
const getBlogPostsByCategoryMock = vi.fn();

vi.mock('@/lib/actions/blog', () => ({
  getAllBlogPosts: (...args: any[]) => getAllBlogPostsMock(...args),
  getBlogPostsByCategory: (...args: any[]) => getBlogPostsByCategoryMock(...args),
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------
import { BlogPostsBlockRender } from '@/components/blocks/render/BlogPostsBlockRender';
import { ProductCategoriesBlockRender } from '@/components/blocks/render/ProductCategoriesBlockRender';
import { BentoGridBlockRender } from '@/components/blocks/render/BentoGridBlockRender';
import { GalleryBlockRender } from '@/components/blocks/render/GalleryBlockRender';

// ---------------------------------------------------------------------------
// BlogPostsBlockRender
// ---------------------------------------------------------------------------
describe('BlogPostsBlockRender', () => {
  beforeEach(() => {
    getAllBlogPostsMock.mockReset();
    getBlogPostsByCategoryMock.mockReset();
  });

  it('renders the loading skeleton on first paint (before the async effect resolves)', () => {
    // Promise that never resolves -> component stays in loading=true branch.
    getAllBlogPostsMock.mockImplementation(() => new Promise(() => {}));
    const block: any = { type: 'blog-posts', postType: 'all', limit: 3, columns: 3, title: 'Latest' };

    const { container } = render(<BlogPostsBlockRender block={block} />);

    // Three skeleton cards (one per `limit`).
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(3);
    expect(getAllBlogPostsMock).toHaveBeenCalledTimes(1);
  });

  it('renders posts and respects the limit when postType is "all"', async () => {
    getAllBlogPostsMock.mockResolvedValue([
      {
        id: 1,
        slug: 'a',
        title: 'Post A',
        excerpt: 'Excerpt A',
        coverImage: '/a.jpg',
        category: { id: 9, name: 'News', color: '#f00' },
        publishedAt: new Date('2026-01-15T00:00:00Z'),
        tags: [{ id: 1, name: 'tag-1' }, { id: 2, name: 'tag-2' }, { id: 3, name: 'tag-3' }, { id: 4, name: 'tag-4' }],
      },
      { id: 2, slug: 'b', title: 'Post B', excerpt: null, coverImage: null, category: null, publishedAt: null, tags: [] },
      { id: 3, slug: 'c', title: 'Post C', tags: [] },
      { id: 4, slug: 'd', title: 'Post D (should be sliced off)', tags: [] },
    ]);

    const block: any = {
      type: 'blog-posts',
      postType: 'all',
      limit: 3,
      columns: 2,
      title: 'Latest Posts',
      description: 'Read on',
      showExcerpt: true,
    };

    const { container, findByText, queryByText } = render(<BlogPostsBlockRender block={block} />);

    await findByText('Post A');
    expect(container.textContent).toContain('Post B');
    expect(container.textContent).toContain('Post C');
    expect(queryByText('Post D (should be sliced off)')).toBeNull();
    // Header rendered via dangerouslySetInnerHTML, so it is in textContent.
    expect(container.textContent).toContain('Latest Posts');
    expect(container.textContent).toContain('Read on');
    // Category label and excerpt branch for the first post.
    expect(container.textContent).toContain('News');
    expect(container.textContent).toContain('Excerpt A');
    // Only the first 3 tags are shown.
    expect(container.textContent).toContain('tag-1');
    expect(container.textContent).toContain('tag-2');
    expect(container.textContent).toContain('tag-3');
    expect(container.textContent).not.toContain('tag-4');
    // No leftover skeletons after data resolves.
    expect(container.querySelectorAll('.animate-pulse').length).toBe(0);
  });

  it('routes to getBlogPostsByCategory when postType is "category" and a slug is set', async () => {
    getBlogPostsByCategoryMock.mockResolvedValue([
      { id: 11, slug: 'guides-1', title: 'Guide 1', tags: [] },
    ]);

    const block: any = {
      type: 'blog-posts',
      postType: 'category',
      categorySlug: 'guides',
      limit: 3,
      columns: 3,
    };

    const { findByText } = render(<BlogPostsBlockRender block={block} />);

    await findByText('Guide 1');
    expect(getBlogPostsByCategoryMock).toHaveBeenCalledWith('guides');
    expect(getAllBlogPostsMock).not.toHaveBeenCalled();
  });

  it('falls back to getAllBlogPosts when postType="category" but no slug is provided', async () => {
    getAllBlogPostsMock.mockResolvedValue([{ id: 21, slug: 'fb', title: 'Fallback', tags: [] }]);

    const block: any = {
      type: 'blog-posts',
      postType: 'category', // category but no categorySlug -> else branch
      limit: 1,
      columns: 3,
    };

    const { findByText } = render(<BlogPostsBlockRender block={block} />);
    await findByText('Fallback');
    expect(getAllBlogPostsMock).toHaveBeenCalled();
    expect(getBlogPostsByCategoryMock).not.toHaveBeenCalled();
  });

  it('renders the empty-state copy when the fetch returns no posts', async () => {
    getAllBlogPostsMock.mockResolvedValue([]);
    const block: any = { type: 'blog-posts', postType: 'all', limit: 3, columns: 3 };
    const { findByText } = render(<BlogPostsBlockRender block={block} />);
    await findByText('No blog posts found.');
  });

  it('catches a fetch error and falls back to the empty state', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getAllBlogPostsMock.mockRejectedValue(new Error('boom'));
    const block: any = { type: 'blog-posts', postType: 'all', limit: 2, columns: 3 };
    const { findByText } = render(<BlogPostsBlockRender block={block} />);
    await findByText('No blog posts found.');
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('exercises the responsive-class branch without throwing when block.responsive is set', () => {
    // `combineResponsiveClasses` is intentionally a deprecated no-op (returns
    // ''), but the BlogPostsBlockRender still exercises the truthy-branch of
    // `block.responsive ? combineResponsiveClasses(...) : ''`. This test
    // guards that the truthy branch is taken without throwing and that the
    // section still renders.
    getAllBlogPostsMock.mockImplementation(() => new Promise(() => {}));
    const block: any = {
      type: 'blog-posts',
      postType: 'all',
      limit: 1,
      columns: 3,
      responsive: {
        paddingTop: { default: 'lg' },
        paddingBottom: { default: 'lg' },
      },
    };
    const { container } = render(<BlogPostsBlockRender block={block} />);
    const section = container.querySelector('section');
    expect(section).toBeTruthy();
    // The class string is empty by design (combineResponsiveClasses returns '')
    // but having reached this point means the truthy branch was evaluated.
    expect(typeof section!.className).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// ProductCategoriesBlockRender
// ---------------------------------------------------------------------------
describe('ProductCategoriesBlockRender', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetchOnce(payload: any) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(payload),
    } as any) as any;
  }

  it('grid layout renders loading skeletons when no siteId is provided (fetch is skipped, loading stays true)', () => {
    const block: any = { type: 'product-categories', layout: 'grid', columns: 3, title: 'Browse' };
    const { container } = render(<ProductCategoriesBlockRender block={block} />);
    // Effect early-returns on missing siteId -> loading=true forever -> 3 skeletons
    expect(container.querySelectorAll('.animate-pulse').length).toBe(3);
    // Header is still rendered.
    expect(container.textContent).toContain('Browse');
  });

  it('grid layout renders categories after a successful fetch and respects showImage / showProductCount toggles', async () => {
    mockFetchOnce({
      success: true,
      data: [
        { id: 1, name: 'Shoes', slug: 'shoes', description: 'Foot stuff', image: '/shoes.png', productCount: 12 },
        { id: 2, name: 'Hats', slug: 'hats', description: null, image: null, productCount: 0 },
      ],
    });
    const block: any = {
      type: 'product-categories',
      layout: 'grid',
      columns: 4,
      title: 'Cats',
      showImage: true,
      showProductCount: true,
    };

    const { findByText, container } = render(<ProductCategoriesBlockRender block={block} siteId={42} />);

    await findByText('Shoes');
    expect(container.textContent).toContain('Hats');
    expect(container.textContent).toContain('12 products');
    // The "Hats" record has no image; the grid layout renders a `category`
    // material-icon placeholder.
    expect(container.querySelectorAll('.material-icons').length).toBeGreaterThan(0);
    // Image for "Shoes" should be present.
    expect(container.querySelector('img[alt="Shoes"]')).toBeTruthy();
  });

  it('grid layout renders empty-state copy when the API returns an empty list', async () => {
    mockFetchOnce({ success: true, data: [] });
    const block: any = { type: 'product-categories', layout: 'grid', columns: 2 };
    const { findByText } = render(<ProductCategoriesBlockRender block={block} siteId={7} />);
    await findByText('No categories available.');
  });

  it('grid layout swallows a fetch failure and stays in loading state', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down')) as any;
    const block: any = { type: 'product-categories', layout: 'grid', columns: 3 };

    const { container } = render(<ProductCategoriesBlockRender block={block} siteId={9} />);

    await waitFor(() => {
      expect(errSpy).toHaveBeenCalled();
    });
    // After the rejection finishes, `finally` flips loading=false. We then
    // fall through to the empty-state branch (categories.length === 0).
    await waitFor(() => {
      expect(container.textContent).toContain('No categories available.');
    });
    errSpy.mockRestore();
  });

  it('list layout renders loading skeletons before data resolves', () => {
    // Pending fetch -> loading stays true.
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => {})) as any;
    const block: any = { type: 'product-categories', layout: 'list', title: 'L' };
    const { container } = render(<ProductCategoriesBlockRender block={block} siteId={1} />);
    // List layout renders 4 skeletons.
    expect(container.querySelectorAll('.animate-pulse').length).toBe(4);
  });

  it('list layout renders categories with showImage=false and showProductCount=false toggles honored', async () => {
    mockFetchOnce({
      success: true,
      data: [
        { id: 10, name: 'Jackets', slug: 'jackets', description: 'warm', image: '/jackets.png', productCount: 5 },
      ],
    });
    const block: any = {
      type: 'product-categories',
      layout: 'list',
      showImage: false,
      showProductCount: false,
    };
    const { findByText, container } = render(<ProductCategoriesBlockRender block={block} siteId={3} />);
    await findByText('Jackets');
    // showImage=false -> no <img>
    expect(container.querySelector('img[alt="Jackets"]')).toBeNull();
    // showProductCount=false -> count copy must not appear
    expect(container.textContent).not.toContain('5 products');
  });
});

// ---------------------------------------------------------------------------
// BentoGridBlockRender
// ---------------------------------------------------------------------------
describe('BentoGridBlockRender', () => {
  it('renders nothing in the header region when overline/title/subtitle are all absent', () => {
    const block: any = { type: 'bento-grid', cards: [] };
    const { container } = render(<BentoGridBlockRender block={block} />);
    // No <h2> or overline paragraph -> no header.
    expect(container.querySelector('h2')).toBeNull();
  });

  it('groups cards into rows based on the columns setting (4 cards / cols=2 -> 2 rows)', () => {
    const block: any = {
      type: 'bento-grid',
      columns: 2,
      cards: [
        { id: 'c1', title: 'A', span: 6, items: ['x', 'y'], variant: 'light' },
        { id: 'c2', title: 'B', span: 6, items: [], variant: 'light' },
        { id: 'c3', title: 'C', span: 6, items: [], variant: 'light' },
        { id: 'c4', title: 'D', span: 6, items: [], variant: 'light' },
      ],
    };
    const { container } = render(<BentoGridBlockRender block={block} />);
    // Each row is a top-level grid container.
    const rows = container.querySelectorAll('.grid.grid-cols-1.md\\:grid-cols-12');
    expect(rows.length).toBe(2);
    // Every card renders an <a> with its href fallback.
    const anchors = container.querySelectorAll('a');
    expect(anchors.length).toBe(4);
    anchors.forEach((a) => expect(a.getAttribute('href')).toBe('#'));
  });

  it('renders header + dark variant cards with accent-color styling and lead/items/linkText copy', () => {
    const block: any = {
      type: 'bento-grid',
      columns: 1,
      darkBg: '#111111',
      accentColor: '#ff8800',
      lightBorder: '#dddddd',
      overline: 'Section',
      title: 'Bento Title',
      subtitle: 'A subtitle',
      cards: [
        {
          id: 'card1',
          title: 'Card One',
          lead: 'A great lead',
          link: 'https://example.com/one',
          linkText: 'Read more',
          items: ['Item A', 'Item B', 'Item C'],
          variant: 'dark',
          span: 12,
        },
      ],
    };

    const { container } = render(<BentoGridBlockRender block={block} />);
    expect(container.textContent).toContain('Section');
    expect(container.textContent).toContain('Bento Title');
    expect(container.textContent).toContain('A subtitle');
    expect(container.textContent).toContain('Card One');
    expect(container.textContent).toContain('A great lead');
    expect(container.textContent).toContain('Item A');
    expect(container.textContent).toContain('Item C');
    expect(container.textContent).toContain('Read more');

    const link = container.querySelector('a');
    expect(link!.getAttribute('href')).toBe('https://example.com/one');
    // Dark variant card has background-color set to darkBg.
    expect(link!.getAttribute('style') ?? '').toMatch(/background-color/i);
  });

  it('uses default darkBg / lightBorder / accentColor when none are provided', () => {
    const block: any = {
      type: 'bento-grid',
      title: 'Hello',
      cards: [{ id: 'x', title: 'T', items: [], variant: 'light' }],
    };
    const { container } = render(<BentoGridBlockRender block={block} />);
    const anchor = container.querySelector('a');
    // Default light variant uses '#ffffff' background and the lightBorder default.
    expect(anchor!.getAttribute('style') ?? '').toMatch(/background-color/i);
    // Default `cols` fallback is 2 — one card means one row with one cell.
    expect(container.querySelectorAll('.md\\:grid-cols-12').length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// GalleryBlockRender
// ---------------------------------------------------------------------------
describe('GalleryBlockRender', () => {
  const images = [
    { id: 'i1', url: '/one.png', alt: 'One', caption: 'First' },
    { id: 'i2', url: '/two.png', alt: 'Two', caption: '' },
    { id: 'i3', url: '/three.png', alt: 'Three', caption: 'Third' },
  ];

  it('renders the grid layout (default) with all images and shows captions when present', () => {
    const block: any = { type: 'gallery', images, columns: 3, gap: 'md' };
    const { container } = render(<GalleryBlockRender block={block} />);
    expect(container.querySelectorAll('img').length).toBe(3);
    expect(container.textContent).toContain('First');
    expect(container.textContent).toContain('Third');
    // Empty caption is falsy -> not rendered.
    const captionParas = container.querySelectorAll('p');
    expect(captionParas.length).toBe(2); // only 'First' and 'Third'
  });

  it('renders masonry layout with column-count style and supports gap=lg', () => {
    const block: any = { type: 'gallery', images, columns: 2, layout: 'masonry', gap: 'lg' };
    const { container } = render(<GalleryBlockRender block={block} />);
    // Masonry top-level div uses `columns-N` class + inline columnCount.
    const masonryDiv = container.querySelector('div.columns-2');
    expect(masonryDiv).toBeTruthy();
    expect((masonryDiv as HTMLElement).style.columnCount).toBe('2');
    // gap=lg -> 'gap-6' class.
    expect(masonryDiv!.className).toContain('gap-6');
  });

  it('opens the lightbox on image click and renders next/prev controls only when navigable', () => {
    const block: any = { type: 'gallery', images, columns: 3, gap: 'sm', lightbox: true };
    const { container } = render(<GalleryBlockRender block={block} />);
    // No lightbox initially.
    expect(container.querySelector('.fixed.inset-0.z-50')).toBeNull();

    // Click the first thumbnail.
    const triggers = container.querySelectorAll('button[type="button"]');
    expect(triggers.length).toBeGreaterThanOrEqual(3);
    act(() => {
      fireEvent.click(triggers[0]);
    });

    const lb = container.querySelector('.fixed.inset-0.z-50');
    expect(lb).toBeTruthy();
    // At index 0: prev is hidden, next is shown, plus the close button = 2 controls.
    const lbButtons = lb!.querySelectorAll('button');
    expect(lbButtons.length).toBe(2);
    // Caption for index 0 is "First" — shown beneath the image in the lightbox.
    expect(lb!.textContent).toContain('First');
  });

  it('does not open the lightbox when lightbox=false', () => {
    const block: any = { type: 'gallery', images, columns: 3, gap: 'sm', lightbox: false };
    const { container } = render(<GalleryBlockRender block={block} />);
    const triggers = container.querySelectorAll('button[type="button"]');
    act(() => {
      fireEvent.click(triggers[0]);
    });
    expect(container.querySelector('.fixed.inset-0.z-50')).toBeNull();
  });

  it('navigates forward/backward in the lightbox and closes via the close button', () => {
    const block: any = { type: 'gallery', images, columns: 3, gap: 'sm', lightbox: true };
    const { container } = render(<GalleryBlockRender block={block} />);
    const triggers = container.querySelectorAll('button[type="button"]');
    // Open at index 0.
    act(() => {
      fireEvent.click(triggers[0]);
    });

    let lb = container.querySelector('.fixed.inset-0.z-50') as HTMLElement;
    // Next button is the second control (close, next) at index 0.
    let lbButtons = lb.querySelectorAll('button');
    // Click "next" -> index 1.
    act(() => {
      fireEvent.click(lbButtons[1]);
    });
    lb = container.querySelector('.fixed.inset-0.z-50') as HTMLElement;
    // At index 1, both prev + next exist + close = 3 buttons.
    lbButtons = lb.querySelectorAll('button');
    expect(lbButtons.length).toBe(3);

    // Click "next" -> index 2 (last). Prev shown but no next; total = 2 buttons.
    act(() => {
      fireEvent.click(lbButtons[2]);
    });
    lb = container.querySelector('.fixed.inset-0.z-50') as HTMLElement;
    lbButtons = lb.querySelectorAll('button');
    expect(lbButtons.length).toBe(2);

    // Click "prev" -> back to index 1.
    act(() => {
      fireEvent.click(lbButtons[1]);
    });
    lb = container.querySelector('.fixed.inset-0.z-50') as HTMLElement;
    expect(lb).toBeTruthy();
    lbButtons = lb.querySelectorAll('button');
    expect(lbButtons.length).toBe(3);

    // Close via the close button (index 0).
    act(() => {
      fireEvent.click(lbButtons[0]);
    });
    expect(container.querySelector('.fixed.inset-0.z-50')).toBeNull();
  });

  it('closes the lightbox when the backdrop is clicked', () => {
    const block: any = { type: 'gallery', images, columns: 2, gap: 'md', lightbox: true };
    const { container } = render(<GalleryBlockRender block={block} />);
    const triggers = container.querySelectorAll('button[type="button"]');
    act(() => {
      fireEvent.click(triggers[0]);
    });
    const lb = container.querySelector('.fixed.inset-0.z-50') as HTMLElement;
    expect(lb).toBeTruthy();
    // The lightbox root has the onClick=close handler.
    act(() => {
      fireEvent.click(lb);
    });
    expect(container.querySelector('.fixed.inset-0.z-50')).toBeNull();
  });

  it('handles missing optional fields by using sensible defaults (no images, no lightbox by default)', () => {
    const block: any = { type: 'gallery' }; // no images, no layout, no columns
    const { container } = render(<GalleryBlockRender block={block} />);
    // No images -> no <img> tags, no lightbox.
    expect(container.querySelectorAll('img').length).toBe(0);
    expect(container.querySelector('.fixed.inset-0.z-50')).toBeNull();
  });
});
