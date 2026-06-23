// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for `app/portal/brain/initiatives/[id]/page.tsx`
 *
 * 'use client' page — rendered directly with @testing-library/react.
 * params is Promise<{ id: string }>; React.use() is mocked below.
 *
 * Covers:
 *  - Loading state (spinner)
 *  - Error state (failed fetch, network throw, invalid id)
 *  - Populated state: header fields (name, status, priority, owner, dates)
 *  - Action buttons: Edit, Close, Cancel, Reopen (terminal)
 *  - Description truncation (show more / show less)
 *  - Edit form inline panel (shows/hides)
 *  - Close form inline panel (shows/hides)
 *  - Goals section: empty state, goals rendered, status sparkline
 *  - AddGoalForm: open/close, validation, submit, submit error
 *  - Lessons learned section (terminal only)
 *  - onReopen: confirm → PATCH reopen endpoint
 *  - onCancel: confirm → DELETE → navigate to list
 *  - onCancel: no-confirm → no request sent
 *  - onReopen: confirm=false → no request sent
 *  - Owner display: name / email / User#N fallback / no owner
 *  - Overdue target date styling
 *  - isTerminal flag: hides Edit/Close/Cancel; shows Reopen
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ──────────────────────────────────────

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// Heavy sub-panels — stub to data-testid divs.
vi.mock('@/components/brain/InitiativeForm', () => ({
  default: ({ onCancel, onSubmit, mode }: any) =>
    React.createElement(
      'div',
      { 'data-testid': `initiative-form-${mode ?? 'edit'}` },
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': `form-cancel-${mode ?? 'edit'}`,
          onClick: onCancel,
        },
        'Cancel form',
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': `form-submit-${mode ?? 'edit'}`,
          onClick: () =>
            onSubmit({
              name: 'Updated name',
              description: 'Updated',
              priority: 'high',
              ownerId: null,
              sponsorId: null,
              startDate: '',
              targetDate: '',
              confidentialityLevel: 'standard',
              // close-mode values
              outcome: 'completed',
              reason: '',
              lessonsLearned: '',
            }),
        },
        'Submit form',
      ),
    ),
}));

vi.mock('@/components/brain/GoalProgress', () => ({
  default: ({ goal }: any) =>
    React.createElement(
      'div',
      { 'data-testid': `goal-progress-${goal.id}` },
      goal.title,
    ),
}));

vi.mock('@/components/brain/InitiativeLinksPanel', () => ({
  default: ({ initiativeId }: any) =>
    React.createElement('div', {
      'data-testid': 'initiative-links-panel',
      'data-initiative': initiativeId,
    }),
}));

// React.use — intercept so we can return a synchronously-known value.
const USE_VALUE = Symbol('use-value');
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    use: (p: any) => {
      if (p && USE_VALUE in p) return p[USE_VALUE];
      return (actual as any).use(p);
    },
  };
});

// ─── Fetch mock helpers ────────────────────────────────────────────────────

type FetchResp = { ok: boolean; status?: number; json: () => Promise<any> };
const fetchMock = vi.fn<(url: string, init?: any) => Promise<FetchResp>>();

function makeRes(body: any, ok = true, status = 200): FetchResp {
  return { ok, status, json: async () => body };
}

// ─── Sample data factories ─────────────────────────────────────────────────

function makeInitiative(extra: Record<string, any> = {}): any {
  return {
    id: 7,
    clientId: 1,
    name: 'Launch Product Alpha',
    slug: 'launch-product-alpha',
    description: null,
    status: 'active',
    priority: 'high',
    ownerId: null,
    sponsorId: null,
    startDate: null,
    targetDate: null,
    closedAt: null,
    closeReason: null,
    lessonsLearned: null,
    confidentialityLevel: 'standard',
    createdBy: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...extra,
  };
}

function makeGoal(extra: Record<string, any> = {}): any {
  return {
    id: 1,
    clientId: 1,
    initiativeId: 7,
    title: 'Ship MVP',
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
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...extra,
  };
}

