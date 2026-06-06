// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/brain/playbooks/[id]/page.tsx`
 *
 * Covers:
 *   - Loading spinner state
 *   - Error state (fetch failure, server error, network throw, invalid id)
 *   - Successful render: playbook name, status chip, trigger chip, category,
 *     slug, steps count, description, owner display, default topics
 *   - Trigger sections: manual, event, scheduled (with + without cron/event)
 *   - Action buttons: Edit link, Activate (draft), Start a run (active),
 *     Archive (active), Delete (always)
 *   - Activate: success (reloads), DAG error (inline), failure
 *   - Archive: confirm accepted + cancelled
 *   - Delete: confirm accepted + cancelled, success navigates
 *   - Active runs count: 0 and N display
 *   - StartRunDialog: open/close, validation, submit success/failure,
 *     label required guard, add/remove links, cancel
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── next/navigation mock ────────────────────────────────────────────────────

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// ─── next/link stub ──────────────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => React.createElement('a', { href, ...rest }, children),
}));

// ─── React.use stub — mirrors pattern from playbook-edit-page tests ───────────
// React.use(params) where params is Promise<{ id: string }>.
// We attach _testId to the promise so our stub can read it synchronously.

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    use: (p: Promise<{ id: string }> | unknown) => {
      if (p && typeof (p as { _testId?: string })._testId === 'string') {
        return { id: (p as { _testId: string })._testId };
      }
      // fallback: throw (suspense semantics) — should not be hit in these tests
      throw p;
    },
  };
});

// ─── heavy child stubs (named Uppercase functions, per house rule) ────────────

vi.mock('@/components/brain/PlaybookStepGraph', () => ({
  default: function PlaybookStepGraph({ steps }: { steps: unknown[] }) {
    if (!steps || steps.length === 0) {
      return React.createElement(
        'div',
        { 'data-testid': 'step-graph-empty' },
        'No steps yet.',
      );
    }
    return React.createElement(
      'div',
      { 'data-testid': 'step-graph' },
      `step-graph-count:${steps.length}`,
    );
  },
}));

vi.mock('@/components/brain/PlaybookContextEditor', () => ({
  default: function PlaybookContextEditor({
    onChange,
  }: {
    value: Record<string, unknown>;
    onChange: (v: Record<string, unknown>) => void;
    disabled?: boolean;
  }) {
    return React.createElement(
      'div',
      {
        'data-testid': 'context-editor',
        onClick: () => onChange({ key: 'val' }),
      },
      'ContextEditor',
    );
  },
}));

// ─── Fetch helpers ───────────────────────────────────────────────────────────

type FetchResp = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

function makeRes(
  body: unknown,
  opts: { ok?: boolean; status?: number } = {},
): FetchResp {
  const ok = opts.ok ?? true;
  return {
    ok,
    status: opts.status ?? (ok ? 200 : 500),
    json: async () => body,
  };
}

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makePlaybook(
  extra: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 7,
    clientId: 1,
    name: 'Onboarding Flow',
    slug: 'onboarding-flow',
    description: 'A description of the playbook.',
    status: 'draft',
    triggerKind: 'manual',
    triggerConfig: null,
    category: 'HR',
    ownerId: null,
    defaultTopicIds: [],
    source: 'manual',
    createdBy: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-02T00:00:00Z',
    ...extra,
  };
}

function makeStep(extra: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 1,
    clientId: 1,
    playbookId: 7,
    key: 'step-1',
    name: 'Create task',
    description: null,
    kind: 'task',
    config: {},
    condition: null,
    nextStepKeys: [],
    sortOrder: 0,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...extra,
  };
}

function makeDetailResp(
  playbookExtra: Partial<Record<string, unknown>> = {},
  steps: unknown[] = [],
) {
  return {
    success: true,
    data: {
      playbook: makePlaybook(playbookExtra),
      steps,
    },
  };
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();

  // Default: playbook detail succeeds, team + runs return empty
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('activate') && !url.includes('archive') && !url.includes('start')) {
      return makeRes(makeDetailResp());
    }
    if (url.includes('/api/portal/team')) {
      return makeRes({ success: true, data: [] });
    }
    if (url.includes('/api/portal/brain/playbook-runs')) {
      return makeRes({ success: true, data: { items: [] } });
    }
    return makeRes({ success: true, data: {} });
  });

  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Import after mocks ──────────────────────────────────────────────────────

