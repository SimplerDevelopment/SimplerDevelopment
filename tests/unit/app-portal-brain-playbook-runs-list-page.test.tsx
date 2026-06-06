// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for `app/portal/brain/playbook-runs/page.tsx`
 *
 * 'use client' page — rendered directly with @testing-library/react.
 * Filters live in the URL query string; useSearchParams + useRouter are mocked.
 * The page wraps its content in <Suspense>; we render directly in jsdom.
 *
 * Covers:
 *  - Loading state (spinner shown while fetch is pending)
 *  - Error state (API !ok, success=false, network throw, non-Error throw)
 *  - Empty state ("No runs match these filters")
 *  - List renders run rows with label + status chip + progress bar
 *  - "Playbooks" header link present
 *  - Status filter pills: all 7 rendered; active one highlighted; clicking updates URL
 *  - Playbook dropdown: populated from playbooks API; changing calls router.replace
 *  - Date "started after" and "before" inputs; changing calls router.replace
 *  - "Clear" button: hidden when no secondary filters; shown and functional when active
 *  - Pagination: Previous disabled on offset=0; Next enabled when PAGE_SIZE+1 items returned
 *  - Clicking Next / Previous calls router.replace
 *  - Progress bar shown when stepProgress.total > 0
 *  - Progress bar colour: red for failed, zinc for aborted, emerald otherwise
 *  - Run row shows started-time span when startedAt provided
 *  - Run row shows duration span when completedAt + startedAt present
 *  - Run row links to /portal/brain/playbook-runs/[id]
 *  - playbookLookup resolves name from separate playbooks fetch
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ────────────────────────────────────────

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

// ─── Fetch mock helpers ───────────────────────────────────────────────────────

type FetchResp = { ok: boolean; status: number; json: () => Promise<any> };
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: any, ok = true, status = 200): FetchResp {
  return { ok, status, json: async () => body };
}

// ─── Data factories ───────────────────────────────────────────────────────────

function makeRun(over: Record<string, any> = {}): any {
  return {
    id: 1,
    playbookId: 10,
    playbookName: 'Onboarding',
    label: 'Run #1',
    status: 'active',
    startedAt: '2025-06-01T10:00:00Z',
    completedAt: null,
    stepProgress: { completed: 2, total: 5 },
    ...over,
  };
}

function makePlaybook(over: Record<string, any> = {}): any {
  return {
    id: 10,
    name: 'Onboarding',
    slug: 'onboarding',
    status: 'active',
    triggerKind: 'manual',
    category: null,
    ownerId: null,
    stepCount: 5,
    activeRunCount: 1,
    ...over,
  };
}

function makeRunsResponse(items: any[] = [makeRun()]): any {
  return { success: true, data: { items } };
}

function makePlaybooksResponse(items: any[] = [makePlaybook()]): any {
  return { success: true, data: { items } };
}

// ─── Default fetch handler ────────────────────────────────────────────────────

function defaultFetch(url: string): FetchResp {
  if (url.includes('/api/portal/brain/playbooks')) {
    return makeRes(makePlaybooksResponse());
  }
  if (url.includes('/api/portal/brain/playbook-runs')) {
    return makeRes(makeRunsResponse());
  }
  return makeRes({ success: true });
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

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

// ─── Import after mocks ───────────────────────────────────────────────────────

import PlaybookRunsPage from '@/app/portal/brain/playbook-runs/page';

function renderPage() {
  return render(React.createElement(PlaybookRunsPage));
}

// ─── Loading state ────────────────────────────────────────────────────────────

describe('PlaybookRunsPage — loading', () => {
  it('shows spinner (progress_activity) while fetch is pending', () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return defaultFetch(url);
      return new Promise(() => {});
    });
    const { container } = renderPage();
    expect(container.textContent).toContain('progress_activity');
  });

  it('shows "Loading" text while fetch is pending', () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return defaultFetch(url);
      return new Promise(() => {});
    });
    const { container } = renderPage();
    expect(container.textContent).toContain('Loading');
  });
});

// ─── Error states ─────────────────────────────────────────────────────────────

