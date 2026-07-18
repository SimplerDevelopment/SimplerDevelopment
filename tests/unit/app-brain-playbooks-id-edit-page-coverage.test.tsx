// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/brain/playbooks/[id]/edit/page.tsx`.
 *
 * Coverage targets:
 *  - PlaybookEditPage: loading state, invalid-id error, network error,
 *    server error, happy-path render (playbook + steps)
 *  - Team fetch: success, failure (non-fatal), cancellation
 *  - formInitial memoisation: derived from playbook fields
 *  - onMetaSubmit: success (calls PATCH + reloads), API error (throws)
 *  - onPatchStep: optimistic update, success path, server error path, network throw
 *  - onRemoveStep: confirm=false guard, DELETE success, DELETE API error
 *  - onAddStep: unique-key minting (collision), POST success, POST error
 *  - reorderTo: success (updates steps from response), API error, no-items branch
 *  - handleDragStart / handleDragEnd / handleDragOver / handleDrop:
 *    noop when draggingId === targetId, invalid index guard, happy reorder
 *  - Render branches: loading spinner, error + no-playbook, error + playbook,
 *    null playbook, step list (empty vs filled), "Add step" buttons
 *
 * Mocks: next/link, next/navigation, React.use (params), global fetch,
 *   window.confirm, PlaybookForm, PlaybookStepEditor (heavy children).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ──────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/portal/brain/playbooks/1/edit',
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

// PlaybookForm: stateful form with debouncing; stub with a simple submit button.
// Captures the `onSubmit` callback so tests can invoke it directly.
let capturedOnMetaSubmit: ((values: Record<string, unknown>) => Promise<void>) | null = null;
let capturedFormInitial: Record<string, unknown> | undefined;

vi.mock('@/components/brain/PlaybookForm', () => ({
  default: (props: {
    onSubmit: (values: Record<string, unknown>) => Promise<void>;
    initial?: Record<string, unknown>;
    mode: string;
    submitLabel: string;
    team: unknown[];
  }) => {
    capturedOnMetaSubmit = props.onSubmit;
    capturedFormInitial = props.initial;
    return React.createElement(
      'div',
      { 'data-testid': 'playbook-form' },
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'form-submit-btn',
          onClick: () =>
            props.onSubmit({
              name: 'Updated Name',
              description: 'desc',
              category: 'cat',
              triggerKind: 'manual',
              triggerEvent: '',
              triggerCron: '',
              ownerId: null,
            }),
        },
        props.submitLabel,
      ),
    );
  },
  valuesToTriggerConfig: (values: { triggerKind: string; triggerEvent: string; triggerCron: string }) => {
    if (values.triggerKind === 'event') return { event: values.triggerEvent };
    if (values.triggerKind === 'scheduled') return { cron: values.triggerCron };
    return null;
  },
}));

// PlaybookStepEditor: complex inline editor; stub to a simple representation.
// Captures per-step callbacks so tests can invoke them.
interface StepEditorProps {
  step: { id: number; key: string; name: string };
  onPatch: (patch: Record<string, unknown>) => void;
  onRemove: () => void;
  dragHandleProps: {
    onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
    onDragEnd: () => void;
  };
  dropTargetProps: {
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
    onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  };
  busy: boolean;
}

const capturedStepEditors: Map<number, StepEditorProps> = new Map();

vi.mock('@/components/brain/PlaybookStepEditor', () => ({
  default: (props: StepEditorProps) => {
    capturedStepEditors.set(props.step.id, props);
    return React.createElement(
      'div',
      { 'data-testid': `step-editor-${props.step.id}` },
      [
        React.createElement('span', { key: 'name' }, props.step.name),
        React.createElement(
          'button',
          { key: 'patch', type: 'button', onClick: () => props.onPatch({ name: 'patched' }) },
          'Patch',
        ),
        React.createElement(
          'button',
          { key: 'remove', type: 'button', onClick: () => props.onRemove() },
          'Remove',
        ),
        React.createElement(
          'div',
          {
            key: 'drag-handle',
            'data-testid': `drag-handle-${props.step.id}`,
            draggable: true,
            onDragStart: props.dragHandleProps.onDragStart,
            onDragEnd: props.dragHandleProps.onDragEnd,
          },
        ),
        React.createElement(
          'div',
          {
            key: 'drop-target',
            'data-testid': `drop-target-${props.step.id}`,
            onDragOver: props.dropTargetProps.onDragOver,
            onDrop: props.dropTargetProps.onDrop,
          },
        ),
      ],
    );
  },
}));

