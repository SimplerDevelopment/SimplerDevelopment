// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/brain/playbooks/[id]/page.tsx`.
 *
 * Coverage targets:
 *  - PlaybookDetailPage: loading state, error state (invalid id / network /
 *    server error), happy-path render (manual / event / scheduled triggers),
 *    draft vs active status display, owner name derivation, topic chips,
 *    step count pluralisation, active-run count
 *  - Action handlers: onActivate (success + DAG error), onArchive (confirm /
 *    cancel / error), onDelete (success + error + confirm cancel)
 *  - StartRunDialog: open, close, label validation, addLink / removeLink /
 *    entityType change, submit success + error + network error, submitting
 *    state
 *
 * Mocks: next/navigation, next/link, PlaybookStepGraph, PlaybookContextEditor,
 *   global fetch, window.confirm, React.use
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ─────────────────────────────────────

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
  usePathname: () => '/portal/brain/playbooks/1',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string; [key: string]: unknown }>) =>
    React.createElement('a', { href, ...rest }, children),
}));

// PlaybookStepGraph: has its own complex rendering; stub to a simple div
vi.mock('@/components/brain/PlaybookStepGraph', () => ({
  default: ({ steps }: { steps: unknown[] }) =>
    React.createElement(
      'div',
      { 'data-testid': 'step-graph' },
      `steps:${steps.length}`,
    ),
}));

// PlaybookContextEditor: rich key-value editor; not renderable in jsdom
vi.mock('@/components/brain/PlaybookContextEditor', () => ({
  default: ({
    onChange,
    disabled,
  }: {
    value: Record<string, unknown>;
    onChange: (v: Record<string, unknown>) => void;
    disabled?: boolean;
  }) =>
    React.createElement('div', { 'data-testid': 'context-editor', 'data-disabled': disabled }, [
      React.createElement(
        'button',
        {
          key: 'set-ctx',
          type: 'button',
          onClick: () => onChange({ injected: true }),
        },
        'SetContext',
      ),
    ]),
}));

// ─── React.use stub ────────────────────────────────────────────────────────
// The page calls `reactUse(params)` where params is a Promise<{ id: string }>.
// In tests we supply a real Promise so the module-level mock intercepts it.
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    use: (p: Promise<{ id: string }> | unknown) => {
      // If it looks like a promise with an _testId property, unwrap synchronously
      if (p && typeof (p as { _testId?: string })._testId === 'string') {
        return { id: (p as { _testId: string })._testId };
      }
      // Otherwise fall back to throwing (forces Suspense); for tests we control the promise
      throw p;
    },
  };
});

// ─── Fetch stub ────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<unknown> };

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, json: async () => body };
}

// ─── Default data factories ────────────────────────────────────────────────

function makePlaybook(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    clientId: 10,
    name: 'Onboarding',
    slug: 'onboarding',
    description: 'Our onboarding flow',
    status: 'draft',
    triggerKind: 'manual',
    triggerConfig: null,
    category: null,
    ownerId: null,
    defaultTopicIds: [],
    source: 'manual',
    createdBy: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeStep(id: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    clientId: 10,
    playbookId: 1,
    key: `step-${id}`,
    name: `Step ${id}`,
    description: null,
    kind: 'task',
    config: {},
    condition: null,
    nextStepKeys: [],
    sortOrder: id,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

// ─── Default fetch responses ───────────────────────────────────────────────

function defaultFetch(url: string): FetchResp {
  if (url.includes('/api/portal/brain/playbooks/') && url.includes('/activate')) {
    return makeRes({ success: true });
  }
  if (url.includes('/api/portal/brain/playbooks/') && url.includes('/archive')) {
    return makeRes({ success: true });
  }
  if (url.includes('/api/portal/brain/playbooks/') && url.includes('/start')) {
    return makeRes({ success: true, data: { runId: 42 } });
  }
  if (url.includes('/api/portal/brain/playbook-runs')) {
    return makeRes({ success: true, data: { items: [] } });
  }
  if (url.includes('/api/portal/team')) {
    return makeRes({ success: true, data: [] });
  }
  if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
    return makeRes({
      success: true,
      data: {
        playbook: makePlaybook(),
        steps: [],
      },
    });
  }
  return makeRes({ success: true });
}

beforeEach(() => {
  fetchMock.mockReset();
  pushMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => defaultFetch(url));
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Import after mocks
import PlaybookDetailPage from '@/app/portal/brain/playbooks/[id]/page';

// Helper: create a promise whose .use() result we can control through _testId
function makeParams(id: string): Promise<{ id: string }> & { _testId: string } {
  const p = Promise.resolve({ id }) as Promise<{ id: string }> & { _testId: string };
  p._testId = id;
  return p;
}

function renderPage(id = '1') {
  const params = makeParams(id);
  return render(React.createElement(PlaybookDetailPage, { params }));
}

// ─── Loading state ─────────────────────────────────────────────────────────

describe('PlaybookDetailPage — loading state', () => {
  it('shows loading spinner while fetch is in flight', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.textContent).toContain('Loading');
  });
});

