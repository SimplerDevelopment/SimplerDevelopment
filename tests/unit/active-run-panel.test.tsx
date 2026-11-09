// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import ActiveRunPanel, { stepOfLabel } from '@/components/brain/ActiveRunPanel';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const detail = (steps: { id: number; stepId: number; name: string; status: string }[]) => ({
  run: { id: 9, label: null, status: 'active', startedAt: '2026-08-24T10:00:00Z', startedBy: 4 },
  playbook: { id: 1, name: 'Season opening' },
  steps,
});
const ok = (data: unknown) => ({ ok: true, json: async () => ({ success: true, data }) });

describe('PUX-164 ActiveRunPanel', () => {
  it('stepOfLabel', () => {
    expect(stepOfLabel([{ status: 'completed' }, { status: 'active' }, { status: 'pending' }])).toBe('Step 2 of 3');
    expect(stepOfLabel([{ status: 'completed' }])).toBe('Waiting');
    expect(stepOfLabel([])).toBe('No steps');
  });

  it('loads the active run, lists its steps, and completes the current step', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok({ items: [{ id: 9 }] }))
      .mockResolvedValueOnce(ok(detail([
        { id: 1, stepId: 21, name: 'Publish the landing page', status: 'completed' },
        { id: 2, stepId: 22, name: 'Confirm guide roster', status: 'active' },
        { id: 3, stepId: 23, name: 'Reconcile deposits', status: 'pending' },
      ])))
      .mockResolvedValueOnce(ok({ stepId: 22, status: 'completed' }))
      .mockResolvedValueOnce(ok({ items: [{ id: 9 }] }))
      .mockResolvedValueOnce(ok(detail([
        { id: 1, stepId: 21, name: 'Publish the landing page', status: 'completed' },
        { id: 2, stepId: 22, name: 'Confirm guide roster', status: 'completed' },
        { id: 3, stepId: 23, name: 'Reconcile deposits', status: 'active' },
      ])));
    vi.stubGlobal('fetch', fetchMock);
    render(<ActiveRunPanel playbookId={1} owners={{ 4: { name: 'Marta Ellison', email: 'm@x.io' } }} />);
    await waitFor(() => expect(screen.getByText('Confirm guide roster')).toBeTruthy());
    expect(fetchMock.mock.calls[0][0]).toBe('/api/portal/brain/playbook-runs?playbookId=1&status=active&limit=1');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/portal/brain/playbook-runs/9');
    expect(screen.getByText(/Step 2 of 3/).textContent).toContain('by Marta Ellison');
    expect(screen.getByRole('link', { name: 'Season opening' }).getAttribute('href')).toBe('/portal/brain/playbook-runs/9');

    fireEvent.click(screen.getByRole('button', { name: /Complete step/ }));
    await waitFor(() => expect(screen.getByText(/Step 3 of 3/)).toBeTruthy());
    expect(fetchMock.mock.calls[2][0]).toBe('/api/portal/brain/playbook-runs/9/steps/22/complete');
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: 'POST' });
  });

  it('renders nothing when the playbook has no active run', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ items: [] })));
    const { container } = render(<ActiveRunPanel playbookId={2} />);
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });
});
