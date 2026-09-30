// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import BoardFilters, { type BoardFiltersProps } from '@/components/portal/board/BoardFilters';

afterEach(cleanup);
function props(over: Partial<BoardFiltersProps> = {}): BoardFiltersProps {
  return {
    studio: true, search: '', onSearch: vi.fn(), priority: new Set(), setPriority: vi.fn(),
    sprints: [{ id: 14, name: 'Sprint 14', status: 'active' }], sprintId: null, onSprint: vi.fn(),
    assignees: [{ id: 7, name: 'Sam Ortiz' }], assigneeIds: new Set(), setAssignees: vi.fn(),
    labels: [{ id: 3, name: 'Store', color: '#0e7c86' }], labelIds: new Set(), setLabels: vi.fn(),
    activeCount: 0, onClear: vi.fn(), ...over,
  };
}
const setOf = (fn: ReturnType<typeof vi.fn>) => { const arg = fn.mock.calls[0][0]; return arg instanceof Set ? [...arg] : [...arg(new Set())]; };

describe('BoardFilters (PUX-152)', () => {
  it('studio: one row of selects driving the same state', () => {
    const p = props();
    render(<BoardFilters {...p} />);
    expect(screen.getByPlaceholderText('Search cards…')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Sprint'), { target: { value: '14' } });
    expect(p.onSprint).toHaveBeenCalledWith(14);
    fireEvent.change(screen.getByLabelText('Sprint'), { target: { value: 'backlog' } });
    expect(p.onSprint).toHaveBeenCalledWith('backlog');
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'high' } });
    expect(setOf(p.setPriority as ReturnType<typeof vi.fn>)).toEqual(['high']);
    fireEvent.change(screen.getByLabelText('Assignee'), { target: { value: '7' } });
    expect(setOf(p.setAssignees as ReturnType<typeof vi.fn>)).toEqual([7]);
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: '' } });
    expect(setOf(p.setLabels as ReturnType<typeof vi.fn>)).toEqual([]);
    expect(screen.queryByText(/Clear filters/)).toBeNull();
  });

  it('studio: clear button appears with active filters; legacy keeps today\'s chips', () => {
    const p = props({ activeCount: 2 });
    render(<BoardFilters {...p} />);
    fireEvent.click(screen.getByText('Clear filters (2)'));
    expect(p.onClear).toHaveBeenCalled();
    cleanup();
    render(<BoardFilters {...props({ studio: false })} />);
    expect(screen.getByPlaceholderText('Filter cards…')).toBeTruthy();
    expect(screen.getByText('Sprint:')).toBeTruthy();
    expect(screen.getByText('urgent').className).toContain('rounded-full');
  });
});