// ─── Invalid id (non-numeric) ──────────────────────────────────────────────

describe('PlaybookDetailPage — invalid id', () => {
  it('shows "Invalid playbook id" error for NaN id', async () => {
    const { container } = renderPage('abc');
    await waitFor(() => {
      expect(container.textContent).toContain('Invalid playbook id');
    });
  });

  it('shows "Invalid playbook id" error for zero id', async () => {
    const { container } = renderPage('0');
    await waitFor(() => {
      expect(container.textContent).toContain('Invalid playbook id');
    });
  });

  it('shows back link on invalid id error', async () => {
    const { container } = renderPage('abc');
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/playbooks"]');
      expect(link).toBeTruthy();
    });
  });
});

// ─── Server / network errors ──────────────────────────────────────────────

describe('PlaybookDetailPage — fetch errors', () => {
  it('shows server message on non-ok response', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({ success: false, message: 'Not found' }, false);
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Not found');
    });
  });

  it('shows fallback on success:false without message', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({ success: false }, false);
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Failed to load playbook');
    });
  });

  it('shows network error message when fetch throws', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        throw new Error('network down');
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('network down');
    });
  });

  it('shows "Network error" for non-Error thrown value', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        throw 'plain string';
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Network error');
    });
  });
});

// ─── Happy-path rendering — draft playbook ─────────────────────────────────

describe('PlaybookDetailPage — happy path (draft, manual)', () => {
  it('renders playbook name', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Onboarding');
    });
  });

  it('renders slug', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('onboarding');
    });
  });

  it('renders "Draft" status chip', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Draft');
    });
  });

  it('renders "Manual" trigger chip', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Manual');
    });
  });

  it('shows "0 steps" in the header', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('0 steps');
    });
  });

  it('shows "1 step" (singular) when there is exactly one step', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({ success: true, data: { playbook: makePlaybook(), steps: [makeStep(1)] } });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('1 step');
      expect(container.textContent).not.toContain('1 steps');
    });
  });

  it('shows "2 steps" (plural) for two steps', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: { playbook: makePlaybook(), steps: [makeStep(1), makeStep(2)] },
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('2 steps');
    });
  });

  it('renders the back link', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/playbooks"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders the Edit link', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/playbooks/1/edit"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders description when present', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Our onboarding flow');
    });
  });

  it('renders manual trigger config text', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Manual — runs are started explicitly');
    });
  });

  it('renders the StepGraph stub', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="step-graph"]')).toBeTruthy();
    });
  });

  it('renders the Activate button for draft', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Activate'),
      );
      expect(btn).toBeTruthy();
    });
  });

  it('Activate button is disabled when steps list is empty', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Activate') && !b.textContent?.includes('activate'),
      ) as HTMLButtonElement | undefined;
      expect(btn?.disabled).toBe(true);
    });
  });

  it('renders "No active runs" when activeRunCount is 0', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No active runs of this playbook');
    });
  });

  it('shows run count when there are active runs', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbook-runs')) {
        return makeRes({
          success: true,
          data: { items: [{ id: 1, status: 'active' }, { id: 2, status: 'pending' }] },
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('2 runs currently in flight');
    });
  });

  it('shows "1 run currently in flight" (singular)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbook-runs')) {
        return makeRes({ success: true, data: { items: [{ id: 1, status: 'active' }] } });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('1 run currently in flight');
    });
  });
});

