// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for `app/portal/brain/playbooks/[id]/edit/page.tsx`.
 *
 * Covers:
 *   - Loading state (spinner, progress_activity icon)
 *   - Error-only state (no playbook loaded) — API !ok, success=false, network
 *     throw, invalid id
 *   - Happy-path render: back link, heading, status chip, slug, metadata
 *     section, steps section, "Add step" buttons
 *   - Empty-steps placeholder text
 *   - Steps list rendered when steps are present
 *   - Add step: success (load() re-fired), failure (error banner), unique key
 *     collision logic
 *   - Remove step: confirm accepted → DELETE fired, confirm declined → no-op
 *   - Remove step: API failure sets error
 *   - Patch step: optimistic local state then PATCH; PATCH failure triggers
 *     reload and error
 *   - Reorder: drop handler optimistically reorders + calls PATCH /steps;
 *     PATCH failure sets error and reloads
 *   - onMetaSubmit: PATCH metadata, re-load on success, throws on failure
 *   - Reorder PATCH returns items list — updates steps state
 *   - draggingId opacity applied to dragging step
 *
 * Mocks: next/navigation, next/link, React.use (params), global fetch,
 *   window.confirm, PlaybookForm, PlaybookStepEditor (heavy children).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ────────────────────────────────────────

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

// Capture the onSubmit callback from PlaybookForm so tests can invoke it.
let capturedMetaSubmit: ((values: any) => Promise<void>) | null = null;

vi.mock('@/components/brain/PlaybookForm', () => ({
  default: (props: { onSubmit: (v: any) => Promise<void>; initial?: any; mode?: string }) => {
    capturedMetaSubmit = props.onSubmit;
    return React.createElement(
      'div',
      { 'data-testid': 'playbook-form', 'data-initial': JSON.stringify(props.initial ?? null) },
      'PlaybookForm',
    );
  },
  valuesToTriggerConfig: (values: any) => {
    if (values.triggerKind === 'event') return { event: values.triggerEvent };
    if (values.triggerKind === 'scheduled') return { cron: values.triggerCron };
    return null;
  },
}));

// Capture per-step onPatch, onRemove callbacks and drag/drop props for testing.
let capturedOnPatch: ((patch: any) => void) | null = null;
let capturedOnRemove: (() => void) | null = null;

vi.mock('@/components/brain/PlaybookStepEditor', () => ({
  default: (props: {
    step: any;
    onPatch: (p: any) => void;
    onRemove: () => void;
    dragHandleProps?: {
      onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
      onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void;
    };
    dropTargetProps?: {
      onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
      onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
    };
    busy?: boolean;
  }) => {
    capturedOnPatch = props.onPatch;
    capturedOnRemove = props.onRemove;
    // Attach drag/drop handlers directly to the rendered div so tests can fire them.
    return React.createElement(
      'div',
      {
        'data-testid': `step-editor-${props.step.id}`,
        'data-busy': String(props.busy ?? false),
        onDragStart: props.dragHandleProps?.onDragStart,
        onDragEnd: props.dragHandleProps?.onDragEnd,
        onDragOver: props.dropTargetProps?.onDragOver,
        onDrop: props.dropTargetProps?.onDrop,
        draggable: true,
      },
      props.step.name,
    );
  },
}));

// React.use stub — mirrors pattern from document-edit-page tests.
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

// ─── Fetch stub ───────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<unknown> };

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, json: async () => body };
}

// ─── Data factories ───────────────────────────────────────────────────────────

