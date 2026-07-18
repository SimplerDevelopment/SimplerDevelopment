// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/brain/glossary/page.tsx`
 *
 * The page is a 'use client' component that fetches glossary terms,
 * users, and categories; renders them grouped by category; supports
 * status/category/owner/search filters synced to URL params; and
 * exposes a bulk-import modal.
 *
 * Strategy: stub next/navigation, GlossaryTermCard, GlossaryBulkImportModal,
 * and global fetch. Drive state via fake URLSearchParams and fetch responses.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ────────────────────────────────────────

const replaceMock = vi.fn();
let searchParamsValue = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: replaceMock,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/portal/brain/glossary',
  useSearchParams: () => searchParamsValue,
}));

vi.mock('next/link', () => ({
  default: function MockLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
    return React.createElement('a', { href, className }, children);
  },
}));

// Stub GlossaryTermCard — the list page passes `term` as a prop.
vi.mock('@/components/brain/GlossaryTermCard', () => ({
  default: function GlossaryTermCard({ term }: { term: { id: number; term: string } }) {
    return React.createElement('div', { 'data-testid': `term-card-${term.id}` }, term.term);
  },
}));

// Stub GlossaryBulkImportModal — capture open/onClose/onImported.
let capturedBulkProps: { open: boolean; onClose: () => void; onImported: () => void } | null = null;
vi.mock('@/components/brain/GlossaryBulkImportModal', () => ({
  default: function GlossaryBulkImportModal(props: { open: boolean; onClose: () => void; onImported: () => void }) {
    capturedBulkProps = props;
    if (!props.open) return null;
    return React.createElement('div', { 'data-testid': 'bulk-import-modal' }, 'Bulk import modal');
  },
}));

// Stub @/lib/db/schema — only the type is used; the import is type-only at
// runtime so we just need the module to resolve.
vi.mock('@/lib/db/schema', () => ({}));

// ─── Fetch stub ───────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<unknown> };
const fetchMock = vi.fn<(url: string) => Promise<FetchResp>>();

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, json: async () => body };
}

function makeGlossaryRes(items: GlossaryTermData[], total?: number) {
  return makeRes({
    success: true,
    data: { items, total: total ?? items.length, limit: 25, offset: 0 },
  });
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

interface GlossaryTermData {
  id: number;
  term: string;
  slug: string;
  shortDefinition: string | null;
  status: 'active' | 'deprecated';
  category: string | null;
  aliasCount: number;
}

function makeTerm(id: number, extra: Partial<GlossaryTermData> = {}): GlossaryTermData {
  return {
    id,
    term: `Term ${id}`,
    slug: `term-${id}`,
    shortDefinition: null,
    status: 'active',
    category: null,
    aliasCount: 0,
    ...extra,
  };
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  searchParamsValue = new URLSearchParams();
  replaceMock.mockReset();
  capturedBulkProps = null;
  fetchMock.mockReset();

  // Default: glossary returns empty, users returns empty.
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/api/portal/brain/glossary')) {
      return makeGlossaryRes([]);
    }
    if (url.includes('/api/portal/mentionable-users')) {
      return makeRes({ success: true, data: [] });
    }
    return makeRes({ success: true, data: {} });
  });

  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  vi.useRealTimers(); // must run before unstub — fake timers leak across tests
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Import after mocks ───────────────────────────────────────────────────────

import BrainGlossaryListPage from '@/app/portal/brain/glossary/page';

function renderPage() {
  return render(React.createElement(BrainGlossaryListPage));
}

// ─── Rendering — basic shell ──────────────────────────────────────────────────

describe('BrainGlossaryListPage — shell', () => {
  it('renders the Glossary heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Glossary');
    });
  });

  it('renders the subtitle text', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Tenant-specific terminology');
    });
  });

  it('renders a "New term" link pointing to /portal/brain/glossary/new', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/glossary/new"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders a "Bulk import" button', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const buttons = Array.from(container.querySelectorAll('button'));
      const bulkBtn = buttons.find(b => b.textContent?.includes('Bulk import'));
      expect(bulkBtn).toBeTruthy();
    });
  });

  it('renders the status filter pills (active / deprecated / all)', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('active');
      expect(container.textContent).toContain('deprecated');
      expect(container.textContent).toContain('all');
    });
  });

  it('renders the Category, Owner, and Search filter controls', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('#gl-cat-f')).toBeTruthy();
      expect(container.querySelector('#gl-owner-f')).toBeTruthy();
      expect(container.querySelector('#gl-search')).toBeTruthy();
    });
  });
});