function makeDetailData(extra: Record<string, any> = {}): any {
  return {
    initiative: makeInitiative(),
    goals: [],
    links: { byType: {}, items: [] },
    ...extra,
  };
}

// ─── Setup / teardown ──────────────────────────────────────────────────────

beforeEach(() => {
  pushMock.mockReset();
  fetchMock.mockReset();

  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/api/portal/brain/initiatives/7')) {
      return makeRes({ success: true, data: makeDetailData() });
    }
    if (url.includes('/api/portal/team')) {
      return makeRes({ success: true, data: [] });
    }
    return makeRes({ success: true, data: {} });
  });

  vi.stubGlobal('fetch', fetchMock as any);
  vi.stubGlobal('alert', vi.fn());
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Import after mocks ────────────────────────────────────────────────────

import InitiativeDetailPage from '@/app/portal/brain/initiatives/[id]/page';

function makeParams(id = '7') {
  const p = Promise.resolve({ id }) as any;
  p[USE_VALUE] = { id };
  return p;
}

function renderPage(id = '7') {
  return render(<InitiativeDetailPage params={makeParams(id)} />);
}

// ─── Loading state ─────────────────────────────────────────────────────────

describe('InitiativeDetailPage — loading', () => {
  it('shows loading spinner while data is fetching', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.textContent).toContain('Loading');
  });
});

// ─── Error state ───────────────────────────────────────────────────────────

describe('InitiativeDetailPage — error state', () => {
  it('shows error banner when fetch returns !ok', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({ success: false, message: 'Not found' }, false, 404);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Not found');
    });
  });

  it('shows fallback error message when json has no message', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({ success: false }, false);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Failed to load initiative');
    });
  });

  it('shows network error when fetch throws', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      throw new Error('Connection refused');
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Connection refused');
    });
  });

  it('renders "Initiatives" back link in error state', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({ success: false, message: 'oops' }, false);
    });
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/initiatives"]');
      expect(link).toBeTruthy();
    });
  });

  it('shows "Invalid initiative id" for non-numeric id', async () => {
    const { container } = renderPage('notanid');
    await waitFor(() => {
      expect(container.textContent).toContain('Invalid initiative id');
    });
  });
});

// ─── Header — loaded state ─────────────────────────────────────────────────

describe('InitiativeDetailPage — header (active initiative)', () => {
  it('renders initiative name', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Launch Product Alpha');
    });
  });

  it('renders status chip "Active"', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Active');
    });
  });

  it('renders priority chip "High"', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('High');
    });
  });

  it('renders breadcrumb Initiatives link', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/initiatives"]');
      expect(link).toBeTruthy();
    });
  });

  it('shows startDate when present', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({
        success: true,
        data: makeDetailData({
          initiative: makeInitiative({ startDate: '2025-03-01' }),
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('started');
    });
  });

  it('shows targetDate when present', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({
        success: true,
        data: makeDetailData({
          initiative: makeInitiative({ targetDate: '2027-12-31' }),
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('target');
    });
  });

  it('shows overdue badge when target date is past and not terminal', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({
        success: true,
        data: makeDetailData({
          initiative: makeInitiative({ targetDate: '2020-01-01', status: 'active' }),
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('overdue');
    });
  });

  it('shows days remaining when target is in the future', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({
        success: true,
        data: makeDetailData({
          initiative: makeInitiative({ targetDate: '2099-01-01', status: 'active' }),
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('left');
    });
  });

  it('shows closedAt relative time when present', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({
        success: true,
        data: makeDetailData({
          initiative: makeInitiative({
            status: 'completed',
            closedAt: '2025-01-01T00:00:00Z',
          }),
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('closed');
    });
  });
});

// ─── Owner display ────────────────────────────────────────────────────────

describe('InitiativeDetailPage — owner display', () => {
  it('shows owner name when team has matching userId', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) {
        return makeRes({
          success: true,
          data: [{ userId: 5, name: 'Jane Doe', email: 'jane@example.com' }],
        });
      }
      return makeRes({
        success: true,
        data: makeDetailData({ initiative: makeInitiative({ ownerId: 5 }) }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Jane Doe');
    });
  });

  it('shows email fallback when name is null', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) {
        return makeRes({
          success: true,
          data: [{ userId: 5, name: null, email: 'jane@example.com' }],
        });
      }
      return makeRes({
        success: true,
        data: makeDetailData({ initiative: makeInitiative({ ownerId: 5 }) }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('jane@example.com');
    });
  });

  it('shows "User #N" when userId not found in team', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({
        success: true,
        data: makeDetailData({ initiative: makeInitiative({ ownerId: 99 }) }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('User #99');
    });
  });

  it('does not show owner chip when ownerId is null', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Launch Product Alpha'));
    expect(container.textContent).not.toContain('User #');
  });
});