// ─── Category, owner, and topic chips ─────────────────────────────────────

describe('PlaybookDetailPage — metadata chips', () => {
  it('renders category chip when category is set', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: { playbook: makePlaybook({ category: 'HR' }), steps: [] },
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('HR');
    });
  });

  it('renders owner name from team data', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: { playbook: makePlaybook({ ownerId: 5 }), steps: [] },
        });
      }
      if (url.includes('/api/portal/team')) {
        return makeRes({
          success: true,
          data: [{ userId: 5, name: 'Alice Smith', email: 'alice@example.com' }],
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Alice Smith');
    });
  });

  it('renders owner email when name is null', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: { playbook: makePlaybook({ ownerId: 5 }), steps: [] },
        });
      }
      if (url.includes('/api/portal/team')) {
        return makeRes({
          success: true,
          data: [{ userId: 5, name: null, email: 'alice@example.com' }],
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('alice@example.com');
    });
  });

  it('renders "User #N" when ownerId is set but not in team list', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: { playbook: makePlaybook({ ownerId: 99 }), steps: [] },
        });
      }
      if (url.includes('/api/portal/team')) {
        return makeRes({ success: true, data: [] });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('User #99');
    });
  });

  it('renders default topic chips when defaultTopicIds has items', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: { playbook: makePlaybook({ defaultTopicIds: [7, 8] }), steps: [] },
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Topic #7');
      expect(container.textContent).toContain('Topic #8');
    });
  });
});

// ─── Trigger variants ──────────────────────────────────────────────────────

describe('PlaybookDetailPage — trigger variants', () => {
  it('renders event trigger config with event name', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: {
            playbook: makePlaybook({
              triggerKind: 'event',
              triggerConfig: { event: 'crm.deal.closed' },
            }),
            steps: [],
          },
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Event');
      expect(container.textContent).toContain('crm.deal.closed');
    });
  });

  it('renders event trigger with "— not set —" when no event in config', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: {
            playbook: makePlaybook({
              triggerKind: 'event',
              triggerConfig: {},
            }),
            steps: [],
          },
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('— not set —');
    });
  });

  it('renders scheduled trigger config with cron', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: {
            playbook: makePlaybook({
              triggerKind: 'scheduled',
              triggerConfig: { cron: '0 9 * * 1' },
            }),
            steps: [],
          },
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Scheduled');
      expect(container.textContent).toContain('0 9 * * 1');
    });
  });

  it('renders scheduled trigger with "— not set —" when no cron in config', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: {
            playbook: makePlaybook({
              triggerKind: 'scheduled',
              triggerConfig: {},
            }),
            steps: [],
          },
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('— not set —');
    });
  });
});

// ─── Active status buttons ─────────────────────────────────────────────────

describe('PlaybookDetailPage — active status', () => {
  function setupActive(stepsCount = 0) {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: {
            playbook: makePlaybook({ status: 'active' }),
            steps: Array.from({ length: stepsCount }, (_, i) => makeStep(i + 1)),
          },
        });
      }
      return defaultFetch(url);
    });
  }

  it('renders "Active" status chip', async () => {
    setupActive();
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Active');
    });
  });

  it('renders "Start a run" button for active playbook', async () => {
    setupActive();
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Start a run'),
      );
      expect(btn).toBeTruthy();
    });
  });

  it('renders "Archive" button for active playbook', async () => {
    setupActive();
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Archive'),
      );
      expect(btn).toBeTruthy();
    });
  });

  it('does NOT render "Activate" button for active playbook', async () => {
    setupActive();
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).not.toContain('Activate');
    });
  });
});

// ─── onActivate ────────────────────────────────────────────────────────────

