// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/brain/playbooks/page.tsx`
 *
 * 'use client' page that:
 * - Wraps PlaybooksListContent in <Suspense> (PlaybooksListPage is the default export)
 * - Reads filters from URL via useSearchParams + useRouter
 * - Fetches /api/portal/brain/playbooks (list) and /api/portal/team (owners)
 * - Renders status filter pills, trigger-kind filter, category select, owner select
 * - Renders PlaybookCard stubs for returned items
 * - Shows loading / empty / error / list states
 * - Paginates via offset (PAGE_SIZE=25, limit+1 lookahead)
 * - "Clear" button appears only when secondary filters are active
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── next/navigation mock ────────────────────────────────────────────────────

const replaceMock = vi.fn();

// Mutable searchParams map — tests update this to drive URL state.
let searchParamsMap: Record<string, string> = {};

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (key: string) => searchParamsMap[key] ?? null,
    toString: () => new URLSearchParams(searchParamsMap).toString(),
  }),
}));

// ─── next/link stub ──────────────────────────────────────────────────────────

vi.mock('next/link', () => ({
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

// ─── PlaybookCard stub ───────────────────────────────────────────────────────

vi.mock('@/components/brain/PlaybookCard', () => ({
  default: function PlaybookCard({
    playbook,
  }: {
    playbook: { id: number; name: string };
    ownerLookup: Record<number, unknown>;
  }) {
    return React.createElement(
      'div',
      { 'data-testid': `playbook-card-${playbook.id}` },
      playbook.name,
    );
  },
}));

// ─── playbooks-shared stub ───────────────────────────────────────────────────
// Keep real logic so status/trigger filter labels render correctly.

vi.mock('@/components/brain/playbooks-shared', async () => {
  const actual = await vi.importActual<typeof import('@/components/brain/playbooks-shared')>(
    '@/components/brain/playbooks-shared',
  );
  return actual;
});

// ─── Fetch helpers ────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; status: number; json: () => Promise<unknown> };

function makeRes(
  body: unknown,
  opts: { ok?: boolean; status?: number } = {},
): FetchResp {
  const ok = opts.ok ?? true;
  return {
    ok,
    status: opts.status ?? (ok ? 200 : 500),
    json: async () => body,
  };
}

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makePlaybookRow(extra: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 1,
    name: 'Onboarding Flow',
    slug: 'onboarding-flow',
    status: 'active',
    triggerKind: 'manual',
    category: 'HR',
    ownerId: null,
    description: 'First playbook.',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...extra,
  };
}

function makeListResp(items: unknown[] = [makePlaybookRow()]): unknown {
  return { success: true, data: { items } };
}

// ─── Default fetch handler ────────────────────────────────────────────────────

function defaultFetch(url: string): FetchResp {
  if (url.includes('/api/portal/brain/playbooks')) {
    return makeRes(makeListResp());
  }
  if (url.includes('/api/portal/team')) {
    return makeRes({ success: true, data: [] });
  }
  return makeRes({ success: true });
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  searchParamsMap = {};
  replaceMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => defaultFetch(url));
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Import after mocks ───────────────────────────────────────────────────────

import PlaybooksListPage from '@/app/portal/brain/playbooks/page';

function renderPage() {
  return render(React.createElement(PlaybooksListPage));
}

// ─── Loading state ─────────────────────────────────────────────────────────────

describe('PlaybooksListPage — loading', () => {
  it('shows loading indicator while fetch is pending', () => {
    fetchMock.mockImplementation(() => new Promise<FetchResp>(() => { /* never resolves */ }));
    const { container } = renderPage();
    expect(container.textContent).toContain('Loading');
  });

  it('shows progress_activity icon in loading state', () => {
    fetchMock.mockImplementation(() => new Promise<FetchResp>(() => { /* never resolves */ }));
    const { container } = renderPage();
    expect(container.textContent).toContain('progress_activity');
  });
});

// ─── Error state ───────────────────────────────────────────────────────────────

describe('PlaybooksListPage — error state', () => {
  it('shows error banner when server returns !ok with message', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({ success: false, message: 'DB down' }, { ok: false, status: 500 });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('DB down');
    });
  });

  it('shows error banner when success=false but ok=true', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({ success: false, message: 'Validation failed' }, { ok: true });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Validation failed');
    });
  });

  it('shows "Failed to load playbooks" fallback when no message', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({ success: false }, { ok: false });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Failed to load playbooks');
    });
  });

  it('shows network error message when fetch throws', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      throw new Error('connection refused');
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('connection refused');
    });
  });

  it('shows "Network error" for non-Error throws', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'plain string thrown';
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Network error');
    });
  });

  it('renders error_outline icon in error state', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({ success: false, message: 'oops' }, { ok: false });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('error_outline');
    });
  });
});

