// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for `app/portal/websites/[siteId]/taxonomy/page.tsx`.
 * The page is a 'use client' component that:
 *  - fetches taxonomies on mount (GET /api/portal/cms/websites/:siteId/taxonomies)
 *  - auto-selects the first taxonomy and fetches its terms
 *  - renders a left-panel taxonomy list and a right-panel terms panel
 *  - supports create taxonomy (form), create/edit/delete term (form + flat/hierarchical)
 *  - shows loading/empty/error states
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ───────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useParams: () => ({ siteId: '42' }),
  usePathname: () => '/portal/websites/42/taxonomy',
  useSearchParams: () => new URLSearchParams(),
}));

// ─── Fetch helpers ───────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<any> };

function makeRes(body: any, ok = true): FetchResp {
  return { ok, json: async () => body };
}

const fetchMock = vi.fn<(url: string, init?: any) => Promise<FetchResp>>();

const BASE = '/api/portal/cms/websites/42';

function makeTaxonomy(id: number, extra: Partial<any> = {}): any {
  return {
    id,
    name: `Tax ${id}`,
    slug: `tax-${id}`,
    description: null,
    icon: 'label',
    hierarchical: false,
    builtIn: false,
    websiteId: 42,
    ...extra,
  };
}

function makeTerm(id: number, extra: Partial<any> = {}): any {
  return {
    id,
    taxonomyId: 1,
    name: `Term ${id}`,
    slug: `term-${id}`,
    description: null,
    color: null,
    parentId: null,
    sortOrder: id,
    ...extra,
  };
}

/** Default fetch: returns one taxonomy + empty terms */
function defaultFetch(url: string, _init?: any): FetchResp {
  if (url === `${BASE}/taxonomies`) {
    return makeRes({ success: true, data: [makeTaxonomy(1)] });
  }
  if (url.includes('/terms')) {
    return makeRes({ success: true, data: [] });
  }
  return makeRes({ success: true, data: {} });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url, init) => defaultFetch(url, init));
  // Use direct assignment (not stubGlobal) so the mock is picked up correctly in jsdom
  // @ts-expect-error – overriding global fetch with a mock
  global.fetch = fetchMock;
  // Silence confirm dialogs by auto-accepting
  // @ts-expect-error – overriding global confirm
  global.confirm = () => true;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Import AFTER mocks
import TaxonomyPage from '@/app/portal/websites/[siteId]/taxonomy/page';

function renderPage() {
  return render(<TaxonomyPage />);
}

// ─── Loading state ────────────────────────────────────────────────────────────

describe('TaxonomyPage — loading state', () => {
  it('shows a loading spinner before taxonomies resolve', () => {
    let resolve: (v: any) => void = () => {};
    const p = new Promise<FetchResp>((res) => { resolve = res; });
    fetchMock.mockImplementation(async (url) => {
      if (url === `${BASE}/taxonomies`) return p;
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    // The loading branch renders a refresh icon
    expect(container.querySelector('.animate-spin')).toBeTruthy();
    resolve(makeRes({ success: true, data: [] }));
  });
});

// ─── Initial render ───────────────────────────────────────────────────────────

describe('TaxonomyPage — initial render', () => {
  it('renders the page heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Taxonomy');
    });
  });

  it('renders the page subtitle', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Manage how your content is organized');
    });
  });

  it('renders taxonomy names in the sidebar', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === `${BASE}/taxonomies`) {
        return makeRes({ success: true, data: [makeTaxonomy(1), makeTaxonomy(2)] });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Tax 1');
      expect(container.textContent).toContain('Tax 2');
    });
  });

  it('shows "Flat" label for non-hierarchical taxonomy', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Flat');
    });
  });

  it('shows "Hierarchical" label for hierarchical taxonomy', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === `${BASE}/taxonomies`) {
        return makeRes({ success: true, data: [makeTaxonomy(1, { hierarchical: true })] });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Hierarchical');
    });
  });

  it('shows (built-in) label for built-in taxonomy', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === `${BASE}/taxonomies`) {
        return makeRes({ success: true, data: [makeTaxonomy(1, { builtIn: true })] });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('(built-in)');
    });
  });

  it('auto-selects first taxonomy and shows its name in the right panel', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === `${BASE}/taxonomies`) {
        return makeRes({ success: true, data: [makeTaxonomy(1, { name: 'Categories' })] });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      // The right panel heading renders the selected taxonomy name
      expect(container.textContent).toContain('Categories');
    });
  });

  it('shows "New Taxonomy" button', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('New Taxonomy');
    });
  });
});

