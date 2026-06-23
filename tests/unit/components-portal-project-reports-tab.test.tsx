// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock SprintRetroPanel — it has its own fetch calls and is tested elsewhere.
// ---------------------------------------------------------------------------
vi.mock('@/components/portal/SprintRetroPanel', () => ({
  default: function SprintRetroPanel({ sprintName }: { sprintId: number; sprintName: string }) {
    return <div data-testid="sprint-retro-panel">Retro: {sprintName}</div>;
  },
}));

import ProjectReportsTab from '@/components/portal/ProjectReportsTab';

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const PROJECT_ID = 7;

const SPRINT_ACTIVE: { id: number; name: string; status: 'active' } = {
  id: 10,
  name: 'Sprint 1',
  status: 'active',
};

const SPRINT_PLANNING: { id: number; name: string; status: 'planning' } = {
  id: 11,
  name: 'Sprint 2',
  status: 'planning',
};

const SPRINT_COMPLETED: { id: number; name: string; status: 'completed' } = {
  id: 9,
  name: 'Sprint 0',
  status: 'completed',
};

const BURNDOWN_PAYLOAD = {
  sprintId: 10,
  sprintName: 'Sprint 1',
  startDate: '2026-01-01',
  endDate: '2026-01-14',
  status: 'active' as const,
  series: [
    { date: '2026-01-01', remaining: 20, completed: 0, scope: 20, ideal: 20 },
    { date: '2026-01-07', remaining: 10, completed: 10, scope: 20, ideal: 10 },
    { date: '2026-01-14', remaining: 0, completed: 20, scope: 20, ideal: 0 },
  ],
};

const BURNDOWN_EMPTY = {
  sprintId: 10,
  sprintName: 'Sprint 1',
  startDate: null,
  endDate: null,
  status: 'planning' as const,
  series: [],
  message: 'No events recorded yet.',
};

const VELOCITY_PAYLOAD = {
  rows: [
    { sprintId: 9, sprintName: 'Sprint 0', endDate: '2026-01-14', committed: 20, completed: 18 },
    { sprintId: 10, sprintName: 'Sprint 1', endDate: '2026-01-28', committed: 22, completed: 22 },
  ],
  averageCommitted: 21,
  averageCompleted: 20,
};

const VELOCITY_EMPTY: { rows: never[]; averageCommitted: number; averageCompleted: number } = {
  rows: [],
  averageCommitted: 0,
  averageCompleted: 0,
};

const CYCLE_PAYLOAD = {
  rows: [
    {
      cardId: 1,
      number: 42,
      title: 'Fix login bug',
      doneAt: '2026-01-10T00:00:00Z',
      leadTimeMinutes: 2880,
      cycleTimeMinutes: 1440,
      storyPoints: 3,
    },
    {
      cardId: 2,
      number: null,
      title: 'Refactor auth',
      doneAt: '2026-01-11T00:00:00Z',
      leadTimeMinutes: 120,
      cycleTimeMinutes: 60,
      storyPoints: null,
    },
  ],
  averageLeadDays: 1.0,
  averageCycleDays: 0.5,
};

const CYCLE_EMPTY: { rows: never[]; averageLeadDays: number; averageCycleDays: number } = {
  rows: [],
  averageLeadDays: 0,
  averageCycleDays: 0,
};

const CFD_PAYLOAD = {
  columns: [
    { id: 1, name: 'To Do', order: 0 },
    { id: 2, name: 'In Progress', order: 1 },
  ],
  days: [
    { date: '2026-01-01', counts: { 1: 5, 2: 2 } },
    { date: '2026-01-02', counts: { 1: 4, 2: 3 } },
  ],
};

const CFD_EMPTY: { columns: never[]; days: never[] } = { columns: [], days: [] };

const CAPACITY_PAYLOAD = {
  sprintId: 10,
  sprintName: 'Sprint 1',
  columns: [
    { id: 1, name: 'To Do', color: '#94a3b8', order: 0, isDone: false },
    { id: 2, name: 'Done', color: null, order: 1, isDone: true },
  ],
  rows: [
    {
      userId: 1,
      name: 'Alice',
      email: 'alice@example.com',
      cardCount: 5,
      committedPoints: 10,
      completedPoints: 8,
      byColumn: { 1: { cards: 3, points: 6 }, 2: { cards: 2, points: 4 } },
    },
    {
      userId: 2,
      name: null,
      email: 'bob@example.com',
      cardCount: 3,
      committedPoints: 6,
      completedPoints: 6,
      byColumn: { 2: { cards: 3, points: 6 } },
    },
  ],
};

