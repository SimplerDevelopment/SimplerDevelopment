/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/brain/people/page.tsx`
 *
 * The page is a 'use client' component that:
 * - Fetches people from /api/portal/brain/people with status/orgUnit/tag/search/page filters
 * - Loads org-unit tree and expertise tags for filter UI
 * - Shows loading, empty, error, and list states
 * - Supports status tabs (Active / Inactive / Departed / All)
 * - Supports debounced search — syncs to URL via router.replace
 * - Paginates (25/page) using URL params (?page=)
 * - Renders expertise tag chips for filtering
 *
 * Strategy: stub next/navigation (useRouter + useSearchParams), next/link,
 * PersonCard (named + default export), and global fetch.
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
  usePathname: () => '/portal/brain/people',
  useSearchParams: () => searchParamsValue,
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: function MockLink({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) {
    return React.createElement('a', { href, className }, children);
  },
}));

// Stub PersonCard — a named export AND a default export in PersonCard.tsx.
vi.mock('@/components/brain/PersonCard', () => ({
  __esModule: true,
  PersonCard: function MockPersonCard({ person }: any) {
    return React.createElement(
      'div',
      { 'data-testid': `person-card-${person.id}` },
      `${person.displayName ?? person.firstName ?? ''} ${person.lastName ?? ''}`.trim(),
    );
  },
  default: function MockPersonCardDefault({ person }: any) {
    return React.createElement(
      'div',
      { 'data-testid': `person-card-${person.id}` },
      `${person.displayName ?? person.firstName ?? ''} ${person.lastName ?? ''}`.trim(),
    );
  },
}));

// ─── Fetch stub ───────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<unknown> };
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, json: async () => body };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

interface PersonCardData {
  id: number;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  title?: string | null;
  email?: string | null;
  status: string;
  avatarUrl?: string | null;
}

function makePerson(id: number, extra: Partial<PersonCardData> = {}): PersonCardData {
  return {
    id,
    displayName: null,
    firstName: `First${id}`,
    lastName: `Last${id}`,
    title: 'Engineer',
    email: `person${id}@team.test`,
    status: 'active',
    avatarUrl: null,
    ...extra,
  };
}

const baseOrgTree = {
  success: true,
  data: {
    tree: [
      { id: 10, name: 'Engineering', children: [{ id: 11, name: 'Backend', children: [] }] },
      { id: 12, name: 'Design', children: [] },
    ],
  },
};

const baseTags = {
  success: true,
  data: {
    items: [
      { id: 1, name: 'TypeScript' },
      { id: 2, name: 'React' },
    ],
  },
};

function defaultFetch(url: string): FetchResp {
  if (url.includes('/api/portal/brain/people')) {
    return makeRes({ success: true, data: { items: [makePerson(1), makePerson(2)] } });
  }
  if (url.includes('/api/portal/brain/org-units')) {
    return makeRes(baseOrgTree);
  }
  if (url.includes('/api/portal/brain/expertise-tags')) {
    return makeRes(baseTags);
  }
  return makeRes({ success: true, data: {} });
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  searchParamsValue = new URLSearchParams();
  replaceMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => defaultFetch(url));
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Import after mocks ───────────────────────────────────────────────────────

import BrainPeoplePage from '@/app/portal/brain/people/page';

function renderPage() {
  return render(React.createElement(BrainPeoplePage));
}

// ─── Shell rendering ──────────────────────────────────────────────────────────

describe('BrainPeoplePage — shell', () => {
  it('renders the "People" heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('People');
    });
  });

  it('renders the subtitle about internal team', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('internal team');
    });
  });

  it('renders a "New person" link', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/people/new"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toContain('New person');
    });
  });

  it('renders all four status tabs', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Active');
      expect(container.textContent).toContain('Inactive');
      expect(container.textContent).toContain('Departed');
      expect(container.textContent).toContain('All');
    });
  });

  it('renders the org-unit dropdown with "All org units" default', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const select = container.querySelector('select') as HTMLSelectElement;
      expect(select).toBeTruthy();
      const opts = Array.from(select.options).map((o) => o.text);
      expect(opts).toContain('All org units');
    });
  });

  it('renders the search input with correct placeholder', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const input = container.querySelector(
        'input[placeholder*="Search by name"]',
      );
      expect(input).toBeTruthy();
    });
  });
});

describe('BrainPeoplePage — loading state', () => {
  it('shows a loading indicator while fetch is in flight', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.textContent).toContain('Loading');
  });
});

describe('BrainPeoplePage — empty state', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/people')) {
        return makeRes({ success: true, data: { items: [] } });
      }
      return defaultFetch(url);
    });
  });

  it('shows "No people on file yet." when the list is empty', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No people on file yet.');
    });
  });

  it('shows the "Add person" CTA in the empty state', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Add person');
    });
  });

  it('the empty-state "Add person" link points to /portal/brain/people/new', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No people on file yet.');
    });
    const link = container.querySelector('a[href="/portal/brain/people/new"]');
    expect(link).toBeTruthy();
  });
});

describe('BrainPeoplePage — error state', () => {
  it('shows error message when endpoint returns success:false', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/people')) {
        return makeRes({ success: false, message: 'DB unavailable' });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('DB unavailable');
    });
  });

  it('shows error when endpoint returns ok:false', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/people')) {
        return { ok: false, json: async () => ({ success: false, message: 'not found' }) };
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('not found');
    });
  });

  it('shows fallback error when message is absent', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/people')) {
        return makeRes({ success: false }, false);
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Failed to load people.');
    });
  });

  it('shows network error message when fetch throws an Error', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/people')) {
        throw new Error('network offline');
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('network offline');
    });
  });

  it('shows "Network error" when a non-Error is thrown', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/people')) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'string-thrown-error';
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Network error');
    });
  });
});

describe('BrainPeoplePage — list rendering', () => {
  it('renders a card for each person in the response', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="person-card-1"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="person-card-2"]')).toBeTruthy();
    });
  });

  it('renders person name text from the PersonCard stub', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('First1 Last1');
      expect(container.textContent).toContain('First2 Last2');
    });
  });

  it('limits display to PAGE_SIZE (25) even when 26 rows are returned', async () => {
    const people = Array.from({ length: 26 }, (_, i) => makePerson(i + 1));
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/people')) {
        return makeRes({ success: true, data: { items: people } });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="person-card-1"]')).toBeTruthy();
    });
    // Person 26 should NOT be rendered (visibleRows = rows.slice(0, 25))
    expect(container.querySelector('[data-testid="person-card-26"]')).toBeNull();
  });

  it('detects hasNextPage when response contains 26 rows', async () => {
    const people = Array.from({ length: 26 }, (_, i) => makePerson(i + 1));
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/people')) {
        return makeRes({ success: true, data: { items: people } });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="person-card-1"]')).toBeTruthy();
    });
    // Pagination controls appear when hasNextPage is true
    const nextBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Next'),
    );
    expect(nextBtn).toBeTruthy();
    expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('BrainPeoplePage — org-unit filter', () => {
  it('populates org-unit dropdown with fetched tree nodes', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const select = container.querySelector('select') as HTMLSelectElement;
      const opts = Array.from(select.options).map((o) => o.text.trim());
      expect(opts).toContain('Engineering');
      expect(opts).toContain('Design');
    });
  });

  it('shows nested org units (children of Engineering)', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const select = container.querySelector('select') as HTMLSelectElement;
      const opts = Array.from(select.options).map((o) => o.text.trim());
      expect(opts).toContain('Backend');
    });
  });

  it('changing org-unit calls router.replace with orgUnitId param', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const select = container.querySelector('select') as HTMLSelectElement;
      const opts = Array.from(select.options);
      expect(opts.some((o) => o.value === '10')).toBe(true);
    });
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '10' } });
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
      const arg = String(replaceMock.mock.calls[replaceMock.mock.calls.length - 1][0]);
      expect(arg).toContain('orgUnitId=10');
    });
  });

  it('handles non-fatal failure fetching org-unit tree', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/org-units')) {
        throw new Error('org units fail');
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      // Page still loads people even if org-unit fetch fails
      expect(container.querySelector('[data-testid="person-card-1"]')).toBeTruthy();
    });
  });
});

describe('BrainPeoplePage — expertise tag filter', () => {
  it('renders expertise tag chips when tags are returned', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('TypeScript');
      expect(container.textContent).toContain('React');
    });
  });

  it('renders an "All" chip to clear the tag filter', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Expertise:');
    });
    // There should be an "All" chip
    const allChips = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.textContent?.trim() === 'All',
    );
    expect(allChips.length).toBeGreaterThanOrEqual(1);
  });

  it('clicking a tag chip calls router.replace with expertiseTagId', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('TypeScript');
    });
    const tagBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'TypeScript',
    ) as HTMLButtonElement;
    fireEvent.click(tagBtn);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
      const arg = String(replaceMock.mock.calls[replaceMock.mock.calls.length - 1][0]);
      expect(arg).toContain('expertiseTagId=1');
    });
  });

  it('clicking the "All" expertise chip clears expertiseTagId', async () => {
    // Start with expertiseTagId=1 in URL
    searchParamsValue = new URLSearchParams('expertiseTagId=1');
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('TypeScript');
    });
    replaceMock.mockReset();
    // The "All" expertise chip is the small pill-shaped button, not the status tab.
    // With expertiseTagId=1, the "All" pill should have active (primary) styling.
    const allChips = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim() === 'All',
    );
    // The expertise "All" chip is the one in the expertise row (has rounded-full class)
    const allExpertiseChip = allChips.find((b) =>
      b.className.includes('rounded-full'),
    ) as HTMLButtonElement;
    expect(allExpertiseChip).toBeTruthy();
    fireEvent.click(allExpertiseChip);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
      const allArgs = replaceMock.mock.calls.map((c) => String(c[0]));
      // At least one call should NOT have expertiseTagId param
      expect(allArgs.some((a) => !a.includes('expertiseTagId='))).toBe(true);
    });
  });

  it('does not show expertise section when tags list is empty', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/expertise-tags')) {
        return makeRes({ success: true, data: { items: [] } });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="person-card-1"]')).toBeTruthy();
    });
    expect(container.textContent).not.toContain('Expertise:');
  });

  it('handles non-fatal failure fetching expertise tags', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/expertise-tags')) {
        throw new Error('tags fail');
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="person-card-1"]')).toBeTruthy();
    });
  });

  it('clicking an already-selected tag deselects it (clears expertiseTagId)', async () => {
    searchParamsValue = new URLSearchParams('expertiseTagId=1');
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('TypeScript');
    });
    const tagBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'TypeScript',
    ) as HTMLButtonElement;
    fireEvent.click(tagBtn);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
      // Clicking the already-selected tag deselects it → no expertiseTagId param
      const arg = String(replaceMock.mock.calls[replaceMock.mock.calls.length - 1][0]);
      expect(arg).not.toContain('expertiseTagId=1');
    });
  });
});

describe('BrainPeoplePage — status tabs', () => {
  it('default status is "active" when no URL param', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      // The "Active" tab should have primary styling (bg-primary class)
      const activeBtns = Array.from(container.querySelectorAll('button')).filter((b) =>
        b.textContent?.includes('Active') && b.className.includes('bg-primary'),
      );
      expect(activeBtns.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('clicking Inactive tab calls router.replace with status=inactive', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('People'));
    const inactiveTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Inactive',
    ) as HTMLButtonElement;
    fireEvent.click(inactiveTab);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
      const arg = String(replaceMock.mock.calls[replaceMock.mock.calls.length - 1][0]);
      expect(arg).toContain('status=inactive');
    });
  });

  it('clicking Departed tab calls router.replace with status=departed', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('People'));
    const departedTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Departed',
    ) as HTMLButtonElement;
    fireEvent.click(departedTab);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
      const arg = String(replaceMock.mock.calls[replaceMock.mock.calls.length - 1][0]);
      expect(arg).toContain('status=departed');
    });
  });

  it('clicking All tab calls router.replace (the status tab fires setParam)', async () => {
    searchParamsValue = new URLSearchParams('status=inactive');
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('People'));
    replaceMock.mockReset();
    // The "All" status tab is in the inline-flex rounded-md group (no rounded-full class)
    const allTabs = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim() === 'All',
    );
    const statusAllTab = allTabs.find((b) => !b.className.includes('rounded-full')) as HTMLButtonElement;
    expect(statusAllTab).toBeTruthy();
    fireEvent.click(statusAllTab);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
    });
  });

  it('invalid status param falls back to "active"', async () => {
    searchParamsValue = new URLSearchParams('status=bogus');
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('People');
    });
    // Should have fetched with status=active (the fallback)
    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    // The default 'active' adds ?status=active to the people fetch
    expect(calls.some((u) => u.includes('status=active'))).toBe(true);
  });

  it('respects status=inactive from URL params', async () => {
    searchParamsValue = new URLSearchParams('status=inactive');
    renderPage();
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('status=inactive'))).toBe(true);
    });
  });

  it('status=all does not add a status query param to the people fetch', async () => {
    searchParamsValue = new URLSearchParams('status=all');
    renderPage();
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes('/api/portal/brain/people'),
      );
      expect(calls.length).toBeGreaterThan(0);
      // status=all should NOT add status param to fetch URL
      expect(calls.every((c) => !String(c[0]).includes('status=all'))).toBe(true);
    });
  });
});

describe('BrainPeoplePage — search', () => {
  it('typing in the search box updates URL via router.replace after debounce', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('People'));
    vi.useFakeTimers();
    const searchInput = container.querySelector(
      'input[placeholder*="Search by name"]',
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'alice' } });
      vi.advanceTimersByTime(300);
    });
    vi.useRealTimers();
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
      const arg = String(replaceMock.mock.calls[replaceMock.mock.calls.length - 1][0]);
      expect(arg).toContain('q=alice');
    });
  });

  it('clearing the search removes the q param from URL', async () => {
    searchParamsValue = new URLSearchParams('q=alice');
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('People'));
    vi.useFakeTimers();
    const searchInput = container.querySelector(
      'input[placeholder*="Search by name"]',
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: '' } });
      vi.advanceTimersByTime(300);
    });
    vi.useRealTimers();
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
      const arg = String(replaceMock.mock.calls[replaceMock.mock.calls.length - 1][0]);
      expect(arg).not.toContain('q=');
    });
  });

  it('does not call router.replace if searchInput equals searchParam (no-op)', async () => {
    searchParamsValue = new URLSearchParams('q=alice');
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('People'));
    replaceMock.mockReset();
    // No change to searchInput — debounce guard should prevent router.replace
    await act(async () => { await Promise.resolve(); });
    // replaceMock should NOT have been called from the search effect alone
    const searchReplaces = replaceMock.mock.calls.filter((c) =>
      String(c[0]).includes('q='),
    );
    expect(searchReplaces.length).toBe(0);
  });
});

describe('BrainPeoplePage — pagination', () => {
  it('does not show pagination when only one page of results exists', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="person-card-1"]')).toBeTruthy();
    });
    // 2 people (< 25) + no query param page > 1 → pagination not shown
    const nextBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Next'),
    );
    expect(nextBtn).toBeUndefined();
  });

  it('shows Prev/Next controls when page > 1', async () => {
    searchParamsValue = new URLSearchParams('page=2');
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="person-card-1"]')).toBeTruthy();
    });
    const prevBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Prev'),
    );
    expect(prevBtn).toBeTruthy();
  });

  it('Prev button is disabled on page 1', async () => {
    // hasNextPage requires 26 rows; also set page=1 explicitly
    const people = Array.from({ length: 26 }, (_, i) => makePerson(i + 1));
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/people')) {
        return makeRes({ success: true, data: { items: people } });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="person-card-1"]')).toBeTruthy();
    });
    const prevBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Prev'),
    ) as HTMLButtonElement;
    expect(prevBtn?.disabled).toBe(true);
  });

  it('clicking Next calls router.replace with page=2', async () => {
    const people = Array.from({ length: 26 }, (_, i) => makePerson(i + 1));
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/people')) {
        return makeRes({ success: true, data: { items: people } });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="person-card-1"]')).toBeTruthy();
    });
    const nextBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Next'),
    ) as HTMLButtonElement;
    fireEvent.click(nextBtn);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
      const arg = String(replaceMock.mock.calls[replaceMock.mock.calls.length - 1][0]);
      expect(arg).toContain('page=2');
    });
  });

  it('clicking Prev on page 2 removes the page param (back to page 1)', async () => {
    searchParamsValue = new URLSearchParams('page=2');
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="person-card-1"]')).toBeTruthy();
    });
    const prevBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Prev'),
    ) as HTMLButtonElement;
    fireEvent.click(prevBtn);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
      const arg = String(replaceMock.mock.calls[replaceMock.mock.calls.length - 1][0]);
      // Going from page 2 to page 1 removes the page param (page <= 2 → null)
      expect(arg).not.toContain('page=1');
    });
  });

  it('renders page number indicator', async () => {
    searchParamsValue = new URLSearchParams('page=2');
    const people = Array.from({ length: 26 }, (_, i) => makePerson(i + 1));
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/people')) {
        return makeRes({ success: true, data: { items: people } });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Page 2');
    });
  });

  it('sends correct offset to API based on page param', async () => {
    searchParamsValue = new URLSearchParams('page=3');
    renderPage();
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      // page=3 → offset=(3-1)*25=50
      expect(calls.some((u) => u.includes('offset=50'))).toBe(true);
    });
  });
});

describe('BrainPeoplePage — URL param wiring for people fetch', () => {
  it('passes orgUnitId to people fetch when set in URL', async () => {
    searchParamsValue = new URLSearchParams('orgUnitId=10');
    renderPage();
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('orgUnitId=10'))).toBe(true);
    });
  });

  it('passes expertiseTagId to people fetch when set in URL', async () => {
    searchParamsValue = new URLSearchParams('expertiseTagId=2');
    renderPage();
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('expertiseTagId=2'))).toBe(true);
    });
  });

  it('passes search param to people fetch when q is in URL', async () => {
    searchParamsValue = new URLSearchParams('q=bob');
    renderPage();
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('search=bob'))).toBe(true);
    });
  });
});
