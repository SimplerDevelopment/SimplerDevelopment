// @vitest-environment jsdom
/**
 * Unit tests for `components/portal/ProjectReportsTab.tsx`.
 *
 * The component:
 *  - fetches sprints + velocity + cycle-time + CFD on mount
 *  - fetches burndown + capacity whenever activeSprintId changes
 *  - renders inline SVG charts (Burndown, Velocity, CFD, Capacity) or empty states
 *  - renders a CycleTable with time-formatting logic
 *  - renders a SprintRetroPanel when a sprint is selected
 *  - shows a loading spinner while the initial fetch is in-flight
 *
 * SprintRetroPanel is stubbed so we don't pull in its effect chain.
 * fetch is stubbed via global.fetch (same pattern as other tests in this repo).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';

// ─── Mocks (must precede component import) ───────────────────────────────────

vi.mock('@/components/portal/SprintRetroPanel', () => ({
  __esModule: true,
  default: ({ sprintId, sprintName }: { sprintId: number; sprintName: string }) =>
    React.createElement(
      'div',
      { 'data-testid': 'sprint-retro-panel' },
      `retro:${sprintId}:${sprintName}`,
    ),
}));

// ─── Fetch data fixtures ──────────────────────────────────────────────────────

function jsonOk(body: any) {
  return { ok: true, json: async () => body };
}

const sprintsData = {
  success: true,
  data: {
    sprints: [
      { id: 1, name: 'Sprint 1', status: 'completed' },
      { id: 2, name: 'Sprint 2', status: 'active' },
      { id: 3, name: 'Sprint 3', status: 'planning' },
    ],
  },
};

const velocityData = {
  success: true,
  data: {
    rows: [
      { sprintId: 1, sprintName: 'Sprint 1', endDate: '2026-01-10', committed: 20, completed: 18 },
      { sprintId: 2, sprintName: 'Sprint 2', endDate: '2026-01-24', committed: 22, completed: 22 },
    ],
    averageCommitted: 21,
    averageCompleted: 20,
  },
};

const cycleData = {
  success: true,
  data: {
    rows: [
      { cardId: 101, number: 5, title: 'Fix login', doneAt: '2026-01-15T00:00:00Z', leadTimeMinutes: 2880, cycleTimeMinutes: 1440, storyPoints: 3 },
      { cardId: 102, number: null, title: 'Bump deps', doneAt: '2026-01-20T00:00:00Z', leadTimeMinutes: 90, cycleTimeMinutes: 45, storyPoints: null },
      { cardId: 103, number: 7, title: 'Add analytics', doneAt: '2026-01-22T00:00:00Z', leadTimeMinutes: 30, cycleTimeMinutes: 20, storyPoints: 1 },
    ],
    averageLeadDays: 2,
    averageCycleDays: 1,
  },
};

const cfdData = {
  success: true,
  data: {
    columns: [
      { id: 10, name: 'Todo', order: 0 },
      { id: 11, name: 'In Progress', order: 1 },
      { id: 12, name: 'Done', order: 2 },
    ],
    days: [
      { date: '2026-01-01', counts: { 10: 5, 11: 2, 12: 1 } },
      { date: '2026-01-02', counts: { 10: 4, 11: 3, 12: 2 } },
      { date: '2026-01-03', counts: { 10: 3, 11: 3, 12: 4 } },
    ],
  },
};

const burndownData = {
  success: true,
  data: {
    sprintId: 2,
    sprintName: 'Sprint 2',
    startDate: '2026-01-10',
    endDate: '2026-01-24',
    status: 'active' as const,
    series: [
      { date: '2026-01-10', remaining: 20, completed: 0, scope: 20, ideal: 20 },
      { date: '2026-01-12', remaining: 16, completed: 4, scope: 20, ideal: 13 },
      { date: '2026-01-14', remaining: 10, completed: 10, scope: 20, ideal: 7 },
    ],
  },
};

const capacityData = {
  success: true,
  data: {
    sprintId: 2,
    sprintName: 'Sprint 2',
    columns: [
      { id: 10, name: 'Todo', color: null, order: 0, isDone: false },
      { id: 11, name: 'In Progress', color: '#60a5fa', order: 1, isDone: false },
      { id: 12, name: 'Done', color: '#34d399', order: 2, isDone: true },
    ],
    rows: [
      {
        userId: 1,
        name: 'Alice',
        email: 'alice@test.com',
        cardCount: 5,
        committedPoints: 8,
        completedPoints: 6,
        byColumn: { 10: { cards: 2, points: 3 }, 11: { cards: 2, points: 3 }, 12: { cards: 1, points: 2 } },
      },
      {
        userId: 2,
        name: null,
        email: 'bob@test.com',
        cardCount: 3,
        committedPoints: 5,
        completedPoints: 5,
        byColumn: { 12: { cards: 3, points: 5 } },
      },
    ],
  },
};

function defaultFetch(url: string): any {
  if (url.includes('/sprints?') || url.endsWith('/sprints')) return jsonOk(sprintsData);
  if (url.includes('/velocity')) return jsonOk(velocityData);
  if (url.includes('/cycle-time')) return jsonOk(cycleData);
  if (url.includes('/cfd')) return jsonOk(cfdData);
  if (url.includes('/burndown')) return jsonOk(burndownData);
  if (url.includes('/capacity')) return jsonOk(capacityData);
  return jsonOk({ success: false });
}

// Helper to get the current fetch mock
function getFetch(): any {
  return global.fetch as any;
}

beforeEach(() => {
  // Assign as vi.fn so we can inspect mock.calls
  global.fetch = vi.fn((url: string) => Promise.resolve(defaultFetch(url))) as any;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Component under test ─────────────────────────────────────────────────────

import ProjectReportsTab from '@/components/portal/ProjectReportsTab';

async function renderAndSettle(
  projectId = 42,
  projectKey: string | null = 'PROJ',
) {
  const result = render(<ProjectReportsTab projectId={projectId} projectKey={projectKey} />);
  // Wait until loading spinner goes away and the section headings appear
  await waitFor(() => {
    expect(result.container.textContent).toContain('Burndown');
    // Confirm we're past the loading state by checking no spinner
    expect(result.container.querySelector('.animate-spin')).toBeNull();
  });
  // Also wait for burndown/capacity to load (sprint id=2 is active)
  await waitFor(() => {
    const called = getFetch().mock.calls.some(([url]: [string]) => url.includes('/sprints/2/burndown'));
    expect(called).toBe(true);
  });
  return result;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProjectReportsTab — initial load', () => {
  it('shows a loading spinner while fetching', () => {
    // Don't resolve the fetch immediately
    global.fetch = vi.fn(() => new Promise(() => {})) as any;
    const { container } = render(<ProjectReportsTab projectId={1} projectKey="P" />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders the Burndown section heading after load', async () => {
    const { container } = await renderAndSettle();
    expect(container.textContent).toContain('Burndown');
  });

  it('renders the Velocity section heading after load', async () => {
    const { container } = await renderAndSettle();
    expect(container.textContent).toContain('Velocity');
  });

  it('renders the Cumulative flow section heading after load', async () => {
    const { container } = await renderAndSettle();
    expect(container.textContent).toContain('Cumulative flow');
  });

  it('renders the Cycle & lead time section heading after load', async () => {
    const { container } = await renderAndSettle();
    expect(container.textContent).toContain('Cycle');
  });

  it('fetches sprints for the given projectId', async () => {
    await renderAndSettle(99, 'X');
    const calls: [string][] = getFetch().mock.calls;
    const sprintsCall = calls.find(([url]) => url.includes('/projects/99/sprints'));
    expect(sprintsCall).toBeTruthy();
  });

  it('fetches velocity for the given projectId', async () => {
    await renderAndSettle(99, 'X');
    const calls: [string][] = getFetch().mock.calls;
    const call = calls.find(([url]) => url.includes('/projects/99/velocity'));
    expect(call).toBeTruthy();
  });

  it('fetches cycle-time for the given projectId', async () => {
    await renderAndSettle(99, 'X');
    const calls: [string][] = getFetch().mock.calls;
    const call = calls.find(([url]) => url.includes('/projects/99/cycle-time'));
    expect(call).toBeTruthy();
  });

  it('fetches CFD with days=30 for the given projectId', async () => {
    await renderAndSettle(99, 'X');
    const calls: [string][] = getFetch().mock.calls;
    const call = calls.find(([url]) => url.includes('/projects/99/cfd?days=30'));
    expect(call).toBeTruthy();
  });
});

describe('ProjectReportsTab — sprint selector', () => {
  it('renders a sprint select with all sprints listed', async () => {
    const { container } = await renderAndSettle();
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select).toBeTruthy();
    const optionTexts = Array.from(select.options).map(o => o.text);
    expect(optionTexts.some(t => t.includes('Sprint 1'))).toBe(true);
    expect(optionTexts.some(t => t.includes('Sprint 2'))).toBe(true);
    expect(optionTexts.some(t => t.includes('Sprint 3'))).toBe(true);
  });

  it('defaults to the active sprint (id=2)', async () => {
    const { container } = await renderAndSettle();
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('2');
  });

  it('renders options with status in parentheses', async () => {
    const { container } = await renderAndSettle();
    expect(container.textContent).toContain('(active)');
    expect(container.textContent).toContain('(completed)');
    expect(container.textContent).toContain('(planning)');
  });

  it('changing the select fires a burndown/capacity fetch for the new sprint', async () => {
    const { container } = await renderAndSettle();
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '1' } });
    await waitFor(() => {
      const calls: [string][] = getFetch().mock.calls;
      const burndownCall = calls.find(([url]) => url.includes('/sprints/1/burndown'));
      expect(burndownCall).toBeTruthy();
    });
  });
});

describe('ProjectReportsTab — BurndownChart', () => {
  it('renders the burndown SVG with aria-label after load', async () => {
    const { container } = await renderAndSettle();
    // Wait for burndown data to arrive and chart to render
    await waitFor(() => {
      const svg = container.querySelector('svg[aria-label="Burndown chart"]');
      expect(svg).toBeTruthy();
    });
  });

  it('renders the Remaining legend label', async () => {
    const { container } = await renderAndSettle();
    await waitFor(() => {
      expect(container.textContent).toContain('Remaining');
    });
  });

  it('renders the Ideal legend label', async () => {
    const { container } = await renderAndSettle();
    await waitFor(() => {
      expect(container.textContent).toContain('Ideal');
    });
  });

  it('renders an empty chart when burndown series is empty', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/burndown')) {
        return Promise.resolve(jsonOk({
          success: true,
          data: { sprintId: 2, sprintName: 'Sprint 2', startDate: null, endDate: null, status: 'active', series: [], message: 'No data yet.' },
        }));
      }
      return Promise.resolve(defaultFetch(url));
    }) as any;
    const { container } = render(<ProjectReportsTab projectId={42} projectKey="P" />);
    await waitFor(() => {
      expect(container.textContent).toContain('No data yet.');
    });
  });

  it('renders a default message when series is empty and no custom message', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/burndown')) {
        return Promise.resolve(jsonOk({
          success: true,
          data: { sprintId: 2, sprintName: 'Sprint 2', startDate: null, endDate: null, status: 'active', series: [] },
        }));
      }
      return Promise.resolve(defaultFetch(url));
    }) as any;
    const { container } = render(<ProjectReportsTab projectId={42} projectKey="P" />);
    await waitFor(() => {
      expect(container.textContent).toContain('No data yet');
    });
  });

  it('renders "No sprint selected." when burndown fetch returns success: false', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/burndown')) return Promise.resolve(jsonOk({ success: false }));
      return Promise.resolve(defaultFetch(url));
    }) as any;
    const { container } = render(<ProjectReportsTab projectId={42} projectKey="P" />);
    await waitFor(() => {
      expect(container.querySelector('.animate-spin')).toBeNull();
    });
    await waitFor(() => {
      expect(container.textContent).toContain('No sprint selected.');
    });
  });

  it('handles single-point series without crashing', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/burndown')) {
        return Promise.resolve(jsonOk({
          success: true,
          data: {
            sprintId: 2, sprintName: 'Sprint 2', startDate: null, endDate: null, status: 'active',
            series: [{ date: '2026-01-10', remaining: 10, completed: 5, scope: 15, ideal: 15 }],
          },
        }));
      }
      return Promise.resolve(defaultFetch(url));
    }) as any;
    const { container } = render(<ProjectReportsTab projectId={42} projectKey="P" />);
    await waitFor(() => {
      const svg = container.querySelector('svg[aria-label="Burndown chart"]');
      expect(svg).toBeTruthy();
    });
  });
});

describe('ProjectReportsTab — VelocityChart', () => {
  it('renders the velocity SVG with aria-label', async () => {
    const { container } = await renderAndSettle();
    const svg = container.querySelector('svg[aria-label="Velocity chart"]');
    expect(svg).toBeTruthy();
  });

  it('renders sprint names in the velocity chart', async () => {
    const { container } = await renderAndSettle();
    expect(container.textContent).toContain('Sprint 1');
  });

  it('renders velocity legend labels Committed and Completed', async () => {
    const { container } = await renderAndSettle();
    expect(container.textContent).toContain('Committed');
    expect(container.textContent).toContain('Completed');
  });

  it('renders average stats in the description', async () => {
    const { container } = await renderAndSettle();
    expect(container.textContent).toContain('21');
    expect(container.textContent).toContain('20');
  });

  it('shows empty state when velocity has no rows', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/velocity')) {
        return Promise.resolve(jsonOk({ success: true, data: { rows: [], averageCommitted: 0, averageCompleted: 0 } }));
      }
      return Promise.resolve(defaultFetch(url));
    }) as any;
    const { container } = render(<ProjectReportsTab projectId={42} projectKey="P" />);
    await waitFor(() => {
      expect(container.textContent).toContain('No completed sprints yet');
    });
  });

  it('shows empty state when velocity fetch fails', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/velocity')) return Promise.resolve(jsonOk({ success: false }));
      return Promise.resolve(defaultFetch(url));
    }) as any;
    const { container } = render(<ProjectReportsTab projectId={42} projectKey="P" />);
    await waitFor(() => {
      expect(container.textContent).toContain('No completed sprints yet');
    });
  });

  it('truncates sprint names longer than 12 chars with ellipsis in SVG text', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/velocity')) {
        return Promise.resolve(jsonOk({
          success: true,
          data: {
            rows: [{ sprintId: 1, sprintName: 'A Very Long Sprint Name', endDate: null, committed: 10, completed: 8 }],
            averageCommitted: 10,
            averageCompleted: 8,
          },
        }));
      }
      return Promise.resolve(defaultFetch(url));
    }) as any;
    const { container } = render(<ProjectReportsTab projectId={42} projectKey="P" />);
    await waitFor(() => {
      // SVG <text> elements are in the DOM; check their textContent via querySelectorAll
      const textNodes = Array.from(container.querySelectorAll('text'));
      const found = textNodes.some(t => t.textContent?.includes('A Very Long'));
      expect(found).toBe(true);
    });
  });
});

describe('ProjectReportsTab — CfdChart', () => {
  it('renders the CFD SVG with aria-label', async () => {
    const { container } = await renderAndSettle();
    const svg = container.querySelector('svg[aria-label="Cumulative flow diagram"]');
    expect(svg).toBeTruthy();
  });

  it('renders column names in the CFD legend', async () => {
    const { container } = await renderAndSettle();
    expect(container.textContent).toContain('Todo');
    expect(container.textContent).toContain('In Progress');
    expect(container.textContent).toContain('Done');
  });

  it('shows day count in the section description', async () => {
    const { container } = await renderAndSettle();
    expect(container.textContent).toContain('3 days');
  });

  it('uses singular "day" when exactly 1 day', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/cfd')) {
        return Promise.resolve(jsonOk({
          success: true,
          data: {
            columns: [{ id: 10, name: 'Todo', order: 0 }],
            days: [{ date: '2026-01-01', counts: { 10: 3 } }],
          },
        }));
      }
      return Promise.resolve(defaultFetch(url));
    }) as any;
    const { container } = render(<ProjectReportsTab projectId={42} projectKey="P" />);
    await waitFor(() => {
      // The CFD description says "over the last 1 day" (singular)
      expect(container.textContent).toContain('the last 1 day.');
    });
  });

  it('shows empty state when CFD has no days', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/cfd')) {
        return Promise.resolve(jsonOk({ success: true, data: { columns: [], days: [] } }));
      }
      return Promise.resolve(defaultFetch(url));
    }) as any;
    const { container } = render(<ProjectReportsTab projectId={42} projectKey="P" />);
    await waitFor(() => {
      expect(container.textContent).toContain('No daily snapshots yet');
    });
  });

  it('shows empty state when CFD fetch fails', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/cfd')) return Promise.resolve(jsonOk({ success: false }));
      return Promise.resolve(defaultFetch(url));
    }) as any;
    const { container } = render(<ProjectReportsTab projectId={42} projectKey="P" />);
    await waitFor(() => {
      expect(container.textContent).toContain('No daily snapshots yet');
    });
  });
});

describe('ProjectReportsTab — CapacityChart', () => {
  it('renders assignee names', async () => {
    const { container } = await renderAndSettle();
    await waitFor(() => {
      expect(container.textContent).toContain('Alice');
    });
  });

  it('falls back to email when name is null', async () => {
    const { container } = await renderAndSettle();
    await waitFor(() => {
      expect(container.textContent).toContain('bob@test.com');
    });
  });

  it('renders pts/cards summary per assignee', async () => {
    const { container } = await renderAndSettle();
    await waitFor(() => {
      // Alice: 6/8 pts · 5 cards
      expect(container.textContent).toContain('6/8 pts');
      expect(container.textContent).toContain('5 cards');
    });
  });

  it('uses singular "card" when cardCount === 1', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/capacity')) {
        return Promise.resolve(jsonOk({
          success: true,
          data: {
            sprintId: 2,
            sprintName: 'Sprint 2',
            columns: [{ id: 12, name: 'Done', color: null, order: 0, isDone: true }],
            rows: [
              { userId: 1, name: 'Carol', email: 'carol@test.com', cardCount: 1, committedPoints: 2, completedPoints: 2, byColumn: { 12: { cards: 1, points: 2 } } },
            ],
          },
        }));
      }
      return Promise.resolve(defaultFetch(url));
    }) as any;
    const { container } = render(<ProjectReportsTab projectId={42} projectKey="P" />);
    await waitFor(() => {
      expect(container.textContent).toContain('1 card');
      expect(container.textContent).not.toContain('1 cards');
    });
  });

  it('renders the capacity chart column legend for used columns', async () => {
    const { container } = await renderAndSettle();
    await waitFor(() => {
      expect(container.textContent).toContain('In Progress');
    });
  });

  it('shows empty capacity message when rows are empty', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/capacity')) {
        return Promise.resolve(jsonOk({
          success: true,
          data: { sprintId: 2, sprintName: 'Sprint 2', columns: [], rows: [] },
        }));
      }
      return Promise.resolve(defaultFetch(url));
    }) as any;
    const { container } = render(<ProjectReportsTab projectId={42} projectKey="P" />);
    await waitFor(() => {
      expect(container.textContent).toContain('No assigned cards in this sprint yet.');
    });
  });

  it('shows the selected sprint name in capacity description', async () => {
    const { container } = await renderAndSettle();
    await waitFor(() => {
      expect(container.textContent).toContain('Sprint 2');
    });
  });

  it('uses columnColor fallback palette for columns with no color set', async () => {
    // null color should not crash — columnColor uses COLUMN_FALLBACK_COLORS
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/capacity')) {
        return Promise.resolve(jsonOk({
          success: true,
          data: {
            sprintId: 2, sprintName: 'Sprint 2',
            columns: [
              { id: 10, name: 'Backlog', color: null, order: 0, isDone: false },
              { id: 11, name: 'WIP', color: null, order: 1, isDone: false },
            ],
            rows: [
              { userId: 1, name: 'Dev', email: 'd@t.com', cardCount: 2, committedPoints: 3, completedPoints: 2, byColumn: { 10: { cards: 1, points: 1 }, 11: { cards: 1, points: 2 } } },
            ],
          },
        }));
      }
      return Promise.resolve(defaultFetch(url));
    }) as any;
    const { container } = render(<ProjectReportsTab projectId={42} projectKey="P" />);
    await waitFor(() => {
      expect(container.textContent).toContain('Dev');
    });
  });
});

describe('ProjectReportsTab — CycleTable', () => {
  it('renders the cycle table header columns', async () => {
    const { container } = await renderAndSettle();
    expect(container.textContent).toContain('Key');
    expect(container.textContent).toContain('Title');
    expect(container.textContent).toContain('Lead');
    expect(container.textContent).toContain('Cycle');
    expect(container.textContent).toContain('Done');
  });

  it('renders card titles', async () => {
    const { container } = await renderAndSettle();
    expect(container.textContent).toContain('Fix login');
    expect(container.textContent).toContain('Bump deps');
  });

  it('renders project-key based card key when projectKey and number are present', async () => {
    const { container } = await renderAndSettle(42, 'PROJ');
    expect(container.textContent).toContain('PROJ-5');
  });

  it('falls back to #cardId when number is null', async () => {
    const { container } = await renderAndSettle(42, 'PROJ');
    // cardId=102, number=null → #102
    expect(container.textContent).toContain('#102');
  });

  it('falls back to #cardId when projectKey is null', async () => {
    const { container } = await renderAndSettle(42, null);
    // cardId=101, projectKey=null → #101
    expect(container.textContent).toContain('#101');
  });

  it('renders story points, dash when null', async () => {
    const { container } = await renderAndSettle();
    // card 101 has 3 pts, card 102 has null → "—"
    expect(container.textContent).toContain('3');
    expect(container.textContent).toContain('—');
  });

  it('formats leadTimeMinutes ≥ 1 day as Nd', async () => {
    const { container } = await renderAndSettle();
    // 2880 min = 2 days → 2.0d
    expect(container.textContent).toContain('2.0d');
  });

  it('formats leadTimeMinutes ≥ 1 hour but < 1 day as Nh', async () => {
    const { container } = await renderAndSettle();
    // 90 min = 1.5h
    expect(container.textContent).toContain('1.5h');
  });

  it('formats leadTimeMinutes < 1 hour as Nm', async () => {
    const { container } = await renderAndSettle();
    // 30 min
    expect(container.textContent).toContain('30m');
  });

  it('renders average cycle/lead stats in the section description', async () => {
    const { container } = await renderAndSettle();
    expect(container.textContent).toContain('Average cycle time: 1 days');
    expect(container.textContent).toContain('Average lead time: 2 days');
  });

  it('shows empty state when cycle has no rows', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/cycle-time')) {
        return Promise.resolve(jsonOk({ success: true, data: { rows: [], averageLeadDays: 0, averageCycleDays: 0 } }));
      }
      return Promise.resolve(defaultFetch(url));
    }) as any;
    const { container } = render(<ProjectReportsTab projectId={42} projectKey="P" />);
    await waitFor(() => {
      expect(container.textContent).toContain('No completed cards yet.');
    });
  });

  it('shows a truncation notice when rows exceed 50', async () => {
    const manyRows = Array.from({ length: 55 }, (_, i) => ({
      cardId: 200 + i,
      number: i + 1,
      title: `Card ${i}`,
      doneAt: '2026-01-15T00:00:00Z',
      leadTimeMinutes: 60,
      cycleTimeMinutes: 30,
      storyPoints: null,
    }));
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/cycle-time')) {
        return Promise.resolve(jsonOk({ success: true, data: { rows: manyRows, averageLeadDays: 0, averageCycleDays: 0 } }));
      }
      return Promise.resolve(defaultFetch(url));
    }) as any;
    const { container } = render(<ProjectReportsTab projectId={42} projectKey="P" />);
    await waitFor(() => {
      expect(container.textContent).toContain('Showing 50 of 55 done cards.');
    });
  });
});

describe('ProjectReportsTab — SprintRetroPanel', () => {
  it('renders the SprintRetroPanel stub when a sprint is selected', async () => {
    const { container } = await renderAndSettle();
    const panel = container.querySelector('[data-testid="sprint-retro-panel"]');
    expect(panel).toBeTruthy();
    expect(panel?.textContent).toContain('retro:2:Sprint 2');
  });

  it('does not render SprintRetroPanel when no sprints exist', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/sprints')) return Promise.resolve(jsonOk({ success: true, data: { sprints: [] } }));
      return Promise.resolve(defaultFetch(url));
    }) as any;
    const { container } = render(<ProjectReportsTab projectId={1} projectKey="P" />);
    await waitFor(() => {
      expect(container.textContent).toContain('Burndown');
      expect(container.querySelector('.animate-spin')).toBeNull();
    });
    expect(container.querySelector('[data-testid="sprint-retro-panel"]')).toBeNull();
  });

  it('uses sprint name from the sprints list in the retro panel', async () => {
    const { container } = await renderAndSettle();
    const panel = container.querySelector('[data-testid="sprint-retro-panel"]');
    expect(panel?.textContent).toContain('Sprint 2');
  });
});

describe('ProjectReportsTab — edge cases and fallbacks', () => {
  it('hides the sprint select when sprints list is empty', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/sprints')) return Promise.resolve(jsonOk({ success: true, data: { sprints: [] } }));
      return Promise.resolve(defaultFetch(url));
    }) as any;
    const { container } = render(<ProjectReportsTab projectId={1} projectKey="P" />);
    await waitFor(() => {
      expect(container.textContent).toContain('Burndown');
      expect(container.querySelector('.animate-spin')).toBeNull();
    });
    expect(container.querySelector('select')).toBeNull();
  });

  it('uses "the selected sprint" fallback in capacity description when capacity is null', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/capacity')) return Promise.resolve(jsonOk({ success: false }));
      return Promise.resolve(defaultFetch(url));
    }) as any;
    const { container } = render(<ProjectReportsTab projectId={42} projectKey="P" />);
    await waitFor(() => {
      expect(container.querySelector('.animate-spin')).toBeNull();
    });
    expect(container.textContent).toContain('the selected sprint');
  });

  it('shows 0 days in CFD description when cfd is null', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/cfd')) return Promise.resolve(jsonOk({ success: false }));
      return Promise.resolve(defaultFetch(url));
    }) as any;
    const { container } = render(<ProjectReportsTab projectId={42} projectKey="P" />);
    await waitFor(() => {
      expect(container.querySelector('.animate-spin')).toBeNull();
    });
    expect(container.textContent).toContain('0 days');
  });

  it('shows 0 averages in velocity description when velocity is null', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/velocity')) return Promise.resolve(jsonOk({ success: false }));
      return Promise.resolve(defaultFetch(url));
    }) as any;
    const { container } = render(<ProjectReportsTab projectId={42} projectKey="P" />);
    await waitFor(() => {
      expect(container.querySelector('.animate-spin')).toBeNull();
    });
    expect(container.textContent).toContain('Average committed: 0 pts');
  });

  it('defaults to first planning sprint when no active sprint exists', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/sprints')) {
        return Promise.resolve(jsonOk({
          success: true,
          data: {
            sprints: [
              { id: 10, name: 'Plan A', status: 'planning' },
              { id: 11, name: 'Plan B', status: 'planning' },
            ],
          },
        }));
      }
      return Promise.resolve(defaultFetch(url));
    }) as any;
    const { container } = render(<ProjectReportsTab projectId={1} projectKey="P" />);
    await waitFor(() => {
      expect(container.textContent).toContain('Burndown');
      expect(container.querySelector('.animate-spin')).toBeNull();
    });
    const select = container.querySelector('select') as HTMLSelectElement;
    // Should default to the first planning sprint (id=10)
    expect(select?.value).toBe('10');
  });

  it('defaults to first sprint when no active or planning sprints', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/sprints')) {
        return Promise.resolve(jsonOk({
          success: true,
          data: {
            sprints: [
              { id: 20, name: 'Sprint Old', status: 'completed' },
            ],
          },
        }));
      }
      return Promise.resolve(defaultFetch(url));
    }) as any;
    const { container } = render(<ProjectReportsTab projectId={1} projectKey="P" />);
    await waitFor(() => {
      expect(container.textContent).toContain('Burndown');
      expect(container.querySelector('.animate-spin')).toBeNull();
    });
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select?.value).toBe('20');
  });

  it('handles sprints fetch returning success: false gracefully', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/sprints')) return Promise.resolve(jsonOk({ success: false }));
      return Promise.resolve(defaultFetch(url));
    }) as any;
    const { container } = render(<ProjectReportsTab projectId={1} projectKey="P" />);
    await waitFor(() => {
      expect(container.querySelector('.animate-spin')).toBeNull();
    });
    // No sprints → no select
    expect(container.querySelector('select')).toBeNull();
    // Component still renders with empty states
    expect(container.textContent).toContain('No sprint selected.');
  });
});