const CAPACITY_EMPTY = {
  sprintId: 10,
  sprintName: 'Sprint 1',
  columns: [],
  rows: [],
};

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

function makeJson(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

type FetchOverrides = {
  sprints?: { id: number; name: string; status: 'planning' | 'active' | 'completed' }[];
  velocity?: typeof VELOCITY_PAYLOAD | typeof VELOCITY_EMPTY;
  cycle?: typeof CYCLE_PAYLOAD | typeof CYCLE_EMPTY;
  cfd?: typeof CFD_PAYLOAD | typeof CFD_EMPTY;
  burndown?: typeof BURNDOWN_PAYLOAD | typeof BURNDOWN_EMPTY;
  capacity?: typeof CAPACITY_PAYLOAD | typeof CAPACITY_EMPTY;
  retroSuccess?: boolean;
};

function setupFetch(overrides: FetchOverrides = {}) {
  const {
    sprints = [SPRINT_ACTIVE],
    velocity = VELOCITY_PAYLOAD,
    cycle = CYCLE_PAYLOAD,
    cfd = CFD_PAYLOAD,
    burndown = BURNDOWN_PAYLOAD,
    capacity = CAPACITY_PAYLOAD,
    retroSuccess = false,
  } = overrides;

  global.fetch = vi.fn((url: string) => {
    const s = String(url);
    // Sprint-specific sub-resources — must be checked before the project sprints list
    if (/\/sprints\/\d+\/burndown/.test(s)) {
      return makeJson({ success: true, data: burndown });
    }
    if (/\/sprints\/\d+\/capacity/.test(s)) {
      return makeJson({ success: true, data: capacity });
    }
    if (/\/sprints\/\d+\/retro/.test(s)) {
      return makeJson({ success: retroSuccess, data: null });
    }
    // Project-level resources
    if (s.includes(`/projects/${PROJECT_ID}/sprints`)) {
      return makeJson({ success: true, data: { sprints } });
    }
    if (s.includes('/velocity')) {
      return makeJson({ success: true, data: velocity });
    }
    if (s.includes('/cycle-time')) {
      return makeJson({ success: true, data: cycle });
    }
    if (s.includes('/cfd')) {
      return makeJson({ success: true, data: cfd });
    }
    return makeJson({ success: false });
  }) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('ProjectReportsTab — loading state', () => {
  it('shows loading spinner while initial fetch is in-flight', async () => {
    let resolveAll: (v: unknown) => void = () => {};
    const pending = new Promise((res) => { resolveAll = res; });
    global.fetch = vi.fn(() => pending) as unknown as typeof fetch;

    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);
    expect(screen.getByText('refresh')).toBeTruthy();

    act(() => {
      resolveAll({ ok: true, json: () => Promise.resolve({ success: false }) });
    });
  });

  it('removes loading spinner after fetch resolves', async () => {
    setupFetch();
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() =>
      expect(screen.queryByText('refresh')).toBeNull(),
    );
  });
});

// ---------------------------------------------------------------------------
// Section headings always present
// ---------------------------------------------------------------------------

describe('ProjectReportsTab — section headings', () => {
  it('renders all six section headings after load', async () => {
    setupFetch();
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() => {
      expect(screen.getByText('Burndown')).toBeTruthy();
      expect(screen.getByText('Capacity by assignee')).toBeTruthy();
      expect(screen.getByText('Velocity')).toBeTruthy();
      expect(screen.getByText('Sprint retrospective')).toBeTruthy();
      expect(screen.getByText('Cumulative flow')).toBeTruthy();
      expect(screen.getByRole('heading', { name: /Cycle.*lead time/i })).toBeTruthy();
    });
  });

  it('does not render retrospective section when no active sprint', async () => {
    setupFetch({ sprints: [] });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey={null} />);

    await waitFor(() => expect(screen.queryByText('Sprint retrospective')).toBeNull());
  });
});

// ---------------------------------------------------------------------------
// Fetch calls — correct URLs
// ---------------------------------------------------------------------------

