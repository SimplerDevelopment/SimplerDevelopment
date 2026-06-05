// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for `components/brain/DocumentRequiredReadsPanel.tsx`.
 *
 * Covers:
 *  - Loading state
 *  - Error state (fetch fails, network throw)
 *  - Empty state (no required-reads)
 *  - Populated state (person rows, org_unit rows, grouped sections)
 *  - Row display: targetName fallback, pinnedVersionId chip, dueAt chip
 *  - Remove: confirm → DELETE → reload → onChanged callback
 *  - Remove: confirm returns false → no request
 *  - Remove: server error → alert
 *  - Remove: network throw → alert
 *  - Remove 409 with acknowledgments: force-confirm → force DELETE
 *  - Remove 409 with acknowledgments: force-confirm returns false → cancelled
 *  - "Assign required read" button opens AssignDialog
 *  - AssignDialog: closes on Cancel / X button
 *  - AssignDialog: person branch submit success → onAssigned + reload
 *  - AssignDialog: person branch submit with no person selected → inline error
 *  - AssignDialog: org_unit branch: loads org units, submit success
 *  - AssignDialog: org_unit branch: no org unit selected → inline error
 *  - AssignDialog: submit POST error → inline error displayed
 *  - AssignDialog: submit network throw → inline error displayed
 *  - AssignDialog: expandOrgUnit checkbox (org_unit mode)
 *  - AssignDialog: pinned version select renders non-draft versions
 *  - AssignDialog: due date input
 *  - onChanged optional (no crash when undefined)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, screen, act } from '@testing-library/react';
import type { RequiredReadRow } from '@/lib/brain/document-acks';

// ─── PersonPicker mock ────────────────────────────────────────────────────────
// PersonPicker internally calls fetch and uses hooks; mock it as a simple
// controlled input so AssignDialog tests can set personId without real typeahead.

vi.mock('@/components/brain/PersonPicker', () => ({
  PersonPicker: function PersonPickerStub({
    value,
    onChange,
  }: {
    value: number | null;
    onChange: (id: number | null) => void;
  }) {
    return (
      <input
        data-testid="person-picker"
        type="number"
        value={value ?? ''}
        onChange={(e) =>
          onChange(e.target.value ? parseInt(e.target.value, 10) : null)
        }
        placeholder="Search people…"
      />
    );
  },
}));

// ─── fetch helpers ────────────────────────────────────────────────────────────

function mockFetch(payload: unknown, ok = true, status = ok ? 200 : 400) {
  (global as any).fetch = vi.fn(async () => ({
    ok,
    status,
    json: async () => payload,
  }));
}

function mockFetchReject(msg = 'Network error') {
  (global as any).fetch = vi.fn(async () => {
    throw new Error(msg);
  });
}

/**
 * Build a sequence fetch mock: the first call returns `first`, all subsequent
 * calls return `rest`. Useful when `load()` is called again after an action.
 */
function mockFetchSequence(
  first: { payload: unknown; ok?: boolean },
  rest: { payload: unknown; ok?: boolean },
) {
  let called = false;
  (global as any).fetch = vi.fn(async () => {
    if (!called) {
      called = true;
      const ok = first.ok ?? true;
      return { ok, status: ok ? 200 : 400, json: async () => first.payload };
    }
    const ok = rest.ok ?? true;
    return { ok, status: ok ? 200 : 400, json: async () => rest.payload };
  });
}

// ─── window stubs ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'alert').mockImplementation(() => undefined);
  // Default: load returns empty list
  mockFetch({ success: true, data: { items: [] } });
});

// ─── import component under test (after mocks) ───────────────────────────────

import DocumentRequiredReadsPanel from '@/components/brain/DocumentRequiredReadsPanel';

// ─── test data helpers ────────────────────────────────────────────────────────

const makeRow = (over: Partial<RequiredReadRow> = {}): RequiredReadRow => ({
  id: 1,
  targetType: 'person',
  targetId: 10,
  targetName: 'Alice Smith',
  pinnedVersionId: null,
  dueAt: null,
  assignedAt: new Date('2025-01-01T00:00:00Z'),
  ...over,
});