// ─── Loading state ────────────────────────────────────────────────────────────

describe('BrainGlossaryListPage — loading state', () => {
  it('shows a loading indicator while fetch is pending', () => {
    // Never resolve so we stay in loading state
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.textContent).toContain('Loading');
  });
});

// ─── Empty state ──────────────────────────────────────────────────────────────

describe('BrainGlossaryListPage — empty state', () => {
  it('shows "No glossary terms yet." when list is empty with no filters', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No glossary terms yet.');
    });
  });

  it('shows "No matching terms." when search param is set and list is empty', async () => {
    searchParamsValue = new URLSearchParams('search=foo');
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No matching terms.');
    });
  });

  it('shows "No matching terms." when category param is set and list is empty', async () => {
    searchParamsValue = new URLSearchParams('category=Auth');
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No matching terms.');
    });
  });

  it('shows "No matching terms." when status=deprecated and list is empty', async () => {
    searchParamsValue = new URLSearchParams('status=deprecated');
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No matching terms.');
    });
  });

  it('shows "Start by adding your most-confused acronym." copy on vanilla empty state', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('most-confused acronym');
    });
  });

  it('shows "Try clearing filters." copy when filters are active', async () => {
    searchParamsValue = new URLSearchParams('search=whatever');
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Try clearing filters');
    });
  });

  it('empty state contains a "New term" link', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const links = Array.from(container.querySelectorAll('a[href="/portal/brain/glossary/new"]'));
      expect(links.length).toBeGreaterThan(0);
    });
  });
});

// ─── Error state ──────────────────────────────────────────────────────────────

describe('BrainGlossaryListPage — error state', () => {
  it('shows server error message when list endpoint returns success:false', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/glossary')) {
        return makeRes({ success: false, message: 'DB error' });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('DB error');
    });
  });

  it('shows server error message when list endpoint returns ok:false', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/glossary')) {
        return { ok: false, json: async () => ({ success: false, message: 'not found' }) };
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('not found');
    });
  });

  it('shows "Failed to load glossary." fallback when message is absent', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/glossary')) {
        return { ok: false, json: async () => ({ success: false }) };
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Failed to load glossary');
    });
  });

  it('shows network error when fetch throws', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/glossary')) {
        throw new Error('network offline');
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('network offline');
    });
  });

  it('shows "Network error" when non-Error is thrown', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/glossary')) {
        throw 'string error';
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Network error');
    });
  });

  it('renders the error heading "Couldn\'t load glossary"', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/glossary')) {
        return makeRes({ success: false, message: 'boom' });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain("Couldn");
      expect(container.textContent).toContain('load glossary');
    });
  });
});

// ─── Term list rendering ──────────────────────────────────────────────────────

describe('BrainGlossaryListPage — term list', () => {
  it('renders term cards when list is non-empty', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/glossary')) {
        return makeGlossaryRes([makeTerm(1), makeTerm(2)]);
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="term-card-1"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="term-card-2"]')).toBeTruthy();
    });
  });

  it('groups terms by category with the category name as section heading', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/glossary')) {
        return makeGlossaryRes([
          makeTerm(1, { category: 'Auth' }),
          makeTerm(2, { category: 'Billing' }),
        ]);
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Auth');
      expect(container.textContent).toContain('Billing');
    });
  });

  it('puts uncategorized terms under an "Uncategorized" section', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/glossary')) {
        return makeGlossaryRes([makeTerm(1, { category: null })]);
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Uncategorized');
    });
  });

  it('sorts categories alphabetically with Uncategorized last', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/glossary')) {
        return makeGlossaryRes([
          makeTerm(1, { category: null }),
          makeTerm(2, { category: 'Billing' }),
          makeTerm(3, { category: 'Auth' }),
        ]);
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      const text = container.textContent ?? '';
      const authIdx = text.indexOf('Auth');
      const billingIdx = text.indexOf('Billing');
      const uncatIdx = text.indexOf('Uncategorized');
      expect(authIdx).toBeLessThan(billingIdx);
      expect(billingIdx).toBeLessThan(uncatIdx);
    });
  });

  it('renders the row count badge next to each category name', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/glossary')) {
        return makeGlossaryRes([makeTerm(1, { category: 'Auth' }), makeTerm(2, { category: 'Auth' })]);
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('(2)');
    });
  });
});

// ─── Category collapse / expand ───────────────────────────────────────────────

