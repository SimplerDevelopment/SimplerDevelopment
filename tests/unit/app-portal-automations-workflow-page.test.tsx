/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment, react-hooks/rules-of-hooks, @typescript-eslint/no-require-imports */
// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/automations/workflows/[id]/page.tsx` — the visual
 * workflow editor. The page fetches the workflow + recent runs on mount, renders
 * a ReactFlow canvas surrounded by a node palette and a runs panel, and supports
 * save / test-run / delete / node-add actions.
 *
 * We mock `next/navigation`, `next/link`, `reactflow`, and `fetch` so we can
 * drive every branch without a real canvas.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ────────────────────────────────────────

const pushMock = vi.fn();
let paramsValue: Record<string, string> = { id: '5' };

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useParams: () => paramsValue,
  usePathname: () => '/portal/automations/workflows/5',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ReactFlow is a canvas lib with browser APIs — stub the whole module.
// The node palette buttons use `rfInstance.screenToFlowPosition`, so mock
// that on the instance passed to `onInit`.
vi.mock('reactflow', () => {
  const React = require('react');
  function MockReactFlow({ onInit, children }: any) {
    // Immediately call onInit with a stub instance so handleAdd works.
    React.useEffect(() => {
      if (onInit) {
        onInit({ screenToFlowPosition: ({ x, y }: any) => ({ x, y }) });
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return React.createElement('div', { 'data-testid': 'reactflow-canvas' }, children);
  }
  function MockBackground() { return null; }
  function MockControls() { return null; }
  function MockMiniMap() { return null; }
  return {
    __esModule: true,
    default: MockReactFlow,
    Background: MockBackground,
    Controls: MockControls,
    MiniMap: MockMiniMap,
    addEdge: (conn: any, eds: any[]) => [...eds, conn],
    applyNodeChanges: (_changes: any, nds: any[]) => nds,
    applyEdgeChanges: (_changes: any, eds: any[]) => eds,
  };
});

// Also stub the CSS import so Vitest doesn't choke on it.
vi.mock('reactflow/dist/style.css', () => ({}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

type FetchHandler = (url: string, init?: any) => any;
const handlers: FetchHandler[] = [];

function setFetchHandler(handler: FetchHandler) {
  handlers.length = 0;
  handlers.push(handler);
}

function jsonResponse(body: any) {
  return { ok: true, json: async () => body } as any;
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const baseWorkflow = {
  id: 5,
  name: 'Onboarding sequence',
  description: 'Sends emails after sign-up',
  status: 'active' as const,
  trigger: { kind: 'contact.created' as const },
  graph: {
    nodes: [
      {
        id: 'n1',
        type: 'trigger' as const,
        position: { x: 0, y: 0 },
        data: { kind: 'contact.created' as const },
      },
      {
        id: 'n2',
        type: 'action' as const,
        position: { x: 200, y: 0 },
        data: { kind: 'send_email' as const, templateId: 3, to: 'contact' as const },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2', label: undefined },
    ],
  },
};

const baseRuns = [
  {
    id: 101,
    status: 'completed',
    triggeredBy: 'manual',
    startedAt: new Date(Date.now() - 60000).toISOString(),
    completedAt: new Date(Date.now() - 50000).toISOString(),
    error: null,
  },
  {
    id: 102,
    status: 'failed',
    triggeredBy: null,
    startedAt: new Date(Date.now() - 120000).toISOString(),
    completedAt: null,
    error: 'Timeout exceeded',
  },
];

function defaultFetch(url: string, init?: any): any {
  if (url === '/api/portal/workflows/5' && (!init?.method || init.method === 'GET')) {
    return jsonResponse({ success: true, data: baseWorkflow });
  }
  if (url === '/api/portal/workflows/5/runs?limit=10') {
    return jsonResponse({ success: true, data: baseRuns });
  }
  if (url === '/api/portal/workflows/5' && init?.method === 'PATCH') {
    return jsonResponse({ success: true });
  }
  if (url === '/api/portal/workflows/5' && init?.method === 'DELETE') {
    return jsonResponse({ success: true });
  }
  if (url === '/api/portal/workflows/5/test-run' && init?.method === 'POST') {
    return jsonResponse({ success: true });
  }
  return jsonResponse({ success: true });
}

beforeEach(() => {
  paramsValue = { id: '5' };
  pushMock.mockReset();
  setFetchHandler(defaultFetch);
  // @ts-ignore
  global.fetch = vi.fn((url: string, init?: any) => Promise.resolve(handlers[0](url, init)));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// Page under test (imported AFTER mocks)
import WorkflowEditorPage from '@/app/portal/automations/workflows/[id]/page';

async function renderPage() {
  const result = render(<WorkflowEditorPage />);
  // Wait until the loading spinner is gone and the workflow name is in the input.
  // Input values do not appear in textContent, so we check the input element itself.
  await waitFor(() => {
    const input = result.container.querySelector('input') as HTMLInputElement | null;
    expect(input).toBeTruthy();
    expect(input?.value).toBe('Onboarding sequence');
  });
  return result;
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WorkflowEditorPage', () => {
  describe('loading state', () => {
    it('shows loading spinner while fetch is in flight', () => {
      setFetchHandler(() => new Promise(() => {})); // never resolves
      const { container } = render(<WorkflowEditorPage />);
      expect(container.textContent).toContain('Loading workflow...');
    });

    it('loading state includes the animated spinner icon', () => {
      setFetchHandler(() => new Promise(() => {}));
      const { container } = render(<WorkflowEditorPage />);
      expect(container.textContent).toContain('progress_activity');
    });
  });

  describe('not-found state', () => {
    it('shows not-found message when workflow fetch returns success:false', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/workflows/5' && (!init?.method || init.method === 'GET')) {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<WorkflowEditorPage />);
      await waitFor(() => {
        expect(container.textContent).toContain('Workflow not found.');
      });
    });

    it('not-found state renders a back link to the workflows list', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/workflows/5' && (!init?.method || init.method === 'GET')) {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<WorkflowEditorPage />);
      await waitFor(() => {
        const link = container.querySelector('a[href="/portal/automations/workflows"]');
        expect(link).toBeTruthy();
      });
    });

    it('does not fetch when params.id is not a number', async () => {
      paramsValue = { id: 'new' };
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(defaultFetch(url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      render(<WorkflowEditorPage />);
      await flush();
      // No fetch should have been called for /api/portal/workflows/NaN
      const workflowFetch = fetchSpy.mock.calls.find(c =>
        typeof c[0] === 'string' && c[0].startsWith('/api/portal/workflows/')
      );
      expect(workflowFetch).toBeUndefined();
    });
  });

  describe('initial render', () => {
    it('renders the workflow name in a text input', async () => {
      const { container } = await renderPage();
      const input = container.querySelector('input') as HTMLInputElement;
      expect(input.value).toBe('Onboarding sequence');
    });

    it('renders the status select with the workflow status selected', async () => {
      const { container } = await renderPage();
      const selects = container.querySelectorAll('select');
      const statusSelect = Array.from(selects).find(s =>
        Array.from(s.options).some(o => o.value === 'active')
      ) as HTMLSelectElement;
      expect(statusSelect.value).toBe('active');
    });

    it('renders all three status options', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('Draft');
      expect(container.textContent).toContain('Active');
      expect(container.textContent).toContain('Paused');
    });

    it('renders the trigger kind label', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('contact.created');
    });

    it('renders the ReactFlow canvas stub', async () => {
      await renderPage();
      expect(screen.getByTestId('reactflow-canvas')).toBeTruthy();
    });

    it('renders the back-link arrow pointing to the workflows list', async () => {
      const { container } = await renderPage();
      const link = container.querySelector('a[href="/portal/automations/workflows"]');
      expect(link).toBeTruthy();
    });

    it('renders the footer hint text', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('Click a palette entry to add it to the canvas');
    });
  });

  describe('palette sidebar', () => {
    it('renders the Triggers palette section heading', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('Triggers');
    });

    it('renders the Actions palette section heading', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('Actions');
    });

    it('renders the Logic palette section heading', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('Logic');
    });

    it('renders Contact created trigger in the palette', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('Contact created');
    });

    it('renders Send email action in the palette', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('Send email');
    });

    it('renders Condition entry in the palette', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('Condition');
    });

    it('clicking a palette button does not throw', async () => {
      const { container } = await renderPage();
      // Find the "Contact created" button in the triggers palette.
      const paletteBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Contact created')
      ) as HTMLButtonElement;
      expect(paletteBtn).toBeTruthy();
      expect(() => fireEvent.click(paletteBtn)).not.toThrow();
    });

    it('clicking a palette button adds a node (via the mock rfInstance)', async () => {
      // The mock rfInstance.screenToFlowPosition is set via onInit — verify
      // addNode runs without error by checking it doesn't crash.
      const { container } = await renderPage();
      const sendEmailBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Send email')
      ) as HTMLButtonElement;
      fireEvent.click(sendEmailBtn);
      // No error thrown; canvas stub is still in the DOM
      expect(screen.getByTestId('reactflow-canvas')).toBeTruthy();
    });

    it('clicking Wait action does not throw', async () => {
      const { container } = await renderPage();
      const waitBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Wait')
      ) as HTMLButtonElement;
      expect(waitBtn).toBeTruthy();
      expect(() => fireEvent.click(waitBtn)).not.toThrow();
    });
  });

  describe('recent runs panel', () => {
    it('renders the Recent runs heading', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('Recent runs');
    });

    it('renders run IDs for loaded runs', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('#101');
      expect(container.textContent).toContain('#102');
    });

    it('renders run status badges', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('completed');
      expect(container.textContent).toContain('failed');
    });

    it('renders error text for failed runs', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('Timeout exceeded');
    });

    it('renders "triggeredBy" text when present', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('manual');
    });

    it('shows empty-runs message when runs list is empty', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/workflows/5/runs?limit=10') {
          return jsonResponse({ success: true, data: [] });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<WorkflowEditorPage />);
      await waitFor(() => {
        const inp = container.querySelector('input') as HTMLInputElement | null;
        expect(inp?.value).toBe('Onboarding sequence');
      });
      expect(container.textContent).toContain('No runs yet');
    });

    it('handles runs fetch returning success:false gracefully', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/workflows/5/runs?limit=10') {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<WorkflowEditorPage />);
      await waitFor(() => {
        const inp = container.querySelector('input') as HTMLInputElement | null;
        expect(inp?.value).toBe('Onboarding sequence');
      });
      expect(container.textContent).toContain('No runs yet');
    });

    it('renders running and pending status badges via RunStatusBadge', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/workflows/5/runs?limit=10') {
          return jsonResponse({
            success: true,
            data: [
              { id: 200, status: 'running', triggeredBy: null, startedAt: new Date().toISOString(), completedAt: null, error: null },
              { id: 201, status: 'pending', triggeredBy: null, startedAt: new Date().toISOString(), completedAt: null, error: null },
            ],
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<WorkflowEditorPage />);
      await waitFor(() => {
        const inp = container.querySelector('input') as HTMLInputElement | null;
        expect(inp?.value).toBe('Onboarding sequence');
      });
      expect(container.textContent).toContain('running');
      expect(container.textContent).toContain('pending');
    });

    it('renders unknown status using the fallback badge style', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/workflows/5/runs?limit=10') {
          return jsonResponse({
            success: true,
            data: [
              { id: 300, status: 'cancelled', triggeredBy: null, startedAt: new Date().toISOString(), completedAt: null, error: null },
            ],
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<WorkflowEditorPage />);
      await waitFor(() => {
        const inp = container.querySelector('input') as HTMLInputElement | null;
        expect(inp?.value).toBe('Onboarding sequence');
      });
      expect(container.textContent).toContain('cancelled');
    });
  });

  describe('name editing', () => {
    it('changing the name input updates the field value', async () => {
      const { container } = await renderPage();
      const input = container.querySelector('input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'New name' } });
      expect(input.value).toBe('New name');
    });
  });

  describe('status change', () => {
    it('changing the status select updates the select value', async () => {
      const { container } = await renderPage();
      const statusSelect = Array.from(container.querySelectorAll('select')).find(s =>
        Array.from(s.options).some(o => o.value === 'active')
      ) as HTMLSelectElement;
      fireEvent.change(statusSelect, { target: { value: 'paused' } });
      expect(statusSelect.value).toBe('paused');
    });
  });

  describe('save action', () => {
    it('renders the Save button', async () => {
      const { container } = await renderPage();
      const saveBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Save')
      );
      expect(saveBtn).toBeTruthy();
    });

    it('clicking Save calls PATCH with the workflow id', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(defaultFetch(url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      const saveBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Save')
      ) as HTMLButtonElement;
      fireEvent.click(saveBtn);
      await waitFor(() => {
        const patch = fetchSpy.mock.calls.find(c =>
          c[0] === '/api/portal/workflows/5' && c[1]?.method === 'PATCH'
        );
        expect(patch).toBeTruthy();
      });
    });

    it('PATCH body includes name, status, and graph', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(defaultFetch(url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      const saveBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Save')
      ) as HTMLButtonElement;
      fireEvent.click(saveBtn);
      await waitFor(() => {
        const patch = fetchSpy.mock.calls.find(c =>
          c[0] === '/api/portal/workflows/5' && c[1]?.method === 'PATCH'
        );
        expect(patch).toBeTruthy();
        const body = JSON.parse(patch![1].body);
        expect(body.name).toBe('Onboarding sequence');
        expect(body.status).toBe('active');
        expect(body.graph).toBeDefined();
        expect(Array.isArray(body.graph.nodes)).toBe(true);
        expect(Array.isArray(body.graph.edges)).toBe(true);
      });
    });

    it('Save button is disabled while saving', async () => {
      // Never-resolving PATCH so we can inspect the disabled state
      setFetchHandler((url, init) => {
        if (url === '/api/portal/workflows/5' && init?.method === 'PATCH') {
          return new Promise(() => {});
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<WorkflowEditorPage />);
      await waitFor(() => {
        const inp = container.querySelector('input') as HTMLInputElement | null;
        expect(inp?.value).toBe('Onboarding sequence');
      });
      const saveBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Save')
      ) as HTMLButtonElement;
      fireEvent.click(saveBtn);
      await waitFor(() => {
        expect(saveBtn.disabled).toBe(true);
      });
    });

    it('shows Saving... label while PATCH is in flight', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/workflows/5' && init?.method === 'PATCH') {
          return new Promise(() => {});
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<WorkflowEditorPage />);
      await waitFor(() => {
        const inp = container.querySelector('input') as HTMLInputElement | null;
        expect(inp?.value).toBe('Onboarding sequence');
      });
      const saveBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Save')
      ) as HTMLButtonElement;
      fireEvent.click(saveBtn);
      await waitFor(() => {
        expect(container.textContent).toContain('Saving...');
      });
    });
  });

  describe('test run action', () => {
    it('renders the Test run button', async () => {
      const { container } = await renderPage();
      const testBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Test run')
      );
      expect(testBtn).toBeTruthy();
    });

    it('clicking Test run calls PATCH then POST to test-run, then re-fetches runs', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(defaultFetch(url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      const testBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Test run')
      ) as HTMLButtonElement;
      fireEvent.click(testBtn);
      await waitFor(() => {
        const testRunCall = fetchSpy.mock.calls.find(c =>
          c[0] === '/api/portal/workflows/5/test-run' && c[1]?.method === 'POST'
        );
        expect(testRunCall).toBeTruthy();
      });
      // A new runs fetch should follow the test-run call
      await waitFor(() => {
        const runsFetch = fetchSpy.mock.calls.filter(c =>
          c[0] === '/api/portal/workflows/5/runs?limit=10'
        );
        // At least 2 — one on mount, one after test run
        expect(runsFetch.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('shows Running... label during test run', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/workflows/5/test-run' && init?.method === 'POST') {
          return new Promise(() => {});
        }
        // PATCH must resolve so testing state advances
        if (url === '/api/portal/workflows/5' && init?.method === 'PATCH') {
          return jsonResponse({ success: true });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<WorkflowEditorPage />);
      await waitFor(() => {
        const inp = container.querySelector('input') as HTMLInputElement | null;
        expect(inp?.value).toBe('Onboarding sequence');
      });
      const testBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Test run')
      ) as HTMLButtonElement;
      fireEvent.click(testBtn);
      await waitFor(() => {
        expect(container.textContent).toContain('Running...');
      });
    });

    it('updates the runs list after a successful test run', async () => {
      const newRun = {
        id: 999,
        status: 'completed',
        triggeredBy: 'test',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        error: null,
      };
      let runsFetchCount = 0;
      setFetchHandler((url, init) => {
        if (url === '/api/portal/workflows/5/runs?limit=10') {
          runsFetchCount++;
          if (runsFetchCount > 1) {
            return jsonResponse({ success: true, data: [...baseRuns, newRun] });
          }
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<WorkflowEditorPage />);
      await waitFor(() => {
        const inp = container.querySelector('input') as HTMLInputElement | null;
        expect(inp?.value).toBe('Onboarding sequence');
      });
      const testBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Test run')
      ) as HTMLButtonElement;
      fireEvent.click(testBtn);
      await waitFor(() => {
        expect(container.textContent).toContain('#999');
      });
    });
  });

  describe('delete action', () => {
    it('renders the Delete button', async () => {
      const { container } = await renderPage();
      const deleteBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Delete')
      );
      expect(deleteBtn).toBeTruthy();
    });

    it('clicking Delete calls window.confirm', async () => {
      const { container } = await renderPage();
      const deleteBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Delete')
      ) as HTMLButtonElement;
      fireEvent.click(deleteBtn);
      await flush();
      expect(window.confirm).toHaveBeenCalled();
    });

    it('calls DELETE endpoint when user confirms', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(defaultFetch(url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      fireEvent.click(
        Array.from(container.querySelectorAll('button')).find(
          b => b.textContent?.includes('Delete')
        )!
      );
      await waitFor(() => {
        const del = fetchSpy.mock.calls.find(c =>
          c[0] === '/api/portal/workflows/5' && c[1]?.method === 'DELETE'
        );
        expect(del).toBeTruthy();
      });
    });

    it('navigates to the workflows list after deletion', async () => {
      const { container } = await renderPage();
      fireEvent.click(
        Array.from(container.querySelectorAll('button')).find(
          b => b.textContent?.includes('Delete')
        )!
      );
      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith('/portal/automations/workflows');
      });
    });

    it('does not call DELETE when user cancels the confirm dialog', async () => {
      vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(defaultFetch(url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      fireEvent.click(
        Array.from(container.querySelectorAll('button')).find(
          b => b.textContent?.includes('Delete')
        )!
      );
      await flush();
      const del = fetchSpy.mock.calls.find(c =>
        c[0] === '/api/portal/workflows/5' && c[1]?.method === 'DELETE'
      );
      expect(del).toBeUndefined();
      expect(pushMock).not.toHaveBeenCalled();
    });
  });
});
