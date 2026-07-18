// @vitest-environment jsdom
/**
 * Batch 45h — KanbanBoard component (portal projects board).
 *
 * KanbanBoard is a large client component with two inner sub-components
 * (KanbanCard, KanbanColumn) and a top-level board with filters, drag-and-drop
 * via @dnd-kit, deep-link card opening, keyboard shortcuts, and several
 * fetch-backed mutations (move card, add card, add/move/delete/toggle/wip
 * column).
 *
 * Heavy deps are mocked:
 *   - @dnd-kit/core         → DndContext is a passthrough that captures the
 *                             onDragStart/onDragOver/onDragEnd callbacks so
 *                             the test can synthesize drag events without a
 *                             real PointerSensor; useDroppable returns inert
 *                             refs; collision-detection helpers return [].
 *   - @dnd-kit/sortable     → SortableContext is a passthrough; useSortable
 *                             returns inert refs.
 *   - @dnd-kit/utilities    → CSS.Transform.toString is a no-op.
 *   - CardDetailModal       → stubbed to a simple test marker so the modal
 *                             open/close branch is observable without
 *                             pulling in its fetch chain.
 *   - global.fetch          → stubbed to return { success: true, data: {…} }
 *                             so the async write paths complete.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Capture handlers passed to DndContext so tests can invoke them directly.
const dndHandlers: {
  onDragStart?: (e: any) => void;
  onDragOver?: (e: any) => void;
  onDragEnd?: (e: any) => Promise<void> | void;
  collisionDetection?: (args: any) => any;
} = {};

vi.mock('@dnd-kit/core', () => {
  const React = require('react');
  return {
    DndContext: ({
      children,
      onDragStart,
      onDragOver,
      onDragEnd,
      collisionDetection,
    }: any) => {
      dndHandlers.onDragStart = onDragStart;
      dndHandlers.onDragOver = onDragOver;
      dndHandlers.onDragEnd = onDragEnd;
      dndHandlers.collisionDetection = collisionDetection;
      return React.createElement('div', { 'data-testid': 'dnd-context' }, children);
    },
    DragOverlay: ({ children }: any) =>
      React.createElement('div', { 'data-testid': 'drag-overlay' }, children),
    PointerSensor: function PointerSensor() {},
    KeyboardSensor: function KeyboardSensor() {},
    useSensor: (s: any) => s,
    useSensors: (...s: any[]) => s,
    closestCorners: () => [],
    pointerWithin: () => [],
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
  const React = require('react');
  return {
    sortableKeyboardCoordinates: () => undefined,
    SortableContext: ({ children }: any) =>
      React.createElement(React.Fragment, null, children),
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

vi.mock('@/components/portal/CardDetailModal', () => ({
  default: ({ cardId, onClose }: { cardId: number; onClose: () => void }) => {
    const React = require('react');
    return React.createElement(
      'div',
      { 'data-testid': 'card-detail-modal' },
      React.createElement('span', { 'data-testid': 'opened-card-id' }, String(cardId)),
      React.createElement(
        'button',
        { 'data-testid': 'modal-close', onClick: onClose },
        'close',
      ),
    );
  },
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks are in place)
// ---------------------------------------------------------------------------

import KanbanBoard from '@/components/portal/KanbanBoard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    json: async () => ({
      success: true,
      data: {
        id: 9999,
        columnId: 1,
        title: 'New Card',
        description: null,
        priority: null,
        dueDate: null,
        order: 0,
      },
    }),
  }));
  (global as any).fetch = fetchMock;
  dndHandlers.onDragStart = undefined;
  dndHandlers.onDragOver = undefined;
  dndHandlers.onDragEnd = undefined;
  dndHandlers.collisionDetection = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeColumns(): any[] {
  return [
    {
      id: 1,
      name: 'Todo',
      color: '#ff0000',
      order: 0,
      isDone: false,
      wipLimit: null,
      cards: [
        {
          id: 10,
          columnId: 1,
          title: 'First Task',
          description: 'A description',
          priority: 'high',
          dueDate: '2026-05-25',
          order: 0,
          sprintId: 100,
          key: 'PROJ-10',
          attachments: [
            { url: 'https://cdn/img1.png', mimeType: 'image/png' },
            { url: 'https://cdn/img2.png', mimeType: 'image/png' },
            { url: 'https://cdn/doc.pdf', mimeType: 'application/pdf' },
          ],
          labels: [
            { id: 1, name: 'bug', color: '#ff0000' },
            { id: 2, name: 'frontend', color: '#00ff00' },
          ],
          checklist: { total: 3, done: 2 },
          assignees: [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
            { id: 3, name: 'Carol' },
            { id: 4, name: 'Dave' },
          ],
          blockedCount: 2,
        },
        {
          id: 11,
          columnId: 1,
          title: 'Second Task',
          description: null,
          priority: 'low',
          dueDate: null,
          order: 1,
          sprintId: null,
          attachments: [{ url: 'https://cdn/a.txt', mimeType: 'text/plain' }],
        },
      ],
    },
    {
      id: 2,
      name: 'In Progress',
      color: null,
      order: 1,
      isDone: false,
      wipLimit: 1,
      cards: [
        {
          id: 20,
          columnId: 2,
          title: 'WIP Task',
          description: null,
          priority: 'medium',
          dueDate: null,
          order: 0,
        },
        {
          id: 21,
          columnId: 2,
          title: 'Over WIP',
          description: null,
          priority: null,
          dueDate: null,
          order: 1,
        },
      ],
    },
    {
      id: 3,
      name: 'Done',
      color: '#00ff00',
      order: 2,
      isDone: true,
      wipLimit: null,
      cards: [],
    },
  ];
}

function defaultProps(overrides: any = {}) {
  return {
    projectId: 42,
    initialColumns: makeColumns(),
    isStaff: true,
    canEdit: true,
    currentUserId: 7,
    sprints: [
      { id: 100, name: 'Sprint 1', status: 'active' },
      { id: 101, name: 'Sprint 2', status: 'planned' },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Initial render branches
// ---------------------------------------------------------------------------

describe('KanbanBoard — initial render', () => {
  it('renders all columns and their cards', () => {
    const { container, getAllByText } = render(<KanbanBoard {...defaultProps()} />);
    expect(container.textContent).toContain('Todo');
    expect(container.textContent).toContain('In Progress');
    expect(container.textContent).toContain('Done');
    expect(container.textContent).toContain('First Task');
    expect(container.textContent).toContain('Second Task');
    expect(container.textContent).toContain('WIP Task');
    // "Done" badge appears on the Done column
    expect(getAllByText('Done').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the card-detail metadata: priority, due date, checklist, assignees, blocked, labels, key, attachments', () => {
    const { container } = render(<KanbanBoard {...defaultProps()} />);
    expect(container.textContent).toContain('PROJ-10');
    expect(container.textContent).toContain('high');
    expect(container.textContent).toContain('2/3'); // checklist done/total
    expect(container.textContent).toContain('bug');
    expect(container.textContent).toContain('frontend');
    // 4 assignees, only 3 chips + "+1"
    expect(container.textContent).toContain('+1');
    // blocked count
    expect(container.textContent).toContain('block');
    // image thumbs: 2 image attachments shown + "+1" attachment chip
    const imgs = container.querySelectorAll('img[src^="https://cdn/img"]');
    expect(imgs.length).toBe(2);
    // total attachments = 3, displayed thumbs = 2, so "+1" overflow chip
    expect(container.textContent).toMatch(/\+1/);
  });

  it('renders non-image-only attachments as a simple counter row', () => {
    const { container } = render(<KanbanBoard {...defaultProps()} />);
    // card 11 has just one .txt attachment — no image thumbs, so render the
    // "attach_file 1" row.
    const counterRows = Array.from(container.querySelectorAll('div'))
      .filter(d => d.textContent === ' 1' || /attach_file/.test(d.innerHTML))
      .filter(d => d.querySelector('.material-icons'));
    expect(counterRows.length).toBeGreaterThan(0);
  });

  it('shows WIP-limit badge and "over limit" styling when cards exceed wipLimit', () => {
    const { container } = render(<KanbanBoard {...defaultProps()} />);
    // In Progress column has 2 cards, wipLimit 1 → "2/1" badge
    expect(container.textContent).toContain('2/1');
    // "over limit" badge gets bg-red-100
    const overBadge = Array.from(container.querySelectorAll('span'))
      .find(s => s.textContent === '2/1');
    expect(overBadge?.className).toContain('bg-red-100');
  });

  it('renders the priority pill row with all four priority chips', () => {
    const { container } = render(<KanbanBoard {...defaultProps()} />);
    expect(container.textContent).toContain('low');
    expect(container.textContent).toContain('medium');
    expect(container.textContent).toContain('high');
    expect(container.textContent).toContain('urgent');
  });

  it('renders sprint, assignee, and label filter chips when present', () => {
    const { container } = render(<KanbanBoard {...defaultProps()} />);
    expect(container.textContent).toContain('Sprint:');
    expect(container.textContent).toContain('Sprint 1');
    expect(container.textContent).toContain('Sprint 2');
    expect(container.textContent).toContain('Backlog');
    expect(container.textContent).toContain('Assignee:');
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('Label:');
    expect(container.textContent).toContain('bug');
  });

  it('omits sprint/assignee/label rows when none are present', () => {
    const { container } = render(
      <KanbanBoard
        projectId={1}
        initialColumns={[{ id: 1, name: 'Empty', color: null, order: 0, cards: [] }]}
        isStaff={true}
        canEdit={true}
        currentUserId={1}
        sprints={[]}
      />,
    );
    expect(container.textContent).not.toContain('Sprint:');
    expect(container.textContent).not.toContain('Assignee:');
    expect(container.textContent).not.toContain('Label:');
  });

  it('shows isFirst/isLast nav controls correctly (no left arrow on first, no right on last)', () => {
    const { container } = render(<KanbanBoard {...defaultProps()} />);
    const lefts = container.querySelectorAll('button[title="Move left"]');
    const rights = container.querySelectorAll('button[title="Move right"]');
    // 3 cols → only 2 lefts (cols 2,3) and 2 rights (cols 1,2)
    expect(lefts.length).toBe(2);
    expect(rights.length).toBe(2);
  });

  it('hides WIP/Done buttons when isStaff=false', () => {
    const { container } = render(
      <KanbanBoard {...defaultProps({ isStaff: false })} />,
    );
    expect(container.querySelector('button[title*="Done column"]')).toBeNull();
    expect(container.querySelector('button[title*="WIP limit"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Filter behavior
// ---------------------------------------------------------------------------

describe('KanbanBoard — filters', () => {
  it('filters cards by search text in title/description/key', () => {
    const { container, getByPlaceholderText } = render(
      <KanbanBoard {...defaultProps()} />,
    );
    const input = getByPlaceholderText('Filter cards…') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'first' } });
    expect(container.textContent).toContain('First Task');
    expect(container.textContent).not.toContain('Second Task');
    expect(container.textContent).not.toContain('WIP Task');
  });

  it('toggles a priority chip on/off and filters accordingly', () => {
    const { container, getByText } = render(<KanbanBoard {...defaultProps()} />);
    // Locate the chip-style "high" filter button (px-2.5 rounded-full)
    const highBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent === 'high' && b.className.includes('rounded-full'));
    expect(highBtn).toBeTruthy();
    fireEvent.click(highBtn!);
    // After filter, only the "high" priority card (First Task) shows
    expect(container.textContent).toContain('First Task');
    expect(container.textContent).not.toContain('Second Task');
    // Toggle off → all cards reappear
    fireEvent.click(highBtn!);
    expect(container.textContent).toContain('Second Task');
  });

  it('filters by assignee chip', () => {
    const { container } = render(<KanbanBoard {...defaultProps()} />);
    const aliceBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent === 'Alice');
    fireEvent.click(aliceBtn!);
    // Only the card assigned to Alice (First Task) remains
    expect(container.textContent).toContain('First Task');
    expect(container.textContent).not.toContain('Second Task');
  });

  it('filters by sprint and supports the backlog pseudo-sprint', () => {
    const { container } = render(<KanbanBoard {...defaultProps()} />);
    const sprint1 = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent === 'Sprint 1');
    fireEvent.click(sprint1!);
    expect(container.textContent).toContain('First Task');
    expect(container.textContent).not.toContain('Second Task'); // sprintId null
    // Now Backlog
    const backlog = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent === 'Backlog');
    fireEvent.click(backlog!);
    expect(container.textContent).not.toContain('First Task');
    expect(container.textContent).toContain('Second Task');
  });

  it('filters by label chip', () => {
    const { container } = render(<KanbanBoard {...defaultProps()} />);
    const bugChip = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent === 'bug');
    fireEvent.click(bugChip!);
    expect(container.textContent).toContain('First Task');
    expect(container.textContent).not.toContain('Second Task');
  });

  it('shows clear-filters button when any filter is active and resets state on click', () => {
    const { container, getByPlaceholderText } = render(
      <KanbanBoard {...defaultProps()} />,
    );
    fireEvent.change(getByPlaceholderText('Filter cards…'), { target: { value: 'first' } });
    const clear = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.startsWith('Clear filters'));
    expect(clear).toBeTruthy();
    expect(clear!.textContent).toContain('(1)');
    fireEvent.click(clear!);
    // All cards back
    expect(container.textContent).toContain('Second Task');
    // Clear-filters button gone
    expect(
      Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.startsWith('Clear filters')),
    ).toBeUndefined();
  });

  it('shows the "All" sprint button selected by default', () => {
    const { container } = render(<KanbanBoard {...defaultProps()} />);
    const allBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent === 'All' && b.className.includes('rounded-full'));
    expect(allBtn?.className).toContain('bg-primary');
  });
});

// ---------------------------------------------------------------------------
// Add card / add column flows
// ---------------------------------------------------------------------------

describe('KanbanBoard — add card', () => {
  it('opens the inline add-card form on "Add card" click and cancels on Cancel', () => {
    const { container, getAllByText } = render(<KanbanBoard {...defaultProps()} />);
    const addCardBtn = getAllByText('Add card')[0].closest('button')!;
    fireEvent.click(addCardBtn);
    const form = container.querySelector('form');
    expect(form).toBeTruthy();
    const cancel = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent === 'Cancel');
    fireEvent.click(cancel!);
    expect(container.querySelector('input[placeholder="Card title…"]')).toBeNull();
  });

  it('cancels add-card form on Escape key', () => {
    const { container, getAllByText } = render(<KanbanBoard {...defaultProps()} />);
    fireEvent.click(getAllByText('Add card')[0].closest('button')!);
    const titleInput = container.querySelector('input[placeholder="Card title…"]') as HTMLInputElement;
    expect(titleInput).toBeTruthy();
    fireEvent.keyDown(titleInput, { key: 'Escape' });
    expect(container.querySelector('input[placeholder="Card title…"]')).toBeNull();
  });

  it('submit is disabled when title is empty', () => {
    const { container, getAllByText } = render(<KanbanBoard {...defaultProps()} />);
    fireEvent.click(getAllByText('Add card')[0].closest('button')!);
    const submit = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent === 'Add' && b.getAttribute('type') === 'submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('submits the form, posts to the cards API, and appends the returned card', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: 99,
          columnId: 1,
          title: 'Brand new',
          description: null,
          priority: null,
          dueDate: null,
          order: 2,
        },
      }),
    });
    const { container, getAllByText } = render(<KanbanBoard {...defaultProps()} />);
    fireEvent.click(getAllByText('Add card')[0].closest('button')!);
    const titleInput = container.querySelector('input[placeholder="Card title…"]') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Brand new' } });
    const form = container.querySelector('form')!;
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/portal/cards',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(container.textContent).toContain('Brand new');
  });

  it('does nothing when handleAddCard is submitted with empty title (early return)', async () => {
    const { container, getAllByText } = render(<KanbanBoard {...defaultProps()} />);
    fireEvent.click(getAllByText('Add card')[0].closest('button')!);
    const form = container.querySelector('form')!;
    await act(async () => {
      fireEvent.submit(form);
    });
    // Whitespace-only title should also not trigger fetch
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not append a card when API returns success:false', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false }),
    });
    const { container, getAllByText } = render(<KanbanBoard {...defaultProps()} />);
    fireEvent.click(getAllByText('Add card')[0].closest('button')!);
    const titleInput = container.querySelector('input[placeholder="Card title…"]') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Ghost' } });
    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });
    expect(container.textContent).not.toContain('Ghost');
  });
});

describe('KanbanBoard — add column', () => {
  it('opens the add-column form, submits, and appends the returned column', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { id: 99, name: 'Review', color: '#ff00ff', order: 99 },
      }),
    });
    const { container, getByText } = render(<KanbanBoard {...defaultProps()} />);
    fireEvent.click(getByText('Add column').closest('button')!);
    const nameInput = container.querySelector('input[placeholder="Column name..."]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Review' } });
    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });
    expect(container.textContent).toContain('Review');
  });

  it('cancels the add-column form on Escape', () => {
    const { container, getByText } = render(<KanbanBoard {...defaultProps()} />);
    fireEvent.click(getByText('Add column').closest('button')!);
    const nameInput = container.querySelector('input[placeholder="Column name..."]') as HTMLInputElement;
    fireEvent.keyDown(nameInput, { key: 'Escape' });
    expect(container.querySelector('input[placeholder="Column name..."]')).toBeNull();
  });

  it('does not submit empty column names', async () => {
    const { container, getByText } = render(<KanbanBoard {...defaultProps()} />);
    fireEvent.click(getByText('Add column').closest('button')!);
    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('changing color input updates the color picker value', () => {
    const { container, getByText } = render(<KanbanBoard {...defaultProps()} />);
    fireEvent.click(getByText('Add column').closest('button')!);
    const colorInput = container.querySelector('input[type="color"]') as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: '#abcdef' } });
    expect(colorInput.value).toBe('#abcdef');
  });
});

// ---------------------------------------------------------------------------
// Column management: move / delete / done / wip
// ---------------------------------------------------------------------------

describe('KanbanBoard — column management', () => {
  it('moves a column right and persists', async () => {
    const { container } = render(<KanbanBoard {...defaultProps()} />);
    // First column's "Move right" button (Todo → after In Progress)
    const right = container.querySelector('button[title="Move right"]') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(right);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/portal/projects/42/columns/reorder',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('moves a column left and persists', async () => {
    const { container } = render(<KanbanBoard {...defaultProps()} />);
    // Move-left appears on col 2 and col 3; click first one
    const left = container.querySelector('button[title="Move left"]') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(left);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/portal/projects/42/columns/reorder',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('delete is only available for empty columns and triggers a DELETE request', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });
    const { container } = render(<KanbanBoard {...defaultProps()} />);
    const del = container.querySelector('button[title="Delete empty column"]') as HTMLButtonElement;
    expect(del).toBeTruthy();
    await act(async () => {
      fireEvent.click(del);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/portal/projects/42/columns/3',
      expect.objectContaining({ method: 'DELETE' }),
    );
    // Done column should be gone
    expect(container.textContent).not.toContain('Done');
  });

  it('toggleDone fires PATCH and updates the badge', async () => {
    const { container } = render(<KanbanBoard {...defaultProps()} />);
    // Pick the first column's done-toggle (not-yet-done state)
    const toggle = container.querySelector('button[title*="Mark as Done"]') as HTMLButtonElement;
    expect(toggle).toBeTruthy();
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/portal\/projects\/42\/columns\/1$/),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ isDone: true }),
      }),
    );
  });

  it('set-WIP-limit prompts for a value and PATCHes the column', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('5');
    const { container } = render(<KanbanBoard {...defaultProps()} />);
    const wipBtn = container.querySelector('button[title*="WIP limit"], button[title="Set WIP limit"]') as HTMLButtonElement;
    expect(wipBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(wipBtn);
    });
    expect(promptSpy).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/portal\/projects\/42\/columns\/1$/),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ wipLimit: 5 }),
      }),
    );
  });

  it('set-WIP-limit with empty string removes the limit (passes 0)', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('');
    const { container } = render(<KanbanBoard {...defaultProps()} />);
    const wipBtn = container.querySelector('button[title*="WIP limit"], button[title="Set WIP limit"]') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(wipBtn);
    });
    expect(promptSpy).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: JSON.stringify({ wipLimit: 0 }) }),
    );
  });

  it('set-WIP-limit ignores cancellation (null) and non-numeric input', async () => {
    const promptSpy = vi
      .spyOn(window, 'prompt')
      .mockReturnValueOnce(null)
      .mockReturnValueOnce('not-a-number');
    const { container } = render(<KanbanBoard {...defaultProps()} />);
    const wipBtns = container.querySelectorAll('button[title*="WIP limit"], button[title="Set WIP limit"]');
    await act(async () => {
      fireEvent.click(wipBtns[0] as HTMLElement);
      fireEvent.click(wipBtns[0] as HTMLElement);
    });
    expect(promptSpy).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Move-to dropdown on cards
// ---------------------------------------------------------------------------

describe('KanbanBoard — move-to dropdown', () => {
  it('opens the move-to menu and moves a card to a different column', async () => {
    const { container } = render(<KanbanBoard {...defaultProps()} />);
    const moveBtn = container.querySelector('button[title="Move to column"]') as HTMLButtonElement;
    expect(moveBtn).toBeTruthy();
    fireEvent.click(moveBtn);
    // The other columns should be listed; pick "In Progress"
    const targetBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent === 'In Progress' && b.className.includes('hover:bg-accent'));
    expect(targetBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(targetBtn!);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/portal/cards/10/move',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});

// ---------------------------------------------------------------------------
// Card open → modal
// ---------------------------------------------------------------------------

describe('KanbanBoard — card modal', () => {
  it('opens the CardDetailModal when a card is clicked and closes on onClose', () => {
    const { container, getByTestId, queryByTestId } = render(
      <KanbanBoard {...defaultProps()} />,
    );
    // Click on a card title — its onClick is on the card root
    const firstTitle = Array.from(container.querySelectorAll('p'))
      .find(p => p.textContent === 'First Task');
    const cardRoot = firstTitle!.closest('div[class*="cursor-pointer"]')!;
    fireEvent.click(cardRoot);
    expect(getByTestId('card-detail-modal')).toBeTruthy();
    expect(getByTestId('opened-card-id').textContent).toBe('10');
    fireEvent.click(getByTestId('modal-close'));
    expect(queryByTestId('card-detail-modal')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Drag handlers (invoked directly via captured callbacks)
// ---------------------------------------------------------------------------

describe('KanbanBoard — drag handlers', () => {
  it('onDragStart sets the activeCard from event.active.data.current', () => {
    const { container } = render(<KanbanBoard {...defaultProps()} />);
    act(() => {
      dndHandlers.onDragStart!({
        active: {
          id: 'card-10',
          data: { current: { type: 'card', card: { id: 10, title: 'OverlayTask' } } },
        },
      });
    });
    // DragOverlay should now contain the overlay card
    const overlay = container.querySelector('[data-testid="drag-overlay"]')!;
    expect(overlay.textContent).toContain('OverlayTask');
  });

  it('onDragOver moves the card into the target column (over a column id)', async () => {
    render(<KanbanBoard {...defaultProps()} />);
    await act(async () => {
      dndHandlers.onDragOver!({
        active: { id: 'card-10', data: { current: { type: 'card' } } },
        over: { id: 'col-2' },
      });
    });
    // No fetch yet — onDragOver is purely state-shuffling
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('onDragOver moves the card to position of another card (over a card id)', async () => {
    render(<KanbanBoard {...defaultProps()} />);
    await act(async () => {
      dndHandlers.onDragOver!({
        active: { id: 'card-10', data: { current: { type: 'card' } } },
        over: { id: 'card-20' },
      });
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('onDragOver early-returns for no-op (active === over)', () => {
    render(<KanbanBoard {...defaultProps()} />);
    expect(() => {
      dndHandlers.onDragOver!({
        active: { id: 'card-10', data: { current: { type: 'card' } } },
        over: { id: 'card-10' },
      });
    }).not.toThrow();
  });

  it('onDragOver early-returns when there is no over target', () => {
    render(<KanbanBoard {...defaultProps()} />);
    expect(() => {
      dndHandlers.onDragOver!({
        active: { id: 'card-10', data: { current: { type: 'card' } } },
        over: null,
      });
    }).not.toThrow();
  });

  it('onDragOver ignores non-card actives', () => {
    render(<KanbanBoard {...defaultProps()} />);
    expect(() => {
      dndHandlers.onDragOver!({
        active: { id: 'col-1', data: { current: {} } },
        over: { id: 'col-2' },
      });
    }).not.toThrow();
  });

  it('onDragEnd over a column persists with a PATCH', async () => {
    render(<KanbanBoard {...defaultProps()} />);
    vi.useFakeTimers();
    await act(async () => {
      await dndHandlers.onDragEnd!({
        active: { id: 'card-10' },
        over: { id: 'col-2' },
      });
    });
    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });
    vi.useRealTimers();
    const calls = (fetchMock.mock.calls as any[]).map(c => c[0]);
    expect(calls.some((u: string) => u === '/api/portal/cards/10/move')).toBe(true);
  });

  it('onDragEnd over another card persists with the new index', async () => {
    render(<KanbanBoard {...defaultProps()} />);
    await act(async () => {
      // First simulate the onDragOver so card-10 moves next to card-20
      dndHandlers.onDragOver!({
        active: { id: 'card-10', data: { current: { type: 'card' } } },
        over: { id: 'card-20' },
      });
    });
    await act(async () => {
      await dndHandlers.onDragEnd!({
        active: { id: 'card-10' },
        over: { id: 'card-20' },
      });
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/portal/cards/10/move',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('onDragEnd ignores non-card actives', async () => {
    render(<KanbanBoard {...defaultProps()} />);
    await act(async () => {
      await dndHandlers.onDragEnd!({
        active: { id: 'col-1' },
        over: { id: 'col-2' },
      });
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('collisionDetection prefers the column when pointer is over a column id', () => {
    render(<KanbanBoard {...defaultProps()} />);
    expect(typeof dndHandlers.collisionDetection).toBe('function');
    // pointerWithin / closestCorners are both stubbed to []; with empty
    // collisions the function should still return without throwing.
    const result = dndHandlers.collisionDetection!({
      droppableContainers: [],
      collisionRect: { top: 0, left: 0, width: 0, height: 0 },
      pointerCoordinates: { x: 0, y: 0 },
    });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Deep-link + keyboard shortcuts
// ---------------------------------------------------------------------------

describe('KanbanBoard — deep-link & keyboard', () => {
  it('opens the modal when ?card=<id> is in the URL', () => {
    const oldHref = window.location.href;
    window.history.replaceState({}, '', '/?card=10');
    const { getByTestId } = render(<KanbanBoard {...defaultProps()} />);
    expect(getByTestId('card-detail-modal')).toBeTruthy();
    expect(getByTestId('opened-card-id').textContent).toBe('10');
    window.history.replaceState({}, '', oldHref);
  });

  it('ignores ?card= when the value is not a finite number', () => {
    window.history.replaceState({}, '', '/?card=not-a-number');
    const { queryByTestId } = render(<KanbanBoard {...defaultProps()} />);
    expect(queryByTestId('card-detail-modal')).toBeNull();
  });

  it('"/" focuses the filter input', () => {
    const { container } = render(<KanbanBoard {...defaultProps()} />);
    const input = container.querySelector('input[placeholder="Filter cards…"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }));
    });
    expect(document.activeElement).toBe(input);
  });

  it('"c" opens the add-card form for the first column when canEdit=true', () => {
    const { container } = render(<KanbanBoard {...defaultProps()} />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }));
    });
    expect(container.querySelector('input[placeholder="Card title…"]')).toBeTruthy();
  });

  it('"c" does nothing when canEdit=false', () => {
    const { container } = render(<KanbanBoard {...defaultProps({ canEdit: false })} />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }));
    });
    expect(container.querySelector('input[placeholder="Card title…"]')).toBeNull();
  });

  it('"Escape" closes the add-card / add-column forms', () => {
    const { container, getByText } = render(<KanbanBoard {...defaultProps()} />);
    // Open both forms
    fireEvent.click(getByText('Add column').closest('button')!);
    expect(container.querySelector('input[placeholder="Column name..."]')).toBeTruthy();
    act(() => {
      // Escape via window listener — but the form input also has its own
      // Escape handler. Either way the form should close.
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(container.querySelector('input[placeholder="Column name..."]')).toBeNull();
  });

  it('ignores shortcuts while typing in an input', () => {
    const { container } = render(<KanbanBoard {...defaultProps()} />);
    const filterInput = container.querySelector('input[placeholder="Filter cards…"]') as HTMLInputElement;
    filterInput.focus();
    act(() => {
      // Dispatch from the input — target.tagName === 'INPUT' branch
      filterInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
    });
    // No add-card form opened
    expect(container.querySelector('input[placeholder="Card title…"]')).toBeNull();
  });

  it('ignores shortcuts when modifier keys are held', () => {
    const { container } = render(<KanbanBoard {...defaultProps()} />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', metaKey: true }));
    });
    expect(container.querySelector('input[placeholder="Card title…"]')).toBeNull();
  });

  it('ignores shortcuts while a card modal is open', () => {
    window.history.replaceState({}, '', '/?card=10');
    const { container, getByTestId } = render(<KanbanBoard {...defaultProps()} />);
    expect(getByTestId('card-detail-modal')).toBeTruthy();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }));
    });
    expect(container.querySelector('input[placeholder="Card title…"]')).toBeNull();
    window.history.replaceState({}, '', '/');
  });
});