const defaultVersions = [
  { id: 100, versionNumber: 1, isDraft: false },
  { id: 101, versionNumber: 2, isDraft: true },
];

function renderPanel(
  opts: {
    documentId?: number;
    versions?: { id: number; versionNumber: number; isDraft: boolean }[];
    onChanged?: () => void;
  } = {},
) {
  const { documentId = 42, versions = defaultVersions, onChanged } = opts;
  return render(
    <DocumentRequiredReadsPanel
      documentId={documentId}
      versions={versions}
      onChanged={onChanged}
    />,
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Loading state
// ═════════════════════════════════════════════════════════════════════════════

describe('DocumentRequiredReadsPanel — loading state', () => {
  it('shows a loading spinner while fetching', async () => {
    // Never resolves during this assertion window
    let resolveLoad!: (v: unknown) => void;
    (global as any).fetch = vi.fn(
      () =>
        new Promise((res) => {
          resolveLoad = res;
        }),
    );
    renderPanel();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    // Clean up: resolve the hanging promise so React can settle
    act(() => {
      resolveLoad({ ok: true, status: 200, json: async () => ({ success: true, data: { items: [] } }) });
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Error state
// ═════════════════════════════════════════════════════════════════════════════

describe('DocumentRequiredReadsPanel — error state', () => {
  it('shows server error message when fetch returns ok=false', async () => {
    mockFetch({ success: false, message: 'Permission denied' }, false);
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText('Permission denied')).toBeInTheDocument(),
    );
  });

  it('shows fallback error when json has no message', async () => {
    mockFetch({ success: false }, false);
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText('Failed to load required-reads.')).toBeInTheDocument(),
    );
  });

  it('shows network error message when fetch throws', async () => {
    mockFetchReject('connection refused');
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText('connection refused')).toBeInTheDocument(),
    );
  });

  it('shows generic network error when thrown value is not an Error', async () => {
    (global as any).fetch = vi.fn(async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'raw string error';
    });
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText('Network error')).toBeInTheDocument(),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Empty state
// ═════════════════════════════════════════════════════════════════════════════

describe('DocumentRequiredReadsPanel — empty state', () => {
  it('shows the panel heading', async () => {
    renderPanel();
    expect(screen.getByText('Required reads')).toBeInTheDocument();
  });

  it('shows (0) count badge when no rows', async () => {
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText('(0)')).toBeInTheDocument(),
    );
  });

  it('shows empty-state message when no required-reads', async () => {
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText('No required-reads yet.')).toBeInTheDocument(),
    );
  });

  it('does not render People or Org units sections when empty', async () => {
    renderPanel();
    await waitFor(() => screen.getByText('No required-reads yet.'));
    expect(screen.queryByText(/People/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Org units/)).not.toBeInTheDocument();
  });

  it('renders the "Assign required read" button', () => {
    renderPanel();
    expect(screen.getByText('Assign required read')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Populated state
// ═════════════════════════════════════════════════════════════════════════════

describe('DocumentRequiredReadsPanel — populated state', () => {
  const personRow = makeRow({ id: 1, targetType: 'person', targetId: 10, targetName: 'Alice Smith' });
  const orgRow = makeRow({ id: 2, targetType: 'org_unit', targetId: 20, targetName: 'Engineering' });

  beforeEach(() => {
    mockFetch({ success: true, data: { items: [personRow, orgRow] } });
  });

  it('shows correct total count badge', async () => {
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText('(2)')).toBeInTheDocument(),
    );
  });

  it('renders People section for person rows', async () => {
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText(/People/)).toBeInTheDocument(),
    );
  });

  it('renders Org units section for org_unit rows', async () => {
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText(/Org units/)).toBeInTheDocument(),
    );
  });

  it('renders the person target name', async () => {
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText('Alice Smith')).toBeInTheDocument(),
    );
  });

  it('renders the org unit target name', async () => {
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText('Engineering')).toBeInTheDocument(),
    );
  });

  it('renders remove buttons for each row', async () => {
    renderPanel();
    await waitFor(() => screen.getByText('Alice Smith'));
    const removeBtns = screen.getAllByLabelText('Remove');
    expect(removeBtns).toHaveLength(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Row display edge cases
// ═════════════════════════════════════════════════════════════════════════════

describe('DocumentRequiredReadsPanel — row display edge cases', () => {
  it('shows fallback label when targetName is null (person)', async () => {
    mockFetch({
      success: true,
      data: { items: [makeRow({ targetType: 'person', targetId: 7, targetName: null })] },
    });
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText('person #7')).toBeInTheDocument(),
    );
  });

  it('shows fallback label when targetName is null (org_unit)', async () => {
    mockFetch({
      success: true,
      data: { items: [makeRow({ id: 2, targetType: 'org_unit', targetId: 99, targetName: null })] },
    });
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText('org_unit #99')).toBeInTheDocument(),
    );
  });

  it('shows pinnedVersionId chip when set (matching version)', async () => {
    mockFetch({
      success: true,
      data: { items: [makeRow({ pinnedVersionId: 100 })] },
    });
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText('v1')).toBeInTheDocument(),
    );
  });

  it('shows pinnedVersionId chip with v#id fallback when version not in list', async () => {
    mockFetch({
      success: true,
      data: { items: [makeRow({ pinnedVersionId: 999 })] },
    });
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText('v#999')).toBeInTheDocument(),
    );
  });

  it('does not show pinned chip when pinnedVersionId is null', async () => {
    mockFetch({
      success: true,
      data: { items: [makeRow({ pinnedVersionId: null })] },
    });
    renderPanel();
    await waitFor(() => screen.getByText('Alice Smith'));
    expect(screen.queryByText(/^v\d/)).not.toBeInTheDocument();
  });

  it('shows dueAt chip when set', async () => {
    mockFetch({
      success: true,
      data: { items: [makeRow({ dueAt: new Date('2025-06-15T00:00:00Z') })] },
    });
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText(/Due/)).toBeInTheDocument(),
    );
  });

  it('does not show dueAt chip when dueAt is null', async () => {
    mockFetch({
      success: true,
      data: { items: [makeRow({ dueAt: null })] },
    });
    renderPanel();
    await waitFor(() => screen.getByText('Alice Smith'));
    expect(screen.queryByText(/Due/)).not.toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Remove action
// ═════════════════════════════════════════════════════════════════════════════

describe('DocumentRequiredReadsPanel — remove', () => {
  const row = makeRow({ id: 5, targetType: 'person', targetId: 10, targetName: 'Bob Jones' });

  it('calls confirm before sending DELETE', async () => {
    mockFetchSequence(
      { payload: { success: true, data: { items: [row] } } },
      { payload: { success: true } },
    );
    renderPanel();
    await waitFor(() => screen.getByText('Bob Jones'));
    fireEvent.click(screen.getByLabelText('Remove'));
    expect(window.confirm).toHaveBeenCalled();
  });

  it('sends DELETE to the correct URL on confirm', async () => {
    mockFetchSequence(
      { payload: { success: true, data: { items: [row] } } },
      { payload: { success: true } },
    );
    renderPanel({ documentId: 42 });
    await waitFor(() => screen.getByText('Bob Jones'));
    fireEvent.click(screen.getByLabelText('Remove'));
    await waitFor(() =>
      expect((global as any).fetch).toHaveBeenCalledWith(
        '/api/portal/brain/documents/42/required-reads/5',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });

  it('calls onChanged after successful remove', async () => {
    const onChanged = vi.fn();
    mockFetchSequence(
      { payload: { success: true, data: { items: [row] } } },
      { payload: { success: true } },
    );
    renderPanel({ onChanged });
    await waitFor(() => screen.getByText('Bob Jones'));
    fireEvent.click(screen.getByLabelText('Remove'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('does not send DELETE when confirm returns false', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockFetch({ success: true, data: { items: [row] } });
    renderPanel();
    await waitFor(() => screen.getByText('Bob Jones'));
    fireEvent.click(screen.getByLabelText('Remove'));
    await new Promise((r) => setTimeout(r, 50));
    const calls = ((global as any).fetch as any).mock.calls as unknown[][];
    const deleteCalls = calls.filter(
      (c) => (c[1] as any)?.method === 'DELETE',
    );
    expect(deleteCalls).toHaveLength(0);
  });

  it('shows alert when DELETE returns ok=false', async () => {
    (global as any).fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [row] } }),
      })
      .mockResolvedValueOnce({
        ok: false, status: 400,
        json: async () => ({ success: false, message: 'Remove failed' }),
      });
    renderPanel();
    await waitFor(() => screen.getByText('Bob Jones'));
    fireEvent.click(screen.getByLabelText('Remove'));
    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith('Remove failed'),
    );
  });

  it('shows alert with fallback when DELETE ok=false and no message', async () => {
    (global as any).fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [row] } }),
      })
      .mockResolvedValueOnce({
        ok: false, status: 400,
        json: async () => ({ success: false }),
      });
    renderPanel();
    await waitFor(() => screen.getByText('Bob Jones'));
    fireEvent.click(screen.getByLabelText('Remove'));
    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith('Remove failed.'),
    );
  });

  it('shows alert with error message on DELETE network throw', async () => {
    (global as any).fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [row] } }),
      })
      .mockRejectedValueOnce(new Error('net boom'));
    renderPanel();
    await waitFor(() => screen.getByText('Bob Jones'));
    fireEvent.click(screen.getByLabelText('Remove'));
    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith('net boom'),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Remove — 409 force flow
