// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/websites/[siteId]/store/categories/page.tsx`
 * 'use client' component that uses useParams for siteId.
 * Exercises: loading state, empty state, list rendering, create/edit/delete,
 * slug auto-generation, parent-category select, success/error banners.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useParams: () => ({ siteId: 'site-7' }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/portal/websites/site-7/store/categories',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => React.createElement('a', { href, ...rest }, children),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseCat = {
  id: 1,
  name: 'T-Shirts',
  slug: 't-shirts',
  description: 'All t-shirt products',
  imageUrl: null as string | null,
  parentId: null as number | null,
  parentName: null as string | null,
  productCount: 5,
};

const BASE_URL = '/api/portal/websites/site-7/store/categories';

// ─── Fetch helper ─────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<unknown> };

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, json: async () => body };
}

type Handler = (url: string, init?: RequestInit) => FetchResp | Promise<FetchResp>;
let currentHandler: Handler;

function setHandler(h: Handler) {
  currentHandler = h;
}

function defaultHandler(url: string, _init?: RequestInit): FetchResp {
  if (url === BASE_URL && !_init?.method)
    return makeRes({ success: true, data: [baseCat] });
  if (url === BASE_URL && _init?.method === 'POST')
    return makeRes({ success: true, data: { ...baseCat, id: 99 } });
  if (/\/store\/categories\/\d+$/.test(url) && _init?.method === 'PUT')
    return makeRes({ success: true, data: baseCat });
  if (/\/store\/categories\/\d+$/.test(url) && _init?.method === 'DELETE')
    return makeRes({ success: true });
  return makeRes({ success: true, data: null });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  setHandler(defaultHandler);
  // @ts-expect-error - assigning vi mock to global.fetch
  global.fetch = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(currentHandler(url, init))
  );
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

// ─── Page under test ──────────────────────────────────────────────────────────