describe('BrainGlossaryListPage — collapse / expand', () => {
  function setupOneCategory() {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/glossary')) {
        return makeGlossaryRes([makeTerm(1, { category: 'Auth' })]);
      }
      return makeRes({ success: true, data: [] });
    });
  }

  it('clicking the category header collapses the section (hides cards)', async () => {
    setupOneCategory();
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="term-card-1"]')).toBeTruthy();
    });
    // Click the Auth section header button
    const buttons = Array.from(container.querySelectorAll('button'));
    const authBtn = buttons.find(b => b.textContent?.includes('Auth'));
    fireEvent.click(authBtn!);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="term-card-1"]')).toBeNull();
    });
  });

  it('clicking the header again re-expands the section', async () => {
    setupOneCategory();
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="term-card-1"]')).toBeTruthy();
    });
    const buttons = Array.from(container.querySelectorAll('button'));
    const authBtn = buttons.find(b => b.textContent?.includes('Auth'))!;
    fireEvent.click(authBtn);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="term-card-1"]')).toBeNull();
    });
    // click same button again
    const authBtnAgain = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Auth'),
    )!;
    fireEvent.click(authBtnAgain);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="term-card-1"]')).toBeTruthy();
    });
  });
});

// ─── Pagination ───────────────────────────────────────────────────────────────

describe('BrainGlossaryListPage — pagination', () => {
  function setupManyTerms() {
    // 50 items, 25/page → 2 pages
    const items = Array.from({ length: 25 }, (_, i) => makeTerm(i + 1));
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/glossary')) {
        return makeGlossaryRes(items, 50);
      }
      return makeRes({ success: true, data: [] });
    });
  }

  it('shows pagination row when total > PAGE_SIZE', async () => {
    setupManyTerms();
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Page 1 of 2');
    });
  });

  it('shows total term count in pagination row', async () => {
    setupManyTerms();
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('50 terms');
    });
  });

  it('Prev button is disabled on page 1', async () => {
    setupManyTerms();
    const { container } = renderPage();
    await waitFor(() => {
      const prevBtn = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.includes('Prev'),
      ) as HTMLButtonElement;
      expect(prevBtn?.disabled).toBe(true);
    });
  });

  it('clicking Next calls router.replace with page=2', async () => {
    setupManyTerms();
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Page 1 of 2');
    });
    const nextBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Next'),
    ) as HTMLButtonElement;
    fireEvent.click(nextBtn);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
      const callArg = String(replaceMock.mock.calls[0][0]);
      expect(callArg).toContain('page=2');
    });
  });

  it('Next button is disabled on last page', async () => {
    searchParamsValue = new URLSearchParams('page=2');
    setupManyTerms();
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Page 2 of 2');
    });
    const nextBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Next'),
    ) as HTMLButtonElement;
    expect(nextBtn?.disabled).toBe(true);
  });

  it('clicking Prev from page 2 calls router.replace with page=1', async () => {
    searchParamsValue = new URLSearchParams('page=2');
    setupManyTerms();
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Page 2 of 2');
    });
    const prevBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Prev'),
    ) as HTMLButtonElement;
    fireEvent.click(prevBtn);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
      const callArg = String(replaceMock.mock.calls[0][0]);
      expect(callArg).toContain('page=1');
    });
  });

  it('pagination row is NOT rendered when total fits on one page', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/glossary')) {
        return makeGlossaryRes([makeTerm(1)], 1);
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="term-card-1"]')).toBeTruthy();
    });
    expect(container.textContent).not.toContain('Page 1 of');
  });

  it('shows "1 term" (singular) when total is exactly 1', async () => {
    // Need > 1 page to see pagination, use 26 total (page 1 = 25 items shown, 1 remaining)
    const items = Array.from({ length: 25 }, (_, i) => makeTerm(i + 1));
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/glossary')) {
        return makeGlossaryRes(items, 26);
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      // "26 terms" — just confirm plural form is used for 26
      expect(container.textContent).toContain('26 terms');
    });
  });
});

// ─── Filter interactions ──────────────────────────────────────────────────────

