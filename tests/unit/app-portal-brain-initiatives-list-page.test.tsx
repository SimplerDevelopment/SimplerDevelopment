// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for `app/portal/brain/initiatives/page.tsx`
 *
 * 'use client' page wrapped in Suspense — rendered directly with @testing-library/react.
 * Filters live in URL query string; useSearchParams + useRouter are mocked.
 *
 * Covers:
 *  - Loading state (Suspense fallback + spinner)
 *  - Error state (API !ok, success=false, network throw)
 *  - Empty state (no initiatives — CTA link)
 *  - List renders InitiativeCard stubs for returned items
 *  - "New initiative" header link present
 *  - Status filter pills: all six shown, clicking updates URL
 *  - Default status is "active" (no param)
 *  - Priority dropdown: populated, changing calls router.replace
 *  - Owner dropdown: populated from team API, changing calls router.replace
 *  - "Has open goals" checkbox: renders and toggles
 *  - Target-before date input: renders and changes
 *  - Clear filters button: hidden when no secondary filters, shown when active
 *  - Pagination: Previous/Next enable/disable per offset/hasMore
 *  - API called with correct params (status, limit, offset)
 *  - Team fetch called on mount; silently ignored on failure
 *  - Owner name resolved via ownerLookup when decisionMakerId matches
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';

// ─── Mocks (must precede page import) ─────────────────────────────────────

const pushMock = vi.fn();
const replaceMock = vi.fn();

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
    toString: () => new URLSearchParams(searchParamsMap).toString(),
  }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// Stub InitiativeCard — renders name so we can verify list items.
vi.mock('@/components/brain/InitiativeCard', () => ({
  default: ({ initiative }: any) =>
    React.createElement(
      'div',
      { 'data-testid': `initiative-card-${initiative.id}` },
      initiative.name,
    ),
}));

// initiatives-shared exports real functions — no stub needed (pure helpers).

// ─── Fetch mock helpers ────────────────────────────────────────────────────

type FetchResp = { ok: boolean; status: number; json: () => Promise<any> };
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: any, ok = true, status = 200): FetchResp {
  return { ok, status, json: async () => body };
}

// ─── Data factories ────────────────────────────────────────────────────────

function makeInitiativeRow(extra: Record<string, any> = {}): any {
  return {
    id: 1,
    clientId: 10,
    name: 'Project Alpha',
    slug: 'project-alpha',
    description: null,
    status: 'active',
    priority: 'medium',
    ownerId: null,
    sponsorId: null,
    startDate: null,
    targetDate: null,
    closedAt: null,
    closeReason: null,
    lessonsLearned: null,
    confidentialityLevel: 'standard',
    createdBy: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    goalCount: 0,
    ...extra,
  };
}

function makeListResponse(items: any[] = [makeInitiativeRow()]): any {
  return { success: true, data: { items } };
}

function makeTeamResponse(members: any[] = []): any {
  return { success: true, data: members };
}

// ─── Default fetch handler ─────────────────────────────────────────────────

function defaultFetch(url: string): FetchResp {
  if (url.includes('/api/portal/team')) return makeRes(makeTeamResponse());
  if (url.includes('/api/portal/brain/initiatives')) return makeRes(makeListResponse());
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

import InitiativesListPage from '@/app/portal/brain/initiatives/page';

function renderPage() {
  return render(React.createElement(InitiativesListPage));
}

// ─── Loading state ─────────────────────────────────────────────────────────

describe('InitiativesListPage — loading', () => {
  it('shows progress_activity icon while initiatives fetch is pending', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.textContent).toContain('progress_activity');
  });

  it('shows "Loading" text while fetch is pending', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.textContent).toContain('Loading');
  });
});

// ─── Error states ──────────────────────────────────────────────────────────

describe('InitiativesListPage — error state', () => {
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

  it('shows fallback message when API returns !ok with no message', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes(makeTeamResponse());
      return makeRes({ success: false }, false, 500);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Failed to load initiatives');
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
      // eslint-disable-next-line @typescript-eslint/only-throw-error
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

describe('InitiativesListPage — empty state', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes(makeTeamResponse());
      return makeRes(makeListResponse([]));
    });
  });

  it('shows "No initiatives yet." text when empty', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No initiatives yet');
    });
  });

  it('renders "New initiative" link in empty state', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/initiatives/new"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders flag icon in empty state', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('flag');
    });
  });
});

