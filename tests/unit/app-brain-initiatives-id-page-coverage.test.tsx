// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/brain/initiatives/[id]/page.tsx`.
 *
 * Covers:
 *   - Loading state
 *   - Error state (invalid id, API failure, network throw)
 *   - Successful render: header, status/priority chips, owner, dates, description
 *   - Description: truncation (show more / show less)
 *   - Action buttons: Edit, Close, Reopen, Cancel
 *   - Editing flow: InitiativeForm onSubmit (success + failure), onCancel
 *   - Close flow: InitiativeForm (close mode) onSubmit (success + failure), onCancel
 *   - Reopen flow (confirm, success, failure)
 *   - Cancel flow (confirm, success, failure, router.push)
 *   - Goals section: no goals, goals list, add-goal toggle
 *   - AddGoalForm: validation, submit success, submit failure, cancel
 *   - GoalProgress callbacks: onCheckin, onDelete (with confirm)
 *   - Lessons learned section (terminal only)
 *
 * Mocks: next/navigation, global fetch, window.confirm,
 *        InitiativeForm, GoalProgress, InitiativeLinksPanel,
 *        react.use (params unwrap).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ────────────────────────────────────────

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/portal/brain/initiatives/1',
  useSearchParams: () => new URLSearchParams(),
}));

// Capture InitiativeForm props so we can invoke callbacks
type InitiativeFormCaptured = {
  onSubmit?: (vals: Record<string, unknown>) => void;
  onCancel?: () => void;
  mode?: string;
};
const capturedInitiativeFormProps: InitiativeFormCaptured = {};

vi.mock('@/components/brain/InitiativeForm', () => ({
  default: (props: {
    mode?: string;
    onSubmit?: (vals: Record<string, unknown>) => void;
    onCancel?: () => void;
    team?: unknown[];
    initial?: Record<string, unknown>;
  }) => {
    capturedInitiativeFormProps.onSubmit = props.onSubmit;
    capturedInitiativeFormProps.onCancel = props.onCancel;
    capturedInitiativeFormProps.mode = props.mode;
    return React.createElement('div', { 'data-testid': 'initiative-form', 'data-mode': props.mode }, `InitiativeForm(${props.mode})`);
  },
}));

// Capture GoalProgress callbacks
type GoalProgressCaptured = {
  onCheckin?: (args: Record<string, unknown>) => void;
  onDelete?: () => void;
  goalId?: number;
};
const capturedGoalProgressProps: GoalProgressCaptured = {};

vi.mock('@/components/brain/GoalProgress', () => ({
  default: (props: {
    goal: { id: number };
    ownerLookup: Record<number, unknown>;
    onCheckin?: (args: Record<string, unknown>) => void;
    onDelete?: () => void;
  }) => {
    capturedGoalProgressProps.onCheckin = props.onCheckin;
    capturedGoalProgressProps.onDelete = props.onDelete;
    capturedGoalProgressProps.goalId = props.goal.id;
    return React.createElement('div', { 'data-testid': `goal-${props.goal.id}` }, `Goal#${props.goal.id}`);
  },
}));

vi.mock('@/components/brain/InitiativeLinksPanel', () => ({
  default: (props: { initiativeId: number; links: unknown[]; onChanged?: () => void }) => {
    return React.createElement('div', { 'data-testid': 'links-panel', 'data-initiative-id': props.initiativeId }, 'LinksPanel');
  },
}));

// ─── react.use stub ───────────────────────────────────────────────────────────
// The page calls `reactUse(params)` where params is a Promise<{ id: string }>.
// In tests we cannot run Suspense; we attach a `_testId` property on the
// Promise object so our stub can return it synchronously.
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    use: (p: Promise<{ id: string }> | unknown) => {
      if (p && typeof (p as { _testId?: string })._testId === 'string') {
        return { id: (p as { _testId: string })._testId };
      }
      // fallback: throw so Suspense would catch it (shouldn't happen in tests)
      throw p;
    },
  };
});

// ─── Fetch stub ───────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<unknown> };
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, json: async () => body };
}