// ─── Empty state ──────────────────────────────────────────────────────────────

describe('TaxonomyPage — empty states', () => {
  it('shows empty-terms message when no terms exist', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No tax 1 yet');
    });
  });

  it('shows "Select a taxonomy" prompt when no taxonomies exist', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === `${BASE}/taxonomies`) {
        return makeRes({ success: true, data: [] });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Select a taxonomy or create a new one');
    });
  });
});

// ─── Taxonomy sidebar interaction ────────────────────────────────────────────

describe('TaxonomyPage — taxonomy sidebar', () => {
  it('clicking a taxonomy button selects it and fetches its terms', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === `${BASE}/taxonomies`) {
        return makeRes({ success: true, data: [makeTaxonomy(1), makeTaxonomy(2, { name: 'Tags' })] });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Tags'));
    const tagsBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Tags')
    ) as HTMLButtonElement;
    fireEvent.click(tagsBtn);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('/taxonomies/2/terms'))).toBe(true);
    });
  });

  it('clicking "New Taxonomy" toggles the taxonomy form', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New Taxonomy'));
    const newTaxBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('New Taxonomy')
    ) as HTMLButtonElement;
    fireEvent.click(newTaxBtn);
    await waitFor(() => {
      // Form appears with Name label
      expect(container.textContent).toContain('Name');
      expect(container.textContent).toContain('Slug');
    });
  });

  it('clicking "Cancel" hides the taxonomy form', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New Taxonomy'));
    const newTaxBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('New Taxonomy')
    ) as HTMLButtonElement;
    fireEvent.click(newTaxBtn);
    await waitFor(() => expect(container.querySelector('form')).toBeTruthy());
    // The same toggle button now reads "Cancel" — click it again to close
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Cancel')
    ) as HTMLButtonElement;
    expect(cancelBtn).toBeTruthy();
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(container.querySelector('form')).toBeNull();
    });
  });
});

// ─── Create taxonomy ──────────────────────────────────────────────────────────