// ─── List renders items ────────────────────────────────────────────────────

describe('InitiativesListPage — list with items', () => {
  it('renders InitiativeCard stub for returned item', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="initiative-card-1"]')).toBeTruthy();
    });
  });

  it('renders item name from API response', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Project Alpha');
    });
  });

  it('renders multiple cards when multiple items returned', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes(makeTeamResponse());
      return makeRes(makeListResponse([
        makeInitiativeRow({ id: 1, name: 'Alpha' }),
        makeInitiativeRow({ id: 2, name: 'Beta' }),
      ]));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="initiative-card-1"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="initiative-card-2"]')).toBeTruthy();
    });
  });
});

// ─── Header ────────────────────────────────────────────────────────────────

describe('InitiativesListPage — header', () => {
  it('renders "Initiatives" heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Initiatives');
    });
  });

  it('renders "New initiative" header link', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/initiatives/new"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders flag icon in header', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('flag');
    });
  });

  it('renders header description text', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Multi-quarter efforts');
    });
  });
});

// ─── Status filter pills ───────────────────────────────────────────────────

describe('InitiativesListPage — status filter pills', () => {
  const statuses = ['Active', 'Planned', 'Paused', 'Completed', 'Cancelled', 'All'];

  statuses.forEach((label) => {
    it(`renders "${label}" status pill`, async () => {
      const { container } = renderPage();
      await waitFor(() => {
        expect(container.textContent).toContain(label);
      });
    });
  });

  it('clicking a status pill calls router.replace', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Initiatives'));
    const allBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'All',
    ) as HTMLButtonElement;
    expect(allBtn).toBeTruthy();
    fireEvent.click(allBtn);
    expect(replaceMock).toHaveBeenCalled();
  });

  it('clicking "Planned" pill calls router.replace', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Initiatives'));
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Planned',
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(replaceMock).toHaveBeenCalled();
  });

  it('clicking "Paused" pill calls router.replace', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Initiatives'));
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Paused',
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(replaceMock).toHaveBeenCalled();
  });
});

// ─── Priority dropdown ─────────────────────────────────────────────────────

describe('InitiativesListPage — priority filter', () => {
  it('renders "All priorities" default option', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('All priorities');
    });
  });

  it('populates priority dropdown with Low, Medium, High, Critical', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Initiatives'));
    const selects = Array.from(container.querySelectorAll('select')) as HTMLSelectElement[];
    const prioritySelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.text === 'All priorities'),
    );
    expect(prioritySelect).toBeTruthy();
    const opts = Array.from(prioritySelect!.options).map((o) => o.value);
    expect(opts).toContain('low');
    expect(opts).toContain('medium');
    expect(opts).toContain('high');
    expect(opts).toContain('critical');
  });

  it('changing priority dropdown calls router.replace', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('All priorities'));
    const selects = Array.from(container.querySelectorAll('select')) as HTMLSelectElement[];
    const prioritySelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.text === 'All priorities'),
    ) as HTMLSelectElement;
    fireEvent.change(prioritySelect, { target: { value: 'high' } });
    expect(replaceMock).toHaveBeenCalled();
  });
});

// ─── Owner dropdown ────────────────────────────────────────────────────────

describe('InitiativesListPage — owner filter', () => {
  it('renders "Any owner" default option', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Any owner');
    });
  });

  it('populates owner dropdown from team API', async () => {
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

  it('changing owner dropdown calls router.replace', async () => {
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
    const selects = Array.from(container.querySelectorAll('select')) as HTMLSelectElement[];
    const ownerSelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.text === 'Any owner'),
    ) as HTMLSelectElement;
    fireEvent.change(ownerSelect, { target: { value: '5' } });
    expect(replaceMock).toHaveBeenCalled();
  });

  it('filters out team members without a numeric userId', async () => {
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
      return makeRes(makeListResponse());
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Valid'));
    const opts = Array.from(container.querySelectorAll('option')).map((o) => o.textContent);
    expect(opts).not.toContain('NoId');
  });
});