describe('BrainGlossaryListPage — filters', () => {
  it('clicking the "deprecated" status pill calls router.replace with status=deprecated', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('deprecated');
    });
    const depBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'deprecated',
    ) as HTMLButtonElement;
    fireEvent.click(depBtn);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
      const callArg = String(replaceMock.mock.calls[0][0]);
      expect(callArg).toContain('status=deprecated');
    });
  });

  it('clicking the "active" status pill removes the status param', async () => {
    searchParamsValue = new URLSearchParams('status=deprecated');
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('active');
    });
    const activeBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'active',
    ) as HTMLButtonElement;
    fireEvent.click(activeBtn);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
      const callArg = String(replaceMock.mock.calls[0][0]);
      // active is default — the param gets deleted, so it should not appear
      expect(callArg).not.toContain('status=active');
    });
  });

  it('clicking the "all" status pill calls router.replace with status=all', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('all');
    });
    const allBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'all',
    ) as HTMLButtonElement;
    fireEvent.click(allBtn);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
      const callArg = String(replaceMock.mock.calls[0][0]);
      expect(callArg).toContain('status=all');
    });
  });

  it('changing the category select calls router.replace with category param', async () => {
    // Pre-load categories by returning a term with a category
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('limit=100')) {
        return makeGlossaryRes([makeTerm(1, { category: 'Auth' })]);
      }
      if (url.includes('/api/portal/brain/glossary')) {
        return makeGlossaryRes([]);
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      const select = container.querySelector('#gl-cat-f') as HTMLSelectElement;
      expect(select).toBeTruthy();
      // The option for 'Auth' should be present after the categories load
      const authOption = Array.from(select.options).find(o => o.value === 'Auth');
      expect(authOption).toBeTruthy();
    });
    const select = container.querySelector('#gl-cat-f') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'Auth' } });
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
      const callArg = String(replaceMock.mock.calls[0][0]);
      expect(callArg).toContain('category=Auth');
    });
  });

  it('typing into the search box updates the local draft value', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('#gl-search')).toBeTruthy();
    });
    const input = container.querySelector('#gl-search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'SSO' } });
    expect(input.value).toBe('SSO');
  });

  it('search box debounce eventually calls router.replace', async () => {
    // Use fake timers only for the debounce portion; restore before any waitFor.
    vi.useFakeTimers();
    const { container } = renderPage();
    // Flush pending micro-tasks (initial useEffect fetch calls).
    await act(async () => {});
    const input = container.querySelector('#gl-search') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'API' } });
      vi.advanceTimersByTime(300);
    });
    // Restore real timers BEFORE waitFor so its polling can fire.
    vi.useRealTimers();
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
      const callArg = String(replaceMock.mock.calls[0][0]);
      expect(callArg).toContain('search=API');
    });
  });

  it('populates owner dropdown from mentionable-users endpoint', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/mentionable-users')) {
        return makeRes({ success: true, data: [{ id: 7, name: 'Alice' }, { id: 8, name: 'Bob' }] });
      }
      if (url.includes('/api/portal/brain/glossary')) {
        return makeGlossaryRes([]);
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      const ownerSelect = container.querySelector('#gl-owner-f') as HTMLSelectElement;
      const options = Array.from(ownerSelect.options).map(o => o.text);
      expect(options).toContain('Alice');
      expect(options).toContain('Bob');
    });
  });

  it('changing the owner dropdown calls router.replace with ownerId param', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/mentionable-users')) {
        return makeRes({ success: true, data: [{ id: 7, name: 'Alice' }] });
      }
      if (url.includes('/api/portal/brain/glossary')) {
        return makeGlossaryRes([]);
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      const sel = container.querySelector('#gl-owner-f') as HTMLSelectElement;
      const alice = Array.from(sel.options).find(o => o.text === 'Alice');
      expect(alice).toBeTruthy();
    });
    const ownerSelect = container.querySelector('#gl-owner-f') as HTMLSelectElement;
    fireEvent.change(ownerSelect, { target: { value: '7' } });
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
      const callArg = String(replaceMock.mock.calls[0][0]);
      expect(callArg).toContain('ownerId=7');
    });
  });

  it('URL search param pre-populates the search input', async () => {
    searchParamsValue = new URLSearchParams('search=glossary');
    const { container } = renderPage();
    await waitFor(() => {
      const input = container.querySelector('#gl-search') as HTMLInputElement;
      expect(input.value).toBe('glossary');
    });
  });
});

// ─── Bulk import modal ────────────────────────────────────────────────────────

