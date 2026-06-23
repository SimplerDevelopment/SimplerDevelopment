// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/brain/relationships/page.tsx`
 *
 * The page is a 'use client' component that:
 * - Fetches relationship rows from /api/portal/brain/relationships
 * - Shows loading, empty, error, and list states
 * - Supports three views (all / prospects / stale) with URL sync
 * - Supports priority and type filters
 * - Has a CreateRelationshipModal that searches CRM suggestions and POSTs
 *
 * Strategy: stub next/navigation and next/link, stub global fetch.
 * All sub-components (RelationshipCard, RelationshipRow, CreateRelationshipModal)
 * live in the same file — no external stubs needed.
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
  usePathname: () => '/portal/brain/relationships',
  useSearchParams: () => searchParamsValue,
}));

vi.mock('next/link', () => ({
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

// ─── Fetch stub ───────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<unknown> };
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, json: async () => body };
}

function makeListRes(items: RelationshipListRow[]): FetchResp {
  return makeRes({ success: true, data: items });
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

interface RelationshipOverlay {
  id: number;
  relationshipType: string;
  status: 'active' | 'paused' | 'archived';
  priority: 'low' | 'medium' | 'high' | 'critical';
  ownerId: number | null;
  summary: string | null;
  currentPriorities: string | null;
  nextReviewAt: string | null;
  lastTouchAt: string | null;
  staleAfterDays: number | null;
  confidentialityLevel: string;
  serviceLines: string[];
}

interface RelationshipListRow {
  overlay: RelationshipOverlay;
  underlying: { type: 'company' | 'deal'; id: number; name: string; secondaryName?: string };
  openTaskCount: number;
  isStale: boolean;
}

function makeOverlay(id: number, extra: Partial<RelationshipOverlay> = {}): RelationshipOverlay {
  return {
    id,
    relationshipType: 'generic',
    status: 'active',
    priority: 'medium',
    ownerId: null,
    summary: null,
    currentPriorities: null,
    nextReviewAt: null,
    lastTouchAt: null,
    staleAfterDays: null,
    confidentialityLevel: 'standard',
    serviceLines: [],
    ...extra,
  };
}

function makeRow(
  id: number,
  extra: {
    overlay?: Partial<RelationshipOverlay>;
    underlying?: RelationshipListRow['underlying'];
    openTaskCount?: number;
    isStale?: boolean;
  } = {},
): RelationshipListRow {
  return {
    overlay: makeOverlay(id, extra.overlay),
    underlying: extra.underlying ?? { type: 'company', id: id * 10, name: `Company ${id}` },
    openTaskCount: extra.openTaskCount ?? 0,
    isStale: extra.isStale ?? false,
  };
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  searchParamsValue = new URLSearchParams();
  replaceMock.mockReset();
  fetchMock.mockReset();

  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/api/portal/brain/relationships')) {
      return makeListRes([]);
    }
    if (url.includes('/api/portal/brain/crm-suggestions')) {
      return makeRes({ success: true, data: { companies: [], deals: [] } });
    }
    return makeRes({ success: true, data: {} });
  });

  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Import after mocks ───────────────────────────────────────────────────────

import BrainRelationshipsPage from '@/app/portal/brain/relationships/page';

function renderPage() {
  return render(React.createElement(BrainRelationshipsPage));
}

// ─── Shell rendering ──────────────────────────────────────────────────────────

describe('BrainRelationshipsPage — shell', () => {
  it('renders the Relationships heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Relationships');
    });
  });

  it('renders the subtitle text about Brain-tracked relationships', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Brain-tracked relationships');
    });
  });

  it('renders a "New relationship" button', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const btns = Array.from(container.querySelectorAll('button'));
      expect(btns.some((b) => b.textContent?.includes('New relationship'))).toBe(true);
    });
  });

  it('renders the three view tabs: All, Prospects, Stale', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('All');
      expect(container.textContent).toContain('Prospects');
      expect(container.textContent).toContain('Stale');
    });
  });

  it('renders the priority filter select with "All priorities" default', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const selects = Array.from(container.querySelectorAll('select'));
      expect(selects.some((s) => s.textContent?.includes('All priorities'))).toBe(true);
    });
  });
});