// ═════════════════════════════════════════════════════════════════════════════

describe('DocumentRequiredReadsPanel — remove 409 force flow', () => {
  const row = makeRow({ id: 7, targetType: 'person', targetId: 10, targetName: 'Carol' });

  it('offers force-remove confirm on 409 with acknowledgment message', async () => {
    (global as any).fetch = vi.fn()
      // Initial load
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [row] } }),
      })
      // First DELETE → 409
      .mockResolvedValueOnce({
        ok: false, status: 409,
        json: async () => ({ success: false, message: 'has acknowledgment entries' }),
      });
    renderPanel();
    await waitFor(() => screen.getByText('Carol'));
    fireEvent.click(screen.getByLabelText('Remove'));
    await waitFor(() => expect(window.confirm).toHaveBeenCalledTimes(2));
  });

  it('sends force DELETE when second confirm returns true', async () => {
    (global as any).fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [row] } }),
      })
      .mockResolvedValueOnce({
        ok: false, status: 409,
        json: async () => ({ success: false, message: 'has acknowledgment entries' }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true }),
      })
      // reload after success
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [] } }),
      });
    renderPanel({ documentId: 42 });
    await waitFor(() => screen.getByText('Carol'));
    fireEvent.click(screen.getByLabelText('Remove'));
    await waitFor(() =>
      expect((global as any).fetch).toHaveBeenCalledWith(
        '/api/portal/brain/documents/42/required-reads/7?force=true',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });

  it('cancels force-remove when second confirm returns false', async () => {
    let confirmCount = 0;
    vi.spyOn(window, 'confirm').mockImplementation(() => {
      confirmCount++;
      return confirmCount === 1; // first confirm: yes; second: no
    });
    (global as any).fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [row] } }),
      })
      .mockResolvedValueOnce({
        ok: false, status: 409,
        json: async () => ({ success: false, message: 'has acknowledgment entries' }),
      });
    renderPanel();
    await waitFor(() => screen.getByText('Carol'));
    fireEvent.click(screen.getByLabelText('Remove'));
    await waitFor(() => expect(confirmCount).toBe(2));
    // No third fetch call (force DELETE was cancelled)
    const calls = ((global as any).fetch as any).mock.calls as unknown[][];
    const forceCalls = calls.filter(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('?force=true'),
    );
    expect(forceCalls).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Assign dialog — open / close