describe('ProjectReportsTab — fetch calls', () => {
  it('fetches sprints, velocity, cycle-time, and cfd on mount', async () => {
    setupFetch();
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() => screen.queryByText('refresh') === null);

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => String(c[0]),
    );

    expect(calls.some((u) => u.includes(`/projects/${PROJECT_ID}/sprints`))).toBe(true);
    expect(calls.some((u) => u.includes('/velocity'))).toBe(true);
    expect(calls.some((u) => u.includes('/cycle-time'))).toBe(true);
    expect(calls.some((u) => u.includes('/cfd'))).toBe(true);
  });

  it('fetches burndown and capacity for the active sprint', async () => {
    setupFetch({ sprints: [SPRINT_ACTIVE] });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => String(c[0]),
      );
      expect(calls.some((u) => u.includes(`/sprints/${SPRINT_ACTIVE.id}/burndown`))).toBe(true);
      expect(calls.some((u) => u.includes(`/sprints/${SPRINT_ACTIVE.id}/capacity`))).toBe(true);
    });
  });

  it('defaults to planning sprint when no active sprint present', async () => {
    setupFetch({ sprints: [SPRINT_COMPLETED, SPRINT_PLANNING] });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => String(c[0]),
      );
      expect(calls.some((u) => u.includes(`/sprints/${SPRINT_PLANNING.id}/burndown`))).toBe(true);
    });
  });

  it('defaults to first sprint when no active or planning sprint present', async () => {
    setupFetch({ sprints: [SPRINT_COMPLETED] });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => String(c[0]),
      );
      expect(calls.some((u) => u.includes(`/sprints/${SPRINT_COMPLETED.id}/burndown`))).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Sprint selector
// ---------------------------------------------------------------------------

describe('ProjectReportsTab — sprint selector', () => {
  it('renders a sprint selector when sprints are present', async () => {
    setupFetch({ sprints: [SPRINT_ACTIVE, SPRINT_PLANNING] });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() => {
      const select = screen.getByRole('combobox');
      expect(select).toBeTruthy();
    });
  });

  it('does not render sprint selector when sprint list is empty', async () => {
    setupFetch({ sprints: [] });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey={null} />);

    await waitFor(() => screen.queryByText('refresh') === null);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('renders one option per sprint with name and status', async () => {
    setupFetch({ sprints: [SPRINT_ACTIVE, SPRINT_PLANNING] });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() => {
      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(2);
      expect(options[0].textContent).toContain('Sprint 1');
      expect(options[0].textContent).toContain('active');
    });
  });

  it('changing sprint selector triggers new burndown + capacity fetch', async () => {
    setupFetch({ sprints: [SPRINT_ACTIVE, SPRINT_PLANNING] });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() => screen.getByRole('combobox'));

    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), {
        target: { value: String(SPRINT_PLANNING.id) },
      });
    });

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => String(c[0]),
      );
      expect(calls.some((u) => u.includes(`/sprints/${SPRINT_PLANNING.id}/burndown`))).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Burndown chart
// ---------------------------------------------------------------------------

describe('ProjectReportsTab — burndown chart', () => {
  it('renders Burndown SVG when series data is present', async () => {
    setupFetch({ burndown: BURNDOWN_PAYLOAD });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() => {
      const svg = screen.getByRole('img', { name: /Burndown chart/i });
      expect(svg).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('renders empty state when burndown series is empty', async () => {
    setupFetch({ burndown: BURNDOWN_EMPTY });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() =>
      expect(screen.getByText(/No events recorded yet/i)).toBeTruthy(),
    { timeout: 3000 });
  });

  it('renders "No sprint selected" empty state when no burndown data', async () => {
    // Force burndown fetch to return success:false so burndown stays null
    global.fetch = vi.fn((url: string) => {
      const s = String(url);
      if (/\/sprints\/\d+\/burndown/.test(s) || /\/sprints\/\d+\/capacity/.test(s)) {
        return makeJson({ success: false });
      }
      if (s.includes(`/projects/${PROJECT_ID}/sprints`)) {
        return makeJson({ success: true, data: { sprints: [SPRINT_ACTIVE] } });
      }
      if (s.includes('/velocity')) return makeJson({ success: true, data: VELOCITY_EMPTY });
      if (s.includes('/cycle-time')) return makeJson({ success: true, data: CYCLE_EMPTY });
      if (s.includes('/cfd')) return makeJson({ success: true, data: CFD_EMPTY });
      return makeJson({ success: false });
    }) as unknown as typeof fetch;

    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() =>
      expect(screen.getByText(/No sprint selected/i)).toBeTruthy(),
    );
  });

  it('renders legend labels Remaining and Ideal', async () => {
    setupFetch({ burndown: BURNDOWN_PAYLOAD });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() => {
      expect(screen.getByText('Remaining')).toBeTruthy();
      expect(screen.getByText('Ideal')).toBeTruthy();
    }, { timeout: 3000 });
  });
});

