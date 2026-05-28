// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/portal/approvals',
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PendingItem {
  id: number;
  entityType: string;
  entityId: number | null;
  operation: string;
  summary: string | null;
  status: string;
  keyId: number | null;
  keyName: string | null;
  submitterName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  appliedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

const makeItem = (overrides: Partial<PendingItem> = {}): PendingItem => ({
  id: 1,
  entityType: 'post',
  entityId: 100,
  operation: 'update',
  summary: 'Update headline',
  status: 'pending',
  keyId: 5,
  keyName: 'mcp-key-a',
  submitterName: 'Alice',
  reviewedAt: null,
  reviewNote: null,
  appliedAt: null,
  errorMessage: null,
  createdAt: '2026-05-01T12:00:00.000Z',
  ...overrides,
});

const makeDetail = (
  itemOverrides: Partial<PendingItem> = {},
  extras: { payload?: unknown; originalSnapshot?: unknown; submitterEmail?: string | null } = {},
) => {
  const change = {
    ...makeItem(itemOverrides),
    payload: extras.payload ?? { title: 'New title', body: 'New body' },
    originalSnapshot: extras.originalSnapshot ?? { title: 'Old title', body: 'New body' },
  };
  return {
    change,
    keyName: change.keyName,
    submitterName: change.submitterName,
    submitterEmail: extras.submitterEmail ?? 'alice@example.com',
  };
};

type FetchResponder = (url: string, init?: RequestInit) => unknown;

function installFetchMock(responder: FetchResponder) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = responder(url, init);
    return {
      text: async () => (body === undefined ? '' : JSON.stringify(body)),
    } as unknown as Response;
  });
  (globalThis as any).fetch = fetchMock;
  return fetchMock;
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import PortalApprovalsPage from '@/app/portal/approvals/page';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PortalApprovalsPage', () => {
  const originalLocation = window.location;
  const originalAlert = window.alert;
  const originalConfirm = window.confirm;

  beforeEach(() => {
    // Reset URL between tests so the auto-open-by-id effect is deterministic.
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...originalLocation, search: '', href: 'http://localhost/portal/approvals' },
    });
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
    window.alert = originalAlert;
    window.confirm = originalConfirm;
    vi.restoreAllMocks();
  });

  it('renders the heading and tab list', async () => {
    installFetchMock(() => ({ success: true, data: [], meta: { role: 'owner', canManage: true } }));
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    expect(screen.getByText('MCP Approvals')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getByText('Applied')).toBeTruthy();
    expect(screen.getByText('Rejected')).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
    expect(screen.getByText('Expired')).toBeTruthy();
    expect(screen.getByText('All')).toBeTruthy();
  });

  it('shows the empty-state when no items are returned', async () => {
    installFetchMock(() => ({ success: true, data: [], meta: { canManage: false } }));
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    expect(screen.getByText(/No pending changes\./)).toBeTruthy();
  });

  it('renders a list of items from the API', async () => {
    installFetchMock(() => ({
      success: true,
      data: [
        makeItem({ id: 1, summary: 'Item one summary', entityType: 'post' }),
        makeItem({ id: 2, summary: 'Item two summary', entityType: 'pitch_deck', status: 'applied' }),
      ],
      meta: { canManage: true },
    }));
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    expect(screen.getByText('Item one summary')).toBeTruthy();
    expect(screen.getByText('Item two summary')).toBeTruthy();
    // entity label resolution
    expect(screen.getAllByText(/Post · update/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Pitch Deck · update/).length).toBeGreaterThan(0);
  });

  it('falls back to "(no summary)" when summary is null', async () => {
    installFetchMock(() => ({
      success: true,
      data: [makeItem({ id: 1, summary: null })],
      meta: { canManage: false },
    }));
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    expect(screen.getAllByText('(no summary)').length).toBeGreaterThan(0);
  });

  it('falls back to "unknown key" when keyName is null', async () => {
    installFetchMock(() => ({
      success: true,
      data: [makeItem({ id: 1, keyName: null })],
      meta: { canManage: false },
    }));
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    expect(screen.getByText(/unknown key/)).toBeTruthy();
  });

  it('switches filters and re-fetches without ?status when "all" is selected', async () => {
    const fetchMock = installFetchMock((url) => {
      if (url.includes('/api/portal/approvals') && !url.includes('/')) {
        return { success: true, data: [], meta: { canManage: true } };
      }
      return { success: true, data: [], meta: { canManage: true } };
    });
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    // initial pending call
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('?status=pending'))).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByText('Applied'));
    });
    await flush();
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('?status=applied'))).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByText('All'));
    });
    await flush();
    // "all" => no query string
    expect(
      fetchMock.mock.calls.some(([u]) => String(u) === '/api/portal/approvals'),
    ).toBe(true);
  });

  it('handles an unsuccessful list response without crashing', async () => {
    installFetchMock(() => ({ success: false, message: 'nope' }));
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    // empty state still visible
    expect(screen.getByText(/No pending changes\./)).toBeTruthy();
  });

  it('treats a non-JSON empty body as a failed response', async () => {
    (globalThis as any).fetch = vi.fn(async () => ({ text: async () => '' } as any));
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    expect(screen.getByText(/No pending changes\./)).toBeTruthy();
  });

  it('treats invalid JSON as a failed response (try/catch path in safeJson)', async () => {
    (globalThis as any).fetch = vi.fn(async () => ({ text: async () => 'this is not json' } as any));
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    expect(screen.getByText(/No pending changes\./)).toBeTruthy();
  });

  it('opens a detail panel when an item is clicked, showing summary + submitter', async () => {
    installFetchMock((url) => {
      if (url === '/api/portal/approvals?status=pending') {
        return { success: true, data: [makeItem({ id: 7, summary: 'Click me' })], meta: { canManage: true } };
      }
      if (url === '/api/portal/approvals/7') {
        return { success: true, data: makeDetail({ id: 7, summary: 'Click me' }) };
      }
      return { success: false };
    });
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByText('Click me'));
    });
    await flush();
    // heading-level summary now appears
    expect(screen.getAllByText('Click me').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Submitted by Alice via key/)).toBeTruthy();
  });

  it('renders DiffViewer rows with added / removed / changed / unchanged kinds', async () => {
    installFetchMock((url) => {
      if (url.startsWith('/api/portal/approvals?')) {
        return { success: true, data: [makeItem({ id: 9 })], meta: { canManage: true } };
      }
      if (url === '/api/portal/approvals/9') {
        return {
          success: true,
          data: makeDetail({ id: 9 }, {
            payload: { kept: 'same', changed: 'new', addedOnly: 'A' },
            originalSnapshot: { kept: 'same', changed: 'old', removedOnly: 'R' },
          }),
        };
      }
      return { success: false };
    });
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByText(/Update headline/));
    });
    await flush();
    expect(screen.getAllByText('added').length).toBeGreaterThan(0);
    expect(screen.getAllByText('removed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('changed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('unchanged').length).toBeGreaterThan(0);
  });

  it('shows "No fields to compare." when both sides are empty objects', async () => {
    installFetchMock((url) => {
      if (url.startsWith('/api/portal/approvals?')) {
        return { success: true, data: [makeItem({ id: 11, operation: 'update' })], meta: { canManage: true } };
      }
      if (url === '/api/portal/approvals/11') {
        return {
          success: true,
          data: makeDetail({ id: 11, operation: 'update' }, {
            payload: {},
            originalSnapshot: {},
          }),
        };
      }
      return { success: false };
    });
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByText(/Update headline/));
    });
    await flush();
    expect(screen.getByText('No fields to compare.')).toBeTruthy();
  });

  it('treats "create" operation as before={}, so all fields are added', async () => {
    installFetchMock((url) => {
      if (url.startsWith('/api/portal/approvals?')) {
        return { success: true, data: [makeItem({ id: 12, operation: 'create' })], meta: { canManage: true } };
      }
      if (url === '/api/portal/approvals/12') {
        return {
          success: true,
          data: makeDetail({ id: 12, operation: 'create' }, {
            payload: { title: 'Brand new', slug: 'brand-new' },
            originalSnapshot: null,
          }),
        };
      }
      return { success: false };
    });
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByText(/Update headline/));
    });
    await flush();
    expect(screen.getByText('Proposed content')).toBeTruthy();
    // both top-level keys were "added"
    expect(screen.getAllByText('added').length).toBe(2);
  });

  it('switches to Raw JSON view and shows payload + current state', async () => {
    installFetchMock((url) => {
      if (url.startsWith('/api/portal/approvals?')) {
        return { success: true, data: [makeItem({ id: 13 })], meta: { canManage: true } };
      }
      if (url === '/api/portal/approvals/13') {
        return { success: true, data: makeDetail({ id: 13 }) };
      }
      return { success: false };
    });
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByText(/Update headline/));
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByText('Raw JSON'));
    });
    expect(screen.getByText('Proposed payload')).toBeTruthy();
    expect(screen.getByText('Current state')).toBeTruthy();
  });

  it('hides "Current state" in Raw JSON view when operation is create', async () => {
    installFetchMock((url) => {
      if (url.startsWith('/api/portal/approvals?')) {
        return { success: true, data: [makeItem({ id: 14, operation: 'create' })], meta: { canManage: true } };
      }
      if (url === '/api/portal/approvals/14') {
        return { success: true, data: makeDetail({ id: 14, operation: 'create' }, { originalSnapshot: null }) };
      }
      return { success: false };
    });
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByText(/Update headline/));
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByText('Raw JSON'));
    });
    expect(screen.getByText('Proposed payload')).toBeTruthy();
    expect(screen.queryByText('Current state')).toBeNull();
  });

  it('shows the failed-apply error block when status is failed and errorMessage is present', async () => {
    installFetchMock((url) => {
      if (url.startsWith('/api/portal/approvals?')) {
        return { success: true, data: [makeItem({ id: 15, status: 'failed', errorMessage: 'boom' })], meta: { canManage: true } };
      }
      if (url === '/api/portal/approvals/15') {
        return { success: true, data: makeDetail({ id: 15, status: 'failed', errorMessage: 'boom' }) };
      }
      return { success: false };
    });
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByText(/Update headline/));
    });
    await flush();
    expect(screen.getByText('Apply failed:')).toBeTruthy();
    expect(screen.getByText(/boom/)).toBeTruthy();
  });

  it('renders the review note when present on the change', async () => {
    installFetchMock((url) => {
      if (url.startsWith('/api/portal/approvals?')) {
        return { success: true, data: [makeItem({ id: 16, reviewNote: 'Looks good' })], meta: { canManage: true } };
      }
      if (url === '/api/portal/approvals/16') {
        return { success: true, data: makeDetail({ id: 16, reviewNote: 'Looks good' }) };
      }
      return { success: false };
    });
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByText(/Update headline/));
    });
    await flush();
    expect(screen.getByText('Review note:')).toBeTruthy();
    expect(screen.getByText(/Looks good/)).toBeTruthy();
  });

  it('shows the "only owners and admins" notice when canManage is false on a pending change', async () => {
    installFetchMock((url) => {
      if (url.startsWith('/api/portal/approvals?')) {
        return { success: true, data: [makeItem({ id: 17 })], meta: { canManage: false } };
      }
      if (url === '/api/portal/approvals/17') {
        return { success: true, data: makeDetail({ id: 17 }) };
      }
      return { success: false };
    });
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByText(/Update headline/));
    });
    await flush();
    expect(screen.getByText(/Only owners and admins/)).toBeTruthy();
  });

  it('approves a pending change and refreshes the list on success', async () => {
    const fetchMock = installFetchMock((url, init) => {
      if (url === '/api/portal/approvals?status=pending') {
        return { success: true, data: [makeItem({ id: 21 })], meta: { canManage: true } };
      }
      if (url === '/api/portal/approvals/21') {
        return { success: true, data: makeDetail({ id: 21 }) };
      }
      if (url === '/api/portal/approvals/21/approve') {
        expect(init?.method).toBe('POST');
        return { success: true };
      }
      return { success: false };
    });
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByText(/Update headline/));
    });
    await flush();
    const note = screen.getByPlaceholderText(/Add a note for the submitter/);
    await act(async () => {
      fireEvent.change(note, { target: { value: 'lgtm' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByText(/Approve & Apply/));
    });
    await flush();
    expect(
      fetchMock.mock.calls.some(([u]) => String(u) === '/api/portal/approvals/21/approve'),
    ).toBe(true);
    // panel should clear back to the placeholder
    expect(screen.getByText('Select a change to review.')).toBeTruthy();
  });

  it('alerts when an approve call fails', async () => {
    installFetchMock((url) => {
      if (url === '/api/portal/approvals?status=pending') {
        return { success: true, data: [makeItem({ id: 22 })], meta: { canManage: true } };
      }
      if (url === '/api/portal/approvals/22') {
        return { success: true, data: makeDetail({ id: 22 }) };
      }
      if (url === '/api/portal/approvals/22/approve') {
        return { success: false, message: 'no permission' };
      }
      return { success: false };
    });
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByText(/Update headline/));
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByText(/Approve & Apply/));
    });
    await flush();
    expect(window.alert).toHaveBeenCalledWith('no permission');
  });

  it('rejects a change after confirm()=true', async () => {
    const fetchMock = installFetchMock((url) => {
      if (url === '/api/portal/approvals?status=pending') {
        return { success: true, data: [makeItem({ id: 23 })], meta: { canManage: true } };
      }
      if (url === '/api/portal/approvals/23') {
        return { success: true, data: makeDetail({ id: 23 }) };
      }
      if (url === '/api/portal/approvals/23/reject') {
        return { success: true };
      }
      return { success: false };
    });
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByText(/Update headline/));
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByText('Reject'));
    });
    await flush();
    expect(window.confirm).toHaveBeenCalled();
    expect(
      fetchMock.mock.calls.some(([u]) => String(u) === '/api/portal/approvals/23/reject'),
    ).toBe(true);
  });

  it('does NOT call the reject API when confirm() returns false', async () => {
    window.confirm = vi.fn(() => false);
    const fetchMock = installFetchMock((url) => {
      if (url === '/api/portal/approvals?status=pending') {
        return { success: true, data: [makeItem({ id: 24 })], meta: { canManage: true } };
      }
      if (url === '/api/portal/approvals/24') {
        return { success: true, data: makeDetail({ id: 24 }) };
      }
      return { success: true };
    });
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByText(/Update headline/));
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByText('Reject'));
    });
    await flush();
    expect(
      fetchMock.mock.calls.some(([u]) => String(u).endsWith('/reject')),
    ).toBe(false);
  });

  it('alerts when a reject call fails', async () => {
    installFetchMock((url) => {
      if (url === '/api/portal/approvals?status=pending') {
        return { success: true, data: [makeItem({ id: 25 })], meta: { canManage: true } };
      }
      if (url === '/api/portal/approvals/25') {
        return { success: true, data: makeDetail({ id: 25 }) };
      }
      if (url === '/api/portal/approvals/25/reject') {
        return { success: false, message: 'cant reject' };
      }
      return { success: false };
    });
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByText(/Update headline/));
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByText('Reject'));
    });
    await flush();
    expect(window.alert).toHaveBeenCalledWith('cant reject');
  });

  it('renders a select-all checkbox and toggles all pending ids on/off', async () => {
    installFetchMock(() => ({
      success: true,
      data: [
        makeItem({ id: 31 }),
        makeItem({ id: 32, summary: 'Another' }),
        makeItem({ id: 33, status: 'applied', summary: 'Done one' }),
      ],
      meta: { canManage: true },
    }));
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    const selectAllLabel = screen.getByText(/Select all 2 pending/);
    expect(selectAllLabel).toBeTruthy();
    // The select-all checkbox is the first checkbox in the document.
    const allCheckboxes = document.querySelectorAll('input[type="checkbox"]');
    const selectAll = allCheckboxes[0] as HTMLInputElement;
    await act(async () => {
      fireEvent.click(selectAll);
    });
    // "2 selected" appears in both the header bar and the floating bulk bar.
    expect(screen.getAllByText(/2 selected/).length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.click(selectAll);
    });
    expect(screen.getByText(/Select all 2 pending/)).toBeTruthy();
  });

  it('toggles a single item checkbox and updates the floating bulk bar', async () => {
    installFetchMock(() => ({
      success: true,
      data: [makeItem({ id: 41 }), makeItem({ id: 42 })],
      meta: { canManage: true },
    }));
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    // [0] is select-all, [1] is first item, [2] is second item
    await act(async () => {
      fireEvent.click(checkboxes[1] as HTMLInputElement);
    });
    expect(screen.getAllByText(/1 selected/).length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.click(checkboxes[2] as HTMLInputElement);
    });
    expect(screen.getAllByText(/2 selected/).length).toBeGreaterThan(0);
    // uncheck the first one
    await act(async () => {
      fireEvent.click(checkboxes[1] as HTMLInputElement);
    });
    expect(screen.getAllByText(/1 selected/).length).toBeGreaterThan(0);
  });

  it('opens the bulk-approve confirmation modal and shows entity-type counts', async () => {
    installFetchMock(() => ({
      success: true,
      data: [
        makeItem({ id: 51, entityType: 'post' }),
        makeItem({ id: 52, entityType: 'pitch_deck' }),
      ],
      meta: { canManage: true },
    }));
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    await act(async () => {
      fireEvent.click(checkboxes[1] as HTMLInputElement);
      fireEvent.click(checkboxes[2] as HTMLInputElement);
    });
    // The bulk bar's Approve button
    const approveButtons = screen.getAllByText('Approve');
    await act(async () => {
      fireEvent.click(approveButtons[approveButtons.length - 1]);
    });
    expect(screen.getByText(/Approve 2 changes\?/)).toBeTruthy();
    expect(screen.getByText('Post')).toBeTruthy();
    expect(screen.getByText('Pitch Deck')).toBeTruthy();
  });

  it('opens the bulk-reject confirmation modal with the reject-specific copy', async () => {
    installFetchMock(() => ({
      success: true,
      data: [makeItem({ id: 61 })],
      meta: { canManage: true },
    }));
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    await act(async () => {
      fireEvent.click(checkboxes[1] as HTMLInputElement);
    });
    // Bulk bar's "Reject" button. There may also be a detail-pane reject, so
    // grab the last one which is the floating bar.
    const rejectButtons = screen.getAllByText('Reject');
    await act(async () => {
      fireEvent.click(rejectButtons[rejectButtons.length - 1]);
    });
    expect(screen.getByText(/Reject 1 change\?/)).toBeTruthy();
    expect(screen.getByText(/Each selected change will be marked rejected/)).toBeTruthy();
  });

  it('confirms a bulk approve and shows the result toast', async () => {
    const fetchMock = installFetchMock((url) => {
      if (url === '/api/portal/approvals?status=pending') {
        return {
          success: true,
          data: [makeItem({ id: 71 }), makeItem({ id: 72 })],
          meta: { canManage: true },
        };
      }
      if (url === '/api/portal/approvals/bulk-approve') {
        return {
          success: true,
          data: { total: 2, applied: 2, failed: 0, skipped: 0, results: [] },
        };
      }
      return { success: true, data: [], meta: { canManage: true } };
    });
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    await act(async () => {
      fireEvent.click(checkboxes[1] as HTMLInputElement);
      fireEvent.click(checkboxes[2] as HTMLInputElement);
    });
    const approveButtons = screen.getAllByText('Approve');
    await act(async () => {
      fireEvent.click(approveButtons[approveButtons.length - 1]);
    });
    await act(async () => {
      fireEvent.click(screen.getByText(/Confirm approve/));
    });
    await flush();
    expect(
      fetchMock.mock.calls.some(([u]) => String(u) === '/api/portal/approvals/bulk-approve'),
    ).toBe(true);
    expect(screen.getByText(/Bulk result: 2 of 2/)).toBeTruthy();
  });

  it('alerts on bulk-approve API failure', async () => {
    installFetchMock((url) => {
      if (url === '/api/portal/approvals?status=pending') {
        return { success: true, data: [makeItem({ id: 81 })], meta: { canManage: true } };
      }
      if (url === '/api/portal/approvals/bulk-approve') {
        return { success: false, message: 'bulk boom' };
      }
      return { success: true };
    });
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    await act(async () => {
      fireEvent.click(checkboxes[1] as HTMLInputElement);
    });
    const approveButtons = screen.getAllByText('Approve');
    await act(async () => {
      fireEvent.click(approveButtons[approveButtons.length - 1]);
    });
    await act(async () => {
      fireEvent.click(screen.getByText(/Confirm approve/));
    });
    await flush();
    expect(window.alert).toHaveBeenCalledWith('bulk boom');
  });

  it('cancels the bulk modal without firing a bulk API call', async () => {
    const fetchMock = installFetchMock(() => ({
      success: true,
      data: [makeItem({ id: 91 })],
      meta: { canManage: true },
    }));
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    await act(async () => {
      fireEvent.click(checkboxes[1] as HTMLInputElement);
    });
    const approveButtons = screen.getAllByText('Approve');
    await act(async () => {
      fireEvent.click(approveButtons[approveButtons.length - 1]);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Cancel'));
    });
    expect(screen.queryByText(/Approve 1 change\?/)).toBeNull();
    expect(
      fetchMock.mock.calls.some(([u]) => String(u).includes('/bulk-approve')),
    ).toBe(false);
  });

  it('clears the floating bulk-action selection via the close button', async () => {
    installFetchMock(() => ({
      success: true,
      data: [makeItem({ id: 101 })],
      meta: { canManage: true },
    }));
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    await act(async () => {
      fireEvent.click(checkboxes[1] as HTMLInputElement);
    });
    expect(screen.getAllByText(/1 selected/).length).toBeGreaterThan(0);
    const closeBtn = screen.getByTitle('Clear selection');
    await act(async () => {
      fireEvent.click(closeBtn);
    });
    expect(screen.queryByText(/1 selected/)).toBeNull();
  });

  it('shows the "Max 25 per batch" warning when selection exceeds bulk cap', async () => {
    const many = Array.from({ length: 26 }, (_, i) => makeItem({ id: 200 + i, summary: `Item ${i}` }));
    installFetchMock(() => ({ success: true, data: many, meta: { canManage: true } }));
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    // [0] is select-all
    await act(async () => {
      fireEvent.click(checkboxes[0] as HTMLInputElement);
    });
    expect(screen.getAllByText(/Max 25 per batch/).length).toBeGreaterThan(0);
  });

  it('auto-opens a detail panel when ?id=N is in the URL on mount', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...originalLocation, search: '?id=999', href: 'http://localhost/portal/approvals?id=999' },
    });
    let detailCalled = false;
    installFetchMock((url) => {
      if (url === '/api/portal/approvals') {
        // "all" filter triggers the no-query-string call
        return { success: true, data: [makeItem({ id: 999, summary: 'Auto-open me' })], meta: { canManage: true } };
      }
      if (url === '/api/portal/approvals?status=all') {
        return { success: true, data: [makeItem({ id: 999, summary: 'Auto-open me' })], meta: { canManage: true } };
      }
      if (url === '/api/portal/approvals/999') {
        detailCalled = true;
        return { success: true, data: makeDetail({ id: 999, summary: 'Auto-open me' }) };
      }
      return { success: false };
    });
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    await flush();
    expect(detailCalled).toBe(true);
  });

  it('ignores non-numeric ?id values without crashing', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...originalLocation, search: '?id=not-a-number', href: 'http://localhost/portal/approvals?id=not-a-number' },
    });
    let detailCalled = false;
    installFetchMock((url) => {
      if (url.includes('/api/portal/approvals/')) {
        detailCalled = true;
        return { success: false };
      }
      return { success: true, data: [], meta: { canManage: true } };
    });
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    expect(detailCalled).toBe(false);
  });

  it('falls back to entityType string when no entityLabel mapping exists', async () => {
    installFetchMock(() => ({
      success: true,
      data: [makeItem({ id: 301, entityType: 'unknown_kind' })],
      meta: { canManage: true },
    }));
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    expect(screen.getByText(/unknown_kind · update/)).toBeTruthy();
  });

  it('renders error icon when an item has an errorMessage', async () => {
    installFetchMock(() => ({
      success: true,
      data: [makeItem({ id: 401, status: 'failed', errorMessage: 'whoops' })],
      meta: { canManage: true },
    }));
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    // material-icon span has title=errorMessage
    const icons = document.querySelectorAll('span[title="whoops"]');
    expect(icons.length).toBeGreaterThan(0);
  });

  it('formatValue handles null, string, number, boolean, and JSON-serializable objects via the Diff rendering path', async () => {
    installFetchMock((url) => {
      if (url.startsWith('/api/portal/approvals?')) {
        return { success: true, data: [makeItem({ id: 501 })], meta: { canManage: true } };
      }
      if (url === '/api/portal/approvals/501') {
        return {
          success: true,
          data: makeDetail({ id: 501 }, {
            payload: { s: 'hi', n: 42, b: true, nested: { a: 1 }, nullish: null },
            originalSnapshot: { s: 'bye', n: 0, b: false, nested: { a: 2 }, nullish: 'old' },
          }),
        };
      }
      return { success: false };
    });
    await act(async () => {
      render(<PortalApprovalsPage />);
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByText(/Update headline/));
    });
    await flush();
    // numeric / boolean string-coercion, plus null rendering
    expect(screen.getByText('hi')).toBeTruthy();
    expect(screen.getByText('bye')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('true')).toBeTruthy();
    expect(screen.getAllByText('null').length).toBeGreaterThan(0);
  });
});
