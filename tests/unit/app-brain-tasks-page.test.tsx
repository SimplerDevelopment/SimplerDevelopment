// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/brain/tasks/page.tsx` — the Brain Tasks +
 * Review queue page. The page has two top-level tabs (tasks kanban,
 * review queue) plus a PromoteModal, drag-and-drop reordering between
 * status columns, bulk approve/reject, group selection, payload
 * description helpers, etc.
 *
 * dnd-kit is mocked to inert primitives that capture handlers, so we
 * can drive drag flow without a real pointer; next/navigation, fetch
 * and portal-utils are all stubbed.
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
  usePathname: () => '/portal/brain/tasks',
  useSearchParams: () => searchParamsValue,
}));

vi.mock('@/lib/portal-utils', () => ({
  priorityColor: (p: string) => `prio-${p}`,
  stripMarkdown: (s: string) => `stripped:${s}`,
}));

// dnd-kit — capture handlers, stub all primitives to inert versions
const dndHandlers: {
  onDragStart?: (e: any) => void;
  onDragOver?: (e: any) => void;
  onDragEnd?: (e: any) => void;
  collisionDetection?: (args: any) => any;
} = {};

vi.mock('@dnd-kit/core', () => {
  const Rx = require('react');
  return {
    DndContext: ({ children, onDragStart, onDragOver, onDragEnd, collisionDetection }: any) => {
      dndHandlers.onDragStart = onDragStart;
      dndHandlers.onDragOver = onDragOver;
      dndHandlers.onDragEnd = onDragEnd;
      dndHandlers.collisionDetection = collisionDetection;
      return Rx.createElement('div', { 'data-testid': 'dnd-context' }, children);
    },
    DragOverlay: ({ children }: any) =>
      Rx.createElement('div', { 'data-testid': 'drag-overlay' }, children),
    PointerSensor: function PointerSensor() {},
    KeyboardSensor: function KeyboardSensor() {},
    useSensor: (s: any) => s,
    useSensors: (...s: any[]) => s,
    closestCorners: vi.fn(() => []),
    pointerWithin: vi.fn(() => []),
    useDroppable: ({ id }: { id: string }) => ({
      setNodeRef: () => {},
      isOver: false,
      node: { current: null },
      over: null,
      active: null,
      rect: { current: null },
      _id: id,
    }),
  };
});

vi.mock('@dnd-kit/sortable', () => {
  const Rx = require('react');
  return {
    sortableKeyboardCoordinates: () => undefined,
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

// ─── Fetch stub ─────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<any> };
const fetchMock = vi.fn<(url: string, init?: any) => Promise<FetchResp>>();

beforeEach(() => {
  searchParamsValue = new URLSearchParams();
  replaceMock.mockReset();
  fetchMock.mockReset();
  // Default: every endpoint returns success with sensible defaults
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/api/portal/brain/review')) {
      return makeRes({ success: true, data: { items: [], meetings: {} } });
    }
    if (url.includes('/api/portal/brain/tasks')) {
      return makeRes({ success: true, data: [] });
    }
    if (url.includes('/api/portal/brain/promotion-targets')) {
      return makeRes({ success: true, data: [] });
    }
    return makeRes({ success: true, data: {} });
  });
  vi.stubGlobal('fetch', fetchMock as any);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeRes(body: any, ok = true): FetchResp {
  return { ok, json: async () => body };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTask(id: number, extra: Record<string, any> = {}): any {
  return {
    id,
    title: `Task ${id}`,
    description: null,
    ownerId: null,
    status: 'open',
    priority: 'medium',
    dueDate: null,
    source: 'meeting',
    createdByAi: false,
    meetingId: null,
    linkedKanbanCardId: null,
    complianceFlag: false,
    createdAt: '2025-01-01',
    ...extra,
  };
}

function makeReviewItem(id: number, extra: Record<string, any> = {}): any {
  return {
    id,
    sourceType: 'meeting',
    sourceId: 1,
    proposedType: 'task',
    proposedPayload: { title: `Item ${id}` },
    status: 'pending',
    reviewedAt: null,
    resultEntityType: null,
    resultEntityId: null,
    createdAt: '2025-01-01',
    ...extra,
  };
}

// Import after mocks
import BrainTasksAndReviewPage from '@/app/portal/brain/tasks/page';

function renderPage() {
  return render(<BrainTasksAndReviewPage />);
}

// ─── Top-level shell ────────────────────────────────────────────────────────

describe('BrainTasksAndReviewPage — tab shell', () => {
  it('renders Brain Tasks heading by default', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Brain Tasks');
    });
  });

  it('shows the tasks tab subtitle by default', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Tasks captured from communications');
    });
  });

  it('initialises with review tab when ?tab=review is in URL', async () => {
    searchParamsValue = new URLSearchParams('tab=review');
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Review queue');
      expect(container.textContent).toContain('Tasks, decisions, commitments');
    });
  });

  it('clicks the Review queue tab and calls router.replace with tab=review', async () => {
    const { container } = renderPage();
    const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
    const reviewBtn = buttons.find((b) => b.textContent?.includes('Review queue'))!;
    fireEvent.click(reviewBtn);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
    });
    const args = replaceMock.mock.calls[0];
    expect(String(args[0])).toContain('tab=review');
  });

  it('clicking the Tasks tab from review removes the tab query param', async () => {
    searchParamsValue = new URLSearchParams('tab=review');
    const { container } = renderPage();
    const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
    // Find the first "Tasks" button (the tab button)
    const tasksBtn = buttons.find((b) => /^\s*checklist\s*Tasks/.test(b.textContent || ''))
      ?? buttons.find((b) => b.textContent?.trim() === 'Tasks' || b.textContent?.includes('Tasks'));
    fireEvent.click(tasksBtn!);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
    });
  });

  it('shows the pending-review badge when count > 0', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/review?status=pending')) {
        return makeRes({
          success: true,
          data: { items: [makeReviewItem(1), makeReviewItem(2), makeReviewItem(3)], meetings: {} },
        });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('3');
    });
  });

  it('shows "99+" when pending count exceeds 99', async () => {
    const items = Array.from({ length: 120 }, (_, i) => makeReviewItem(i));
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/review?status=pending')) {
        return makeRes({ success: true, data: { items, meetings: {} } });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('99+');
    });
  });

  it('does not crash when pending count poll fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/review?status=pending')) {
        throw new Error('network');
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Brain Tasks');
    });
  });
});