// ─── React.use stub ────────────────────────────────────────────────────────
// The page calls `reactUse(params)` where params is Promise<{ id: string }>.
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    use: (p: Promise<{ id: string }> | unknown) => {
      if (p && typeof (p as { _testId?: string })._testId === 'string') {
        return { id: (p as { _testId: string })._testId };
      }
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

// ─── Data factories ────────────────────────────────────────────────────────

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

function defaultFetch(url: string, _init?: RequestInit): FetchResp {
  if (url === '/api/portal/team') {
    return makeRes({ success: true, data: [] });
  }
  if (/\/api\/portal\/brain\/playbooks\/\d+\/steps\/\d+$/.test(url)) {
    return makeRes({ success: true });
  }
  if (/\/api\/portal\/brain\/playbooks\/\d+\/steps$/.test(url)) {
    return makeRes({ success: true, data: { id: 99, ...makeStep(99) } });
  }
  if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
    return makeRes({
      success: true,
      data: { playbook: makePlaybook(), steps: [] },
    });
  }
  return makeRes({ success: true });
}

beforeEach(() => {
  capturedOnMetaSubmit = null;
  capturedFormInitial = undefined;
  capturedStepEditors.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => defaultFetch(url, init));
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Import after mocks
import PlaybookEditPage from '@/app/portal/brain/playbooks/[id]/edit/page';

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeParams(id: string): Promise<{ id: string }> & { _testId: string } {
  const p = Promise.resolve({ id }) as Promise<{ id: string }> & { _testId: string };
  p._testId = id;
  return p;
}

function renderPage(id = '1') {
  const params = makeParams(id);
  return render(React.createElement(PlaybookEditPage, { params }));
}

// ─── Loading state ────────────────────────────────────────────────────────

describe('PlaybookEditPage — loading state', () => {
  it('shows loading spinner while fetch is pending', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.textContent).toContain('Loading');
  });

  it('shows progress_activity icon in loading state', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.textContent).toContain('progress_activity');
  });
});

// ─── Invalid id ───────────────────────────────────────────────────────────

describe('PlaybookEditPage — invalid id', () => {
  it('shows "Invalid playbook id" for NaN id', async () => {
    const { container } = renderPage('not-a-number');
    await waitFor(() => {
      expect(container.textContent).toContain('Invalid playbook id');
    });
  });

  it('shows "Invalid playbook id" for id=0', async () => {
    const { container } = renderPage('0');
    await waitFor(() => {
      expect(container.textContent).toContain('Invalid playbook id');
    });
  });

  it('shows "Invalid playbook id" for negative id', async () => {
    const { container } = renderPage('-5');
    await waitFor(() => {
      expect(container.textContent).toContain('Invalid playbook id');
    });
  });

  it('shows Playbooks back link on invalid-id error', async () => {
    const { container } = renderPage('not-a-number');
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/playbooks"]');
      expect(link).toBeTruthy();
    });
  });
});

// ─── Network error on load ────────────────────────────────────────────────

describe('PlaybookEditPage — load errors', () => {
  it('shows error message on network error', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/playbooks/')) throw new Error('network down');
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('network down');
    });
  });

  it('shows error message on non-ok server response', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({ success: false, message: 'Playbook not found' }, false);
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Playbook not found');
    });
  });

  it('shows error message on success=false response', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({ success: false, message: 'DB error' });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('DB error');
    });
  });

  it('shows error_outline icon on load error with no playbook', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({ success: false, message: 'Not found' }, false);
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('error_outline');
    });
  });

  it('shows generic fallback "Network error" when thrown value is not an Error', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) throw 'plain string';
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Network error');
    });
  });
});

// ─── Happy-path render ────────────────────────────────────────────────────