import StoreCategoriesPage from '@/app/portal/websites/[siteId]/store/categories/page';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function renderPage() {
  const result = render(<StoreCategoriesPage />);
  // Loading spinner renders first, then disappears when data arrives
  await waitFor(() => {
    expect(result.container.querySelector('.animate-spin')).toBeNull();
  });
  return result;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function openCreateForm() {
  await renderPage();
  fireEvent.click(screen.getByRole('button', { name: /Add Category/i }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StoreCategoriesPage', () => {
  // ── Loading state ─────────────────────────────────────────────────────────────

  describe('loading state', () => {
    it('shows spinner while loading', () => {
      setHandler(() => new Promise(() => {}) as unknown as FetchResp);
      const { container } = render(<StoreCategoriesPage />);
      expect(container.querySelector('.animate-spin')).toBeTruthy();
    });

    it('hides spinner after data loads', async () => {
      const { container } = await renderPage();
      expect(container.querySelector('.animate-spin')).toBeNull();
    });
  });

  // ── Page structure ────────────────────────────────────────────────────────────

  describe('page structure', () => {
    it('renders Product Categories heading', async () => {
      await renderPage();
      expect(screen.getByText('Product Categories')).toBeTruthy();
    });

    it('renders subtitle text', async () => {
      await renderPage();
      expect(screen.getByText('Organize products into categories.')).toBeTruthy();
    });

    it('renders "Add Category" button', async () => {
      await renderPage();
      expect(screen.getByRole('button', { name: /Add Category/i })).toBeTruthy();
    });
  });

  // ── Empty state ───────────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('shows empty state message when no categories', async () => {
      setHandler((url) => {
        if (url === BASE_URL) return makeRes({ success: true, data: [] });
        return defaultHandler(url);
      });
      await renderPage();
      expect(screen.getByText('No categories yet. Create your first one above.')).toBeTruthy();
    });

    it('handles missing data key gracefully', async () => {
      setHandler((url) => {
        if (url === BASE_URL) return makeRes({ success: true });
        return defaultHandler(url);
      });
      await renderPage();
      expect(screen.getByText('No categories yet. Create your first one above.')).toBeTruthy();
    });

    it('handles success:false gracefully (no crash)', async () => {
      setHandler((url) => {
        if (url === BASE_URL) return makeRes({ success: false, message: 'Server error' });
        return defaultHandler(url);
      });
      await renderPage();
      // No crash — empty state shown
      expect(screen.getByText('No categories yet. Create your first one above.')).toBeTruthy();
    });
  });

  // ── Populated list ────────────────────────────────────────────────────────────

  describe('populated list', () => {
    it('renders category name', async () => {
      await renderPage();
      expect(screen.getByText('T-Shirts')).toBeTruthy();
    });

    it('renders slug with leading slash', async () => {
      await renderPage();
      expect(screen.getByText('/t-shirts')).toBeTruthy();
    });

    it('renders description', async () => {
      await renderPage();
      expect(screen.getByText('All t-shirt products')).toBeTruthy();
    });

    it('renders product count', async () => {
      await renderPage();
      expect(screen.getByText('5 products')).toBeTruthy();
    });

    it('renders placeholder icon when no imageUrl', async () => {
      await renderPage();
      // category icon placeholder
      const icons = document.querySelectorAll('.material-icons');
      const catIcons = Array.from(icons).filter((el) => el.textContent === 'category');
      expect(catIcons.length).toBeGreaterThan(0);
    });

    it('renders img tag when imageUrl is set', async () => {
      setHandler((url) => {
        if (url === BASE_URL)
          return makeRes({
            success: true,
            data: [{ ...baseCat, imageUrl: 'https://example.com/img.png' }],
          });
        return defaultHandler(url);
      });
      await renderPage();
      const imgs = document.querySelectorAll('ul img') as NodeListOf<HTMLImageElement>;
      expect(imgs.length).toBeGreaterThan(0);
      expect(imgs[0].src).toContain('example.com');
    });

    it('renders parentName badge when category has a parent', async () => {
      setHandler((url) => {
        if (url === BASE_URL)
          return makeRes({
            success: true,
            data: [{ ...baseCat, parentName: 'Apparel', parentId: 10 }],
          });
        return defaultHandler(url);
      });
      await renderPage();
      expect(screen.getByText('in Apparel')).toBeTruthy();
    });

    it('renders multiple categories', async () => {
      setHandler((url) => {
        if (url === BASE_URL)
          return makeRes({
            success: true,
            data: [
              baseCat,
              { ...baseCat, id: 2, name: 'Hoodies', slug: 'hoodies', description: null, productCount: 0 },
            ],
          });
        return defaultHandler(url);
      });
      await renderPage();
      expect(screen.getByText('T-Shirts')).toBeTruthy();
      expect(screen.getByText('Hoodies')).toBeTruthy();
    });

    it('renders edit and delete buttons per row', async () => {
      await renderPage();
      const editIcons = Array.from(document.querySelectorAll('.material-icons')).filter(
        (el) => el.textContent === 'edit'
      );
      const deleteIcons = Array.from(document.querySelectorAll('.material-icons')).filter(
        (el) => el.textContent === 'delete'
      );
      expect(editIcons.length).toBeGreaterThan(0);
      expect(deleteIcons.length).toBeGreaterThan(0);
    });
  });

  // ── Create form ───────────────────────────────────────────────────────────────

  describe('create form', () => {
    it('shows form when "Add Category" clicked', async () => {
      await openCreateForm();
      expect(screen.getByText('New Category')).toBeTruthy();
    });

    it('hides form and shows "Add Category" again when Cancel clicked in form', async () => {
      await openCreateForm();
      // Click the form's own Cancel button (type="button", no icon, inside the form)
      const formCancelBtn = Array.from(document.querySelectorAll('form button[type="button"]')).find(
        (b) => b.textContent?.trim() === 'Cancel'
      ) as HTMLButtonElement | undefined;
      if (formCancelBtn) fireEvent.click(formCancelBtn);
      expect(screen.queryByText('New Category')).toBeNull();
    });

    it('clicking header button again (now showing Cancel icon) closes form', async () => {
      await renderPage();
      const btn = screen.getByRole('button', { name: /Add Category/i });
      fireEvent.click(btn);
      expect(screen.getByText('New Category')).toBeTruthy();
      // The header button now shows "Cancel" — click it to close
      // It's the button that's NOT inside a form element
      const headerCancelBtn = Array.from(document.querySelectorAll('button')).find(
        (b) => !b.closest('form') && b.textContent?.includes('Cancel')
      ) as HTMLButtonElement | undefined;
      if (headerCancelBtn) fireEvent.click(headerCancelBtn);
      expect(screen.queryByText('New Category')).toBeNull();
    });

    it('renders name, slug, description, imageUrl, parent inputs', async () => {
      await openCreateForm();
      expect(screen.getByPlaceholderText('e.g. T-Shirts')).toBeTruthy();
      expect(screen.getByPlaceholderText('t-shirts')).toBeTruthy();
      expect(screen.getByPlaceholderText('Optional description')).toBeTruthy();
      expect(screen.getByPlaceholderText('https://...')).toBeTruthy();
      expect(screen.getByText('None (top-level)')).toBeTruthy();
    });

    it('auto-generates slug from name', async () => {
      await openCreateForm();
      fireEvent.change(screen.getByPlaceholderText('e.g. T-Shirts'), {
        target: { value: 'My Cool Category' },
      });
      const slugInput = screen.getByPlaceholderText('t-shirts') as HTMLInputElement;
      expect(slugInput.value).toBe('my-cool-category');
    });

    it('does not auto-generate slug when editing', async () => {
      await renderPage();
      const editBtn = Array.from(document.querySelectorAll('button')).find((b) =>
        b.querySelector('.material-icons')?.textContent === 'edit'
      );
      if (editBtn) fireEvent.click(editBtn);
      await waitFor(() => expect(screen.getByText('Edit Category')).toBeTruthy());

      const nameInput = screen.getByPlaceholderText('e.g. T-Shirts') as HTMLInputElement;
      const slugInput = screen.getByPlaceholderText('t-shirts') as HTMLInputElement;
      const originalSlug = slugInput.value;
      fireEvent.change(nameInput, { target: { value: 'Changed Name' } });
      // Slug should NOT change when editing
      expect(slugInput.value).toBe(originalSlug);
    });

    it('populates parent select with existing categories', async () => {
      setHandler((url) => {
        if (url === BASE_URL)
          return makeRes({
            success: true,
            data: [
              baseCat,
              { ...baseCat, id: 2, name: 'Hoodies', slug: 'hoodies' },
            ],
          });
        return defaultHandler(url);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Add Category/i }));
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select).toBeTruthy();
      // Both cats available as parent options
      expect(Array.from(select.options).some((o) => o.text === 'T-Shirts')).toBe(true);
      expect(Array.from(select.options).some((o) => o.text === 'Hoodies')).toBe(true);
    });

    it('excludes self from parent options when editing', async () => {
      await renderPage();
      const editBtn = Array.from(document.querySelectorAll('button')).find((b) =>
        b.querySelector('.material-icons')?.textContent === 'edit'
      );
      if (editBtn) fireEvent.click(editBtn);
      await waitFor(() => expect(screen.getByText('Edit Category')).toBeTruthy());
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      // The category being edited (id=1, T-Shirts) should not be in parent options
      expect(Array.from(select.options).some((o) => o.value === '1')).toBe(false);
    });

    it('shows image preview when imageUrl is filled', async () => {
      await openCreateForm();
      fireEvent.change(screen.getByPlaceholderText('https://...'), {
        target: { value: 'https://example.com/preview.png' },
      });
      const previewImg = document.querySelector('form img') as HTMLImageElement;
      expect(previewImg).toBeTruthy();
      expect(previewImg.src).toContain('example.com');
    });

    it('creates category on submit and shows success message', async () => {
      setHandler((url, init) => {
        if (url === BASE_URL && !init?.method)
          return makeRes({ success: true, data: [baseCat] });
        if (url === BASE_URL && init?.method === 'POST')
          return makeRes({ success: true, data: { ...baseCat, id: 99 } });
        return defaultHandler(url, init);
      });
      await openCreateForm();
      fireEvent.change(screen.getByPlaceholderText('e.g. T-Shirts'), {
        target: { value: 'Hats' },
      });
      fireEvent.change(screen.getByPlaceholderText('t-shirts'), {
        target: { value: 'hats' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Create Category/i }));
      await waitFor(() => expect(screen.getByText('Category created.')).toBeTruthy());
    });

    it('shows error message in form when create fails', async () => {
      setHandler((url, init) => {
        if (url === BASE_URL && init?.method === 'POST')
          return makeRes({ success: false, message: 'Slug already exists' });
        return defaultHandler(url, init);
      });
      await openCreateForm();
      fireEvent.change(screen.getByPlaceholderText('e.g. T-Shirts'), {
        target: { value: 'Hats' },
      });
      fireEvent.change(screen.getByPlaceholderText('t-shirts'), {
        target: { value: 'hats' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Create Category/i }));
      await waitFor(() => expect(screen.getByText('Slug already exists')).toBeTruthy());
    });

    it('shows "Failed to save." fallback when message absent', async () => {
      setHandler((url, init) => {
        if (url === BASE_URL && init?.method === 'POST')
          return makeRes({ success: false });
        return defaultHandler(url, init);
      });
      await openCreateForm();
      fireEvent.change(screen.getByPlaceholderText('e.g. T-Shirts'), {
        target: { value: 'Hats' },
      });
      fireEvent.change(screen.getByPlaceholderText('t-shirts'), {
        target: { value: 'hats' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Create Category/i }));
      await waitFor(() => expect(screen.getByText('Failed to save.')).toBeTruthy());
    });

    it('shows "Something went wrong." when fetch throws', async () => {
      setHandler((url, init) => {
        if (url === BASE_URL && init?.method === 'POST')
          throw new Error('network error');
        return defaultHandler(url, init);
      });
      await openCreateForm();
      fireEvent.change(screen.getByPlaceholderText('e.g. T-Shirts'), {
        target: { value: 'Caps' },
      });
      fireEvent.change(screen.getByPlaceholderText('t-shirts'), {
        target: { value: 'caps' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Create Category/i }));
      await waitFor(() => expect(screen.getByText('Something went wrong.')).toBeTruthy());
    });

    it('shows saving spinner on submit button while saving', async () => {
      let resolve: (v: FetchResp) => void = () => {};
      setHandler((url, init) => {
        if (url === BASE_URL && !init?.method)
          return makeRes({ success: true, data: [baseCat] });
        if (url === BASE_URL && init?.method === 'POST')
          return new Promise<FetchResp>((r) => {
            resolve = r;
          });
        return defaultHandler(url, init);
      });
      await openCreateForm();
      fireEvent.change(screen.getByPlaceholderText('e.g. T-Shirts'), {
        target: { value: 'Caps' },
      });
      fireEvent.change(screen.getByPlaceholderText('t-shirts'), {
        target: { value: 'caps' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Create Category/i }));
      await waitFor(() => {
        const submitBtn = screen.getByRole('button', { name: /Create Category/i });
        expect(submitBtn.querySelector('.animate-spin')).toBeTruthy();
      });
      resolve(makeRes({ success: true, data: baseCat }));
    });
  });

  // ── Edit form ─────────────────────────────────────────────────────────────────

  describe('edit form', () => {
    async function openEditForm() {
      await renderPage();
      const editBtn = Array.from(document.querySelectorAll('button')).find((b) =>
        b.querySelector('.material-icons')?.textContent === 'edit'
      );
      if (editBtn) fireEvent.click(editBtn);
      await waitFor(() => expect(screen.getByText('Edit Category')).toBeTruthy());
    }

    it('populates form fields with existing values', async () => {
      await openEditForm();
      const nameInput = screen.getByPlaceholderText('e.g. T-Shirts') as HTMLInputElement;
      expect(nameInput.value).toBe('T-Shirts');
      const slugInput = screen.getByPlaceholderText('t-shirts') as HTMLInputElement;
      expect(slugInput.value).toBe('t-shirts');
    });

    it('pre-fills description', async () => {
      await openEditForm();
      const desc = screen.getByPlaceholderText('Optional description') as HTMLTextAreaElement;
      expect(desc.value).toBe('All t-shirt products');
    });

    it('submits edit and shows "Category updated." success', async () => {
      setHandler((url, init) => {
        if (url === BASE_URL) return makeRes({ success: true, data: [baseCat] });
        if (/\/store\/categories\/\d+$/.test(url) && init?.method === 'PUT')
          return makeRes({ success: true, data: baseCat });
        return defaultHandler(url, init);
      });
      await openEditForm();
      fireEvent.click(screen.getByRole('button', { name: /Update Category/i }));
      await waitFor(() => expect(screen.getByText('Category updated.')).toBeTruthy());
    });

    it('shows error message when update fails', async () => {
      setHandler((url, init) => {
        if (url === BASE_URL) return makeRes({ success: true, data: [baseCat] });
        if (/\/store\/categories\/\d+$/.test(url) && init?.method === 'PUT')
          return makeRes({ success: false, message: 'Slug conflict' });
        return defaultHandler(url, init);
      });
      await openEditForm();
      fireEvent.click(screen.getByRole('button', { name: /Update Category/i }));
      await waitFor(() => expect(screen.getByText('Slug conflict')).toBeTruthy());
    });

    it('shows "Something went wrong." when PUT throws', async () => {
      setHandler((url, init) => {
        if (url === BASE_URL) return makeRes({ success: true, data: [baseCat] });
        if (/\/store\/categories\/\d+$/.test(url) && init?.method === 'PUT')
          throw new Error('network fail');
        return defaultHandler(url, init);
      });
      await openEditForm();
      fireEvent.click(screen.getByRole('button', { name: /Update Category/i }));
      await waitFor(() => expect(screen.getByText('Something went wrong.')).toBeTruthy());
    });

    it('clears error when slug input changed', async () => {
      setHandler((url, init) => {
        if (url === BASE_URL) return makeRes({ success: true, data: [baseCat] });
        if (/\/store\/categories\/\d+$/.test(url) && init?.method === 'PUT')
          return makeRes({ success: false, message: 'Bad slug' });
        return defaultHandler(url, init);
      });
      await openEditForm();
      fireEvent.click(screen.getByRole('button', { name: /Update Category/i }));
      await waitFor(() => expect(screen.getByText('Bad slug')).toBeTruthy());
      fireEvent.change(screen.getByPlaceholderText('t-shirts'), {
        target: { value: 'new-slug' },
      });
      expect(screen.queryByText('Bad slug')).toBeNull();
    });
  });

  // ── Success / error banner display ────────────────────────────────────────────

  describe('success and error banners', () => {
    it('shows success banner after category created', async () => {
      setHandler((url, init) => {
        if (url === BASE_URL && !init?.method)
          return makeRes({ success: true, data: [baseCat] });
        if (url === BASE_URL && init?.method === 'POST')
          return makeRes({ success: true, data: baseCat });
        return defaultHandler(url, init);
      });
      await openCreateForm();
      fireEvent.change(screen.getByPlaceholderText('e.g. T-Shirts'), {
        target: { value: 'Jackets' },
      });
      fireEvent.change(screen.getByPlaceholderText('t-shirts'), {
        target: { value: 'jackets' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Create Category/i }));
      await waitFor(() => expect(screen.getByText('Category created.')).toBeTruthy());
    });

    it('shows error banner (outside form) when delete throws', async () => {
      setHandler((url, init) => {
        if (url === BASE_URL) return makeRes({ success: true, data: [baseCat] });
        if (/\/store\/categories\/\d+$/.test(url) && init?.method === 'DELETE')
          throw new Error('delete error');
        return defaultHandler(url, init);
      });
      await renderPage();
      const deleteBtn = Array.from(document.querySelectorAll('button')).find((b) =>
        b.querySelector('.material-icons')?.textContent === 'delete'
      );
      if (deleteBtn) fireEvent.click(deleteBtn);
      await waitFor(() => expect(screen.getByText('Failed to delete.')).toBeTruthy());
    });
  });

  // ── Delete category ───────────────────────────────────────────────────────────

  describe('delete category', () => {
    it('calls delete API and reloads on confirm', async () => {
      await renderPage();
      expect(screen.getByText('T-Shirts')).toBeTruthy();

      const deleteBtn = Array.from(document.querySelectorAll('button')).find((b) =>
        b.querySelector('.material-icons')?.textContent === 'delete'
      );
      if (deleteBtn) fireEvent.click(deleteBtn);

      await waitFor(() => {
        // fetch was called with DELETE
        const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit?][];
        const hasDelete = calls.some(
          ([url, init]) => /\/store\/categories\/\d+$/.test(url) && init?.method === 'DELETE'
        );
        expect(hasDelete).toBe(true);
      });
    });

    it('does not delete when confirm returns false', async () => {
      vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
      await renderPage();

      const deleteBtn = Array.from(document.querySelectorAll('button')).find((b) =>
        b.querySelector('.material-icons')?.textContent === 'delete'
      );
      if (deleteBtn) fireEvent.click(deleteBtn);

      await flush();
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit?][];
      const hasDelete = calls.some(
        ([url, init]) => /\/store\/categories\/\d+$/.test(url) && init?.method === 'DELETE'
      );
      expect(hasDelete).toBe(false);
    });

    it('shows success message after delete', async () => {
      await renderPage();
      const deleteBtn = Array.from(document.querySelectorAll('button')).find((b) =>
        b.querySelector('.material-icons')?.textContent === 'delete'
      );
      if (deleteBtn) fireEvent.click(deleteBtn);
      await waitFor(() => expect(screen.getByText('Category deleted.')).toBeTruthy());
    });
  });

  // ── generateSlug helper ───────────────────────────────────────────────────────

  describe('slug generation edge cases', () => {
    it('generates slug stripping special chars', async () => {
      await openCreateForm();
      fireEvent.change(screen.getByPlaceholderText('e.g. T-Shirts'), {
        target: { value: 'Hello, World!' },
      });
      const slugInput = screen.getByPlaceholderText('t-shirts') as HTMLInputElement;
      expect(slugInput.value).toBe('hello-world');
    });

    it('generates slug with multiple spaces collapsed', async () => {
      await openCreateForm();
      fireEvent.change(screen.getByPlaceholderText('e.g. T-Shirts'), {
        target: { value: 'Top  Hats  2025' },
      });
      const slugInput = screen.getByPlaceholderText('t-shirts') as HTMLInputElement;
      expect(slugInput.value).toBe('top-hats-2025');
    });

    it('clears name error on name change', async () => {
      // Typing in the name input clears any existing error
      setHandler((url, init) => {
        if (url === BASE_URL && init?.method === 'POST')
          return makeRes({ success: false, message: 'Validation error' });
        return defaultHandler(url, init);
      });
      await openCreateForm();
      fireEvent.change(screen.getByPlaceholderText('e.g. T-Shirts'), {
        target: { value: 'Bad' },
      });
      fireEvent.change(screen.getByPlaceholderText('t-shirts'), {
        target: { value: 'bad' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Create Category/i }));
      await waitFor(() => expect(screen.getByText('Validation error')).toBeTruthy());
      // Typing in name field should clear error
      fireEvent.change(screen.getByPlaceholderText('e.g. T-Shirts'), {
        target: { value: 'Good' },
      });
      expect(screen.queryByText('Validation error')).toBeNull();
    });
  });
});