describe('TaxonomyPage — create taxonomy', () => {
  it('typing a name auto-fills the slug', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New Taxonomy'));
    const newTaxBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('New Taxonomy')
    ) as HTMLButtonElement;
    fireEvent.click(newTaxBtn);
    await waitFor(() => expect(container.querySelector('form')).toBeTruthy());
    const form = container.querySelector('form')!;
    const nameInput = form.querySelectorAll('input')[0] as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'My Genre' } });
    const slugInput = form.querySelectorAll('input')[1] as HTMLInputElement;
    expect(slugInput.value).toBe('my-genre');
  });

  it('submitting the form calls POST /taxonomies and refreshes the list', async () => {
    const newTax = makeTaxonomy(99, { name: 'Genres' });
    fetchMock.mockImplementation(async (url, init) => {
      if (url === `${BASE}/taxonomies` && init?.method === 'POST') {
        return makeRes({ success: true, data: newTax });
      }
      if (url === `${BASE}/taxonomies`) {
        return makeRes({ success: true, data: [makeTaxonomy(1), newTax] });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New Taxonomy'));
    const newTaxBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('New Taxonomy')
    ) as HTMLButtonElement;
    fireEvent.click(newTaxBtn);
    await waitFor(() => expect(container.querySelector('form')).toBeTruthy());
    const form = container.querySelector('form')!;
    const nameInput = form.querySelectorAll('input')[0] as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Genres' } });
    fireEvent.submit(form);
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => c[0] === `${BASE}/taxonomies` && (c[1] as any)?.method === 'POST'
      );
      expect(postCall).toBeTruthy();
    });
  });

  it('shows error message when create taxonomy fails', async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (url === `${BASE}/taxonomies` && init?.method === 'POST') {
        return makeRes({ success: false, message: 'slug already exists' });
      }
      if (url === `${BASE}/taxonomies`) {
        return makeRes({ success: true, data: [makeTaxonomy(1)] });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New Taxonomy'));
    const newTaxBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('New Taxonomy')
    ) as HTMLButtonElement;
    fireEvent.click(newTaxBtn);
    await waitFor(() => expect(container.querySelector('form')).toBeTruthy());
    const form = container.querySelector('form')!;
    const nameInput = form.querySelectorAll('input')[0] as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Dupe' } });
    fireEvent.submit(form);
    await waitFor(() => {
      expect(container.textContent).toContain('slug already exists');
    });
  });

  it('taxonomy form shows the icon picker', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New Taxonomy'));
    const newTaxBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('New Taxonomy')
    ) as HTMLButtonElement;
    fireEvent.click(newTaxBtn);
    await waitFor(() => expect(container.querySelector('form')).toBeTruthy());
    expect(container.textContent).toContain('Icon');
  });

  it('taxonomy form has a hierarchical checkbox', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New Taxonomy'));
    const newTaxBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('New Taxonomy')
    ) as HTMLButtonElement;
    fireEvent.click(newTaxBtn);
    await waitFor(() => expect(container.querySelector('form')).toBeTruthy());
    const form = container.querySelector('form')!;
    const hierarchicalCheckbox = form.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(hierarchicalCheckbox).toBeTruthy();
    fireEvent.click(hierarchicalCheckbox);
    expect(hierarchicalCheckbox.checked).toBe(true);
  });
});

// ─── Terms list — flat taxonomy ───────────────────────────────────────────────

