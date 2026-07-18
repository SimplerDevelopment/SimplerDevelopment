// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import React from 'react';

import ProjectRecurrencesPanel from '@/components/portal/ProjectRecurrencesPanel';

// ---------------------------------------------------------------------------
// Types mirrored from the component (local only — not exported)
// ---------------------------------------------------------------------------
type Cadence = 'daily' | 'weekly' | 'monthly';

interface Recurrence {
  id: number;
  projectId: number;
  columnId: number;
  templateId: number | null;
  titlePattern: string | null;
  description: string | null;
  cadence: Cadence;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  hourUtc: number;
  active: boolean;
  lastFiredAt: string | null;
  lastFiredCardId: number | null;
  nextFireAt: string;
}

interface Column {
  id: number;
  name: string;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const PROJECT_ID = 7;
const NEXT_FIRE = '2026-12-01T09:00:00.000Z';

function makeRecurrence(overrides: Partial<Recurrence> = {}): Recurrence {
  return {
    id: 1,
    projectId: PROJECT_ID,
    columnId: 10,
    templateId: null,
    titlePattern: 'Standup {{date}}',
    description: null,
    cadence: 'weekly',
    dayOfWeek: 1,
    dayOfMonth: null,
    hourUtc: 9,
    active: true,
    lastFiredAt: null,
    lastFiredCardId: null,
    nextFireAt: NEXT_FIRE,
    ...overrides,
  };
}

function makeColumn(overrides: Partial<Column> = {}): Column {
  return { id: 10, name: 'To Do', ...overrides };
}

function makeJsonResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  });
}

// ---------------------------------------------------------------------------
// Fetch mock helpers
// The component fires three fetches on mount:
//   1. GET /api/portal/projects/:id/recurrences
//   2. GET /api/portal/projects/:id/sprints
//   3. GET /api/portal/projects/:id
// ---------------------------------------------------------------------------
function setupFetch({
  recurrences = [] as Recurrence[],
  columns = [] as Column[],
  sprints = { success: true, data: { sprints: [], backlog: [] } },
  toggleBody = { success: true },
  deleteBody = { success: true },
  addBody = { success: true },
}: {
  recurrences?: Recurrence[];
  columns?: Column[];
  sprints?: unknown;
  toggleBody?: unknown;
  deleteBody?: unknown;
  addBody?: unknown;
} = {}) {
  global.fetch = vi.fn((url: string, init?: RequestInit) => {
    const urlStr = String(url);
    const method = (init?.method ?? 'GET').toUpperCase();

    if (method === 'GET') {
      if (urlStr.includes('/recurrences')) {
        return makeJsonResponse({ success: true, data: recurrences });
      }
      if (urlStr.includes('/sprints')) {
        return makeJsonResponse(sprints);
      }
      // Project board call
      return makeJsonResponse({
        success: true,
        data: { columns: columns.map((c) => ({ id: c.id, name: c.name })) },
      });
    }

    if (method === 'POST') {
      return makeJsonResponse(addBody);
    }

    if (method === 'PATCH') {
      return makeJsonResponse(toggleBody);
    }

    if (method === 'DELETE') {
      return makeJsonResponse(deleteBody);
    }

    return makeJsonResponse({ success: true });
  }) as typeof global.fetch;
}