import PlaybookDetailPage from '@/app/portal/brain/playbooks/[id]/page';

// Helper — simulate React.use(params).
// Our React.use stub reads _testId from the promise object synchronously.
function renderWithId(id: string = '7') {
  const params = Object.assign(Promise.resolve({ id }), { _testId: id });
  return render(<PlaybookDetailPage params={params} />);
}

// ─── Loading ─────────────────────────────────────────────────────────────────

describe('PlaybookDetailPage — loading', () => {
  it('renders the loading spinner initially', () => {
    // Slow fetch so loading persists during first paint
    fetchMock.mockImplementation(
      () => new Promise<FetchResp>(() => { /* never resolves */ }),
    );
    const { container } = renderWithId();
    expect(container.textContent).toContain('Loading');
  });
});

// ─── Error states ─────────────────────────────────────────────────────────────

describe('PlaybookDetailPage — error states', () => {
  it('shows error banner when server returns failure', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks/7')) {
        return makeRes({ success: false, message: 'Not found' }, { ok: false, status: 404 });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderWithId();
    await waitFor(() => {
      expect(container.textContent).toContain('Not found');
    });
  });

  it('shows error banner on network throw', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs') && !url.includes('team')) {
        throw new Error('network down');
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderWithId();
    await waitFor(() => {
      expect(container.textContent).toContain('network down');
    });
  });

  it('shows "Invalid playbook id" for a non-numeric id', async () => {
    const { container } = renderWithId('abc');
    await waitFor(() => {
      expect(container.textContent).toContain('Invalid playbook id');
    });
  });

  it('shows back link to /portal/brain/playbooks in error view', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks/7')) {
        return makeRes({ success: false, message: 'fail' }, { ok: false });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderWithId();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/playbooks"]');
      expect(link).toBeTruthy();
    });
  });

  it('shows fallback message when server ok=false with no message', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs')) {
        return makeRes({ success: false }, { ok: false });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderWithId();
    await waitFor(() => {
      expect(container.textContent).toContain('Failed to load playbook');
    });
  });
});

// ─── Successful render ────────────────────────────────────────────────────────