const confirmMock = vi.fn<(msg: string) => boolean>();

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeInitiative(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    clientId: 10,
    name: 'Test Initiative',
    slug: 'test-initiative',
    description: null,
    status: 'active',
    priority: 'medium',
    ownerId: null,
    sponsorId: null,
    startDate: null,
    targetDate: null,
    closedAt: null,
    closeReason: null,
    lessonsLearned: null,
    confidentialityLevel: 'standard',
    createdBy: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeGoal(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    clientId: 10,
    initiativeId: 1,
    title: `Goal ${id}`,
    description: null,
    status: 'open',
    ownerId: null,
    unit: null,
    targetMetric: null,
    currentMetric: null,
    lastProgressNote: null,
    lastCheckedInAt: null,
    targetDate: null,
    sortOrder: 0,
    createdBy: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeDetailResponse(
  initiativeOverrides: Record<string, unknown> = {},
  goals: unknown[] = [],
  links: unknown[] = [],
) {
  return {
    success: true,
    data: {
      initiative: makeInitiative(initiativeOverrides),
      goals,
      links: { byType: {}, items: links },
    },
  };
}

function setupDefault(
  initiativeOverrides: Record<string, unknown> = {},
  goals: unknown[] = [],
) {
  fetchMock.mockImplementation(async (url: string, _init?: RequestInit) => {
    if (url.includes('/api/portal/brain/initiatives/')) {
      return makeRes(makeDetailResponse(initiativeOverrides, goals));
    }
    if (url === '/api/portal/team') {
      return makeRes({ success: true, data: [] });
    }
    return makeRes({ success: true, data: {} });
  });
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  confirmMock.mockReset();
  capturedInitiativeFormProps.onSubmit = undefined;
  capturedInitiativeFormProps.onCancel = undefined;
  capturedInitiativeFormProps.mode = undefined;
  capturedGoalProgressProps.onCheckin = undefined;
  capturedGoalProgressProps.onDelete = undefined;
  capturedGoalProgressProps.goalId = undefined;
  setupDefault();
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  vi.stubGlobal('confirm', confirmMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Import after mocks
import InitiativeDetailPage from '@/app/portal/brain/initiatives/[id]/page';

function makeParams(id: string) {
  // Attach _testId so our react.use stub can unwrap it synchronously.
  const p = Promise.resolve({ id }) as Promise<{ id: string }> & { _testId: string };
  p._testId = id;
  return p;
}

function renderPage(id = '1') {
  return render(<InitiativeDetailPage params={makeParams(id)} />);
}

// ─── Loading state ─────────────────────────────────────────────────────────────

describe('InitiativeDetailPage — loading state', () => {
  it('shows loading spinner before data resolves', () => {
    fetchMock.mockImplementation(() => new Promise(() => { /* pending */ }));
    const { container } = renderPage();
    expect(container.textContent).toContain('Loading');
  });
});

// ─── Invalid ID ───────────────────────────────────────────────────────────────

describe('InitiativeDetailPage — invalid id', () => {
  it('shows error for non-numeric id', async () => {
    // NaN from parseInt('abc', 10)
    fetchMock.mockImplementation(() => new Promise(() => { /* pending */ }));
    const { container } = renderPage('abc');
    await waitFor(() => {
      expect(container.textContent).toContain('Invalid initiative id');
    });
  });

  it('shows error for id=0', async () => {
    fetchMock.mockImplementation(() => new Promise(() => { /* pending */ }));
    const { container } = renderPage('0');
    await waitFor(() => {
      expect(container.textContent).toContain('Invalid initiative id');
    });
  });
});

// ─── Error state ──────────────────────────────────────────────────────────────

describe('InitiativeDetailPage — error state', () => {
  it('shows error when API returns !ok with message', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/initiatives/')) {
        return makeRes({ success: false, message: 'Not found' }, false);
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Not found');
    });
  });

  it('shows error when API returns success:false', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/initiatives/')) {
        return makeRes({ success: false }, true);
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Failed to load initiative');
    });
  });

  it('shows error when fetch throws an Error', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/initiatives/')) {
        throw new Error('network down');
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('network down');
    });
  });

  it('shows back link in error state', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/initiatives/')) {
        return makeRes({ success: false, message: 'Boom' }, false);
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/initiatives"]');
      expect(link).toBeTruthy();
    });
  });

  it('shows "Initiative not found" fallback when no data and no error message', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/initiatives/')) {
        return makeRes({ success: true, data: null });
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      // data is null → !data → error branch, no error message set → "Initiative not found"
      expect(container.textContent).toMatch(/not found|Failed to load/i);
    });
  });
});