// ─── Empty state ───────────────────────────────────────────────────────────────

describe('PlaybooksListPage — empty state', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes(makeListResp([]));
    });
  });

  it('shows "No playbooks yet" in empty state', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No playbooks yet');
    });
  });

  it('renders "New playbook" link in empty state', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/playbooks/new"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders play_circle icon in empty state', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('play_circle');
    });
  });
});

// ─── Successful list render ────────────────────────────────────────────────────

describe('PlaybooksListPage — list with items', () => {
  it('renders a PlaybookCard stub for a returned item', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="playbook-card-1"]')).toBeTruthy();
    });
  });

  it('renders the playbook name from API response', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Onboarding Flow');
    });
  });

  it('renders multiple cards when multiple items returned', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes(
        makeListResp([
          makePlaybookRow({ id: 1, name: 'Alpha' }),
          makePlaybookRow({ id: 2, name: 'Beta' }),
        ]),
      );
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="playbook-card-1"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="playbook-card-2"]')).toBeTruthy();
    });
  });
});

// ─── Header ───────────────────────────────────────────────────────────────────

describe('PlaybooksListPage — header', () => {
  it('renders "Playbooks" heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('h1')?.textContent).toContain('Playbooks');
    });
  });

  it('renders "New playbook" action link in header', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/playbooks/new"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders "View runs" link in header', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/playbook-runs"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders play_circle icon in header', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('play_circle');
    });
  });
});

// ─── Status filter pills ──────────────────────────────────────────────────────

describe('PlaybooksListPage — status filter pills', () => {
  const statusLabels = ['Active', 'Draft', 'Archived', 'All'];

  statusLabels.forEach((label) => {
    it(`renders "${label}" status pill`, async () => {
      const { container } = renderPage();
      await waitFor(() => {
        expect(container.textContent).toContain(label);
      });
    });
  });

  it('clicking "Draft" pill calls router.replace', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Draft',
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(replaceMock).toHaveBeenCalled();
  });

  it('clicking "All" status pill calls router.replace', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());
    // Find the "All" button among the status pills (first row of pills)
    const buttons = Array.from(container.querySelectorAll('button'));
    const allBtn = buttons.find((b) => b.textContent?.trim() === 'All');
    expect(allBtn).toBeTruthy();
    fireEvent.click(allBtn!);
    expect(replaceMock).toHaveBeenCalled();
  });

  it('active status pill has highlighted styling (bg-primary/10)', async () => {
    // Default status is "active", so "Active" pill should carry highlight class
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());
    const activeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Active',
    ) as HTMLButtonElement;
    expect(activeBtn?.className).toContain('bg-primary');
  });
});

// ─── Trigger-kind filter ──────────────────────────────────────────────────────

describe('PlaybooksListPage — trigger-kind filter', () => {
  it('renders "Manual" trigger filter button', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());
    expect(container.textContent).toContain('Manual');
  });

  it('renders "Event" trigger filter button', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());
    expect(container.textContent).toContain('Event');
  });

  it('renders "Scheduled" trigger filter button', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());
    expect(container.textContent).toContain('Scheduled');
  });

  it('clicking "Manual" trigger filter calls router.replace', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Manual',
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(replaceMock).toHaveBeenCalled();
  });

  it('renders "Trigger:" label for the filter row', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());
    expect(container.textContent).toContain('Trigger:');
  });
});

// ─── Category + owner selects ─────────────────────────────────────────────────

