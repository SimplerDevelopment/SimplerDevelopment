// @vitest-environment jsdom
/**
 * Unit tests for `components/portal/SprintPlanning.tsx` — the per-project
 * sprint planner with a sprint list (left column) and a card dock (right
 * column). Cards can be moved between backlog and sprints, sprints can be
 * created / started / completed / deleted, and dnd-kit handles drag-and-
 * drop reordering inside a sprint.
 *
 * dnd-kit is mocked to inert primitives that simply capture the drag
 * handlers so we can drive drag flow without a real pointer. framer-motion
 * is mocked through a Proxy passthrough in case any sub-component pulls it
 * in transitively.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede component import) ──────────────────────────────────

// dnd-kit core — capture DndContext handlers, stub all primitives
const dndHandlers: {
  onDragStart?: (e: any) => void;
  onDragEnd?: (e: any) => void;
  onDragCancel?: () => void;
} = {};

vi.mock('@dnd-kit/core', () => {
  const Rx = require('react');
  return {
    DndContext: ({ children, onDragStart, onDragEnd, onDragCancel }: any) => {
      dndHandlers.onDragStart = onDragStart;
      dndHandlers.onDragEnd = onDragEnd;
      dndHandlers.onDragCancel = onDragCancel;
      return Rx.createElement('div', { 'data-testid': 'dnd-context' }, children);
    },
    DragOverlay: ({ children }: any) =>
      Rx.createElement('div', { 'data-testid': 'drag-overlay' }, children),
    PointerSensor: function PointerSensor() {},
    useSensor: (s: any) => s,
    useSensors: (...s: any[]) => s,
    useDroppable: ({ id }: { id: string }) => ({
      setNodeRef: () => {},
      isOver: false,
      node: { current: null },
      over: null,
      active: null,
      rect: { current: null },
      _id: id,
    }),
    useDraggable: ({ id }: { id: string }) => ({
      setNodeRef: () => {},
      attributes: { 'data-draggable-id': id },
      listeners: {},
      isDragging: false,
    }),
  };
});

vi.mock('@dnd-kit/sortable', () => {
  const Rx = require('react');
  return {
    arrayMove: <T,>(arr: T[], from: number, to: number) => {
      const next = arr.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    },
    SortableContext: ({ children }: any) => Rx.createElement(Rx.Fragment, null, children),
    verticalListSortingStrategy: 'vertical',
    useSortable: ({ id }: { id: string }) => ({
      setNodeRef: () => {},
      attributes: { 'data-sortable-id': id },
      listeners: {},
      transform: null,
      transition: null,
      isDragging: false,
    }),
  };
});

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: { toString: () => '' },
    Transition: { toString: () => '' },
  },
}));

// framer-motion passthrough proxy (just in case)
vi.mock('framer-motion', () => {
  const Rx = require('react');
  const passthrough = new Proxy(
    {},
    {
      get: () => (props: any) => Rx.createElement('div', props, props?.children),
    },
  );
  return {
    motion: passthrough,
    AnimatePresence: ({ children }: any) => Rx.createElement(Rx.Fragment, null, children),
  };
});

vi.mock('@/lib/portal-utils', () => ({
  priorityColor: (p: string) => `prio-${p}`,
}));

// ─── Fetch stub ─────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<any> };
const fetchMock = vi.fn<(url: string, init?: any) => Promise<FetchResp>>();

function makeRes(json: any, ok = true): FetchResp {
  return { ok, json: async () => json };
}

beforeEach(() => {
  fetchMock.mockReset();
  // Default empty response
  fetchMock.mockImplementation(async () => makeRes({ success: true, data: { sprints: [], backlog: [] } }));
  // @ts-expect-error attach to global
  global.fetch = fetchMock;
  // confirm() always returns true for delete tests; can override per-test
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function card(overrides: Partial<{
  id: number;
  title: string;
  priority: string | null;
  sprintId: number | null;
  columnId: number | null;
  columnName: string | null;
  columnIsDone: boolean;
  order: number;
}> = {}) {
  return {
    id: 1,
    title: 'Card title',
    priority: null,
    sprintId: null,
    columnId: 1,
    columnName: 'To Do',
    columnIsDone: false,
    order: 0,
    ...overrides,
  };
}

function sprint(overrides: Partial<{
  id: number;
  name: string;
  goal: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  order: number;
  cards: ReturnType<typeof card>[];
}> = {}) {
  return {
    id: 100,
    name: 'Sprint 1',
    goal: null,
    startDate: null,
    endDate: null,
    status: 'planning',
    order: 0,
    cards: [],
    ...overrides,
  };
}

function mockLoad(data: { sprints: any[]; backlog: any[] }) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/api/portal/projects/') && url.endsWith('/sprints')) {
      return makeRes({ success: true, data });
    }
    return makeRes({ success: true });
  });
}

async function renderAndWait(props: { projectId?: number; canEdit?: boolean } = {}) {
  // Import lazily so each test gets a fresh module-level state (the
  // component holds no module-state itself, but this keeps mocks aligned).
  const mod = await import('@/components/portal/SprintPlanning');
  const SprintPlanning = mod.default;
  const utils = render(
    <SprintPlanning projectId={props.projectId ?? 42} canEdit={props.canEdit ?? true} />,
  );
  // Wait until the initial fetch resolves and the loading text disappears.
  await waitFor(() => {
    expect(utils.container.textContent || '').not.toContain('Loading sprints');
  });
  return utils;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('SprintPlanning — initial render', () => {
  it('renders the loading state before fetch resolves', async () => {
    // Keep the fetch pending so we see the loading branch.
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const mod = await import('@/components/portal/SprintPlanning');
    const SprintPlanning = mod.default;
    const { container } = render(<SprintPlanning projectId={42} canEdit />);
    expect(container.textContent).toContain('Loading sprints');
  });

  it('fetches sprints with the right URL on mount', async () => {
    mockLoad({ sprints: [], backlog: [] });
    await renderAndWait({ projectId: 7 });
    expect(fetchMock).toHaveBeenCalledWith('/api/portal/projects/7/sprints');
  });

  it('renders the empty state when no sprints exist', async () => {
    mockLoad({ sprints: [], backlog: [] });
    const { container } = await renderAndWait();
    expect(container.textContent).toContain('No sprints yet');
    expect(container.textContent).toContain('Create a sprint to start planning work.');
  });

  it('shows the read-only empty-state copy when canEdit=false', async () => {
    mockLoad({ sprints: [], backlog: [] });
    const { container } = await renderAndWait({ canEdit: false });
    expect(container.textContent).toContain('No sprints have been set up for this project yet.');
  });

  it('hides the "New Sprint" button when canEdit=false', async () => {
    mockLoad({ sprints: [], backlog: [] });
    const { queryByText } = await renderAndWait({ canEdit: false });
    expect(queryByText('New Sprint')).toBeNull();
  });

  it('shows the "New Sprint" button when canEdit=true', async () => {
    mockLoad({ sprints: [], backlog: [] });
    const { getByText } = await renderAndWait({ canEdit: true });
    expect(getByText('New Sprint')).toBeTruthy();
  });

  it('auto-expands the active sprint after load', async () => {
    mockLoad({
      sprints: [
        sprint({ id: 1, name: 'Active S', status: 'active', cards: [card({ id: 10, title: 'Auto-expanded card' })] }),
        sprint({ id: 2, name: 'Planning S', status: 'planning', cards: [card({ id: 20, title: 'Hidden card' })] }),
      ],
      backlog: [],
    });
    const { container } = await renderAndWait();
    expect(container.textContent).toContain('Auto-expanded card');
    expect(container.textContent).not.toContain('Hidden card');
  });
});

describe('SprintPlanning — sprint rendering', () => {
  it('renders sprint name, status badge, and card count', async () => {
    mockLoad({
      sprints: [sprint({ id: 1, name: 'Q1 Sprint', status: 'active', cards: [card({ id: 1 }), card({ id: 2 })] })],
      backlog: [],
    });
    const { container } = await renderAndWait();
    expect(container.textContent).toContain('Q1 Sprint');
    expect(container.textContent).toContain('Active');
    expect(container.textContent).toContain('2 cards');
  });

  it('uses singular "card" for sprints with exactly one card', async () => {
    mockLoad({
      sprints: [sprint({ id: 1, status: 'active', cards: [card({ id: 1 })] })],
      backlog: [],
    });
    const { container } = await renderAndWait();
    expect(container.textContent).toContain('1 card');
    expect(container.textContent).not.toContain('1 cards');
  });

  it('renders sprint goal in italics when present', async () => {
    mockLoad({
      sprints: [sprint({ id: 1, goal: 'Ship the planner', status: 'active' })],
      backlog: [],
    });
    const { container } = await renderAndWait();
    expect(container.textContent).toContain('Ship the planner');
  });

  it('renders sprint start/end dates when both present', async () => {
    mockLoad({
      sprints: [sprint({ id: 1, startDate: '2026-01-01', endDate: '2026-01-14', status: 'planning' })],
      backlog: [],
    });
    const { container } = await renderAndWait();
    expect(container.textContent).toMatch(/Jan/);
  });

  it('falls back to "planning" config for an unknown status', async () => {
    mockLoad({
      sprints: [sprint({ id: 1, status: 'mystery-status' })],
      backlog: [],
    });
    const { container } = await renderAndWait();
    expect(container.textContent).toContain('Planning');
  });

  it('shows done/total/percentage badge when sprint has cards', async () => {
    mockLoad({
      sprints: [sprint({
        id: 1,
        status: 'active',
        cards: [
          card({ id: 1, columnIsDone: true }),
          card({ id: 2, columnIsDone: false }),
        ],
      })],
      backlog: [],
    });
    const { container } = await renderAndWait();
    expect(container.textContent).toContain('1/2 done');
    expect(container.textContent).toContain('50%');
  });

  it('shows "Nd left" for an active sprint ending in the future', async () => {
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
    mockLoad({
      sprints: [sprint({ id: 1, status: 'active', endDate: future })],
      backlog: [],
    });
    const { container } = await renderAndWait();
    expect(container.textContent).toMatch(/\dd left/);
  });

  it('shows "Nd overdue" for an active sprint ending in the past', async () => {
    const past = new Date(Date.now() - 3 * 86_400_000).toISOString();
    mockLoad({
      sprints: [sprint({ id: 1, status: 'active', endDate: past })],
      backlog: [],
    });
    const { container } = await renderAndWait();
    expect(container.textContent).toMatch(/\dd overdue/);
  });
});

describe('SprintPlanning — toggle expand / collapse', () => {
  it('expands a sprint when its header is clicked', async () => {
    mockLoad({
      sprints: [sprint({ id: 1, status: 'planning', cards: [card({ id: 5, title: 'Toggle me' })] })],
      backlog: [],
    });
    const { container, getByText } = await renderAndWait();
    // Starts collapsed (planning never auto-expands)
    expect(container.textContent).not.toContain('Toggle me');
    act(() => {
      fireEvent.click(getByText('Sprint 1'));
    });
    expect(container.textContent).toContain('Toggle me');
  });

  it('collapses again when clicked twice', async () => {
    mockLoad({
      sprints: [sprint({ id: 1, name: 'CollapseSprint', status: 'active', cards: [card({ id: 5, title: 'Toggle me' })] })],
      backlog: [],
    });
    const { container } = await renderAndWait();
    expect(container.textContent).toContain('Toggle me');
    // The collapse-toggle button is the first button in the sprint header
    const toggleBtn = container.querySelector('button.flex.items-center.gap-3.flex-1') as HTMLButtonElement;
    expect(toggleBtn).toBeTruthy();
    act(() => {
      fireEvent.click(toggleBtn);
    });
    expect(container.textContent).not.toContain('Toggle me');
  });

  it('shows "Drop cards here" empty cards copy when sprint is open but empty', async () => {
    mockLoad({
      sprints: [sprint({ id: 1, status: 'active', cards: [] })],
      backlog: [],
    });
    const { container } = await renderAndWait();
    expect(container.textContent).toContain('Drop cards here');
  });

  it('shows read-only empty cards copy for sprint when canEdit=false', async () => {
    mockLoad({
      sprints: [sprint({ id: 1, status: 'active', cards: [] })],
      backlog: [],
    });
    const { container } = await renderAndWait({ canEdit: false });
    expect(container.textContent).toContain('No cards in this sprint.');
  });
});

describe('SprintPlanning — create sprint form', () => {
  it('toggles the create-sprint form open and closed', async () => {
    mockLoad({ sprints: [], backlog: [] });
    const { container, getByText } = await renderAndWait();
    expect(container.textContent).not.toContain('Create Sprint');
    act(() => fireEvent.click(getByText('New Sprint')));
    expect(container.textContent).toContain('Create Sprint');
  });

  it('closes the form when Cancel is clicked', async () => {
    mockLoad({ sprints: [], backlog: [] });
    const { container, getByText } = await renderAndWait();
    act(() => fireEvent.click(getByText('New Sprint')));
    expect(container.textContent).toContain('Create Sprint');
    act(() => fireEvent.click(getByText('Cancel')));
    expect(container.textContent).not.toContain('Create Sprint');
  });

  it('submits the form and posts the sprint to the API', async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (url.includes('/sprints') && (!init || init.method !== 'POST')) {
        return makeRes({ success: true, data: { sprints: [], backlog: [] } });
      }
      if (init?.method === 'POST') {
        return makeRes({ success: true, data: sprint({ id: 999, name: 'New One' }) });
      }
      return makeRes({ success: true });
    });
    const { container, getByText, getByPlaceholderText } = await renderAndWait();
    act(() => fireEvent.click(getByText('New Sprint')));
    fireEvent.change(getByPlaceholderText('Sprint 1'), { target: { value: 'New One' } });
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(submitBtn);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('New One');
    });
    const postCalls = fetchMock.mock.calls.filter(c => c[1]?.method === 'POST');
    expect(postCalls.length).toBeGreaterThan(0);
  });

  it('updates form fields on change', async () => {
    mockLoad({ sprints: [], backlog: [] });
    const { getByText, getByPlaceholderText } = await renderAndWait();
    act(() => fireEvent.click(getByText('New Sprint')));
    const nameInput = getByPlaceholderText('Sprint 1') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Typed name' } });
    expect(nameInput.value).toBe('Typed name');
    const goalInput = getByPlaceholderText('What does this sprint achieve?') as HTMLInputElement;
    fireEvent.change(goalInput, { target: { value: 'Goal' } });
    expect(goalInput.value).toBe('Goal');
  });

  it('does not add a sprint when the API responds with success=false', async () => {
    let firstCall = true;
    fetchMock.mockImplementation(async (url, init) => {
      if (url.includes('/sprints') && (!init || init.method !== 'POST') && firstCall) {
        firstCall = false;
        return makeRes({ success: true, data: { sprints: [], backlog: [] } });
      }
      if (init?.method === 'POST') {
        return makeRes({ success: false });
      }
      return makeRes({ success: true, data: { sprints: [], backlog: [] } });
    });
    const { container, getByText, getByPlaceholderText } = await renderAndWait();
    act(() => fireEvent.click(getByText('New Sprint')));
    fireEvent.change(getByPlaceholderText('Sprint 1'), { target: { value: 'No add' } });
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submitBtn);
    });
    // form stays open (showCreateForm still true) — but the new sprint name should NOT appear in the sprint list
    // The sprint list area is empty when there are no sprints; "No add" only appears in the input value, not as a sprint card
    const sprintListArea = container.querySelector('.space-y-4 > .space-y-4');
    expect(sprintListArea?.textContent || '').not.toContain('No add');
  });
});

describe('SprintPlanning — status updates', () => {
  it('renders "Start Sprint" button for a planning sprint', async () => {
    mockLoad({
      sprints: [sprint({ id: 1, status: 'planning' })],
      backlog: [],
    });
    const { getByText } = await renderAndWait();
    expect(getByText('Start Sprint')).toBeTruthy();
  });

  it('renders "Complete" button for an active sprint', async () => {
    mockLoad({
      sprints: [sprint({ id: 1, status: 'active' })],
      backlog: [],
    });
    const { getByText } = await renderAndWait();
    expect(getByText('Complete')).toBeTruthy();
  });

  it('calls PATCH /api/portal/sprints/:id when "Start Sprint" clicked', async () => {
    let firstCall = true;
    fetchMock.mockImplementation(async (url, init) => {
      if (firstCall && url.includes('/projects/')) {
        firstCall = false;
        return makeRes({ success: true, data: { sprints: [sprint({ id: 1, status: 'planning' })], backlog: [] } });
      }
      if (init?.method === 'PATCH') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true });
    });
    const { getByText } = await renderAndWait();
    await act(async () => {
      fireEvent.click(getByText('Start Sprint'));
    });
    const patchCalls = fetchMock.mock.calls.filter(c => c[1]?.method === 'PATCH');
    expect(patchCalls.length).toBe(1);
    expect(patchCalls[0][0]).toBe('/api/portal/sprints/1');
  });

  it('updates the sprint status in the UI after PATCH succeeds', async () => {
    let firstCall = true;
    fetchMock.mockImplementation(async (url, init) => {
      if (firstCall && url.includes('/projects/')) {
        firstCall = false;
        return makeRes({ success: true, data: { sprints: [sprint({ id: 1, status: 'planning' })], backlog: [] } });
      }
      if (init?.method === 'PATCH') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true });
    });
    const { container, getByText } = await renderAndWait();
    await act(async () => {
      fireEvent.click(getByText('Start Sprint'));
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Active');
    });
  });

  it('does not update status when API responds with success=false', async () => {
    let firstCall = true;
    fetchMock.mockImplementation(async (url, init) => {
      if (firstCall && url.includes('/projects/')) {
        firstCall = false;
        return makeRes({ success: true, data: { sprints: [sprint({ id: 1, status: 'planning' })], backlog: [] } });
      }
      if (init?.method === 'PATCH') {
        return makeRes({ success: false });
      }
      return makeRes({ success: true });
    });
    const { container, getByText } = await renderAndWait();
    await act(async () => {
      fireEvent.click(getByText('Start Sprint'));
    });
    expect(container.textContent).toContain('Planning');
  });
});

describe('SprintPlanning — delete sprint', () => {
  it('confirms before deleting and calls DELETE on confirm', async () => {
    let firstCall = true;
    fetchMock.mockImplementation(async (url, init) => {
      if (firstCall && url.includes('/projects/')) {
        firstCall = false;
        return makeRes({
          success: true,
          data: {
            sprints: [sprint({ id: 1, status: 'planning', cards: [card({ id: 10, sprintId: 1 })] })],
            backlog: [],
          },
        });
      }
      if (init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true });
    });
    const { container } = await renderAndWait();
    const deleteBtn = container.querySelector('[title="Delete sprint"]')!;
    await act(async () => {
      fireEvent.click(deleteBtn);
    });
    expect(global.confirm).toHaveBeenCalled();
    const delCalls = fetchMock.mock.calls.filter(c => c[1]?.method === 'DELETE');
    expect(delCalls.length).toBe(1);
  });

  it('skips the API call when user cancels the confirm dialog', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    mockLoad({ sprints: [sprint({ id: 1, status: 'planning' })], backlog: [] });
    const { container } = await renderAndWait();
    const deleteBtn = container.querySelector('[title="Delete sprint"]')!;
    await act(async () => {
      fireEvent.click(deleteBtn);
    });
    const delCalls = fetchMock.mock.calls.filter(c => c[1]?.method === 'DELETE');
    expect(delCalls.length).toBe(0);
  });

  it('moves sprint cards back to the backlog after delete', async () => {
    let firstCall = true;
    fetchMock.mockImplementation(async (url, init) => {
      if (firstCall && url.includes('/projects/')) {
        firstCall = false;
        return makeRes({
          success: true,
          data: {
            sprints: [sprint({
              id: 1,
              status: 'planning',
              cards: [card({ id: 50, sprintId: 1, title: 'Moved-back card' })],
            })],
            backlog: [],
          },
        });
      }
      if (init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true });
    });
    const { container } = await renderAndWait();
    const deleteBtn = container.querySelector('[title="Delete sprint"]')!;
    await act(async () => {
      fireEvent.click(deleteBtn);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Moved-back card');
    });
  });
});

describe('SprintPlanning — dock + search', () => {
  it('renders unassigned backlog cards in the dock', async () => {
    mockLoad({
      sprints: [],
      backlog: [
        card({ id: 1, title: 'Backlog A', priority: 'high' }),
        card({ id: 2, title: 'Backlog B', priority: 'low' }),
      ],
    });
    const { container } = await renderAndWait();
    expect(container.textContent).toContain('Backlog A');
    expect(container.textContent).toContain('Backlog B');
    expect(container.textContent).toContain('2 unassigned');
  });

  it('shows "No cards to show." when dock is empty', async () => {
    mockLoad({ sprints: [], backlog: [] });
    const { container } = await renderAndWait();
    expect(container.textContent).toContain('No cards to show.');
  });

  it('filters dock cards by title via the search box', async () => {
    mockLoad({
      sprints: [],
      backlog: [
        card({ id: 1, title: 'Login flow', priority: 'high' }),
        card({ id: 2, title: 'Signup flow', priority: 'low' }),
      ],
    });
    const { container, getByPlaceholderText } = await renderAndWait();
    expect(container.textContent).toContain('Login flow');
    fireEvent.change(getByPlaceholderText('Search cards…'), { target: { value: 'login' } });
    expect(container.textContent).toContain('Login flow');
    expect(container.textContent).not.toContain('Signup flow');
  });

  it('shows "No cards match your search." when the search filter excludes all', async () => {
    mockLoad({
      sprints: [],
      backlog: [card({ id: 1, title: 'Real card' })],
    });
    const { container, getByPlaceholderText } = await renderAndWait();
    fireEvent.change(getByPlaceholderText('Search cards…'), { target: { value: 'zzzz' } });
    expect(container.textContent).toContain('No cards match your search.');
  });

  it('searches by column name too', async () => {
    mockLoad({
      sprints: [],
      backlog: [
        card({ id: 1, title: 'Only-title', columnName: 'Special col' }),
        card({ id: 2, title: 'Other', columnName: 'Other col' }),
      ],
    });
    const { container, getByPlaceholderText } = await renderAndWait();
    fireEvent.change(getByPlaceholderText('Search cards…'), { target: { value: 'special' } });
    expect(container.textContent).toContain('Only-title');
    expect(container.textContent).not.toContain('Other');
  });

  it('sorts dock cards by priority then title', async () => {
    mockLoad({
      sprints: [],
      backlog: [
        card({ id: 1, title: 'Z low', priority: 'low' }),
        card({ id: 2, title: 'A urgent', priority: 'urgent' }),
        card({ id: 3, title: 'M medium', priority: 'medium' }),
      ],
    });
    const { container } = await renderAndWait();
    const text = container.textContent || '';
    const urgentIdx = text.indexOf('A urgent');
    const mediumIdx = text.indexOf('M medium');
    const lowIdx = text.indexOf('Z low');
    expect(urgentIdx).toBeLessThan(mediumIdx);
    expect(mediumIdx).toBeLessThan(lowIdx);
  });

  it('shows priority chip on dock cards', async () => {
    mockLoad({
      sprints: [],
      backlog: [card({ id: 1, title: 'Card', priority: 'high' })],
    });
    const { container } = await renderAndWait();
    expect(container.textContent).toContain('high');
  });

  it('shows column name suffix on dock cards', async () => {
    mockLoad({
      sprints: [],
      backlog: [card({ id: 1, title: 'Card', columnName: 'In Review' })],
    });
    const { container } = await renderAndWait();
    expect(container.textContent).toContain('In Review');
  });
});

describe('SprintPlanning — move card via select', () => {
  it('PATCHes /api/portal/cards/:id when sprint selector changes', async () => {
    let firstCall = true;
    fetchMock.mockImplementation(async (url, init) => {
      if (firstCall && url.includes('/projects/')) {
        firstCall = false;
        return makeRes({
          success: true,
          data: {
            sprints: [sprint({ id: 1, status: 'planning' })],
            backlog: [card({ id: 10, title: 'Moveable' })],
          },
        });
      }
      if (url.includes('/api/portal/cards/') && init?.method === 'PATCH') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true });
    });
    const { container } = await renderAndWait();
    const selects = container.querySelectorAll('select');
    // Find the dock card's select (only the backlog card renders one in this scenario)
    const dockSelect = Array.from(selects).find(s => s.value === '') as HTMLSelectElement;
    expect(dockSelect).toBeTruthy();
    await act(async () => {
      fireEvent.change(dockSelect, { target: { value: '1' } });
    });
    const patchCalls = fetchMock.mock.calls.filter(
      c => typeof c[0] === 'string' && c[0].startsWith('/api/portal/cards/'),
    );
    expect(patchCalls.length).toBe(1);
    expect(patchCalls[0][0]).toBe('/api/portal/cards/10');
  });

  it('does not call API when select value equals the current sprintId', async () => {
    mockLoad({
      sprints: [sprint({ id: 1, status: 'active', cards: [card({ id: 10, sprintId: 1, title: 'Stay' })] })],
      backlog: [],
    });
    const { container } = await renderAndWait();
    fetchMock.mockClear();
    const selects = container.querySelectorAll('select');
    const sprintSelect = Array.from(selects).find(s => s.value === '1') as HTMLSelectElement;
    expect(sprintSelect).toBeTruthy();
    await act(async () => {
      fireEvent.change(sprintSelect, { target: { value: '1' } });
    });
    const patchCalls = fetchMock.mock.calls.filter(
      c => typeof c[0] === 'string' && c[0].startsWith('/api/portal/cards/'),
    );
    expect(patchCalls.length).toBe(0);
  });
});

describe('SprintPlanning — drag-and-drop handlers', () => {
  it('reorders cards within a sprint when dropped on another sprint-card in the same sprint', async () => {
    mockLoad({
      sprints: [sprint({
        id: 1,
        status: 'active',
        cards: [
          card({ id: 10, sprintId: 1, title: 'First' }),
          card({ id: 20, sprintId: 1, title: 'Second' }),
        ],
      })],
      backlog: [],
    });
    const { container } = await renderAndWait();
    expect(dndHandlers.onDragEnd).toBeTypeOf('function');
    await act(async () => {
      dndHandlers.onDragEnd!({
        active: {
          id: 'sprint-card-10',
          data: {
            current: {
              card: { id: 10, title: 'First', sprintId: 1 },
              from: 'sprint',
              sprintId: 1,
            },
          },
        },
        over: {
          id: 'sprint-card-20',
          data: {
            current: {
              card: { id: 20, title: 'Second', sprintId: 1 },
              sprintId: 1,
            },
          },
        },
      });
    });
    const reorderCalls = fetchMock.mock.calls.filter(
      c => typeof c[0] === 'string' && c[0].includes('/card-order'),
    );
    expect(reorderCalls.length).toBe(1);
    expect(reorderCalls[0][0]).toBe('/api/portal/sprints/1/card-order');
    expect(container).toBeTruthy();
  });

  it('moves a card to a new sprint when dropped on a different sprint container', async () => {
    mockLoad({
      sprints: [
        sprint({ id: 1, status: 'active', cards: [] }),
        sprint({ id: 2, status: 'planning', cards: [] }),
      ],
      backlog: [card({ id: 10, title: 'Dragged' })],
    });
    await renderAndWait();
    fetchMock.mockClear();
    fetchMock.mockImplementation(async () => makeRes({ success: true }));
    await act(async () => {
      dndHandlers.onDragEnd!({
        active: {
          id: 'card-10',
          data: {
            current: {
              card: { id: 10, title: 'Dragged', sprintId: null },
              from: 'dock',
            },
          },
        },
        over: {
          id: 'drop-sprint-1',
          data: { current: { sprintId: 1 } },
        },
      });
    });
    const patchCalls = fetchMock.mock.calls.filter(
      c => typeof c[0] === 'string' && c[0].startsWith('/api/portal/cards/'),
    );
    expect(patchCalls.length).toBe(1);
  });

  it('returns early if drop has no over target', async () => {
    mockLoad({ sprints: [], backlog: [] });
    await renderAndWait();
    fetchMock.mockClear();
    await act(async () => {
      dndHandlers.onDragEnd!({ active: { id: 'card-1', data: { current: {} } }, over: null });
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns early if active has no card data', async () => {
    mockLoad({ sprints: [], backlog: [] });
    await renderAndWait();
    fetchMock.mockClear();
    await act(async () => {
      dndHandlers.onDragEnd!({
        active: { id: 'card-x', data: { current: {} } },
        over: { id: 'drop-backlog', data: { current: { sprintId: null } } },
      });
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('captures the dragged card on onDragStart and renders it in the overlay', async () => {
    mockLoad({
      sprints: [],
      backlog: [card({ id: 99, title: 'Overlay card', priority: 'urgent' })],
    });
    const { container } = await renderAndWait();
    await act(async () => {
      dndHandlers.onDragStart!({
        active: {
          id: 'card-99',
          data: {
            current: {
              card: { id: 99, title: 'Overlay card', priority: 'urgent', sprintId: null },
              from: 'dock',
            },
          },
        },
      });
    });
    const overlay = container.querySelector('[data-testid="drag-overlay"]')!;
    expect(overlay.textContent).toContain('Overlay card');
    expect(overlay.textContent).toContain('urgent');
  });

  it('clears the active drag when onDragCancel fires', async () => {
    mockLoad({
      sprints: [],
      backlog: [card({ id: 99, title: 'Will cancel' })],
    });
    const { container } = await renderAndWait();
    await act(async () => {
      dndHandlers.onDragStart!({
        active: {
          id: 'card-99',
          data: {
            current: {
              card: { id: 99, title: 'Will cancel', sprintId: null },
              from: 'dock',
            },
          },
        },
      });
    });
    await act(async () => {
      dndHandlers.onDragCancel!();
    });
    const overlay = container.querySelector('[data-testid="drag-overlay"]')!;
    expect(overlay.textContent).not.toContain('Will cancel');
  });

  it('does not reorder when dropping a card on itself', async () => {
    mockLoad({
      sprints: [sprint({
        id: 1,
        status: 'active',
        cards: [card({ id: 10, sprintId: 1, title: 'A' })],
      })],
      backlog: [],
    });
    await renderAndWait();
    fetchMock.mockClear();
    await act(async () => {
      dndHandlers.onDragEnd!({
        active: {
          id: 'sprint-card-10',
          data: { current: { card: { id: 10, sprintId: 1 }, from: 'sprint', sprintId: 1 } },
        },
        over: {
          id: 'sprint-card-10',
          data: { current: { card: { id: 10, sprintId: 1 }, sprintId: 1 } },
        },
      });
    });
    // Reorder shouldn't fire because overData.card.id === card.id is filtered
    const reorderCalls = fetchMock.mock.calls.filter(
      c => typeof c[0] === 'string' && c[0].includes('/card-order'),
    );
    expect(reorderCalls.length).toBe(0);
  });
});
