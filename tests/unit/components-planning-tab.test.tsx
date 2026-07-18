// @vitest-environment jsdom
/**
 * Unit tests for `components/portal/planning/PlanningTab.tsx` — the
 * consolidated Planning tab that merged the pre-consolidation
 * SprintPlanning.tsx (sprint list + card dock + dnd-kit drag/drop) and
 * BacklogTab.tsx (type filters + saved views) into one component, plus a
 * new Planner/Roadmap view-mode toggle that reuses ProjectRoadmapTab
 * unchanged.
 *
 * dnd-kit is mocked to inert primitives (same convention as the old
 * SprintPlanning test) since we don't drive real pointer drags here — this
 * suite covers render-from-fetch, the backlog type/sized filters, the
 * create-sprint submit flow, and the Planner/Roadmap toggle.
 *
 * ProjectRoadmapTab and SavedViewsPicker are mocked to lightweight stubs:
 * both do their own independent data fetching that's out of scope for this
 * component's tests (SavedViewsPicker hits /saved-views, ProjectRoadmapTab
 * re-fetches /sprints and renders an SVG timeline) — stubbing them keeps
 * this suite focused on PlanningTab's own state and matches the old test's
 * pattern of stubbing dependencies not under test.
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

vi.mock('@/lib/portal-utils', () => ({
  priorityColor: (p: string) => `prio-${p}`,
}));

// ProjectRoadmapTab does its own /sprints fetch + SVG timeline rendering —
// out of scope here. Stub renders a marker so the toggle test can assert the
// view actually switched.
vi.mock('@/components/portal/ProjectRoadmapTab', () => {
  const Rx = require('react');
  return {
    default: ({ projectId }: { projectId: number }) =>
      Rx.createElement('div', { 'data-testid': 'roadmap-stub' }, `Roadmap for project ${projectId}`),
  };
});

// SavedViewsPicker does its own /saved-views fetch — out of scope here.
vi.mock('@/components/portal/SavedViewsPicker', () => {
  const Rx = require('react');
  return {
    default: () => Rx.createElement('div', { 'data-testid': 'saved-views-stub' }),
  };
});

// ─── Fetch stub ─────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<any> };
const fetchMock = vi.fn<(url: string, init?: any) => Promise<FetchResp>>();

function makeRes(json: any, ok = true): FetchResp {
  return { ok, json: async () => json };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => makeRes({ success: true, data: { sprints: [], backlog: [] } }));
  // @ts-expect-error attach to global
  global.fetch = fetchMock;
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function card(overrides: Partial<{
  id: number;
  number: number | null;
  title: string;
  priority: string | null;
  sprintId: number | null;
  sprintOrder: number | null;
  columnId: number | null;
  columnName: string | null;
  columnIsDone: boolean | null;
  order: number;
  storyPoints: number | null;
  cardType: string;
  parentCardId: number | null;
  workflowState: string;
}> = {}) {
  return {
    id: 1,
    number: null,
    title: 'Card title',
    priority: null,
    sprintId: null,
    sprintOrder: null,
    columnId: 1,
    columnName: 'To Do',
    columnIsDone: false,
    order: 0,
    storyPoints: null,
    cardType: 'task',
    parentCardId: null,
    workflowState: 'todo',
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

async function renderAndWait(props: { projectId?: number; projectKey?: string | null; canEdit?: boolean } = {}) {
  const mod = await import('@/components/portal/planning/PlanningTab');
  const PlanningTab = mod.default;
  const utils = render(
    <PlanningTab
      projectId={props.projectId ?? 42}
      projectKey={props.projectKey ?? 'PRJ'}
      canEdit={props.canEdit ?? true}
    />,
  );
  await waitFor(() => {
    expect(utils.container.textContent || '').not.toContain('Loading sprints');
  });
  return utils;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PlanningTab — initial render', () => {
  it('renders the loading state before fetch resolves', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const mod = await import('@/components/portal/planning/PlanningTab');
    const PlanningTab = mod.default;
    const { container } = render(<PlanningTab projectId={42} projectKey="PRJ" canEdit />);
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

  it('hides the "New Sprint" button when canEdit=false', async () => {
    mockLoad({ sprints: [], backlog: [] });
    const { queryByText } = await renderAndWait({ canEdit: false });
    expect(queryByText('New Sprint')).toBeNull();
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

describe('PlanningTab — renders sprints + backlog from fetched dataset', () => {
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

  it('expands a sprint when its header is clicked', async () => {
    mockLoad({
      sprints: [sprint({ id: 1, status: 'planning', cards: [card({ id: 5, title: 'Toggle me' })] })],
      backlog: [],
    });
    const { container, getByText } = await renderAndWait();
    expect(container.textContent).not.toContain('Toggle me');
    act(() => {
      fireEvent.click(getByText('Sprint 1'));
    });
    expect(container.textContent).toContain('Toggle me');
  });
});

describe('PlanningTab — backlog panel filters', () => {
  it('filters dock cards by type via the type-filter chips', async () => {
    mockLoad({
      sprints: [],
      backlog: [
        card({ id: 1, title: 'A task card', cardType: 'task' }),
        card({ id: 2, title: 'A bug card', cardType: 'bug' }),
      ],
    });
    const { container, getByText } = await renderAndWait();
    expect(container.textContent).toContain('A task card');
    expect(container.textContent).toContain('A bug card');
    act(() => {
      fireEvent.click(getByText('Bug'));
    });
    expect(container.textContent).toContain('A bug card');
    expect(container.textContent).not.toContain('A task card');
  });

  it('resets the type filter back to "all" when the All chip is clicked', async () => {
    mockLoad({
      sprints: [],
      backlog: [
        card({ id: 1, title: 'A task card', cardType: 'task' }),
        card({ id: 2, title: 'A bug card', cardType: 'bug' }),
      ],
    });
    const { container, getByText } = await renderAndWait();
    act(() => fireEvent.click(getByText('Bug')));
    expect(container.textContent).not.toContain('A task card');
    act(() => fireEvent.click(getByText('All')));
    expect(container.textContent).toContain('A task card');
    expect(container.textContent).toContain('A bug card');
  });

  it('filters dock cards by the "Sized only" checkbox', async () => {
    mockLoad({
      sprints: [],
      backlog: [
        card({ id: 1, title: 'Sized card', storyPoints: 5 }),
        card({ id: 2, title: 'Unsized card', storyPoints: null }),
      ],
    });
    const { container, getByText } = await renderAndWait();
    expect(container.textContent).toContain('Sized card');
    expect(container.textContent).toContain('Unsized card');
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    act(() => {
      fireEvent.click(checkbox);
    });
    expect(container.textContent).toContain('Sized card');
    expect(container.textContent).not.toContain('Unsized card');
    // "Sized only" label itself renders regardless of state
    expect(getByText('Sized only')).toBeTruthy();
  });

  it('shows "No cards match the current filters." when the dock is empty', async () => {
    mockLoad({ sprints: [], backlog: [] });
    const { container } = await renderAndWait();
    expect(container.textContent).toContain('No cards match the current filters.');
  });
});

describe('PlanningTab — create sprint form', () => {
  it('toggles the create-sprint form open and closed', async () => {
    mockLoad({ sprints: [], backlog: [] });
    const { container, getByText } = await renderAndWait();
    expect(container.textContent).not.toContain('Create Sprint');
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
    const sprintListArea = container.querySelector('.grid.gap-4.lg\\:grid-cols-2 > div.space-y-4');
    expect(sprintListArea?.textContent || '').not.toContain('No add');
  });
});

describe('PlanningTab — Planner / Roadmap view toggle', () => {
  it('shows the Planner view by default', async () => {
    mockLoad({ sprints: [], backlog: [] });
    const { container, queryByTestId } = await renderAndWait();
    expect(container.textContent).toContain('No sprints yet');
    expect(queryByTestId('roadmap-stub')).toBeNull();
  });

  it('switches to the Roadmap view when the Roadmap toggle is clicked, and back', async () => {
    mockLoad({ sprints: [], backlog: [] });
    const { container, getByText, queryByTestId } = await renderAndWait();
    act(() => {
      fireEvent.click(getByText('Roadmap'));
    });
    expect(queryByTestId('roadmap-stub')).toBeTruthy();
    expect(container.textContent).not.toContain('No sprints yet');
    act(() => {
      fireEvent.click(getByText('Planner'));
    });
    expect(queryByTestId('roadmap-stub')).toBeNull();
    expect(container.textContent).toContain('No sprints yet');
  });

  it('hides the "New Sprint" button while in Roadmap view', async () => {
    mockLoad({ sprints: [], backlog: [] });
    const { getByText, queryByText } = await renderAndWait();
    act(() => fireEvent.click(getByText('Roadmap')));
    expect(queryByText('New Sprint')).toBeNull();
  });
});