describe('PlaybookRunsPage — error state', () => {
  it('shows error message when API returns !ok with message', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return makeRes(makePlaybooksResponse());
      return makeRes({ success: false, message: 'Server error' }, false, 500);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Server error');
    });
  });

  it('shows fallback message when API returns !ok with no message', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return makeRes(makePlaybooksResponse());
      return makeRes({ success: false }, false, 503);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Failed to load runs');
    });
  });

  it('shows error when success=false with ok=true', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return makeRes(makePlaybooksResponse());
      return makeRes({ success: false, message: 'DB error' }, true);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('DB error');
    });
  });

  it('shows network error message when fetch throws an Error', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return makeRes(makePlaybooksResponse());
      throw new Error('Connection refused');
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Connection refused');
    });
  });

  it('shows "Network error" for non-Error throws', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return makeRes(makePlaybooksResponse());
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
      if (url.includes('/api/portal/brain/playbooks')) return makeRes(makePlaybooksResponse());
      return makeRes({ success: false, message: 'oops' }, false);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('error_outline');
    });
  });
});

// ─── Empty state ──────────────────────────────────────────────────────────────

describe('PlaybookRunsPage — empty state', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return makeRes(makePlaybooksResponse());
      return makeRes(makeRunsResponse([]));
    });
  });

  it('shows "No runs match these filters." in empty state', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No runs match these filters');
    });
  });

  it('renders playlist_play icon in empty state', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('playlist_play');
    });
  });

  it('shows instruction text about starting runs', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Start a run from any active playbook');
    });
  });
});

// ─── List renders items ───────────────────────────────────────────────────────

describe('PlaybookRunsPage — list with items', () => {
  it('renders run label in list', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Run #1');
    });
  });

  it('renders run status chip label', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Active');
    });
  });

  it('renders multiple run rows when multiple items returned', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return makeRes(makePlaybooksResponse());
      return makeRes(makeRunsResponse([
        makeRun({ id: 1, label: 'Run Alpha' }),
        makeRun({ id: 2, label: 'Run Beta' }),
      ]));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Run Alpha');
      expect(container.textContent).toContain('Run Beta');
    });
  });

  it('renders a link to the run detail page', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/playbook-runs/1"]');
      expect(link).toBeTruthy();
    });
  });

  it('shows playbook name from playbookLookup when it matches', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) {
        return makeRes(makePlaybooksResponse([makePlaybook({ id: 10, name: 'Resolved Playbook' })]));
      }
      return makeRes(makeRunsResponse([makeRun({ playbookId: 10, playbookName: 'Fallback' })]));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Resolved Playbook');
    });
  });

  it('falls back to run.playbookName when playbookId not in lookup', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return makeRes(makePlaybooksResponse([]));
      return makeRes(makeRunsResponse([makeRun({ playbookId: 999, playbookName: 'Fallback Name' })]));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Fallback Name');
    });
  });
});

// ─── Header ───────────────────────────────────────────────────────────────────

describe('PlaybookRunsPage — header', () => {
  it('renders "Playbook runs" heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Playbook runs');
    });
  });

  it('renders "Playbooks" link to /portal/brain/playbooks', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/playbooks"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toContain('Playbooks');
    });
  });

  it('renders playlist_play icon in header', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('playlist_play');
    });
  });
});

// ─── Status filter pills ──────────────────────────────────────────────────────

describe('PlaybookRunsPage — status filter pills', () => {
  const expectedLabels = ['Active', 'Pending', 'Paused', 'Completed', 'Aborted', 'Failed', 'All'];

  expectedLabels.forEach((label) => {
    it(`renders "${label}" status pill`, async () => {
      const { container } = renderPage();
      await waitFor(() => {
        expect(container.textContent).toContain(label);
      });
    });
  });

  it('default status is "active" — Active pill is highlighted', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Playbook runs'));
    const buttons = Array.from(container.querySelectorAll('button'));
    const activeBtn = buttons.find((b) => b.textContent?.trim() === 'Active');
    expect(activeBtn?.className).toContain('bg-primary');
  });

  it('clicking "All" pill calls router.replace', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Playbook runs'));
    const buttons = Array.from(container.querySelectorAll('button'));
    const allBtn = buttons.find((b) => b.textContent?.trim() === 'All') as HTMLButtonElement;
    expect(allBtn).toBeTruthy();
    fireEvent.click(allBtn);
    expect(replaceMock).toHaveBeenCalled();
  });

  it('clicking "Pending" pill calls router.replace', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Playbook runs'));
    const buttons = Array.from(container.querySelectorAll('button'));
    const pendingBtn = buttons.find((b) => b.textContent?.trim() === 'Pending') as HTMLButtonElement;
    expect(pendingBtn).toBeTruthy();
    fireEvent.click(pendingBtn);
    expect(replaceMock).toHaveBeenCalled();
  });

  it('clicking "Failed" pill calls router.replace', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Playbook runs'));
    const buttons = Array.from(container.querySelectorAll('button'));
    const failedBtn = buttons.find((b) => b.textContent?.trim() === 'Failed') as HTMLButtonElement;
    fireEvent.click(failedBtn);
    expect(replaceMock).toHaveBeenCalled();
  });

  it('clicking "Completed" pill calls router.replace', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Playbook runs'));
    const buttons = Array.from(container.querySelectorAll('button'));
    const completedBtn = buttons.find((b) => b.textContent?.trim() === 'Completed') as HTMLButtonElement;
    fireEvent.click(completedBtn);
    expect(replaceMock).toHaveBeenCalled();
  });

  it('when status=completed in URL, Completed pill is highlighted', async () => {
    searchParamsMap = { status: 'completed' };
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Playbook runs'));
    const buttons = Array.from(container.querySelectorAll('button'));
    const completedBtn = buttons.find((b) => b.textContent?.trim() === 'Completed');
    expect(completedBtn?.className).toContain('bg-primary');
  });
});