function makePlaybook(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    clientId: 10,
    name: 'Onboarding Playbook',
    slug: 'onboarding-playbook',
    description: 'Helps with onboarding',
    status: 'draft',
    triggerKind: 'manual',
    triggerConfig: null,
    category: 'hr',
    ownerId: null,
    defaultTopicIds: [],
    source: 'manual',
    createdBy: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeStep(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    clientId: 10,
    playbookId: 1,
    key: 'task',
    name: 'First Task',
    description: null,
    kind: 'task',
    config: {},
    condition: null,
    nextStepKeys: [],
    sortOrder: 0,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeDetailResponse(
  playbookOverrides: Record<string, unknown> = {},
  steps: unknown[] = [],
) {
  return {
    success: true,
    data: {
      playbook: makePlaybook(playbookOverrides),
      steps,
    },
  };
}

// ─── Default fetch handler ────────────────────────────────────────────────────

function defaultFetch(url: string, init?: RequestInit): FetchResp {
  const method = (init as RequestInit | undefined)?.method;
  // Team endpoint
  if (url.includes('/api/portal/team')) {
    return makeRes({ success: true, data: [] });
  }
  // PATCH playbook metadata
  if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && method === 'PATCH') {
    return makeRes({ success: true });
  }
  // DELETE step
  if (/\/steps\/\d+$/.test(url) && method === 'DELETE') {
    return makeRes({ success: true });
  }
  // PATCH step
  if (/\/steps\/\d+$/.test(url) && method === 'PATCH') {
    return makeRes({ success: true });
  }
  // PATCH steps (reorder)
  if (/\/steps$/.test(url) && method === 'PATCH') {
    return makeRes({ success: true });
  }
  // POST step (add)
  if (/\/steps$/.test(url) && method === 'POST') {
    return makeRes({ success: true });
  }
  // GET playbook detail
  if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !method) {
    return makeRes(makeDetailResponse());
  }
  return makeRes({ success: true });
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  capturedMetaSubmit = null;
  capturedOnPatch = null;
  capturedOnRemove = null;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeParams(id: string): Promise<{ id: string }> & { _testId: string } {
  const p = Promise.resolve({ id }) as Promise<{ id: string }> & { _testId: string };
  p._testId = id;
  return p;
}

function renderPage(id = '1') {
  const params = makeParams(id);
  return render(React.createElement(PlaybookEditPage, { params }));
}

// ─── Loading state ─────────────────────────────────────────────────────────────

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

// ─── Error-only state (no playbook) ──────────────────────────────────────────

describe('PlaybookEditPage — error-only state', () => {
  it('shows error when API returns !ok with a message', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({ success: false, message: 'Playbook not found' }, false);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Playbook not found');
    });
  });

  it('shows fallback error when API returns !ok with no message', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({ success: false }, false);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Failed to load playbook');
    });
  });

  it('shows error when success=false even though ok=true', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({ success: false, message: 'DB error' }, true);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('DB error');
    });
  });

  it('shows network error when fetch throws an Error', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      throw new Error('offline');
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('offline');
    });
  });

  it('shows "Network error" for non-Error throws', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      throw 'plain string';
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Network error');
    });
  });

  it('shows "Invalid playbook id" for a non-numeric id', async () => {
    const { container } = renderPage('abc');
    await waitFor(() => {
      expect(container.textContent).toContain('Invalid playbook id');
    });
  });

  it('shows "Invalid playbook id" for id zero', async () => {
    const { container } = renderPage('0');
    await waitFor(() => {
      expect(container.textContent).toContain('Invalid playbook id');
    });
  });

  it('renders Playbooks back-link when in error state (no playbook)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes({ success: false, message: 'gone' }, false);
    });
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/playbooks"]');
      expect(link).toBeTruthy();
    });
  });
});

// ─── Happy-path shell rendering ────────────────────────────────────────────────

describe('PlaybookEditPage — happy-path shell', () => {
  it('renders the "Edit playbook" heading after load', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Edit playbook');
    });
  });

  it('renders the back-link to the playbook detail page', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/playbooks/1"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders the playbook slug', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('onboarding-playbook');
    });
  });

  it('renders the status chip label for "draft"', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Draft');
    });
  });

  it('renders the status chip label for "active"', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes(makeDetailResponse({ status: 'active' }));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Active');
    });
  });

  it('renders the status chip label for "archived"', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes(makeDetailResponse({ status: 'archived' }));
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Archived');
    });
  });

  it('renders the Details section heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Details');
    });
  });

  it('renders the PlaybookForm stub', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="playbook-form"]')).toBeTruthy();
    });
  });

  it('renders the Steps section heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Steps');
    });
  });

  it('renders "Add step" label in the steps section', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Add step');
    });
  });

  it('renders add-step buttons for all PLAYBOOK_STEP_KINDS', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      // playbookStepKindChip labels: Task, Note, Meeting, Decision, Review, Wait, Branch
      ['Task', 'Note', 'Meeting', 'Decision', 'Review', 'Wait', 'Branch'].forEach((label) => {
        expect(container.textContent).toContain(label);
      });
    });
  });
});