// ─── Action buttons — non-terminal ────────────────────────────────────────

describe('InitiativeDetailPage — action buttons (non-terminal)', () => {
  it('shows Edit button', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Edit'),
      );
      expect(btn).toBeTruthy();
    });
  });

  it('shows Close button', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Close'),
      );
      expect(btn).toBeTruthy();
    });
  });

  it('shows Cancel button', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Cancel'),
      );
      expect(btn).toBeTruthy();
    });
  });

  it('does NOT show Reopen button when non-terminal', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Launch Product Alpha'));
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Reopen',
    );
    expect(btn).toBeUndefined();
  });
});

// ─── Action buttons — terminal ────────────────────────────────────────────

describe('InitiativeDetailPage — action buttons (terminal)', () => {
  function setupTerminal(status: 'completed' | 'cancelled') {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({
        success: true,
        data: makeDetailData({ initiative: makeInitiative({ status }) }),
      });
    });
  }

  it('shows Reopen button when completed', async () => {
    setupTerminal('completed');
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Reopen'),
      );
      expect(btn).toBeTruthy();
    });
  });

  it('shows Reopen button when cancelled', async () => {
    setupTerminal('cancelled');
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Reopen'),
      );
      expect(btn).toBeTruthy();
    });
  });

  it('hides Edit button when terminal', async () => {
    setupTerminal('completed');
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Launch Product Alpha'));
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Edit',
    );
    expect(btn).toBeUndefined();
  });

  it('hides Close button when terminal', async () => {
    setupTerminal('completed');
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Launch Product Alpha'));
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Close',
    );
    expect(btn).toBeUndefined();
  });
});

// ─── Edit form panel ──────────────────────────────────────────────────────

describe('InitiativeDetailPage — edit panel', () => {
  it('shows edit form when Edit is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Launch Product Alpha'));
    const editBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Edit'),
    ) as HTMLButtonElement;
    fireEvent.click(editBtn);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="initiative-form-edit"]')).toBeTruthy();
    });
  });

  it('hides edit form when Cancel form is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Launch Product Alpha'));
    const editBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Edit'),
    ) as HTMLButtonElement;
    fireEvent.click(editBtn);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="initiative-form-edit"]')).toBeTruthy();
    });
    const cancelFormBtn = container.querySelector('[data-testid="form-cancel-edit"]') as HTMLButtonElement;
    fireEvent.click(cancelFormBtn);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="initiative-form-edit"]')).toBeNull();
    });
  });

  it('calls PATCH endpoint when edit form is submitted', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (init?.method === 'PATCH') return makeRes({ success: true, data: makeDetailData() });
      return makeRes({ success: true, data: makeDetailData() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Launch Product Alpha'));
    const editBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Edit'),
    ) as HTMLButtonElement;
    fireEvent.click(editBtn);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="form-submit-edit"]')).toBeTruthy();
    });
    const submitBtn = container.querySelector('[data-testid="form-submit-edit"]') as HTMLButtonElement;
    await act(async () => { fireEvent.click(submitBtn); });
    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter((c) => (c[1] as any)?.method === 'PATCH');
      expect(patchCalls.length).toBeGreaterThan(0);
    });
  });
});

// ─── Close form panel ─────────────────────────────────────────────────────