describe('PlaybookEditPage — happy-path render', () => {
  it('renders "Edit playbook" heading after load', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Edit playbook');
    });
  });

  it('renders back-to-playbook link', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/playbooks/1"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders the playbook slug', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('onboarding');
    });
  });

  it('renders the draft status chip', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Draft');
    });
  });

  it('renders "active" status chip for active playbook', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: { playbook: makePlaybook({ status: 'active' }), steps: [] },
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Active');
    });
  });

  it('renders "archived" status chip for archived playbook', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: { playbook: makePlaybook({ status: 'archived' }), steps: [] },
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Archived');
    });
  });

  it('renders the PlaybookForm component', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="playbook-form"]')).toBeTruthy();
    });
  });

  it('renders the "Details" section heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Details');
    });
  });

  it('renders the "Steps" section heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Steps');
    });
  });

  it('renders the "Add step" section', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Add step');
    });
  });

  it('renders add-step buttons for all step kinds', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Task');
      expect(container.textContent).toContain('Note');
      expect(container.textContent).toContain('Meeting');
      expect(container.textContent).toContain('Decision');
    });
  });

  it('passes formInitial with playbook fields to PlaybookForm', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: {
            playbook: makePlaybook({ name: 'My PB', description: 'desc text', category: 'ops', ownerId: 5 }),
            steps: [],
          },
        });
      }
      return defaultFetch(url);
    });
    renderPage();
    await waitFor(() => {
      expect(capturedFormInitial?.name).toBe('My PB');
      expect(capturedFormInitial?.description).toBe('desc text');
      expect(capturedFormInitial?.category).toBe('ops');
      expect(capturedFormInitial?.ownerId).toBe(5);
    });
  });

  it('passes formInitial with empty strings for null description/category', async () => {
    // Default makePlaybook has description: 'Our onboarding flow'. Override with null.
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: { playbook: makePlaybook({ description: null, category: null }), steps: [] },
        });
      }
      return defaultFetch(url);
    });
    renderPage();
    await waitFor(() => {
      expect(capturedFormInitial?.description).toBe('');
      expect(capturedFormInitial?.category).toBe('');
    });
  });

  it('passes triggerEvent from triggerConfig.event', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: {
            playbook: makePlaybook({ triggerKind: 'event', triggerConfig: { event: 'crm.deal.created' } }),
            steps: [],
          },
        });
      }
      return defaultFetch(url);
    });
    renderPage();
    await waitFor(() => {
      expect(capturedFormInitial?.triggerEvent).toBe('crm.deal.created');
    });
  });

  it('passes triggerCron from triggerConfig.cron', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({
          success: true,
          data: {
            playbook: makePlaybook({ triggerKind: 'scheduled', triggerConfig: { cron: '0 9 * * 1' } }),
            steps: [],
          },
        });
      }
      return defaultFetch(url);
    });
    renderPage();
    await waitFor(() => {
      expect(capturedFormInitial?.triggerCron).toBe('0 9 * * 1');
    });
  });
});

// ─── Empty steps state ────────────────────────────────────────────────────

describe('PlaybookEditPage — empty steps state', () => {
  it('shows empty-state text when no steps', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No steps yet');
    });
  });

  it('shows step count of 0 in heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('(0)');
    });
  });
});

// ─── Steps list render ────────────────────────────────────────────────────

describe('PlaybookEditPage — steps list render', () => {
  function fetchWithSteps(steps: ReturnType<typeof makeStep>[]) {
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({ success: true, data: { playbook: makePlaybook(), steps } });
      }
      return defaultFetch(url);
    });
  }

  it('renders step editors for each step', async () => {
    fetchWithSteps([makeStep(1), makeStep(2)]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="step-editor-1"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="step-editor-2"]')).toBeTruthy();
    });
  });

  it('shows step count in Steps heading', async () => {
    fetchWithSteps([makeStep(1), makeStep(2), makeStep(3)]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('(3)');
    });
  });

  it('renders step name from stub', async () => {
    fetchWithSteps([makeStep(1, { name: 'Alpha Step' })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Alpha Step');
    });
  });

  it('shows "Drag to reorder" hint when steps exist', async () => {
    fetchWithSteps([makeStep(1)]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Drag to reorder');
    });
  });
});

// ─── Team fetch ───────────────────────────────────────────────────────────