describe('PlaybookDetailPage — successful render', () => {
  it('renders the playbook name in h1', async () => {
    const { container } = renderWithId();
    await waitFor(() => {
      const h1 = container.querySelector('h1');
      expect(h1?.textContent).toContain('Onboarding Flow');
    });
  });

  it('renders the status chip (Draft)', async () => {
    const { container } = renderWithId();
    await waitFor(() => {
      expect(container.textContent).toContain('Draft');
    });
  });

  it('renders the trigger chip (Manual)', async () => {
    const { container } = renderWithId();
    await waitFor(() => {
      expect(container.textContent).toContain('Manual');
    });
  });

  it('renders the category chip', async () => {
    const { container } = renderWithId();
    await waitFor(() => {
      expect(container.textContent).toContain('HR');
    });
  });

  it('renders the slug in monospace', async () => {
    const { container } = renderWithId();
    await waitFor(() => {
      expect(container.textContent).toContain('onboarding-flow');
    });
  });

  it('renders the description text', async () => {
    const { container } = renderWithId();
    await waitFor(() => {
      expect(container.textContent).toContain('A description of the playbook.');
    });
  });

  it('renders the step count (0 steps)', async () => {
    const { container } = renderWithId();
    await waitFor(() => {
      expect(container.textContent).toContain('0 steps');
    });
  });

  it('renders step count as singular "1 step" (no trailing s)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs') && !url.includes('team')) {
        return makeRes(makeDetailResp({}, [makeStep()]));
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderWithId();
    await waitFor(() => {
      const txt = container.textContent ?? '';
      // The header renders "1 step" (singular); the icon text is adjacent
      // in textContent so we search for the substring directly.
      expect(txt).toContain('1 step');
      // The stub used a unique marker so we can confirm it rendered
      expect(txt).toContain('step-graph-count:1');
      // Ensure the page does NOT show "1 steps" (plural) anywhere
      // outside of the step-graph stub marker
      const withoutMarker = txt.replace('step-graph-count:1', '');
      expect(withoutMarker).not.toContain('1 steps');
    });
  });

  it('renders back link to /portal/brain/playbooks', async () => {
    const { container } = renderWithId();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/playbooks"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders Edit link pointing to edit route', async () => {
    const { container } = renderWithId();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/playbooks/7/edit"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders View all runs link', async () => {
    const { container } = renderWithId();
    await waitFor(() => {
      const link = container.querySelector(
        'a[href="/portal/brain/playbook-runs?playbookId=7"]',
      );
      expect(link).toBeTruthy();
    });
  });

  it('renders owner by name when team member matches ownerId', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs') && !url.includes('team')) {
        return makeRes(makeDetailResp({ ownerId: 42 }));
      }
      if (url.includes('/api/portal/team')) {
        return makeRes({
          success: true,
          data: [{ userId: 42, name: 'Alice Smith', email: 'alice@example.com' }],
        });
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const { container } = renderWithId();
    await waitFor(() => {
      expect(container.textContent).toContain('Alice Smith');
    });
  });

  it('renders owner by email when name is null', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs') && !url.includes('team')) {
        return makeRes(makeDetailResp({ ownerId: 43 }));
      }
      if (url.includes('/api/portal/team')) {
        return makeRes({
          success: true,
          data: [{ userId: 43, name: null, email: 'bob@example.com' }],
        });
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const { container } = renderWithId();
    await waitFor(() => {
      expect(container.textContent).toContain('bob@example.com');
    });
  });

  it('renders "User #N" fallback when ownerId is set but not in team list', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs') && !url.includes('team')) {
        return makeRes(makeDetailResp({ ownerId: 99 }));
      }
      if (url.includes('/api/portal/team')) {
        return makeRes({ success: true, data: [] });
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const { container } = renderWithId();
    await waitFor(() => {
      expect(container.textContent).toContain('User #99');
    });
  });

  it('renders default topic chips', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs') && !url.includes('team')) {
        return makeRes(makeDetailResp({ defaultTopicIds: [10, 20] }));
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderWithId();
    await waitFor(() => {
      expect(container.textContent).toContain('Topic #10');
      expect(container.textContent).toContain('Topic #20');
    });
  });

  it('renders the step graph component', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs') && !url.includes('team')) {
        return makeRes(makeDetailResp({}, [makeStep()]));
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderWithId();
    await waitFor(() => {
      const graph = container.querySelector('[data-testid="step-graph"]');
      expect(graph).toBeTruthy();
    });
  });
});

// ─── Trigger section ──────────────────────────────────────────────────────────

describe('PlaybookDetailPage — trigger sections', () => {
  it('shows "Manual — runs are started explicitly" for manual trigger', async () => {
    const { container } = renderWithId();
    await waitFor(() => {
      expect(container.textContent).toContain('Manual — runs are started explicitly');
    });
  });

  it('shows the event name for event trigger', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs') && !url.includes('team')) {
        return makeRes(
          makeDetailResp({
            triggerKind: 'event',
            triggerConfig: { event: 'user.created' },
          }),
        );
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderWithId();
    await waitFor(() => {
      expect(container.textContent).toContain('user.created');
    });
  });

  it('shows "— not set —" for event trigger with no event name', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs') && !url.includes('team')) {
        return makeRes(
          makeDetailResp({
            triggerKind: 'event',
            triggerConfig: null,
          }),
        );
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderWithId();
    await waitFor(() => {
      expect(container.textContent).toContain('— not set —');
    });
  });

  it('shows cron string for scheduled trigger', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs') && !url.includes('team')) {
        return makeRes(
          makeDetailResp({
            triggerKind: 'scheduled',
            triggerConfig: { cron: '0 9 * * 1' },
          }),
        );
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderWithId();
    await waitFor(() => {
      expect(container.textContent).toContain('0 9 * * 1');
    });
  });
});

// ─── Active status buttons ────────────────────────────────────────────────────

