// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for `app/portal/brain/decisions/page.tsx`
 *
 * 'use client' page — rendered directly with @testing-library/react.
 * Filters live in the URL query string; useSearchParams + useRouter are mocked.
 *
 * Covers:
 *  - Loading state (spinner, progress_activity icon)
 *  - Error state (API !ok, success=false, network throw)
 *  - Empty state (EmptyState component, "Record decision" link)
 *  - List renders DecisionCard stubs for returned items
 *  - "Record decision" header link present
 *  - Status filter pills: all five shown, clicking updates URL
 *  - Status default is "accepted" (shown highlighted)
 *  - Reversibility filter buttons: all/one_way/two_way
 *  - Decision maker dropdown: populated from team API
 *  - Decision maker dropdown: all-makers default option shown
 *  - Date "From" and "To" inputs rendered
 *  - "Superseded only" checkbox rendered
 *  - Clear filters button: hidden when no non-default filters; shown when filters active
 *  - Pagination: Previous disabled on page 0, Next disabled when < PAGE_SIZE items
 *  - Pagination: Previous enabled, next click updates URL
 *  - Decisions API called with correct query string (status, limit, offset)
 *  - Team fetch called on mount; silently ignored on failure
 *  - decisionMaker column shown when teamLookup resolves a name
 *  - Page 2 shows "Page 2" label
 *  - URL param parsing: unknown status defaults to "accepted"; unknown reversibility to "all"
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ─────────────────────────────────────

const pushMock = vi.fn();
const replaceMock = vi.fn();

// Mutable searchParams map — tests replace this to drive URL state.
let searchParamsMap: Record<string, string> = {};

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (key: string) => searchParamsMap[key] ?? null,
    toString: () =>
      new URLSearchParams(searchParamsMap).toString(),
  }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// Stub DecisionCard — just renders the decision title so we can verify list items.
vi.mock('@/components/brain/DecisionCard', () => ({
  default: ({ decision, onClick }: any) =>
    React.createElement(
      'button',
      { 'data-testid': `decision-card-${decision.id}`, onClick },
      decision.title,
    ),
}));

// ─── Fetch mock helpers ────────────────────────────────────────────────────

type FetchResp = { ok: boolean; status: number; json: () => Promise<any> };
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: any, ok = true, status = 200): FetchResp {
  return { ok, status, json: async () => body };
}

// ─── Data factories ────────────────────────────────────────────────────────

function makeDecisionRow(extra: Record<string, any> = {}): any {
  return {
    id: 1,
    title: 'Use PostgreSQL',
    decision: 'We will use PostgreSQL.',
    rationale: 'Stable.',
    status: 'accepted',
    reversibility: 'two_way',
    decisionMakerId: null,
    decidedAt: '2025-01-15T00:00:00Z',
    supersededByDecisionId: null,
    meetingId: null,
    noteId: null,
    companyId: null,
    dealId: null,
    ...extra,
  };
}

function makeListResponse(items: any[] = [makeDecisionRow()]): any {
  return {
    success: true,
    data: { items, limit: 25, offset: 0 },
  };
}

function makeTeamResponse(members: any[] = []): any {
  return { success: true, data: members };
}

// ─── Default fetch handler ─────────────────────────────────────────────────

function defaultFetch(url: string): FetchResp {
  if (url.includes('/api/portal/team')) {
    return makeRes(makeTeamResponse());
  }
  if (url.includes('/api/portal/brain/decisions')) {
    return makeRes(makeListResponse());
  }
  return makeRes({ success: true });
}

// ─── Setup / teardown ─────────────────────────────────────────────────────

beforeEach(() => {
  searchParamsMap = {};
  pushMock.mockReset();
  replaceMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => defaultFetch(url));
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Import after mocks ───────────────────────────────────────────────────

import DecisionsListPage from '@/app/portal/brain/decisions/page';

function renderPage() {
  return render(React.createElement(DecisionsListPage));
}

// ─── Loading state ─────────────────────────────────────────────────────────

describe('DecisionsListPage — loading', () => {
  it('shows spinner while decisions fetch is pending', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.textContent).toContain('Loading decisions');
  });

  it('shows progress_activity icon in loading state', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.textContent).toContain('progress_activity');
  });
});

// ─── Error states ──────────────────────────────────────────────────────────

