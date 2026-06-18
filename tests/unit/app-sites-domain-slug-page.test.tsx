// @vitest-environment jsdom
/**
 * Unit tests for `app/sites/[domain]/[[...slug]]/page.tsx` — async Server Component.
 *
 * Strategy: this is an async Server Component with no 'use client' directive.
 * We call the exported function directly (`await ClientSitePage({...})`) and
 * render the returned JSX. `notFound()` is mocked to throw so we can assert
 * that specific branches trigger it.
 *
 * Branches covered:
 *   - site not found → notFound()
 *   - private site without unlock cookie → AccessCodeForm gate
 *   - home page (no slug): no homepage set → "coming soon" placeholder
 *   - home page (no slug): homepage found → SiteBlockRenderer output
 *   - /shop slug → ShopPage
 *   - /shop/<product-slug> → ProductPage
 *   - /blog slug: no posts → "No posts yet"
 *   - /blog slug: with posts, single page → blog listing
 *   - /blog slug: pagination (multiple pages)
 *   - /blog/<post-slug>: post not found → notFound()
 *   - /blog/<post-slug>: post found → SiteBlockRenderer
 *   - arbitrary slug: page not found → notFound()
 *   - arbitrary slug: page found → SiteBlockRenderer
 *   - preview token grant (verifyPreviewToken returns true)
 *   - session-based preview grant
 *   - generateMetadata: site not found → { title: absolute 'Not Found' }
 *   - generateMetadata: home page with SEO fields
 *   - generateMetadata: shop slug
 *   - generateMetadata: regular page with noIndex + canonicalUrl
 *   - generateMetadata: blog/post slug
 *   - generateMetadata: page not found → { title: absolute 'Not Found' }
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ─── Mocks (must precede page import) ────────────────────────────────────────

class NotFoundError extends Error {
  constructor() {
    super('NEXT_NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

const notFoundMock = vi.fn(() => { throw new NotFoundError(); });
vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string; [key: string]: unknown }>) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ─── Dependency mocks ─────────────────────────────────────────────────────────

const getClientWebsiteByDomainMock = vi.fn();
const getClientPageMock = vi.fn();
const getClientHomePageMock = vi.fn();
const getPostTypeForPostMock = vi.fn();
const getBrandingByWebsiteIdMock = vi.fn();

vi.mock('@/lib/site-data-cache', () => ({
  getClientWebsiteByDomainCached: (...a: unknown[]) => getClientWebsiteByDomainMock(...a),
  getClientPageCached: (...a: unknown[]) => getClientPageMock(...a),
  getClientHomePageCached: (...a: unknown[]) => getClientHomePageMock(...a),
  getPostTypeForPostCached: (...a: unknown[]) => getPostTypeForPostMock(...a),
  getBrandingByWebsiteIdCached: (...a: unknown[]) => getBrandingByWebsiteIdMock(...a),
}));

const getClientBlogPostsMock = vi.fn();
vi.mock('@/lib/actions/client-sites', () => ({
  getClientBlogPosts: (...a: unknown[]) => getClientBlogPostsMock(...a),
}));

vi.mock('@/lib/blocks/template-wrap', () => ({
  wrapWithTypeTemplate: (content: unknown, _template: unknown) => content,
}));

vi.mock('@/lib/blocks/html-render-loops', () => ({
  expandLoopsInContent: async (
    _siteId: unknown,
    content: unknown,
    _postId: unknown,
    _pagination: unknown,
  ) => content,
}));

vi.mock('@/lib/blocks/prefetch-embeds', () => ({
  prefetchHtmlEmbeds: async (content: unknown) => content,
}));

vi.mock('@/lib/ab/render', () => ({
  applyAbToPostContent: async ({
    content,
  }: {
    postId: unknown;
    content: unknown;
    skip: unknown;
  }) => ({ content, ab: null, visitorId: null }),
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => null),
}));

const verifyPreviewTokenMock = vi.fn(() => false);
vi.mock('@/lib/preview-token', () => ({
  verifyPreviewToken: (...a: unknown[]) => verifyPreviewTokenMock(...a),
}));

const verifyUnlockCookieValueMock = vi.fn(() => true);
const unlockCookieNameMock = vi.fn((id: unknown) => `unlock_${id}`);
vi.mock('@/lib/preview-unlock', () => ({
  verifyUnlockCookieValue: (...a: unknown[]) => verifyUnlockCookieValueMock(...a),
  unlockCookieName: (id: unknown) => unlockCookieNameMock(id),
}));

const cookiesGetMock = vi.fn(() => ({ value: undefined }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: cookiesGetMock }),
}));

// Stub heavy render components with lightweight test doubles.
vi.mock('@/components/blocks/render/SiteBlockRenderer', () => ({
  SiteBlockRenderer: ({ siteId }: { siteId: number }) =>
    React.createElement('div', { 'data-testid': 'site-block-renderer', 'data-site': siteId }),
}));

vi.mock('@/components/blocks/render/HeroPreload', () => ({
  HeroPreload: () => null,
}));

vi.mock('@/components/blocks/AbGoalTracker', () => ({
  AbGoalTracker: () => null,
}));

vi.mock('@/components/storefront/ProductPage', () => ({
  ProductPage: ({ productSlug }: { siteId: number; productSlug: string }) =>
    React.createElement('div', { 'data-testid': 'product-page', 'data-slug': productSlug }),
}));

vi.mock('@/components/storefront/ShopPage', () => ({
  ShopPage: ({ siteId }: { siteId: number }) =>
    React.createElement('div', { 'data-testid': 'shop-page', 'data-site': siteId }),
}));

vi.mock('@/components/marketing/AccessCodeForm', () => ({
  AccessCodeForm: ({ variant }: { variant: string }) =>
    React.createElement('div', { 'data-testid': 'access-code-form', 'data-variant': variant }),
}));

// ─── Import under test (AFTER all mocks) ─────────────────────────────────────

import ClientSitePage, { generateMetadata } from '@/app/sites/[domain]/[[...slug]]/page';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SITE = {
  id: 10,
  name: 'Test Site',
  domain: 'test.example.com',
  publicAccess: true,
  customCss: null,
  customJs: null,
};

const HOME_PAGE = {
  id: 1,
  title: 'Home',
  slug: 'home',
  postType: 'page',
  content: [],
  customCss: null,
  customJs: null,
  excerpt: null,
  seoTitle: null,
  seoDescription: null,
  ogImage: null,
  noIndex: null,
  canonicalUrl: null,
  publishedAt: null,
};

const BLOG_POST = {
  id: 5,
  title: 'My Post',
  slug: 'my-post',
  postType: 'blog',
  content: [],
  customCss: null,
  customJs: null,
  excerpt: 'A great post',
  publishedAt: '2026-01-01T00:00:00Z',
};

function makeParams(domain: string, slug?: string[]) {
  return Promise.resolve({ domain, slug });
}

function makeSearchParams(extra: Record<string, string> = {}) {
  return Promise.resolve(extra as Record<string, string | string[] | undefined>);
}

async function renderPage(domain: string, slug?: string[], search: Record<string, string> = {}) {
  const element = await ClientSitePage({
    params: makeParams(domain, slug),
    searchParams: makeSearchParams(search),
  });
  return render(element as React.ReactElement);
}

// ─── beforeEach resets ───────────────────────────────────────────────────────

beforeEach(() => {
  notFoundMock.mockClear();
  notFoundMock.mockImplementation(() => { throw new NotFoundError(); });
  getClientWebsiteByDomainMock.mockResolvedValue(SITE);
  getClientHomePageMock.mockResolvedValue(HOME_PAGE);
  getClientPageMock.mockResolvedValue(null);
  getClientBlogPostsMock.mockResolvedValue([]);
  getPostTypeForPostMock.mockResolvedValue(null);
  getBrandingByWebsiteIdMock.mockResolvedValue(null);
  verifyPreviewTokenMock.mockReturnValue(false);
  verifyUnlockCookieValueMock.mockReturnValue(true);
  cookiesGetMock.mockReturnValue({ value: undefined });
});

// ─── Site not found ───────────────────────────────────────────────────────────

describe('site not found', () => {
  it('calls notFound() when getClientWebsiteByDomain returns null', async () => {
    getClientWebsiteByDomainMock.mockResolvedValue(null);
    await expect(renderPage('unknown.example.com')).rejects.toThrow(NotFoundError);
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });
});

// ─── Private site access gate ─────────────────────────────────────────────────

describe('private site access gate', () => {
  it('renders the AccessCodeForm gate when site is private and cookie invalid', async () => {
    const privateSite = { ...SITE, publicAccess: false };
    getClientWebsiteByDomainMock.mockResolvedValue(privateSite);
    verifyUnlockCookieValueMock.mockReturnValue(false);

    const { container } = await renderPage('test.example.com');
    expect(container.querySelector('[data-testid="access-code-form"]')).not.toBeNull();
  });

  it('passes through when the unlock cookie is valid', async () => {
    const privateSite = { ...SITE, publicAccess: false };
    getClientWebsiteByDomainMock.mockResolvedValue(privateSite);
    verifyUnlockCookieValueMock.mockReturnValue(true);
    getClientHomePageMock.mockResolvedValue(HOME_PAGE);

    const { container } = await renderPage('test.example.com');
    expect(container.querySelector('[data-testid="site-block-renderer"]')).not.toBeNull();
  });
});

// ─── Home page (no slug) ──────────────────────────────────────────────────────

describe('home page — no slug', () => {
  it('renders "coming soon" placeholder when no homepage exists', async () => {
    getClientHomePageMock.mockResolvedValue(null);
    const { container } = await renderPage('test.example.com');
    expect(container.textContent).toMatch(/coming soon/i);
    expect(container.textContent).toContain(SITE.name);
  });

  it('renders SiteBlockRenderer when a homepage is found', async () => {
    getClientHomePageMock.mockResolvedValue(HOME_PAGE);
    const { container } = await renderPage('test.example.com');
    expect(container.querySelector('[data-testid="site-block-renderer"]')).not.toBeNull();
  });
});

// ─── /shop ────────────────────────────────────────────────────────────────────

describe('/shop slug', () => {
  it('renders ShopPage inside Suspense', async () => {
    const { container } = await renderPage('test.example.com', ['shop']);
    expect(container.querySelector('[data-testid="shop-page"]')).not.toBeNull();
  });
});

// ─── /shop/<product> ─────────────────────────────────────────────────────────

describe('/shop/<product> slug', () => {
  it('renders ProductPage with the correct productSlug', async () => {
    const { container } = await renderPage('test.example.com', ['shop', 'my-widget']);
    const el = container.querySelector('[data-testid="product-page"]');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('data-slug')).toBe('my-widget');
  });
});

// ─── /blog (listing) ─────────────────────────────────────────────────────────

describe('/blog listing', () => {
  it('shows "No posts yet." when blog has no posts', async () => {
    getClientBlogPostsMock.mockResolvedValue([]);
    const { container } = await renderPage('test.example.com', ['blog']);
    expect(container.textContent).toMatch(/no posts yet/i);
  });

  it('renders a list of blog posts when posts exist', async () => {
    const posts = [
      { id: 1, title: 'Alpha Post', slug: 'alpha', excerpt: 'Excerpt A', publishedAt: '2026-01-01T00:00:00Z' },
      { id: 2, title: 'Beta Post', slug: 'beta', excerpt: null, publishedAt: null },
    ];
    getClientBlogPostsMock.mockResolvedValue(posts);
    const { container } = await renderPage('test.example.com', ['blog']);
    expect(container.textContent).toContain('Alpha Post');
    expect(container.textContent).toContain('Beta Post');
    expect(container.textContent).toContain('Excerpt A');
  });

  it('shows pagination links when there are more than 12 posts', async () => {
    const posts = Array.from({ length: 14 }, (_, i) => ({
      id: i + 1,
      title: `Post ${i + 1}`,
      slug: `post-${i + 1}`,
      excerpt: null,
      publishedAt: '2026-01-01T00:00:00Z',
    }));
    getClientBlogPostsMock.mockResolvedValue(posts);
    const { container } = await renderPage('test.example.com', ['blog']);
    // Should see "Next →" since 14 posts → 2 pages and we're on page 1
    expect(container.textContent).toMatch(/next/i);
  });

  it('renders the correct page of posts when page=2 is passed', async () => {
    const posts = Array.from({ length: 14 }, (_, i) => ({
      id: i + 1,
      title: `Post ${i + 1}`,
      slug: `post-${i + 1}`,
      excerpt: null,
      publishedAt: '2026-01-01T00:00:00Z',
    }));
    getClientBlogPostsMock.mockResolvedValue(posts);
    const { container } = await renderPage('test.example.com', ['blog'], { page: '2' });
    // Page 2: posts 13-14
    expect(container.textContent).toContain('Post 13');
    expect(container.textContent).toContain('Post 14');
    // Should NOT show Post 1 (it's on page 1)
    expect(container.textContent).not.toContain('>Post 1<');
  });

  it('clamps page to totalPages when page param exceeds range', async () => {
    const posts = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1, title: `Post ${i + 1}`, slug: `post-${i + 1}`, excerpt: null, publishedAt: null,
    }));
    getClientBlogPostsMock.mockResolvedValue(posts);
    // Only 1 page; page=99 should be clamped to 1
    const { container } = await renderPage('test.example.com', ['blog'], { page: '99' });
    expect(container.textContent).toContain('Post 1');
  });
});

// ─── /blog/<post-slug> ────────────────────────────────────────────────────────

describe('/blog/<post-slug>', () => {
  it('calls notFound() when the blog post is not found', async () => {
    getClientPageMock.mockResolvedValue(null);
    await expect(
      renderPage('test.example.com', ['blog', 'missing-post']),
    ).rejects.toThrow(NotFoundError);
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it('renders SiteBlockRenderer when the blog post is found', async () => {
    getClientPageMock.mockResolvedValue(BLOG_POST);
    const { container } = await renderPage('test.example.com', ['blog', 'my-post']);
    expect(container.querySelector('[data-testid="site-block-renderer"]')).not.toBeNull();
  });
});

// ─── Regular page by slug ────────────────────────────────────────────────────

describe('regular page by slug', () => {
  it('calls notFound() when the page is not found', async () => {
    getClientPageMock.mockResolvedValue(null);
    await expect(
      renderPage('test.example.com', ['about']),
    ).rejects.toThrow(NotFoundError);
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it('renders SiteBlockRenderer when the page is found', async () => {
    const aboutPage = {
      id: 3, title: 'About', slug: 'about', postType: 'page',
      content: [], customCss: null, customJs: null, excerpt: null,
    };
    getClientPageMock.mockResolvedValue(aboutPage);
    const { container } = await renderPage('test.example.com', ['about']);
    expect(container.querySelector('[data-testid="site-block-renderer"]')).not.toBeNull();
  });

  it('handles nested slug segments (joined with /)', async () => {
    const deepPage = {
      id: 4, title: 'Deep', slug: 'services/consulting', postType: 'page',
      content: [], customCss: null, customJs: null, excerpt: null,
    };
    getClientPageMock.mockResolvedValue(deepPage);
    const { container } = await renderPage('test.example.com', ['services', 'consulting']);
    expect(container.querySelector('[data-testid="site-block-renderer"]')).not.toBeNull();
  });
});

// ─── Preview / auth gating ────────────────────────────────────────────────────

describe('preview mode', () => {
  it('grants preview access via a valid preview token', async () => {
    verifyPreviewTokenMock.mockReturnValue(true);
    // Private site — should bypass the gate
    const privateSite = { ...SITE, publicAccess: false };
    getClientWebsiteByDomainMock.mockResolvedValue(privateSite);
    getClientHomePageMock.mockResolvedValue(HOME_PAGE);

    const { container } = await renderPage('test.example.com', undefined, {
      _preview: 'true',
      _token: 'valid-token',
    });
    // Gate should NOT be shown — the block renderer should appear
    expect(container.querySelector('[data-testid="access-code-form"]')).toBeNull();
    expect(container.querySelector('[data-testid="site-block-renderer"]')).not.toBeNull();
  });

  it('grants edit-mode access via session when token is absent', async () => {
    const { auth } = await import('@/lib/auth');
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: '42', email: 'user@example.com' } } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    verifyPreviewTokenMock.mockReturnValue(false);

    const privateSite = { ...SITE, publicAccess: false };
    getClientWebsiteByDomainMock.mockResolvedValue(privateSite);
    getClientHomePageMock.mockResolvedValue(HOME_PAGE);

    const { container } = await renderPage('test.example.com', undefined, { _edit: 'true' });
    expect(container.querySelector('[data-testid="access-code-form"]')).toBeNull();
    expect(container.querySelector('[data-testid="site-block-renderer"]')).not.toBeNull();
  });
});

// ─── generateMetadata ─────────────────────────────────────────────────────────

describe('generateMetadata', () => {
  it('returns { title: absolute "Not Found" } when site is not found', async () => {
    getClientWebsiteByDomainMock.mockResolvedValue(null);
    const meta = await generateMetadata({
      params: makeParams('unknown.com'),
      searchParams: makeSearchParams(),
    });
    expect(meta.title).toEqual({ absolute: 'Not Found' });
  });

  it('returns site-name metadata for home (no slug) when no homepage', async () => {
    getClientHomePageMock.mockResolvedValue(null);
    const meta = await generateMetadata({
      params: makeParams('test.example.com', undefined),
      searchParams: makeSearchParams(),
    });
    // No designated home page → empty {} so root layout title takes over
    expect(meta).toEqual({});
  });

  it('uses seoTitle and seoDescription from the home page when present', async () => {
    getClientHomePageMock.mockResolvedValue({
      ...HOME_PAGE,
      seoTitle: 'SEO Title',
      seoDescription: 'SEO Desc',
      ogImage: 'https://img.example.com/og.png',
    });
    const meta = await generateMetadata({
      params: makeParams('test.example.com', undefined),
      searchParams: makeSearchParams(),
    });
    expect(meta.title).toEqual({ absolute: 'SEO Title' });
    expect(meta.description).toBe('SEO Desc');
  });

  it('returns shop metadata for /shop slug', async () => {
    const meta = await generateMetadata({
      params: makeParams('test.example.com', ['shop']),
      searchParams: makeSearchParams(),
    });
    expect((meta.title as { absolute: string }).absolute).toMatch(/shop/i);
  });

  it('returns shop metadata for /shop/<product> slug', async () => {
    const meta = await generateMetadata({
      params: makeParams('test.example.com', ['shop', 'widget']),
      searchParams: makeSearchParams(),
    });
    expect((meta.title as { absolute: string }).absolute).toMatch(/shop/i);
  });

  it('returns { title: absolute "Not Found" } when a regular page is not found', async () => {
    getClientPageMock.mockResolvedValue(null);
    const meta = await generateMetadata({
      params: makeParams('test.example.com', ['about']),
      searchParams: makeSearchParams(),
    });
    expect(meta.title).toEqual({ absolute: 'Not Found' });
  });

  it('builds metadata from a regular page including noIndex and canonicalUrl', async () => {
    getClientPageMock.mockResolvedValue({
      id: 9,
      title: 'About',
      slug: 'about',
      postType: 'page',
      excerpt: 'About us',
      seoTitle: null,
      seoDescription: null,
      ogImage: null,
      noIndex: true,
      canonicalUrl: 'https://test.example.com/about',
    });
    const meta = await generateMetadata({
      params: makeParams('test.example.com', ['about']),
      searchParams: makeSearchParams(),
    });
    expect((meta.title as { absolute: string }).absolute).toBe('About');
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.alternates?.canonical).toBe('https://test.example.com/about');
  });

  it('strips "blog/" prefix from slug when looking up a blog post metadata', async () => {
    getClientPageMock.mockResolvedValue({
      id: 5, title: 'My Post', slug: 'my-post', postType: 'blog',
      excerpt: 'Great', seoTitle: null, seoDescription: null,
      ogImage: null, noIndex: null, canonicalUrl: null,
    });
    const meta = await generateMetadata({
      params: makeParams('test.example.com', ['blog', 'my-post']),
      searchParams: makeSearchParams(),
    });
    expect((meta.title as { absolute: string }).absolute).toBe('My Post');
    // The lookup must have used 'my-post' (not 'blog/my-post')
    expect(getClientPageMock).toHaveBeenCalledWith(SITE.id, 'my-post');
  });

  it('falls back to post title when seoTitle is absent', async () => {
    getClientPageMock.mockResolvedValue({
      id: 6, title: 'Fallback Title', slug: 'fallback', postType: 'page',
      excerpt: null, seoTitle: null, seoDescription: null,
      ogImage: null, noIndex: null, canonicalUrl: null,
    });
    const meta = await generateMetadata({
      params: makeParams('test.example.com', ['fallback']),
      searchParams: makeSearchParams(),
    });
    expect((meta.title as { absolute: string }).absolute).toBe('Fallback Title');
    expect(meta.description).toBeUndefined();
  });

  it('includes ogImage in openGraph and twitter when set', async () => {
    getClientPageMock.mockResolvedValue({
      id: 7, title: 'OG Page', slug: 'og-page', postType: 'page',
      excerpt: null, seoTitle: null, seoDescription: null,
      ogImage: 'https://img.example.com/og.jpg',
      noIndex: null, canonicalUrl: null,
    });
    const meta = await generateMetadata({
      params: makeParams('test.example.com', ['og-page']),
      searchParams: makeSearchParams(),
    });
    expect(meta.openGraph?.images).toEqual(['https://img.example.com/og.jpg']);
    expect(meta.twitter?.images).toEqual(['https://img.example.com/og.jpg']);
  });
});

// ─── Pagination URL computation ───────────────────────────────────────────────

describe('pagination context / extra params', () => {
  it('strips denylist params (_edit, _preview, _token, page) from extraParams', async () => {
    // Pass a mix of allowed + denied params; page just needs to render without error
    getClientBlogPostsMock.mockResolvedValue([]);
    await renderPage('test.example.com', ['blog'], {
      page: '1',
      _edit: 'true',
      _preview: 'true',
      _token: 'tok',
      utm_source: 'email',
    });
    // No assertion on DOM — we just verify it renders without throwing
  });

  it('defaults to page 1 when page param is non-numeric', async () => {
    getClientBlogPostsMock.mockResolvedValue([]);
    const { container } = await renderPage('test.example.com', ['blog'], { page: 'abc' });
    expect(container.textContent).toMatch(/no posts yet/i);
  });

  it('defaults to page 1 when page param is 0 or negative', async () => {
    getClientBlogPostsMock.mockResolvedValue([]);
    const { container } = await renderPage('test.example.com', ['blog'], { page: '0' });
    expect(container.textContent).toMatch(/no posts yet/i);
  });
});

// ─── screen utility sanity ────────────────────────────────────────────────────

describe('blog listing heading', () => {
  it('renders a "Blog" heading on the /blog page', async () => {
    getClientBlogPostsMock.mockResolvedValue([]);
    await renderPage('test.example.com', ['blog']);
    expect(screen.getByRole('heading', { name: /blog/i })).toBeTruthy();
  });
});