// ═════════════════════════════════════════════════════════════════════════════

describe('DocumentRequiredReadsPanel — assign dialog open/close', () => {
  it('opens AssignDialog when "Assign required read" is clicked', async () => {
    renderPanel();
    await waitFor(() => screen.getByText('No required-reads yet.'));
    fireEvent.click(screen.getByText('Assign required read'));
    await waitFor(() =>
      expect(screen.getByText('Assign required read', { selector: 'h3' })).toBeInTheDocument(),
    );
  });

  it('closes AssignDialog when Cancel button is clicked', async () => {
    renderPanel();
    await waitFor(() => screen.getByText('No required-reads yet.'));
    fireEvent.click(screen.getByText('Assign required read'));
    await waitFor(() => screen.getByText('Cancel'));
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() =>
      expect(screen.queryByText('Make this document required reading')).not.toBeInTheDocument(),
    );
  });

  it('closes AssignDialog when X (Close) button is clicked', async () => {
    renderPanel();
    await waitFor(() => screen.getByText('No required-reads yet.'));
    fireEvent.click(screen.getByText('Assign required read'));
    await waitFor(() => screen.getByLabelText('Close'));
    fireEvent.click(screen.getByLabelText('Close'));
    await waitFor(() =>
      expect(screen.queryByText('Make this document required reading')).not.toBeInTheDocument(),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Assign dialog — person branch
// ═════════════════════════════════════════════════════════════════════════════

describe('DocumentRequiredReadsPanel — assign dialog (person branch)', () => {
  async function openDialog() {
    renderPanel({ documentId: 42 });
    await waitFor(() => screen.getByText('No required-reads yet.'));
    fireEvent.click(screen.getByText('Assign required read'));
    await waitFor(() => screen.getByTestId('person-picker'));
  }

  function clickAssign() {
    // The Assign submit button contains the text "Assign" and has a person_add icon
    const allBtns = screen.getAllByRole('button');
    return allBtns.find((b) => b.textContent?.includes('Assign') && !b.textContent?.includes('required read'));
  }

  it('shows inline error when submitting without picking a person', async () => {
    await openDialog();
    // Don't set a person; click Assign
    const submitBtn = clickAssign();
    expect(submitBtn).toBeDefined();
    fireEvent.click(submitBtn!);
    await waitFor(() =>
      expect(screen.getByText('Pick a person first.')).toBeInTheDocument(),
    );
  });

  it('submits POST with personId and calls onAssigned on success', async () => {
    const onChanged = vi.fn();
    // reload call after success
    (global as any).fetch = vi.fn()
      // initial load (empty)
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [] } }),
      })
      // POST
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true }),
      })
      // reload after onAssigned
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [] } }),
      });

    renderPanel({ documentId: 42, onChanged });
    await waitFor(() => screen.getByText('No required-reads yet.'));
    fireEvent.click(screen.getByText('Assign required read'));
    await waitFor(() => screen.getByTestId('person-picker'));

    // Set person via stub input
    fireEvent.change(screen.getByTestId('person-picker'), { target: { value: '5' } });

    const submitBtn = clickAssign();
    expect(submitBtn).toBeDefined();
    fireEvent.click(submitBtn!);

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect((global as any).fetch).toHaveBeenCalledWith(
      '/api/portal/brain/documents/42/required-reads',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows inline error when POST returns ok=false', async () => {
    (global as any).fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [] } }),
      })
      .mockResolvedValueOnce({
        ok: false, status: 400,
        json: async () => ({ success: false, message: 'Already assigned' }),
      });

    renderPanel({ documentId: 42 });
    await waitFor(() => screen.getByText('No required-reads yet.'));
    fireEvent.click(screen.getByText('Assign required read'));
    await waitFor(() => screen.getByTestId('person-picker'));

    fireEvent.change(screen.getByTestId('person-picker'), { target: { value: '5' } });
    const submitBtn = clickAssign();
    fireEvent.click(submitBtn!);

    await waitFor(() =>
      expect(screen.getByText('Already assigned')).toBeInTheDocument(),
    );
  });

  it('shows fallback error when POST ok=false with no message', async () => {
    (global as any).fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [] } }),
      })
      .mockResolvedValueOnce({
        ok: false, status: 400,
        json: async () => ({ success: false }),
      });

    renderPanel({ documentId: 42 });
    await waitFor(() => screen.getByText('No required-reads yet.'));
    fireEvent.click(screen.getByText('Assign required read'));
    await waitFor(() => screen.getByTestId('person-picker'));

    fireEvent.change(screen.getByTestId('person-picker'), { target: { value: '5' } });
    const submitBtn = clickAssign();
    fireEvent.click(submitBtn!);

    await waitFor(() =>
      expect(screen.getByText('Assign failed.')).toBeInTheDocument(),
    );
  });

  it('shows network error when POST throws', async () => {
    (global as any).fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [] } }),
      })
      .mockRejectedValueOnce(new Error('net error'));

    renderPanel({ documentId: 42 });
    await waitFor(() => screen.getByText('No required-reads yet.'));
    fireEvent.click(screen.getByText('Assign required read'));
    await waitFor(() => screen.getByTestId('person-picker'));

    fireEvent.change(screen.getByTestId('person-picker'), { target: { value: '5' } });
    const submitBtn = clickAssign();
    fireEvent.click(submitBtn!);

    await waitFor(() =>
      expect(screen.getByText('net error')).toBeInTheDocument(),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Assign dialog — org_unit branch
// ═════════════════════════════════════════════════════════════════════════════

describe('DocumentRequiredReadsPanel — assign dialog (org_unit branch)', () => {
  async function openDialogOrgUnit() {
    renderPanel({ documentId: 42 });
    await waitFor(() => screen.getByText('No required-reads yet.'));
    fireEvent.click(screen.getByText('Assign required read'));
    // Wait for dialog to open by looking for the unique "Org unit" tab button
    await waitFor(() => screen.getByRole('button', { name: 'Org unit' }));

    // Switch to org_unit
    fireEvent.click(screen.getByRole('button', { name: 'Org unit' }));
  }

  function clickAssign() {
    const allBtns = screen.getAllByRole('button');
    return allBtns.find((b) => b.textContent?.includes('Assign') && !b.textContent?.includes('required read'));
  }

  it('switches to org_unit mode and renders org unit select', async () => {
    (global as any).fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [] } }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [{ id: 1, name: 'Engineering', path: '/Engineering' }] } }),
      });

    await openDialogOrgUnit();

    await waitFor(() =>
      expect(screen.getByLabelText('Org unit')).toBeInTheDocument(),
    );
  });

  it('lazy-loads org units when switching to org_unit tab', async () => {
    (global as any).fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [] } }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({
          success: true,
          data: { items: [{ id: 3, name: 'Design', path: '/Design' }] },
        }),
      });

    await openDialogOrgUnit();

    await waitFor(() =>
      expect(screen.getByText('/Design')).toBeInTheDocument(),
    );
    expect((global as any).fetch).toHaveBeenCalledWith(
      '/api/portal/brain/org-units?as=flat',
    );
  });

  it('shows inline error when submitting without picking an org unit', async () => {
    (global as any).fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [] } }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [] } }),
      });

    await openDialogOrgUnit();
    await waitFor(() => screen.getByLabelText('Org unit'));

    const submitBtn = clickAssign();
    expect(submitBtn).toBeDefined();
    fireEvent.click(submitBtn!);

    await waitFor(() =>
      expect(screen.getByText('Pick a org unit first.')).toBeInTheDocument(),
    );
  });

  it('renders expandOrgUnit checkbox in org_unit mode', async () => {
    (global as any).fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [] } }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [] } }),
      });

    await openDialogOrgUnit();
    await waitFor(() => screen.getByLabelText('Org unit'));

    expect(
      screen.getByText('Expand to individual members (one required-read per active person)'),
    ).toBeInTheDocument();
  });

  it('submits with expandOrgUnit=true when checkbox is checked', async () => {
    const onChanged = vi.fn();
    (global as any).fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [] } }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({
          success: true,
          data: { items: [{ id: 5, name: 'HR', path: '/HR' }] },
        }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [] } }),
      });

    renderPanel({ documentId: 42, onChanged });
    await waitFor(() => screen.getByText('No required-reads yet.'));
    fireEvent.click(screen.getByText('Assign required read'));
    await waitFor(() => screen.getByRole('button', { name: 'Org unit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Org unit' }));

    await waitFor(() => screen.getByText('/HR'));

    // Pick the org unit
    fireEvent.change(screen.getByLabelText('Org unit'), { target: { value: '5' } });

    // Check the expand checkbox
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    const submitBtn = clickAssign();
    fireEvent.click(submitBtn!);

    await waitFor(() => expect(onChanged).toHaveBeenCalled());

    const postCall = ((global as any).fetch as any).mock.calls.find(
      (c: unknown[]) => (c[1] as any)?.method === 'POST',
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse((postCall[1] as any).body);
    expect(body.expandOrgUnit).toBe(true);
    expect(body.targetType).toBe('org_unit');
    expect(body.targetId).toBe(5);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Assign dialog — pinned version + due date
// ═════════════════════════════════════════════════════════════════════════════

describe('DocumentRequiredReadsPanel — assign dialog (version + due date)', () => {
  async function openDialogPerson() {
    renderPanel({ documentId: 42, versions: defaultVersions });
    await waitFor(() => screen.getByText('No required-reads yet.'));
    fireEvent.click(screen.getByText('Assign required read'));
    await waitFor(() => screen.getByTestId('person-picker'));
  }

  it('renders only non-draft versions in the pin-to-version select', async () => {
    await openDialogPerson();
    await waitFor(() => screen.getByLabelText('Pin to version (optional)'));

    const select = screen.getByLabelText('Pin to version (optional)');
    const options = Array.from(select.querySelectorAll('option'));
    const labels = options.map((o) => o.textContent);
    // v1 is non-draft (id=100), v2 is draft (id=101) → should NOT appear
    expect(labels).toContain('v1');
    expect(labels).not.toContain('v2');
  });

  it('includes pinnedVersionId in POST body when version is selected', async () => {
    const onChanged = vi.fn();
    (global as any).fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [] } }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [] } }),
      });

    renderPanel({ documentId: 42, versions: defaultVersions, onChanged });
    await waitFor(() => screen.getByText('No required-reads yet.'));
    fireEvent.click(screen.getByText('Assign required read'));
    await waitFor(() => screen.getByTestId('person-picker'));

    fireEvent.change(screen.getByTestId('person-picker'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Pin to version (optional)'), { target: { value: '100' } });

    const allBtns = screen.getAllByRole('button');
    const submitBtn = allBtns.find((b) => b.textContent?.includes('Assign') && !b.textContent?.includes('required read'));
    fireEvent.click(submitBtn!);

    await waitFor(() => expect(onChanged).toHaveBeenCalled());

    const postCall = ((global as any).fetch as any).mock.calls.find(
      (c: unknown[]) => (c[1] as any)?.method === 'POST',
    );
    const body = JSON.parse((postCall[1] as any).body);
    expect(body.pinnedVersionId).toBe(100);
  });

  it('includes dueAt in POST body when due date is entered', async () => {
    const onChanged = vi.fn();
    (global as any).fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [] } }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [] } }),
      });

    renderPanel({ documentId: 42, versions: defaultVersions, onChanged });
    await waitFor(() => screen.getByText('No required-reads yet.'));
    fireEvent.click(screen.getByText('Assign required read'));
    await waitFor(() => screen.getByTestId('person-picker'));

    fireEvent.change(screen.getByTestId('person-picker'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Due date (optional)'), { target: { value: '2025-12-31' } });

    const allBtns = screen.getAllByRole('button');
    const submitBtn = allBtns.find((b) => b.textContent?.includes('Assign') && !b.textContent?.includes('required read'));
    fireEvent.click(submitBtn!);

    await waitFor(() => expect(onChanged).toHaveBeenCalled());

    const postCall = ((global as any).fetch as any).mock.calls.find(
      (c: unknown[]) => (c[1] as any)?.method === 'POST',
    );
    const body = JSON.parse((postCall[1] as any).body);
    expect(body.dueAt).toBeDefined();
    expect(body.dueAt).toContain('2025-12-31');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// onChanged optional
// ═════════════════════════════════════════════════════════════════════════════

describe('DocumentRequiredReadsPanel — onChanged optional', () => {
  it('does not throw when onChanged is undefined and remove succeeds', async () => {
    const row = makeRow({ id: 1, targetName: 'No Callback' });
    (global as any).fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [row] } }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [] } }),
      });

    renderPanel(); // no onChanged
    await waitFor(() => screen.getByText('No Callback'));

    expect(() => fireEvent.click(screen.getByLabelText('Remove'))).not.toThrow();
    await waitFor(() =>
      expect(screen.getByText('No required-reads yet.')).toBeInTheDocument(),
    );
  });

  it('does not throw when onChanged is undefined and assign succeeds', async () => {
    (global as any).fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [] } }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { items: [] } }),
      });

    renderPanel(); // no onChanged
    await waitFor(() => screen.getByText('No required-reads yet.'));
    fireEvent.click(screen.getByText('Assign required read'));
    await waitFor(() => screen.getByTestId('person-picker'));

    fireEvent.change(screen.getByTestId('person-picker'), { target: { value: '5' } });

    const allBtns = screen.getAllByRole('button');
    const submitBtn = allBtns.find((b) => b.textContent?.includes('Assign') && !b.textContent?.includes('required read'));
    expect(() => fireEvent.click(submitBtn!)).not.toThrow();

    await waitFor(() =>
      expect(screen.queryByText('Make this document required reading')).not.toBeInTheDocument(),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Section grouping — only person rows render People section, etc.
// ═════════════════════════════════════════════════════════════════════════════

describe('DocumentRequiredReadsPanel — section grouping', () => {
  it('renders only People section when all rows are person type', async () => {
    mockFetch({
      success: true,
      data: {
        items: [
          makeRow({ id: 1, targetType: 'person', targetName: 'Person A' }),
          makeRow({ id: 2, targetType: 'person', targetName: 'Person B' }),
        ],
      },
    });
    renderPanel();
    await waitFor(() => screen.getByText('Person A'));
    expect(screen.getByText(/People/)).toBeInTheDocument();
    expect(screen.queryByText(/Org units/)).not.toBeInTheDocument();
  });

  it('renders only Org units section when all rows are org_unit type', async () => {
    mockFetch({
      success: true,
      data: {
        items: [
          makeRow({ id: 1, targetType: 'org_unit', targetName: 'Engineering' }),
        ],
      },
    });
    renderPanel();
    await waitFor(() => screen.getByText('Engineering'));
    expect(screen.getByText(/Org units/)).toBeInTheDocument();
    expect(screen.queryByText(/People/)).not.toBeInTheDocument();
  });

  it('renders both sections when mixed types are present', async () => {
    mockFetch({
      success: true,
      data: {
        items: [
          makeRow({ id: 1, targetType: 'person', targetName: 'Alice' }),
          makeRow({ id: 2, targetType: 'org_unit', targetName: 'Design' }),
        ],
      },
    });
    renderPanel();
    await waitFor(() => screen.getByText('Alice'));
    expect(screen.getByText(/People/)).toBeInTheDocument();
    expect(screen.getByText(/Org units/)).toBeInTheDocument();
  });
});