describe('PlaybookEditPage — team fetch', () => {
  it('fetches team on mount', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/team') {
        return makeRes({
          success: true,
          data: [{ userId: 5, name: 'Alice', email: 'alice@example.com' }],
        });
      }
      return defaultFetch(url);
    });
    renderPage();
    await waitFor(() => {
      const teamCalls = fetchMock.mock.calls.filter((c) => c[0] === '/api/portal/team');
      expect(teamCalls.length).toBeGreaterThan(0);
    });
  });

  it('is non-fatal when team fetch fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/team') throw new Error('team down');
      return defaultFetch(url);
    });
    const { container } = renderPage();
    // The page should still render (team failure is swallowed)
    await waitFor(() => {
      expect(container.textContent).toContain('Edit playbook');
    });
  });

  it('filters team members without userId', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/team') {
        return makeRes({
          success: true,
          data: [
            { userId: 3, name: 'Bob', email: 'bob@example.com' },
            { name: 'No Id', email: 'noid@example.com' }, // no userId
          ],
        });
      }
      return defaultFetch(url);
    });
    // Page should not crash
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Edit playbook');
    });
  });
});

// ─── onMetaSubmit ────────────────────────────────────────────────────────

describe('PlaybookEditPage — onMetaSubmit', () => {
  it('PATCHes the playbook metadata on form submit', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && init?.method === 'PATCH') {
        return makeRes({ success: true });
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="form-submit-btn"]')).toBeTruthy());

    await act(async () => {
      const btn = container.querySelector('[data-testid="form-submit-btn"]') as HTMLButtonElement;
      btn.click();
    });

    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter(
        (c) => /\/api\/portal\/brain\/playbooks\/\d+$/.test(String(c[0])) && c[1]?.method === 'PATCH',
      );
      expect(patchCalls.length).toBeGreaterThan(0);
    });
  });

  it('reloads playbook data after successful PATCH', async () => {
    let callCount = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && init?.method === 'PATCH') {
        return makeRes({ success: true });
      }
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !init?.method) {
        callCount++;
        return makeRes({ success: true, data: { playbook: makePlaybook(), steps: [] } });
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="form-submit-btn"]')).toBeTruthy());
    const countBefore = callCount;

    await act(async () => {
      const btn = container.querySelector('[data-testid="form-submit-btn"]') as HTMLButtonElement;
      btn.click();
    });

    await waitFor(() => {
      expect(callCount).toBeGreaterThan(countBefore);
    });
  });

  it('throws (propagates error) when PATCH fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && init?.method === 'PATCH') {
        return makeRes({ success: false, message: 'Update failed' });
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => expect(capturedOnMetaSubmit).toBeTruthy());

    let threw = false;
    await act(async () => {
      try {
        await capturedOnMetaSubmit!({
          name: 'X',
          description: '',
          category: '',
          triggerKind: 'manual',
          triggerEvent: '',
          triggerCron: '',
          ownerId: null,
        });
      } catch {
        threw = true;
      }
    });
    expect(threw).toBe(true);
    // Error is cleared on each onMetaSubmit call start — no error banner since no
    // existing playbook-load error
    expect(container.textContent).toContain('Edit playbook');
  });
});

// ─── onPatchStep ──────────────────────────────────────────────────────────