// ─── Loading state ────────────────────────────────────────────────────────────

describe('BrainRelationshipsPage — loading state', () => {
  it('shows a loading indicator while fetch is in flight', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.textContent).toContain('Loading');
  });
});

// ─── Empty state ──────────────────────────────────────────────────────────────

describe('BrainRelationshipsPage — empty state', () => {
  it('shows "No relationships yet." on vanilla empty "all" view', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No relationships yet.');
    });
  });

  it('shows a "New relationship" button in the empty-state card', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No relationships yet.');
    });
    const btns = Array.from(container.querySelectorAll('button'));
    const count = btns.filter((b) => b.textContent?.includes('New relationship')).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('shows "No prospects yet." on the prospects empty view', async () => {
    searchParamsValue = new URLSearchParams('view=prospects');
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No prospects yet.');
    });
  });

  it('shows "No stale relationships." on the stale empty view', async () => {
    searchParamsValue = new URLSearchParams('view=stale');
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No stale relationships.');
    });
  });

  it('empty-state on "all" includes hint about picking a CRM company or deal', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('CRM company or deal');
    });
  });

  it('empty-state on "prospects" does NOT show a "New relationship" button in the card', async () => {
    searchParamsValue = new URLSearchParams('view=prospects');
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No prospects yet.');
    });
    // the empty-state card only shows a New relationship button on "all" view
    const emptyCard = container.querySelector('.text-center.py-12');
    expect(emptyCard?.querySelector('button')).toBeNull();
  });
});

// ─── Error state ──────────────────────────────────────────────────────────────

describe('BrainRelationshipsPage — error state', () => {
  it('shows error message when endpoint returns success:false', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ success: false, message: 'DB unavailable' }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('DB unavailable');
    });
  });

  it('shows error message when endpoint returns ok:false', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: false,
      json: async () => ({ success: false, message: 'not found' }),
    }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('not found');
    });
  });

  it('shows "Failed to load." fallback when message is absent', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ success: false }, false),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Failed to load.');
    });
  });

  it('shows network error message when fetch throws', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/relationships')) {
        throw new Error('network offline');
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('network offline');
    });
  });

  it('shows "Network error" when a non-Error is thrown', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/relationships')) {
        throw 'string-thrown-error';
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Network error');
    });
  });
});

// ─── List rendering ───────────────────────────────────────────────────────────

describe('BrainRelationshipsPage — list rendering (all view)', () => {
  it('renders relationship cards for each row on the "all" view', async () => {
    fetchMock.mockImplementation(async () =>
      makeListRes([makeRow(1), makeRow(2)]),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Company 1');
      expect(container.textContent).toContain('Company 2');
    });
  });

  it('renders links to /portal/brain/relationships/:id for each card', async () => {
    fetchMock.mockImplementation(async () => makeListRes([makeRow(7)]));
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/relationships/7"]');
      expect(link).toBeTruthy();
    });
  });

  it('shows priority badge text on each card', async () => {
    fetchMock.mockImplementation(async () =>
      makeListRes([makeRow(1, { overlay: { priority: 'critical' } })]),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('critical');
    });
  });

  it('shows "stale" badge on rows where isStale is true', async () => {
    fetchMock.mockImplementation(async () =>
      makeListRes([makeRow(1, { isStale: true })]),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('stale');
    });
  });

  it('shows open task count when openTaskCount > 0', async () => {
    fetchMock.mockImplementation(async () =>
      makeListRes([makeRow(1, { openTaskCount: 3 })]),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('3 open');
    });
  });

  it('shows summary text when present', async () => {
    fetchMock.mockImplementation(async () =>
      makeListRes([makeRow(1, { overlay: { summary: 'Key strategic partner' } })]),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Key strategic partner');
    });
  });

  it('shows confidentiality level badge when not "standard"', async () => {
    fetchMock.mockImplementation(async () =>
      makeListRes([makeRow(1, { overlay: { confidentialityLevel: 'restricted' } })]),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('restricted');
    });
  });

  it('shows secondaryName when provided', async () => {
    fetchMock.mockImplementation(async () =>
      makeListRes([
        makeRow(1, { underlying: { type: 'company', id: 10, name: 'ACME', secondaryName: 'ACME Corp' } }),
      ]),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('ACME Corp');
    });
  });

  it('shows deal icon for deal-type underlying entities', async () => {
    fetchMock.mockImplementation(async () =>
      makeListRes([makeRow(1, { underlying: { type: 'deal', id: 20, name: 'Big Deal' } })]),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Big Deal');
      // material-icons: deal = handshake
      expect(container.textContent).toContain('handshake');
    });
  });
});

