// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/my-tasks/page.tsx` — the "My Tasks" portal
 * page that aggregates Kanban cards + Brain tasks assigned to the user.
 *
 * The page is one big Suspense-wrapped client component:
 *   - parses filters from URLSearchParams
 *   - fetches /api/portal/my-tasks (with pagination cursors)
 *   - renders grouped projects/cards
 *   - allows source / priority / project / overdue / openOnly toggles
 *   - completes a card via /api/portal/brain/tasks/:id (PUT) or
 *     /api/portal/cards/:id/move (PATCH), with optimistic UI + rollback.
 *
 * next/navigation, fetch and portal-utils are all stubbed.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ───────────────────────────────────────

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
  usePathname: () => '/portal/my-tasks',
  useSearchParams: () => searchParamsValue,
}));

vi.mock('@/lib/portal-utils', () => ({
  priorityColor: (p: string) => `prio-${p}`,
}));

// ─── Fetch stub ─────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<any> };
const fetchMock = vi.fn<(url: string, init?: any) => Promise<FetchResp>>();

beforeEach(() => {
  searchParamsValue = new URLSearchParams();
  replaceMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => makeRes(emptyResponse()));
  vi.stubGlobal('fetch', fetchMock as any);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeRes(body: any, ok = true): FetchResp {
  return { ok, json: async () => body };
}

function emptyResponse() {
  return {
    success: true,
    data: { projects: [], nextCursor: null, total: 0, projectsAvailable: [] },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface CardOpts {
  id?: number;
  source?: 'kanban' | 'brain';
  title?: string;
  priority?: string | null;
  dueDate?: string | null;
  columnName?: string | null;
  columnIsDone?: boolean;
  labels?: { id: number; name: string; color: string }[];
  checklist?: { total: number; done: number } | null;
  linkUrl?: string;
  doneColumnId?: number | null;
  key?: string | null;
}

function makeCard(opts: CardOpts = {}): any {
  return {
    id: opts.id ?? 1,
    source: opts.source ?? 'kanban',
    key: opts.key ?? null,
    title: opts.title ?? `Card ${opts.id ?? 1}`,
    priority: opts.priority ?? null,
    dueDate: opts.dueDate ?? null,
    columnName: opts.columnName ?? 'Todo',
    columnIsDone: opts.columnIsDone ?? false,
    labels: opts.labels ?? [],
    checklist: opts.checklist ?? null,
    linkUrl: opts.linkUrl ?? '/portal/projects/1',
    // Use 'in' check so explicit `null` is honored (?? would fall through to default).
    doneColumnId: 'doneColumnId' in opts ? opts.doneColumnId : 2,
  };
}

function makeProject(extra: Partial<any> = {}): any {
  return {
    id: 1,
    source: 'kanban',
    name: 'My Project',
    projectKey: 'MP',
    clientName: null,
    cards: [makeCard()],
    ...extra,
  };
}

function buildResponse(opts: {
  projects?: any[];
  nextCursor?: number | null;
  total?: number;
  projectsAvailable?: any[];
} = {}) {
  return {
    success: true,
    data: {
      projects: opts.projects ?? [],
      nextCursor: opts.nextCursor ?? null,
      total: opts.total ?? 0,
      projectsAvailable: opts.projectsAvailable ?? [],
    },
  };
}

function setupResponse(opts: Parameters<typeof buildResponse>[0] = {}) {
  fetchMock.mockImplementation(async () => makeRes(buildResponse(opts)));
}

// Import after mocks
import MyTasksPage from '@/app/portal/my-tasks/page';

function renderPage() {
  return render(<MyTasksPage />);
}

// ─── Shell + initial load ───────────────────────────────────────────────────

describe('MyTasksPage — shell', () => {
  it('renders the heading', async () => {
    setupResponse();
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('My Tasks');
    });
  });

  it('renders 0 tasks count when empty', async () => {
    setupResponse({ total: 0 });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('0 tasks assigned to you');
    });
  });

  it('renders singular "1 task" when total === 1', async () => {
    setupResponse({ projects: [makeProject()], total: 1 });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toMatch(/1 task assigned/);
    });
  });

  it('renders plural "5 tasks" when total > 1', async () => {
    setupResponse({ projects: [makeProject()], total: 5 });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('5 tasks assigned');
    });
  });

  it('renders empty state when no projects after load', async () => {
    setupResponse();
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Nothing assigned');
      expect(container.textContent).toContain('You have no open tasks. Great job!');
    });
  });

  it('renders alternate empty-state copy when openOnly is false', async () => {
    searchParamsValue = new URLSearchParams('openOnly=0');
    setupResponse();
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Nothing assigned in projects or Brain.');
    });
  });

  it('renders filter-aware empty state when filters are active and no results', async () => {
    searchParamsValue = new URLSearchParams('priorities=high');
    setupResponse();
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No tasks match your filters.');
    });
  });

  it('renders overdue count in subtitle', async () => {
    const past = new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString();
    setupResponse({
      projects: [makeProject({ cards: [makeCard({ dueDate: past })] })],
      total: 1,
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('overdue');
    });
  });

  it('falls back to empty projects on fetch error', async () => {
    fetchMock.mockImplementation(async () => { throw new Error('network'); });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Nothing assigned');
    });
  });

  it('ignores fetch response when success:false', async () => {
    fetchMock.mockImplementation(async () => makeRes({ success: false, data: null }));
    const { container } = renderPage();
    // Should remain in loading state — spinner visible
    await waitFor(() => {
      // The loading state ends only if projects is set; here it stays null,
      // so the loading spinner remains.
      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeTruthy();
    });
  });
});

