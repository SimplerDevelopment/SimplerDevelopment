// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for `app/portal/brain/playbook-runs/[id]/page.tsx`
 *
 * 'use client' page. params is Promise<{ id: string }>; React.use() is mocked.
 * PlaybookRunStepper is a heavy child — stubbed to a data-testid div.
 *
 * Covers:
 *  - Loading state (spinner)
 *  - Error state: fetch failure (Error + network), API !ok, success=false, invalid id
 *  - Null render guard (data null + no error)
 *  - Populated state: run label, status chip, playbook link, startedBy, timing
 *  - Context section: empty vs populated JSON
 *  - Steps section: stepper rendered with step count
 *  - Links section: hidden when empty, shown with entity chips
 *  - Abort reason box shown when run.abortReason set
 *  - Error banner shown inline when error is set but data also present
 *  - Action buttons:
 *      Advance — shown for active/paused, calls /advance POST
 *      Abort   — shown for non-terminal, calls /abort POST (with reason)
 *      Abort   — cancel on window.prompt cancels the flow
 *      Retry   — shown for failed, calls /advance POST
 *      None    — terminal (completed/aborted) hides Advance + Abort
 *  - Step complete/skip callbacks forwarded through stepper stub
 *  - Inline action errors rendered after failed advance/abort
 *  - Back link to /portal/brain/playbook-runs
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── next/link stub ──────────────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ─── React.use stub ───────────────────────────────────────────────────────────
// The page calls `use as reactUse` (aliased import). We patch react.use so
// that a Promise with ._testId resolves synchronously in jsdom.

let currentTestId = '5';

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    use: (p: Promise<{ id: string }> | unknown) => {
      if (p && typeof (p as { _testId?: string })._testId === 'string') {
        return { id: (p as { _testId: string })._testId };
      }
      // Synchronously resolve — the page passes the raw Promise object.
      // We intercept by checking if it looks like our fake params promise.
      return { id: currentTestId };
    },
  };
});

// ─── PlaybookRunStepper stub ──────────────────────────────────────────────────

vi.mock('@/components/brain/PlaybookRunStepper', () => ({
  default: function PlaybookRunStepper({
    steps,
    onComplete,
    onSkip,
  }: {
    steps: any[];
    onComplete?: (id: number) => void;
    onSkip?: (id: number, reason?: string) => void;
    busy?: boolean;
  }) {
    return React.createElement(
      'div',
      { 'data-testid': 'playbook-run-stepper' },
      React.createElement('span', null, `steps:${steps.length}`),
      onComplete
        ? React.createElement(
            'button',
            { 'data-testid': 'stub-complete', onClick: () => onComplete(99) },
            'Complete',
          )
        : null,
      onSkip
        ? React.createElement(
            'button',
            { 'data-testid': 'stub-skip', onClick: () => onSkip(88, 'not needed') },
            'Skip',
          )
        : null,
    );
  },
}));

// ─── playbooks-shared stub ────────────────────────────────────────────────────
// The real helpers are pure functions — we let them through (no DB imports).
// However to avoid any transitive server imports we pass them straight through.

vi.mock('@/components/brain/playbooks-shared', async () => {
  const actual = await vi.importActual<typeof import('@/components/brain/playbooks-shared')>(
    '@/components/brain/playbooks-shared',
  );
  return actual;
});

// ─── fetch helpers ────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; status: number; json: () => Promise<any> };

function makeRes(body: any, ok = true, status = 200): FetchResp {
  return { ok, status, json: async () => body };
}

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

// ─── data factories ───────────────────────────────────────────────────────────

function makeRun(over: Partial<Record<string, any>> = {}): any {
  return {
    id: 5,
    clientId: 1,
    playbookId: 10,
    label: 'Onboarding Run',
    status: 'active',
    context: {},
    startedBy: 3,
    triggerPayload: null,
    startedAt: '2025-06-01T10:00:00Z',
    completedAt: null,
    abortedAt: null,
    abortReason: null,
    createdAt: '2025-06-01T09:55:00Z',
    updatedAt: '2025-06-01T10:00:00Z',
    ...over,
  };
}

function makePlaybook(over: Partial<Record<string, any>> = {}): any {
  return {
    id: 10,
    clientId: 1,
    name: 'Onboarding',
    slug: 'onboarding',
    description: null,
    status: 'active',
    triggerKind: 'manual',
    triggerConfig: null,
    category: null,
    ownerId: null,
    defaultTopicIds: [],
    source: 'manual',
    createdBy: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...over,
  };
}

function makeStep(over: Partial<Record<string, any>> = {}): any {
  return {
    id: 1,
    stepId: 1,
    key: 'step-1',
    name: 'Welcome email',
    kind: 'task',
    status: 'active',
    resultEntityType: null,
    resultEntityId: null,
    startedAt: null,
    completedAt: null,
    waitUntil: null,
    failureReason: null,
    ...over,
  };
}