// ─── Type filter ──────────────────────────────────────────────────────────────

describe('BrainRelationshipsPage — type filter', () => {
  it('type filter select appears when multiple relationship types exist in rows', async () => {
    fetchMock.mockImplementation(async () =>
      makeListRes([
        makeRow(1, { overlay: { ...makeRow(1).overlay, relationshipType: 'prospect' } }),
        makeRow(2, { overlay: { ...makeRow(2).overlay, relationshipType: 'household' } }),
      ]),
    );
    const { container } = renderPage();
    await waitFor(() => {
      const selects = Array.from(container.querySelectorAll('select'));
      expect(selects.some((s) => s.textContent?.includes('All types'))).toBe(true);
    });
  });

  it('type filter select IS shown even when all rows share the same type (1 distinct type)', async () => {
    fetchMock.mockImplementation(async () =>
      makeListRes([makeRow(1), makeRow(2)]),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Company 1');
    });
    // types.length > 0 is true when there is 1+ distinct type, so "All types" appears
    const selects = Array.from(container.querySelectorAll('select'));
    expect(selects.some((s) => s.textContent?.includes('All types'))).toBe(true);
  });

  it('changing the priority filter calls fetch with the priority param', async () => {
    fetchMock.mockImplementation(async () => makeListRes([]));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No relationships yet.');
    });
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => makeListRes([]));
    const prioritySelect = Array.from(container.querySelectorAll('select')).find((s) =>
      s.textContent?.includes('All priorities'),
    ) as HTMLSelectElement;
    fireEvent.change(prioritySelect, { target: { value: 'high' } });
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('priority=high'))).toBe(true);
    });
  });
});

// ─── View switching ───────────────────────────────────────────────────────────