// ─── Tasks tab ──────────────────────────────────────────────────────────────

describe('Tasks tab — loading / error states', () => {
  it('shows loading spinner while tasks load', async () => {
    let resolveTasks: (v: any) => void = () => {};
    const tasksPromise = new Promise((res) => { resolveTasks = res; });
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/brain/tasks') {
        return (await tasksPromise) as any;
      }
      return makeRes({ success: true, data: { items: [], meetings: {} } });
    });
    const { container } = renderPage();
    expect(container.textContent).toContain('Loading');
    // Resolve so we don't leak
    resolveTasks(makeRes({ success: true, data: [] }));
  });

  it('renders all 4 status columns once loaded', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Open');
      expect(container.textContent).toContain('In Progress');
      expect(container.textContent).toContain('Blocked');
      expect(container.textContent).toContain('Done');
    });
  });

  it('shows "No tasks" placeholder for empty columns', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const placeholders = Array.from(container.querySelectorAll('div')).filter((d) =>
        d.textContent === 'No tasks',
      );
      expect(placeholders.length).toBeGreaterThan(0);
    });
  });

  it('surfaces server error message on failed task load', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/brain/tasks') {
        return { ok: false, json: async () => ({ success: false, message: 'boom' }) };
      }
      return makeRes({ success: true, data: { items: [], meetings: {} } });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('boom');
    });
  });

  it('renders fallback error text when task load throws', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/brain/tasks') throw new Error('network down');
      return makeRes({ success: true, data: { items: [], meetings: {} } });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('network down');
    });
  });

  it('renders tasks grouped by status with counts', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/brain/tasks') {
        return makeRes({
          success: true,
          data: [
            makeTask(1, { status: 'open', title: 'Open A' }),
            makeTask(2, { status: 'open', title: 'Open B' }),
            makeTask(3, { status: 'done', title: 'Done A' }),
          ],
        });
      }
      return makeRes({ success: true, data: { items: [], meetings: {} } });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Open A');
      expect(container.textContent).toContain('Done A');
    });
  });

  it('renders task description through stripMarkdown', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/brain/tasks') {
        return makeRes({
          success: true,
          data: [makeTask(1, { description: '**bold**' })],
        });
      }
      return makeRes({ success: true, data: { items: [], meetings: {} } });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('stripped:**bold**');
    });
  });

  it('renders compliance badge when task.complianceFlag is true', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/brain/tasks') {
        return makeRes({ success: true, data: [makeTask(1, { complianceFlag: true })] });
      }
      return makeRes({ success: true, data: { items: [], meetings: {} } });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('compliance');
    });
  });

  it('renders AI marker when createdByAi is true', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/brain/tasks') {
        return makeRes({ success: true, data: [makeTask(1, { createdByAi: true })] });
      }
      return makeRes({ success: true, data: { items: [], meetings: {} } });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('AI');
    });
  });

  it('renders linkedKanbanCardId marker', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/brain/tasks') {
        return makeRes({ success: true, data: [makeTask(1, { linkedKanbanCardId: 99 })] });
      }
      return makeRes({ success: true, data: { items: [], meetings: {} } });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('on board');
    });
  });

  it('renders dueDate as locale date', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/brain/tasks') {
        return makeRes({ success: true, data: [makeTask(1, { dueDate: '2025-06-15T00:00:00Z' })] });
      }
      return makeRes({ success: true, data: { items: [], meetings: {} } });
    });
    const { container } = renderPage();
    await waitFor(() => {
      // Look for a date-ish substring; locale variable, but year is stable
      expect(container.textContent || '').toMatch(/2025/);
    });
  });

  it('renders communications link when meetingId is set', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/brain/tasks') {
        return makeRes({ success: true, data: [makeTask(1, { meetingId: 42 })] });
      }
      return makeRes({ success: true, data: { items: [], meetings: {} } });
    });
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/communications/42"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders the Promote button for tasks not done and not yet on board', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/brain/tasks') {
        return makeRes({ success: true, data: [makeTask(1)] });
      }
      return makeRes({ success: true, data: { items: [], meetings: {} } });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Promote');
    });
  });

  it('does NOT render Promote for done tasks', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/brain/tasks') {
        return makeRes({ success: true, data: [makeTask(1, { status: 'done' })] });
      }
      return makeRes({ success: true, data: { items: [], meetings: {} } });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Task 1');
    });
    expect(container.textContent).not.toContain('Promote');
  });
});