describe('TaxonomyPage — flat terms list', () => {
  function setupWithTerms(terms: any[]) {
    fetchMock.mockImplementation(async (url) => {
      if (url === `${BASE}/taxonomies`) {
        return makeRes({ success: true, data: [makeTaxonomy(1, { name: 'Tags' })] });
      }
      if (url.includes('/terms')) {
        return makeRes({ success: true, data: terms });
      }
      return makeRes({ success: true, data: [] });
    });
  }

  it('renders flat term chips', async () => {
    setupWithTerms([makeTerm(1, { name: 'React' }), makeTerm(2, { name: 'Vue' })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('React');
      expect(container.textContent).toContain('Vue');
    });
  });

  it('renders term slug in flat view', async () => {
    setupWithTerms([makeTerm(1, { name: 'React', slug: 'react' })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('(react)');
    });
  });

  it('renders colored dot when term has a color', async () => {
    setupWithTerms([makeTerm(1, { color: '#ff0000' })]);
    const { container } = renderPage();
    await waitFor(() => {
      const dot = container.querySelector('[style*="background-color"]');
      expect(dot).toBeTruthy();
    });
  });

  it('shows loading spinner while terms load', async () => {
    let resolveTerms: (v: any) => void = () => {};
    const p = new Promise<FetchResp>((res) => { resolveTerms = res; });
    fetchMock.mockImplementation(async (url) => {
      if (url === `${BASE}/taxonomies`) {
        return makeRes({ success: true, data: [makeTaxonomy(1)] });
      }
      if (url.includes('/terms')) return p;
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    // After taxonomies load the terms spinner appears
    await waitFor(() => {
      expect(container.querySelector('.animate-spin')).toBeTruthy();
    });
    resolveTerms(makeRes({ success: true, data: [] }));
  });
});

// ─── Terms list — hierarchical taxonomy ──────────────────────────────────────

describe('TaxonomyPage — hierarchical terms list', () => {
  function setupHierarchical(terms: any[]) {
    fetchMock.mockImplementation(async (url) => {
      if (url === `${BASE}/taxonomies`) {
        return makeRes({ success: true, data: [makeTaxonomy(1, { hierarchical: true, name: 'Categories' })] });
      }
      if (url.includes('/terms')) {
        return makeRes({ success: true, data: terms });
      }
      return makeRes({ success: true, data: [] });
    });
  }

  it('renders top-level terms as TermRow', async () => {
    setupHierarchical([makeTerm(1, { name: 'Science', parentId: null })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Science');
    });
  });

  it('renders child terms indented under parent', async () => {
    setupHierarchical([
      makeTerm(1, { name: 'Science', parentId: null }),
      makeTerm(2, { name: 'Physics', parentId: 1 }),
    ]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Science');
      expect(container.textContent).toContain('Physics');
    });
  });

  it('renders term slug in hierarchical view', async () => {
    setupHierarchical([makeTerm(1, { name: 'Science', slug: 'science' })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('/science');
    });
  });

  it('renders description when present in hierarchical view', async () => {
    setupHierarchical([makeTerm(1, { description: 'Natural sciences' })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Natural sciences');
    });
  });

  it('renders colored dot in hierarchical TermRow when term has color', async () => {
    setupHierarchical([makeTerm(1, { color: '#00ff00' })]);
    const { container } = renderPage();
    await waitFor(() => {
      const dot = container.querySelector('[style*="background-color"]');
      expect(dot).toBeTruthy();
    });
  });
});

// ─── Add term form ────────────────────────────────────────────────────────────

describe('TaxonomyPage — add term form', () => {
  it('clicking "Add" button opens the term form', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Add Tax'));
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add Tax')
    ) as HTMLButtonElement;
    fireEvent.click(addBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('New Tax');
    });
  });

  it('shows the term form with Name and Slug fields', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Add Tax'));
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add Tax')
    ) as HTMLButtonElement;
    fireEvent.click(addBtn);
    await waitFor(() => expect(container.querySelector('form')).toBeTruthy());
    expect(container.textContent).toContain('Name');
    expect(container.textContent).toContain('Slug');
    expect(container.textContent).toContain('Description');
    expect(container.textContent).toContain('Color');
  });

  it('typing a term name auto-fills slug in create mode', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Add Tax'));
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add Tax')
    ) as HTMLButtonElement;
    fireEvent.click(addBtn);
    await waitFor(() => expect(container.querySelector('form')).toBeTruthy());
    const form = container.querySelector('form')!;
    const nameInput = form.querySelectorAll('input')[0] as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Hello World' } });
    const slugInput = form.querySelectorAll('input')[1] as HTMLInputElement;
    expect(slugInput.value).toBe('hello-world');
  });

  it('submitting the create term form calls POST /terms', async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (url === `${BASE}/taxonomies`) {
        return makeRes({ success: true, data: [makeTaxonomy(1)] });
      }
      if (url.includes('/terms') && init?.method === 'POST') {
        return makeRes({ success: true, data: makeTerm(10) });
      }
      if (url.includes('/terms')) {
        return makeRes({ success: true, data: [] });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Add Tax'));
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add Tax')
    ) as HTMLButtonElement;
    fireEvent.click(addBtn);
    await waitFor(() => expect(container.querySelector('form')).toBeTruthy());
    const form = container.querySelector('form')!;
    const nameInput = form.querySelectorAll('input')[0] as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'React' } });
    fireEvent.submit(form);
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/terms') && (c[1] as any)?.method === 'POST'
      );
      expect(postCall).toBeTruthy();
    });
  });

  it('shows error when create term fails', async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (url === `${BASE}/taxonomies`) {
        return makeRes({ success: true, data: [makeTaxonomy(1)] });
      }
      if (url.includes('/terms') && init?.method === 'POST') {
        return makeRes({ success: false, message: 'term slug taken' });
      }
      if (url.includes('/terms')) {
        return makeRes({ success: true, data: [] });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Add Tax'));
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add Tax')
    ) as HTMLButtonElement;
    fireEvent.click(addBtn);
    await waitFor(() => expect(container.querySelector('form')).toBeTruthy());
    const form = container.querySelector('form')!;
    const nameInput = form.querySelectorAll('input')[0] as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Dupe' } });
    fireEvent.submit(form);
    await waitFor(() => {
      expect(container.textContent).toContain('term slug taken');
    });
  });

  it('Cancel button inside term form closes it', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Add Tax'));
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add Tax')
    ) as HTMLButtonElement;
    fireEvent.click(addBtn);
    await waitFor(() => expect(container.querySelector('form')).toBeTruthy());
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cancel'
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(container.querySelector('form')).toBeNull();
    });
  });

  it('hierarchical term form shows Parent select', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === `${BASE}/taxonomies`) {
        return makeRes({ success: true, data: [makeTaxonomy(1, { hierarchical: true })] });
      }
      if (url.includes('/terms')) {
        return makeRes({ success: true, data: [makeTerm(1, { name: 'Science', parentId: null })] });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Add Tax'));
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add Tax')
    ) as HTMLButtonElement;
    fireEvent.click(addBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Parent');
      expect(container.textContent).toContain('None (top-level)');
    });
  });
});