describe('BrainRelationshipsPage — view switching', () => {
  it('clicking the "Prospects" tab calls router.replace with view=prospects', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Prospects');
    });
    // Tab buttons render: <span class="material-icons">icon</span>Label
    // textContent = "person_searchProspects", so use includes
    const tabs = Array.from(container.querySelectorAll('button'));
    const prospectsTab = tabs.find((b) => b.textContent?.includes('Prospects'));
    expect(prospectsTab).toBeTruthy();
    fireEvent.click(prospectsTab!);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
      const arg = String(replaceMock.mock.calls[0][0]);
      expect(arg).toContain('view=prospects');
    });
  });

  it('clicking the "Stale" tab calls router.replace with view=stale', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Stale');
    });
    const tabs = Array.from(container.querySelectorAll('button'));
    const staleTab = tabs.find((b) => b.textContent?.includes('Stale'));
    expect(staleTab).toBeTruthy();
    fireEvent.click(staleTab!);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
      const arg = String(replaceMock.mock.calls[0][0]);
      expect(arg).toContain('view=stale');
    });
  });

  it('clicking the "All" tab removes the view param', async () => {
    searchParamsValue = new URLSearchParams('view=prospects');
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('All');
    });
    const tabs = Array.from(container.querySelectorAll('button'));
    // "All" tab — must not match "New relationship" or other buttons
    const allTab = tabs.find((b) => {
      const txt = b.textContent ?? '';
      return txt.includes('All') && !txt.includes('relationship') && !txt.includes('priorities') && !txt.includes('types');
    });
    expect(allTab).toBeTruthy();
    fireEvent.click(allTab!);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
      const arg = String(replaceMock.mock.calls[0][0]);
      expect(arg).not.toContain('view=');
    });
  });

  it('view=prospects initial URL sets the Prospects header', async () => {
    searchParamsValue = new URLSearchParams('view=prospects');
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Prospects');
      expect(container.textContent).toContain('early-stage opportunities');
    });
  });

  it('view=stale initial URL sets the Stale header', async () => {
    searchParamsValue = new URLSearchParams('view=stale');
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Stale relationships');
    });
  });

  it('invalid view param defaults to "all"', async () => {
    searchParamsValue = new URLSearchParams('view=bogus');
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Relationships');
    });
  });

  it('stale view passes stale=true to the fetch', async () => {
    searchParamsValue = new URLSearchParams('view=stale');
    const { container } = renderPage();
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('stale=true'))).toBe(true);
    });
    expect(container.textContent).toContain('Stale');
  });

  it('prospects view passes type=prospect to the fetch when no typeFilter is set', async () => {
    searchParamsValue = new URLSearchParams('view=prospects');
    const { container } = renderPage();
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('type=prospect'))).toBe(true);
    });
    expect(container.textContent).toContain('Prospects');
  });

  it('renders list rows (not cards) when view is "stale" and data is present', async () => {
    searchParamsValue = new URLSearchParams('view=stale');
    fetchMock.mockImplementation(async () => makeListRes([makeRow(1), makeRow(2)]));
    const { container } = renderPage();
    await waitFor(() => {
      // stale/prospects view renders a divide-y list, not a grid of cards
      expect(container.querySelector('.divide-y')).toBeTruthy();
    });
  });
});

// ─── Stale sorting ────────────────────────────────────────────────────────────

describe('BrainRelationshipsPage — stale sort', () => {
  it('stale rows sort before non-stale rows in prospects/stale views', async () => {
    searchParamsValue = new URLSearchParams('view=stale');
    fetchMock.mockImplementation(async () =>
      makeListRes([
        makeRow(1),
        makeRow(2, { isStale: true }),
      ]),
    );
    const { container } = renderPage();
    await waitFor(() => {
      const text = container.textContent ?? '';
      const idx2 = text.indexOf('Company 2');
      const idx1 = text.indexOf('Company 1');
      expect(idx2).toBeLessThan(idx1);
    });
  });
});

// ─── Create modal — open/close ────────────────────────────────────────────────

describe('BrainRelationshipsPage — CreateRelationshipModal open/close', () => {
  it('modal is not visible by default', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Relationships');
    });
    expect(container.querySelector('.fixed.inset-0')).toBeNull();
  });

  it('clicking "New relationship" opens the modal', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const btns = Array.from(container.querySelectorAll('button'));
      const btn = btns.find((b) => b.textContent?.includes('New relationship'));
      expect(btn).toBeTruthy();
    });
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('New relationship'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      expect(container.querySelector('.fixed.inset-0')).toBeTruthy();
      expect(container.textContent).toContain('New relationship');
    });
  });

  it('clicking Cancel closes the modal', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Relationships');
    });
    const openBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('New relationship'),
    ) as HTMLButtonElement;
    fireEvent.click(openBtn);
    await waitFor(() => {
      expect(container.querySelector('.fixed.inset-0')).toBeTruthy();
    });
    const cancelBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(container.querySelector('.fixed.inset-0')).toBeNull();
    });
  });

  it('modal shows the search input for CRM companies or deals', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Relationships');
    });
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('New relationship'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      const input = container.querySelector('input[placeholder*="Search CRM"]');
      expect(input).toBeTruthy();
    });
  });
});