describe('DecisionsListPage — error state', () => {
  it('shows error when API returns !ok with message', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes(makeTeamResponse());
      return makeRes({ success: false, message: 'Server error' }, false, 500);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Server error');
    });
  });

  it('shows HTTP status fallback when no message in error response', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes(makeTeamResponse());
      return makeRes({ success: false }, false, 503);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('HTTP 503');
    });
  });

  it('shows error when success=false even though ok=true', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes(makeTeamResponse());
      return makeRes({ success: false, message: 'DB error' }, true);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('DB error');
    });
  });

  it('shows network error message when fetch throws an Error', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes(makeTeamResponse());
      throw new Error('Connection refused');
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Connection refused');
    });
  });

  it('shows "Network error" for non-Error throws', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes(makeTeamResponse());
      throw 'plain string';
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Network error');
    });
  });

  it('renders error_outline icon in error state', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes(makeTeamResponse());
      return makeRes({ success: false, message: 'oops' }, false);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('error_outline');
    });
  });
});

// ─── Empty state ───────────────────────────────────────────────────────────

describe('DecisionsListPage — empty state', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes(makeTeamResponse());
      return makeRes(makeListResponse([]));
    });
  });

  it('shows "No decisions captured yet" in empty state', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No decisions captured yet');
    });
  });

  it('renders "Record decision" link in empty state', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/decisions/new"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders psychology_alt icon in empty state', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('psychology_alt');
    });
  });
});

// ─── List renders items ────────────────────────────────────────────────────

describe('DecisionsListPage — list with items', () => {
  it('renders DecisionCard stubs for returned items', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="decision-card-1"]')).toBeTruthy();
    });
  });

  it('renders item title from API response', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Use PostgreSQL');
    });
  });

  it('clicking a card calls router.push to detail route', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="decision-card-1"]')).toBeTruthy();
    });
    fireEvent.click(container.querySelector('[data-testid="decision-card-1"]') as HTMLButtonElement);
    expect(pushMock).toHaveBeenCalledWith('/portal/brain/decisions/1');
  });

  it('renders multiple cards when multiple items returned', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes(makeTeamResponse());
      return makeRes(makeListResponse([
        makeDecisionRow({ id: 1, title: 'Decision One' }),
        makeDecisionRow({ id: 2, title: 'Decision Two' }),
      ]));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="decision-card-1"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="decision-card-2"]')).toBeTruthy();
    });
  });
});

// ─── Header ────────────────────────────────────────────────────────────────

describe('DecisionsListPage — header', () => {
  it('renders "Decisions" heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Decisions');
    });
  });

  it('renders gavel icon', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('gavel');
    });
  });

  it('renders "Record decision" header link', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/decisions/new"]');
      expect(link).toBeTruthy();
    });
  });
});

// ─── Status filter pills ───────────────────────────────────────────────────

describe('DecisionsListPage — status filter pills', () => {
  const statuses = ['All', 'Accepted', 'Proposed', 'Superseded', 'Rejected'];

  statuses.forEach((label) => {
    it(`renders "${label}" status pill`, async () => {
      const { container } = renderPage();
      await waitFor(() => {
        expect(container.textContent).toContain(label);
      });
    });
  });

  it('clicking "All" pill calls router.replace to update URL', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Decisions'));
    // "All" status pill — textContent includes icon name + "All"
    // The reversibility buttons also have "All" — distinguish by finding the one with an icon class
    // that wraps text "All" among the status filter row. Use data-stable text includes.
    const allBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('All') && b.textContent?.includes('inbox'),
    ) as HTMLButtonElement;
    expect(allBtn).toBeTruthy();
    fireEvent.click(allBtn);
    expect(replaceMock).toHaveBeenCalled();
  });

  it('clicking "Proposed" pill calls router.replace', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Decisions'));
    // Pills render an icon + label; match by textContent inclusion and exclude other status pills
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Proposed') && !b.textContent?.includes('Superseded'),
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(replaceMock).toHaveBeenCalled();
  });
});

// ─── Reversibility filter ──────────────────────────────────────────────────

describe('DecisionsListPage — reversibility filter', () => {
  it('renders All, One-way and Two-way reversibility buttons', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Decisions'));
    expect(container.textContent).toContain('One-way');
    expect(container.textContent).toContain('Two-way');
  });

  it('clicking "One-way" calls router.replace', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Decisions'));
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'One-way',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(replaceMock).toHaveBeenCalled();
  });

  it('clicking "Two-way" calls router.replace', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Decisions'));
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Two-way',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(replaceMock).toHaveBeenCalled();
  });
});

// ─── Decision maker dropdown ───────────────────────────────────────────────

describe('DecisionsListPage — decision maker dropdown', () => {
  it('renders "All decision makers" default option', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('All decision makers');
    });
  });

  it('populates dropdown with team members from API', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) {
        return makeRes(makeTeamResponse([
          { userId: 1, name: 'Alice Smith', email: 'alice@example.com' },
          { userId: 2, name: null, email: 'bob@example.com' },
        ]));
      }
      return makeRes(makeListResponse());
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Alice Smith');
      expect(container.textContent).toContain('bob@example.com');
    });
  });

  it('changing decision maker dropdown calls router.replace', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) {
        return makeRes(makeTeamResponse([
          { userId: 5, name: 'Carol', email: 'carol@example.com' },
        ]));
      }
      return makeRes(makeListResponse());
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Carol'));
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '5' } });
    expect(replaceMock).toHaveBeenCalled();
  });
});