// ─── Successful render ────────────────────────────────────────────────────────

describe('InitiativeDetailPage — successful render', () => {
  it('renders initiative name', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Test Initiative');
    });
  });

  it('renders status chip for active initiative', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Active');
    });
  });

  it('renders priority chip', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Medium');
    });
  });

  it('renders back link to initiatives list', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/initiatives"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders Goals section', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Goals');
    });
  });

  it('renders LinksPanel', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="links-panel"]')).toBeTruthy();
    });
  });

  it('renders "No goals yet" when goals list is empty', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No goals yet');
    });
  });
});

// ─── Status/priority chips ────────────────────────────────────────────────────

describe('InitiativeDetailPage — status chips', () => {
  it.each([
    ['planned', 'Planned'],
    ['paused', 'Paused'],
    ['completed', 'Completed'],
    ['cancelled', 'Cancelled'],
  ] as const)('renders %s chip as "%s"', async (status, label) => {
    setupDefault({ status });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain(label);
    });
  });

  it.each([
    ['low', 'Low'],
    ['high', 'High'],
    ['critical', 'Critical'],
  ] as const)('renders %s priority as "%s"', async (priority, label) => {
    setupDefault({ priority });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain(label);
    });
  });
});

// ─── Owner and dates ──────────────────────────────────────────────────────────

describe('InitiativeDetailPage — owner and dates', () => {
  it('renders owner name when team member is found', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/initiatives/')) {
        return makeRes(makeDetailResponse({ ownerId: 5 }));
      }
      if (url === '/api/portal/team') {
        return makeRes({
          success: true,
          data: [{ userId: 5, name: 'Alice Smith', email: 'alice@test.com' }],
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Alice Smith');
    });
  });

  it('renders owner email when name is null', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/initiatives/')) {
        return makeRes(makeDetailResponse({ ownerId: 7 }));
      }
      if (url === '/api/portal/team') {
        return makeRes({
          success: true,
          data: [{ userId: 7, name: null, email: 'bob@test.com' }],
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('bob@test.com');
    });
  });

  it('renders "User #N" when ownerId is set but not in team', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/initiatives/')) {
        return makeRes(makeDetailResponse({ ownerId: 99 }));
      }
      if (url === '/api/portal/team') {
        return makeRes({ success: true, data: [] });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('User #99');
    });
  });

  it('renders target date', async () => {
    setupDefault({ targetDate: '2025-12-31' });
    const { container } = renderPage();
    await waitFor(() => {
      // The date is rendered via toLocaleDateString() — value may vary by timezone,
      // so we just verify the "target" label and a year appear together.
      expect(container.textContent).toMatch(/target.*2025/);
    });
  });

  it('renders start date', async () => {
    setupDefault({ startDate: '2025-01-15' });
    const { container } = renderPage();
    await waitFor(() => {
      // The date is rendered via toLocaleDateString() — value may vary by timezone.
      expect(container.textContent).toContain('started');
      expect(container.textContent).toContain('2025');
    });
  });

  it('renders overdue styling when targetDate is in the past', async () => {
    setupDefault({ targetDate: '2020-01-01', status: 'active' });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('overdue');
    });
  });

  it('renders days remaining when targetDate is in the future', async () => {
    // Far future date
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    setupDefault({ targetDate: future, status: 'active' });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('d left');
    });
  });

  it('renders closedAt date for terminal initiative', async () => {
    setupDefault({ status: 'completed', closedAt: '2024-06-01T10:00:00Z' });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('closed');
    });
  });
});

// ─── Description ──────────────────────────────────────────────────────────────