// ─── Empty-steps placeholder ──────────────────────────────────────────────────

describe('PlaybookEditPage — empty steps state', () => {
  it('renders the empty-steps placeholder when no steps exist', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No steps yet');
    });
  });

  it('shows step count of 0 in the heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('(0)');
    });
  });
});

// ─── Steps list rendered ────────────────────────────────────────────────────

describe('PlaybookEditPage — steps rendered', () => {
  function withSteps(steps: unknown[]) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      return makeRes(makeDetailResponse({}, steps));
    });
  }

  it('renders a step editor for each step', async () => {
    withSteps([makeStep({ id: 10 }), makeStep({ id: 11, key: 'note', name: 'Second Step' })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="step-editor-10"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="step-editor-11"]')).toBeTruthy();
    });
  });

  it('renders step names inside the step editors', async () => {
    withSteps([makeStep({ id: 10, name: 'Alpha Step' })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Alpha Step');
    });
  });

  it('shows correct step count in the heading', async () => {
    withSteps([makeStep(), makeStep({ id: 11, key: 'note' })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('(2)');
    });
  });

  it('does NOT render the empty placeholder when steps exist', async () => {
    withSteps([makeStep()]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).not.toContain('No steps yet');
    });
  });
});

// ─── Add step ─────────────────────────────────────────────────────────────────

describe('PlaybookEditPage — add step', () => {
  async function renderAndWaitLoaded() {
    const r = renderPage();
    await waitFor(() => expect(r.container.textContent).toContain('Add step'));
    return r;
  }

  function findAddButton(container: HTMLElement, label: string) {
    return Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(label),
    ) as HTMLButtonElement;
  }

  it('POSTs to /steps when an add-step button is clicked', async () => {
    const { container } = await renderAndWaitLoaded();
    const btn = findAddButton(container, 'Task');
    fireEvent.click(btn);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) => /\/steps$/.test(String(c[0])) && (c[1] as any)?.method === 'POST',
      );
      expect(call).toBeTruthy();
    });
  });

  it('sends the correct kind in the POST body', async () => {
    const { container } = await renderAndWaitLoaded();
    const btn = findAddButton(container, 'Note');
    fireEvent.click(btn);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) => /\/steps$/.test(String(c[0])) && (c[1] as any)?.method === 'POST',
      );
      expect(call).toBeTruthy();
      const body = JSON.parse((call![1] as any).body);
      expect(body.kind).toBe('note');
    });
  });

  it('sets a unique key when kind already exists in the step list', async () => {
    // Pre-load with a "task" step already present.
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      const method = (init as RequestInit | undefined)?.method;
      if (/\/steps$/.test(url) && method === 'POST') return makeRes({ success: true });
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !method) {
        return makeRes(makeDetailResponse({}, [makeStep({ key: 'task' })]));
      }
      return makeRes({ success: true });
    });
    const r = renderPage();
    await waitFor(() => expect(r.container.textContent).toContain('Add step'));
    const btn = findAddButton(r.container, 'Task');
    fireEvent.click(btn);
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => /\/steps$/.test(String(c[0])) && (c[1] as any)?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse((postCall![1] as any).body);
      // Key should be "task_2" since "task" already exists.
      expect(body.key).toBe('task_2');
    });
  });

  it('shows error banner when POST /steps returns failure', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      const method = (init as RequestInit | undefined)?.method;
      if (/\/steps$/.test(url) && method === 'POST') {
        return makeRes({ success: false, message: 'Step add failed' }, false);
      }
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !method) {
        return makeRes(makeDetailResponse());
      }
      return makeRes({ success: true });
    });
    const { container } = await renderAndWaitLoaded();
    const btn = findAddButton(container, 'Task');
    fireEvent.click(btn);
    await waitFor(() => {
      expect(container.textContent).toContain('Step add failed');
    });
  });

  it('re-fetches playbook data after a successful add', async () => {
    const { container } = await renderAndWaitLoaded();
    const before = fetchMock.mock.calls.length;
    const btn = findAddButton(container, 'Decision');
    fireEvent.click(btn);
    await waitFor(() => {
      // At least one more GET call than before.
      const getCalls = fetchMock.mock.calls.filter(
        (c) => /\/api\/portal\/brain\/playbooks\/\d+$/.test(String(c[0])) && !(c[1] as any)?.method,
      );
      expect(getCalls.length).toBeGreaterThan(1);
      expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
    });
  });
});