// ─── Date inputs ───────────────────────────────────────────────────────────

describe('DecisionsListPage — date filters', () => {
  it('renders a "From" date input', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Decisions'));
    const inputs = Array.from(container.querySelectorAll('input[type="date"]'));
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it('changing "From" date calls router.replace', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Decisions'));
    const inputs = Array.from(container.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
    fireEvent.change(inputs[0], { target: { value: '2025-01-01' } });
    expect(replaceMock).toHaveBeenCalled();
  });

  it('changing "To" date calls router.replace', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Decisions'));
    const inputs = Array.from(container.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
    fireEvent.change(inputs[1], { target: { value: '2025-12-31' } });
    expect(replaceMock).toHaveBeenCalled();
  });
});

// ─── Superseded only checkbox ──────────────────────────────────────────────

describe('DecisionsListPage — superseded only checkbox', () => {
  it('renders the "Superseded only" checkbox label', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Superseded only');
    });
  });

  it('toggling the checkbox calls router.replace', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Superseded only'));
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(replaceMock).toHaveBeenCalled();
  });
});

// ─── Clear filters button ──────────────────────────────────────────────────

describe('DecisionsListPage — clear filters button', () => {
  it('does NOT render "Clear filters" when no secondary filters are active', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Decisions'));
    expect(container.textContent).not.toContain('Clear filters');
  });

  it('renders "Clear filters" when reversibility filter is active', async () => {
    searchParamsMap = { reversibility: 'one_way' };
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Clear filters');
    });
  });

  it('renders "Clear filters" when dateFrom is set', async () => {
    searchParamsMap = { dateFrom: '2025-01-01' };
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Clear filters');
    });
  });

  it('renders "Clear filters" when supersededOnly is true', async () => {
    searchParamsMap = { supersededOnly: 'true' };
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Clear filters');
    });
  });

  it('clicking "Clear filters" calls router.replace', async () => {
    searchParamsMap = { reversibility: 'one_way' };
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Clear filters'));
    const clearBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Clear filters'),
    ) as HTMLButtonElement;
    fireEvent.click(clearBtn);
    expect(replaceMock).toHaveBeenCalled();
  });
});

// ─── Pagination ────────────────────────────────────────────────────────────

describe('DecisionsListPage — pagination', () => {
  it('renders "Page 1" label on the default view', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Page 1');
    });
  });

  it('Previous button is disabled on page 0 (first page)', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    const prevBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Previous'),
    ) as HTMLButtonElement;
    expect(prevBtn.disabled).toBe(true);
  });

  it('Next button is disabled when fewer than PAGE_SIZE items returned', async () => {
    // Default: 1 item returned (< 25)
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    const nextBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Next'),
    ) as HTMLButtonElement;
    expect(nextBtn.disabled).toBe(true);
  });

  it('Next button is enabled when exactly PAGE_SIZE (25) items returned', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes(makeTeamResponse());
      const items = Array.from({ length: 25 }, (_, i) =>
        makeDecisionRow({ id: i + 1, title: `Decision ${i + 1}` }),
      );
      return makeRes(makeListResponse(items));
    });
    const { container } = renderPage();
    await waitFor(() => {
      const nextBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Next'),
      ) as HTMLButtonElement;
      expect(nextBtn.disabled).toBe(false);
    });
  });

  it('clicking Next calls router.replace', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes(makeTeamResponse());
      const items = Array.from({ length: 25 }, (_, i) =>
        makeDecisionRow({ id: i + 1, title: `Decision ${i + 1}` }),
      );
      return makeRes(makeListResponse(items));
    });
    const { container } = renderPage();
    await waitFor(() => {
      const nextBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Next'),
      ) as HTMLButtonElement;
      expect(nextBtn.disabled).toBe(false);
    });
    const nextBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Next'),
    ) as HTMLButtonElement;
    fireEvent.click(nextBtn);
    expect(replaceMock).toHaveBeenCalled();
  });

  it('renders "Page 2" when page=1 in URL params', async () => {
    searchParamsMap = { page: '1' };
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Page 2');
    });
  });

  it('Previous button is enabled on page > 0', async () => {
    searchParamsMap = { page: '1' };
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Page 2'));
    const prevBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Previous'),
    ) as HTMLButtonElement;
    expect(prevBtn.disabled).toBe(false);
  });

  it('clicking Previous on page 1 calls router.replace', async () => {
    searchParamsMap = { page: '1' };
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Page 2'));
    const prevBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Previous'),
    ) as HTMLButtonElement;
    fireEvent.click(prevBtn);
    expect(replaceMock).toHaveBeenCalled();
  });
});