describe('PlaybookDetailPage — onActivate', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: {
            playbook: makePlaybook({ status: 'draft' }),
            steps: [makeStep(1)],
          },
        });
      }
      return defaultFetch(url);
    });
  });

  it('calls POST /activate when Activate button is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Onboarding'));
    const activateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Activate') && b.textContent?.includes('play_arrow'),
    ) as HTMLButtonElement;
    fireEvent.click(activateBtn);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(
        (c) => String(c[0]).includes('/activate') && (c[1] as RequestInit)?.method === 'POST',
      );
      expect(calls.length).toBeGreaterThan(0);
    });
  });

  it('surfaces DAG error inline when activate returns DAG invalid message', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: {
            playbook: makePlaybook({ status: 'draft' }),
            steps: [makeStep(1)],
          },
        });
      }
      if (url.includes('/activate')) {
        return makeRes(
          { success: false, message: 'DAG invalid: step-1 has no next; step-2 is isolated' },
          false,
        );
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Onboarding'));
    const activateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Activate'),
    ) as HTMLButtonElement;
    fireEvent.click(activateBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('DAG invalid');
    });
  });

  it('surfaces plain error when activate returns non-DAG message', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: { playbook: makePlaybook({ status: 'draft' }), steps: [makeStep(1)] },
        });
      }
      if (url.includes('/activate')) {
        return makeRes({ success: false, message: 'Server error' }, false);
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Onboarding'));
    const activateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Activate'),
    ) as HTMLButtonElement;
    fireEvent.click(activateBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Server error');
    });
  });

  it('shows "Validate & activate" button in steps section for draft with steps', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Validate & activate');
    });
  });
});

// ─── onArchive ─────────────────────────────────────────────────────────────

describe('PlaybookDetailPage — onArchive', () => {
  function setupActive() {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: { playbook: makePlaybook({ status: 'active' }), steps: [] },
        });
      }
      if (url.includes('/archive')) {
        return makeRes({ success: true });
      }
      return defaultFetch(url);
    });
  }

  it('calls POST /archive when Archive is clicked and user confirms', async () => {
    setupActive();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Archive'));
    const archiveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Archive'),
    ) as HTMLButtonElement;
    fireEvent.click(archiveBtn);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(
        (c) => String(c[0]).includes('/archive') && (c[1] as RequestInit)?.method === 'POST',
      );
      expect(calls.length).toBeGreaterThan(0);
    });
  });

  it('does NOT call /archive when user cancels confirm', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    setupActive();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Archive'));
    const before = fetchMock.mock.calls.length;
    const archiveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Archive'),
    ) as HTMLButtonElement;
    fireEvent.click(archiveBtn);
    await new Promise((r) => setTimeout(r, 30));
    const archiveCalls = fetchMock.mock.calls
      .slice(before)
      .filter((c) => String(c[0]).includes('/archive'));
    expect(archiveCalls.length).toBe(0);
  });

  it('surfaces error when /archive returns failure', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: { playbook: makePlaybook({ status: 'active' }), steps: [] },
        });
      }
      if (url.includes('/archive')) {
        return makeRes({ success: false, message: 'Archive blocked' }, false);
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Archive'));
    const archiveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Archive'),
    ) as HTMLButtonElement;
    fireEvent.click(archiveBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Archive blocked');
    });
  });
});

// ─── onDelete ──────────────────────────────────────────────────────────────

describe('PlaybookDetailPage — onDelete', () => {
  it('calls DELETE and navigates away on success', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Onboarding'));
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Delete'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      const deleteCalls = fetchMock.mock.calls.filter(
        (c) =>
          /\/api\/portal\/brain\/playbooks\/\d+$/.test(String(c[0])) &&
          (c[1] as RequestInit)?.method === 'DELETE',
      );
      expect(deleteCalls.length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/portal/brain/playbooks');
    });
  });

  it('does NOT call DELETE when user cancels confirm', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Onboarding'));
    const before = fetchMock.mock.calls.length;
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Delete'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    await new Promise((r) => setTimeout(r, 30));
    const deleteCalls = fetchMock.mock.calls.slice(before).filter(
      (c) =>
        /\/api\/portal\/brain\/playbooks\/\d+$/.test(String(c[0])) &&
        (c[1] as RequestInit)?.method === 'DELETE',
    );
    expect(deleteCalls.length).toBe(0);
  });

  it('surfaces error when DELETE returns failure', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (
        /\/api\/portal\/brain\/playbooks\/\d+$/.test(url) &&
        (!init?.method || init.method === 'GET')
      ) {
        return makeRes({
          success: true,
          data: { playbook: makePlaybook(), steps: [] },
        });
      }
      if (
        /\/api\/portal\/brain\/playbooks\/\d+$/.test(url) &&
        (init as RequestInit)?.method === 'DELETE'
      ) {
        return makeRes({ success: false, message: 'Cannot delete' }, false);
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Onboarding'));
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Delete'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Cannot delete');
    });
  });
});

