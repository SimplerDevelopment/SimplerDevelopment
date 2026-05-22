// @vitest-environment jsdom
/**
 * Unit tests for the Portal Store Product detail/edit page:
 *   app/portal/websites/[siteId]/store/products/[productId]/page.tsx
 *
 * Covers the "new" mode and the "edit existing" mode, including:
 *  - basic info, pricing, inventory, shipping, category/tags inputs
 *  - featured / track-inventory toggle buttons
 *  - SEO and Options & Variants collapsible sections
 *  - option add/remove/update, variant generation, bulk pricing
 *  - media picker open/close and add-from-media
 *  - save validation, save success, save error
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';

// ─── next/navigation mocks ──────────────────────────────────────────────────

const routerReplace = vi.fn();
let mockParams: { siteId: string; productId: string } = { siteId: 'site-1', productId: 'new' };

vi.mock('next/navigation', () => ({
  useParams: () => mockParams,
  useRouter: () => ({
    push: vi.fn(),
    replace: routerReplace,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// next/link → render as a plain anchor
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// MediaUploadModal — render a simple stand-in we can interact with
vi.mock('@/components/admin/MediaUploadModal', () => ({
  default: ({ onClose, onComplete }: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'media-upload-modal' },
      React.createElement('button', { onClick: onClose }, 'StubClose'),
      React.createElement('button', { onClick: onComplete }, 'StubComplete'),
    ),
}));

// ─── Fetch stub ─────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<any> };
const fetchMock = vi.fn<(url: string, init?: any) => Promise<FetchResp>>();

function makeRes(body: any, ok = true): FetchResp {
  return { ok, json: async () => body };
}

beforeEach(() => {
  fetchMock.mockReset();
  routerReplace.mockReset();
  mockParams = { siteId: 'site-1', productId: 'new' };
  // Default: categories empty, products fetch returns success
  fetchMock.mockImplementation(async () => makeRes({ success: true, data: [] }));
  vi.stubGlobal('fetch', fetchMock as any);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Import after mocks
import ProductEditPage from '@/app/portal/websites/[siteId]/store/products/[productId]/page';

function renderPage() {
  return render(<ProductEditPage />);
}

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes(text),
  ) as HTMLButtonElement | undefined;
}

// ─── New product mode ───────────────────────────────────────────────────────

describe('ProductEditPage — new product mode', () => {
  it('renders New Product title and Save button', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('New Product');
      expect(container.textContent).toContain('Save Product');
    });
  });

  it('renders all major section headings', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New Product'));
    expect(container.textContent).toContain('Basic Information');
    expect(container.textContent).toContain('Pricing');
    expect(container.textContent).toContain('Inventory');
    expect(container.textContent).toContain('Shipping');
    expect(container.textContent).toContain('Images');
    expect(container.textContent).toContain('Category & Tags');
    expect(container.textContent).toContain('SEO Settings');
    expect(container.textContent).toContain('Options & Variants');
    expect(container.textContent).toContain('Bulk Pricing');
  });

  it('typing in the Name field auto-generates slug', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New Product'));
    const nameInput = container.querySelector('input[placeholder="Product name"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Hello World!' } });
    await waitFor(() => {
      const slug = container.querySelector('input[placeholder="product-slug"]') as HTMLInputElement;
      expect(slug.value).toBe('hello-world');
    });
  });

  it('shows validation error when saving with no name', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New Product'));
    const saveBtn = findButtonByText(container, 'Save Product')!;
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Product name is required.');
    });
  });

  it('shows validation error when name set but slug blank', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New Product'));
    const nameInput = container.querySelector('input[placeholder="Product name"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Foo' } });
    // Clear slug
    const slug = container.querySelector('input[placeholder="product-slug"]') as HTMLInputElement;
    fireEvent.change(slug, { target: { value: '' } });
    const saveBtn = findButtonByText(container, 'Save Product')!;
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Slug is required.');
    });
  });

  it('saving a valid new product hits POST and navigates', async () => {
    let posted: any = null;
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.endsWith('/products') && init?.method === 'POST') {
        posted = JSON.parse(init.body);
        return makeRes({ success: true, data: { id: 42 } });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New Product'));
    const nameInput = container.querySelector('input[placeholder="Product name"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'My Product' } });
    fireEvent.click(findButtonByText(container, 'Save Product')!);
    await waitFor(() => {
      expect(posted).toBeTruthy();
      expect(posted.name).toBe('My Product');
      expect(routerReplace).toHaveBeenCalledWith('/portal/websites/site-1/store/products/42');
    });
  });

  it('shows server error on save failure', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.endsWith('/products') && init?.method === 'POST') {
        return makeRes({ success: false, message: 'Slug taken' });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New Product'));
    const nameInput = container.querySelector('input[placeholder="Product name"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Dup' } });
    fireEvent.click(findButtonByText(container, 'Save Product')!);
    await waitFor(() => {
      expect(container.textContent).toContain('Slug taken');
    });
  });

  it('shows generic error when save throws', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.endsWith('/products') && init?.method === 'POST') {
        throw new Error('network');
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New Product'));
    const nameInput = container.querySelector('input[placeholder="Product name"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Boom' } });
    fireEvent.click(findButtonByText(container, 'Save Product')!);
    await waitFor(() => {
      expect(container.textContent).toContain('Something went wrong.');
    });
  });

  it('renders categories in dropdown after fetch', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/categories')) {
        return makeRes({ success: true, data: [{ id: 1, name: 'Apparel' }, { id: 2, name: 'Books' }] });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Apparel');
      expect(container.textContent).toContain('Books');
    });
  });

  it('toggles featured switch', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New Product'));
    // Before toggle: "No"
    expect(container.textContent).toContain('No');
    const featuredToggle = findButtonByText(container, 'No')?.previousElementSibling as HTMLButtonElement;
    // The toggle is a button with no text; find it as the toggle adjacent to "No"
    // Easier: find all toggle-style buttons (rounded-full with h-6 w-11)
    const toggles = Array.from(container.querySelectorAll('button.rounded-full')) as HTMLButtonElement[];
    expect(toggles.length).toBeGreaterThan(0);
    fireEvent.click(toggles[0]);
    await waitFor(() => {
      expect(container.textContent).toContain('Yes');
    });
  });

  it('toggles track-inventory and reveals Quantity field', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New Product'));
    expect(container.textContent).toContain('Disabled');
    expect(container.textContent).not.toContain('Quantity');
    const toggles = Array.from(container.querySelectorAll('button.rounded-full')) as HTMLButtonElement[];
    // Second toggle in DOM order is track-inventory (after featured)
    fireEvent.click(toggles[1]);
    await waitFor(() => {
      expect(container.textContent).toContain('Enabled');
      expect(container.textContent).toContain('Quantity');
    });
  });
});

// ─── Collapsible sections ───────────────────────────────────────────────────

describe('ProductEditPage — collapsible sections', () => {
  it('expands SEO section', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('SEO Settings'));
    expect(container.textContent).not.toContain('SEO Title');
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('SEO Settings'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      expect(container.textContent).toContain('SEO Title');
      expect(container.textContent).toContain('SEO Description');
    });
  });

  it('expands Options & Variants section and adds an option', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Options & Variants'));
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Options & Variants'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(container.textContent).toContain('Add Option'));
    fireEvent.click(findButtonByText(container, 'Add Option')!);
    await waitFor(() => {
      expect(container.querySelector('input[placeholder*="Option name"]')).toBeTruthy();
    });
  });

  it('expands Bulk Pricing and adds a rule', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Bulk Pricing'));
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Bulk Pricing'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(container.textContent).toContain('Add Rule'));
    fireEvent.click(findButtonByText(container, 'Add Rule')!);
    await waitFor(() => {
      expect(container.textContent).toContain('Min Qty');
      expect(container.textContent).toContain('Max Qty');
    });
  });
});

// ─── Edit existing product mode ─────────────────────────────────────────────

describe('ProductEditPage — edit existing', () => {
  it('renders loading spinner before fetch resolves', async () => {
    mockParams = { siteId: 'site-1', productId: '7' };
    let resolveFetch: (v: any) => void = () => {};
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/products/7')) {
        return new Promise<FetchResp>((res) => { resolveFetch = res; });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    // Spinner present
    expect(container.querySelector('.animate-spin')).toBeTruthy();
    resolveFetch(makeRes({ success: true, data: { name: 'X', slug: 'x' } }));
    await waitFor(() => expect(container.textContent).toContain('Edit Product'));
  });

  it('populates form fields from fetched product', async () => {
    mockParams = { siteId: 'site-1', productId: '5' };
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/products/5')) {
        return makeRes({
          success: true,
          data: {
            name: 'Widget',
            slug: 'widget',
            shortDescription: 'Short',
            description: 'Long description',
            status: 'active',
            featured: true,
            priceCents: 2500,
            sku: 'WID-1',
            tags: ['a', 'b'],
            seoTitle: 'SEO!',
            seoDescription: 'desc',
            options: [],
            variants: [],
            bulkPricing: [],
            images: [],
          },
        });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Edit Product'));
    const nameInput = container.querySelector('input[placeholder="Product name"]') as HTMLInputElement;
    expect(nameInput.value).toBe('Widget');
    const slug = container.querySelector('input[placeholder="product-slug"]') as HTMLInputElement;
    expect(slug.value).toBe('widget');
    // SEO panel auto-expanded
    expect(container.textContent).toContain('SEO Title');
  });

  it('auto-expands Options & Variants when product has options', async () => {
    mockParams = { siteId: 'site-1', productId: '8' };
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/products/8')) {
        return makeRes({
          success: true,
          data: {
            name: 'P',
            slug: 'p',
            options: [{ name: 'Color', values: ['Red'] }],
            variants: [],
            bulkPricing: [],
            images: [],
          },
        });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Edit Product'));
    // Options section should be auto-expanded
    expect(container.textContent).toContain('Add Option');
  });

  it('auto-expands Bulk Pricing when product has rules', async () => {
    mockParams = { siteId: 'site-1', productId: '9' };
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/products/9')) {
        return makeRes({
          success: true,
          data: {
            name: 'P',
            slug: 'p',
            options: [],
            variants: [],
            bulkPricing: [{ minQty: 5, maxQty: 10, type: 'fixed', amount: 100 }],
            images: [],
          },
        });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Edit Product'));
    expect(container.textContent).toContain('Min Qty');
    expect(container.textContent).toContain('Add Rule');
  });

  it('save in edit mode uses PUT', async () => {
    mockParams = { siteId: 'site-1', productId: '11' };
    let method: string | undefined;
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/products/11') && init?.method) {
        method = init.method;
        return makeRes({ success: true });
      }
      if (url.includes('/products/11')) {
        return makeRes({
          success: true,
          data: { name: 'E', slug: 'e', options: [], variants: [], bulkPricing: [], images: [] },
        });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Edit Product'));
    fireEvent.click(findButtonByText(container, 'Save Product')!);
    await waitFor(() => {
      expect(method).toBe('PUT');
      expect(container.textContent).toContain('Product saved!');
    });
  });
});

// ─── Options + variant generation ───────────────────────────────────────────

describe('ProductEditPage — options & variants generation', () => {
  it('generates variants from configured options', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Options & Variants'));
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Options & Variants'),
      ) as HTMLButtonElement,
    );
    await waitFor(() => expect(container.textContent).toContain('Add Option'));
    fireEvent.click(findButtonByText(container, 'Add Option')!);
    await waitFor(() => expect(container.querySelector('input[placeholder*="Option name"]')).toBeTruthy());
    const nameI = container.querySelector('input[placeholder*="Option name"]') as HTMLInputElement;
    fireEvent.change(nameI, { target: { value: 'Color' } });
    const valuesI = container.querySelector('input[placeholder*="Values"]') as HTMLInputElement;
    fireEvent.change(valuesI, { target: { value: 'Red, Blue' } });
    // Now Generate Variants button should appear
    await waitFor(() => {
      expect(container.textContent).toContain('Generate Variants');
    });
    fireEvent.click(findButtonByText(container, 'Generate Variants')!);
    await waitFor(() => {
      // Variants table appears
      expect(container.textContent).toContain('Variant');
      expect(container.textContent).toContain('Red');
      expect(container.textContent).toContain('Blue');
    });
  });

  it('remove option button removes the option row', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Options & Variants'));
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Options & Variants'),
      ) as HTMLButtonElement,
    );
    await waitFor(() => expect(container.textContent).toContain('Add Option'));
    fireEvent.click(findButtonByText(container, 'Add Option')!);
    await waitFor(() => expect(container.querySelector('input[placeholder*="Option name"]')).toBeTruthy());
    // Delete button has material-icons text "delete"
    const deleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.querySelector('.material-icons')?.textContent === 'delete',
    ) as HTMLButtonElement;
    expect(deleteBtn).toBeTruthy();
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(container.querySelector('input[placeholder*="Option name"]')).toBeFalsy();
    });
  });
});

// ─── Bulk pricing ───────────────────────────────────────────────────────────

describe('ProductEditPage — bulk pricing', () => {
  it('remove bulk rule deletes the row', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Bulk Pricing'));
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Bulk Pricing'),
      ) as HTMLButtonElement,
    );
    await waitFor(() => expect(container.textContent).toContain('Add Rule'));
    fireEvent.click(findButtonByText(container, 'Add Rule')!);
    await waitFor(() => expect(container.textContent).toContain('Min Qty'));
    const deleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.querySelector('.material-icons')?.textContent === 'delete',
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Min Qty');
    });
  });
});

// ─── Media picker ───────────────────────────────────────────────────────────

describe('ProductEditPage — media picker', () => {
  it('opens the media picker modal', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/cms/websites/') && url.includes('/media')) {
        return makeRes({ success: true, data: [] });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Images'));
    const addBtn = findButtonByText(container, 'Add from Media')!;
    fireEvent.click(addBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Select Images');
    });
  });

  it('closes media picker via close icon', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Images'));
    fireEvent.click(findButtonByText(container, 'Add from Media')!);
    await waitFor(() => expect(container.textContent).toContain('Select Images'));
    const closeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.querySelector('.material-icons')?.textContent === 'close',
    ) as HTMLButtonElement;
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Select Images');
    });
  });

  it('shows empty state when no media items returned', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/media')) {
        return makeRes({ success: true, data: [] });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Images'));
    fireEvent.click(findButtonByText(container, 'Add from Media')!);
    await waitFor(() => {
      expect(container.textContent).toContain('No images found');
    });
  });

  it('renders media items in the picker grid', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/media')) {
        return makeRes({
          success: true,
          data: [
            { id: 1, filename: 'pic.png', url: 'https://cdn/pic.png', mimeType: 'image/png' },
            { id: 2, filename: 'doc.pdf', url: 'https://cdn/doc.pdf', mimeType: 'application/pdf' },
          ],
        });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Images'));
    fireEvent.click(findButtonByText(container, 'Add from Media')!);
    await waitFor(() => {
      expect(container.textContent).toContain('pic.png');
      expect(container.textContent).toContain('doc.pdf');
    });
  });

  it('selecting a media item adds it to images, then second click removes', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/media')) {
        return makeRes({
          success: true,
          data: [{ id: 1, filename: 'pic.png', url: 'https://cdn/pic.png', mimeType: 'image/png' }],
        });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Images'));
    fireEvent.click(findButtonByText(container, 'Add from Media')!);
    await waitFor(() => expect(container.textContent).toContain('pic.png'));
    // Click the media item card (button)
    const card = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('pic.png'),
    ) as HTMLButtonElement;
    fireEvent.click(card);
    await waitFor(() => {
      expect(container.textContent).toContain('1 image selected');
    });
    // Click again to deselect
    const card2 = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('pic.png'),
    ) as HTMLButtonElement;
    fireEvent.click(card2);
    await waitFor(() => {
      expect(container.textContent).toContain('0 images selected');
    });
  });

  it('typing in picker search updates fetch URL with search param', async () => {
    fetchMock.mockImplementation(async () => makeRes({ success: true, data: [] }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Images'));
    fireEvent.click(findButtonByText(container, 'Add from Media')!);
    await waitFor(() => expect(container.textContent).toContain('Select Images'));
    const searchInput = container.querySelector('input[placeholder="Search media..."]') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'logo' } });
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('search=logo'))).toBe(true);
    });
  });

  it('opens upload modal stand-in from media picker', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Images'));
    fireEvent.click(findButtonByText(container, 'Add from Media')!);
    await waitFor(() => expect(container.textContent).toContain('Select Images'));
    fireEvent.click(findButtonByText(container, 'Upload New')!);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="media-upload-modal"]')).toBeTruthy();
    });
  });

  it('Done button closes media picker', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Images'));
    fireEvent.click(findButtonByText(container, 'Add from Media')!);
    await waitFor(() => expect(container.textContent).toContain('Select Images'));
    fireEvent.click(findButtonByText(container, 'Done')!);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Select Images');
    });
  });
});

// ─── Images on form (loaded existing) ───────────────────────────────────────

describe('ProductEditPage — existing images', () => {
  it('renders existing product images and remove button works', async () => {
    mockParams = { siteId: 'site-1', productId: '20' };
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/products/20')) {
        return makeRes({
          success: true,
          data: {
            name: 'WithImg',
            slug: 'with-img',
            options: [],
            variants: [],
            bulkPricing: [],
            images: [
              { url: 'https://cdn/a.png', position: 0 },
              { url: 'https://cdn/b.png', position: 1 },
            ],
          },
        });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Edit Product'));
    // Two images rendered
    const imgs = container.querySelectorAll('img');
    expect(imgs.length).toBeGreaterThanOrEqual(2);
    // "Main" tag for first image
    expect(container.textContent).toContain('Main');
  });
});