// ---------------------------------------------------------------------------
// Velocity chart
// ---------------------------------------------------------------------------

describe('ProjectReportsTab — velocity chart', () => {
  it('renders Velocity SVG when rows are present', async () => {
    setupFetch({ velocity: VELOCITY_PAYLOAD });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() => {
      const svg = screen.getByRole('img', { name: /Velocity chart/i });
      expect(svg).toBeTruthy();
    });
  });

  it('shows velocity averages in description text', async () => {
    setupFetch({ velocity: VELOCITY_PAYLOAD });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() => {
      expect(screen.getByText(/Average committed: 21 pts/i)).toBeTruthy();
      expect(screen.getByText(/Average completed: 20 pts/i)).toBeTruthy();
    });
  });

  it('shows "0 completed sprints" message when velocity rows empty', async () => {
    setupFetch({ velocity: VELOCITY_EMPTY });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() =>
      expect(
        screen.getByText(/No completed sprints yet/i),
      ).toBeTruthy(),
    );
  });

  it('shows "Last 0 completed sprints" when velocity is empty', async () => {
    setupFetch({ velocity: VELOCITY_EMPTY });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() =>
      expect(screen.getByText(/Last 0 completed sprints/i)).toBeTruthy(),
    );
  });

  it('renders Committed and Completed legend entries', async () => {
    setupFetch({ velocity: VELOCITY_PAYLOAD });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() => {
      expect(screen.getByText('Committed')).toBeTruthy();
      expect(screen.getByText('Completed')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Cumulative flow diagram
// ---------------------------------------------------------------------------

describe('ProjectReportsTab — CFD chart', () => {
  it('renders CFD SVG when days are present', async () => {
    setupFetch({ cfd: CFD_PAYLOAD });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() => {
      const svg = screen.getByRole('img', { name: /Cumulative flow diagram/i });
      expect(svg).toBeTruthy();
    });
  });

  it('shows CFD empty state when no days', async () => {
    setupFetch({ cfd: CFD_EMPTY });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() =>
      expect(screen.getByText(/No daily snapshots yet/i)).toBeTruthy(),
    );
  });

  it('renders column names in CFD legend', async () => {
    setupFetch({ cfd: CFD_PAYLOAD });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() => {
      // getByText('To Do') would match the SVG <title> tooltip AND the legend span,
      // so use getAllByText and assert at least one match exists.
      expect(screen.getAllByText('To Do').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('In Progress').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows day count in the CFD description', async () => {
    setupFetch({ cfd: CFD_PAYLOAD });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() =>
      expect(screen.getByText(/2 days/)).toBeTruthy(),
    );
  });

  it('shows "0 days" in description when cfd is null', async () => {
    global.fetch = vi.fn((url: string) => {
      const s = String(url);
      if (/\/sprints\/\d+\/burndown/.test(s)) return makeJson({ success: true, data: BURNDOWN_PAYLOAD });
      if (/\/sprints\/\d+\/capacity/.test(s)) return makeJson({ success: true, data: CAPACITY_PAYLOAD });
      if (s.includes(`/projects/${PROJECT_ID}/sprints`)) {
        return makeJson({ success: true, data: { sprints: [SPRINT_ACTIVE] } });
      }
      if (s.includes('/cfd')) return makeJson({ success: false });
      if (s.includes('/velocity')) return makeJson({ success: true, data: VELOCITY_PAYLOAD });
      if (s.includes('/cycle-time')) return makeJson({ success: true, data: CYCLE_PAYLOAD });
      return makeJson({ success: false });
    }) as unknown as typeof fetch;

    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() =>
      expect(screen.getByText(/0 days/)).toBeTruthy(),
    );
  });
});

// ---------------------------------------------------------------------------
// Capacity chart
// ---------------------------------------------------------------------------

describe('ProjectReportsTab — capacity chart', () => {
  it('renders assignee names when capacity rows are present', async () => {
    setupFetch({ capacity: CAPACITY_PAYLOAD });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    // Longer timeout: this render chains several fetches and flakes at the
    // default 1s when the whole unit suite runs in parallel.
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeTruthy();
      // Bob has name=null so falls back to email
      expect(screen.getByText('bob@example.com')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('shows "No assigned cards" empty state when rows are empty', async () => {
    setupFetch({ capacity: CAPACITY_EMPTY });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() =>
      expect(screen.getByText(/No assigned cards in this sprint yet/i)).toBeTruthy(),
    );
  });

  it('renders capacity points and card count text', async () => {
    setupFetch({ capacity: CAPACITY_PAYLOAD });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    // Longer timeout: flakes at the default 1s under parallel suite load.
    await waitFor(
      () =>
        // Alice: 8/10 pts · 5 cards
        expect(screen.getByText(/8\/10 pts · 5 cards/)).toBeTruthy(),
      { timeout: 5000 },
    );
  });

  it('shows sprint name in capacity description', async () => {
    setupFetch({ capacity: CAPACITY_PAYLOAD });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() =>
      expect(screen.getByText(/Cards per teammate in Sprint 1/i)).toBeTruthy(),
    );
  });

  it('renders column legend entries for used columns', async () => {
    setupFetch({ capacity: CAPACITY_PAYLOAD });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() => {
      // "Done" appears as a legend entry — both columns are used
      expect(screen.getByText('Done')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Cycle / lead time table
// ---------------------------------------------------------------------------

describe('ProjectReportsTab — cycle table', () => {
  it('renders card titles in the cycle table', async () => {
    setupFetch({ cycle: CYCLE_PAYLOAD });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() => {
      expect(screen.getByText('Fix login bug')).toBeTruthy();
      expect(screen.getByText('Refactor auth')).toBeTruthy();
    });
  });

  it('renders project key + number as card key when projectKey is set', async () => {
    setupFetch({ cycle: CYCLE_PAYLOAD });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() => expect(screen.getByText('PROJ-42')).toBeTruthy());
  });

  it('renders #cardId when projectKey is null or number is null', async () => {
    setupFetch({ cycle: CYCLE_PAYLOAD });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey={null} />);

    await waitFor(() => {
      // cardId=1 has number=42 — without projectKey: '#1'
      expect(screen.getByText('#1')).toBeTruthy();
      // cardId=2 has number=null
      expect(screen.getByText('#2')).toBeTruthy();
    });
  });

  it('renders story points and dash for null points', async () => {
    setupFetch({ cycle: CYCLE_PAYLOAD });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() => {
      expect(screen.getByText('3')).toBeTruthy();
      expect(screen.getByText('—')).toBeTruthy();
    });
  });

  it('formats lead/cycle time in days for values >= 1440 minutes', async () => {
    setupFetch({ cycle: CYCLE_PAYLOAD });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    // leadTimeMinutes=2880 = 2 days → "2.0d"; cycleTimeMinutes=1440 = 1 day → "1.0d"
    await waitFor(() => {
      expect(screen.getByText('2.0d')).toBeTruthy();
      expect(screen.getByText('1.0d')).toBeTruthy();
    });
  });

  it('formats lead/cycle time in hours for values >= 60 but < 1440 minutes', async () => {
    setupFetch({
      cycle: {
        rows: [
          {
            cardId: 5,
            number: 5,
            title: 'Hour card',
            doneAt: '2026-01-12T00:00:00Z',
            leadTimeMinutes: 120,
            cycleTimeMinutes: 90,
            storyPoints: 1,
          },
        ],
        averageLeadDays: 0.1,
        averageCycleDays: 0.06,
      },
    });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() => {
      expect(screen.getByText('2.0h')).toBeTruthy();
      expect(screen.getByText('1.5h')).toBeTruthy();
    });
  });

  it('formats lead/cycle time in minutes for values < 60', async () => {
    setupFetch({
      cycle: {
        rows: [
          {
            cardId: 6,
            number: 6,
            title: 'Minute card',
            doneAt: '2026-01-13T00:00:00Z',
            leadTimeMinutes: 30,
            cycleTimeMinutes: 15,
            storyPoints: null,
          },
        ],
        averageLeadDays: 0.02,
        averageCycleDays: 0.01,
      },
    });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() => {
      expect(screen.getByText('30m')).toBeTruthy();
      expect(screen.getByText('15m')).toBeTruthy();
    });
  });

  it('shows cycle averages in description', async () => {
    setupFetch({ cycle: CYCLE_PAYLOAD });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() =>
      expect(screen.getByText(/Average cycle time: 0.5 days/i)).toBeTruthy(),
    );
  });

  it('shows "No completed cards yet" empty state when cycle rows empty', async () => {
    setupFetch({ cycle: CYCLE_EMPTY });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() =>
      expect(screen.getByText(/No completed cards yet/i)).toBeTruthy(),
    );
  });

  it('shows "Showing 50 of N done cards" footer when rows > 50', async () => {
    const manyRows = Array.from({ length: 55 }, (_, i) => ({
      cardId: i + 1,
      number: i + 1,
      title: `Card ${i + 1}`,
      doneAt: '2026-01-10T00:00:00Z',
      leadTimeMinutes: 60,
      cycleTimeMinutes: 30,
      storyPoints: 1,
    }));
    setupFetch({ cycle: { rows: manyRows, averageLeadDays: 0, averageCycleDays: 0 } });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() =>
      expect(screen.getByText(/Showing 50 of 55 done cards/i)).toBeTruthy(),
    );
  });
});