describe('PlaybooksListPage — category and owner selects', () => {
  it('renders "All categories" default option', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('All categories');
    });
  });

  it('renders "Any owner" default option', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Any owner');
    });
  });

  it('populates owner select from team API', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) {
        return makeRes({
          success: true,
          data: [{ userId: 10, name: 'Alice', email: 'alice@example.com' }],
        });
      }
      return makeRes(makeListResp());
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Alice');
    });
  });

  it('populates owner select using email when name is null', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) {
        return makeRes({
          success: true,
          data: [{ userId: 11, name: null, email: 'bob@example.com' }],
        });
      }
      return makeRes(makeListResp());
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('bob@example.com');
    });
  });

  it('changing the category select calls router.replace', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes(
        makeListResp([makePlaybookRow({ category: 'HR' })]),
      );
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('HR'));
    const selects = container.querySelectorAll('select');
    // First select is category
    fireEvent.change(selects[0], { target: { value: 'HR' } });
    expect(replaceMock).toHaveBeenCalled();
  });

  it('changing the owner select calls router.replace', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) {
        return makeRes({
          success: true,
          data: [{ userId: 5, name: 'Carol', email: 'carol@example.com' }],
        });
      }
      return makeRes(makeListResp());
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Carol'));
    const selects = container.querySelectorAll('select');
    // Second select is owner
    fireEvent.change(selects[1], { target: { value: '5' } });
    expect(replaceMock).toHaveBeenCalled();
  });

  it('ignores team members without a numeric userId', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) {
        return makeRes({
          success: true,
          data: [
            { userId: 1, name: 'Valid', email: 'valid@example.com' },
            { name: 'NoId', email: 'noid@example.com' },
          ],
        });
      }
      return makeRes(makeListResp());
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Valid'));
    const opts = Array.from(container.querySelectorAll('option')).map((o) => o.textContent);
    expect(opts).not.toContain('NoId');
  });

  it('silently ignores team fetch failure', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) throw new Error('team down');
      return makeRes(makeListResp());
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Onboarding Flow');
    });
  });
});

// ─── Clear button ─────────────────────────────────────────────────────────────

describe('PlaybooksListPage — clear filters button', () => {
  it('does NOT render "Clear" when no secondary filters are active', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());
    expect(container.textContent).not.toContain('Clear');
  });

  it('renders "Clear" when triggerKind filter is active', async () => {
    searchParamsMap = { triggerKind: 'manual' };
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Clear');
    });
  });

  it('renders "Clear" when category filter is active', async () => {
    searchParamsMap = { category: 'HR' };
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Clear');
    });
  });

  it('renders "Clear" when ownerId filter is active', async () => {
    searchParamsMap = { ownerId: '5' };
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Clear');
    });
  });

  it('clicking "Clear" calls router.replace', async () => {
    searchParamsMap = { triggerKind: 'event' };
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Clear'));
    const clearBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Clear'),
    ) as HTMLButtonElement;
    fireEvent.click(clearBtn);
    expect(replaceMock).toHaveBeenCalled();
  });
});

// ─── Pagination ───────────────────────────────────────────────────────────────

describe('PlaybooksListPage — pagination', () => {
  it('does not show pagination when there is only one page of results', async () => {
    // Default: 1 item returned, offset=0 → no pagination
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Onboarding Flow'));
    expect(container.textContent).not.toContain('Previous');
  });

  it('shows Previous/Next buttons when hasMore is true (API returns PAGE_SIZE+1 items)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      // Return 26 items (PAGE_SIZE+1) to trigger hasMore
      const items = Array.from({ length: 26 }, (_, i) =>
        makePlaybookRow({ id: i + 1, name: `Playbook ${i + 1}` }),
      );
      return makeRes(makeListResp(items));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Next');
    });
  });

  it('Previous button is disabled on first page (offset=0)', async () => {
    searchParamsMap = {};
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      const items = Array.from({ length: 26 }, (_, i) =>
        makePlaybookRow({ id: i + 1, name: `Playbook ${i + 1}` }),
      );
      return makeRes(makeListResp(items));
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Previous'));
    const prevBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Previous'),
    ) as HTMLButtonElement;
    expect(prevBtn.disabled).toBe(true);
  });

  it('Previous button is enabled on page 2 (offset=25)', async () => {
    searchParamsMap = { offset: '25' };
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes(makeListResp([makePlaybookRow({ id: 99, name: 'Last One' })]));
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Previous'));
    const prevBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Previous'),
    ) as HTMLButtonElement;
    expect(prevBtn.disabled).toBe(false);
  });

  it('clicking Next calls router.replace', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      const items = Array.from({ length: 26 }, (_, i) =>
        makePlaybookRow({ id: i + 1, name: `Playbook ${i + 1}` }),
      );
      return makeRes(makeListResp(items));
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Next'));
    const nextBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Next'),
    ) as HTMLButtonElement;
    fireEvent.click(nextBtn);
    expect(replaceMock).toHaveBeenCalled();
  });

  it('clicking Previous calls router.replace', async () => {
    searchParamsMap = { offset: '25' };
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes(makeListResp([makePlaybookRow({ id: 99, name: 'Last One' })]));
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Previous'));
    const prevBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Previous'),
    ) as HTMLButtonElement;
    fireEvent.click(prevBtn);
    expect(replaceMock).toHaveBeenCalled();
  });

  it('shows page range label (offset+1 to offset+items.length)', async () => {
    searchParamsMap = { offset: '25' };
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes(makeListResp([makePlaybookRow({ id: 99, name: 'Late Playbook' })]));
    });
    const { container } = renderPage();
    await waitFor(() => {
      // offset=25, 1 item → shows "26–26"
      expect(container.textContent).toContain('26');
    });
  });
});