// ─── Playbook dropdown ────────────────────────────────────────────────────────

describe('PlaybookRunsPage — playbook filter dropdown', () => {
  it('renders "Any playbook" default option', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Any playbook');
    });
  });

  it('populates dropdown with playbooks from API', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) {
        return makeRes(makePlaybooksResponse([
          makePlaybook({ id: 1, name: 'Playbook Alpha' }),
          makePlaybook({ id: 2, name: 'Playbook Beta' }),
        ]));
      }
      return makeRes(makeRunsResponse());
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Playbook Alpha');
      expect(container.textContent).toContain('Playbook Beta');
    });
  });

  it('changing playbook select calls router.replace', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) {
        return makeRes(makePlaybooksResponse([makePlaybook({ id: 5, name: 'Onboarding' })]));
      }
      return makeRes(makeRunsResponse());
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Onboarding'));
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '5' } });
    expect(replaceMock).toHaveBeenCalled();
  });

  it('silently ignores playbooks fetch failure (no crash)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) throw new Error('playbooks down');
      return makeRes(makeRunsResponse());
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Run #1');
    });
  });
});

// ─── Date filters ─────────────────────────────────────────────────────────────

describe('PlaybookRunsPage — date filters', () => {
  it('renders two date inputs (started after + before)', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Playbook runs'));
    const dateInputs = Array.from(container.querySelectorAll('input[type="date"]'));
    expect(dateInputs.length).toBe(2);
  });

  it('changing "started after" date calls router.replace', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Playbook runs'));
    const dateInputs = Array.from(container.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
    fireEvent.change(dateInputs[0], { target: { value: '2025-01-01' } });
    expect(replaceMock).toHaveBeenCalled();
  });

  it('changing "before" date calls router.replace', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Playbook runs'));
    const dateInputs = Array.from(container.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
    fireEvent.change(dateInputs[1], { target: { value: '2025-12-31' } });
    expect(replaceMock).toHaveBeenCalled();
  });

  it('filters items client-side by startedAfter', async () => {
    searchParamsMap = { startedAfter: '2025-06-10' };
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return makeRes(makePlaybooksResponse());
      return makeRes(makeRunsResponse([
        makeRun({ id: 1, label: 'Before Filter', startedAt: '2025-06-01T00:00:00Z' }),
        makeRun({ id: 2, label: 'After Filter', startedAt: '2025-06-15T00:00:00Z' }),
      ]));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('After Filter');
      expect(container.textContent).not.toContain('Before Filter');
    });
  });

  it('filters items client-side by startedBefore (inclusive end-of-day)', async () => {
    searchParamsMap = { startedBefore: '2025-06-05' };
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return makeRes(makePlaybooksResponse());
      return makeRes(makeRunsResponse([
        makeRun({ id: 1, label: 'Early Run', startedAt: '2025-06-01T00:00:00Z' }),
        makeRun({ id: 2, label: 'Late Run', startedAt: '2025-06-20T00:00:00Z' }),
      ]));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Early Run');
      expect(container.textContent).not.toContain('Late Run');
    });
  });
});

// ─── Clear button ─────────────────────────────────────────────────────────────