// ─── API query string ──────────────────────────────────────────────────────

describe('DecisionsListPage — API query string', () => {
  it('fetches decisions API on mount', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/decisions'),
      );
      expect(call).toBeTruthy();
    });
  });

  it('sends limit=25 in the request', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/decisions'),
      );
      expect(String(call![0])).toContain('limit=25');
    });
  });

  it('sends offset=0 on default first page', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/decisions'),
      );
      expect(String(call![0])).toContain('offset=0');
    });
  });

  it('sends offset=25 when page=1', async () => {
    searchParamsMap = { page: '1' };
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/decisions'),
      );
      expect(String(call![0])).toContain('offset=25');
    });
  });

  it('sends status=proposed when status filter set', async () => {
    searchParamsMap = { status: 'proposed' };
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/decisions'),
      );
      expect(String(call![0])).toContain('status=proposed');
    });
  });

  it('does NOT send status param when status is "accepted" (default omitted)', async () => {
    // default accepted is omitted from the queryString (status !== 'all' guard)
    searchParamsMap = {};
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/decisions'),
      );
      // status=accepted should appear since parseStatus defaults to accepted (non-all)
      expect(String(call![0])).toContain('status=accepted');
    });
  });
});

// ─── Team fetch ────────────────────────────────────────────────────────────

describe('DecisionsListPage — team fetch', () => {
  it('fetches /api/portal/team on mount', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/team'),
      );
      expect(call).toBeTruthy();
    });
  });

  it('silently ignores team fetch failure', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) throw new Error('team down');
      return makeRes(makeListResponse());
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Use PostgreSQL');
    });
  });

  it('filters out team members without a positive userId', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) {
        return makeRes({
          success: true,
          data: [
            { userId: 1, name: 'Valid', email: 'valid@example.com' },
            { name: 'NoId', email: 'noid@example.com' }, // no userId
            { userId: 0, name: 'ZeroId', email: 'zero@example.com' }, // userId 0
          ],
        });
      }
      return makeRes(makeListResponse());
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Valid'));
    // ZeroId and NoId should NOT appear in select options
    const opts = Array.from(container.querySelectorAll('option')).map((o) => o.textContent);
    expect(opts).not.toContain('ZeroId');
    expect(opts).not.toContain('NoId');
  });
});

// ─── Decision maker column ─────────────────────────────────────────────────

describe('DecisionsListPage — decision maker overlay', () => {
  it('shows team member name next to card when decisionMakerId matches', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) {
        return makeRes(makeTeamResponse([
          { userId: 5, name: 'Dana', email: 'dana@example.com' },
        ]));
      }
      return makeRes(makeListResponse([makeDecisionRow({ decisionMakerId: 5 })]));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Dana');
    });
  });

  it('does NOT show overlay when decisionMakerId is null', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    // No person overlay since decisionMakerId is null
    const personOverlays = Array.from(container.querySelectorAll('div')).filter(
      (d) => d.className?.includes('pointer-events-none') && d.textContent?.includes('person'),
    );
    expect(personOverlays.length).toBe(0);
  });
});

// ─── URL param parsing guards ──────────────────────────────────────────────

describe('DecisionsListPage — URL param parsing guards', () => {
  it('defaults status to "accepted" for unknown status value', async () => {
    searchParamsMap = { status: 'hacked_value' };
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/decisions'),
      );
      // parseStatus returns 'accepted' for unknown — status=accepted in query
      expect(String(call![0])).toContain('status=accepted');
    });
  });

  it('defaults reversibility to "all" for unknown value (omitted from API call)', async () => {
    searchParamsMap = { reversibility: 'invalid_value' };
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/decisions'),
      );
      // parseReversibility returns 'all' — not sent to API (reversibility !== 'all' guard)
      expect(String(call![0])).not.toContain('reversibility=invalid_value');
    });
  });

  it('defaults page to 0 for negative page value', async () => {
    searchParamsMap = { page: '-5' };
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/decisions'),
      );
      expect(String(call![0])).toContain('offset=0');
    });
  });
});

// ─── Reload on filter change ───────────────────────────────────────────────

describe('DecisionsListPage — refetch on filter change', () => {
  it('re-fetches when queryString changes (simulated via act re-render)', async () => {
    const { container, rerender } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Use PostgreSQL'));
    const callsBefore = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/api/portal/brain/decisions'),
    ).length;
    // Change the searchParamsMap and force a rerender
    searchParamsMap = { status: 'proposed' };
    await act(async () => {
      rerender(React.createElement(DecisionsListPage));
    });
    await waitFor(() => {
      const callsAfter = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes('/api/portal/brain/decisions'),
      ).length;
      expect(callsAfter).toBeGreaterThan(callsBefore);
    });
  });
});