// ─── Edit term ────────────────────────────────────────────────────────────────

describe('TaxonomyPage — edit term (flat)', () => {
  function setupWithFlatTerms(terms: any[]) {
    fetchMock.mockImplementation(async (url, init) => {
      if (url === `${BASE}/taxonomies`) {
        return makeRes({ success: true, data: [makeTaxonomy(1, { name: 'Tags' })] });
      }
      if (url.includes('/terms') && init?.method === 'PUT') {
        return makeRes({ success: true, data: {} });
      }
      if (url.includes('/terms')) {
        return makeRes({ success: true, data: terms });
      }
      return makeRes({ success: true, data: [] });
    });
  }

  it('clicking edit on a flat term opens the term form in edit mode', async () => {
    setupWithFlatTerms([makeTerm(1, { name: 'React' })]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('React'));
    // Edit button is inside a .group element — hover to reveal, then click
    const editBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.querySelector('.material-icons')?.textContent === 'edit'
    );
    expect(editBtns.length).toBeGreaterThan(0);
    fireEvent.click(editBtns[0]);
    await waitFor(() => {
      expect(container.textContent).toContain('Edit');
    });
  });

  it('submitting the edit form calls PUT /terms/:id', async () => {
    setupWithFlatTerms([makeTerm(1, { name: 'React', slug: 'react' })]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('React'));
    const editBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.querySelector('.material-icons')?.textContent === 'edit'
    );
    fireEvent.click(editBtns[0]);
    await waitFor(() => expect(container.querySelector('form')).toBeTruthy());
    const form = container.querySelector('form')!;
    fireEvent.submit(form);
    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/terms/1') && (c[1] as any)?.method === 'PUT'
      );
      expect(putCall).toBeTruthy();
    });
  });
});

// ─── Delete term ──────────────────────────────────────────────────────────────