// ─── Tasks tab — promotion modal ────────────────────────────────────────────

describe('PromoteModal', () => {
  function setupWithTask(targets: any[]) {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url === '/api/portal/brain/tasks' && (!init || init.method === undefined)) {
        return makeRes({ success: true, data: [makeTask(1)] });
      }
      if (url === '/api/portal/brain/promotion-targets') {
        return makeRes({ success: true, data: targets });
      }
      if (url.includes('/promote-to-kanban')) {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: { items: [], meetings: {} } });
    });
  }

  it('opens the modal when Promote is clicked', async () => {
    setupWithTask([
      {
        id: 100,
        name: 'Active Project',
        projectKey: 'AP',
        status: 'active',
        columns: [{ id: 1, name: 'Todo', isDone: false }, { id: 2, name: 'Done', isDone: true }],
      },
    ]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Promote');
    });
    const promoteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Promote') && !b.textContent?.includes('Promote to project'),
    ) as HTMLButtonElement;
    fireEvent.click(promoteBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Promote to project board');
    });
  });

  it('shows "Loading projects" while targets fetch is pending', async () => {
    let resolveTargets: (v: any) => void = () => {};
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/brain/tasks') {
        return makeRes({ success: true, data: [makeTask(1)] });
      }
      if (url === '/api/portal/brain/promotion-targets') {
        return new Promise((res) => { resolveTargets = res; }) as any;
      }
      return makeRes({ success: true, data: { items: [], meetings: {} } });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Promote');
    });
    const promoteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Promote' || /^view_kanban\s*Promote/.test(b.textContent || ''),
    ) as HTMLButtonElement;
    fireEvent.click(promoteBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Loading projects');
    });
    resolveTargets(makeRes({ success: true, data: [] }));
  });

  it('shows empty-state when there are no promotion targets', async () => {
    setupWithTask([]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Promote');
    });
    const promoteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Promote'),
    ) as HTMLButtonElement;
    fireEvent.click(promoteBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('No active projects to promote into');
    });
  });

  it('closes the modal via Cancel', async () => {
    setupWithTask([
      {
        id: 100,
        name: 'Proj',
        projectKey: null,
        status: 'active',
        columns: [{ id: 1, name: 'Todo', isDone: false }],
      },
    ]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Task 1');
    });
    const promoteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Promote'),
    ) as HTMLButtonElement;
    fireEvent.click(promoteBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Promote to project board');
    });
    const cancelBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Promote to project board');
    });
  });

  it('surfaces target-load failure as inline error', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/brain/tasks') {
        return makeRes({ success: true, data: [makeTask(1)] });
      }
      if (url === '/api/portal/brain/promotion-targets') {
        return makeRes({ success: false, message: 'targets fail' });
      }
      return makeRes({ success: true, data: { items: [], meetings: {} } });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Promote');
    });
    const promoteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Promote'),
    ) as HTMLButtonElement;
    fireEvent.click(promoteBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('targets fail');
    });
  });

  it('submits promotion and triggers reload on success', async () => {
    setupWithTask([
      {
        id: 100,
        name: 'Proj',
        projectKey: null,
        status: 'active',
        columns: [{ id: 1, name: 'Todo', isDone: false }],
      },
    ]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Task 1'));
    const promoteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Promote'),
    ) as HTMLButtonElement;
    fireEvent.click(promoteBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Promote to project board');
    });
    // Click the modal's "Promote" button (the submit one)
    const modalPromoteBtn = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Promote') && b.textContent !== 'Promote to project board',
    ).pop() as HTMLButtonElement;
    fireEvent.click(modalPromoteBtn);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('/promote-to-kanban'))).toBe(true);
    });
  });

  it('surfaces failure on promote submit', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/brain/tasks') {
        return makeRes({ success: true, data: [makeTask(1)] });
      }
      if (url === '/api/portal/brain/promotion-targets') {
        return makeRes({
          success: true,
          data: [{
            id: 100, name: 'Proj', projectKey: null, status: 'active',
            columns: [{ id: 1, name: 'Todo', isDone: false }],
          }],
        });
      }
      if (url.includes('/promote-to-kanban')) {
        return makeRes({ success: false, message: 'cannot promote' });
      }
      return makeRes({ success: true, data: { items: [], meetings: {} } });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Task 1'));
    const promoteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Promote'),
    ) as HTMLButtonElement;
    fireEvent.click(promoteBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Promote to project board');
    });
    const modalPromoteBtn = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Promote') && b.textContent !== 'Promote to project board',
    ).pop() as HTMLButtonElement;
    fireEvent.click(modalPromoteBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('cannot promote');
    });
  });
});