describe('PlaybookDetailPage — status-dependent buttons', () => {
  it('shows Activate button for draft playbook', async () => {
    const { container } = renderWithId();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Activate'),
      );
      expect(btn).toBeTruthy();
    });
  });

  it('does NOT show "Start a run" button for draft playbook', async () => {
    const { container } = renderWithId();
    await waitFor(() => {
      const h1 = container.querySelector('h1');
      expect(h1).toBeTruthy(); // page loaded
    });
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Start a run'),
    );
    expect(btn).toBeFalsy();
  });

  it('shows "Start a run" and Archive buttons for active playbook', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs') && !url.includes('team') && !url.includes('activate')) {
        return makeRes(makeDetailResp({ status: 'active' }));
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const { container } = renderWithId();
    await waitFor(() => {
      const startBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Start a run'),
      );
      const archiveBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Archive'),
      );
      expect(startBtn).toBeTruthy();
      expect(archiveBtn).toBeTruthy();
    });
  });

  it('does NOT show Activate button for active playbook', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs') && !url.includes('team')) {
        return makeRes(makeDetailResp({ status: 'active' }));
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const { container } = renderWithId();
    await waitFor(() => {
      // page loaded
      const h1 = container.querySelector('h1');
      expect(h1).toBeTruthy();
    });
    const activateBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Activate',
    );
    expect(activateBtn).toBeFalsy();
  });

  it('Delete button is always present', async () => {
    const { container } = renderWithId();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Delete'),
      );
      expect(btn).toBeTruthy();
    });
  });

  it('Activate button is disabled when steps list is empty', async () => {
    const { container } = renderWithId();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Activate'),
      ) as HTMLButtonElement | undefined;
      expect(btn?.disabled).toBe(true);
    });
  });

  it('Validate & activate inline button shown when draft has steps', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs') && !url.includes('team')) {
        return makeRes(makeDetailResp({}, [makeStep()]));
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderWithId();
    await waitFor(() => {
      expect(container.textContent).toContain('Validate');
    });
  });
});

// ─── Active runs count ────────────────────────────────────────────────────────

describe('PlaybookDetailPage — active runs section', () => {
  it('shows "No active runs" when count is 0', async () => {
    const { container } = renderWithId();
    await waitFor(() => {
      expect(container.textContent).toContain('No active runs of this playbook.');
    });
  });

  it('shows singular "1 run currently in flight" when count is 1', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs') && !url.includes('team')) {
        return makeRes(makeDetailResp());
      }
      if (url.includes('/api/portal/team')) {
        return makeRes({ success: true, data: [] });
      }
      if (url.includes('/api/portal/brain/playbook-runs')) {
        return makeRes({
          success: true,
          data: { items: [{ id: 1, status: 'active' }] },
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderWithId();
    await waitFor(() => {
      expect(container.textContent).toContain('1 run currently in flight.');
    });
  });

  it('shows plural "N runs currently in flight" when count > 1', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs') && !url.includes('team')) {
        return makeRes(makeDetailResp());
      }
      if (url.includes('/api/portal/team')) {
        return makeRes({ success: true, data: [] });
      }
      if (url.includes('/api/portal/brain/playbook-runs')) {
        return makeRes({
          success: true,
          data: {
            items: [
              { id: 1, status: 'active' },
              { id: 2, status: 'pending' },
            ],
          },
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderWithId();
    await waitFor(() => {
      expect(container.textContent).toContain('2 runs currently in flight.');
    });
  });
});

// ─── Activate action ──────────────────────────────────────────────────────────

describe('PlaybookDetailPage — Activate action', () => {
  async function renderWithSteps() {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/playbooks/7/activate')) {
        return makeRes({ success: true });
      }
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs') && !url.includes('team')) {
        return makeRes(makeDetailResp({}, [makeStep()]));
      }
      if (url.includes('/api/portal/team')) {
        return makeRes({ success: true, data: [] });
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const r = renderWithId();
    await waitFor(() => {
      const h1 = r.container.querySelector('h1');
      expect(h1).toBeTruthy();
    });
    return r;
  }

  it('calls the activate endpoint on click', async () => {
    const { container } = await renderWithSteps();
    const activateBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Activate'),
    ) as HTMLButtonElement;
    fireEvent.click(activateBtn);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/activate'),
      );
      expect(call).toBeTruthy();
    });
  });

  it('surfaces DAG error lines when activate returns a DAG invalid message', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/activate')) {
        return makeRes(
          {
            success: false,
            message: 'DAG invalid: Step A has no successors; Step B unreachable',
          },
          { ok: false },
        );
      }
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs') && !url.includes('team')) {
        return makeRes(makeDetailResp({}, [makeStep()]));
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderWithId();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Activate'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      expect(container.textContent).toContain('Step A has no successors');
      expect(container.textContent).toContain('Step B unreachable');
    });
  });

  it('surfaces plain error message on activate failure', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/activate')) {
        return makeRes({ success: false, message: 'Activate failed hard' }, { ok: false });
      }
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs') && !url.includes('team')) {
        return makeRes(makeDetailResp({}, [makeStep()]));
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderWithId();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Activate'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      expect(container.textContent).toContain('Activate failed hard');
    });
  });
});