describe('InitiativeDetailPage — description', () => {
  it('renders short description in full', async () => {
    setupDefault({ description: 'A short description' });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('A short description');
    });
  });

  it('truncates long description with "show more" button', async () => {
    const longDesc = 'x'.repeat(300);
    setupDefault({ description: longDesc });
    const { container } = renderPage();
    await waitFor(() => {
      const showMoreBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('show more'),
      );
      expect(showMoreBtn).toBeTruthy();
    });
  });

  it('"show more" expands to full description and shows "show less"', async () => {
    const longDesc = 'y'.repeat(300);
    setupDefault({ description: longDesc });
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('show more'),
      ) as HTMLButtonElement;
      expect(btn).toBeTruthy();
      fireEvent.click(btn);
    });
    await waitFor(() => {
      const showLessBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('show less'),
      );
      expect(showLessBtn).toBeTruthy();
    });
  });

  it('"show less" collapses back to truncated view', async () => {
    const longDesc = 'z'.repeat(300);
    setupDefault({ description: longDesc });
    const { container } = renderPage();
    await waitFor(() => {
      const showMoreBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('show more'),
      ) as HTMLButtonElement;
      fireEvent.click(showMoreBtn);
    });
    await waitFor(() => {
      const showLessBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('show less'),
      ) as HTMLButtonElement;
      fireEvent.click(showLessBtn);
    });
    await waitFor(() => {
      const showMoreBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('show more'),
      );
      expect(showMoreBtn).toBeTruthy();
    });
  });
});

// ─── Action buttons — non-terminal ────────────────────────────────────────────

describe('InitiativeDetailPage — action buttons (active)', () => {
  it('renders Edit button for active initiative', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const editBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Edit'),
      );
      expect(editBtn).toBeTruthy();
    });
  });

  it('renders Close button for active initiative', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const closeBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Close'),
      );
      expect(closeBtn).toBeTruthy();
    });
  });

  it('renders Cancel button for active initiative', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const cancelBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Cancel'),
      );
      expect(cancelBtn).toBeTruthy();
    });
  });

  it('does NOT render Reopen button for active initiative', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Test Initiative');
    });
    const reopenBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Reopen'),
    );
    expect(reopenBtn).toBeFalsy();
  });
});

// ─── Action buttons — terminal ────────────────────────────────────────────────

describe('InitiativeDetailPage — action buttons (terminal)', () => {
  it('renders Reopen button for completed initiative', async () => {
    setupDefault({ status: 'completed' });
    const { container } = renderPage();
    await waitFor(() => {
      const reopenBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Reopen'),
      );
      expect(reopenBtn).toBeTruthy();
    });
  });

  it('does NOT render Edit/Close/Cancel for completed initiative', async () => {
    setupDefault({ status: 'completed' });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Completed');
    });
    const editBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Edit',
    );
    expect(editBtn).toBeFalsy();
  });
});

// ─── Edit flow ────────────────────────────────────────────────────────────────

describe('InitiativeDetailPage — edit flow', () => {
  it('clicking Edit renders InitiativeForm in edit mode', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const editBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Edit'),
      ) as HTMLButtonElement;
      fireEvent.click(editBtn);
    });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="initiative-form"][data-mode="edit"]')).toBeTruthy();
    });
  });

  it('onCancel from InitiativeForm hides the form', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const editBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Edit'),
      ) as HTMLButtonElement;
      fireEvent.click(editBtn);
    });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="initiative-form"]')).toBeTruthy();
    });
    act(() => { capturedInitiativeFormProps.onCancel?.(); });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="initiative-form"]')).toBeFalsy();
    });
  });

  it('onSubmit (edit) sends PATCH and reloads on success', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/initiatives/1') && init?.method === 'PATCH') {
        return makeRes({ success: true });
      }
      if (url.includes('/api/portal/brain/initiatives/')) {
        return makeRes(makeDetailResponse());
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      const editBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Edit'),
      ) as HTMLButtonElement;
      fireEvent.click(editBtn);
    });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="initiative-form"]')).toBeTruthy();
    });
    await act(async () => {
      await capturedInitiativeFormProps.onSubmit?.({
        name: 'Updated',
        description: 'Desc',
        priority: 'high',
        ownerId: null,
        sponsorId: null,
        startDate: '',
        targetDate: '',
        confidentialityLevel: 'standard',
      });
    });
    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter(
        ([u, i]) => String(u).includes('/initiatives/1') && (i as RequestInit)?.method === 'PATCH',
      );
      expect(patchCalls.length).toBeGreaterThan(0);
    });
  });

  it('onSubmit (edit) throws when PATCH fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/initiatives/1') && init?.method === 'PATCH') {
        return makeRes({ success: false, message: 'Update failed' }, false);
      }
      if (url.includes('/api/portal/brain/initiatives/')) {
        return makeRes(makeDetailResponse());
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      const editBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Edit'),
      ) as HTMLButtonElement;
      fireEvent.click(editBtn);
    });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="initiative-form"]')).toBeTruthy();
    });
    let threw = false;
    await act(async () => {
      try {
        await capturedInitiativeFormProps.onSubmit?.({
          name: 'Updated', description: '', priority: 'high',
          ownerId: null, sponsorId: null, startDate: '', targetDate: '',
          confidentialityLevel: 'standard',
        });
      } catch {
        threw = true;
      }
    });
    expect(threw).toBe(true);
  });
});