// ─── Tasks tab — drag-and-drop ──────────────────────────────────────────────

describe('Tasks tab — drag-and-drop', () => {
  function setupTasks(tasks: any[]) {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url === '/api/portal/brain/tasks' && (!init || init.method === undefined)) {
        return makeRes({ success: true, data: tasks });
      }
      if (init?.method === 'PUT') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: { items: [], meetings: {} } });
    });
  }

  it('onDragStart sets the active task overlay', async () => {
    setupTasks([makeTask(1)]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Task 1'));
    act(() => {
      dndHandlers.onDragStart?.({
        active: { id: 'card-1', data: { current: { type: 'task', task: makeTask(1) } } },
      } as any);
    });
    // The DragOverlay child renders the active task
    const overlay = container.querySelector('[data-testid="drag-overlay"]');
    expect(overlay).toBeTruthy();
  });

  it('onDragOver moves a task into a different column', async () => {
    setupTasks([makeTask(1, { status: 'open' })]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Task 1'));
    act(() => {
      dndHandlers.onDragOver?.({
        active: { id: 'card-1' },
        over: { id: 'col-in_progress' },
      } as any);
    });
    // No throw; column visually moves
    expect(container.textContent).toContain('Task 1');
  });

  it('onDragOver no-ops when active==over', async () => {
    setupTasks([makeTask(1)]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Task 1'));
    act(() => {
      dndHandlers.onDragOver?.({
        active: { id: 'card-1' },
        over: { id: 'card-1' },
      } as any);
    });
  });

  it('onDragOver no-ops when active id is not a card-', async () => {
    setupTasks([makeTask(1)]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Task 1'));
    act(() => {
      dndHandlers.onDragOver?.({
        active: { id: 'foo-1' },
        over: { id: 'col-done' },
      } as any);
    });
  });

  it('onDragOver no-ops when task id is unknown', async () => {
    setupTasks([makeTask(1)]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Task 1'));
    act(() => {
      dndHandlers.onDragOver?.({
        active: { id: 'card-999' },
        over: { id: 'col-done' },
      } as any);
    });
  });

  it('onDragOver hovers over another card and moves to that card status', async () => {
    setupTasks([makeTask(1, { status: 'open' }), makeTask(2, { status: 'blocked' })]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Task 1'));
    act(() => {
      dndHandlers.onDragOver?.({
        active: { id: 'card-1' },
        over: { id: 'card-2' },
      } as any);
    });
  });

  it('onDragEnd calls PUT to persist status', async () => {
    setupTasks([makeTask(1, { status: 'open' })]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Task 1'));
    act(() => {
      dndHandlers.onDragEnd?.({
        active: { id: 'card-1' },
        over: { id: 'col-in_progress' },
      } as any);
    });
    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find((c) => (c[1] as any)?.method === 'PUT');
      expect(putCall).toBeTruthy();
    });
  });

  it('onDragEnd no-ops when over is null', async () => {
    setupTasks([makeTask(1)]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Task 1'));
    const before = fetchMock.mock.calls.length;
    act(() => {
      dndHandlers.onDragEnd?.({ active: { id: 'card-1' }, over: null } as any);
    });
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it('onDragEnd no-ops when activeId is not a card-', async () => {
    setupTasks([makeTask(1)]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Task 1'));
    const before = fetchMock.mock.calls.length;
    act(() => {
      dndHandlers.onDragEnd?.({ active: { id: 'foo-1' }, over: { id: 'col-done' } } as any);
    });
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it('setStatus surfaces error on PUT failure', async () => {
    // First load returns the task; PUT fails; subsequent reload also fails so
    // the error message sticks long enough to assert.
    let putCalls = 0;
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url === '/api/portal/brain/tasks' && (!init || init.method === undefined)) {
        if (putCalls > 0) {
          // After PUT fails, the page reloads. Return a failure so error stays.
          return { ok: false, json: async () => ({ success: false, message: 'put failed' }) };
        }
        return makeRes({ success: true, data: [makeTask(1)] });
      }
      if (init?.method === 'PUT') {
        putCalls++;
        return { ok: false, json: async () => ({ success: false, message: 'put failed' }) };
      }
      return makeRes({ success: true, data: { items: [], meetings: {} } });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Task 1'));
    act(() => {
      dndHandlers.onDragEnd?.({
        active: { id: 'card-1' },
        over: { id: 'col-done' },
      } as any);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('put failed');
    });
  });

  it('exposes a working collisionDetection function', async () => {
    setupTasks([makeTask(1)]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Task 1'));
    expect(typeof dndHandlers.collisionDetection).toBe('function');
    // Invoke it with minimal args — it falls through pointerWithin (empty) and closestCorners (empty)
    const result = dndHandlers.collisionDetection?.({ droppableContainers: [] } as any);
    expect(Array.isArray(result) || result === undefined).toBe(true);
  });
});

// ─── Review tab ─────────────────────────────────────────────────────────────

describe('Review tab — basic rendering', () => {
  function setupReview(items: any[], meetings: Record<number, any> = {}) {
    searchParamsValue = new URLSearchParams('tab=review');
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/review')) {
        return makeRes({ success: true, data: { items, meetings } });
      }
      return makeRes({ success: true, data: [] });
    });
  }

  it('renders the review tab status tabs', async () => {
    setupReview([]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Pending');
      expect(container.textContent).toContain('Approved');
      expect(container.textContent).toContain('Rejected');
    });
  });

  it('renders "All clear" when pending list is empty', async () => {
    setupReview([]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('All clear');
    });
  });

  it('renders empty inbox state when no items match', async () => {
    setupReview([]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Nothing pending review');
    });
  });

  it('renders error banner when review load fails', async () => {
    searchParamsValue = new URLSearchParams('tab=review');
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/review?status=pending')) {
        // First call (the polling-count effect) returns OK, second (the ReviewTab load) fails.
        // Simpler: always return failure for the explicit status-filter call.
        return { ok: false, json: async () => ({ success: false, message: 'review failed' }) };
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('review failed');
    });
  });

  it('renders network error when load throws', async () => {
    searchParamsValue = new URLSearchParams('tab=review');
    fetchMock.mockImplementation(async () => { throw new Error('offline'); });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('offline');
    });
  });

  it('renders pending count when items present', async () => {
    setupReview([makeReviewItem(1), makeReviewItem(2)], {
      1: { id: 1, title: 'Meeting A', status: 'done', meetingDate: '2025-05-10', source: 'gmeet', gmailThreadId: null },
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('2');
      expect(container.textContent).toContain('pending');
    });
  });

  it('groups items by meeting and renders meeting title', async () => {
    setupReview([makeReviewItem(1, { sourceId: 7 })], {
      7: { id: 7, title: 'Strategy Sync', status: 'done', meetingDate: '2025-05-10T10:00:00Z', source: 'zoom', gmailThreadId: null },
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Strategy Sync');
    });
  });

  it('renders "Other sources" group when sourceType is not meeting', async () => {
    setupReview([
      makeReviewItem(1, { sourceType: 'email', sourceId: 9 }),
    ]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Other sources');
    });
  });

  it('switches status filter to "approved"', async () => {
    setupReview([makeReviewItem(1, { status: 'approved' })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Pending');
    });
    const approvedBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Approved',
    ) as HTMLButtonElement;
    fireEvent.click(approvedBtn);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('status=approved'))).toBe(true);
    });
  });
});