// ─── Archive action ───────────────────────────────────────────────────────────

describe('PlaybookDetailPage — Archive action', () => {
  function setupActivePlaybook() {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/archive')) {
        return makeRes({ success: true });
      }
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs') && !url.includes('team')) {
        return makeRes(makeDetailResp({ status: 'active' }));
      }
      if (url.includes('/api/portal/team')) {
        return makeRes({ success: true, data: [] });
      }
      return makeRes({ success: true, data: { items: [] } });
    });
  }

  it('calls archive endpoint when confirm is accepted', async () => {
    setupActivePlaybook();
    const { container } = renderWithId();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());
    const archiveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Archive'),
    ) as HTMLButtonElement;
    fireEvent.click(archiveBtn);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/archive'),
      );
      expect(call).toBeTruthy();
    });
  });

  it('does NOT call archive when confirm is rejected', async () => {
    setupActivePlaybook();
    vi.stubGlobal('confirm', vi.fn(() => false));
    const { container } = renderWithId();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());
    const archiveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Archive'),
    ) as HTMLButtonElement;
    fireEvent.click(archiveBtn);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/archive'),
      );
      expect(call).toBeFalsy();
    });
  });

  it('shows error message when archive fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/archive')) {
        return makeRes({ success: false, message: 'Active runs blocking archive' }, { ok: false });
      }
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs') && !url.includes('team')) {
        return makeRes(makeDetailResp({ status: 'active' }));
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const { container } = renderWithId();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());
    const archiveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Archive'),
    ) as HTMLButtonElement;
    fireEvent.click(archiveBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Active runs blocking archive');
    });
  });
});

// ─── Delete action ────────────────────────────────────────────────────────────

describe('PlaybookDetailPage — Delete action', () => {
  it('navigates to /portal/brain/playbooks after successful delete', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (
        url.includes('/api/portal/brain/playbooks/7') &&
        init?.method === 'DELETE'
      ) {
        return makeRes({ success: true });
      }
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs') && !url.includes('team')) {
        return makeRes(makeDetailResp());
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderWithId();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());
    const deleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Delete'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/portal/brain/playbooks');
    });
  });

  it('does NOT navigate when confirm is rejected', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    const { container } = renderWithId();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());
    const deleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Delete'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    // Wait a tick to ensure no async calls happened
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows error message when delete fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/playbooks/7') && init?.method === 'DELETE') {
        return makeRes({ success: false, message: 'Cannot delete active playbook' }, { ok: false });
      }
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs') && !url.includes('team')) {
        return makeRes(makeDetailResp());
      }
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderWithId();
    await waitFor(() => expect(container.querySelector('h1')).toBeTruthy());
    const deleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Delete'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Cannot delete active playbook');
    });
  });
});

// ─── StartRunDialog ───────────────────────────────────────────────────────────