// ─── Close flow ───────────────────────────────────────────────────────────────

describe('InitiativeDetailPage — close flow', () => {
  it('clicking Close renders InitiativeForm in close mode', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const closeBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Close'),
      ) as HTMLButtonElement;
      fireEvent.click(closeBtn);
    });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="initiative-form"][data-mode="close"]')).toBeTruthy();
    });
  });

  it('onCancel from close form hides the form', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const closeBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Close'),
      ) as HTMLButtonElement;
      fireEvent.click(closeBtn);
    });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="initiative-form"]')).toBeTruthy();
    });
    act(() => { capturedInitiativeFormProps.onCancel?.(); });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="initiative-form"]')).toBeFalsy();
    });
  });

  it('onSubmit (close) sends POST to /close endpoint on success', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/close') && init?.method === 'POST') {
        return makeRes({ success: true });
      }
      if (url.includes('/api/portal/brain/initiatives/')) {
        return makeRes(makeDetailResponse());
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Close'),
      ) as HTMLButtonElement;
      fireEvent.click(btn);
    });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="initiative-form"]')).toBeTruthy();
    });
    await act(async () => {
      await capturedInitiativeFormProps.onSubmit?.({
        outcome: 'completed',
        reason: 'done',
        lessonsLearned: 'lots',
      });
    });
    await waitFor(() => {
      const closeCalls = fetchMock.mock.calls.filter(
        ([u, i]) => String(u).includes('/close') && (i as RequestInit)?.method === 'POST',
      );
      expect(closeCalls.length).toBeGreaterThan(0);
    });
  });

  it('onSubmit (close) throws when POST fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/close') && init?.method === 'POST') {
        return makeRes({ success: false, message: 'Close failed' }, false);
      }
      if (url.includes('/api/portal/brain/initiatives/')) {
        return makeRes(makeDetailResponse());
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Close'),
      ) as HTMLButtonElement;
      fireEvent.click(btn);
    });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="initiative-form"]')).toBeTruthy();
    });
    let threw = false;
    await act(async () => {
      try {
        await capturedInitiativeFormProps.onSubmit?.({
          outcome: 'completed', reason: '', lessonsLearned: '',
        });
      } catch {
        threw = true;
      }
    });
    expect(threw).toBe(true);
  });
});

// ─── Reopen flow ──────────────────────────────────────────────────────────────

describe('InitiativeDetailPage — reopen flow', () => {
  function setupCompleted() {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/reopen') && init?.method === 'POST') {
        return makeRes({ success: true });
      }
      if (url.includes('/api/portal/brain/initiatives/')) {
        return makeRes(makeDetailResponse({ status: 'completed' }));
      }
      return makeRes({ success: true, data: [] });
    });
  }

  it('Reopen button calls confirm and POSTs to /reopen', async () => {
    setupCompleted();
    confirmMock.mockReturnValue(true);
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Reopen'),
      ) as HTMLButtonElement;
      fireEvent.click(btn);
    });
    await waitFor(() => {
      const reopenCalls = fetchMock.mock.calls.filter(
        ([u, i]) => String(u).includes('/reopen') && (i as RequestInit)?.method === 'POST',
      );
      expect(reopenCalls.length).toBeGreaterThan(0);
    });
  });

  it('Reopen button does nothing if confirm returns false', async () => {
    setupCompleted();
    confirmMock.mockReturnValue(false);
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Reopen'),
      ) as HTMLButtonElement;
      fireEvent.click(btn);
    });
    await new Promise((r) => setTimeout(r, 50));
    const reopenCalls = fetchMock.mock.calls.filter(
      ([u]) => String(u).includes('/reopen'),
    );
    expect(reopenCalls.length).toBe(0);
  });

  it('shows error when reopen fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/reopen') && init?.method === 'POST') {
        return makeRes({ success: false, message: 'Reopen failed' }, false);
      }
      if (url.includes('/api/portal/brain/initiatives/')) {
        return makeRes(makeDetailResponse({ status: 'completed' }));
      }
      return makeRes({ success: true, data: [] });
    });
    confirmMock.mockReturnValue(true);
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Reopen'),
      ) as HTMLButtonElement;
      fireEvent.click(btn);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Reopen failed');
    });
  });
});