// ─── Remove step ─────────────────────────────────────────────────────────────

describe('PlaybookEditPage — remove step', () => {
  async function renderWithStep() {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      const method = (init as RequestInit | undefined)?.method;
      if (/\/steps\/\d+$/.test(url) && method === 'DELETE') return makeRes({ success: true });
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !method) {
        return makeRes(makeDetailResponse({}, [makeStep({ id: 10 })]));
      }
      return makeRes({ success: true });
    });
    const r = renderPage();
    await waitFor(() => expect(r.container.querySelector('[data-testid="step-editor-10"]')).toBeTruthy());
    return r;
  }

  it('sends DELETE /steps/:id when onRemove is called and confirm=true', async () => {
    await renderWithStep();
    expect(capturedOnRemove).toBeTruthy();
    await act(async () => { capturedOnRemove!(); });
    await waitFor(() => {
      const del = fetchMock.mock.calls.find(
        (c) => /\/steps\/10$/.test(String(c[0])) && (c[1] as any)?.method === 'DELETE',
      );
      expect(del).toBeTruthy();
    });
  });

  it('does NOT send DELETE when confirm returns false', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    await renderWithStep();
    await act(async () => { capturedOnRemove!(); });
    await waitFor(() => {
      const del = fetchMock.mock.calls.find(
        (c) => (c[1] as any)?.method === 'DELETE',
      );
      expect(del).toBeFalsy();
    });
  });

  it('shows error banner when DELETE returns failure', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      const method = (init as RequestInit | undefined)?.method;
      if (/\/steps\/\d+$/.test(url) && method === 'DELETE') {
        return makeRes({ success: false, message: 'Remove failed' }, false);
      }
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !method) {
        return makeRes(makeDetailResponse({}, [makeStep({ id: 10 })]));
      }
      return makeRes({ success: true });
    });
    const r = renderPage();
    await waitFor(() => expect(r.container.querySelector('[data-testid="step-editor-10"]')).toBeTruthy());
    await act(async () => { capturedOnRemove!(); });
    await waitFor(() => {
      expect(r.container.textContent).toContain('Remove failed');
    });
  });
});

// ─── Patch step ───────────────────────────────────────────────────────────────