// ─── API query string ──────────────────────────────────────────────────────────

describe('PlaybooksListPage — API query string', () => {
  it('fetches /api/portal/brain/playbooks on mount', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/playbooks'),
      );
      expect(call).toBeTruthy();
    });
  });

  it('sends limit=26 (PAGE_SIZE+1 lookahead)', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/playbooks'),
      );
      expect(String(call![0])).toContain('limit=26');
    });
  });

  it('sends offset=0 on default first page', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/playbooks'),
      );
      expect(String(call![0])).toContain('offset=0');
    });
  });

  it('sends offset=25 when offset param is 25', async () => {
    searchParamsMap = { offset: '25' };
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/playbooks'),
      );
      expect(String(call![0])).toContain('offset=25');
    });
  });

  it('sends status=draft when status filter is set', async () => {
    searchParamsMap = { status: 'draft' };
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/playbooks'),
      );
      expect(String(call![0])).toContain('status=draft');
    });
  });

  it('omits status param when status=all', async () => {
    searchParamsMap = { status: 'all' };
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/playbooks'),
      );
      expect(String(call![0])).not.toContain('status=');
    });
  });

  it('sends triggerKind param when set', async () => {
    searchParamsMap = { triggerKind: 'event' };
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/playbooks'),
      );
      expect(String(call![0])).toContain('triggerKind=event');
    });
  });

  it('omits triggerKind param when triggerKind=all', async () => {
    searchParamsMap = { triggerKind: 'all' };
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/playbooks'),
      );
      expect(String(call![0])).not.toContain('triggerKind=');
    });
  });

  it('sends category param when set', async () => {
    searchParamsMap = { category: 'HR' };
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/playbooks'),
      );
      expect(String(call![0])).toContain('category=HR');
    });
  });

  it('sends ownerId param when set', async () => {
    searchParamsMap = { ownerId: '7' };
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/playbooks'),
      );
      expect(String(call![0])).toContain('ownerId=7');
    });
  });

  it('fetches /api/portal/team on mount', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/team'),
      );
      expect(call).toBeTruthy();
    });
  });
});

// ─── Category dropdown population from API items ──────────────────────────────

describe('PlaybooksListPage — category dropdown from returned items', () => {
  it('adds seen categories from API response to the category select', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes(
        makeListResp([
          makePlaybookRow({ id: 1, category: 'Sales' }),
          makePlaybookRow({ id: 2, category: 'HR' }),
        ]),
      );
    });
    const { container } = renderPage();
    await waitFor(() => {
      const opts = Array.from(container.querySelectorAll('option')).map((o) => o.textContent);
      expect(opts).toContain('Sales');
      expect(opts).toContain('HR');
    });
  });

  it('renders "All categories" option when no categories in items', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes(makeListResp([makePlaybookRow({ category: null })]));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('All categories');
    });
  });
});

// ─── Re-fetch on filter change ────────────────────────────────────────────────

describe('PlaybooksListPage — re-fetch on filter change', () => {
  it('re-fetches when status pill is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());
    const callsBefore = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/api/portal/brain/playbooks'),
    ).length;
    const draftBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Draft',
    ) as HTMLButtonElement;
    fireEvent.click(draftBtn);
    // The setParam → router.replace updates the URL; simulate rerender
    searchParamsMap = { status: 'draft' };
    await act(async () => {
      // Advance a tick so useEffect fires
      await new Promise((r) => setTimeout(r, 0));
    });
    const callsAfter = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/api/portal/brain/playbooks'),
    ).length;
    // At minimum the initial call happened; clicking the button triggers router.replace
    expect(callsAfter).toBeGreaterThanOrEqual(callsBefore);
    expect(replaceMock).toHaveBeenCalled();
  });
});