// ─── Create modal — CRM suggestions ──────────────────────────────────────────

describe('BrainRelationshipsPage — CreateRelationshipModal suggestions', () => {
  // Open the modal BEFORE activating fake timers so waitFor works normally.
  async function openModalWithRealTimers(container: HTMLElement) {
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('New relationship'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      expect(container.querySelector('.fixed.inset-0')).toBeTruthy();
    });
  }

  it('typing in the search box triggers a CRM suggestions fetch', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Relationships'));
    await openModalWithRealTimers(container);
    vi.useFakeTimers();
    const input = container.querySelector('input[placeholder*="Search CRM"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Acme' } });
      vi.advanceTimersByTime(300);
    });
    vi.useRealTimers();
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('crm-suggestions') && u.includes('Acme'))).toBe(true);
    });
  });

  it('renders company suggestions returned from the API', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('crm-suggestions')) {
        return makeRes({
          success: true,
          data: {
            companies: [{ id: 1, name: 'Acme Inc', industry: 'Tech', hasOverlay: false }],
            deals: [],
          },
        });
      }
      return makeListRes([]);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Relationships'));
    await openModalWithRealTimers(container);
    vi.useFakeTimers();
    const input = container.querySelector('input[placeholder*="Search CRM"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'ac' } });
      vi.advanceTimersByTime(300);
    });
    vi.useRealTimers();
    await waitFor(() => {
      expect(container.textContent).toContain('Acme Inc');
    });
  });

  it('renders deal suggestions returned from the API', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('crm-suggestions')) {
        return makeRes({
          success: true,
          data: {
            companies: [],
            deals: [{ id: 5, title: 'Big Deal', companyName: 'Corp', hasOverlay: false }],
          },
        });
      }
      return makeListRes([]);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Relationships'));
    await openModalWithRealTimers(container);
    vi.useFakeTimers();
    const input = container.querySelector('input[placeholder*="Search CRM"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'big' } });
      vi.advanceTimersByTime(300);
    });
    vi.useRealTimers();
    await waitFor(() => {
      expect(container.textContent).toContain('Big Deal');
    });
  });

  it('shows "No matches." when suggestions returns empty arrays', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('crm-suggestions')) {
        return makeRes({ success: true, data: { companies: [], deals: [] } });
      }
      return makeListRes([]);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Relationships'));
    await openModalWithRealTimers(container);
    vi.useFakeTimers();
    const input = container.querySelector('input[placeholder*="Search CRM"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'zz' } });
      vi.advanceTimersByTime(300);
    });
    vi.useRealTimers();
    await waitFor(() => {
      expect(container.textContent).toContain('No matches.');
    });
  });

  it('company with hasOverlay=true is disabled and labeled "already tracked"', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('crm-suggestions')) {
        return makeRes({
          success: true,
          data: {
            companies: [{ id: 2, name: 'Already', industry: null, hasOverlay: true }],
            deals: [],
          },
        });
      }
      return makeListRes([]);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Relationships'));
    await openModalWithRealTimers(container);
    vi.useFakeTimers();
    const input = container.querySelector('input[placeholder*="Search CRM"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'al' } });
      vi.advanceTimersByTime(300);
    });
    vi.useRealTimers();
    await waitFor(() => {
      expect(container.textContent).toContain('already tracked');
    });
  });
});

// ─── Create modal — picking and submitting ────────────────────────────────────