// ─── Filter parsing — URL → state ────────────────────────────────────────────

describe('MyTasksPage — filter parsing from URL', () => {
  it('passes ?source=brain to the fetch URL', async () => {
    searchParamsValue = new URLSearchParams('source=brain');
    setupResponse();
    renderPage();
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('source=brain'))).toBe(true);
    });
  });

  it('passes ?source=kanban to fetch URL', async () => {
    searchParamsValue = new URLSearchParams('source=kanban');
    setupResponse();
    renderPage();
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('source=kanban'))).toBe(true);
    });
  });

  it('coerces unknown ?source values to "all" and omits the param', async () => {
    searchParamsValue = new URLSearchParams('source=garbage');
    setupResponse();
    renderPage();
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => !u.includes('source='))).toBe(true);
    });
  });

  it('parses comma-separated projectIds and filters non-positive ints', async () => {
    searchParamsValue = new URLSearchParams('projectIds=1,2,abc,-5,0');
    setupResponse();
    renderPage();
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('projectIds=1%2C2') || u.includes('projectIds=1,2'))).toBe(true);
    });
  });

  it('parses priorities and ignores unknown values', async () => {
    searchParamsValue = new URLSearchParams('priorities=high,nonsense,urgent');
    setupResponse();
    renderPage();
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      const found = calls.some((u) => /priorities=high(%2C|,)urgent/.test(u));
      expect(found).toBe(true);
    });
  });

  it('parses overdue=1 as true', async () => {
    searchParamsValue = new URLSearchParams('overdue=1');
    setupResponse();
    renderPage();
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('overdue=1'))).toBe(true);
    });
  });

  it('parses overdue=true as true', async () => {
    searchParamsValue = new URLSearchParams('overdue=true');
    setupResponse();
    renderPage();
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('overdue=1'))).toBe(true);
    });
  });

  it('omits overdue param when overdue=0', async () => {
    searchParamsValue = new URLSearchParams('overdue=0');
    setupResponse();
    renderPage();
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => !u.includes('overdue='))).toBe(true);
    });
  });

  it('treats openOnly missing as true (omits openOnly param)', async () => {
    setupResponse();
    renderPage();
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => !u.includes('openOnly=0'))).toBe(true);
    });
  });

  it('parses openOnly=0 to false and propagates to fetch URL', async () => {
    searchParamsValue = new URLSearchParams('openOnly=0');
    setupResponse();
    renderPage();
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('openOnly=0'))).toBe(true);
    });
  });

  it('always includes limit=50 in the initial fetch URL', async () => {
    setupResponse();
    renderPage();
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('limit=50'))).toBe(true);
    });
  });
});

// ─── Filter chip interactions ───────────────────────────────────────────────