describe('PlaybookDetailPage — StartRunDialog', () => {
  // Shared mock for active-playbook scenario used by most dialog tests.
  function setupActiveMock() {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs') && !url.includes('team') && !url.includes('start')) {
        return makeRes(makeDetailResp({ status: 'active' }));
      }
      if (url.includes('/api/portal/team')) {
        return makeRes({ success: true, data: [] });
      }
      return makeRes({ success: true, data: { items: [] } });
    });
  }

  async function renderActive() {
    setupActiveMock();
    const r = renderWithId();
    // Wait for the page to fully load
    await waitFor(() => expect(r.container.querySelector('h1')).toBeTruthy());
    // Open dialog via "Start a run" button
    const startBtn = Array.from(r.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Start a run'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(startBtn);
    });
    // Wait for the dialog form to appear
    await waitFor(() => {
      expect(r.container.querySelector('form')).toBeTruthy();
    });
    return r;
  }

  it('opens the StartRunDialog when "Start a run" is clicked', async () => {
    const { container } = await renderActive();
    expect(container.querySelector('form')).toBeTruthy();
  });

  it('renders label input in the dialog', async () => {
    const { container } = await renderActive();
    const labelInput = container.querySelector('input[type="text"]');
    expect(labelInput).toBeTruthy();
  });

  it('closes the dialog when Cancel is clicked', async () => {
    const { container } = await renderActive();
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(container.querySelector('form')).toBeFalsy();
    });
  });

  it('closes the dialog when the close icon button is clicked', async () => {
    const { container } = await renderActive();
    const closeBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.getAttribute('aria-label') === 'Close',
    );
    expect(closeBtns.length).toBeGreaterThan(0);
    fireEvent.click(closeBtns[0]);
    await waitFor(() => {
      expect(container.querySelector('form')).toBeFalsy();
    });
  });

  it('shows validation error when label is empty on submit', async () => {
    const { container } = await renderActive();
    // Submit the form directly (jsdom requires this to trigger onSubmit)
    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(container.textContent).toContain('Label is required');
    });
  });

  it('submits the start run POST with the label', async () => {
    let capturedBody: unknown = null;
    // Open the dialog first using the shared active mock
    const { container } = await renderActive();
    // Then extend the mock to handle /start
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/start')) {
        capturedBody = JSON.parse(init?.body as string);
        return makeRes({ success: true, data: { runId: 55 } });
      }
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs') && !url.includes('team')) {
        return makeRes(makeDetailResp({ status: 'active' }));
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const labelInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: 'Test run label' } });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    await waitFor(() => {
      expect(capturedBody).toBeTruthy();
      expect((capturedBody as Record<string, unknown>).label).toBe('Test run label');
    });
  });

  it('navigates to the run detail page after successful start', async () => {
    const { container } = await renderActive();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/start')) {
        return makeRes({ success: true, data: { runId: 55 } });
      }
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs') && !url.includes('team')) {
        return makeRes(makeDetailResp({ status: 'active' }));
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const labelInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: 'Run it' } });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/portal/brain/playbook-runs/55');
    });
  });

  it('shows error message when start run POST fails', async () => {
    const { container } = await renderActive();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/start')) {
        return makeRes({ success: false, message: 'Start failed' }, { ok: false });
      }
      if (url.includes('/api/portal/brain/playbooks/7') && !url.includes('runs') && !url.includes('team')) {
        return makeRes(makeDetailResp({ status: 'active' }));
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const labelInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: 'Run label' } });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    await waitFor(() => {
      expect(container.textContent).toContain('Start failed');
    });
  });

  it('can add and remove a link row', async () => {
    const { container } = await renderActive();
    const addLinkBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add link'),
    ) as HTMLButtonElement;
    fireEvent.click(addLinkBtn);
    await waitFor(() => {
      expect(container.querySelector('select')).toBeTruthy();
    });
    // Remove the link
    const removeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Remove this link',
    ) as HTMLButtonElement;
    fireEvent.click(removeBtn);
    await waitFor(() => {
      expect(container.querySelector('select')).toBeFalsy();
    });
  });

  it('shows "Optional. Anchor this run…" when no links added', async () => {
    const { container } = await renderActive();
    expect(container.textContent).toContain('Optional. Anchor this run');
  });

  it('shows the context editor component in the dialog', async () => {
    const { container } = await renderActive();
    const editor = container.querySelector('[data-testid="context-editor"]');
    expect(editor).toBeTruthy();
  });
});