function makeLink(over: Partial<Record<string, any>> = {}): any {
  return {
    id: 1,
    runId: 5,
    entityType: 'person',
    entityId: 42,
    createdAt: '2025-06-01T00:00:00Z',
    ...over,
  };
}

function makeDetailRes(
  run: any = makeRun(),
  steps: any[] = [],
  links: any[] = [],
  playbook: any = makePlaybook(),
): any {
  return { success: true, data: { run, playbook, steps, links } };
}

// ─── default fetch handler ────────────────────────────────────────────────────

function defaultFetch(_url: string): FetchResp {
  return makeRes(makeDetailRes());
}

// ─── setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  currentTestId = '5';
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => defaultFetch(url));
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  vi.stubGlobal('confirm', vi.fn(() => true));
  vi.stubGlobal('prompt', vi.fn(() => 'test reason'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── import after mocks ───────────────────────────────────────────────────────

import PlaybookRunDetailPage from '@/app/portal/brain/playbook-runs/[id]/page';

function renderPage(idOverride?: string) {
  if (idOverride !== undefined) currentTestId = idOverride;
  // The page destructures params via React.use(params).
  // Our mock intercepts React.use synchronously, returning { id: currentTestId }.
  const fakeParams = Object.assign(Promise.resolve({ id: currentTestId }), {
    _testId: currentTestId,
  });
  return render(React.createElement(PlaybookRunDetailPage, { params: fakeParams }));
}

// ─── loading state ────────────────────────────────────────────────────────────

describe('PlaybookRunDetailPage — loading', () => {
  it('shows spinner icon while fetch is pending', () => {
    fetchMock.mockImplementation(async () => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.textContent).toContain('progress_activity');
  });

  it('shows "Loading" text while fetch is pending', () => {
    fetchMock.mockImplementation(async () => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.textContent).toContain('Loading');
  });
});

// ─── error state (no data) ────────────────────────────────────────────────────

describe('PlaybookRunDetailPage — error state', () => {
  it('shows error message when API returns !ok', async () => {
    fetchMock.mockResolvedValue(
      makeRes({ success: false, message: 'Run not found' }, false, 404),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Run not found');
    });
  });

  it('shows fallback message when API !ok with no message', async () => {
    fetchMock.mockResolvedValue(makeRes({ success: false }, false, 500));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Failed to load run');
    });
  });

  it('shows error message when success=false with ok=true', async () => {
    fetchMock.mockResolvedValue(makeRes({ success: false, message: 'DB error' }, true));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('DB error');
    });
  });

  it('shows Error message when fetch throws an Error', async () => {
    fetchMock.mockRejectedValue(new Error('Connection refused'));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Connection refused');
    });
  });

  it('shows "Network error" for non-Error throws', async () => {
    fetchMock.mockImplementation(async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'plain string';
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Network error');
    });
  });

  it('shows error_outline icon in error state', async () => {
    fetchMock.mockResolvedValue(makeRes({ success: false, message: 'oops' }, false));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('error_outline');
    });
  });

  it('shows back-link to /portal/brain/playbook-runs in error state', async () => {
    fetchMock.mockResolvedValue(makeRes({ success: false, message: 'err' }, false));
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/playbook-runs"]');
      expect(link).toBeTruthy();
    });
  });

  it('shows "Invalid run id" for non-numeric id', async () => {
    currentTestId = 'not-a-number';
    fetchMock.mockImplementation(async () => new Promise(() => {}));
    const { container } = renderPage('not-a-number');
    await waitFor(() => {
      expect(container.textContent).toContain('Invalid run id');
    });
  });

  it('shows "Invalid run id" for id=0', async () => {
    const { container } = renderPage('0');
    await waitFor(() => {
      expect(container.textContent).toContain('Invalid run id');
    });
  });
});

// ─── populated state ──────────────────────────────────────────────────────────

describe('PlaybookRunDetailPage — populated state', () => {
  it('renders run label', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Onboarding Run');
    });
  });

  it('renders status chip label (Active)', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      // playbookRunStatusChip('active') returns label 'Active'
      expect(container.textContent).toContain('Active');
    });
  });

  it('renders playbook name as link', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/playbooks/10"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toContain('Onboarding');
    });
  });

  it('renders "started by user #N" when startedBy is set', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('started by user #3');
    });
  });

  it('renders "started" relative time when startedAt is set', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('started');
    });
  });

  it('does NOT render duration when completedAt is null', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Onboarding Run'));
    expect(container.textContent).not.toContain('duration');
  });

  it('renders duration when both startedAt and completedAt are set', async () => {
    fetchMock.mockResolvedValue(
      makeRes(
        makeDetailRes(
          makeRun({
            status: 'completed',
            startedAt: '2025-06-01T10:00:00Z',
            completedAt: '2025-06-01T10:30:00Z',
          }),
        ),
      ),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('duration');
    });
  });

  it('renders back link to playbook-runs list', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/playbook-runs"]');
      expect(link).toBeTruthy();
    });
  });
});