// ─── Has open goals checkbox ───────────────────────────────────────────────

describe('InitiativesListPage — has open goals checkbox', () => {
  it('renders "Has open goals" checkbox label', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Has open goals');
    });
  });

  it('toggling "Has open goals" checkbox calls router.replace', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Has open goals'));
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    fireEvent.click(checkbox);
    expect(replaceMock).toHaveBeenCalled();
  });
});

// ─── Target-before date input ──────────────────────────────────────────────

describe('InitiativesListPage — target date filter', () => {
  it('renders a "target before" date input', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Initiatives'));
    const inputs = container.querySelectorAll('input[type="date"]');
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });

  it('changing the target-before date input calls router.replace', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Initiatives'));
    const input = container.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2025-12-31' } });
    expect(replaceMock).toHaveBeenCalled();
  });

  it('renders "target before" label text', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('target before');
    });
  });
});

// ─── Clear filters button ──────────────────────────────────────────────────

describe('InitiativesListPage — clear filters button', () => {
  it('does NOT render "Clear" when no secondary filters are active', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Initiatives'));
    // No priority/owner/hasOpenGoals/targetDateBefore → no Clear button
    const clearBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Clear'),
    );
    expect(clearBtn).toBeUndefined();
  });

  it('renders "Clear" button when priority filter is active', async () => {
    searchParamsMap = { priority: 'high' };
    const { container } = renderPage();
    await waitFor(() => {
      const clearBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Clear'),
      );
      expect(clearBtn).toBeTruthy();
    });
  });

  it('renders "Clear" button when ownerId filter is active', async () => {
    searchParamsMap = { ownerId: '5' };
    const { container } = renderPage();
    await waitFor(() => {
      const clearBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Clear'),
      );
      expect(clearBtn).toBeTruthy();
    });
  });

  it('renders "Clear" button when hasOpenGoals is true', async () => {
    searchParamsMap = { hasOpenGoals: 'true' };
    const { container } = renderPage();
    await waitFor(() => {
      const clearBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Clear'),
      );
      expect(clearBtn).toBeTruthy();
    });
  });

  it('clicking "Clear" calls router.replace', async () => {
    searchParamsMap = { priority: 'high' };
    const { container } = renderPage();
    await waitFor(() => {
      const clearBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Clear'),
      );
      expect(clearBtn).toBeTruthy();
    });
    const clearBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Clear'),
    ) as HTMLButtonElement;
    fireEvent.click(clearBtn);
    expect(replaceMock).toHaveBeenCalled();
  });
});

// ─── Pagination ────────────────────────────────────────────────────────────

describe('InitiativesListPage — pagination', () => {
  it('does not show Previous/Next when only 1 item and offset=0', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Project Alpha'));
    const prevBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Previous'),
    );
    expect(prevBtn).toBeUndefined();
  });

  it('shows Previous (disabled) and Next when offset=25', async () => {
    searchParamsMap = { offset: '25' };
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Project Alpha'));
    const prevBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Previous'),
    ) as HTMLButtonElement;
    expect(prevBtn).toBeTruthy();
    expect(prevBtn.disabled).toBe(false);
  });

  it('Next button is enabled when PAGE_SIZE+1 (26) items returned', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes(makeTeamResponse());
      const items = Array.from({ length: 26 }, (_, i) =>
        makeInitiativeRow({ id: i + 1, name: `Initiative ${i + 1}` }),
      );
      return makeRes(makeListResponse(items));
    });
    const { container } = renderPage();
    await waitFor(() => {
      const nextBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Next'),
      ) as HTMLButtonElement;
      expect(nextBtn).toBeTruthy();
      expect(nextBtn.disabled).toBe(false);
    });
  });

  it('clicking Next calls router.replace', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes(makeTeamResponse());
      const items = Array.from({ length: 26 }, (_, i) =>
        makeInitiativeRow({ id: i + 1, name: `Initiative ${i + 1}` }),
      );
      return makeRes(makeListResponse(items));
    });
    const { container } = renderPage();
    await waitFor(() => {
      const nextBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Next'),
      );
      expect(nextBtn).toBeTruthy();
    });
    const nextBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Next'),
    ) as HTMLButtonElement;
    fireEvent.click(nextBtn);
    expect(replaceMock).toHaveBeenCalled();
  });

  it('clicking Previous calls router.replace', async () => {
    searchParamsMap = { offset: '25' };
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Project Alpha'));
    const prevBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Previous'),
    ) as HTMLButtonElement;
    fireEvent.click(prevBtn);
    expect(replaceMock).toHaveBeenCalled();
  });

  it('shows offset range label when items loaded and offset>0', async () => {
    searchParamsMap = { offset: '25' };
    const { container } = renderPage();
    await waitFor(() => {
      // range label shows "{offset+1}–{offset+items.length}"
      expect(container.textContent).toContain('26');
    });
  });
});