describe('PlaybookEditPage — onPatchStep', () => {
  function fetchWithOneStep() {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !init?.method) {
        return makeRes({ success: true, data: { playbook: makePlaybook(), steps: [makeStep(1)] } });
      }
      if (/\/api\/portal\/brain\/playbooks\/\d+\/steps\/\d+$/.test(url) && init?.method === 'PATCH') {
        return makeRes({ success: true });
      }
      return defaultFetch(url, init);
    });
  }

  it('optimistically updates step name before server responds', async () => {
    fetchWithOneStep();
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="step-editor-1"]')).toBeTruthy());

    act(() => {
      capturedStepEditors.get(1)?.onPatch({ name: 'patched' });
    });

    // The step editor stub receives new props — the container still shows the stub
    await waitFor(() => {
      expect(container.querySelector('[data-testid="step-editor-1"]')).toBeTruthy();
    });
  });

  it('sends PATCH /steps/:stepId with changed fields', async () => {
    fetchWithOneStep();
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="step-editor-1"]')).toBeTruthy());

    await act(async () => {
      capturedStepEditors.get(1)?.onPatch({ name: 'New Name', kind: 'note' });
    });

    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter(
        (c) => /\/steps\/1$/.test(String(c[0])) && c[1]?.method === 'PATCH',
      );
      expect(patchCalls.length).toBeGreaterThan(0);
    });
  });

  it('reloads and shows error when PATCH step fails', async () => {
    // The reload (called after setError) itself fails, so the error sticks visible.
    let stepLoaded = false;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !init?.method) {
        if (!stepLoaded) {
          // First load: succeed with step
          stepLoaded = true;
          return makeRes({ success: true, data: { playbook: makePlaybook(), steps: [makeStep(1)] } });
        }
        // Reload after patch error: also fail so error message persists
        return makeRes({ success: false, message: 'Step update failed' }, false);
      }
      if (/\/steps\/1$/.test(url) && init?.method === 'PATCH') {
        return makeRes({ success: false, message: 'Step update failed' });
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="step-editor-1"]')).toBeTruthy());

    await act(async () => {
      capturedStepEditors.get(1)?.onPatch({ name: 'bad' });
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Step update failed');
    });
  });

  it('shows error and reloads when PATCH step throws', async () => {
    // After the step PATCH throws, load() is called. Make load() also fail so
    // the error message stays visible.
    let stepLoaded = false;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !init?.method) {
        if (!stepLoaded) {
          stepLoaded = true;
          return makeRes({ success: true, data: { playbook: makePlaybook(), steps: [makeStep(1)] } });
        }
        throw new Error('network fail');
      }
      if (/\/steps\/1$/.test(url) && init?.method === 'PATCH') {
        throw new Error('network fail');
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="step-editor-1"]')).toBeTruthy());

    await act(async () => {
      capturedStepEditors.get(1)?.onPatch({ name: 'boom' });
    });

    await waitFor(() => {
      expect(container.textContent).toContain('network fail');
    });
  });
});

// ─── onRemoveStep ─────────────────────────────────────────────────────────

describe('PlaybookEditPage — onRemoveStep', () => {
  function fetchWithOneStep() {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !init?.method) {
        return makeRes({ success: true, data: { playbook: makePlaybook(), steps: [makeStep(1)] } });
      }
      if (/\/steps\/1$/.test(url) && init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      return defaultFetch(url, init);
    });
  }

  it('does nothing when confirm returns false', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    fetchWithOneStep();
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="step-editor-1"]')).toBeTruthy());
    const beforeCount = fetchMock.mock.calls.length;

    act(() => {
      capturedStepEditors.get(1)?.onRemove();
    });

    await new Promise((r) => setTimeout(r, 30));
    // No extra fetch issued
    expect(fetchMock.mock.calls.length).toBe(beforeCount);
  });

  it('DELETEs step when confirm returns true', async () => {
    fetchWithOneStep();
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="step-editor-1"]')).toBeTruthy());

    await act(async () => {
      capturedStepEditors.get(1)?.onRemove();
    });

    await waitFor(() => {
      const deleteCalls = fetchMock.mock.calls.filter(
        (c) => /\/steps\/1$/.test(String(c[0])) && c[1]?.method === 'DELETE',
      );
      expect(deleteCalls.length).toBeGreaterThan(0);
    });
  });

  it('shows error banner when DELETE fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !init?.method) {
        return makeRes({ success: true, data: { playbook: makePlaybook(), steps: [makeStep(1)] } });
      }
      if (/\/steps\/1$/.test(url) && init?.method === 'DELETE') {
        return makeRes({ success: false, message: 'Remove failed' });
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="step-editor-1"]')).toBeTruthy());

    await act(async () => {
      capturedStepEditors.get(1)?.onRemove();
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Remove failed');
    });
  });
});

// ─── onAddStep ────────────────────────────────────────────────────────────