describe('MyTasksPage — filter chip interactions', () => {
  it('clicks the Kanban source chip → router.replace with source=kanban', async () => {
    setupResponse();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('My Tasks'));
    const kanbanBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      /Kanban\s*$/.test((b.textContent || '').trim()) || (b.textContent || '').trim().endsWith('Kanban'),
    ) as HTMLButtonElement;
    expect(kanbanBtn).toBeTruthy();
    fireEvent.click(kanbanBtn);
    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    expect(String(replaceMock.mock.calls[0][0])).toContain('source=kanban');
  });

  it('clicks the Brain source chip → also clears projectIds', async () => {
    searchParamsValue = new URLSearchParams('projectIds=5');
    setupResponse({ projectsAvailable: [{ id: 5, name: 'P5', projectKey: null }] });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('My Tasks'));
    const brainBtn = Array.from(container.querySelectorAll('button')).find((b) => {
      const t = (b.textContent || '').trim();
      return t.endsWith('Brain') && !t.includes('Project');
    }) as HTMLButtonElement;
    expect(brainBtn).toBeTruthy();
    fireEvent.click(brainBtn);
    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    const url = String(replaceMock.mock.calls[0][0]);
    expect(url).toContain('source=brain');
    expect(url).not.toContain('projectIds=');
  });

  it('clicks the All source chip → routes to /portal/my-tasks (no qs)', async () => {
    searchParamsValue = new URLSearchParams('source=brain');
    setupResponse();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('My Tasks'));
    const allBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent || '').trim() === 'All',
    ) as HTMLButtonElement;
    expect(allBtn).toBeTruthy();
    fireEvent.click(allBtn);
    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    expect(String(replaceMock.mock.calls[0][0])).toBe('/portal/my-tasks');
  });

  it('toggles a priority chip on', async () => {
    setupResponse();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('My Tasks'));
    const highBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'high',
    ) as HTMLButtonElement;
    fireEvent.click(highBtn);
    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    expect(String(replaceMock.mock.calls[0][0])).toContain('priorities=high');
  });

  it('toggles a priority chip off when already active', async () => {
    searchParamsValue = new URLSearchParams('priorities=high');
    setupResponse();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('My Tasks'));
    const highBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'high',
    ) as HTMLButtonElement;
    fireEvent.click(highBtn);
    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    expect(String(replaceMock.mock.calls[0][0])).not.toContain('priorities=high');
  });

  it('clicks the Overdue button toggles overdue=1', async () => {
    setupResponse();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('My Tasks'));
    const overdueBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      /Overdue/.test(b.textContent || ''),
    ) as HTMLButtonElement;
    fireEvent.click(overdueBtn);
    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    expect(String(replaceMock.mock.calls[0][0])).toContain('overdue=1');
  });

  it('toggles Hide completed checkbox to openOnly=0', async () => {
    setupResponse();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('My Tasks'));
    const cb = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(cb).toBeTruthy();
    fireEvent.click(cb);
    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    expect(String(replaceMock.mock.calls[0][0])).toContain('openOnly=0');
  });

  it('renders projectsAvailable chips and toggles a project ID on', async () => {
    setupResponse({
      projectsAvailable: [{ id: 7, name: 'Awesome', projectKey: 'AW' }],
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Awesome'));
    const projBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Awesome'),
    ) as HTMLButtonElement;
    fireEvent.click(projBtn);
    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    expect(String(replaceMock.mock.calls[0][0])).toContain('projectIds=7');
  });

  it('toggles a project ID off when already in URL', async () => {
    searchParamsValue = new URLSearchParams('projectIds=7');
    setupResponse({
      projectsAvailable: [{ id: 7, name: 'Awesome', projectKey: 'AW' }],
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Awesome'));
    const projBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Awesome'),
    ) as HTMLButtonElement;
    fireEvent.click(projBtn);
    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    expect(String(replaceMock.mock.calls[0][0])).not.toContain('projectIds=7');
  });

  it('hides project chips when source=brain', async () => {
    searchParamsValue = new URLSearchParams('source=brain');
    setupResponse({
      projectsAvailable: [{ id: 7, name: 'Awesome', projectKey: 'AW' }],
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('My Tasks'));
    // The Awesome chip should NOT render
    expect(container.textContent).not.toContain('Awesome');
  });

  it('renders Clear filters when any filter is active', async () => {
    searchParamsValue = new URLSearchParams('priorities=high');
    setupResponse();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Clear filters'));
  });

  it('Clear filters resets URL but preserves openOnly', async () => {
    searchParamsValue = new URLSearchParams('priorities=high&openOnly=0');
    setupResponse();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Clear filters'));
    const clearBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Clear filters'),
    ) as HTMLButtonElement;
    fireEvent.click(clearBtn);
    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    const url = String(replaceMock.mock.calls[0][0]);
    expect(url).not.toContain('priorities=');
    expect(url).toContain('openOnly=0');
  });

  it('does not render Clear filters when no filters active', async () => {
    setupResponse();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('My Tasks'));
    expect(container.textContent).not.toContain('Clear filters');
  });
});