describe('TaxonomyPage — delete term (flat)', () => {
  it('clicking delete on a flat term calls DELETE /terms/:id', async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (url === `${BASE}/taxonomies`) {
        return makeRes({ success: true, data: [makeTaxonomy(1, { name: 'Tags' })] });
      }
      if (url.includes('/terms') && init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      if (url.includes('/terms')) {
        return makeRes({ success: true, data: [makeTerm(1, { name: 'React' })] });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('React'));
    const deleteBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.querySelector('.material-icons')?.textContent === 'close'
    );
    expect(deleteBtns.length).toBeGreaterThan(0);
    fireEvent.click(deleteBtns[0]);
    await waitFor(() => {
      const delCall = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/terms/1') && (c[1] as any)?.method === 'DELETE'
      );
      expect(delCall).toBeTruthy();
    });
  });

  it('does NOT delete if user cancels the confirm dialog', async () => {
    vi.stubGlobal('confirm', () => false);
    fetchMock.mockImplementation(async (url) => {
      if (url === `${BASE}/taxonomies`) {
        return makeRes({ success: true, data: [makeTaxonomy(1, { name: 'Tags' })] });
      }
      if (url.includes('/terms')) {
        return makeRes({ success: true, data: [makeTerm(1, { name: 'React' })] });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('React'));
    const before = fetchMock.mock.calls.length;
    const deleteBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.querySelector('.material-icons')?.textContent === 'close'
    );
    fireEvent.click(deleteBtns[0]);
    // No additional DELETE fetch should have been made
    expect(fetchMock.mock.calls.length).toBe(before);
  });
});

// ─── Edit term — hierarchical ─────────────────────────────────────────────────

describe('TaxonomyPage — edit term (hierarchical)', () => {
  it('clicking edit on a hierarchical TermRow opens the term form in edit mode', async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (url === `${BASE}/taxonomies`) {
        return makeRes({ success: true, data: [makeTaxonomy(1, { hierarchical: true, name: 'Categories' })] });
      }
      if (url.includes('/terms') && init?.method === 'PUT') {
        return makeRes({ success: true, data: {} });
      }
      if (url.includes('/terms')) {
        return makeRes({ success: true, data: [makeTerm(1, { name: 'Science', parentId: null })] });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Science'));
    const editBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.querySelector('.material-icons')?.textContent === 'edit'
    );
    expect(editBtns.length).toBeGreaterThan(0);
    fireEvent.click(editBtns[0]);
    await waitFor(() => {
      expect(container.textContent).toContain('Edit');
    });
    // In edit mode, slug should NOT auto-update when name changes
    const form = container.querySelector('form')!;
    const nameInput = form.querySelectorAll('input')[0] as HTMLInputElement;
    const slugInput = form.querySelectorAll('input')[1] as HTMLInputElement;
    const originalSlug = slugInput.value;
    fireEvent.change(nameInput, { target: { value: 'New Name' } });
    expect(slugInput.value).toBe(originalSlug); // slug unchanged in edit mode
  });

  it('delete button on hierarchical TermRow calls DELETE /terms/:id', async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (url === `${BASE}/taxonomies`) {
        return makeRes({ success: true, data: [makeTaxonomy(1, { hierarchical: true, name: 'Categories' })] });
      }
      if (url.includes('/terms') && init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      if (url.includes('/terms')) {
        return makeRes({ success: true, data: [makeTerm(1, { name: 'Science' })] });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Science'));
    const deleteBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.querySelector('.material-icons')?.textContent === 'delete'
    );
    expect(deleteBtns.length).toBeGreaterThan(0);
    fireEvent.click(deleteBtns[0]);
    await waitFor(() => {
      const delCall = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/terms/1') && (c[1] as any)?.method === 'DELETE'
      );
      expect(delCall).toBeTruthy();
    });
  });
});

// ─── Built-in taxonomy badge ──────────────────────────────────────────────────

describe('TaxonomyPage — built-in taxonomy right panel', () => {
  it('shows built-in badge in the right panel header', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === `${BASE}/taxonomies`) {
        return makeRes({ success: true, data: [makeTaxonomy(1, { builtIn: true, name: 'Categories' })] });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('built-in');
    });
  });
});

// ─── Add-term button label ────────────────────────────────────────────────────

describe('TaxonomyPage — Add button label', () => {
  it('pluralised taxonomy name is de-pluralised for the Add button', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === `${BASE}/taxonomies`) {
        return makeRes({ success: true, data: [makeTaxonomy(1, { name: 'Tags' })] });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      // "Tags".replace(/s$/, '') = "Tag"
      expect(container.textContent).toContain('Add Tag');
    });
  });
});