describe('InitiativeDetailPage — close panel', () => {
  it('shows close form when Close is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Launch Product Alpha'));
    const closeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Close'),
    ) as HTMLButtonElement;
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="initiative-form-close"]')).toBeTruthy();
    });
  });

  it('hides close form when Cancel form is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Launch Product Alpha'));
    const closeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Close'),
    ) as HTMLButtonElement;
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="initiative-form-close"]')).toBeTruthy();
    });
    const cancelFormBtn = container.querySelector('[data-testid="form-cancel-close"]') as HTMLButtonElement;
    fireEvent.click(cancelFormBtn);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="initiative-form-close"]')).toBeNull();
    });
  });

  it('calls POST /close endpoint when close form is submitted', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/close') && init?.method === 'POST') return makeRes({ success: true, data: makeDetailData() });
      return makeRes({ success: true, data: makeDetailData() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Launch Product Alpha'));
    const closeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Close'),
    ) as HTMLButtonElement;
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="form-submit-close"]')).toBeTruthy();
    });
    const submitBtn = container.querySelector('[data-testid="form-submit-close"]') as HTMLButtonElement;
    await act(async () => { fireEvent.click(submitBtn); });
    await waitFor(() => {
      const closeCalls = fetchMock.mock.calls.filter(
        (c) => String(c[0]).includes('/close') && (c[1] as any)?.method === 'POST',
      );
      expect(closeCalls.length).toBeGreaterThan(0);
    });
  });
});

// ─── onReopen ─────────────────────────────────────────────────────────────

describe('InitiativeDetailPage — onReopen', () => {
  function setupTerminalCompleted() {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/reopen') && init?.method === 'POST') return makeRes({ success: true });
      return makeRes({
        success: true,
        data: makeDetailData({ initiative: makeInitiative({ status: 'completed' }) }),
      });
    });
  }

  it('calls POST /reopen when confirmed', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    setupTerminalCompleted();
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Reopen'),
      );
      expect(btn).toBeTruthy();
    });
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Reopen'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('/reopen'))).toBe(true);
    });
  });

  it('does NOT call reopen when confirm returns false', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    setupTerminalCompleted();
    const { container } = renderPage();
    await waitFor(() => {
      expect(Array.from(container.querySelectorAll('button')).some(
        (b) => b.textContent?.includes('Reopen'),
      )).toBe(true);
    });
    const beforeCalls = fetchMock.mock.calls.length;
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Reopen'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await new Promise((r) => setTimeout(r, 50));
    const reopenCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/reopen'));
    expect(reopenCalls.length).toBe(0);
    expect(fetchMock.mock.calls.length).toBe(beforeCalls);
  });

  it('shows error banner when reopen fails', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/reopen') && init?.method === 'POST') {
        return makeRes({ success: false, message: 'Cannot reopen' }, false);
      }
      return makeRes({
        success: true,
        data: makeDetailData({ initiative: makeInitiative({ status: 'completed' }) }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(Array.from(container.querySelectorAll('button')).some(
        (b) => b.textContent?.includes('Reopen'),
      )).toBe(true);
    });
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Reopen'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      expect(container.textContent).toContain('Cannot reopen');
    });
  });
});

// ─── onCancel ─────────────────────────────────────────────────────────────