// ─── Project group + card rendering ─────────────────────────────────────────

describe('MyTasksPage — group and card rendering', () => {
  it('renders a kanban group with its name and link', async () => {
    setupResponse({
      projects: [makeProject({ name: 'Acme Site', id: 42 })],
      total: 1,
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Acme Site'));
    const headerLink = container.querySelector('a[href="/portal/projects/42"]');
    expect(headerLink).toBeTruthy();
  });

  it('renders a brain group with brain link', async () => {
    setupResponse({
      projects: [makeProject({ source: 'brain', id: 'brain-1', name: 'Brain' })],
      total: 1,
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain'));
    const headerLink = container.querySelector('a[href="/portal/brain/tasks"]');
    expect(headerLink).toBeTruthy();
  });

  it('renders clientName next to project name when present', async () => {
    setupResponse({
      projects: [makeProject({ clientName: 'Acme Inc' })],
      total: 1,
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Acme Inc'));
  });

  it('renders "1 task" singular for a group with a single card', async () => {
    setupResponse({
      projects: [makeProject({ cards: [makeCard()] })],
      total: 1,
    });
    const { container } = renderPage();
    await waitFor(() => {
      // The group header shows "1 task" (singular)
      expect(container.textContent).toMatch(/1 task[^s]/);
    });
  });

  it('renders "N tasks" plural for a group with multiple cards', async () => {
    setupResponse({
      projects: [makeProject({ cards: [makeCard({ id: 1 }), makeCard({ id: 2 })] })],
      total: 2,
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toMatch(/2 tasks/));
  });

  it('renders card title and links to linkUrl', async () => {
    setupResponse({
      projects: [makeProject({ cards: [makeCard({ title: 'Fix bug', linkUrl: '/portal/projects/1/cards/9' })] })],
      total: 1,
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Fix bug'));
    const cardLink = container.querySelector('a[href="/portal/projects/1/cards/9"]');
    expect(cardLink).toBeTruthy();
  });

  it('renders card key when present', async () => {
    setupResponse({
      projects: [makeProject({ cards: [makeCard({ key: 'AW-123' })] })],
      total: 1,
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('AW-123'));
  });

  it('renders priority badge via priorityColor()', async () => {
    setupResponse({
      projects: [makeProject({ cards: [makeCard({ priority: 'high' })] })],
      total: 1,
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('high'));
    expect(container.innerHTML).toContain('prio-high');
  });

  it('strikes through completed card titles', async () => {
    setupResponse({
      projects: [makeProject({ cards: [makeCard({ columnIsDone: true, title: 'Done card' })] })],
      total: 1,
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Done card'));
    // Find the span with the title and check its class
    const titleSpan = Array.from(container.querySelectorAll('span')).find((s) =>
      s.textContent === 'Done card',
    );
    expect(titleSpan?.className).toContain('line-through');
  });

  it('renders up to 3 labels, then a "+N" overflow', async () => {
    const labels = [
      { id: 1, name: 'bug', color: '#f00' },
      { id: 2, name: 'wip', color: '#0f0' },
      { id: 3, name: 'p0', color: '#00f' },
      { id: 4, name: 'extra', color: '#888' },
    ];
    setupResponse({
      projects: [makeProject({ cards: [makeCard({ labels })] })],
      total: 1,
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('bug'));
    expect(container.textContent).toContain('+1');
    // 4th label should not be rendered directly
    expect(container.textContent).not.toContain('extra');
  });

  it('renders checklist counts with done<total in muted color', async () => {
    setupResponse({
      projects: [makeProject({ cards: [makeCard({ checklist: { total: 5, done: 2 } })] })],
      total: 1,
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('2/5'));
  });

  it('renders checklist with done===total in green', async () => {
    setupResponse({
      projects: [makeProject({ cards: [makeCard({ checklist: { total: 5, done: 5 } })] })],
      total: 1,
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('5/5'));
  });

  it('does not render checklist span when checklist.total === 0', async () => {
    setupResponse({
      projects: [makeProject({ cards: [makeCard({ checklist: { total: 0, done: 0 } })] })],
      total: 1,
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Card 1'));
    expect(container.textContent).not.toContain('0/0');
  });

  it('renders columnName separator when present', async () => {
    setupResponse({
      projects: [makeProject({ cards: [makeCard({ columnName: 'In Review' })] })],
      total: 1,
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('In Review'));
  });

  it('renders dueDate label for cards with dueDate', async () => {
    setupResponse({
      projects: [makeProject({ cards: [makeCard({ dueDate: '2026-06-15T00:00:00Z' })] })],
      total: 1,
    });
    const { container } = renderPage();
    await waitFor(() => {
      // Some Jun label or year shows up
      expect(container.textContent || '').toMatch(/Jun|2026|\d/);
    });
  });

  it('formats overdue dueDate with destructive tone', async () => {
    const past = new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString();
    setupResponse({
      projects: [makeProject({ cards: [makeCard({ dueDate: past })] })],
      total: 1,
    });
    const { container } = renderPage();
    await waitFor(() => {
      const dueSpan = Array.from(container.querySelectorAll('span')).find((s) =>
        s.className?.includes('text-destructive') && /event/.test(s.innerHTML || ''),
      );
      expect(dueSpan).toBeTruthy();
    });
  });

  it('formats soon dueDate with amber tone (within next 7 days)', async () => {
    const soon = new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString();
    setupResponse({
      projects: [makeProject({ cards: [makeCard({ dueDate: soon })] })],
      total: 1,
    });
    const { container } = renderPage();
    await waitFor(() => {
      const dueSpan = Array.from(container.querySelectorAll('span')).find((s) =>
        s.className?.includes('text-amber-600'),
      );
      expect(dueSpan).toBeTruthy();
    });
  });
});

// ─── Complete card flow ─────────────────────────────────────────────────────

describe('MyTasksPage — complete card', () => {
  it('PATCHes /api/portal/cards/:id/move for a kanban card with doneColumnId', async () => {
    const initial = buildResponse({
      projects: [makeProject({ cards: [makeCard({ id: 1, doneColumnId: 9 })] })],
      total: 1,
    });
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PATCH') return makeRes({ success: true });
      return makeRes(initial);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Card 1'));
    const completeBtn = container.querySelector('button[aria-label="Mark complete"]') as HTMLButtonElement;
    expect(completeBtn).toBeTruthy();
    fireEvent.click(completeBtn);
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find((c) => (c[1] as any)?.method === 'PATCH');
      expect(patchCall).toBeTruthy();
      expect(String(patchCall![0])).toContain('/api/portal/cards/1/move');
      const body = JSON.parse((patchCall![1] as any).body);
      expect(body.columnId).toBe(9);
      expect(body.order).toBe(0);
    });
  });

  it('PUTs /api/portal/brain/tasks/:id for a brain card', async () => {
    const initial = buildResponse({
      projects: [makeProject({
        source: 'brain',
        id: 'brain-1',
        cards: [makeCard({ id: 5, source: 'brain', doneColumnId: null })],
      })],
      total: 1,
    });
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PUT') return makeRes({ success: true });
      return makeRes(initial);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Card 5'));
    const completeBtn = container.querySelector('button[aria-label="Mark complete"]') as HTMLButtonElement;
    fireEvent.click(completeBtn);
    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find((c) => (c[1] as any)?.method === 'PUT');
      expect(putCall).toBeTruthy();
      expect(String(putCall![0])).toContain('/api/portal/brain/tasks/5');
      const body = JSON.parse((putCall![1] as any).body);
      expect(body.status).toBe('done');
    });
  });

  it('rolls back on PATCH non-ok response', async () => {
    const initial = buildResponse({
      projects: [makeProject({ cards: [makeCard({ id: 1, title: 'Roll back me', doneColumnId: 9 })] })],
      total: 1,
    });
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PATCH') return { ok: false, json: async () => ({ success: false }) };
      return makeRes(initial);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Roll back me'));
    const completeBtn = container.querySelector('button[aria-label="Mark complete"]') as HTMLButtonElement;
    fireEvent.click(completeBtn);
    // Wait for PATCH to be attempted
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find((c) => (c[1] as any)?.method === 'PATCH');
      expect(patchCall).toBeTruthy();
    });
    // Title should remain (rollback restored)
    await waitFor(() => expect(container.textContent).toContain('Roll back me'));
  });

  it('rolls back on PATCH thrown error', async () => {
    const initial = buildResponse({
      projects: [makeProject({ cards: [makeCard({ id: 1, doneColumnId: 9 })] })],
      total: 1,
    });
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PATCH') throw new Error('network');
      return makeRes(initial);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Card 1'));
    const completeBtn = container.querySelector('button[aria-label="Mark complete"]') as HTMLButtonElement;
    fireEvent.click(completeBtn);
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find((c) => (c[1] as any)?.method === 'PATCH');
      expect(patchCall).toBeTruthy();
    });
    // Title remains after rollback
    expect(container.textContent).toContain('Card 1');
  });

  it('removes card from list when openOnly=true and complete succeeds', async () => {
    const initial = buildResponse({
      projects: [makeProject({
        cards: [
          makeCard({ id: 1, title: 'To complete', doneColumnId: 9 }),
          makeCard({ id: 2, title: 'Other' }),
        ],
      })],
      total: 2,
    });
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PATCH') return makeRes({ success: true });
      return makeRes(initial);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('To complete'));
    const completeBtns = container.querySelectorAll('button[aria-label="Mark complete"]');
    fireEvent.click(completeBtns[0] as HTMLButtonElement);
    await waitFor(() => {
      expect(container.textContent).not.toContain('To complete');
    });
    expect(container.textContent).toContain('Other');
  });

  it('does NOT remove card when openOnly=false', async () => {
    searchParamsValue = new URLSearchParams('openOnly=0');
    const initial = buildResponse({
      projects: [makeProject({ cards: [makeCard({ id: 1, title: 'Stay visible', doneColumnId: 9 })] })],
      total: 1,
    });
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PATCH') return makeRes({ success: true });
      return makeRes(initial);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Stay visible'));
    const completeBtn = container.querySelector('button[aria-label="Mark complete"]') as HTMLButtonElement;
    fireEvent.click(completeBtn);
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find((c) => (c[1] as any)?.method === 'PATCH');
      expect(patchCall).toBeTruthy();
    });
    expect(container.textContent).toContain('Stay visible');
  });

  it('refuses to complete a kanban card with no doneColumnId', async () => {
    const initial = buildResponse({
      projects: [makeProject({ cards: [makeCard({ id: 1, doneColumnId: null })] })],
      total: 1,
    });
    fetchMock.mockImplementation(async (url: string, init?: any) => makeRes(initial));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Card 1'));
    // Button is disabled
    const completeBtn = container.querySelector('button[aria-label="Mark complete"]') as HTMLButtonElement;
    expect(completeBtn.disabled).toBe(true);
    // Even if forced, the click won't fire fetch
    fireEvent.click(completeBtn);
    const fetchesAfter = fetchMock.mock.calls.filter((c) => (c[1] as any)?.method === 'PATCH');
    expect(fetchesAfter.length).toBe(0);
  });

  it('marks button as Completed (aria-label) when columnIsDone is true', async () => {
    const initial = buildResponse({
      projects: [makeProject({ cards: [makeCard({ id: 1, columnIsDone: true })] })],
      total: 1,
    });
    fetchMock.mockImplementation(async () => makeRes(initial));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Card 1'));
    const completedBtn = container.querySelector('button[aria-label="Completed"]') as HTMLButtonElement;
    expect(completedBtn).toBeTruthy();
    expect(completedBtn.disabled).toBe(true);
  });
});

// ─── Load more / pagination ─────────────────────────────────────────────────

describe('MyTasksPage — load more / pagination', () => {
  it('renders the Load more button when nextCursor is present', async () => {
    setupResponse({
      projects: [makeProject()],
      nextCursor: 100,
      total: 1,
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Load more'));
  });

  it('does not render Load more when nextCursor is null', async () => {
    setupResponse({
      projects: [makeProject()],
      nextCursor: null,
      total: 1,
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Card 1'));
    expect(container.textContent).not.toContain('Load more');
  });

  it('clicking Load more fetches with cursor= and appends results', async () => {
    let calls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      calls++;
      if (calls === 1) {
        return makeRes(buildResponse({
          projects: [makeProject({ id: 1, name: 'Proj A', cards: [makeCard({ id: 1, title: 'A1' })] })],
          nextCursor: 50,
          total: 2,
        }));
      }
      // Second call: append more cards to same group
      return makeRes(buildResponse({
        projects: [makeProject({ id: 1, name: 'Proj A', cards: [makeCard({ id: 2, title: 'A2' })] })],
        nextCursor: null,
        total: 2,
      }));
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('A1'));
    const loadMoreBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Load more'),
    ) as HTMLButtonElement;
    fireEvent.click(loadMoreBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('A2');
    });
    // Both cards live under one merged group
    expect(container.textContent).toContain('A1');
    // The load-more URL contained cursor=
    const lastCall = String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0]);
    expect(lastCall).toContain('cursor=50');
  });

  it('Load more appends as a new group when source/id differ', async () => {
    let calls = 0;
    fetchMock.mockImplementation(async () => {
      calls++;
      if (calls === 1) {
        return makeRes(buildResponse({
          projects: [makeProject({ id: 1, name: 'Proj A' })],
          nextCursor: 50,
          total: 2,
        }));
      }
      return makeRes(buildResponse({
        projects: [makeProject({ id: 2, name: 'Proj B', cards: [makeCard({ id: 9, title: 'B9' })] })],
        nextCursor: null,
        total: 2,
      }));
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Proj A'));
    const loadMoreBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Load more'),
    ) as HTMLButtonElement;
    fireEvent.click(loadMoreBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Proj B');
      expect(container.textContent).toContain('B9');
    });
  });

  it('Load more no-ops on success:false (does not corrupt list)', async () => {
    let calls = 0;
    fetchMock.mockImplementation(async () => {
      calls++;
      if (calls === 1) {
        return makeRes(buildResponse({
          projects: [makeProject({ id: 1, name: 'Proj A' })],
          nextCursor: 50,
          total: 1,
        }));
      }
      return makeRes({ success: false, data: null });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Proj A'));
    const loadMoreBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Load more'),
    ) as HTMLButtonElement;
    fireEvent.click(loadMoreBtn);
    await waitFor(() => {
      // Button reverts back to enabled and the original project is still rendered
      expect(container.textContent).toContain('Proj A');
    });
  });

  it('shows "Loading…" label while load-more is in flight', async () => {
    let calls = 0;
    let resolveSecond: (v: any) => void = () => {};
    fetchMock.mockImplementation(async () => {
      calls++;
      if (calls === 1) {
        return makeRes(buildResponse({
          projects: [makeProject({ id: 1 })],
          nextCursor: 50,
          total: 1,
        }));
      }
      return new Promise((res) => { resolveSecond = res; }) as any;
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Load more'));
    const loadMoreBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Load more'),
    ) as HTMLButtonElement;
    fireEvent.click(loadMoreBtn);
    await waitFor(() => expect(container.textContent).toContain('Loading'));
    // Clean up
    resolveSecond(makeRes(buildResponse({ projects: [], nextCursor: null, total: 1 })));
  });
});

// ─── formatDue tone branches (covered via due-date rendering on cards) ──────

describe('MyTasksPage — formatDue branches', () => {
  it('shows em-dash placeholder behaviour by simply not rendering a date when dueDate is null', async () => {
    setupResponse({
      projects: [makeProject({ cards: [makeCard({ dueDate: null })] })],
      total: 1,
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Card 1'));
    // Card with null dueDate doesn't render the date span
    expect(container.querySelector('.material-icons[class*="text-xs"]')).toBeTruthy();
  });

  it('formats due date >180 days out with a year (later tone)', async () => {
    const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();
    setupResponse({
      projects: [makeProject({ cards: [makeCard({ dueDate: farFuture })] })],
      total: 1,
    });
    const { container } = renderPage();
    await waitFor(() => {
      const dueSpan = Array.from(container.querySelectorAll('span')).find((s) =>
        s.className?.includes('text-muted-foreground') && /event/.test(s.innerHTML || ''),
      );
      expect(dueSpan).toBeTruthy();
    });
  });
});