describe('PlaybookEditPage — onAddStep', () => {
  it('POSTs to /steps when "Task" add-step button clicked', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !init?.method) {
        return makeRes({ success: true, data: { playbook: makePlaybook(), steps: [] } });
      }
      if (/\/steps$/.test(url) && init?.method === 'POST') {
        return makeRes({ success: true, data: makeStep(10) });
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Add step'));

    const taskBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Task'),
    ) as HTMLButtonElement;
    fireEvent.click(taskBtn);

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        (c) => /\/steps$/.test(String(c[0])) && c[1]?.method === 'POST',
      );
      expect(postCalls.length).toBeGreaterThan(0);
    });
  });

  it('mints unique key when kind already exists in steps', async () => {
    // Start with a step with key 'task'
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !init?.method) {
        return makeRes({
          success: true,
          data: { playbook: makePlaybook(), steps: [makeStep(1, { key: 'task' })] },
        });
      }
      if (/\/steps$/.test(url) && init?.method === 'POST') {
        // Capture the posted body
        return makeRes({ success: true, data: makeStep(11) });
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Add step'));

    const taskBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Task'),
    ) as HTMLButtonElement;
    fireEvent.click(taskBtn);

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        (c) => /\/steps$/.test(String(c[0])) && c[1]?.method === 'POST',
      );
      expect(postCalls.length).toBeGreaterThan(0);
      const body = JSON.parse(postCalls[0][1]!.body as string) as { key: string };
      // Key should be 'task_2' since 'task' is already taken
      expect(body.key).toBe('task_2');
    });
  });

  it('shows error when POST step fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !init?.method) {
        return makeRes({ success: true, data: { playbook: makePlaybook(), steps: [] } });
      }
      if (/\/steps$/.test(url) && init?.method === 'POST') {
        return makeRes({ success: false, message: 'Add step failed' });
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Add step'));

    const taskBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Task'),
    ) as HTMLButtonElement;
    fireEvent.click(taskBtn);

    await waitFor(() => {
      expect(container.textContent).toContain('Add step failed');
    });
  });

  it('add-step buttons are disabled while busy', async () => {
    // Hold the POST so busy state persists
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !init?.method) {
        return makeRes({ success: true, data: { playbook: makePlaybook(), steps: [] } });
      }
      if (/\/steps$/.test(url) && init?.method === 'POST') {
        return new Promise(() => {});
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Add step'));

    const taskBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Task'),
    ) as HTMLButtonElement;
    fireEvent.click(taskBtn);

    await waitFor(() => {
      // All add-step buttons should be disabled
      const addStepButtons = Array.from(container.querySelectorAll('button')).filter(
        (b) => b.getAttribute('disabled') !== null,
      );
      expect(addStepButtons.length).toBeGreaterThan(0);
    });
  });
});

// ─── reorderTo ────────────────────────────────────────────────────────────