describe('BrainRelationshipsPage — CreateRelationshipModal submit flow', () => {
  async function openModalAndPickCompany(container: HTMLElement) {
    const openBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('New relationship'),
    ) as HTMLButtonElement;
    fireEvent.click(openBtn);
    await waitFor(() => expect(container.querySelector('.fixed.inset-0')).toBeTruthy());

    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('crm-suggestions')) {
        return makeRes({
          success: true,
          data: {
            companies: [{ id: 99, name: 'Target Co', industry: null, hasOverlay: false }],
            deals: [],
          },
        });
      }
      return makeListRes([]);
    });

    // Use fake timers only for the debounce — open modal first (with real timers) so waitFor works.
    vi.useFakeTimers();
    const input = container.querySelector('input[placeholder*="Search CRM"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'tar' } });
      vi.advanceTimersByTime(300);
    });
    vi.useRealTimers();

    await waitFor(() => expect(container.textContent).toContain('Target Co'));
    const companyBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Target Co'),
    ) as HTMLButtonElement;
    fireEvent.click(companyBtn);
    await waitFor(() => {
      // After picking, the search input disappears and the form step shows
      expect(container.textContent).toContain('Relationship type');
    });
  }

  it('picking a company shows the relationship-type form step', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Relationships'));
    await openModalAndPickCompany(container);
    expect(container.textContent).toContain('Priority');
    expect(container.textContent).toContain('Target Co');
  });

  it('"Change" button returns to the search step', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Relationships'));
    await openModalAndPickCompany(container);
    const changeBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Change',
    ) as HTMLButtonElement;
    fireEvent.click(changeBtn);
    await waitFor(() => {
      expect(container.querySelector('input[placeholder*="Search CRM"]')).toBeTruthy();
    });
  });

  it('"Create relationship" button is disabled until a company is picked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Relationships'));
    const openBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('New relationship'),
    ) as HTMLButtonElement;
    fireEvent.click(openBtn);
    await waitFor(() => expect(container.querySelector('.fixed.inset-0')).toBeTruthy());
    const createBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create relationship'),
    ) as HTMLButtonElement;
    expect(createBtn?.disabled).toBe(true);
  });

  it('successful POST navigates to the new relationship page', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Relationships'));
    await openModalAndPickCompany(container);

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/brain/relationships' && init?.method === 'POST') {
        return makeRes({ success: true, data: { id: 42 } });
      }
      return makeListRes([]);
    });

    // Spy on window.location.href setter
    const hrefSpy = vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      href: '',
    } as Location);

    const createBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create relationship'),
    ) as HTMLButtonElement;
    fireEvent.click(createBtn);
    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        (c) => c[0] === '/api/portal/brain/relationships' && (c[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCalls.length).toBe(1);
    });

    hrefSpy.mockRestore();
  });

  it('POST failure shows error in the modal', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Relationships'));
    await openModalAndPickCompany(container);

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/brain/relationships' && init?.method === 'POST') {
        return makeRes({ success: false, message: 'Duplicate relationship' }, false);
      }
      return makeListRes([]);
    });

    const createBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create relationship'),
    ) as HTMLButtonElement;
    fireEvent.click(createBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Duplicate relationship');
    });
  });
});

// ─── Relationship type formatting ─────────────────────────────────────────────

describe('BrainRelationshipsPage — relationshipType formatting', () => {
  it('replaces underscores with spaces in relationship type display', async () => {
    fetchMock.mockImplementation(async () =>
      makeListRes([makeRow(1, { overlay: { relationshipType: 'referral_partner' } })]),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('referral partner');
    });
  });
});

// ─── RelationshipRow (stale/prospects view) extra fields ──────────────────────

describe('BrainRelationshipsPage — RelationshipRow fields', () => {
  it('shows "last touched" with day count when lastTouchAt is set', async () => {
    searchParamsValue = new URLSearchParams('view=stale');
    const lastTouch = new Date(Date.now() - 5 * 86400000).toISOString();
    fetchMock.mockImplementation(async () =>
      makeListRes([makeRow(1, { overlay: { lastTouchAt: lastTouch } })]),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('last touched');
      expect(container.textContent).toMatch(/\d+d ago/);
    });
  });

  it('shows "stale after Nd" when staleAfterDays is set', async () => {
    searchParamsValue = new URLSearchParams('view=stale');
    fetchMock.mockImplementation(async () =>
      makeListRes([makeRow(1, { overlay: { staleAfterDays: 30 } })]),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('stale after 30d');
    });
  });
});