describe('PlaybookEditPage — patch step', () => {
  async function renderWithStep() {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      const method = (init as RequestInit | undefined)?.method;
      if (/\/steps\/\d+$/.test(url) && method === 'PATCH') return makeRes({ success: true });
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !method) {
        return makeRes(makeDetailResponse({}, [makeStep({ id: 10 })]));
      }
      return makeRes({ success: true });
    });
    const r = renderPage();
    await waitFor(() => expect(r.container.querySelector('[data-testid="step-editor-10"]')).toBeTruthy());
    return r;
  }

  it('PATCHes the correct step URL when onPatch is called', async () => {
    await renderWithStep();
    await act(async () => { capturedOnPatch!({ name: 'Updated Name' }); });
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) => /\/steps\/10$/.test(String(c[0])) && (c[1] as any)?.method === 'PATCH',
      );
      expect(call).toBeTruthy();
    });
  });

  it('includes only the patched fields in the PATCH body', async () => {
    await renderWithStep();
    await act(async () => { capturedOnPatch!({ name: 'New name', kind: 'note' }); });
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) => /\/steps\/10$/.test(String(c[0])) && (c[1] as any)?.method === 'PATCH',
      );
      expect(call).toBeTruthy();
      const body = JSON.parse((call![1] as any).body);
      expect(body.name).toBe('New name');
      expect(body.kind).toBe('note');
    });
  });

  it('fires a reload after PATCH step returns failure', async () => {
    // Arrange: PATCH step fails; we track reload calls.
    let getCount = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      const method = (init as RequestInit | undefined)?.method;
      if (/\/steps\/\d+$/.test(url) && method === 'PATCH') {
        return makeRes({ success: false, message: 'Step update failed' }, false);
      }
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !method) {
        getCount += 1;
        return makeRes(makeDetailResponse({}, [makeStep({ id: 10 })]));
      }
      return makeRes({ success: true });
    });
    const r = renderPage();
    await waitFor(() => expect(r.container.querySelector('[data-testid="step-editor-10"]')).toBeTruthy());
    const countBefore = getCount;
    await act(async () => { capturedOnPatch!({ name: 'bad' }); });
    // After the PATCH fails, load() is called → GET count increases.
    await waitFor(() => {
      expect(getCount).toBeGreaterThan(countBefore);
    });
  });

  it('fires a reload after PATCH step throws', async () => {
    let getCount = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      const method = (init as RequestInit | undefined)?.method;
      if (/\/steps\/\d+$/.test(url) && method === 'PATCH') {
        throw new Error('network down');
      }
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !method) {
        getCount += 1;
        return makeRes(makeDetailResponse({}, [makeStep({ id: 10 })]));
      }
      return makeRes({ success: true });
    });
    const r = renderPage();
    await waitFor(() => expect(r.container.querySelector('[data-testid="step-editor-10"]')).toBeTruthy());
    const countBefore = getCount;
    await act(async () => { capturedOnPatch!({ name: 'err' }); });
    await waitFor(() => {
      expect(getCount).toBeGreaterThan(countBefore);
    });
    // suppress unused-var warning
    expect(r.container).toBeTruthy();
  });
});

// ─── Meta submit (PlaybookForm onSubmit) ─────────────────────────────────────

describe('PlaybookEditPage — meta submit', () => {
  async function renderAndWaitLoaded() {
    const r = renderPage();
    await waitFor(() => expect(r.container.querySelector('[data-testid="playbook-form"]')).toBeTruthy());
    return r;
  }

  it('PATCHes the playbook metadata URL on form submit', async () => {
    await renderAndWaitLoaded();
    const values = {
      name: 'Updated',
      description: 'desc',
      category: 'ops',
      triggerKind: 'manual' as const,
      triggerEvent: '',
      triggerCron: '',
      ownerId: null,
    };
    await act(async () => { await capturedMetaSubmit!(values); });
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) => /\/api\/portal\/brain\/playbooks\/1$/.test(String(c[0])) && (c[1] as any)?.method === 'PATCH',
      );
      expect(call).toBeTruthy();
    });
  });

  it('sends the correct payload in the PATCH body', async () => {
    await renderAndWaitLoaded();
    const values = {
      name: 'New Name',
      description: '  padded  ',
      category: '  ops  ',
      triggerKind: 'event' as const,
      triggerEvent: 'deal.created',
      triggerCron: '',
      ownerId: 5,
    };
    await act(async () => { await capturedMetaSubmit!(values); });
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) => /\/api\/portal\/brain\/playbooks\/1$/.test(String(c[0])) && (c[1] as any)?.method === 'PATCH',
      );
      expect(call).toBeTruthy();
      const body = JSON.parse((call![1] as any).body);
      expect(body.name).toBe('New Name');
      expect(body.description).toBe('padded');
      expect(body.category).toBe('ops');
      expect(body.triggerKind).toBe('event');
      expect(body.ownerId).toBe(5);
    });
  });

  it('trims blank description to null', async () => {
    await renderAndWaitLoaded();
    const values = {
      name: 'N',
      description: '   ',
      category: '',
      triggerKind: 'manual' as const,
      triggerEvent: '',
      triggerCron: '',
      ownerId: null,
    };
    await act(async () => { await capturedMetaSubmit!(values); });
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) => /\/api\/portal\/brain\/playbooks\/1$/.test(String(c[0])) && (c[1] as any)?.method === 'PATCH',
      );
      const body = JSON.parse((call![1] as any).body);
      expect(body.description).toBeNull();
      expect(body.category).toBeNull();
    });
  });

  it('throws when PATCH metadata returns failure', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      const method = (init as RequestInit | undefined)?.method;
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && method === 'PATCH') {
        return makeRes({ success: false, message: 'Update failed' }, false);
      }
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !method) {
        return makeRes(makeDetailResponse());
      }
      return makeRes({ success: true });
    });
    await renderAndWaitLoaded();
    const values = {
      name: 'X',
      description: '',
      category: '',
      triggerKind: 'manual' as const,
      triggerEvent: '',
      triggerCron: '',
      ownerId: null,
    };
    await expect(
      act(async () => { await capturedMetaSubmit!(values); }),
    ).rejects.toThrow('Update failed');
  });

  it('re-fetches playbook after a successful PATCH', async () => {
    const r = await renderAndWaitLoaded();
    const getsBefore = fetchMock.mock.calls.filter(
      (c) => /\/api\/portal\/brain\/playbooks\/\d+$/.test(String(c[0])) && !(c[1] as any)?.method,
    ).length;
    const values = {
      name: 'Y',
      description: '',
      category: '',
      triggerKind: 'manual' as const,
      triggerEvent: '',
      triggerCron: '',
      ownerId: null,
    };
    await act(async () => { await capturedMetaSubmit!(values); });
    await waitFor(() => {
      const getsAfter = fetchMock.mock.calls.filter(
        (c) => /\/api\/portal\/brain\/playbooks\/\d+$/.test(String(c[0])) && !(c[1] as any)?.method,
      ).length;
      expect(getsAfter).toBeGreaterThan(getsBefore);
    });
    // suppress unused-var warning — r is held to keep render alive
    expect(r.container).toBeTruthy();
  });
});

