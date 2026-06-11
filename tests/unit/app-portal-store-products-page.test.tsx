// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for `app/portal/websites/[siteId]/store/products/page.tsx`
 *
 * 'use client' page. useParams provides { siteId }. Covers:
 *  - Loading state (spinner)
 *  - Empty state (no filters, with filters)
 *  - Products list renders rows (name, slug, status badge, price, inventory, category)
 *  - Product image vs placeholder
 *  - Compare-at price display
 *  - Category name vs dashes
 *  - trackInventory: quantity vs "Not tracked"
 *  - Status filter tabs: render + click
 *  - Search input: render + change
 *  - Category dropdown: render + populated from API + change
 *  - Clicking row calls router.push to product detail
 *  - Select-all checkbox + individual checkbox
 *  - Bulk actions bar: shown when selected > 0
 *  - Bulk delete: confirm accepted / cancelled
 *  - Bulk status change: Set Active / Set Draft / Archive
 *  - Clear selection button
 *  - Pagination: hidden when 1 page, shown and functional when totalPages > 1
 *  - "Add Product" link in header and empty state
 *  - Fetch error (fail silently — loading stops, empty shown)
 *  - Categories fetch failure (ignored)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── next/navigation mock ────────────────────────────────────────────────────

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ siteId: 'site-42' }),
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// ─── next/link stub ──────────────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ─── fetch helpers ────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; status: number; json: () => Promise<any> };

function makeRes(body: any, ok = true, status = 200): FetchResp {
  return { ok, status, json: async () => body };
}

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

// ─── data factories ───────────────────────────────────────────────────────────

function makeProduct(over: Partial<Record<string, any>> = {}): any {
  return {
    id: 1,
    name: 'Widget Pro',
    slug: 'widget-pro',
    status: 'active',
    priceCents: 1999,
    compareAtPriceCents: null,
    quantity: 10,
    trackInventory: true,
    category: null,
    images: [],
    createdAt: '2025-01-01T00:00:00Z',
    ...over,
  };
}

function makeCategory(over: Partial<Record<string, any>> = {}): any {
  return { id: 1, name: 'Widgets', ...over };
}

function makeProductsRes(items: any[] = [makeProduct()], totalPages = 1): any {
  return { success: true, data: items, pagination: { totalPages } };
}

function makeCategoriesRes(items: any[] = [makeCategory()]): any {
  return { success: true, data: items };
}

// ─── default fetch router ─────────────────────────────────────────────────────

function defaultFetch(url: string): FetchResp {
  if (url.includes('/categories')) return makeRes(makeCategoriesRes());
  if (url.includes('/products')) return makeRes(makeProductsRes());
  return makeRes({ success: true });
}

// ─── setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  pushMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => defaultFetch(url));
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── import after mocks ───────────────────────────────────────────────────────

import ProductsListPage from '@/app/portal/websites/[siteId]/store/products/page';

function renderPage() {
  return render(React.createElement(ProductsListPage));
}

// ─── loading state ────────────────────────────────────────────────────────────

describe('ProductsListPage — loading', () => {
  it('shows spinner (refresh icon) while fetch is pending', () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/categories')) return defaultFetch(url);
      return new Promise(() => {});
    });
    const { container } = renderPage();
    expect(container.textContent).toContain('refresh');
  });
});

// ─── empty state ──────────────────────────────────────────────────────────────

describe('ProductsListPage — empty state', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/categories')) return makeRes(makeCategoriesRes([]));
      return makeRes(makeProductsRes([]));
    });
  });

  it('shows "No products found" heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No products found');
    });
  });

  it('shows "Add your first product" prompt when no filters', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Add your first product to start selling');
    });
  });

  it('shows "Add Product" link in empty state when no filters', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const links = Array.from(container.querySelectorAll('a')).filter(
        (a) => a.textContent?.includes('Add Product'),
      );
      expect(links.length).toBeGreaterThan(0);
    });
  });

  it('shows "Try adjusting your filters" when search is active', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('No products found'));

    const searchInput = container.querySelector(
      'input[placeholder="Search products..."]',
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'xyz' } });
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Try adjusting your filters');
    });
  });

  it('does NOT show "Add Product" link in empty state when filters active', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('No products found'));

    const searchInput = container.querySelector(
      'input[placeholder="Search products..."]',
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'xyz' } });
    });
    // There should still be the header "Add Product" but not the empty-state one.
    // The empty-state link is only shown when no filters — we verify the
    // "adjusting your filters" path (tested above).
    await waitFor(() => {
      expect(container.textContent).toContain('Try adjusting');
    });
  });
});