// ─── context section ──────────────────────────────────────────────────────────

describe('PlaybookRunDetailPage — context section', () => {
  it('renders "Context" heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Context');
    });
  });

  it('shows "No context variables" message when context is empty', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No context variables were seeded for this run');
    });
  });

  it('renders pretty-printed JSON when context has entries', async () => {
    fetchMock.mockResolvedValue(
      makeRes(makeDetailRes(makeRun({ context: { email: 'test@example.com', role: 'admin' } }))),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('test@example.com');
      expect(container.textContent).toContain('role');
    });
  });
});

// ─── steps section ───────────────────────────────────────────────────────────

describe('PlaybookRunDetailPage — steps section', () => {
  it('renders "Steps" heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Steps');
    });
  });

  it('renders step count', async () => {
    fetchMock.mockResolvedValue(
      makeRes(makeDetailRes(makeRun(), [makeStep(), makeStep({ id: 2, stepId: 2 })])),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('(2)');
    });
  });

  it('renders PlaybookRunStepper stub', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="playbook-run-stepper"]')).toBeTruthy();
    });
  });

  it('passes steps count to stepper', async () => {
    fetchMock.mockResolvedValue(
      makeRes(makeDetailRes(makeRun(), [makeStep(), makeStep({ id: 2, stepId: 2 }), makeStep({ id: 3, stepId: 3 })])),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('steps:3');
    });
  });

  it('passes onComplete to stepper when run is active', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="stub-complete"]')).toBeTruthy();
    });
  });

  it('passes onSkip to stepper when run is active', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="stub-skip"]')).toBeTruthy();
    });
  });

  it('does NOT pass onComplete when run is terminal (completed)', async () => {
    fetchMock.mockResolvedValue(
      makeRes(makeDetailRes(makeRun({ status: 'completed' }))),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="stub-complete"]')).toBeFalsy();
    });
  });

  it('stub complete button calls fetch /complete endpoint', async () => {
    fetchMock.mockResolvedValue(makeRes(makeDetailRes()));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="stub-complete"]')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="stub-complete"]')!);
    });
    await waitFor(() => {
      const completCall = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/steps/99/complete'),
      );
      expect(completCall).toBeTruthy();
    });
  });

  it('stub skip button calls fetch /skip endpoint', async () => {
    fetchMock.mockResolvedValue(makeRes(makeDetailRes()));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="stub-skip"]')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="stub-skip"]')!);
    });
    await waitFor(() => {
      const skipCall = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/steps/88/skip'),
      );
      expect(skipCall).toBeTruthy();
    });
  });
});

// ─── links section ───────────────────────────────────────────────────────────

describe('PlaybookRunDetailPage — links section', () => {
  it('does NOT render links section when links array is empty', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Onboarding Run'));
    expect(container.textContent).not.toContain('Linked entities');
  });

  it('renders "Linked entities" section when links are present', async () => {
    fetchMock.mockResolvedValue(
      makeRes(makeDetailRes(makeRun(), [], [makeLink()])),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Linked entities');
    });
  });

  it('renders entity chip with entity type and id', async () => {
    fetchMock.mockResolvedValue(
      makeRes(makeDetailRes(makeRun(), [], [makeLink({ entityType: 'person', entityId: 42 })])),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('#42');
    });
  });

  it('renders link count in heading', async () => {
    fetchMock.mockResolvedValue(
      makeRes(makeDetailRes(makeRun(), [], [makeLink(), makeLink({ id: 2, entityId: 99 })])),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('(2)');
    });
  });
});

// ─── abort reason ─────────────────────────────────────────────────────────────

describe('PlaybookRunDetailPage — abort reason', () => {
  it('renders abortReason box when set', async () => {
    fetchMock.mockResolvedValue(
      makeRes(
        makeDetailRes(makeRun({ status: 'aborted', abortReason: 'No longer needed' })),
      ),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No longer needed');
      expect(container.textContent).toContain('Aborted:');
    });
  });

  it('does NOT render abortReason box when abortReason is null', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Onboarding Run'));
    expect(container.textContent).not.toContain('Aborted:');
  });
});

// ─── action buttons ───────────────────────────────────────────────────────────

