// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRouterPush = vi.fn();
const mockRouterRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    refresh: mockRouterRefresh,
    replace: vi.fn(),
  }),
  usePathname: () => '/portal/websites/1/posts',
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// ---------------------------------------------------------------------------
// Global fetch mock
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

// window.confirm and window.alert stubs
const mockConfirm = vi.fn();
const mockAlert = vi.fn();
Object.defineProperty(window, 'confirm', { value: mockConfirm, writable: true });
Object.defineProperty(window, 'alert', { value: mockAlert, writable: true });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePost(overrides: Partial<{
  id: number;
  title: string;
  slug: string;
  postType: string;
  published: boolean;
  updatedAt: Date;
}> = {}) {
  return {
    id: overrides.id ?? 1,
    title: overrides.title ?? 'My Page',
    slug: overrides.slug ?? 'my-page',
    postType: overrides.postType ?? 'page',
    published: overrides.published ?? false,
    updatedAt: overrides.updatedAt ?? new Date('2025-01-15'),
  };
}

const defaultContentTypes = [
  { slug: 'page', name: 'Pages', icon: 'article' },
  { slug: 'blog', name: 'Blog', icon: 'rss_feed' },
];

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------

import ContentList from '@/app/portal/websites/[siteId]/ContentList';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContentList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfirm.mockReturnValue(false); // safe default: deny delete
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  it('shows empty state when no posts and no search', () => {
    render(
      <ContentList
        siteId={1}
        posts={[]}
        contentTypes={[]}
        activeType={null}
      />,
    );
    expect(screen.getByText('No pages yet')).toBeTruthy();
    expect(screen.getByText(/Create your first page/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Create Page/ })).toBeTruthy();
  });

  it('shows "No <type> content yet" when activeType set and no posts', () => {
    render(
      <ContentList
        siteId={1}
        posts={[]}
        contentTypes={defaultContentTypes}
        activeType="blog"
      />,
    );
    expect(screen.getByText('No blog content yet')).toBeTruthy();
  });

  // ── Basic render with posts ────────────────────────────────────────────────

  it('renders post titles in the table', () => {
    const posts = [
      makePost({ id: 1, title: 'Home Page', slug: 'home' }),
      makePost({ id: 2, title: 'About Us', slug: 'about' }),
    ];
    render(
      <ContentList siteId={1} posts={posts} contentTypes={[]} activeType={null} />,
    );
    expect(screen.getByText('Home Page')).toBeTruthy();
    expect(screen.getByText('About Us')).toBeTruthy();
  });

  it('renders post slug in the table', () => {
    render(
      <ContentList
        siteId={1}
        posts={[makePost({ slug: 'my-slug' })]}
        contentTypes={[]}
        activeType={null}
      />,
    );
    expect(screen.getByText('/my-slug')).toBeTruthy();
  });

  it('renders "Untitled" for posts with empty title', () => {
    render(
      <ContentList
        siteId={1}
        posts={[makePost({ title: '' })]}
        contentTypes={[]}
        activeType={null}
      />,
    );
    // "Untitled" appears both as link text and in delete aria-label
    expect(screen.getAllByText('Untitled').length).toBeGreaterThan(0);
  });

  it('shows Published badge for published posts', () => {
    render(
      <ContentList
        siteId={1}
        posts={[makePost({ published: true })]}
        contentTypes={[]}
        activeType={null}
      />,
    );
    expect(screen.getByText('Published')).toBeTruthy();
  });

  it('shows Draft badge for unpublished posts', () => {
    render(
      <ContentList
        siteId={1}
        posts={[makePost({ published: false })]}
        contentTypes={[]}
        activeType={null}
      />,
    );
    expect(screen.getByText('Draft')).toBeTruthy();
  });

  it('renders edit link pointing to correct path', () => {
    render(
      <ContentList
        siteId={7}
        posts={[makePost({ id: 42 })]}
        contentTypes={[]}
        activeType={null}
      />,
    );
    const link = screen.getByRole('link', { name: /My Page/ });
    expect(link.getAttribute('href')).toBe('/portal/websites/7/posts/42/edit');
  });

  // ── Content-type tabs ──────────────────────────────────────────────────────

  it('renders content type tabs when contentTypes is non-empty', () => {
    render(
      <ContentList
        siteId={1}
        posts={[makePost()]}
        contentTypes={defaultContentTypes}
        activeType={null}
      />,
    );
    expect(screen.getByRole('button', { name: /All/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Pages/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Blog/ })).toBeTruthy();
  });

  it('does not render tab bar when contentTypes is empty', () => {
    render(
      <ContentList siteId={1} posts={[makePost()]} contentTypes={[]} activeType={null} />,
    );
    expect(screen.queryByRole('button', { name: /All/ })).toBeNull();
  });

  it('clicking a content type tab pushes correct URL', () => {
    render(
      <ContentList
        siteId={1}
        posts={[makePost()]}
        contentTypes={defaultContentTypes}
        activeType={null}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Blog/ }));
    expect(mockRouterPush).toHaveBeenCalledWith(
      expect.stringContaining('type=blog'),
    );
  });

  it('clicking "All" tab pushes pathname without type param', () => {
    render(
      <ContentList
        siteId={1}
        posts={[makePost()]}
        contentTypes={defaultContentTypes}
        activeType="blog"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /All/ }));
    expect(mockRouterPush).toHaveBeenCalledWith('/portal/websites/1/posts');
  });

  // ── Search ─────────────────────────────────────────────────────────────────

  it('filters posts by title search', () => {
    const posts = [
      makePost({ id: 1, title: 'Contact Us' }),
      makePost({ id: 2, title: 'About Page' }),
    ];
    render(
      <ContentList siteId={1} posts={posts} contentTypes={[]} activeType={null} />,
    );
    const searchInput = screen.getByPlaceholderText('Search pages...');
    fireEvent.change(searchInput, { target: { value: 'contact' } });
    expect(screen.getByText('Contact Us')).toBeTruthy();
    expect(screen.queryByText('About Page')).toBeNull();
  });

  it('filters posts by slug search', () => {
    const posts = [
      makePost({ id: 1, slug: 'contact-us', title: 'Contact' }),
      makePost({ id: 2, slug: 'about', title: 'About' }),
    ];
    render(
      <ContentList siteId={1} posts={posts} contentTypes={[]} activeType={null} />,
    );
    fireEvent.change(screen.getByPlaceholderText('Search pages...'), {
      target: { value: 'contact-us' },
    });
    expect(screen.getByText('Contact')).toBeTruthy();
    expect(screen.queryByText('About')).toBeNull();
  });

  it('shows no-results empty state when search has no matches', () => {
    render(
      <ContentList
        siteId={1}
        posts={[makePost({ title: 'Home' })]}
        contentTypes={[]}
        activeType={null}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText('Search pages...'), {
      target: { value: 'zzz-no-match' },
    });
    expect(screen.getByText('No results found')).toBeTruthy();
    expect(screen.getByText(/No pages matching "zzz-no-match"/)).toBeTruthy();
    // Create Page link should NOT appear in no-results state
    expect(screen.queryByRole('link', { name: /Create Page/ })).toBeNull();
  });

  it('clear button appears when search is non-empty and clears on click', () => {
    render(
      <ContentList
        siteId={1}
        posts={[makePost()]}
        contentTypes={[]}
        activeType={null}
      />,
    );
    const input = screen.getByPlaceholderText('Search pages...');
    fireEvent.change(input, { target: { value: 'hello' } });
    // The clear button has accessible name "close" (from icon text content)
    const allButtons = screen.getAllByRole('button');
    const closeBtn = allButtons.find(
      (b) => b.querySelector('.material-icons')?.textContent === 'close',
    );
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn!);
    expect((input as HTMLInputElement).value).toBe('');
  });

  // ── Sorting ────────────────────────────────────────────────────────────────

  it('clicking Title header sorts by title ascending', () => {
    const posts = [
      makePost({ id: 1, title: 'Zebra' }),
      makePost({ id: 2, title: 'Apple' }),
    ];
    render(
      <ContentList siteId={1} posts={posts} contentTypes={[]} activeType={null} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Title/ }));
    const rows = screen.getAllByRole('row');
    // rows[0] is header, rows[1] is first data row
    expect(rows[1].textContent).toContain('Apple');
    expect(rows[2].textContent).toContain('Zebra');
  });

  it('clicking Title header twice toggles to descending', () => {
    const posts = [
      makePost({ id: 1, title: 'Zebra' }),
      makePost({ id: 2, title: 'Apple' }),
    ];
    render(
      <ContentList siteId={1} posts={posts} contentTypes={[]} activeType={null} />,
    );
    const titleBtn = screen.getByRole('button', { name: /Title/ });
    fireEvent.click(titleBtn);
    fireEvent.click(titleBtn);
    const rows = screen.getAllByRole('row');
    expect(rows[1].textContent).toContain('Zebra');
  });

  it('clicking Slug header sorts by slug', () => {
    const posts = [
      makePost({ id: 1, slug: 'zzz', title: 'Z' }),
      makePost({ id: 2, slug: 'aaa', title: 'A' }),
    ];
    render(
      <ContentList siteId={1} posts={posts} contentTypes={[]} activeType={null} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Slug/ }));
    const rows = screen.getAllByRole('row');
    expect(rows[1].textContent).toContain('/aaa');
  });

  it('clicking Status header sorts by published', () => {
    const posts = [
      makePost({ id: 1, published: true, title: 'Published Post' }),
      makePost({ id: 2, published: false, title: 'Draft Post' }),
    ];
    render(
      <ContentList siteId={1} posts={posts} contentTypes={[]} activeType={null} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Status/ }));
    // ascending: false(0) before true(1) → Draft first
    const rows = screen.getAllByRole('row');
    expect(rows[1].textContent).toContain('Draft Post');
  });

  it('default sort is by updatedAt descending (newest first)', () => {
    const posts = [
      makePost({ id: 1, title: 'Old', updatedAt: new Date('2020-01-01') }),
      makePost({ id: 2, title: 'New', updatedAt: new Date('2024-01-01') }),
    ];
    render(
      <ContentList siteId={1} posts={posts} contentTypes={[]} activeType={null} />,
    );
    const rows = screen.getAllByRole('row');
    expect(rows[1].textContent).toContain('New');
    expect(rows[2].textContent).toContain('Old');
  });

  // ── Pagination ─────────────────────────────────────────────────────────────

  it('shows pagination controls when posts exceed page size', () => {
    // Default page size is 25; render 30 posts
    const posts = Array.from({ length: 30 }, (_, i) =>
      makePost({ id: i + 1, title: `Post ${i + 1}`, slug: `post-${i + 1}` }),
    );
    render(
      <ContentList siteId={1} posts={posts} contentTypes={[]} activeType={null} />,
    );
    // "Page 1 of 2" should appear
    expect(screen.getByText(/Page 1 of 2/)).toBeTruthy();
  });

  it('next page button navigates to page 2', () => {
    const posts = Array.from({ length: 30 }, (_, i) =>
      makePost({ id: i + 1, title: `Post ${i + 1}`, slug: `post-${i + 1}` }),
    );
    render(
      <ContentList siteId={1} posts={posts} contentTypes={[]} activeType={null} />,
    );
    const nextBtn = screen.getByRole('button', { name: /Next page/ });
    fireEvent.click(nextBtn);
    expect(screen.getByText(/Page 2 of 2/)).toBeTruthy();
  });

  it('prev page button navigates back', () => {
    const posts = Array.from({ length: 30 }, (_, i) =>
      makePost({ id: i + 1, title: `Post ${i + 1}`, slug: `post-${i + 1}` }),
    );
    render(
      <ContentList siteId={1} posts={posts} contentTypes={[]} activeType={null} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Next page/ }));
    fireEvent.click(screen.getByRole('button', { name: /Previous page/ }));
    expect(screen.getByText(/Page 1 of 2/)).toBeTruthy();
  });

  it('first/last page buttons jump to extremes', () => {
    const posts = Array.from({ length: 55 }, (_, i) =>
      makePost({ id: i + 1, title: `Post ${i + 1}`, slug: `post-${i + 1}` }),
    );
    render(
      <ContentList siteId={1} posts={posts} contentTypes={[]} activeType={null} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Last page/ }));
    expect(screen.getByText(/Page 3 of 3/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /First page/ }));
    expect(screen.getByText(/Page 1 of 3/)).toBeTruthy();
  });

  it('first/prev page buttons are disabled on first page', () => {
    const posts = Array.from({ length: 30 }, (_, i) =>
      makePost({ id: i + 1, title: `Post ${i + 1}`, slug: `post-${i + 1}` }),
    );
    render(
      <ContentList siteId={1} posts={posts} contentTypes={[]} activeType={null} />,
    );
    expect(screen.getByRole('button', { name: /First page/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Previous page/ })).toBeDisabled();
  });

  it('next/last page buttons are disabled on last page', () => {
    const posts = Array.from({ length: 30 }, (_, i) =>
      makePost({ id: i + 1, title: `Post ${i + 1}`, slug: `post-${i + 1}` }),
    );
    render(
      <ContentList siteId={1} posts={posts} contentTypes={[]} activeType={null} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Last page/ }));
    expect(screen.getByRole('button', { name: /Next page/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Last page/ })).toBeDisabled();
  });

  it('shows correct row count range', () => {
    const posts = Array.from({ length: 30 }, (_, i) =>
      makePost({ id: i + 1, title: `Post ${i + 1}`, slug: `post-${i + 1}` }),
    );
    render(
      <ContentList siteId={1} posts={posts} contentTypes={[]} activeType={null} />,
    );
    expect(screen.getByText(/1–25 of 30/)).toBeTruthy();
  });

  it('page size selector changes visible rows', () => {
    const posts = Array.from({ length: 30 }, (_, i) =>
      makePost({ id: i + 1, title: `Post ${i + 1}`, slug: `post-${i + 1}` }),
    );
    render(
      <ContentList siteId={1} posts={posts} contentTypes={[]} activeType={null} />,
    );
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '10' } });
    expect(screen.getByText(/1–10 of 30/)).toBeTruthy();
    expect(screen.getByText(/Page 1 of 3/)).toBeTruthy();
  });

  // ── Delete ─────────────────────────────────────────────────────────────────

  it('delete button shows confirm dialog and does nothing if cancelled', async () => {
    mockConfirm.mockReturnValue(false);
    render(
      <ContentList
        siteId={1}
        posts={[makePost()]}
        contentTypes={[]}
        activeType={null}
      />,
    );
    const deleteBtn = screen.getByRole('button', { name: /Delete My Page/ });
    fireEvent.click(deleteBtn);
    expect(mockConfirm).toHaveBeenCalledWith(
      'Delete "My Page"? This cannot be undone.',
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('successful delete calls fetch DELETE and refreshes router', async () => {
    mockConfirm.mockReturnValue(true);
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ success: true }),
    } as Response);

    render(
      <ContentList
        siteId={5}
        posts={[makePost({ id: 99, title: 'Old Post' })]}
        contentTypes={[]}
        activeType={null}
      />,
    );
    const deleteBtn = screen.getByRole('button', { name: /Delete Old Post/ });
    await act(async () => { fireEvent.click(deleteBtn); });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/portal/cms/websites/5/posts/99',
      { method: 'DELETE' },
    );
    await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
  });

  it('shows alert when delete API returns failure', async () => {
    mockConfirm.mockReturnValue(true);
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ success: false, message: 'Permission denied' }),
    } as Response);

    render(
      <ContentList
        siteId={1}
        posts={[makePost()]}
        contentTypes={[]}
        activeType={null}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Delete My Page/ }));
    });
    await waitFor(() => expect(mockAlert).toHaveBeenCalledWith('Permission denied'));
  });

  it('shows alert on delete network error', async () => {
    mockConfirm.mockReturnValue(true);
    mockFetch.mockRejectedValueOnce(new Error('network'));

    render(
      <ContentList
        siteId={1}
        posts={[makePost()]}
        contentTypes={[]}
        activeType={null}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Delete My Page/ }));
    });
    await waitFor(() =>
      expect(mockAlert).toHaveBeenCalledWith('Network error while deleting'),
    );
  });

  it('delete button is disabled while deletion is in progress', async () => {
    mockConfirm.mockReturnValue(true);
    let resolve: (v: unknown) => void = () => {};
    mockFetch.mockReturnValueOnce(new Promise((r) => { resolve = r; }));

    render(
      <ContentList
        siteId={1}
        posts={[makePost()]}
        contentTypes={[]}
        activeType={null}
      />,
    );
    const deleteBtn = screen.getByRole('button', { name: /Delete My Page/ });
    act(() => { fireEvent.click(deleteBtn); });

    await waitFor(() => expect(deleteBtn.disabled).toBe(true));
    // Resolve to clean up
    act(() => { resolve({ json: async () => ({ success: true }) }); });
  });

  // ── Sort icon state ────────────────────────────────────────────────────────

  it('shows arrow_upward icon on active ascending sort column', () => {
    render(
      <ContentList
        siteId={1}
        posts={[makePost()]}
        contentTypes={[]}
        activeType={null}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Title/ }));
    // After clicking Title once, sortDir becomes 'asc'
    const titleHeader = screen.getByRole('button', { name: /Title/ });
    const icon = titleHeader.querySelector('.material-icons');
    expect(icon?.textContent).toBe('arrow_upward');
  });

  it('shows arrow_downward icon on active descending sort column', () => {
    render(
      <ContentList
        siteId={1}
        posts={[makePost()]}
        contentTypes={[]}
        activeType={null}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Title/ }));
    fireEvent.click(screen.getByRole('button', { name: /Title/ }));
    const titleHeader = screen.getByRole('button', { name: /Title/ });
    const icon = titleHeader.querySelector('.material-icons');
    expect(icon?.textContent).toBe('arrow_downward');
  });

  // ── Search resets page ─────────────────────────────────────────────────────

  it('searching resets to page 1', () => {
    const posts = Array.from({ length: 30 }, (_, i) =>
      makePost({ id: i + 1, title: `Post ${i + 1}`, slug: `post-${i + 1}` }),
    );
    render(
      <ContentList siteId={1} posts={posts} contentTypes={[]} activeType={null} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Next page/ }));
    expect(screen.getByText(/Page 2 of 2/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Search pages...'), {
      target: { value: 'Post 1' },
    });
    expect(screen.getByText(/Page 1 of/)).toBeTruthy();
  });
});