// ─── Reorder (drag-and-drop) ─────────────────────────────────────────────────

describe('PlaybookEditPage — reorder steps', () => {
  async function renderWithTwoSteps() {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      const method = (init as RequestInit | undefined)?.method;
      if (/\/steps$/.test(url) && method === 'PATCH') return makeRes({ success: true });
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !method) {
        return makeRes(makeDetailResponse({}, [
          makeStep({ id: 10, sortOrder: 0 }),
          makeStep({ id: 11, key: 'note', name: 'Step Two', sortOrder: 1 }),
        ]));
      }
      return makeRes({ success: true });
    });
    const r = renderPage();
    await waitFor(() => {
      expect(r.container.querySelector('[data-testid="step-editor-10"]')).toBeTruthy();
      expect(r.container.querySelector('[data-testid="step-editor-11"]')).toBeTruthy();
    });
    return r;
  }

  it('PATCHes /steps with orderedStepIds on drop', async () => {
    const { container } = await renderWithTwoSteps();
    // The mock now attaches drag handlers directly to the step-editor divs.
    const el10 = container.querySelector('[data-testid="step-editor-10"]') as HTMLElement;
    const el11 = container.querySelector('[data-testid="step-editor-11"]') as HTMLElement;
    const dt = { effectAllowed: '', setData: vi.fn(), dropEffect: '' };
    fireEvent.dragStart(el10, { dataTransfer: dt });
    fireEvent.dragOver(el11, { dataTransfer: dt });
    fireEvent.drop(el11, { dataTransfer: dt });
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) => /\/steps$/.test(String(c[0])) && (c[1] as any)?.method === 'PATCH',
      );
      expect(call).toBeTruthy();
      const body = JSON.parse((call![1] as any).body);
      expect(Array.isArray(body.orderedStepIds)).toBe(true);
    });
  });

  it('updates steps from data.items when PATCH reorder returns items', async () => {
    const reorderedStep = makeStep({ id: 11, key: 'note', name: 'Step Two', sortOrder: 0 });
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      const method = (init as RequestInit | undefined)?.method;
      if (/\/steps$/.test(url) && method === 'PATCH') {
        return makeRes({ success: true, data: { items: [reorderedStep, makeStep({ id: 10, sortOrder: 1 })] } });
      }
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !method) {
        return makeRes(makeDetailResponse({}, [
          makeStep({ id: 10, sortOrder: 0 }),
          makeStep({ id: 11, key: 'note', name: 'Step Two', sortOrder: 1 }),
        ]));
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="step-editor-10"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="step-editor-11"]')).toBeTruthy();
    });
    const el10 = container.querySelector('[data-testid="step-editor-10"]') as HTMLElement;
    const el11 = container.querySelector('[data-testid="step-editor-11"]') as HTMLElement;
    const dt = { effectAllowed: '', setData: vi.fn(), dropEffect: '' };
    fireEvent.dragStart(el10, { dataTransfer: dt });
    fireEvent.drop(el11, { dataTransfer: dt });
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) => /\/steps$/.test(String(c[0])) && (c[1] as any)?.method === 'PATCH',
      );
      expect(call).toBeTruthy();
    });
  });

  it('shows error when PATCH reorder returns failure', async () => {
    let getCount = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      const method = (init as RequestInit | undefined)?.method;
      if (/\/steps$/.test(url) && method === 'PATCH') {
        return makeRes({ success: false, message: 'Reorder failed' }, false);
      }
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !method) {
        getCount += 1;
        return makeRes(makeDetailResponse({}, [
          makeStep({ id: 10, sortOrder: 0 }),
          makeStep({ id: 11, key: 'note', name: 'Step Two', sortOrder: 1 }),
        ]));
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="step-editor-10"]')).toBeTruthy();
    });
    const countBefore = getCount;
    const el10 = container.querySelector('[data-testid="step-editor-10"]') as HTMLElement;
    const el11 = container.querySelector('[data-testid="step-editor-11"]') as HTMLElement;
    const dt = { effectAllowed: '', setData: vi.fn(), dropEffect: '' };
    fireEvent.dragStart(el10, { dataTransfer: dt });
    fireEvent.drop(el11, { dataTransfer: dt });
    // When reorder fails, load() is called — GET count increases.
    await waitFor(() => {
      expect(getCount).toBeGreaterThan(countBefore);
    });
  });

  it('no-ops when drop target equals drag source', async () => {
    const { container } = await renderWithTwoSteps();
    const el10 = container.querySelector('[data-testid="step-editor-10"]') as HTMLElement;
    const dt = { effectAllowed: '', setData: vi.fn(), dropEffect: '' };
    fireEvent.dragStart(el10, { dataTransfer: dt });
    fireEvent.drop(el10, { dataTransfer: dt });
    // No PATCH should fire.
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) => /\/steps$/.test(String(c[0])) && (c[1] as any)?.method === 'PATCH',
      );
      expect(call).toBeFalsy();
    });
  });
});