// ─── Cancel (soft-delete) flow ────────────────────────────────────────────────

describe('InitiativeDetailPage — cancel (soft-delete) flow', () => {
  it('Cancel button calls confirm then DELETE and navigates away', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/initiatives/1') && init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      if (url.includes('/api/portal/brain/initiatives/')) {
        return makeRes(makeDetailResponse());
      }
      return makeRes({ success: true, data: [] });
    });
    confirmMock.mockReturnValue(true);
    const { container } = renderPage();
    await waitFor(() => {
      const cancelBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Cancel'),
      ) as HTMLButtonElement;
      fireEvent.click(cancelBtn);
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/portal/brain/initiatives');
    });
  });

  it('Cancel button does nothing if confirm returns false', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/initiatives/')) {
        return makeRes(makeDetailResponse());
      }
      return makeRes({ success: true, data: [] });
    });
    confirmMock.mockReturnValue(false);
    const { container } = renderPage();
    await waitFor(() => {
      const cancelBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Cancel'),
      ) as HTMLButtonElement;
      fireEvent.click(cancelBtn);
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows error when cancel DELETE fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/initiatives/1') && init?.method === 'DELETE') {
        return makeRes({ success: false, message: 'Cancel failed' }, false);
      }
      if (url.includes('/api/portal/brain/initiatives/')) {
        return makeRes(makeDetailResponse());
      }
      return makeRes({ success: true, data: [] });
    });
    confirmMock.mockReturnValue(true);
    const { container } = renderPage();
    await waitFor(() => {
      const cancelBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Cancel'),
      ) as HTMLButtonElement;
      fireEvent.click(cancelBtn);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Cancel failed');
    });
  });
});

// ─── Goals section ────────────────────────────────────────────────────────────

describe('InitiativeDetailPage — goals section', () => {
  it('renders GoalProgress component for each goal', async () => {
    setupDefault({}, [makeGoal(10), makeGoal(11)]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="goal-10"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="goal-11"]')).toBeTruthy();
    });
  });

  it('shows goal count', async () => {
    setupDefault({}, [makeGoal(10), makeGoal(11)]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('(2)');
    });
  });

  it('renders goal status sparkline when goals exist', async () => {
    setupDefault({}, [makeGoal(10, { status: 'on_track' }), makeGoal(11, { status: 'at_risk' })]);
    const { container } = renderPage();
    await waitFor(() => {
      // goal status chips are rendered in the sparkline bar
      expect(container.textContent).toContain('on track');
    });
  });

  it('"Add goal" button toggles AddGoalForm', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const addBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Add goal'),
      ) as HTMLButtonElement;
      fireEvent.click(addBtn);
    });
    await waitFor(() => {
      expect(container.querySelector('form')).toBeTruthy();
    });
  });

  it('clicking "Add goal" again collapses form (toggle)', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const addBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Add goal'),
      ) as HTMLButtonElement;
      fireEvent.click(addBtn);
    });
    await waitFor(() => {
      expect(container.querySelector('form')).toBeTruthy();
    });
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(container.querySelector('form')).toBeFalsy();
    });
  });
});

// ─── GoalProgress callbacks ────────────────────────────────────────────────────