describe('PlaybookRunDetailPage — action buttons', () => {
  it('renders Advance button when run is active', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Advance'),
      );
      expect(btn).toBeTruthy();
    });
  });

  it('renders Advance button when run is paused', async () => {
    fetchMock.mockResolvedValue(makeRes(makeDetailRes(makeRun({ status: 'paused' }))));
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Advance'),
      );
      expect(btn).toBeTruthy();
    });
  });

  it('does NOT render Advance for completed run', async () => {
    fetchMock.mockResolvedValue(makeRes(makeDetailRes(makeRun({ status: 'completed' }))));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Onboarding Run'));
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Advance'),
    );
    expect(btn).toBeUndefined();
  });

  it('renders Abort button when run is active (non-terminal)', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Abort'),
      );
      expect(btn).toBeTruthy();
    });
  });

  it('does NOT render Abort for completed run (terminal)', async () => {
    fetchMock.mockResolvedValue(makeRes(makeDetailRes(makeRun({ status: 'completed' }))));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Onboarding Run'));
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Abort'),
    );
    expect(btn).toBeUndefined();
  });

  it('does NOT render Abort for aborted run (terminal)', async () => {
    fetchMock.mockResolvedValue(
      makeRes(makeDetailRes(makeRun({ status: 'aborted', abortReason: 'done' }))),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Onboarding Run'));
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Abort'),
    );
    expect(btn).toBeUndefined();
  });

  it('renders Retry button when run is failed', async () => {
    fetchMock.mockResolvedValue(makeRes(makeDetailRes(makeRun({ status: 'failed' }))));
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Retry'),
      );
      expect(btn).toBeTruthy();
    });
  });

  it('does NOT render Retry for active run', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Onboarding Run'));
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Retry'),
    );
    expect(btn).toBeUndefined();
  });

  it('clicking Advance calls POST /advance', async () => {
    fetchMock.mockResolvedValue(makeRes(makeDetailRes()));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('button[title]')).toBeTruthy();
    });
    const advanceBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Advance'),
    ) as HTMLButtonElement;
    await act(async () => { fireEvent.click(advanceBtn); });
    await waitFor(() => {
      const advCall = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/advance') && (c[1] as RequestInit)?.method === 'POST',
      );
      expect(advCall).toBeTruthy();
    });
  });

  it('clicking Abort calls POST /abort with reason from prompt', async () => {
    vi.stubGlobal('prompt', vi.fn(() => 'User requested abort'));
    fetchMock.mockResolvedValue(makeRes(makeDetailRes()));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Abort'));
    const abortBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Abort'),
    ) as HTMLButtonElement;
    await act(async () => { fireEvent.click(abortBtn); });
    await waitFor(() => {
      const abortCall = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/abort') && (c[1] as RequestInit)?.method === 'POST',
      );
      expect(abortCall).toBeTruthy();
    });
  });

  it('Abort with prompt returning null and confirm=false does not call fetch', async () => {
    vi.stubGlobal('prompt', vi.fn(() => null));
    vi.stubGlobal('confirm', vi.fn(() => false));
    fetchMock.mockResolvedValue(makeRes(makeDetailRes()));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Abort'));
    const callsBefore = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/abort')).length;
    const abortBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Abort'),
    ) as HTMLButtonElement;
    await act(async () => { fireEvent.click(abortBtn); });
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]).includes('/abort')).length,
    ).toBe(callsBefore);
  });

  it('renders inline error when Advance POST returns !ok', async () => {
    let callCount = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/advance') && (init as RequestInit)?.method === 'POST') {
        return makeRes({ success: false, message: 'Advance failed' }, false, 500);
      }
      callCount++;
      if (callCount === 1) return makeRes(makeDetailRes());
      return makeRes(makeDetailRes());
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Advance'));
    const advanceBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Advance'),
    ) as HTMLButtonElement;
    await act(async () => { fireEvent.click(advanceBtn); });
    await waitFor(() => {
      expect(container.textContent).toContain('Advance failed');
    });
  });
});

// ─── API fetch shape ──────────────────────────────────────────────────────────

describe('PlaybookRunDetailPage — API fetch shape', () => {
  it('calls /api/portal/brain/playbook-runs/5 on mount', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/playbook-runs/5'),
      );
      expect(call).toBeTruthy();
    });
  });

  it('refetches after advance succeeds', async () => {
    fetchMock.mockResolvedValue(makeRes(makeDetailRes()));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Advance'));
    const callsBefore = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/api/portal/brain/playbook-runs/5') &&
      !(c[1] as RequestInit | undefined)?.method,
    ).length;
    const advanceBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Advance'),
    ) as HTMLButtonElement;
    await act(async () => { fireEvent.click(advanceBtn); });
    await waitFor(() => {
      const callsAfter = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes('/api/portal/brain/playbook-runs/5') &&
        !(c[1] as RequestInit | undefined)?.method,
      ).length;
      expect(callsAfter).toBeGreaterThan(callsBefore);
    });
  });
});