describe('InitiativeDetailPage — onCancel', () => {
  it('calls DELETE and navigates to list when confirmed', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (init?.method === 'DELETE') return makeRes({ success: true });
      return makeRes({ success: true, data: makeDetailData() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Launch Product Alpha'));
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Cancel'),
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/portal/brain/initiatives');
    });
  });

  it('does NOT call DELETE when confirm returns false', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (init?.method === 'DELETE') return makeRes({ success: true });
      return makeRes({ success: true, data: makeDetailData() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Launch Product Alpha'));
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Cancel'),
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await new Promise((r) => setTimeout(r, 50));
    const deleteCalls = fetchMock.mock.calls.filter((c) => (c[1] as any)?.method === 'DELETE');
    expect(deleteCalls.length).toBe(0);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('shows error banner when cancel/delete fails', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (init?.method === 'DELETE') return makeRes({ success: false, message: 'Cannot cancel' }, false);
      return makeRes({ success: true, data: makeDetailData() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Launch Product Alpha'));
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Cancel'),
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Cannot cancel');
    });
  });
});

// ─── Description ──────────────────────────────────────────────────────────

describe('InitiativeDetailPage — description', () => {
  it('shows full short description directly', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({
        success: true,
        data: makeDetailData({
          initiative: makeInitiative({ description: 'Short description here' }),
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Short description here');
    });
  });

  it('truncates long description and shows "show more" button', async () => {
    const longDesc = 'A'.repeat(300);
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({
        success: true,
        data: makeDetailData({ initiative: makeInitiative({ description: longDesc }) }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('show more'),
      );
      expect(btn).toBeTruthy();
    });
  });

  it('"show more" expands full description and shows "show less"', async () => {
    const longDesc = 'B'.repeat(300);
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({
        success: true,
        data: makeDetailData({ initiative: makeInitiative({ description: longDesc }) }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('show more'),
      );
      expect(btn).toBeTruthy();
    });
    const showMoreBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('show more'),
    ) as HTMLButtonElement;
    fireEvent.click(showMoreBtn);
    await waitFor(() => {
      const showLessBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('show less'),
      );
      expect(showLessBtn).toBeTruthy();
      expect(container.textContent).toContain(longDesc);
    });
  });

  it('"show less" re-truncates description', async () => {
    const longDesc = 'C'.repeat(300);
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({
        success: true,
        data: makeDetailData({ initiative: makeInitiative({ description: longDesc }) }),
      });
    });
    const { container } = renderPage();
    // expand first
    await waitFor(() => {
      expect(Array.from(container.querySelectorAll('button')).some(
        (b) => b.textContent?.includes('show more'),
      )).toBe(true);
    });
    const showMoreBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('show more'),
    ) as HTMLButtonElement;
    fireEvent.click(showMoreBtn);
    await waitFor(() => {
      expect(Array.from(container.querySelectorAll('button')).some(
        (b) => b.textContent?.includes('show less'),
      )).toBe(true);
    });
    const showLessBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('show less'),
    ) as HTMLButtonElement;
    fireEvent.click(showLessBtn);
    await waitFor(() => {
      expect(Array.from(container.querySelectorAll('button')).some(
        (b) => b.textContent?.includes('show more'),
      )).toBe(true);
    });
  });
});

// ─── Goals section ────────────────────────────────────────────────────────

describe('InitiativeDetailPage — goals section', () => {
  it('shows "No goals yet" empty state when goals array is empty', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No goals yet');
    });
  });

  it('renders GoalProgress for each goal', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({
        success: true,
        data: makeDetailData({
          goals: [makeGoal({ id: 1, title: 'First Goal' }), makeGoal({ id: 2, title: 'Second Goal' })],
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="goal-progress-1"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="goal-progress-2"]')).toBeTruthy();
    });
  });

  it('shows goals count in section header', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({
        success: true,
        data: makeDetailData({ goals: [makeGoal({ id: 1 }), makeGoal({ id: 2 })] }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('(2)');
    });
  });

  it('renders status sparkline chips when goals have statuses', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({
        success: true,
        data: makeDetailData({
          goals: [makeGoal({ id: 1, status: 'on_track' }), makeGoal({ id: 2, status: 'at_risk' })],
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('on track');
      expect(container.textContent).toContain('at risk');
    });
  });

  it('shows AddGoalForm when "Add goal" button is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('No goals yet'));
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add goal'),
    ) as HTMLButtonElement;
    fireEvent.click(addBtn);
    await waitFor(() => {
      // The add form renders an input for the goal title
      const input = container.querySelector('input[placeholder="Goal title"]');
      expect(input).toBeTruthy();
    });
  });

  it('closes AddGoalForm when Cancel is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('No goals yet'));
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add goal'),
    ) as HTMLButtonElement;
    fireEvent.click(addBtn);
    await waitFor(() => {
      expect(container.querySelector('input[placeholder="Goal title"]')).toBeTruthy();
    });
    // The AddGoalForm has its own Cancel button
    const cancelBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim() === 'Cancel',
    );
    fireEvent.click(cancelBtns[cancelBtns.length - 1]);
    await waitFor(() => {
      expect(container.querySelector('input[placeholder="Goal title"]')).toBeNull();
    });
  });
});