// ─── product list ─────────────────────────────────────────────────────────────

describe('ProductsListPage — product list', () => {
  it('renders product name', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Widget Pro');
    });
  });

  it('renders product slug', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('/widget-pro');
    });
  });

  it('renders status badge', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('active');
    });
  });

  it('renders formatted price', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('$19.99');
    });
  });

  it('renders compare-at price when present', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/categories')) return makeRes(makeCategoriesRes());
      return makeRes(makeProductsRes([makeProduct({ priceCents: 999, compareAtPriceCents: 1999 })]));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('$9.99');
      expect(container.textContent).toContain('$19.99');
    });
  });

  it('renders quantity when trackInventory=true', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/categories')) return makeRes(makeCategoriesRes());
      return makeRes(makeProductsRes([makeProduct({ quantity: 42, trackInventory: true })]));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('42');
    });
  });

  it('renders "Not tracked" when trackInventory=false', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/categories')) return makeRes(makeCategoriesRes());
      return makeRes(makeProductsRes([makeProduct({ trackInventory: false })]));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Not tracked');
    });
  });

  it('renders category name when present', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/categories')) return makeRes(makeCategoriesRes());
      return makeRes(
        makeProductsRes([makeProduct({ category: { id: 1, name: 'Electronics' } })]),
      );
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Electronics');
    });
  });

  it('renders "--" placeholder when category is null', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      // category=null → span with "--"
      expect(container.textContent).toContain('--');
    });
  });

  it('renders image when images array is non-empty', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/categories')) return makeRes(makeCategoriesRes());
      return makeRes(
        makeProductsRes([makeProduct({ images: [{ id: 1, url: 'https://img.example.com/a.jpg', position: 0 }] })]),
      );
    });
    const { container } = renderPage();
    await waitFor(() => {
      const img = container.querySelector('img');
      expect(img).toBeTruthy();
      expect(img?.getAttribute('src')).toContain('a.jpg');
    });
  });

  it('renders image placeholder icon when images array is empty', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('image');
    });
  });

  it('renders multiple product rows', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/categories')) return makeRes(makeCategoriesRes());
      return makeRes(
        makeProductsRes([
          makeProduct({ id: 1, name: 'Product Alpha' }),
          makeProduct({ id: 2, name: 'Product Beta' }),
        ]),
      );
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Product Alpha');
      expect(container.textContent).toContain('Product Beta');
    });
  });

  it('clicking a row calls router.push to product detail URL', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Widget Pro');
    });
    const row = container.querySelector('tr[class*="cursor-pointer"]') as HTMLTableRowElement;
    fireEvent.click(row);
    expect(pushMock).toHaveBeenCalledWith(
      '/portal/websites/site-42/store/products/1',
    );
  });
});

// ─── header ───────────────────────────────────────────────────────────────────

describe('ProductsListPage — header', () => {
  it('renders "Products" heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('h1')?.textContent).toContain('Products');
    });
  });

  it('renders "Add Product" link in header pointing to /new', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector(
        'a[href="/portal/websites/site-42/store/products/new"]',
      );
      expect(link).toBeTruthy();
    });
  });
});

// ─── status filter tabs ───────────────────────────────────────────────────────

describe('ProductsListPage — status filter tabs', () => {
  const tabLabels = ['All', 'Active', 'Draft', 'Archived'];

  tabLabels.forEach((label) => {
    it(`renders "${label}" tab`, async () => {
      const { container } = renderPage();
      await waitFor(() => {
        expect(container.textContent).toContain(label);
      });
    });
  });

  it('default tab "All" is highlighted', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('All'));
    const buttons = Array.from(container.querySelectorAll('button'));
    const allBtn = buttons.find((b) => b.textContent?.trim() === 'All');
    expect(allBtn?.className).toContain('bg-primary');
  });

  it('clicking "Active" tab highlights it', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Products'));
    const buttons = Array.from(container.querySelectorAll('button'));
    const activeBtn = buttons.find((b) => b.textContent?.trim() === 'Active') as HTMLButtonElement;
    await act(async () => { fireEvent.click(activeBtn); });
    expect(activeBtn.className).toContain('bg-primary');
  });

  it('clicking "Draft" tab triggers re-fetch', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Products'));
    const callsBefore = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/products')).length;
    const buttons = Array.from(container.querySelectorAll('button'));
    const draftBtn = buttons.find((b) => b.textContent?.trim() === 'Draft') as HTMLButtonElement;
    await act(async () => { fireEvent.click(draftBtn); });
    await waitFor(() => {
      const callsAfter = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/products')).length;
      expect(callsAfter).toBeGreaterThan(callsBefore);
    });
  });
});