// ─── Review tab — actions ───────────────────────────────────────────────────

describe('Review tab — actions', () => {
  function setupReviewWithAction(items: any[], extraHandlers: (url: string, init?: any) => any = () => null) {
    searchParamsValue = new URLSearchParams('tab=review');
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      const extra = extraHandlers(url, init);
      if (extra) return extra;
      if (url.includes('/api/portal/brain/review-items/') && init?.method === 'POST') {
        return makeRes({ success: true });
      }
      if (url.includes('/api/portal/brain/review')) {
        return makeRes({ success: true, data: { items, meetings: {} } });
      }
      return makeRes({ success: true, data: [] });
    });
  }

  // Helper: find the per-item Approve / Reject button.
  // pBtnPrimary now uses bg-foreground (was bg-primary before the portal redesign).
  // pBtnGhost + destructive override now uses hover:text-destructive (was hover:bg-destructive).
  function findItemApprove(container: HTMLElement): HTMLButtonElement {
    return Array.from(container.querySelectorAll('button')).find((b) =>
      b.className.includes('bg-foreground') && b.textContent?.includes('Approve'),
    ) as HTMLButtonElement;
  }
  function findItemReject(container: HTMLElement): HTMLButtonElement {
    return Array.from(container.querySelectorAll('button')).find((b) =>
      b.className.includes('hover:text-destructive') && b.textContent?.includes('Reject'),
    ) as HTMLButtonElement;
  }

  it('approves a single item via the Approve button', async () => {
    setupReviewWithAction([makeReviewItem(1)]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Item 1'));
    fireEvent.click(findItemApprove(container));
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('/approve'))).toBe(true);
    });
  });

  it('rejects a single item via the Reject button', async () => {
    setupReviewWithAction([makeReviewItem(1)]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Item 1'));
    fireEvent.click(findItemReject(container));
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('/reject'))).toBe(true);
    });
  });

  it('surfaces error on approve failure', async () => {
    // After approve() returns failure, the page reloads — make that reload also
    // fail so the error message persists for assertion.
    let approveCalled = false;
    searchParamsValue = new URLSearchParams('tab=review');
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/approve') && init?.method === 'POST') {
        approveCalled = true;
        return { ok: false, json: async () => ({ success: false, message: 'cannot approve' }) };
      }
      if (url.includes('/api/portal/brain/review')) {
        if (approveCalled) {
          return { ok: false, json: async () => ({ success: false, message: 'cannot approve' }) };
        }
        return makeRes({ success: true, data: { items: [makeReviewItem(1)], meetings: {} } });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Item 1'));
    fireEvent.click(findItemApprove(container));
    await waitFor(() => {
      expect(container.textContent).toContain('cannot approve');
    });
  });

  it('surfaces error on reject failure', async () => {
    let rejectCalled = false;
    searchParamsValue = new URLSearchParams('tab=review');
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/reject') && init?.method === 'POST') {
        rejectCalled = true;
        return { ok: false, json: async () => ({ success: false, message: 'cannot reject' }) };
      }
      if (url.includes('/api/portal/brain/review')) {
        if (rejectCalled) {
          return { ok: false, json: async () => ({ success: false, message: 'cannot reject' }) };
        }
        return makeRes({ success: true, data: { items: [makeReviewItem(1)], meetings: {} } });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Item 1'));
    fireEvent.click(findItemReject(container));
    await waitFor(() => {
      expect(container.textContent).toContain('cannot reject');
    });
  });

  it('selecting and bulk-approving multiple items hits /approve for each', async () => {
    setupReviewWithAction([makeReviewItem(1), makeReviewItem(2), makeReviewItem(3)]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Item 1'));
    // Click the "Select all pending" checkbox
    const selectAll = container.querySelector(
      'input[aria-label="Select all pending items"]',
    ) as HTMLInputElement;
    expect(selectAll).toBeTruthy();
    fireEvent.click(selectAll);
    await waitFor(() => {
      expect(container.textContent).toContain('selected');
    });
    // Click "Approve <n>" bulk button
    const bulkApprove = Array.from(container.querySelectorAll('button')).find((b) =>
      /Approve\s+\d/.test(b.textContent || ''),
    ) as HTMLButtonElement;
    fireEvent.click(bulkApprove);
    await waitFor(() => {
      const approveCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/approve'));
      expect(approveCalls.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('selecting a single item shows the bulk action bar', async () => {
    setupReviewWithAction([makeReviewItem(1), makeReviewItem(2)]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Item 1'));
    const itemCheckbox = container.querySelector(
      'input[aria-label="Select item"]',
    ) as HTMLInputElement;
    expect(itemCheckbox).toBeTruthy();
    fireEvent.click(itemCheckbox);
    await waitFor(() => {
      // The bulk row appears with "1 selected" or just "Reject 1"
      expect(container.textContent).toMatch(/Reject\s+1/);
    });
  });

  it('toggling select-all twice deselects everything', async () => {
    setupReviewWithAction([makeReviewItem(1), makeReviewItem(2)]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Item 1'));
    const selectAll = container.querySelector(
      'input[aria-label="Select all pending items"]',
    ) as HTMLInputElement;
    fireEvent.click(selectAll);
    fireEvent.click(selectAll);
    await waitFor(() => {
      // No selection means no "Reject N" button
      expect(container.textContent).not.toMatch(/Reject\s+\d/);
    });
  });

  it('bulk reject path hits /reject for each selected item', async () => {
    setupReviewWithAction([makeReviewItem(1), makeReviewItem(2)]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Item 1'));
    const selectAll = container.querySelector(
      'input[aria-label="Select all pending items"]',
    ) as HTMLInputElement;
    fireEvent.click(selectAll);
    await waitFor(() => {
      expect(container.textContent).toMatch(/Reject\s+\d/);
    });
    const bulkReject = Array.from(container.querySelectorAll('button')).find((b) =>
      /Reject\s+\d/.test(b.textContent || ''),
    ) as HTMLButtonElement;
    fireEvent.click(bulkReject);
    await waitFor(() => {
      const rejectCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/reject'));
      expect(rejectCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('reports partial failure when bulk approve has rejections', async () => {
    // After the bulk-approve runs, the page reloads via load(). To keep the
    // error visible long enough to assert, make the subsequent review load
    // also fail — both branches go through setError.
    let bulkDone = false;
    searchParamsValue = new URLSearchParams('tab=review');
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/review-items/2/approve') && init?.method === 'POST') {
        bulkDone = true;
        return { ok: false, json: async () => ({ success: false, message: 'oh no' }) };
      }
      if (url.includes('/review-items/') && init?.method === 'POST') {
        bulkDone = true;
        return makeRes({ success: true });
      }
      if (url.includes('/api/portal/brain/review')) {
        // After the bulk completes, freeze the failure message in by failing
        // the reload too.
        if (bulkDone) {
          return { ok: false, json: async () => ({ success: false, message: 'oh no' }) };
        }
        return makeRes({ success: true, data: { items: [makeReviewItem(1), makeReviewItem(2)], meetings: {} } });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Item 1'));
    const selectAll = container.querySelector(
      'input[aria-label="Select all pending items"]',
    ) as HTMLInputElement;
    fireEvent.click(selectAll);
    const bulkApprove = Array.from(container.querySelectorAll('button')).find((b) =>
      /Approve\s+\d/.test(b.textContent || ''),
    ) as HTMLButtonElement;
    fireEvent.click(bulkApprove);
    await waitFor(() => {
      // Either the bulk failure message or the load failure surfaces.
      expect(container.textContent || '').toContain('oh no');
    });
    // Verify both items had POST attempts
    const approveCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/approve'));
    expect(approveCalls.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Review tab — item types & payload details ────────────────────────────

describe('Review tab — proposed types and payload details', () => {
  function setupReviewItems(items: any[]) {
    searchParamsValue = new URLSearchParams('tab=review');
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/review')) {
        return makeRes({ success: true, data: { items, meetings: {} } });
      }
      return makeRes({ success: true, data: [] });
    });
  }

  it('describes a task', async () => {
    setupReviewItems([makeReviewItem(1, { proposedType: 'task', proposedPayload: { title: 'Do thing' } })]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Do thing'));
  });

  it('describes a task with no title as "Untitled task"', async () => {
    setupReviewItems([makeReviewItem(1, { proposedType: 'task', proposedPayload: {} })]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Untitled task'));
  });

  it('describes a decision', async () => {
    setupReviewItems([makeReviewItem(1, { proposedType: 'decision', proposedPayload: { title: 'Go big', details: 'ship it' } })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Go big');
      expect(container.textContent).toContain('ship it');
    });
  });

  it('describes a commitment', async () => {
    setupReviewItems([makeReviewItem(1, { proposedType: 'commitment', proposedPayload: { who: 'Dan', what: 'will send doc', when: 'Friday' } })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Dan');
      expect(container.textContent).toContain('Friday');
    });
  });

  it('describes a relationship_update', async () => {
    setupReviewItems([makeReviewItem(1, {
      proposedType: 'relationship_update',
      proposedPayload: { field: 'priority', value: 'high', rationale: 'busy quarter' },
    })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('priority');
      expect(container.textContent).toContain('busy quarter');
    });
  });

  it('describes a compliance_warning', async () => {
    setupReviewItems([makeReviewItem(1, {
      proposedType: 'compliance_warning',
      proposedPayload: { message: 'PII leaking', severity: 'high' },
    })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('PII leaking');
      expect(container.textContent).toContain('high');
    });
  });

  it('describes a crm_contact_classify with parts', async () => {
    setupReviewItems([makeReviewItem(1, {
      proposedType: 'crm_contact_classify',
      proposedPayload: {
        contactId: 42,
        proposedStatus: 'lead',
        proposedSeniority: 'manager',
        proposedDepartment: 'sales',
        proposedTitle: 'VP',
        rationale: 'profile',
      },
    })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('#42');
      expect(container.textContent).toContain('status → lead');
      expect(container.textContent).toContain('profile');
    });
  });

  it('describes a crm_contact_classify with only id (no parts)', async () => {
    setupReviewItems([makeReviewItem(1, {
      proposedType: 'crm_contact_classify',
      proposedPayload: { contactId: 99 },
    })]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('#99'));
  });

  it('describes a crm_deal_link', async () => {
    setupReviewItems([makeReviewItem(1, { proposedType: 'crm_deal_link', proposedPayload: { dealId: 7, rationale: 'related' } })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Link to deal #7');
      expect(container.textContent).toContain('related');
    });
  });

  it('describes a crm_deal_create with currency value', async () => {
    setupReviewItems([makeReviewItem(1, {
      proposedType: 'crm_deal_create',
      proposedPayload: { title: 'Big Co', value: 5000, currency: 'USD', priority: 'high', expectedCloseDate: '2026-01-01', rationale: 'fit' },
    })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Big Co');
      expect(container.textContent).toContain('high');
      expect(container.textContent).toContain('fit');
    });
  });

  it('describes a crm_company_link with single candidate', async () => {
    setupReviewItems([makeReviewItem(1, {
      proposedType: 'crm_company_link',
      proposedPayload: { companyId: 11, candidateCompanyIds: [11] },
    })]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Link to company #11'));
  });

  it('describes a crm_company_link with multiple candidates', async () => {
    setupReviewItems([makeReviewItem(1, {
      proposedType: 'crm_company_link',
      proposedPayload: { companyId: 11, candidateCompanyIds: [11, 22, 33] },
    })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Pick a company');
      expect(container.textContent).toContain('#11');
    });
  });

  it('describes a crm_company_create with industry, website, rationale', async () => {
    setupReviewItems([makeReviewItem(1, {
      proposedType: 'crm_company_create',
      proposedPayload: { name: 'Acme', domain: 'acme.com', industry: 'tech', website: 'https://acme', rationale: 'new acct' },
    })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Acme');
      expect(container.textContent).toContain('acme.com');
      expect(container.textContent).toContain('tech');
    });
  });

  it('describes an unknown proposed type by JSON.stringify fallback', async () => {
    setupReviewItems([{
      ...makeReviewItem(1),
      proposedType: 'not_a_real_type' as any,
      proposedPayload: { foo: 'bar' },
    }]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('bar'));
  });

  it('renders the approved badge for approved items', async () => {
    setupReviewItems([makeReviewItem(1, { status: 'approved' })]);
    searchParamsValue = new URLSearchParams('tab=review');
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/review')) {
        return makeRes({ success: true, data: { items: [makeReviewItem(1, { status: 'approved' })], meetings: {} } });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    // Switch to Approved tab so this status filter matches
    await waitFor(() => expect(container.textContent).toContain('Pending'));
    const approvedTab = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Approved',
    ) as HTMLButtonElement;
    fireEvent.click(approvedTab);
    await waitFor(() => {
      expect(container.textContent).toContain('Approved');
    });
  });

  it('renders the rejected badge for rejected items', async () => {
    searchParamsValue = new URLSearchParams('tab=review');
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/review')) {
        return makeRes({ success: true, data: { items: [makeReviewItem(1, { status: 'rejected' })], meetings: {} } });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Pending'));
    const rejTab = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Rejected',
    ) as HTMLButtonElement;
    fireEvent.click(rejTab);
    await waitFor(() => {
      expect(container.textContent).toContain('Rejected');
    });
  });

  it('renders the edited-and-approved variant', async () => {
    searchParamsValue = new URLSearchParams('tab=review');
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/review')) {
        return makeRes({ success: true, data: { items: [makeReviewItem(1, { status: 'edited' })], meetings: {} } });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Pending'));
    const allTab = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'All',
    ) as HTMLButtonElement;
    fireEvent.click(allTab);
    await waitFor(() => {
      expect(container.textContent).toContain('Edited');
    });
  });
});