// ─── StartRunDialog ────────────────────────────────────────────────────────

describe('StartRunDialog', () => {
  function setupActive() {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: { playbook: makePlaybook({ status: 'active' }), steps: [makeStep(1)] },
        });
      }
      return defaultFetch(url);
    });
  }

  async function openDialog(container: HTMLElement) {
    const startBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Start a run'),
    ) as HTMLButtonElement;
    fireEvent.click(startBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Start a run');
      expect(container.querySelector('input[type="text"]')).toBeTruthy();
    });
  }

  it('opens when "Start a run" button is clicked', async () => {
    setupActive();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Start a run'));
    await openDialog(container);
    expect(container.textContent).toContain('Label');
    expect(container.textContent).toContain('Context variables');
  });

  it('closes via Cancel button', async () => {
    setupActive();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Start a run'));
    await openDialog(container);
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(container.querySelector('input[type="text"]')).toBeFalsy();
    });
  });

  it('closes via X (aria-label=Close) button', async () => {
    setupActive();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Start a run'));
    await openDialog(container);
    const closeBtn = container.querySelector('[aria-label="Close"]') as HTMLButtonElement;
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(container.querySelector('[aria-label="Close"]')).toBeFalsy();
    });
  });

  it('shows error when submitting without a label', async () => {
    setupActive();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Start a run'));
    await openDialog(container);
    // Submit the form directly (bypasses HTML5 required validation in jsdom,
    // which triggers the JS guard: if (!label.trim()) setErr('Label is required')
    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(container.textContent).toContain('Label is required');
    });
  });

  it('calls POST /start and navigates on success', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: { playbook: makePlaybook({ status: 'active' }), steps: [makeStep(1)] },
        });
      }
      if (url.includes('/start')) {
        return makeRes({ success: true, data: { runId: 42 } });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Start a run'));
    await openDialog(container);
    const labelInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: 'My test run' } });
    const submitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Start run'),
    ) as HTMLButtonElement;
    fireEvent.click(submitBtn);
    await waitFor(() => {
      const startCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/start'));
      expect(startCalls.length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/portal/brain/playbook-runs/42');
    });
  });

  it('shows server error from /start endpoint', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: { playbook: makePlaybook({ status: 'active' }), steps: [makeStep(1)] },
        });
      }
      if (url.includes('/start')) {
        return makeRes({ success: false, message: 'Quota exceeded' }, false);
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Start a run'));
    await openDialog(container);
    const labelInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: 'Run label' } });
    const submitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Start run'),
    ) as HTMLButtonElement;
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Quota exceeded');
    });
  });

  it('shows "Network error" when /start fetch throws', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: { playbook: makePlaybook({ status: 'active' }), steps: [makeStep(1)] },
        });
      }
      if (url.includes('/start')) {
        throw new Error('connection refused');
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Start a run'));
    await openDialog(container);
    const labelInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: 'Run label' } });
    const submitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Start run'),
    ) as HTMLButtonElement;
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('connection refused');
    });
  });

  it('renders Links section with "Add link" button', async () => {
    setupActive();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Start a run'));
    await openDialog(container);
    expect(container.textContent).toContain('Links');
    const addLinkBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add link'),
    );
    expect(addLinkBtn).toBeTruthy();
  });

  it('adds a link row when "Add link" is clicked', async () => {
    setupActive();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Start a run'));
    await openDialog(container);
    const addLinkBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add link'),
    ) as HTMLButtonElement;
    fireEvent.click(addLinkBtn);
    await waitFor(() => {
      // A select for entityType should appear
      const selects = container.querySelectorAll('select');
      expect(selects.length).toBeGreaterThan(0);
    });
  });

  it('removes a link row via the remove button', async () => {
    setupActive();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Start a run'));
    await openDialog(container);
    const addLinkBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add link'),
    ) as HTMLButtonElement;
    fireEvent.click(addLinkBtn);
    await waitFor(() => expect(container.querySelectorAll('select').length).toBeGreaterThan(0));
    const removeBtn = container.querySelector('[aria-label="Remove this link"]') as HTMLButtonElement;
    expect(removeBtn).toBeTruthy();
    fireEvent.click(removeBtn);
    await waitFor(() => {
      expect(container.querySelector('[aria-label="Remove this link"]')).toBeFalsy();
    });
  });

  it('changes entityType in a link row via select', async () => {
    setupActive();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Start a run'));
    await openDialog(container);
    const addLinkBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add link'),
    ) as HTMLButtonElement;
    fireEvent.click(addLinkBtn);
    await waitFor(() => expect(container.querySelectorAll('select').length).toBeGreaterThan(0));
    const entityTypeSelect = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(entityTypeSelect, { target: { value: 'person' } });
    expect(entityTypeSelect.value).toBe('person');
  });

  it('updates entityId numeric input in a link row', async () => {
    setupActive();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Start a run'));
    await openDialog(container);
    const addLinkBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add link'),
    ) as HTMLButtonElement;
    fireEvent.click(addLinkBtn);
    await waitFor(() => expect(container.querySelectorAll('input[type="number"]').length).toBeGreaterThan(0));
    const entityIdInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(entityIdInput, { target: { value: '42' } });
    expect(entityIdInput.value).toBe('42');
  });

  it('submits with valid entityId included in payload', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: { playbook: makePlaybook({ status: 'active' }), steps: [makeStep(1)] },
        });
      }
      if (url.includes('/start')) {
        return makeRes({ success: true, data: { runId: 99 } });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Start a run'));
    await openDialog(container);
    // Add a link with a valid entity id
    const addLinkBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add link'),
    ) as HTMLButtonElement;
    fireEvent.click(addLinkBtn);
    await waitFor(() => expect(container.querySelectorAll('input[type="number"]').length).toBeGreaterThan(0));
    const entityIdInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(entityIdInput, { target: { value: '5' } });
    // Fill label
    const labelInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: 'Linked run' } });
    const submitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Start run'),
    ) as HTMLButtonElement;
    fireEvent.click(submitBtn);
    await waitFor(() => {
      const startCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/start'));
      expect(startCalls.length).toBeGreaterThan(0);
      const body = JSON.parse((startCalls[0][1] as RequestInit).body as string);
      expect(body.links).toBeDefined();
    });
  });

  it('shows "Optional. Anchor this run" when links list is empty', async () => {
    setupActive();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Start a run'));
    await openDialog(container);
    expect(container.textContent).toContain('Optional');
  });

  it('renders context editor stub', async () => {
    setupActive();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Start a run'));
    await openDialog(container);
    expect(container.querySelector('[data-testid="context-editor"]')).toBeTruthy();
  });
});

// ─── Team fetch is non-fatal ───────────────────────────────────────────────

describe('PlaybookDetailPage — team fetch non-fatal', () => {
  it('renders playbook even when /team fetch fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) {
        throw new Error('team endpoint down');
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Onboarding');
    });
  });

  it('renders playbook even when /playbook-runs fetch fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbook-runs')) {
        throw new Error('runs endpoint down');
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Onboarding');
    });
  });
});

// ─── "View all runs" link ──────────────────────────────────────────────────

describe('PlaybookDetailPage — runs link', () => {
  it('renders "View all runs" link with correct href', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector(
        'a[href="/portal/brain/playbook-runs?playbookId=1"]',
      );
      expect(link).toBeTruthy();
    });
  });
});