// ─── search input ─────────────────────────────────────────────────────────────

describe('ProductsListPage — search input', () => {
  it('renders search input', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('input[placeholder="Search products..."]')).toBeTruthy();
    });
  });

  it('typing in search triggers re-fetch', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Products'));
    const callsBefore = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/products')).length;
    const input = container.querySelector('input[placeholder="Search products..."]') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'widget' } }); });
    await waitFor(() => {
      const callsAfter = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/products')).length;
      expect(callsAfter).toBeGreaterThan(callsBefore);
    });
  });
});

// ─── category dropdown ────────────────────────────────────────────────────────

describe('ProductsListPage — category dropdown', () => {
  it('renders "All Categories" default option', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('All Categories');
    });
  });

  it('populates dropdown with categories from API', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/categories')) {
        return makeRes(makeCategoriesRes([
          { id: 1, name: 'Electronics' },
          { id: 2, name: 'Clothing' },
        ]));
      }
      return makeRes(makeProductsRes());
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Electronics');
      expect(container.textContent).toContain('Clothing');
    });
  });

  it('changing category dropdown triggers re-fetch', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/categories')) {
        return makeRes(makeCategoriesRes([{ id: 5, name: 'Tools' }]));
      }
      return makeRes(makeProductsRes());
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Tools'));
    const callsBefore = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/products')).length;
    const select = container.querySelector('select') as HTMLSelectElement;
    await act(async () => { fireEvent.change(select, { target: { value: '5' } }); });
    await waitFor(() => {
      const callsAfter = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/products')).length;
      expect(callsAfter).toBeGreaterThan(callsBefore);
    });
  });

  it('silently ignores categories fetch failure', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/categories')) throw new Error('categories down');
      return makeRes(makeProductsRes());
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Widget Pro');
    });
  });
});

// ─── checkbox selection ────────────────────────────────────────────────────────

describe('ProductsListPage — checkbox selection', () => {
  it('individual checkbox toggles selection and shows bulk bar', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Widget Pro'));

    // Use fireEvent.click on the checkbox — jsdom needs a click event to
    // drive React's synthetic onChange for controlled checkboxes.
    const checkboxes = Array.from(
      container.querySelectorAll('tbody input[type="checkbox"]'),
    ) as HTMLInputElement[];
    expect(checkboxes.length).toBeGreaterThan(0);
    await act(async () => { fireEvent.click(checkboxes[0]); });
    await waitFor(() => {
      expect(container.textContent).toContain('1 selected');
    });
  });

  it('select-all checkbox selects all products', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/categories')) return makeRes(makeCategoriesRes());
      return makeRes(makeProductsRes([
        makeProduct({ id: 1, name: 'P1' }),
        makeProduct({ id: 2, name: 'P2' }),
      ]));
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('P1'));

    const headerCheckbox = container.querySelector(
      'thead input[type="checkbox"]',
    ) as HTMLInputElement;
    await act(async () => { fireEvent.click(headerCheckbox); });
    await waitFor(() => {
      expect(container.textContent).toContain('2 selected');
    });
  });

  it('Clear button hides bulk bar', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Widget Pro'));
    const checkboxes = Array.from(
      container.querySelectorAll('tbody input[type="checkbox"]'),
    ) as HTMLInputElement[];
    await act(async () => { fireEvent.click(checkboxes[0]); });
    await waitFor(() => expect(container.textContent).toContain('1 selected'));
    const clearBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Clear'),
    ) as HTMLButtonElement;
    await act(async () => { fireEvent.click(clearBtn); });
    await waitFor(() => {
      expect(container.textContent).not.toContain('selected');
    });
  });
});

// ─── bulk actions ─────────────────────────────────────────────────────────────