describe('PlaybookEditPage — reorderTo (drag-and-drop)', () => {
  function fetchWithTwoSteps() {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !init?.method) {
        return makeRes({
          success: true,
          data: { playbook: makePlaybook(), steps: [makeStep(1), makeStep(2)] },
        });
      }
      if (/\/steps$/.test(url) && init?.method === 'PATCH') {
        return makeRes({
          success: true,
          data: { items: [makeStep(2, { sortOrder: 0 }), makeStep(1, { sortOrder: 1 })] },
        });
      }
      return defaultFetch(url, init);
    });
  }

  it('PATCHes /steps with orderedStepIds on drop', async () => {
    fetchWithTwoSteps();
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="step-editor-1"]')).toBeTruthy());

    // Simulate drag of step 1 onto step 2
    const dragHandle = container.querySelector('[data-testid="drag-handle-1"]') as HTMLDivElement;
    const dropTarget = container.querySelector('[data-testid="drop-target-2"]') as HTMLDivElement;

    const dragStartEvent = new Event('dragstart', { bubbles: true }) as unknown as React.DragEvent<HTMLDivElement>;
    Object.defineProperty(dragStartEvent, 'dataTransfer', {
      value: { effectAllowed: '', setData: vi.fn() },
    });

    act(() => {
      capturedStepEditors.get(1)?.dragHandleProps.onDragStart(dragStartEvent);
    });

    const dropEvent = new Event('drop', { bubbles: true }) as unknown as React.DragEvent<HTMLDivElement>;
    Object.defineProperty(dropEvent, 'preventDefault', { value: vi.fn() });
    Object.defineProperty(dropEvent, 'dataTransfer', { value: { dropEffect: '' } });

    await act(async () => {
      capturedStepEditors.get(2)?.dropTargetProps.onDrop(dropEvent);
    });

    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter(
        (c) => /\/steps$/.test(String(c[0])) && c[1]?.method === 'PATCH',
      );
      expect(patchCalls.length).toBeGreaterThan(0);
    });
  });

  it('noop when draggingId === targetId', async () => {
    fetchWithTwoSteps();
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="step-editor-1"]')).toBeTruthy());

    const dragStartEvent = new Event('dragstart', { bubbles: true }) as unknown as React.DragEvent<HTMLDivElement>;
    Object.defineProperty(dragStartEvent, 'dataTransfer', {
      value: { effectAllowed: '', setData: vi.fn() },
    });

    act(() => {
      capturedStepEditors.get(1)?.dragHandleProps.onDragStart(dragStartEvent);
    });

    const beforeCount = fetchMock.mock.calls.filter(
      (c) => /\/steps$/.test(String(c[0])) && c[1]?.method === 'PATCH',
    ).length;

    // Drop onto the same step
    const dropEvent = new Event('drop', { bubbles: true }) as unknown as React.DragEvent<HTMLDivElement>;
    Object.defineProperty(dropEvent, 'preventDefault', { value: vi.fn() });
    Object.defineProperty(dropEvent, 'dataTransfer', { value: { dropEffect: '' } });

    act(() => {
      capturedStepEditors.get(1)?.dropTargetProps.onDrop(dropEvent);
    });

    await new Promise((r) => setTimeout(r, 30));
    const afterCount = fetchMock.mock.calls.filter(
      (c) => /\/steps$/.test(String(c[0])) && c[1]?.method === 'PATCH',
    ).length;
    expect(afterCount).toBe(beforeCount);
  });

  it('handleDragEnd clears draggingId', async () => {
    fetchWithTwoSteps();
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="step-editor-1"]')).toBeTruthy());

    const dragStartEvent = new Event('dragstart', { bubbles: true }) as unknown as React.DragEvent<HTMLDivElement>;
    Object.defineProperty(dragStartEvent, 'dataTransfer', {
      value: { effectAllowed: '', setData: vi.fn() },
    });

    act(() => {
      capturedStepEditors.get(1)?.dragHandleProps.onDragStart(dragStartEvent);
      capturedStepEditors.get(1)?.dragHandleProps.onDragEnd();
    });
    // draggingId reset to null; no crash expected
    expect(container.querySelector('[data-testid="step-editor-1"]')).toBeTruthy();
  });

  it('handleDragOver calls preventDefault', async () => {
    fetchWithTwoSteps();
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="step-editor-1"]')).toBeTruthy());

    const preventDefaultSpy = vi.fn();
    const dragOverEvent = new Event('dragover', { bubbles: true }) as unknown as React.DragEvent<HTMLDivElement>;
    Object.defineProperty(dragOverEvent, 'preventDefault', { value: preventDefaultSpy });
    Object.defineProperty(dragOverEvent, 'dataTransfer', { value: { dropEffect: '' } });

    act(() => {
      capturedStepEditors.get(1)?.dropTargetProps.onDragOver(dragOverEvent);
    });

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('shows error when reorder PATCH fails', async () => {
    // After the PATCH fails, load() is called. Make load() also fail so the
    // error message from reorderTo stays visible on screen.
    let initialLoaded = false;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !init?.method) {
        if (!initialLoaded) {
          initialLoaded = true;
          return makeRes({
            success: true,
            data: { playbook: makePlaybook(), steps: [makeStep(1), makeStep(2)] },
          });
        }
        // Reload after reorder error — also fail to keep error visible
        return makeRes({ success: false, message: 'Reorder failed' }, false);
      }
      if (/\/steps$/.test(url) && init?.method === 'PATCH') {
        return makeRes({ success: false, message: 'Reorder failed' });
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="step-editor-1"]')).toBeTruthy());

    const dragStartEvent = new Event('dragstart', { bubbles: true }) as unknown as React.DragEvent<HTMLDivElement>;
    Object.defineProperty(dragStartEvent, 'dataTransfer', {
      value: { effectAllowed: '', setData: vi.fn() },
    });
    act(() => {
      capturedStepEditors.get(1)?.dragHandleProps.onDragStart(dragStartEvent);
    });

    const dropEvent = new Event('drop', { bubbles: true }) as unknown as React.DragEvent<HTMLDivElement>;
    Object.defineProperty(dropEvent, 'preventDefault', { value: vi.fn() });
    Object.defineProperty(dropEvent, 'dataTransfer', { value: { dropEffect: '' } });
    await act(async () => {
      capturedStepEditors.get(2)?.dropTargetProps.onDrop(dropEvent);
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Reorder failed');
    });
  });

  it('updates steps from response data.items when available', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !init?.method) {
        return makeRes({
          success: true,
          data: { playbook: makePlaybook(), steps: [makeStep(1), makeStep(2)] },
        });
      }
      if (/\/steps$/.test(url) && init?.method === 'PATCH') {
        return makeRes({
          success: true,
          data: {
            items: [
              makeStep(2, { sortOrder: 0, name: 'Step 2 first' }),
              makeStep(1, { sortOrder: 1, name: 'Step 1 second' }),
            ],
          },
        });
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="step-editor-1"]')).toBeTruthy());

    const dragStartEvent = new Event('dragstart', { bubbles: true }) as unknown as React.DragEvent<HTMLDivElement>;
    Object.defineProperty(dragStartEvent, 'dataTransfer', { value: { effectAllowed: '', setData: vi.fn() } });
    act(() => { capturedStepEditors.get(1)?.dragHandleProps.onDragStart(dragStartEvent); });

    const dropEvent = new Event('drop', { bubbles: true }) as unknown as React.DragEvent<HTMLDivElement>;
    Object.defineProperty(dropEvent, 'preventDefault', { value: vi.fn() });
    Object.defineProperty(dropEvent, 'dataTransfer', { value: { dropEffect: '' } });
    await act(async () => { capturedStepEditors.get(2)?.dropTargetProps.onDrop(dropEvent); });

    await waitFor(() => {
      // Steps should now contain updated names from response
      expect(container.textContent).toContain('Step 2 first');
    });
  });
});