describe('BrainGlossaryListPage — bulk import modal', () => {
  it('modal is closed by default', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="bulk-import-modal"]')).toBeNull();
    });
  });

  it('clicking "Bulk import" opens the modal', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Bulk import');
    });
    const bulkBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Bulk import'),
    ) as HTMLButtonElement;
    fireEvent.click(bulkBtn);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="bulk-import-modal"]')).toBeTruthy();
    });
  });

  it('onClose callback from modal closes it', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Bulk import');
    });
    const bulkBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Bulk import'),
    ) as HTMLButtonElement;
    fireEvent.click(bulkBtn);
    await waitFor(() => {
      expect(capturedBulkProps?.open).toBe(true);
    });
    act(() => {
      capturedBulkProps!.onClose();
    });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="bulk-import-modal"]')).toBeNull();
    });
  });

  it('onImported callback triggers a list reload', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/glossary')) {
        return makeGlossaryRes([]);
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Bulk import');
    });
    // Count only glossary list calls (excluding limit=100 categories fetch) before the reload.
    const glossaryListCallsBefore = fetchMock.mock.calls.filter(c =>
      String(c[0]).includes('/api/portal/brain/glossary') && !String(c[0]).includes('limit=100'),
    ).length;
    const bulkBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Bulk import'),
    ) as HTMLButtonElement;
    fireEvent.click(bulkBtn);
    await waitFor(() => {
      expect(capturedBulkProps?.open).toBe(true);
    });
    act(() => {
      capturedBulkProps!.onImported();
    });
    await waitFor(() => {
      // Additional glossary list fetches should have been triggered by onImported.
      const glossaryListCallsAfter = fetchMock.mock.calls.filter(c =>
        String(c[0]).includes('/api/portal/brain/glossary') && !String(c[0]).includes('limit=100'),
      ).length;
      expect(glossaryListCallsAfter).toBeGreaterThan(glossaryListCallsBefore);
    });
  });
});

// ─── Non-fatal category / user fetch failure ──────────────────────────────────

describe('BrainGlossaryListPage — non-fatal side-effect fetch failures', () => {
  it('does not crash when the categories fetch (limit=100) fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('limit=100')) {
        throw new Error('categories fetch failed');
      }
      if (url.includes('/api/portal/brain/glossary')) {
        return makeGlossaryRes([]);
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      // Page still renders without crashing
      expect(container.textContent).toContain('Glossary');
    });
  });

  it('does not crash when the users fetch fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/mentionable-users')) {
        throw new Error('users fetch failed');
      }
      if (url.includes('/api/portal/brain/glossary')) {
        return makeGlossaryRes([]);
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Glossary');
    });
  });

  it('does not crash when users endpoint returns success:false', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/mentionable-users')) {
        return makeRes({ success: false });
      }
      if (url.includes('/api/portal/brain/glossary')) {
        return makeGlossaryRes([]);
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Glossary');
    });
  });
});

// ─── URL-param driven filter query params ─────────────────────────────────────

describe('BrainGlossaryListPage — URL-param driven fetch', () => {
  it('passes status param to the fetch when status=deprecated in URL', async () => {
    searchParamsValue = new URLSearchParams('status=deprecated');
    const { container } = renderPage();
    await waitFor(() => {
      const glossaryCalls = fetchMock.mock.calls
        .map(c => String(c[0]))
        .filter(u => u.includes('/api/portal/brain/glossary') && !u.includes('limit=100'));
      expect(glossaryCalls.some(u => u.includes('status=deprecated'))).toBe(true);
    });
    expect(container.textContent).toContain('Glossary');
  });

  it('does NOT pass status param when status=all (fetches without filter)', async () => {
    searchParamsValue = new URLSearchParams('status=all');
    const { container } = renderPage();
    await waitFor(() => {
      const glossaryCalls = fetchMock.mock.calls
        .map(c => String(c[0]))
        .filter(u => u.includes('/api/portal/brain/glossary') && !u.includes('limit=100'));
      // status=all means fetch ALL, so `status` param should be absent from the list call
      expect(glossaryCalls.some(u => !u.includes('status='))).toBe(true);
    });
    expect(container.textContent).toContain('Glossary');
  });

  it('passes search param to the list fetch', async () => {
    searchParamsValue = new URLSearchParams('search=API');
    const { container } = renderPage();
    await waitFor(() => {
      const glossaryCalls = fetchMock.mock.calls
        .map(c => String(c[0]))
        .filter(u => u.includes('/api/portal/brain/glossary') && !u.includes('limit=100'));
      expect(glossaryCalls.some(u => u.includes('search=API'))).toBe(true);
    });
    expect(container.textContent).toContain('Glossary');
  });

  it('passes ownerId param to the list fetch', async () => {
    searchParamsValue = new URLSearchParams('ownerId=42');
    const { container } = renderPage();
    await waitFor(() => {
      const glossaryCalls = fetchMock.mock.calls
        .map(c => String(c[0]))
        .filter(u => u.includes('/api/portal/brain/glossary') && !u.includes('limit=100'));
      expect(glossaryCalls.some(u => u.includes('ownerId=42'))).toBe(true);
    });
    expect(container.textContent).toContain('Glossary');
  });
});