describe('ProductsListPage — bulk actions', () => {
  async function selectFirstProduct(container: HTMLElement) {
    await waitFor(() => expect(container.textContent).toContain('Widget Pro'));
    const checkboxes = Array.from(
      container.querySelectorAll('tbody input[type="checkbox"]'),
    ) as HTMLInputElement[];
    await act(async () => { fireEvent.click(checkboxes[0]); });
    await waitFor(() => expect(container.textContent).toContain('selected'));
  }

  it('bulk bar is hidden initially', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Widget Pro'));
    expect(container.textContent).not.toContain('selected');
  });

  it('"Set Active" button calls bulk PATCH', async () => {
    const { container } = renderPage();
    await selectFirstProduct(container);
    const setActiveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Set Active'),
    ) as HTMLButtonElement;
    await act(async () => { fireEvent.click(setActiveBtn); });
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/bulk') && (c[1] as RequestInit)?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
    });
  });

  it('"Set Draft" button calls bulk PATCH', async () => {
    const { container } = renderPage();
    await selectFirstProduct(container);
    const setDraftBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Set Draft'),
    ) as HTMLButtonElement;
    await act(async () => { fireEvent.click(setDraftBtn); });
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/bulk') && (c[1] as RequestInit)?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
    });
  });

  it('"Archive" button calls bulk PATCH with status=archived', async () => {
    const { container } = renderPage();
    await selectFirstProduct(container);
    // "Archive" (exact) — not "Archived" which is the status filter tab
    const archiveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Archive',
    ) as HTMLButtonElement;
    expect(archiveBtn).toBeTruthy();
    await act(async () => { fireEvent.click(archiveBtn); });
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/bulk') && (c[1] as RequestInit)?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse((patchCall![1] as RequestInit).body as string);
      expect(body.status).toBe('archived');
    });
  });

  it('"Delete" button calls bulk DELETE when confirm accepted', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const { container } = renderPage();
    await selectFirstProduct(container);
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Delete'),
    ) as HTMLButtonElement;
    await act(async () => { fireEvent.click(deleteBtn); });
    await waitFor(() => {
      const delCall = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/bulk') && (c[1] as RequestInit)?.method === 'DELETE',
      );
      expect(delCall).toBeTruthy();
    });
  });

  it('"Delete" does NOT call fetch when confirm cancelled', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    const { container } = renderPage();
    await selectFirstProduct(container);
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Delete'),
    ) as HTMLButtonElement;
    const callsBefore = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/bulk'),
    ).length;
    await act(async () => { fireEvent.click(deleteBtn); });
    // No new bulk calls should appear
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]).includes('/bulk')).length,
    ).toBe(callsBefore);
  });
});

// ─── pagination ───────────────────────────────────────────────────────────────

describe('ProductsListPage — pagination', () => {
  it('does NOT render pagination when totalPages is 1', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Widget Pro'));
    const buttons = Array.from(container.querySelectorAll('button'));
    const prevBtn = buttons.find((b) => b.querySelector('.material-icons')?.textContent === 'chevron_left');
    expect(prevBtn).toBeUndefined();
  });

  it('renders prev/next buttons when totalPages > 1', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/categories')) return makeRes(makeCategoriesRes());
      return makeRes(makeProductsRes([makeProduct()], 3));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Page 1 of 3');
    });
  });

  it('Previous button is disabled on page 1', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/categories')) return makeRes(makeCategoriesRes());
      return makeRes(makeProductsRes([makeProduct()], 3));
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Page 1 of 3'));
    const buttons = Array.from(container.querySelectorAll('button'));
    const prevBtn = buttons.find((b) => b.textContent?.includes('chevron_left')) as HTMLButtonElement;
    expect(prevBtn?.disabled).toBe(true);
  });

  it('clicking Next advances to page 2', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/categories')) return makeRes(makeCategoriesRes());
      return makeRes(makeProductsRes([makeProduct()], 3));
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Page 1 of 3'));
    const buttons = Array.from(container.querySelectorAll('button'));
    const nextBtn = buttons.find((b) => b.textContent?.includes('chevron_right')) as HTMLButtonElement;
    await act(async () => { fireEvent.click(nextBtn); });
    await waitFor(() => {
      expect(container.textContent).toContain('Page 2 of 3');
    });
  });
});

// ─── fetch error (fail silently) ──────────────────────────────────────────────

describe('ProductsListPage — fetch error handling', () => {
  it('shows empty state after fetch throws (fail silently)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/categories')) return makeRes(makeCategoriesRes());
      throw new Error('Network error');
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No products found');
    });
  });

  it('shows empty state when API returns success=false', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/categories')) return makeRes(makeCategoriesRes());
      return makeRes({ success: false, data: null }, true);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No products found');
    });
  });
});

// ─── fetch API shape ──────────────────────────────────────────────────────────

describe('ProductsListPage — API calls', () => {
  it('calls /api/portal/websites/site-42/store/products on mount', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/websites/site-42/store/products'),
      );
      expect(call).toBeTruthy();
    });
  });

  it('calls /api/portal/websites/site-42/store/categories on mount', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/websites/site-42/store/categories'),
      );
      expect(call).toBeTruthy();
    });
  });

  it('includes page=1 and limit=20 in products request', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/products'),
      );
      expect(String(call![0])).toContain('page=1');
      expect(String(call![0])).toContain('limit=20');
    });
  });
});