// ---------------------------------------------------------------------------
// Mount helpers — wait for loading spinner to disappear
// ---------------------------------------------------------------------------
async function mountAndWait(props: { projectId?: number; canEdit?: boolean } = {}) {
  const { projectId = PROJECT_ID, canEdit = true } = props;
  const result = render(<ProjectRecurrencesPanel projectId={projectId} canEdit={canEdit} />);
  // Wait for "Loading…" to disappear
  await waitFor(() =>
    expect(screen.queryByText('Loading…')).toBeNull(),
  );
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  setupFetch();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Initial render / loading state
// ---------------------------------------------------------------------------
describe('ProjectRecurrencesPanel — initial render', () => {
  it('renders the section heading', async () => {
    await mountAndWait();
    expect(screen.getByText('Recurring tasks')).toBeInTheDocument();
  });

  it('shows "Loading…" while fetching', () => {
    // Don't resolve — keep it in loading state
    global.fetch = vi.fn(() => new Promise(() => {})) as typeof global.fetch;
    render(<ProjectRecurrencesPanel projectId={PROJECT_ID} canEdit />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows empty-state message when no recurrences', async () => {
    await mountAndWait();
    expect(screen.getByText(/No recurring tasks yet/i)).toBeInTheDocument();
  });

  it('renders description paragraph', async () => {
    await mountAndWait();
    expect(
      screen.getByText(/Auto-create cards on a schedule/i),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. Recurrence list rendering
// ---------------------------------------------------------------------------
describe('ProjectRecurrencesPanel — list rendering', () => {
  it('renders a recurrence title', async () => {
    setupFetch({ recurrences: [makeRecurrence()] });
    await mountAndWait();
    expect(screen.getByText('Standup {{date}}')).toBeInTheDocument();
  });

  it('renders "(template-driven)" for null titlePattern', async () => {
    setupFetch({ recurrences: [makeRecurrence({ titlePattern: null })] });
    await mountAndWait();
    expect(screen.getByText('(template-driven)')).toBeInTheDocument();
  });

  it('renders multiple recurrences', async () => {
    setupFetch({
      recurrences: [
        makeRecurrence({ id: 1, titlePattern: 'Daily standup' }),
        makeRecurrence({ id: 2, titlePattern: 'Weekly review' }),
      ],
    });
    await mountAndWait();
    expect(screen.getByText('Daily standup')).toBeInTheDocument();
    expect(screen.getByText('Weekly review')).toBeInTheDocument();
  });

  it('shows next fire date for each recurrence', async () => {
    setupFetch({ recurrences: [makeRecurrence()] });
    await mountAndWait();
    // The date is formatted via toLocaleString — just check "next:" prefix is rendered
    expect(screen.getByText(/next:/i)).toBeInTheDocument();
  });

  it('does not show empty-state message when recurrences exist', async () => {
    setupFetch({ recurrences: [makeRecurrence()] });
    await mountAndWait();
    expect(screen.queryByText(/No recurring tasks yet/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Schedule description helper (describeSchedule)
// ---------------------------------------------------------------------------
describe('ProjectRecurrencesPanel — schedule descriptions', () => {
  it('shows "Daily at" for daily cadence', async () => {
    setupFetch({ recurrences: [makeRecurrence({ cadence: 'daily', hourUtc: 8 })] });
    await mountAndWait();
    expect(screen.getByText(/Daily at 08:00 UTC/i)).toBeInTheDocument();
  });

  it('shows "Weekly · Mon" for weekly on Monday', async () => {
    setupFetch({ recurrences: [makeRecurrence({ cadence: 'weekly', dayOfWeek: 1, hourUtc: 9 })] });
    await mountAndWait();
    expect(screen.getByText(/Weekly · Mon 09:00 UTC/i)).toBeInTheDocument();
  });

  it('shows "Weekly · Fri" for weekly on Friday', async () => {
    setupFetch({ recurrences: [makeRecurrence({ cadence: 'weekly', dayOfWeek: 5, hourUtc: 14 })] });
    await mountAndWait();
    expect(screen.getByText(/Weekly · Fri 14:00 UTC/i)).toBeInTheDocument();
  });

  it('shows "Monthly · day 15" for monthly on day 15', async () => {
    setupFetch({ recurrences: [makeRecurrence({ cadence: 'monthly', dayOfMonth: 15, hourUtc: 6 })] });
    await mountAndWait();
    expect(screen.getByText(/Monthly · day 15 06:00 UTC/i)).toBeInTheDocument();
  });

  it('falls back to day 1 for weekly with null dayOfWeek', async () => {
    setupFetch({ recurrences: [makeRecurrence({ cadence: 'weekly', dayOfWeek: null, hourUtc: 9 })] });
    await mountAndWait();
    expect(screen.getByText(/Weekly · Mon 09:00 UTC/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4. canEdit guard — New button visibility
// ---------------------------------------------------------------------------
describe('ProjectRecurrencesPanel — canEdit guard', () => {
  it('shows "New" button when canEdit=true', async () => {
    await mountAndWait({ canEdit: true });
    expect(screen.getByRole('button', { name: /New/i })).toBeInTheDocument();
  });

  it('hides "New" button when canEdit=false', async () => {
    await mountAndWait({ canEdit: false });
    expect(screen.queryByRole('button', { name: /New/i })).toBeNull();
  });

  it('hides pause/delete buttons when canEdit=false', async () => {
    setupFetch({ recurrences: [makeRecurrence()] });
    await mountAndWait({ canEdit: false });
    expect(screen.queryByTitle('Pause')).toBeNull();
    expect(screen.queryByTitle('Delete')).toBeNull();
  });

  it('shows pause/delete buttons when canEdit=true', async () => {
    setupFetch({ recurrences: [makeRecurrence({ active: true })] });
    await mountAndWait({ canEdit: true });
    expect(screen.getByTitle('Pause')).toBeInTheDocument();
    expect(screen.getByTitle('Delete')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 5. New form — toggle
// ---------------------------------------------------------------------------
describe('ProjectRecurrencesPanel — form toggle', () => {
  it('clicking "New" shows the recurrence form', async () => {
    await mountAndWait();
    fireEvent.click(screen.getByRole('button', { name: /New/i }));
    expect(screen.getByPlaceholderText('Standup {{date}}')).toBeInTheDocument();
  });

  it('clicking "Cancel" (New toggled) hides the form', async () => {
    await mountAndWait();
    fireEvent.click(screen.getByRole('button', { name: /New/i }));
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(screen.queryByPlaceholderText('Standup {{date}}')).toBeNull();
  });

  it('form shows Title pattern input', async () => {
    await mountAndWait();
    fireEvent.click(screen.getByRole('button', { name: /New/i }));
    expect(screen.getByPlaceholderText('Standup {{date}}')).toBeInTheDocument();
  });

  it('form shows Column select with default "Choose…" option', async () => {
    await mountAndWait();
    fireEvent.click(screen.getByRole('button', { name: /New/i }));
    const selects = screen.getAllByRole('combobox');
    const columnSelect = selects.find(
      (s) => s.querySelector('option[value=""]')?.textContent === 'Choose…',
    );
    expect(columnSelect).toBeTruthy();
  });

  it('form shows columns from API in the column select', async () => {
    setupFetch({ columns: [makeColumn({ id: 10, name: 'Backlog' })] });
    await mountAndWait();
    fireEvent.click(screen.getByRole('button', { name: /New/i }));
    expect(screen.getByRole('option', { name: 'Backlog' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 6. Form — cadence-dependent fields
// ---------------------------------------------------------------------------
describe('ProjectRecurrencesPanel — cadence fields', () => {
  async function openForm() {
    await mountAndWait();
    fireEvent.click(screen.getByRole('button', { name: /New/i }));
  }

  it('shows "Day" select when cadence is weekly (default)', async () => {
    await openForm();
    // The day-of-week select has DAYS options (Sun, Mon, …)
    expect(screen.getByRole('option', { name: 'Mon' })).toBeInTheDocument();
  });

  it('hides day-of-week select when cadence is daily', async () => {
    await openForm();
    const cadenceSelect = screen.getAllByRole('combobox').find(
      (s) => s.querySelector('option[value="daily"]'),
    )!;
    fireEvent.change(cadenceSelect, { target: { value: 'daily' } });
    expect(screen.queryByRole('option', { name: 'Mon' })).toBeNull();
  });

  it('shows "Day of month" input when cadence is monthly', async () => {
    await openForm();
    const cadenceSelect = screen.getAllByRole('combobox').find(
      (s) => s.querySelector('option[value="monthly"]'),
    )!;
    fireEvent.change(cadenceSelect, { target: { value: 'monthly' } });
    expect(screen.getByText('Day of month (1–28)')).toBeInTheDocument();
  });

  it('hides day-of-month input when cadence is weekly', async () => {
    await openForm();
    const cadenceSelect = screen.getAllByRole('combobox').find(
      (s) => s.querySelector('option[value="monthly"]'),
    )!;
    // Switch to monthly, then back to weekly
    fireEvent.change(cadenceSelect, { target: { value: 'monthly' } });
    fireEvent.change(cadenceSelect, { target: { value: 'weekly' } });
    expect(screen.queryByText('Day of month (1–28)')).toBeNull();
  });

  it('renders Hour (UTC) input', async () => {
    await openForm();
    expect(screen.getByText('Hour (UTC, 0–23)')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 7. Form submission
// ---------------------------------------------------------------------------
describe('ProjectRecurrencesPanel — form submission', () => {
  async function openFormFilled(extra: Record<string, unknown> = {}) {
    setupFetch({
      columns: [makeColumn({ id: 10, name: 'To Do' })],
      addBody: { success: true },
      ...extra,
    });
    await mountAndWait();
    fireEvent.click(screen.getByRole('button', { name: /New/i }));

    // Fill title
    fireEvent.change(screen.getByPlaceholderText('Standup {{date}}'), {
      target: { value: 'Daily standups' },
    });

    // Pick column
    const selects = screen.getAllByRole('combobox');
    const colSelect = selects.find(
      (s) => s.querySelector('option[value="10"]'),
    )!;
    fireEvent.change(colSelect, { target: { value: '10' } });
  }

  it('POSTs to the recurrences endpoint on valid submit', async () => {
    await openFormFilled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add recurrence/i }));
    });
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const postCall = calls.find(
        (c) =>
          String(c[0]).includes('/recurrences') &&
          (c[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
    });
  });

  it('includes columnId, titlePattern, cadence in POST body', async () => {
    await openFormFilled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add recurrence/i }));
    });
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const postCall = calls.find(
        (c) =>
          String(c[0]).includes('/recurrences') &&
          (c[1] as RequestInit | undefined)?.method === 'POST',
      );
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body.columnId).toBe(10);
      expect(body.titlePattern).toBe('Daily standups');
      expect(body.cadence).toBe('weekly');
    });
  });

  it('closes the form after successful submit', async () => {
    await openFormFilled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add recurrence/i }));
    });
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Standup {{date}}')).toBeNull();
    });
  });

  it('does not submit when titlePattern is empty', async () => {
    setupFetch({ columns: [makeColumn()] });
    await mountAndWait();
    fireEvent.click(screen.getByRole('button', { name: /New/i }));
    // Pick column but leave title empty
    const selects = screen.getAllByRole('combobox');
    const colSelect = selects.find((s) => s.querySelector('option[value="10"]'))!;
    if (colSelect) fireEvent.change(colSelect, { target: { value: '10' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add recurrence/i }));
    });

    // No POST call
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const postCalls = calls.filter(
      (c) => (c[1] as RequestInit | undefined)?.method === 'POST',
    );
    expect(postCalls.length).toBe(0);
  });

  it('sends dayOfWeek for weekly cadence', async () => {
    await openFormFilled();
    // Change day-of-week to Friday (5)
    const daySelects = screen.getAllByRole('combobox');
    const daySelect = daySelects.find((s) => s.querySelector('option[value="5"]'));
    if (daySelect) fireEvent.change(daySelect, { target: { value: '5' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add recurrence/i }));
    });
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const postCall = calls.find(
        (c) =>
          String(c[0]).includes('/recurrences') &&
          (c[1] as RequestInit | undefined)?.method === 'POST',
      );
      if (postCall) {
        const body = JSON.parse((postCall[1] as RequestInit).body as string);
        expect(body.dayOfWeek).toBeTruthy();
        expect(body.dayOfMonth).toBeNull();
      }
    });
  });

  it('shows "Saving…" while POST is in flight', async () => {
    let resolveFetch!: (v: unknown) => void;
    const pendingFetch = new Promise((r) => { resolveFetch = r; });
    // Initial GET calls resolve immediately; POST is pending
    let callCount = 0;
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET') {
        callCount++;
        if (callCount === 1) return makeJsonResponse({ success: true, data: [] });
        if (callCount === 2) return makeJsonResponse({ success: true, data: { sprints: [], backlog: [] } });
        return makeJsonResponse({ success: true, data: { columns: [{ id: 10, name: 'To Do' }] } });
      }
      return pendingFetch;
    }) as typeof global.fetch;

    await mountAndWait();
    fireEvent.click(screen.getByRole('button', { name: /New/i }));
    fireEvent.change(screen.getByPlaceholderText('Standup {{date}}'), {
      target: { value: 'Check' },
    });
    const selects = screen.getAllByRole('combobox');
    const colSelect = selects.find((s) => s.querySelector('option[value="10"]'));
    if (colSelect) fireEvent.change(colSelect, { target: { value: '10' } });

    fireEvent.click(screen.getByRole('button', { name: /Add recurrence/i }));
    expect(screen.getByRole('button', { name: /Saving…/i })).toBeInTheDocument();
    // Resolve to avoid act() warning
    resolveFetch({ ok: true, json: () => Promise.resolve({ success: true }) });
  });
});

// ---------------------------------------------------------------------------
// 8. Toggle active/pause
// ---------------------------------------------------------------------------
describe('ProjectRecurrencesPanel — toggle active', () => {
  it('PATCHes with active=false when pause button is clicked on active recurrence', async () => {
    setupFetch({ recurrences: [makeRecurrence({ active: true })] });
    await mountAndWait();
    await act(async () => {
      fireEvent.click(screen.getByTitle('Pause'));
    });
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const patchCall = calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse((patchCall![1] as RequestInit).body as string);
      expect(body.active).toBe(false);
    });
  });

  it('PATCHes with active=true when resume button is clicked on inactive recurrence', async () => {
    setupFetch({ recurrences: [makeRecurrence({ active: false })] });
    await mountAndWait();
    await act(async () => {
      fireEvent.click(screen.getByTitle('Resume'));
    });
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const patchCall = calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse((patchCall![1] as RequestInit).body as string);
      expect(body.active).toBe(true);
    });
  });

  it('shows "Pause" title for active recurrence', async () => {
    setupFetch({ recurrences: [makeRecurrence({ active: true })] });
    await mountAndWait();
    expect(screen.getByTitle('Pause')).toBeInTheDocument();
  });

  it('shows "Resume" title for inactive recurrence', async () => {
    setupFetch({ recurrences: [makeRecurrence({ active: false })] });
    await mountAndWait();
    expect(screen.getByTitle('Resume')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 9. Delete recurrence
// ---------------------------------------------------------------------------
describe('ProjectRecurrencesPanel — delete', () => {
  it('shows confirm dialog before deleting', async () => {
    setupFetch({ recurrences: [makeRecurrence()] });
    await mountAndWait();
    await act(async () => {
      fireEvent.click(screen.getByTitle('Delete'));
    });
    expect(window.confirm).toHaveBeenCalledWith('Delete this recurrence?');
  });

  it('DELETEs to recurrences/:id when confirmed', async () => {
    setupFetch({ recurrences: [makeRecurrence({ id: 99 })] });
    await mountAndWait();
    await act(async () => {
      fireEvent.click(screen.getByTitle('Delete'));
    });
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const delCall = calls.find(
        (c) =>
          String(c[0]).includes('/recurrences/99') &&
          (c[1] as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(delCall).toBeTruthy();
    });
  });

  it('does not DELETE when user cancels confirm', async () => {
    (window.confirm as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    setupFetch({ recurrences: [makeRecurrence({ id: 99 })] });
    await mountAndWait();
    await act(async () => {
      fireEvent.click(screen.getByTitle('Delete'));
    });
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const delCall = calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === 'DELETE',
    );
    expect(delCall).toBeUndefined();
  });

  it('reloads the list after delete', async () => {
    setupFetch({ recurrences: [makeRecurrence({ id: 99 })] });
    await mountAndWait();

    // After delete, re-setup fetch with empty list
    setupFetch({ recurrences: [] });

    await act(async () => {
      fireEvent.click(screen.getByTitle('Delete'));
    });
    await waitFor(() => {
      expect(screen.getByText(/No recurring tasks yet/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// 10. Column population from sprint fallback
// ---------------------------------------------------------------------------
describe('ProjectRecurrencesPanel — column source fallback', () => {
  it('falls back to sprint-derived columns when project board call fails', async () => {
    let callCount = 0;
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method !== 'GET') return makeJsonResponse({ success: true });
      callCount++;
      if (callCount === 1) return makeJsonResponse({ success: true, data: [] }); // recurrences
      if (callCount === 2) {
        // sprints with column info
        return makeJsonResponse({
          success: true,
          data: {
            sprints: [
              {
                cards: [{ columnId: 20, columnName: 'Sprint Column' }],
              },
            ],
            backlog: [],
          },
        });
      }
      // Board call fails
      return makeJsonResponse({ success: false });
    }) as typeof global.fetch;

    await mountAndWait();
    fireEvent.click(screen.getByRole('button', { name: /New/i }));
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Sprint Column' })).toBeInTheDocument();
    });
  });
});