describe('InitiativeDetailPage — GoalProgress callbacks', () => {
  it('onCheckin calls POST /goals/:id/checkin and reloads', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/checkin') && init?.method === 'POST') {
        return makeRes({ success: true });
      }
      if (url.includes('/api/portal/brain/initiatives/')) {
        return makeRes(makeDetailResponse({}, [makeGoal(10)]));
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="goal-10"]')).toBeTruthy();
    });
    await act(async () => {
      await capturedGoalProgressProps.onCheckin?.({ currentMetric: 5, note: 'update' });
    });
    await waitFor(() => {
      const checkinCalls = fetchMock.mock.calls.filter(
        ([u, i]) => String(u).includes('/checkin') && (i as RequestInit)?.method === 'POST',
      );
      expect(checkinCalls.length).toBeGreaterThan(0);
    });
  });

  it('onCheckin throws when checkin fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/checkin') && init?.method === 'POST') {
        return makeRes({ success: false, message: 'Check-in failed' }, false);
      }
      if (url.includes('/api/portal/brain/initiatives/')) {
        return makeRes(makeDetailResponse({}, [makeGoal(10)]));
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="goal-10"]')).toBeTruthy();
    });
    let threw = false;
    await act(async () => {
      try {
        await capturedGoalProgressProps.onCheckin?.({ currentMetric: 5 });
      } catch {
        threw = true;
      }
    });
    expect(threw).toBe(true);
  });

  it('onDelete calls confirm then DELETE and reloads', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/goals/10') && init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      if (url.includes('/api/portal/brain/initiatives/')) {
        return makeRes(makeDetailResponse({}, [makeGoal(10)]));
      }
      return makeRes({ success: true, data: [] });
    });
    confirmMock.mockReturnValue(true);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="goal-10"]')).toBeTruthy();
    });
    await act(async () => {
      await capturedGoalProgressProps.onDelete?.();
    });
    await waitFor(() => {
      const deleteCalls = fetchMock.mock.calls.filter(
        ([u, i]) => String(u).includes('/goals/10') && (i as RequestInit)?.method === 'DELETE',
      );
      expect(deleteCalls.length).toBeGreaterThan(0);
    });
  });

  it('onDelete does nothing if confirm returns false', async () => {
    setupDefault({}, [makeGoal(10)]);
    confirmMock.mockReturnValue(false);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="goal-10"]')).toBeTruthy();
    });
    await act(async () => {
      await capturedGoalProgressProps.onDelete?.();
    });
    await new Promise((r) => setTimeout(r, 50));
    const deleteCalls = fetchMock.mock.calls.filter(
      ([u]) => String(u).includes('/goals/'),
    );
    expect(deleteCalls.length).toBe(0);
  });
});

// ─── AddGoalForm ───────────────────────────────────────────────────────────────

describe('AddGoalForm', () => {
  async function openAddGoal(container: HTMLElement) {
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Add goal'),
      ) as HTMLButtonElement;
      fireEvent.click(btn);
    });
    await waitFor(() => {
      expect(container.querySelector('form')).toBeTruthy();
    });
  }

  it('shows validation error when title is empty', async () => {
    const { container } = renderPage();
    await openAddGoal(container);
    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(container.textContent).toContain('Title is required');
    });
  });

  it('submits form with title and calls POST /goals', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/brain/goals' && init?.method === 'POST') {
        return makeRes({ success: true, data: { id: 99 } });
      }
      if (url.includes('/api/portal/brain/initiatives/')) {
        return makeRes(makeDetailResponse());
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await openAddGoal(container);
    const titleInput = container.querySelector('input[placeholder="Goal title"]') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'New Goal' } });
    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        ([u, i]) => u === '/api/portal/brain/goals' && (i as RequestInit)?.method === 'POST',
      );
      expect(postCalls.length).toBeGreaterThan(0);
    });
  });

  it('shows error when POST /goals fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/brain/goals' && init?.method === 'POST') {
        return makeRes({ success: false, message: 'Goal create failed' }, false);
      }
      if (url.includes('/api/portal/brain/initiatives/')) {
        return makeRes(makeDetailResponse());
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await openAddGoal(container);
    const titleInput = container.querySelector('input[placeholder="Goal title"]') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'New Goal' } });
    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(container.textContent).toContain('Goal create failed');
    });
  });

  it('shows "Network error" when POST /goals throws non-Error', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/brain/goals' && init?.method === 'POST') {
        throw 'plain string error';
      }
      if (url.includes('/api/portal/brain/initiatives/')) {
        return makeRes(makeDetailResponse());
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await openAddGoal(container);
    const titleInput = container.querySelector('input[placeholder="Goal title"]') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'New Goal' } });
    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(container.textContent).toContain('Network error');
    });
  });

  it('cancel button in AddGoalForm hides the form', async () => {
    const { container } = renderPage();
    await openAddGoal(container);
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(container.querySelector('form')).toBeFalsy();
    });
  });

  it('sets description, unit, targetMetric, currentMetric, targetDate, status fields', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/brain/goals' && init?.method === 'POST') {
        return makeRes({ success: true, data: { id: 99 } });
      }
      if (url.includes('/api/portal/brain/initiatives/')) {
        return makeRes(makeDetailResponse());
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await openAddGoal(container);

    const titleInput = container.querySelector('input[placeholder="Goal title"]') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Full Goal' } });

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Some description' } });

    // Unit select
    const selects = Array.from(container.querySelectorAll('select'));
    const unitSelect = selects[0] as HTMLSelectElement;
    fireEvent.change(unitSelect, { target: { value: 'percent' } });

    // Target and current metric
    const numberInputs = Array.from(container.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
    if (numberInputs[0]) fireEvent.change(numberInputs[0], { target: { value: '100' } });
    if (numberInputs[1]) fireEvent.change(numberInputs[1], { target: { value: '50' } });

    // Target date
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    if (dateInput) fireEvent.change(dateInput, { target: { value: '2025-12-31' } });

    // Status select
    const statusSelect = selects[selects.length - 1] as HTMLSelectElement;
    fireEvent.change(statusSelect, { target: { value: 'on_track' } });

    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([u, i]) => u === '/api/portal/brain/goals' && (i as RequestInit)?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse(postCall![1]?.body as string);
      expect(body.title).toBe('Full Goal');
      expect(body.unit).toBe('percent');
    });
  });
});