describe('PlaybookRunsPage — clear button', () => {
  it('does NOT show "Clear" when no secondary filters are active', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Playbook runs'));
    expect(container.textContent).not.toContain('Clear');
  });

  it('shows "Clear" when playbookId filter is set', async () => {
    searchParamsMap = { playbookId: '10' };
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Clear');
    });
  });

  it('shows "Clear" when startedAfter filter is set', async () => {
    searchParamsMap = { startedAfter: '2025-01-01' };
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Clear');
    });
  });

  it('shows "Clear" when startedBefore filter is set', async () => {
    searchParamsMap = { startedBefore: '2025-12-31' };
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Clear');
    });
  });

  it('clicking "Clear" calls router.replace', async () => {
    searchParamsMap = { playbookId: '10' };
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

describe('PlaybookRunsPage — pagination', () => {
  it('does NOT render pagination buttons when offset=0 and fewer than PAGE_SIZE items', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Run #1'));
    const prevBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Previous'),
    );
    expect(prevBtn).toBeUndefined();
  });

  it('renders Previous disabled and Next enabled when PAGE_SIZE+1 items returned', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return makeRes(makePlaybooksResponse());
      const items = Array.from({ length: 26 }, (_, i) =>
        makeRun({ id: i + 1, label: `Run ${i + 1}` }),
      );
      return makeRes(makeRunsResponse(items));
    });
    const { container } = renderPage();
    await waitFor(() => {
      const prevBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Previous'),
      ) as HTMLButtonElement;
      const nextBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Next'),
      ) as HTMLButtonElement;
      expect(prevBtn).toBeTruthy();
      expect(prevBtn.disabled).toBe(true);
      expect(nextBtn).toBeTruthy();
      expect(nextBtn.disabled).toBe(false);
    });
  });

  it('clicking Next calls router.replace', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return makeRes(makePlaybooksResponse());
      const items = Array.from({ length: 26 }, (_, i) =>
        makeRun({ id: i + 1, label: `Run ${i + 1}` }),
      );
      return makeRes(makeRunsResponse(items));
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

  it('Previous is enabled when offset > 0', async () => {
    searchParamsMap = { offset: '25' };
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return makeRes(makePlaybooksResponse());
      return makeRes(makeRunsResponse([makeRun()]));
    });
    const { container } = renderPage();
    await waitFor(() => {
      const prevBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Previous'),
      ) as HTMLButtonElement;
      expect(prevBtn).toBeTruthy();
      expect(prevBtn.disabled).toBe(false);
    });
  });

  it('clicking Previous on offset>0 calls router.replace', async () => {
    searchParamsMap = { offset: '25' };
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return makeRes(makePlaybooksResponse());
      return makeRes(makeRunsResponse([makeRun()]));
    });
    const { container } = renderPage();
    await waitFor(() => {
      const prevBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Previous'),
      );
      expect(prevBtn).toBeTruthy();
    });
    const prevBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Previous'),
    ) as HTMLButtonElement;
    fireEvent.click(prevBtn);
    expect(replaceMock).toHaveBeenCalled();
  });

  it('renders offset range label (e.g. "1–1") when items present with offset>0', async () => {
    searchParamsMap = { offset: '25' };
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return makeRes(makePlaybooksResponse());
      return makeRes(makeRunsResponse([makeRun()]));
    });
    const { container } = renderPage();
    await waitFor(() => {
      // offset=25, items.length=1 → "26–26"
      expect(container.textContent).toContain('26–26');
    });
  });
});

// ─── Progress bar ─────────────────────────────────────────────────────────────

describe('PlaybookRunsPage — progress bar', () => {
  it('renders progress bar when stepProgress.total > 0', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return makeRes(makePlaybooksResponse());
      return makeRes(makeRunsResponse([makeRun({ stepProgress: { completed: 3, total: 5 } })]));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('3 / 5');
      expect(container.textContent).toContain('60%');
    });
  });

  it('does NOT render progress bar when stepProgress.total === 0', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return makeRes(makePlaybooksResponse());
      return makeRes(makeRunsResponse([makeRun({ stepProgress: { completed: 0, total: 0 } })]));
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Run #1'));
    // No "/ 0" step counter
    expect(container.textContent).not.toContain('/ 0');
  });

  it('progress bar uses red colour class for failed runs', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return makeRes(makePlaybooksResponse());
      return makeRes(makeRunsResponse([makeRun({ status: 'failed', stepProgress: { completed: 1, total: 3 } })]));
    });
    const { container } = renderPage();
    await waitFor(() => {
      const bar = container.querySelector('.bg-red-500');
      expect(bar).toBeTruthy();
    });
  });

  it('progress bar uses zinc colour class for aborted runs', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return makeRes(makePlaybooksResponse());
      return makeRes(makeRunsResponse([makeRun({ status: 'aborted', stepProgress: { completed: 1, total: 3 } })]));
    });
    const { container } = renderPage();
    await waitFor(() => {
      const bar = container.querySelector('.bg-zinc-400');
      expect(bar).toBeTruthy();
    });
  });

  it('progress bar uses emerald colour class for active runs', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return makeRes(makePlaybooksResponse());
      return makeRes(makeRunsResponse([makeRun({ status: 'active', stepProgress: { completed: 2, total: 4 } })]));
    });
    const { container } = renderPage();
    await waitFor(() => {
      const bar = container.querySelector('.bg-emerald-500');
      expect(bar).toBeTruthy();
    });
  });

  it('shows correct percentage (0%) when completed=0 out of 5', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return makeRes(makePlaybooksResponse());
      return makeRes(makeRunsResponse([makeRun({ stepProgress: { completed: 0, total: 5 } })]));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('0%');
    });
  });
});