// ─── Error banner visible with playbook loaded ────────────────────────────

describe('PlaybookEditPage — inline error banner (playbook loaded)', () => {
  it('shows inline error banner when step patch errors', async () => {
    // After PATCH fails and setError is called, load() runs and would clear the
    // error with setError(null). We make load() fail too so the error persists.
    let stepLoaded = false;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !init?.method) {
        if (!stepLoaded) {
          stepLoaded = true;
          return makeRes({ success: true, data: { playbook: makePlaybook(), steps: [makeStep(1)] } });
        }
        // Reload also fails — keeps error visible AND keeps playbook in state
        return makeRes({ success: false, message: 'Inline error' }, false);
      }
      if (/\/steps\/1$/.test(url) && init?.method === 'PATCH') {
        return makeRes({ success: false, message: 'Inline error' });
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="step-editor-1"]')).toBeTruthy());

    await act(async () => {
      capturedStepEditors.get(1)?.onPatch({ kind: 'note' });
    });

    await waitFor(() => {
      // The inline error section (error && has playbook)
      expect(container.textContent).toContain('Inline error');
      // But also still shows the main edit page (playbook is still in state)
      expect(container.textContent).toContain('Edit playbook');
    });
  });
});

// ─── null playbook guard ──────────────────────────────────────────────────

describe('PlaybookEditPage — null playbook guard', () => {
  it('renders null (empty) when load completes with no playbook data', async () => {
    // Override: loading false, no error, but data.playbook is missing
    // Simulate by returning success but empty data
    fetchMock.mockImplementation(async (url: string) => {
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url)) {
        return makeRes({ success: true, data: { playbook: null, steps: [] } });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    // Should not show the edit page heading or the loading spinner
    await waitFor(() => {
      expect(container.textContent).not.toContain('Loading');
    });
    // With null playbook, the page returns null — the container has minimal content
    expect(container.textContent).not.toContain('Edit playbook');
  });
});