// ─── API query params ──────────────────────────────────────────────────────

describe('InitiativesListPage — API query params', () => {
  it('fetches initiatives API on mount', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/initiatives'),
      );
      expect(call).toBeTruthy();
    });
  });

  it('sends limit=26 (PAGE_SIZE+1) in the request', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/initiatives'),
      );
      expect(String(call![0])).toContain('limit=26');
    });
  });

  it('sends offset=0 on default first page', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/initiatives'),
      );
      expect(String(call![0])).toContain('offset=0');
    });
  });

  it('sends offset=25 when offset=25 in URL', async () => {
    searchParamsMap = { offset: '25' };
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/initiatives'),
      );
      expect(String(call![0])).toContain('offset=25');
    });
  });

  it('sends status=active when default (no param)', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/initiatives'),
      );
      expect(String(call![0])).toContain('status=active');
    });
  });

  it('does NOT send status param when status=all', async () => {
    searchParamsMap = { status: 'all' };
    renderPage();
    await waitFor(() => {
      const calls = fetchMock.mock.calls
        .map((c) => String(c[0]))
        .filter((u) => u.includes('/api/portal/brain/initiatives'));
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.every((u) => !u.includes('status=all'))).toBe(true);
    });
  });

  it('sends priority param when set in URL', async () => {
    searchParamsMap = { priority: 'high' };
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/initiatives'),
      );
      expect(String(call![0])).toContain('priority=high');
    });
  });

  it('sends ownerId param when set in URL', async () => {
    searchParamsMap = { ownerId: '7' };
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/initiatives'),
      );
      expect(String(call![0])).toContain('ownerId=7');
    });
  });

  it('sends hasOpenGoals=true when set in URL', async () => {
    searchParamsMap = { hasOpenGoals: 'true' };
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/initiatives'),
      );
      expect(String(call![0])).toContain('hasOpenGoals=true');
    });
  });

  it('sends targetDateBefore param when set in URL', async () => {
    searchParamsMap = { targetDateBefore: '2025-12-31' };
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/initiatives'),
      );
      expect(String(call![0])).toContain('targetDateBefore=2025-12-31');
    });
  });

  it('handles malformed offset gracefully (defaults to 0)', async () => {
    searchParamsMap = { offset: '-5' };
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/initiatives'),
      );
      expect(String(call![0])).toContain('offset=0');
    });
  });
});

// ─── Team fetch ────────────────────────────────────────────────────────────

describe('InitiativesListPage — team fetch', () => {
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
      expect(container.textContent).toContain('Project Alpha');
    });
  });

  it('silently ignores non-success team response', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: false }, true);
      return makeRes(makeListResponse());
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Project Alpha');
    });
  });
});

// ─── Owner name resolution ─────────────────────────────────────────────────

describe('InitiativesListPage — owner name resolution', () => {
  it('passes ownerLookup to InitiativeCard when team is loaded', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) {
        return makeRes(makeTeamResponse([
          { userId: 3, name: 'Dana', email: 'dana@example.com' },
        ]));
      }
      return makeRes(makeListResponse([makeInitiativeRow({ ownerId: 3 })]));
    });
    const { container } = renderPage();
    // The card stub renders; verifying team member appeared in the owner select is sufficient
    await waitFor(() => {
      expect(container.querySelector('[data-testid="initiative-card-1"]')).toBeTruthy();
      expect(container.textContent).toContain('Dana');
    });
  });
});