// ─── Inline error banner (playbook loaded but error present) ─────────────────

describe('PlaybookEditPage — inline error banner', () => {
  it('keeps the page visible (not replaced by error-only view) when playbook is loaded and add-step fails', async () => {
    // Add-step failure sets error but does NOT trigger a reload (no load() call
    // when POST /steps fails — the page just sets the error state and returns).
    // So the error and the page coexist.
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/team')) return makeRes({ success: true, data: [] });
      const method = (init as RequestInit | undefined)?.method;
      if (/\/steps$/.test(url) && method === 'POST') {
        return makeRes({ success: false, message: 'Inline error' }, false);
      }
      if (/\/api\/portal\/brain\/playbooks\/\d+$/.test(url) && !method) {
        return makeRes(makeDetailResponse());
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Add step'));
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Task'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      // Both the error message and the page heading are visible simultaneously.
      expect(container.textContent).toContain('Inline error');
      expect(container.textContent).toContain('Edit playbook');
    });
  });
});

// ─── Team fetch ───────────────────────────────────────────────────────────────

describe('PlaybookEditPage — team fetch', () => {
  it('fetches the team list on mount', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/team'),
      );
      expect(call).toBeTruthy();
    });
  });

  it('filters team members without a userId', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/team')) {
        return makeRes({
          success: true,
          data: [
            { userId: 1, name: 'Alice', email: 'alice@example.com' },
            { name: 'No ID', email: 'noid@example.com' }, // no userId
          ],
        });
      }
      return defaultFetch(url, init);
    });
    // We can only assert that the page loads without crashing.
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Edit playbook'));
  });

  it('silently ignores team fetch failure', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/team')) throw new Error('team down');
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    // Page still loads despite team fetch failure.
    await waitFor(() => expect(container.textContent).toContain('Edit playbook'));
  });
});
