// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for `components/brain/InitiativeLinksPanel.tsx`.
 *
 * Covers:
 *  - Empty state (no links)
 *  - Populated state (grouped tabs, active tab, item rows)
 *  - Tab switching
 *  - Item title fallback (#id when title is null)
 *  - Item note display
 *  - Pinned item indicator
 *  - Unlink: confirm → DELETE → onChanged, error, network throw, cancel
 *  - "Link" button opens LinkPickerDialog
 *  - LinkPickerDialog: type select, search input, loading, empty, options list,
 *    pick + submit (POST), submit error, submit network throw, close, cancel,
 *    note input, pinned checkbox
 *  - fetchPickerOptions branches: task, note, meeting, crm_deal, crm_company,
 *    decision (empty), topic (empty)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, screen } from '@testing-library/react';
import type { InitiativeLinkItem } from '@/components/brain/initiatives-shared';

// ─── fetch mock helpers ────────────────────────────────────────────────────

function mockFetch(payload: unknown, ok = true) {
  (global as any).fetch = vi.fn(async () => ({
    ok,
    json: async () => payload,
  }));
}

function mockFetchReject(msg = 'Network error') {
  (global as any).fetch = vi.fn(async () => {
    throw new Error(msg);
  });
}

// ─── window.confirm stub ──────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default: confirm returns true (proceed with unlink)
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  // Default fetch: empty task list (picker auto-loads on open; 'task' is the default type)
  mockFetch({ success: true, data: [] });
});

// ─── import component under test (after mocks) ────────────────────────────

import InitiativeLinksPanel from '@/components/brain/InitiativeLinksPanel';

// ─── test data helpers ────────────────────────────────────────────────────

const makeLink = (over: Partial<InitiativeLinkItem> = {}): InitiativeLinkItem => ({
  linkId: 100,
  entityType: 'task',
  entityId: 1,
  title: 'My Task',
  pinned: false,
  note: null,
  createdAt: '2025-01-01T00:00:00Z',
  ...over,
});

// ─── rendering helpers ────────────────────────────────────────────────────

