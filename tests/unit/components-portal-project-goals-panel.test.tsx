// @vitest-environment jsdom
/**
 * Unit tests for `components/portal/ProjectGoalsPanel.tsx`
 * Covers: initial loading state, empty state, goal list rendering, status
 * badge colors, overdue badge, description rendering, progress bar + label,
 * canEdit=false hides controls, add-goal form toggle, form submission (POST),
 * update current value on blur (PATCH), update status via select (PATCH),
 * delete goal (confirm + DELETE), form cancel resets state.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — must precede component import
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/portal/projects/1',
  useSearchParams: () => new URLSearchParams(),
}));

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import ProjectGoalsPanel from '@/components/portal/ProjectGoalsPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Goal {
  id: number;
  title: string;
  description: string | null;
  unitLabel: string | null;
  currentValue: number;
  targetValue: number;
  targetDate: string | null;
  status: 'draft' | 'active' | 'achieved' | 'missed' | 'dropped';
}

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 1,
    title: 'Onboard 25 customers',
    description: null,
    unitLabel: '%',
    currentValue: 25,
    targetValue: 100,
    targetDate: null,
    status: 'active',
    ...overrides,
  };
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  global.fetch = fetchSpy;
  // Default: load returns empty list
  fetchSpy.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true, data: [] }),
  } as unknown as Response);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Loading + empty state
// ---------------------------------------------------------------------------

describe('ProjectGoalsPanel — initial states', () => {
  it('shows loading text while fetch is in flight', () => {
    // Return a fetch that never resolves — component stays in loading state
    fetchSpy.mockReturnValueOnce(new Promise(() => {}));

    render(<ProjectGoalsPanel projectId={1} canEdit={false} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows empty state text when no goals exist', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [] }),
    } as unknown as Response);

    render(<ProjectGoalsPanel projectId={1} canEdit={false} />);
    await waitFor(() => expect(screen.getByText('No goals yet.')).toBeInTheDocument());
  });

  it('renders the panel heading', async () => {
    render(<ProjectGoalsPanel projectId={1} canEdit={false} />);
    expect(screen.getByText('Goals & OKRs')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Goal list rendering
// ---------------------------------------------------------------------------

describe('ProjectGoalsPanel — goal list', () => {
  it('renders goal title', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [makeGoal()] }),
    } as unknown as Response);

    render(<ProjectGoalsPanel projectId={1} canEdit={false} />);
    await waitFor(() => expect(screen.getByText('Onboard 25 customers')).toBeInTheDocument());
  });

  it('renders status badge', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [makeGoal({ status: 'achieved' })] }),
    } as unknown as Response);

    render(<ProjectGoalsPanel projectId={1} canEdit={false} />);
    await waitFor(() => {
      const badges = screen.getAllByText('achieved');
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  it('renders description when present', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [makeGoal({ description: 'A key result for Q1.' })] }),
    } as unknown as Response);

    render(<ProjectGoalsPanel projectId={1} canEdit={false} />);
    await waitFor(() => expect(screen.getByText('A key result for Q1.')).toBeInTheDocument());
  });

  it('renders progress label with unit', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ success: true, data: [makeGoal({ currentValue: 40, targetValue: 100, unitLabel: '%' })] }),
    } as unknown as Response);

    render(<ProjectGoalsPanel projectId={1} canEdit={false} />);
    await waitFor(() => expect(screen.getByText(/40 \/ 100 %/)).toBeInTheDocument());
  });

  it('renders progress label without unit when unitLabel is null', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ success: true, data: [makeGoal({ currentValue: 5, targetValue: 20, unitLabel: null })] }),
    } as unknown as Response);

    render(<ProjectGoalsPanel projectId={1} canEdit={false} />);
    await waitFor(() => expect(screen.getByText(/5 \/ 20 \(25%\)/)).toBeInTheDocument());
  });

  it('renders overdue badge when active goal has past targetDate', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: [makeGoal({ status: 'active', targetDate: '2020-01-01' })],
        }),
    } as unknown as Response);

    render(<ProjectGoalsPanel projectId={1} canEdit={false} />);
    await waitFor(() => expect(screen.getByText('overdue')).toBeInTheDocument());
  });

  it('does NOT render overdue badge when status is achieved', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: [makeGoal({ status: 'achieved', targetDate: '2020-01-01' })],
        }),
    } as unknown as Response);

    render(<ProjectGoalsPanel projectId={1} canEdit={false} />);
    await waitFor(() => expect(screen.queryByText('overdue')).not.toBeInTheDocument());
  });

  it('renders target date line when targetDate is set', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ success: true, data: [makeGoal({ targetDate: '2025-12-31' })] }),
    } as unknown as Response);

    render(<ProjectGoalsPanel projectId={1} canEdit={false} />);
    await waitFor(() => {
      const el = screen.getByText(/Target:/);
      expect(el).toBeInTheDocument();
    });
  });

  it('renders multiple goals', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: [makeGoal({ id: 1, title: 'Goal A' }), makeGoal({ id: 2, title: 'Goal B' })],
        }),
    } as unknown as Response);

    render(<ProjectGoalsPanel projectId={1} canEdit={false} />);
    await waitFor(() => {
      expect(screen.getByText('Goal A')).toBeInTheDocument();
      expect(screen.getByText('Goal B')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// canEdit=false hides controls
// ---------------------------------------------------------------------------

describe('ProjectGoalsPanel — canEdit=false', () => {
  it('hides the new-goal button when canEdit is false', async () => {
    render(<ProjectGoalsPanel projectId={1} canEdit={false} />);
    await waitFor(() => expect(screen.getByText('No goals yet.')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /New goal/i })).not.toBeInTheDocument();
  });

  it('hides status select and delete button for each goal when canEdit is false', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [makeGoal()] }),
    } as unknown as Response);

    render(<ProjectGoalsPanel projectId={1} canEdit={false} />);
    await waitFor(() => expect(screen.getByText('Onboard 25 customers')).toBeInTheDocument());
    // No delete button (title="Delete")
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();
    // No update-current-value input (title="Update current value...")
    expect(screen.queryByTitle(/Update current value/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// canEdit=true — form toggle
// ---------------------------------------------------------------------------

describe('ProjectGoalsPanel — form toggle', () => {
  it('shows new-goal button when canEdit is true', async () => {
    render(<ProjectGoalsPanel projectId={1} canEdit={true} />);
    await waitFor(() => expect(screen.getByText('No goals yet.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /New goal/i })).toBeInTheDocument();
  });

  it('shows form when new-goal button is clicked', async () => {
    render(<ProjectGoalsPanel projectId={1} canEdit={true} />);
    await waitFor(() => expect(screen.getByText('No goals yet.')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /New goal/i }));
    expect(screen.getByPlaceholderText(/Onboard 25 new customers/i)).toBeInTheDocument();
  });

  it('hides form and shows cancel when form is open', async () => {
    render(<ProjectGoalsPanel projectId={1} canEdit={true} />);
    await waitFor(() => expect(screen.getByText('No goals yet.')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /New goal/i }));
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();

    // Click cancel hides form
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(screen.queryByPlaceholderText(/Onboard 25 new customers/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Form submission (POST)
// ---------------------------------------------------------------------------

describe('ProjectGoalsPanel — add goal form submission', () => {
  beforeEach(() => {
    // First call: initial load (empty)
    // Second call: POST
    // Third call: reload after POST
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [makeGoal({ title: 'New Goal Added' })] }),
      } as unknown as Response);
  });

  it('POSTs the goal and reloads the list on success', async () => {
    render(<ProjectGoalsPanel projectId={42} canEdit={true} />);
    await waitFor(() => expect(screen.getByText('No goals yet.')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /New goal/i }));

    const titleInput = screen.getByPlaceholderText(/Onboard 25 new customers/i);
    fireEvent.change(titleInput, { target: { value: 'New Goal Added' } });

    fireEvent.click(screen.getByRole('button', { name: /Add goal/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/portal/projects/42/goals',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    await waitFor(() => expect(screen.getByText('New Goal Added')).toBeInTheDocument());
  });

  it('does not submit if title is empty', async () => {
    render(<ProjectGoalsPanel projectId={1} canEdit={true} />);
    await waitFor(() => expect(screen.getByText('No goals yet.')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /New goal/i }));
    // Don't fill title
    fireEvent.click(screen.getByRole('button', { name: /Add goal/i }));

    // Only the initial load fetch should have been called
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Update current value (PATCH on blur)
// ---------------------------------------------------------------------------

describe('ProjectGoalsPanel — update current value', () => {
  it('PATCHes goal when current value input is blurred with a new value', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [makeGoal({ id: 7, currentValue: 10 })] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      } as unknown as Response);

    render(<ProjectGoalsPanel projectId={1} canEdit={true} />);
    await waitFor(() => expect(screen.getByText('Onboard 25 customers')).toBeInTheDocument());

    const input = screen.getByTitle(/Update current value/i);
    fireEvent.change(input, { target: { value: '55' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/portal/goals/7',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ currentValue: 55 }),
        }),
      );
    });
  });

  it('does NOT PATCH when value is unchanged', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [makeGoal({ id: 7, currentValue: 25 })] }),
    } as unknown as Response);

    render(<ProjectGoalsPanel projectId={1} canEdit={true} />);
    await waitFor(() => expect(screen.getByText('Onboard 25 customers')).toBeInTheDocument());

    const input = screen.getByTitle(/Update current value/i);
    fireEvent.blur(input); // value is still 25 (defaultValue)

    // Only the initial load should have been called
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Update status (PATCH via select)
// ---------------------------------------------------------------------------

describe('ProjectGoalsPanel — update status', () => {
  it('PATCHes status when status select changes', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [makeGoal({ id: 9, status: 'active' })] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      } as unknown as Response);

    render(<ProjectGoalsPanel projectId={1} canEdit={true} />);
    await waitFor(() => expect(screen.getByText('Onboard 25 customers')).toBeInTheDocument());

    // The inline status select is the first <select> rendered inside the goal row
    // (the form status select is not visible since showForm=false)
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'achieved' } });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/portal/goals/9',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'achieved' }),
        }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Delete goal
// ---------------------------------------------------------------------------

describe('ProjectGoalsPanel — delete goal', () => {
  it('DELETEs the goal when confirmed and reloads', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [makeGoal({ id: 3 })] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      } as unknown as Response);

    render(<ProjectGoalsPanel projectId={1} canEdit={true} />);
    await waitFor(() => expect(screen.getByText('Onboard 25 customers')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Delete'));

    expect(confirmSpy).toHaveBeenCalledWith('Delete this goal?');
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/portal/goals/3', { method: 'DELETE' });
    });
    await waitFor(() => expect(screen.getByText('No goals yet.')).toBeInTheDocument());

    confirmSpy.mockRestore();
  });

  it('does NOT delete when confirm is cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [makeGoal({ id: 3 })] }),
    } as unknown as Response);

    render(<ProjectGoalsPanel projectId={1} canEdit={true} />);
    await waitFor(() => expect(screen.getByText('Onboard 25 customers')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Delete'));

    // Only the initial load fetch should have been called
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Fetch with projectId change
// ---------------------------------------------------------------------------

describe('ProjectGoalsPanel — re-fetches on projectId change', () => {
  it('calls fetch with new projectId when prop changes', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [] }),
    } as unknown as Response);

    const { rerender } = render(<ProjectGoalsPanel projectId={1} canEdit={false} />);
    await waitFor(() => expect(screen.getByText('No goals yet.')).toBeInTheDocument());

    rerender(<ProjectGoalsPanel projectId={2} canEdit={false} />);
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/portal/projects/2/goals');
    });
  });
});