// ---------------------------------------------------------------------------
// Sprint retrospective section
// ---------------------------------------------------------------------------

describe('ProjectReportsTab — sprint retro', () => {
  it('renders SprintRetroPanel with the active sprint name', async () => {
    setupFetch({ sprints: [SPRINT_ACTIVE] });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() =>
      expect(screen.getByText(/Retro: Sprint 1/)).toBeTruthy(),
    );
  });

  it('renders SprintRetroPanel with fallback name when sprint not in list', async () => {
    // Only SPRINT_PLANNING in list; active defaults to SPRINT_PLANNING; name should be "Sprint 2"
    setupFetch({ sprints: [SPRINT_PLANNING] });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() =>
      expect(screen.getByText(/Retro: Sprint 2/)).toBeTruthy(),
    );
  });
});

// ---------------------------------------------------------------------------
// Error / partial-failure resilience
// ---------------------------------------------------------------------------

describe('ProjectReportsTab — fetch error resilience', () => {
  it('still renders sections when velocity returns success:false', async () => {
    // The component's load() has try/finally but no catch — a rejected Promise.all
    // causes an unhandled rejection that pollutes the test run. Instead exercise
    // the success:false branch which takes the same empty-velocity code path.
    global.fetch = vi.fn((url: string) => {
      const s = String(url);
      if (/\/sprints\/\d+\/burndown/.test(s)) return makeJson({ success: true, data: BURNDOWN_PAYLOAD });
      if (/\/sprints\/\d+\/capacity/.test(s)) return makeJson({ success: true, data: CAPACITY_PAYLOAD });
      if (s.includes(`/projects/${PROJECT_ID}/sprints`)) {
        return makeJson({ success: true, data: { sprints: [SPRINT_ACTIVE] } });
      }
      if (s.includes('/velocity')) return makeJson({ success: false });
      if (s.includes('/cycle-time')) return makeJson({ success: true, data: CYCLE_PAYLOAD });
      if (s.includes('/cfd')) return makeJson({ success: true, data: CFD_PAYLOAD });
      return makeJson({ success: false });
    }) as unknown as typeof fetch;

    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() => expect(screen.queryByText('refresh')).toBeNull());
    expect(screen.getByText('Burndown')).toBeTruthy();
    // Velocity section shows empty state when data is absent
    expect(screen.getByText(/No completed sprints yet/i)).toBeTruthy();
  });

  it('shows empty velocity state when velocity returns success:false', async () => {
    setupFetch({ velocity: VELOCITY_EMPTY });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() =>
      expect(screen.getByText(/No completed sprints yet/i)).toBeTruthy(),
    );
  });

  it('handles empty sprints list gracefully — no selector, no retro', async () => {
    setupFetch({ sprints: [] });
    render(<ProjectReportsTab projectId={PROJECT_ID} projectKey="PROJ" />);

    await waitFor(() => screen.queryByText('refresh') === null);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByTestId('sprint-retro-panel')).toBeNull();
  });
});