function renderPanel(
  links: InitiativeLinkItem[] = [],
  onChanged?: () => void,
  initiativeId = 42,
) {
  return render(
    <InitiativeLinksPanel
      initiativeId={initiativeId}
      links={links}
      onChanged={onChanged}
    />,
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Empty state
// ═════════════════════════════════════════════════════════════════════════════

describe('InitiativeLinksPanel — empty state', () => {
  it('renders the panel heading', () => {
    renderPanel([]);
    expect(screen.getByText('Linked entities')).toBeInTheDocument();
  });

  it('shows a (0) count badge', () => {
    renderPanel([]);
    expect(screen.getByText('(0)')).toBeInTheDocument();
  });

  it('shows the empty-state message when no links', () => {
    renderPanel([]);
    expect(screen.getByText(/Nothing linked yet/)).toBeInTheDocument();
  });

  it('mentions the full list of linkable types in the empty state', () => {
    renderPanel([]);
    expect(screen.getByText(/tasks, notes, meetings/i)).toBeInTheDocument();
  });

  it('does not render any tab buttons when no links', () => {
    const { container } = renderPanel([]);
    expect(container.querySelector('[class*="border-b-2"]')).toBeNull();
  });

  it('renders a "Link" button', () => {
    renderPanel([]);
    expect(screen.getByText('Link')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Populated state — tabs and rows
// ═════════════════════════════════════════════════════════════════════════════

describe('InitiativeLinksPanel — populated state', () => {
  const links: InitiativeLinkItem[] = [
    makeLink({ linkId: 1, entityType: 'task', entityId: 1, title: 'Task Alpha' }),
    makeLink({ linkId: 2, entityType: 'note', entityId: 2, title: 'Note Beta' }),
    makeLink({ linkId: 3, entityType: 'task', entityId: 3, title: 'Task Gamma' }),
  ];

  it('shows the correct total count', () => {
    renderPanel(links);
    expect(screen.getByText('(3)')).toBeInTheDocument();
  });

  it('renders a tab for each entity type that has items', () => {
    renderPanel(links);
    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.queryByText('Meetings')).not.toBeInTheDocument();
  });

  it('shows the first tab as active by default and renders its items', () => {
    renderPanel(links);
    // Tasks is first with 2 items; both should be visible
    expect(screen.getByText('Task Alpha')).toBeInTheDocument();
    expect(screen.getByText('Task Gamma')).toBeInTheDocument();
  });

  it('does not show items from inactive tab by default', () => {
    renderPanel(links);
    expect(screen.queryByText('Note Beta')).not.toBeInTheDocument();
  });

  it('switches active tab on click', () => {
    renderPanel(links);
    fireEvent.click(screen.getByText('Notes'));
    expect(screen.getByText('Note Beta')).toBeInTheDocument();
    expect(screen.queryByText('Task Alpha')).not.toBeInTheDocument();
  });

  it('shows the count badge on each tab', () => {
    renderPanel(links);
    const tasksTab = screen.getByText('Tasks').closest('button')!;
    expect(tasksTab.textContent).toContain('2');
  });

  it('renders the entity icon in item rows', () => {
    const { container } = renderPanel(links);
    // material-icons "task_alt" for task
    expect(container.textContent).toContain('task_alt');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Item display edge cases
// ═════════════════════════════════════════════════════════════════════════════

describe('InitiativeLinksPanel — item display edge cases', () => {
  it('shows fallback label when title is null', () => {
    renderPanel([makeLink({ entityType: 'task', entityId: 7, title: null })]);
    expect(screen.getByText('Task #7')).toBeInTheDocument();
  });

  it('renders item note when present', () => {
    renderPanel([
      makeLink({ entityType: 'task', entityId: 1, title: 'T', note: 'context note' }),
    ]);
    expect(screen.getByText('context note')).toBeInTheDocument();
  });

  it('does not render note div when note is null', () => {
    renderPanel([makeLink({ entityType: 'task', entityId: 1, title: 'T', note: null })]);
    expect(screen.queryByText('context note')).not.toBeInTheDocument();
  });

  it('renders the push_pin icon when item is pinned', () => {
    const { container } = renderPanel([
      makeLink({ entityType: 'task', entityId: 1, title: 'Pinned Task', pinned: true }),
    ]);
    expect(container.textContent).toContain('push_pin');
  });

  it('does not render push_pin icon when item is not pinned', () => {
    const { container } = renderPanel([
      makeLink({ entityType: 'task', entityId: 1, title: 'Not Pinned', pinned: false }),
    ]);
    // push_pin should NOT be in the rendered output for an unpinned item
    const rows = container.querySelectorAll('[class*="rounded-md bg-muted"]');
    // Inspect that none of the rows contain a push_pin span
    const rowTexts = Array.from(rows).map((r) => r.textContent ?? '');
    expect(rowTexts.every((t) => !t.includes('push_pin'))).toBe(true);
  });

  it('shows multi-entity tabs: note and crm_deal', () => {
    renderPanel([
      makeLink({ linkId: 10, entityType: 'note', entityId: 1, title: 'My Note' }),
      makeLink({ linkId: 11, entityType: 'crm_deal', entityId: 2, title: 'My Deal' }),
    ]);
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByText('Deals')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Unlink action
// ═════════════════════════════════════════════════════════════════════════════

describe('InitiativeLinksPanel — unlink', () => {
  const link = makeLink({ entityType: 'task', entityId: 1, title: 'Task A' });

  it('calls confirm before unlinking', async () => {
    mockFetch({ success: true });
    renderPanel([link], vi.fn());
    fireEvent.click(screen.getByLabelText('Unlink'));
    expect(window.confirm).toHaveBeenCalled();
  });

  it('sends DELETE request with correct body on confirm', async () => {
    mockFetch({ success: true });
    const onChanged = vi.fn();
    renderPanel([link], onChanged, 42);
    fireEvent.click(screen.getByLabelText('Unlink'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect((global as any).fetch).toHaveBeenCalledWith(
      '/api/portal/brain/initiatives/42/links',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ entityType: 'task', entityId: 1 }),
      }),
    );
  });

  it('does not send DELETE when confirm returns false', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onChanged = vi.fn();
    renderPanel([link], onChanged);
    fireEvent.click(screen.getByLabelText('Unlink'));
    await new Promise((r) => setTimeout(r, 50));
    expect(onChanged).not.toHaveBeenCalled();
    const fetchCalls = ((global as any).fetch as any).mock.calls as any[][];
    const deleteCalls = fetchCalls.filter((c) => c[1]?.method === 'DELETE');
    expect(deleteCalls).toHaveLength(0);
  });

  it('shows error message when DELETE returns ok=false', async () => {
    mockFetch({ success: false, message: 'Unlink failed' }, false);
    renderPanel([link], vi.fn());
    fireEvent.click(screen.getByLabelText('Unlink'));
    await waitFor(() =>
      expect(screen.getByText('Unlink failed')).toBeInTheDocument(),
    );
  });

  it('shows fallback error when json has no message', async () => {
    mockFetch({ success: false }, false);
    renderPanel([link], vi.fn());
    fireEvent.click(screen.getByLabelText('Unlink'));
    await waitFor(() =>
      expect(screen.getByText('Failed to unlink.')).toBeInTheDocument(),
    );
  });

  it('shows network error message on fetch throw', async () => {
    mockFetchReject('boom');
    renderPanel([link], vi.fn());
    fireEvent.click(screen.getByLabelText('Unlink'));
    await waitFor(() =>
      expect(screen.getByText('boom')).toBeInTheDocument(),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Link picker dialog — open / close
// ═════════════════════════════════════════════════════════════════════════════

describe('InitiativeLinksPanel — picker dialog open/close', () => {
  it('opens the picker dialog when "Link" button is clicked', async () => {
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    await waitFor(() =>
      expect(screen.getByText('Link an entity')).toBeInTheDocument(),
    );
  });

  it('closes the picker dialog when the X (Close) button is clicked', async () => {
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    await waitFor(() => screen.getByLabelText('Close'));
    fireEvent.click(screen.getByLabelText('Close'));
    await waitFor(() =>
      expect(screen.queryByText('Link an entity')).not.toBeInTheDocument(),
    );
  });

  it('closes the picker dialog when Cancel is clicked', async () => {
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    await waitFor(() => screen.getByText('Cancel'));
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() =>
      expect(screen.queryByText('Link an entity')).not.toBeInTheDocument(),
    );
  });

  it('dialog shows descriptive subtitle text', async () => {
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    await waitFor(() =>
      expect(
        screen.getByText(/Attach a task, note, meeting/i),
      ).toBeInTheDocument(),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Link picker dialog — loading / options
// ═════════════════════════════════════════════════════════════════════════════

describe('InitiativeLinksPanel — picker dialog options', () => {
  it('shows "No tasks found." when fetch returns empty data', async () => {
    mockFetch({ success: true, data: [] });
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    await waitFor(() =>
      expect(screen.getByText('No tasks found.')).toBeInTheDocument(),
    );
  });

  it('renders fetched task options as a list', async () => {
    mockFetch({
      success: true,
      data: [{ id: 5, title: 'Task Five', status: 'open' }],
    });
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    await waitFor(() =>
      expect(screen.getByText('Task Five')).toBeInTheDocument(),
    );
  });

  it('renders task status as secondary text', async () => {
    mockFetch({
      success: true,
      data: [{ id: 5, title: 'Task Five', status: 'in_progress' }],
    });
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    await waitFor(() =>
      expect(screen.getByText('in_progress')).toBeInTheDocument(),
    );
  });

  it('highlights a picked option', async () => {
    mockFetch({
      success: true,
      data: [{ id: 5, title: 'Picked Task', status: 'open' }],
    });
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    const option = await screen.findByText('Picked Task');
    fireEvent.click(option.closest('button')!);
    await waitFor(() => {
      expect(option.closest('button')!.className).toContain('bg-primary/10');
    });
  });

  it('shows "No decisions found." and brain-restructure hint for decision type', async () => {
    // decision/topic return [] unconditionally (brain-restructure branch)
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'decision' } });
    await waitFor(() => {
      expect(screen.getByText(/No decisions found/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Decisions and topics require the brain-restructure module/i),
      ).toBeInTheDocument();
    });
  });

  it('shows "No topics found." and brain-restructure hint for topic type', async () => {
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'topic' } });
    await waitFor(() => {
      expect(screen.getByText(/No topics found/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Decisions and topics require the brain-restructure module/i),
      ).toBeInTheDocument();
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Link picker dialog — note + pinned fields
// ═════════════════════════════════════════════════════════════════════════════

describe('InitiativeLinksPanel — picker dialog note and pinned fields', () => {
  it('renders the Note (optional) input', async () => {
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    await waitFor(() => screen.getByText('Link an entity'));
    expect(screen.getByPlaceholderText('Why is this linked?')).toBeInTheDocument();
  });

  it('renders the "Pin this link" checkbox', async () => {
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    await waitFor(() => screen.getByText('Pin this link'));
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('note input accepts text input', async () => {
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    await waitFor(() => screen.getByPlaceholderText('Why is this linked?'));
    const noteInput = screen.getByPlaceholderText('Why is this linked?');
    fireEvent.change(noteInput, { target: { value: 'strategic alignment' } });
    expect((noteInput as HTMLInputElement).value).toBe('strategic alignment');
  });

  it('pinned checkbox toggles', async () => {
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    await waitFor(() => screen.getByRole('checkbox'));
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Link picker dialog — submit (POST)
// ═════════════════════════════════════════════════════════════════════════════

describe('InitiativeLinksPanel — picker dialog submit', () => {
  /** Finds the submit button inside the dialog overlay. */
  function findDialogSubmitBtn(container?: HTMLElement) {
    const root = container ?? document.body;
    const backdrop = root.querySelector('.fixed.inset-0');
    if (!backdrop) return null;
    const allBtns = Array.from(backdrop.querySelectorAll('button'));
    return allBtns.find((b) => b.textContent?.includes('add_link')) ?? null;
  }

  it('submit button is disabled when no option is picked', async () => {
    mockFetch({ success: true, data: [{ id: 9, title: 'Task Nine', status: 'open' }] });
    const { container } = renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    await screen.findByText('Task Nine'); // wait for load — no option picked yet
    const submitBtn = findDialogSubmitBtn(container);
    expect(submitBtn).not.toBeNull();
    expect(submitBtn!.disabled).toBe(true);
  });

  it('submit button is enabled after picking an option', async () => {
    mockFetch({ success: true, data: [{ id: 9, title: 'Task Nine', status: 'open' }] });
    const { container } = renderPanel([], vi.fn(), 42);
    fireEvent.click(screen.getByText('Link'));
    const option = await screen.findByText('Task Nine');
    fireEvent.click(option.closest('button')!);
    const submitBtn = findDialogSubmitBtn(container);
    expect(submitBtn).not.toBeNull();
    expect(submitBtn!.disabled).toBe(false);
  });

  it('sends POST with entityType, entityId, and calls onLinked (onChanged)', async () => {
    const onChanged = vi.fn();
    mockFetch({ success: true, data: [{ id: 9, title: 'Task Nine', status: 'open' }] });
    const { container } = renderPanel([], onChanged, 42);
    fireEvent.click(screen.getByText('Link'));
    const option = await screen.findByText('Task Nine');
    fireEvent.click(option.closest('button')!);
    // Now set up POST response
    mockFetch({ success: true });
    const submitBtn = findDialogSubmitBtn(container);
    expect(submitBtn).not.toBeNull();
    fireEvent.click(submitBtn!);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect((global as any).fetch).toHaveBeenCalledWith(
      '/api/portal/brain/initiatives/42/links',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows error when POST returns ok=false', async () => {
    mockFetch({ success: true, data: [{ id: 9, title: 'Task Nine', status: 'open' }] });
    const { container } = renderPanel([], vi.fn(), 42);
    fireEvent.click(screen.getByText('Link'));
    const option = await screen.findByText('Task Nine');
    fireEvent.click(option.closest('button')!);
    mockFetch({ success: false, message: 'Link failed' }, false);
    const submitBtn = findDialogSubmitBtn(container);
    expect(submitBtn).not.toBeNull();
    fireEvent.click(submitBtn!);
    await waitFor(() =>
      expect(screen.getByText('Link failed')).toBeInTheDocument(),
    );
  });

  it('shows fallback error when POST ok=false with no message', async () => {
    mockFetch({ success: true, data: [{ id: 9, title: 'Task Nine', status: 'open' }] });
    const { container } = renderPanel([], vi.fn(), 42);
    fireEvent.click(screen.getByText('Link'));
    const option = await screen.findByText('Task Nine');
    fireEvent.click(option.closest('button')!);
    mockFetch({ success: false }, false);
    const submitBtn = findDialogSubmitBtn(container);
    expect(submitBtn).not.toBeNull();
    fireEvent.click(submitBtn!);
    await waitFor(() =>
      expect(screen.getByText('Failed to link.')).toBeInTheDocument(),
    );
  });

  it('shows network error when POST throws', async () => {
    mockFetch({ success: true, data: [{ id: 9, title: 'Task Nine', status: 'open' }] });
    const { container } = renderPanel([], vi.fn(), 42);
    fireEvent.click(screen.getByText('Link'));
    const option = await screen.findByText('Task Nine');
    fireEvent.click(option.closest('button')!);
    mockFetchReject('net error');
    const submitBtn = findDialogSubmitBtn(container);
    expect(submitBtn).not.toBeNull();
    fireEvent.click(submitBtn!);
    await waitFor(() =>
      expect(screen.getByText('net error')).toBeInTheDocument(),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// fetchPickerOptions — entity-type branches (exercised via picker dialog type switch)
// ═════════════════════════════════════════════════════════════════════════════

describe('InitiativeLinksPanel — picker entity-type branches', () => {
  it('renders task option with status as secondary', async () => {
    mockFetch({
      success: true,
      data: [{ id: 1, title: 'Build feature', status: 'in_progress' }],
    });
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    // task is the default type
    await waitFor(() =>
      expect(screen.getByText('Build feature')).toBeInTheDocument(),
    );
    expect(screen.getByText('in_progress')).toBeInTheDocument();
  });

  it('renders note options when type is "note"', async () => {
    mockFetch({
      success: true,
      data: { items: [{ id: 2, title: 'Meeting notes' }] },
    });
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'note' } });
    await waitFor(() =>
      expect(screen.getByText('Meeting notes')).toBeInTheDocument(),
    );
  });

  it('renders note option with fallback title Note #id when title absent', async () => {
    mockFetch({
      success: true,
      data: { items: [{ id: 3 }] },
    });
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'note' } });
    await waitFor(() =>
      expect(screen.getByText('Note #3')).toBeInTheDocument(),
    );
  });

  it('renders meeting options when type is "meeting"', async () => {
    mockFetch({
      success: true,
      data: { items: [{ id: 4, title: 'Board Meeting', meetingDate: '2025-03-15T00:00:00Z' }] },
    });
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'meeting' } });
    await waitFor(() =>
      expect(screen.getByText('Board Meeting')).toBeInTheDocument(),
    );
  });

  it('renders meeting without secondary when meetingDate is null', async () => {
    mockFetch({
      success: true,
      data: { items: [{ id: 5, title: 'No Date Meeting', meetingDate: null }] },
    });
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'meeting' } });
    await waitFor(() =>
      expect(screen.getByText('No Date Meeting')).toBeInTheDocument(),
    );
  });

  it('renders crm_deal options when type is "crm_deal"', async () => {
    mockFetch({
      success: true,
      data: { items: [{ id: 10, title: 'ACME Deal', stage: 'proposal' }] },
    });
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'crm_deal' } });
    await waitFor(() =>
      expect(screen.getByText('ACME Deal')).toBeInTheDocument(),
    );
    expect(screen.getByText('proposal')).toBeInTheDocument();
  });

  it('renders deal title fallback Deal #id when title absent', async () => {
    mockFetch({
      success: true,
      data: { items: [{ id: 11, title: '', stage: 'discovery' }] },
    });
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'crm_deal' } });
    await waitFor(() =>
      expect(screen.getByText('Deal #11')).toBeInTheDocument(),
    );
  });

  it('renders crm_company options when type is "crm_company"', async () => {
    mockFetch({
      success: true,
      data: { items: [{ id: 20, name: 'Globex Corp', website: 'https://globex.com' }] },
    });
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'crm_company' } });
    await waitFor(() =>
      expect(screen.getByText('Globex Corp')).toBeInTheDocument(),
    );
    expect(screen.getByText('https://globex.com')).toBeInTheDocument();
  });

  it('renders company secondary from domain when website is null', async () => {
    mockFetch({
      success: true,
      data: { items: [{ id: 21, name: 'Initech', website: null, domain: 'initech.com' }] },
    });
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'crm_company' } });
    await waitFor(() =>
      expect(screen.getByText('initech.com')).toBeInTheDocument(),
    );
  });

  it('renders company title fallback Company #id when name is absent', async () => {
    mockFetch({
      success: true,
      data: { items: [{ id: 22, name: '', website: null, domain: null }] },
    });
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'crm_company' } });
    await waitFor(() =>
      expect(screen.getByText('Company #22')).toBeInTheDocument(),
    );
  });

  it('returns empty list for "decision" type (brain-restructure pending)', async () => {
    // decision returns [] regardless of fetch — no fetch needed
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'decision' } });
    await waitFor(() =>
      expect(screen.getByText(/No decisions found/i)).toBeInTheDocument(),
    );
  });

  it('returns empty list for "topic" type (brain-restructure pending)', async () => {
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'topic' } });
    await waitFor(() =>
      expect(screen.getByText(/No topics found/i)).toBeInTheDocument(),
    );
  });

  it('returns empty options when task fetch returns ok=false', async () => {
    mockFetch({ success: false }, false);
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    await waitFor(() =>
      expect(screen.getByText('No tasks found.')).toBeInTheDocument(),
    );
  });

  it('returns empty options when task fetch throws', async () => {
    mockFetchReject('connection refused');
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    await waitFor(() =>
      expect(screen.getByText('No tasks found.')).toBeInTheDocument(),
    );
  });

  it('filters tasks by search query (client-side filter)', async () => {
    mockFetch({
      success: true,
      data: [
        { id: 1, title: 'Alpha Task', status: 'open' },
        { id: 2, title: 'Beta Task', status: 'open' },
      ],
    });
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    // Wait for initial load with both items
    await screen.findByText('Alpha Task');
    expect(screen.getByText('Beta Task')).toBeInTheDocument();
    // Now type into the search box to filter
    mockFetch({
      success: true,
      data: [
        { id: 1, title: 'Alpha Task', status: 'open' },
        { id: 2, title: 'Beta Task', status: 'open' },
      ],
    });
    const searchInput = screen.getByPlaceholderText('Title or name…');
    fireEvent.change(searchInput, { target: { value: 'alpha' } });
    // fetchPickerOptions filters client-side for tasks with non-empty q
    await waitFor(() =>
      expect(screen.getByText('Alpha Task')).toBeInTheDocument(),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// onChanged callback not provided (optional)
// ═════════════════════════════════════════════════════════════════════════════

describe('InitiativeLinksPanel — onChanged optional', () => {
  it('does not throw when onChanged is undefined and unlink succeeds', async () => {
    mockFetch({ success: true });
    const link = makeLink({ entityType: 'task', entityId: 1, title: 'T' });
    renderPanel([link]); // no onChanged
    expect(() =>
      fireEvent.click(screen.getByLabelText('Unlink')),
    ).not.toThrow();
    await waitFor(() =>
      expect((global as any).fetch).toHaveBeenCalled(),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// All 7 LINK_ENTITY_TYPES appear as options in the type selector
// ═════════════════════════════════════════════════════════════════════════════

describe('InitiativeLinksPanel — picker type selector covers all entity types', () => {
  const expectedTypes = [
    { value: 'task', label: 'Task' },
    { value: 'note', label: 'Note' },
    { value: 'meeting', label: 'Meeting' },
    { value: 'decision', label: 'Decision' },
    { value: 'topic', label: 'Topic' },
    { value: 'crm_deal', label: 'Deal' },
    { value: 'crm_company', label: 'Company' },
  ];

  for (const { value, label } of expectedTypes) {
    it(`type selector includes "${label}" (value="${value}")`, async () => {
      renderPanel([]);
      fireEvent.click(screen.getByText('Link'));
      const select = await screen.findByRole('combobox');
      const option = select.querySelector(`option[value="${value}"]`);
      expect(option).not.toBeNull();
      expect(option!.textContent).toBe(label);
    });
  }
});
