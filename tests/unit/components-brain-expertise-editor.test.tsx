// @vitest-environment jsdom
/**
 * Unit tests for `components/brain/ExpertiseEditor.tsx`
 *
 * Covers:
 *  - Renders "No expertise tags yet." when expertise is empty
 *  - Renders existing chips (name, level select, remove button)
 *  - "+ Expertise" button opens picker popover
 *  - Picker shows "Start typing to search." when query is empty
 *  - Picker shows "No matches." when query has no results
 *  - Picker shows tag options from search results (hides already-attached)
 *  - Clicking a tag option calls attach → POST → onChange
 *  - attach failure sets error message
 *  - attach network error sets error message
 *  - Level select change calls changeLevel → POST → onChange (update)
 *  - Remove button calls detach → DELETE → onChange
 *  - detach failure sets error message
 *  - detach network error sets error message
 *  - Outside click closes picker
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Global fetch mock — overridden per test
const fetchMock = vi.fn();
global.fetch = fetchMock;

// ─── Subject ──────────────────────────────────────────────────────────────────

import { ExpertiseEditor, type ExpertiseChip } from '@/components/brain/ExpertiseEditor';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFetchOk(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ success: true, data }),
  } as Response);
}

function makeFetchFail(message = 'Server error') {
  return Promise.resolve({
    ok: false,
    json: () => Promise.resolve({ success: false, message }),
  } as Response);
}

function makeSearchResponse(items: Array<{ id: number; name: string }>) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ success: true, data: { items } }),
  } as Response);
}

const defaultChips: ExpertiseChip[] = [
  { tagId: 1, name: 'TypeScript', level: 3 },
  { tagId: 2, name: 'React', level: null },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ExpertiseEditor', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders "No expertise tags yet." when expertise is empty', () => {
    const { getByText } = render(
      <ExpertiseEditor personId={42} expertise={[]} onChange={vi.fn()} />,
    );
    expect(getByText('No expertise tags yet.')).toBeTruthy();
  });

  it('does not show the empty message when chips are present', () => {
    const { queryByText } = render(
      <ExpertiseEditor personId={42} expertise={defaultChips} onChange={vi.fn()} />,
    );
    expect(queryByText('No expertise tags yet.')).toBeNull();
  });

  it('renders a chip for each expertise entry', () => {
    const { getByText } = render(
      <ExpertiseEditor personId={42} expertise={defaultChips} onChange={vi.fn()} />,
    );
    expect(getByText('TypeScript')).toBeTruthy();
    expect(getByText('React')).toBeTruthy();
  });

  it('renders level selects with correct selected value', () => {
    const { getByLabelText } = render(
      <ExpertiseEditor personId={42} expertise={defaultChips} onChange={vi.fn()} />,
    );
    const tsSelect = getByLabelText('Level for TypeScript') as HTMLSelectElement;
    expect(tsSelect.value).toBe('3');

    const reactSelect = getByLabelText('Level for React') as HTMLSelectElement;
    expect(reactSelect.value).toBe('');
  });

  it('renders remove buttons for each chip', () => {
    const { getByLabelText } = render(
      <ExpertiseEditor personId={42} expertise={defaultChips} onChange={vi.fn()} />,
    );
    expect(getByLabelText('Remove TypeScript')).toBeTruthy();
    expect(getByLabelText('Remove React')).toBeTruthy();
  });

  it('opens picker popover when "+ Expertise" button is clicked', () => {
    const { getByText, getByPlaceholderText } = render(
      <ExpertiseEditor personId={42} expertise={[]} onChange={vi.fn()} />,
    );
    fireEvent.click(getByText('Expertise'));
    expect(getByPlaceholderText('Search expertise tags…')).toBeTruthy();
  });

  it('toggles picker closed when button is clicked again', () => {
    const { getByText, queryByPlaceholderText } = render(
      <ExpertiseEditor personId={42} expertise={[]} onChange={vi.fn()} />,
    );
    fireEvent.click(getByText('Expertise'));
    fireEvent.click(getByText('Expertise'));
    expect(queryByPlaceholderText('Search expertise tags…')).toBeNull();
  });

  it('shows "Start typing to search." with no query and no options', async () => {
    // fetch returns empty items for the initial open
    fetchMock.mockReturnValue(makeSearchResponse([]));

    const { getByText } = render(
      <ExpertiseEditor personId={42} expertise={[]} onChange={vi.fn()} />,
    );
    fireEvent.click(getByText('Expertise'));

    // runAllTimersAsync flushes the debounce setTimeout AND awaits the
    // subsequent fetch promise chain — avoids the waitFor+fakeTimers deadlock.
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(getByText('Start typing to search.')).toBeTruthy();
  });

  it('shows "No matches." when query has no results', async () => {
    fetchMock.mockReturnValue(makeSearchResponse([]));

    const { getByText, getByPlaceholderText } = render(
      <ExpertiseEditor personId={42} expertise={[]} onChange={vi.fn()} />,
    );
    fireEvent.click(getByText('Expertise'));
    fireEvent.change(getByPlaceholderText('Search expertise tags…'), {
      target: { value: 'zzz' },
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(getByText('No matches.')).toBeTruthy();
  });

  it('shows matching options and hides already-attached tags', async () => {
    // tagId 1 (TypeScript) is already attached — should not appear
    fetchMock.mockReturnValue(
      makeSearchResponse([
        { id: 1, name: 'TypeScript' },
        { id: 99, name: 'GraphQL' },
      ]),
    );

    const { getByText, queryByText, getByPlaceholderText } = render(
      <ExpertiseEditor personId={42} expertise={defaultChips} onChange={vi.fn()} />,
    );
    fireEvent.click(getByText('Expertise'));
    fireEvent.change(getByPlaceholderText('Search expertise tags…'), {
      target: { value: 'graph' },
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(getByText('GraphQL')).toBeTruthy();
    // TypeScript is already attached — filtered from visible options
    const listbox = document.querySelector('[role="listbox"]');
    expect(listbox?.textContent).not.toContain('TypeScript');
    expect(queryByText('TypeScript', { selector: '[role="listbox"] *' })).toBeNull();
  });

  it('attaches a tag via POST and calls onChange with new chip', async () => {
    fetchMock
      .mockReturnValueOnce(makeSearchResponse([{ id: 10, name: 'Node.js' }]))
      .mockReturnValueOnce(makeFetchOk({}));

    const onChange = vi.fn();
    const { getByText, getByPlaceholderText } = render(
      <ExpertiseEditor personId={42} expertise={[]} onChange={onChange} />,
    );
    fireEvent.click(getByText('Expertise'));
    fireEvent.change(getByPlaceholderText('Search expertise tags…'), {
      target: { value: 'node' },
    });

    // Flush the debounce timer and the search fetch promise.
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(getByText('Node.js')).toBeTruthy();

    // Click the option and flush the attach POST promise.
    fireEvent.click(getByText('Node.js'));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/portal/brain/people/42/expertise',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(onChange).toHaveBeenCalledWith([{ tagId: 10, name: 'Node.js', level: null }]);
  });

  it('shows error message when attach POST returns !ok', async () => {
    fetchMock
      .mockReturnValueOnce(makeSearchResponse([{ id: 10, name: 'Node.js' }]))
      .mockReturnValueOnce(makeFetchFail('Tag conflict'));

    const { getByText, getByPlaceholderText } = render(
      <ExpertiseEditor personId={42} expertise={[]} onChange={vi.fn()} />,
    );
    fireEvent.click(getByText('Expertise'));
    fireEvent.change(getByPlaceholderText('Search expertise tags…'), {
      target: { value: 'node' },
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(getByText('Node.js')).toBeTruthy();

    fireEvent.click(getByText('Node.js'));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(getByText('Tag conflict')).toBeTruthy();
  });

  it('shows generic error when attach throws a network error', async () => {
    fetchMock
      .mockReturnValueOnce(makeSearchResponse([{ id: 10, name: 'Node.js' }]))
      .mockRejectedValueOnce(new Error('Network failure'));

    const { getByText, getByPlaceholderText } = render(
      <ExpertiseEditor personId={42} expertise={[]} onChange={vi.fn()} />,
    );
    fireEvent.click(getByText('Expertise'));
    fireEvent.change(getByPlaceholderText('Search expertise tags…'), {
      target: { value: 'node' },
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(getByText('Node.js')).toBeTruthy();

    fireEvent.click(getByText('Node.js'));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(getByText('Network failure')).toBeTruthy();
  });

  it('changes level via select and POSTs the update, then calls onChange', async () => {
    fetchMock.mockReturnValueOnce(makeFetchOk({}));

    const onChange = vi.fn();
    const { getByLabelText } = render(
      <ExpertiseEditor personId={42} expertise={defaultChips} onChange={onChange} />,
    );

    fireEvent.change(getByLabelText('Level for TypeScript'), {
      target: { value: '4' },
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/portal/brain/people/42/expertise',
      expect.objectContaining({ method: 'POST' }),
    );
    // TypeScript chip should now have level 4
    const [updatedChips] = onChange.mock.calls[0] as [ExpertiseChip[]];
    const ts = updatedChips.find((c) => c.tagId === 1);
    expect(ts?.level).toBe(4);
  });

  it('sets level to null when "— level —" is selected', async () => {
    fetchMock.mockReturnValueOnce(makeFetchOk({}));

    const onChange = vi.fn();
    const { getByLabelText } = render(
      <ExpertiseEditor personId={42} expertise={defaultChips} onChange={onChange} />,
    );

    fireEvent.change(getByLabelText('Level for TypeScript'), {
      target: { value: '' },
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    const [updatedChips] = onChange.mock.calls[0] as [ExpertiseChip[]];
    const ts = updatedChips.find((c) => c.tagId === 1);
    expect(ts?.level).toBeNull();
  });

  it('detaches a tag via DELETE and calls onChange without that chip', async () => {
    fetchMock.mockReturnValueOnce(makeFetchOk({}));

    const onChange = vi.fn();
    const { getByLabelText } = render(
      <ExpertiseEditor personId={42} expertise={defaultChips} onChange={onChange} />,
    );

    fireEvent.click(getByLabelText('Remove TypeScript'));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/portal/brain/people/42/expertise'),
      expect.objectContaining({ method: 'DELETE' }),
    );
    const [remaining] = onChange.mock.calls[0] as [ExpertiseChip[]];
    expect(remaining.find((c) => c.tagId === 1)).toBeUndefined();
    expect(remaining.find((c) => c.tagId === 2)).toBeTruthy();
  });

  it('shows error when detach DELETE returns !ok', async () => {
    fetchMock.mockReturnValueOnce(makeFetchFail('Cannot remove'));

    const { getByLabelText, getByText } = render(
      <ExpertiseEditor personId={42} expertise={defaultChips} onChange={vi.fn()} />,
    );

    fireEvent.click(getByLabelText('Remove TypeScript'));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(getByText('Cannot remove')).toBeTruthy();
  });

  it('shows generic error when detach throws a network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Lost connection'));

    const { getByLabelText, getByText } = render(
      <ExpertiseEditor personId={42} expertise={defaultChips} onChange={vi.fn()} />,
    );

    fireEvent.click(getByLabelText('Remove React'));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(getByText('Lost connection')).toBeTruthy();
  });

  it('closes picker on outside mousedown', async () => {
    fetchMock.mockReturnValue(makeSearchResponse([]));

    const { getByText, queryByPlaceholderText } = render(
      <div>
        <div data-testid="outside">Outside</div>
        <ExpertiseEditor personId={42} expertise={[]} onChange={vi.fn()} />
      </div>,
    );

    fireEvent.click(getByText('Expertise'));
    // Picker is open synchronously — no need to advance timers here.
    expect(queryByPlaceholderText('Search expertise tags…')).toBeTruthy();

    // Simulate click outside — the mousedown handler closes picker synchronously.
    fireEvent.mouseDown(getByText('Outside'));
    expect(queryByPlaceholderText('Search expertise tags…')).toBeNull();
  });

  it('disables remove button while a DELETE request is in flight', async () => {
    // Make the DELETE a controllable promise so we can inspect mid-flight state.
    let resolveDelete!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((res) => {
        resolveDelete = res;
      }),
    );

    const onChange = vi.fn();
    const { getByLabelText } = render(
      <ExpertiseEditor personId={42} expertise={defaultChips} onChange={onChange} />,
    );

    // Start the delete — button becomes disabled synchronously (state set before await).
    act(() => {
      fireEvent.click(getByLabelText('Remove TypeScript'));
    });
    // busyTagId is set before the async fetch, so button is disabled immediately.
    expect((getByLabelText('Remove TypeScript') as HTMLButtonElement).disabled).toBe(true);

    // Resolve the promise and flush so onChange gets called.
    await act(async () => {
      resolveDelete({
        ok: true,
        json: () => Promise.resolve({ success: true, data: {} }),
      } as Response);
      await vi.runAllTimersAsync();
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
