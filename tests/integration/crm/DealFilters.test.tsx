import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DealFilters from '@/app/portal/crm/deals/_components/DealFilters';
import type { Pipeline } from '@/app/portal/crm/deals/_lib/types';

const PIPELINES: Pipeline[] = [
  {
    id: 1,
    name: 'Sales Pipeline',
    stages: [],
  },
  {
    id: 2,
    name: 'Renewals',
    stages: [],
  },
];

/**
 * `CrmCustomFieldFilters` issues its own GET on mount; stub fetch so the
 * filter bar can render in isolation.
 */
function stubFetchEmpty() {
  global.fetch = vi.fn(async () => {
    return new Response(JSON.stringify({ success: true, data: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

describe('DealFilters', () => {
  beforeEach(() => {
    stubFetchEmpty();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders pipeline options + status buttons + Add Deal toggle', () => {
    render(
      <DealFilters
        pipelines={PIPELINES}
        selectedPipelineId={1}
        onSelectPipeline={vi.fn()}
        statusFilter="open"
        onChangeStatus={vi.fn()}
        customFilters={{}}
        onChangeCustomFilters={vi.fn()}
        showForm={false}
        onToggleForm={vi.fn()}
      />,
    );

    // Pipeline picker has both pipelines.
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sales Pipeline' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Renewals' })).toBeInTheDocument();

    // Status filter buttons.
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Won' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lost' })).toBeInTheDocument();

    // "Add Deal" CTA.
    expect(screen.getByRole('button', { name: /Add Deal/ })).toBeInTheDocument();
  });

  it('fires onSelectPipeline when the user picks a different pipeline', async () => {
    const onSelectPipeline = vi.fn();
    const user = userEvent.setup();

    render(
      <DealFilters
        pipelines={PIPELINES}
        selectedPipelineId={1}
        onSelectPipeline={onSelectPipeline}
        statusFilter="open"
        onChangeStatus={vi.fn()}
        customFilters={{}}
        onChangeCustomFilters={vi.fn()}
        showForm={false}
        onToggleForm={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByRole('combobox'), '2');
    expect(onSelectPipeline).toHaveBeenCalledWith(2);
  });

  it('fires onChangeStatus when the user clicks a status filter', async () => {
    const onChangeStatus = vi.fn();
    const user = userEvent.setup();

    render(
      <DealFilters
        pipelines={PIPELINES}
        selectedPipelineId={1}
        onSelectPipeline={vi.fn()}
        statusFilter="open"
        onChangeStatus={onChangeStatus}
        customFilters={{}}
        onChangeCustomFilters={vi.fn()}
        showForm={false}
        onToggleForm={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Won' }));
    expect(onChangeStatus).toHaveBeenCalledWith('won');

    await user.click(screen.getByRole('button', { name: 'Lost' }));
    expect(onChangeStatus).toHaveBeenCalledWith('lost');
  });

  it('toggles between Add Deal and Cancel labels based on showForm', async () => {
    const onToggleForm = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(
      <DealFilters
        pipelines={PIPELINES}
        selectedPipelineId={1}
        onSelectPipeline={vi.fn()}
        statusFilter="open"
        onChangeStatus={vi.fn()}
        customFilters={{}}
        onChangeCustomFilters={vi.fn()}
        showForm={false}
        onToggleForm={onToggleForm}
      />,
    );

    expect(screen.getByRole('button', { name: /Add Deal/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Add Deal/ }));
    expect(onToggleForm).toHaveBeenCalledTimes(1);

    rerender(
      <DealFilters
        pipelines={PIPELINES}
        selectedPipelineId={1}
        onSelectPipeline={vi.fn()}
        statusFilter="open"
        onChangeStatus={vi.fn()}
        customFilters={{}}
        onChangeCustomFilters={vi.fn()}
        showForm={true}
        onToggleForm={onToggleForm}
      />,
    );
    expect(screen.getByRole('button', { name: /Cancel/ })).toBeInTheDocument();
  });
});