// ─── AddGoalForm ──────────────────────────────────────────────────────────

describe('InitiativeDetailPage — AddGoalForm', () => {
  async function openAddGoalForm(container: HTMLElement) {
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add goal'),
    ) as HTMLButtonElement;
    fireEvent.click(addBtn);
    await waitFor(() => {
      expect(container.querySelector('input[placeholder="Goal title"]')).toBeTruthy();
    });
  }

  it('shows validation error when submitted with empty title', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('No goals yet'));
    await openAddGoalForm(container);
    // submit the form directly (title is blank)
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => { fireEvent.submit(form); });
    await waitFor(() => {
      expect(container.textContent).toContain('Title is required');
    });
  });

  it('calls POST /goals and closes form on success', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/api/portal/brain/goals') && init?.method === 'POST') {
        return makeRes({ success: true, data: makeGoal({ id: 10 }) });
      }
      return makeRes({ success: true, data: makeDetailData() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('No goals yet'));
    await openAddGoalForm(container);
    const titleInput = container.querySelector('input[placeholder="Goal title"]') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'New Goal' } });
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => { fireEvent.submit(form); });
    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        (c) => String(c[0]).includes('/api/portal/brain/goals') && (c[1] as any)?.method === 'POST',
      );
      expect(postCalls.length).toBeGreaterThan(0);
    });
  });

  it('shows error message on goal creation failure', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      if (url.includes('/api/portal/brain/goals') && init?.method === 'POST') {
        return makeRes({ success: false, message: 'Goal creation failed' }, false);
      }
      return makeRes({ success: true, data: makeDetailData() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('No goals yet'));
    await openAddGoalForm(container);
    const titleInput = container.querySelector('input[placeholder="Goal title"]') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Bad Goal' } });
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => { fireEvent.submit(form); });
    await waitFor(() => {
      expect(container.textContent).toContain('Goal creation failed');
    });
  });
});

// ─── Lessons learned ─────────────────────────────────────────────────────

describe('InitiativeDetailPage — lessons learned', () => {
  it('shows lessons learned section when initiative is terminal and has lessons', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({
        success: true,
        data: makeDetailData({
          initiative: makeInitiative({
            status: 'completed',
            lessonsLearned: 'We should have started earlier.',
            closeReason: 'All goals met',
          }),
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Lessons learned');
      expect(container.textContent).toContain('We should have started earlier.');
      expect(container.textContent).toContain('All goals met');
    });
  });

  it('does NOT show lessons learned section when non-terminal', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Launch Product Alpha'));
    expect(container.textContent).not.toContain('Lessons learned');
  });

  it('does NOT show lessons learned section when terminal but no lessons', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({
        success: true,
        data: makeDetailData({
          initiative: makeInitiative({ status: 'completed', lessonsLearned: null }),
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Launch Product Alpha'));
    expect(container.textContent).not.toContain('Lessons learned');
  });
});

// ─── LinkedEntities panel ────────────────────────────────────────────────

describe('InitiativeDetailPage — linked entities panel', () => {
  it('renders InitiativeLinksPanel with correct initiativeId', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const panel = container.querySelector('[data-testid="initiative-links-panel"]');
      expect(panel).toBeTruthy();
      expect(panel?.getAttribute('data-initiative')).toBe('7');
    });
  });
});

// ─── Priority chip variants ───────────────────────────────────────────────

describe('InitiativeDetailPage — priority chip variants', () => {
  const priorities = ['low', 'medium', 'critical'] as const;

  priorities.forEach((priority) => {
    it(`shows "${priority}" priority chip label`, async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
        return makeRes({
          success: true,
          data: makeDetailData({ initiative: makeInitiative({ priority }) }),
        });
      });
      const { container } = renderPage();
      const label = priority.charAt(0).toUpperCase() + priority.slice(1);
      await waitFor(() => {
        expect(container.textContent).toContain(label);
      });
    });
  });
});