// ─── Run row timestamps ───────────────────────────────────────────────────────

describe('PlaybookRunsPage — run row timestamps', () => {
  it('shows "started" time span when startedAt is provided', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('started');
    });
  });

  it('does NOT show "started Xago" span inside the run row when startedAt is null', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return makeRes(makePlaybooksResponse());
      return makeRes(makeRunsResponse([makeRun({ startedAt: null })]));
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Run #1'));
    // The "schedule" icon only appears inside RunRow when startedAt is set —
    // the filter-bar "started after" label only contains the word "after", not the icon.
    // Check that the schedule icon+prefix is absent from the run row link specifically.
    const runLink = container.querySelector('a[href="/portal/brain/playbook-runs/1"]');
    expect(runLink?.textContent).not.toContain('schedule');
  });

  it('shows "ran for" duration when both startedAt and completedAt are provided', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return makeRes(makePlaybooksResponse());
      return makeRes(makeRunsResponse([makeRun({
        startedAt: '2025-06-01T10:00:00Z',
        completedAt: '2025-06-01T10:30:00Z',
        status: 'completed',
      })]));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('ran for');
    });
  });

  it('does NOT show "ran for" when completedAt is null', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Run #1'));
    // Default run has completedAt: null
    expect(container.textContent).not.toContain('ran for');
  });
});

// ─── API query string ─────────────────────────────────────────────────────────

describe('PlaybookRunsPage — API query string', () => {
  it('fetches playbook-runs API on mount', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/playbook-runs'),
      );
      expect(call).toBeTruthy();
    });
  });

  it('sends status=active when default status param is active', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/playbook-runs'),
      );
      expect(String(call![0])).toContain('status=active');
    });
  });

  it('does NOT send status param when status=all', async () => {
    searchParamsMap = { status: 'all' };
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/playbook-runs'),
      );
      expect(String(call![0])).not.toContain('status=');
    });
  });

  it('sends limit=26 (PAGE_SIZE + 1) in request', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/playbook-runs'),
      );
      expect(String(call![0])).toContain('limit=26');
    });
  });

  it('sends offset=0 by default', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/playbook-runs'),
      );
      expect(String(call![0])).toContain('offset=0');
    });
  });

  it('sends offset=25 when offset=25 is in URL', async () => {
    searchParamsMap = { offset: '25' };
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return makeRes(makePlaybooksResponse());
      return makeRes(makeRunsResponse());
    });
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/playbook-runs'),
      );
      expect(String(call![0])).toContain('offset=25');
    });
  });

  it('sends playbookId param when playbookId is in URL', async () => {
    searchParamsMap = { playbookId: '42' };
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/playbook-runs'),
      );
      expect(String(call![0])).toContain('playbookId=42');
    });
  });

  it('fetches /api/portal/brain/playbooks on mount', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/playbooks'),
      );
      expect(call).toBeTruthy();
    });
  });

  it('clamps invalid offset to 0', async () => {
    searchParamsMap = { offset: '-99' };
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks')) return makeRes(makePlaybooksResponse());
      return makeRes(makeRunsResponse());
    });
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/playbook-runs'),
      );
      expect(String(call![0])).toContain('offset=0');
    });
  });
});

// ─── Refetch on filter change ─────────────────────────────────────────────────

describe('PlaybookRunsPage — refetch on filter change', () => {
  it('re-fetches playbook-runs when searchParams change', async () => {
    const { container, rerender } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Run #1'));
    const callsBefore = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/api/portal/brain/playbook-runs'),
    ).length;

    searchParamsMap = { status: 'completed' };
    await act(async () => {
      rerender(React.createElement(PlaybookRunsPage));
    });
    await waitFor(() => {
      const callsAfter = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes('/api/portal/brain/playbook-runs'),
      ).length;
      expect(callsAfter).toBeGreaterThan(callsBefore);
    });
  });
});