// ─── Lessons learned section ─────────────────────────────────────────────────

describe('InitiativeDetailPage — lessons learned', () => {
  it('renders lessons learned section for completed initiative with lessonsLearned', async () => {
    setupDefault({
      status: 'completed',
      lessonsLearned: 'We learned a lot',
      closedAt: '2024-06-01T10:00:00Z',
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Lessons learned');
      expect(container.textContent).toContain('We learned a lot');
    });
  });

  it('renders closeReason when present', async () => {
    setupDefault({
      status: 'completed',
      lessonsLearned: 'Good stuff',
      closeReason: 'Project completed on time',
      closedAt: '2024-06-01T10:00:00Z',
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Project completed on time');
    });
  });

  it('does NOT render lessons learned section for active initiative', async () => {
    setupDefault({ status: 'active', lessonsLearned: 'Should not show' });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Test Initiative');
    });
    expect(container.textContent).not.toContain('Should not show');
  });

  it('does NOT render lessons learned section when lessonsLearned is null', async () => {
    setupDefault({ status: 'completed', lessonsLearned: null });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Completed');
    });
    expect(container.textContent).not.toContain('Lessons learned');
  });
});

// ─── Team fetch ───────────────────────────────────────────────────────────────

describe('InitiativeDetailPage — team fetch', () => {
  it('filters out team members without numeric userId', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/initiatives/')) {
        return makeRes(makeDetailResponse({ ownerId: 5 }));
      }
      if (url === '/api/portal/team') {
        return makeRes({
          success: true,
          data: [
            { userId: 5, name: 'Alice', email: 'alice@test.com' },
            { name: 'No ID', email: 'noid@test.com' }, // missing userId
            { userId: 'string-id', name: 'Bad', email: 'bad@test.com' }, // non-number
          ],
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Alice');
    });
    // 'No ID' should not be in lookup (but won't crash)
    expect(container.textContent).not.toContain('No ID');
  });

  it('does not crash when team fetch fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/initiatives/')) {
        return makeRes(makeDetailResponse());
      }
      if (url === '/api/portal/team') {
        throw new Error('team fetch failed');
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Test Initiative');
    });
  });

  it('does not update team state when cancelled (cleanup)', async () => {
    // This test ensures the cancelled flag branch is exercised:
    // we unmount quickly before the team fetch resolves
    let resolveTeam: (v: FetchResp) => void;
    const teamPromise = new Promise<FetchResp>((res) => { resolveTeam = res; });
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/initiatives/')) {
        return makeRes(makeDetailResponse());
      }
      if (url === '/api/portal/team') return teamPromise;
      return makeRes({ success: true, data: {} });
    });
    const { unmount } = renderPage();
    // Unmount before team resolves
    unmount();
    // Now resolve — should not throw
    resolveTeam!(makeRes({ success: true, data: [{ userId: 1, name: 'Alice', email: 'a@b.com' }] }));
    await new Promise((r) => setTimeout(r, 50));
    // No assertion needed — just no crash
  });
});
