// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) =>
    React.createElement('a', { href, className }, children),
}));

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

function makeFetchMock(handlers: (url: string) => { ok: boolean; body: unknown }) {
  return vi.fn().mockImplementation((url: string) => {
    const { ok, body } = handlers(url);
    return Promise.resolve({
      ok,
      json: () => Promise.resolve(body),
    });
  });
}

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import { PersonProfileSidebar } from '@/components/brain/PersonProfileSidebar';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PersonProfileSidebar', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. No userId → everythingEmpty stub ────────────────────────────────────
  it('renders the "link this person" stub when userId is null and sibling endpoints 404', async () => {
    global.fetch = makeFetchMock((url) => {
      // initiatives and decisions both 404 (sibling branches not shipped)
      if (url.includes('/initiatives') || url.includes('/decisions')) {
        return { ok: false, body: {} };
      }
      return { ok: true, body: { success: true, data: [] } };
    });

    await act(async () => {
      render(<PersonProfileSidebar person={{ id: 1, userId: null }} />);
    });

    expect(
      screen.getByText(/link this person to a user account/i),
    ).toBeInTheDocument();
  });

  // ── 2. Header always visible ───────────────────────────────────────────────
  it('always renders the "Linked elsewhere in Brain" heading', async () => {
    global.fetch = makeFetchMock(() => ({ ok: true, body: { success: true, data: [] } }));

    await act(async () => {
      render(<PersonProfileSidebar person={{ id: 1, userId: 42 }} />);
    });

    expect(screen.getByText('Linked elsewhere in Brain')).toBeInTheDocument();
  });

  // ── 3. Tasks loading spinner ───────────────────────────────────────────────
  it('shows a loading spinner while tasks are fetching', async () => {
    let resolveTasksFetch!: (v: unknown) => void;
    const tasksFetchPromise = new Promise((res) => { resolveTasksFetch = res; });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/tasks')) {
        return tasksFetchPromise;
      }
      // initiatives + decisions resolve quickly → null (non-ok)
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });

    await act(async () => {
      render(<PersonProfileSidebar person={{ id: 1, userId: 42 }} />);
    });

    expect(screen.getByText('Loading…')).toBeInTheDocument();

    // resolve the tasks fetch so cleanup doesn't leak
    await act(async () => {
      resolveTasksFetch({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      });
    });
  });

  // ── 4. Tasks list renders items ────────────────────────────────────────────
  it('renders a task list with status badges and titles', async () => {
    const tasks = [
      { id: 10, title: 'Fix the bug', status: 'open' as const },
      { id: 11, title: 'Review PR', status: 'in_progress' as const },
      { id: 12, title: 'Deploy hotfix', status: 'blocked' as const },
      { id: 13, title: 'Retrospective', status: 'done' as const },
    ];

    global.fetch = makeFetchMock((url) => {
      if (url.includes('/tasks')) return { ok: true, body: { success: true, data: tasks } };
      return { ok: false, body: {} };
    });

    await act(async () => {
      render(<PersonProfileSidebar person={{ id: 1, userId: 42 }} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Fix the bug')).toBeInTheDocument();
    });

    expect(screen.getByText('Review PR')).toBeInTheDocument();
    expect(screen.getByText('Deploy hotfix')).toBeInTheDocument();
    expect(screen.getByText('Retrospective')).toBeInTheDocument();

    // status badges (underscore replaced by space)
    expect(screen.getByText('in progress')).toBeInTheDocument();
    expect(screen.getByText('open')).toBeInTheDocument();
    expect(screen.getByText('blocked')).toBeInTheDocument();
    expect(screen.getByText('done')).toBeInTheDocument();
  });

  // ── 5. Task links have correct hrefs ──────────────────────────────────────
  it('links each task to the brain tasks page with selected param', async () => {
    const tasks = [{ id: 77, title: 'Test task', status: 'open' as const }];

    global.fetch = makeFetchMock((url) => {
      if (url.includes('/tasks')) return { ok: true, body: { success: true, data: tasks } };
      return { ok: false, body: {} };
    });

    await act(async () => {
      render(<PersonProfileSidebar person={{ id: 1, userId: 42 }} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Test task')).toBeInTheDocument();
    });

    const link = screen.getByText('Test task').closest('a');
    expect(link).toHaveAttribute('href', '/portal/brain/tasks?selected=77');
  });

  // ── 6. No open tasks message ───────────────────────────────────────────────
  it('shows "No open tasks." when fetch returns an empty array', async () => {
    global.fetch = makeFetchMock((url) => {
      if (url.includes('/tasks')) return { ok: true, body: { success: true, data: [] } };
      return { ok: false, body: {} };
    });

    await act(async () => {
      render(<PersonProfileSidebar person={{ id: 1, userId: 42 }} />);
    });

    await waitFor(() => {
      expect(screen.getByText('No open tasks.')).toBeInTheDocument();
    });
  });

  // ── 7. No linked user account message (userId null, sibling sections exist) ─
  it('shows "No linked user account." in tasks section when userId is null but initiatives loaded', async () => {
    const initiatives = [{ id: 1, title: 'Big initiative', status: 'active' }];

    global.fetch = makeFetchMock((url) => {
      if (url.includes('/initiatives')) return { ok: true, body: { success: true, data: { items: initiatives } } };
      if (url.includes('/decisions')) return { ok: false, body: {} };
      return { ok: true, body: { success: true, data: [] } };
    });

    await act(async () => {
      render(<PersonProfileSidebar person={{ id: 1, userId: null }} />);
    });

    await waitFor(() => {
      expect(screen.getByText('No linked user account.')).toBeInTheDocument();
    });
  });

  // ── 8. Initiatives section renders ────────────────────────────────────────
  it('renders the initiatives section when the endpoint returns data', async () => {
    const initiatives = [
      { id: 5, title: 'Launch product', status: 'active' },
      { id: 6, title: 'Rebrand website' },
    ];

    global.fetch = makeFetchMock((url) => {
      if (url.includes('/initiatives')) return { ok: true, body: { success: true, data: { items: initiatives } } };
      if (url.includes('/tasks')) return { ok: true, body: { success: true, data: [] } };
      return { ok: false, body: {} };
    });

    await act(async () => {
      render(<PersonProfileSidebar person={{ id: 1, userId: 42 }} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Launch product')).toBeInTheDocument();
    });

    expect(screen.getByText('Rebrand website')).toBeInTheDocument();

    // Link href
    const link = screen.getByText('Launch product').closest('a');
    expect(link).toHaveAttribute('href', '/portal/brain/initiatives/5');
  });

  // ── 9. Empty initiatives → "No linked initiatives." ────────────────────────
  it('shows "No linked initiatives." when initiatives endpoint returns empty array', async () => {
    global.fetch = makeFetchMock((url) => {
      if (url.includes('/initiatives')) return { ok: true, body: { success: true, data: [] } };
      if (url.includes('/tasks')) return { ok: true, body: { success: true, data: [] } };
      return { ok: false, body: {} };
    });

    await act(async () => {
      render(<PersonProfileSidebar person={{ id: 1, userId: 42 }} />);
    });

    await waitFor(() => {
      expect(screen.getByText('No linked initiatives.')).toBeInTheDocument();
    });
  });

  // ── 10. Decisions section renders ─────────────────────────────────────────
  it('renders the decisions section when the endpoint returns data', async () => {
    const decisions = [
      { id: 20, title: 'Use TypeScript everywhere' },
      { id: 21, title: 'Adopt Tailwind v4' },
    ];

    global.fetch = makeFetchMock((url) => {
      if (url.includes('/decisions')) return { ok: true, body: { success: true, data: { items: decisions } } };
      if (url.includes('/tasks')) return { ok: true, body: { success: true, data: [] } };
      return { ok: false, body: {} };
    });

    await act(async () => {
      render(<PersonProfileSidebar person={{ id: 1, userId: 42 }} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Use TypeScript everywhere')).toBeInTheDocument();
    });

    expect(screen.getByText('Adopt Tailwind v4')).toBeInTheDocument();

    const link = screen.getByText('Adopt Tailwind v4').closest('a');
    expect(link).toHaveAttribute('href', '/portal/brain/decisions/21');
  });

  // ── 11. Empty decisions → "No linked decisions." ──────────────────────────
  it('shows "No linked decisions." when decisions endpoint returns empty array', async () => {
    global.fetch = makeFetchMock((url) => {
      if (url.includes('/decisions')) return { ok: true, body: { success: true, data: [] } };
      if (url.includes('/tasks')) return { ok: true, body: { success: true, data: [] } };
      return { ok: false, body: {} };
    });

    await act(async () => {
      render(<PersonProfileSidebar person={{ id: 1, userId: 42 }} />);
    });

    await waitFor(() => {
      expect(screen.getByText('No linked decisions.')).toBeInTheDocument();
    });
  });

  // ── 12. Initiatives hidden when endpoint not-ok ───────────────────────────
  it('hides initiatives section when endpoint returns non-ok', async () => {
    global.fetch = makeFetchMock((url) => {
      if (url.includes('/initiatives')) return { ok: false, body: {} };
      if (url.includes('/tasks')) return { ok: true, body: { success: true, data: [] } };
      return { ok: false, body: {} };
    });

    await act(async () => {
      render(<PersonProfileSidebar person={{ id: 1, userId: 42 }} />);
    });

    await waitFor(() => {
      expect(screen.queryByText('No linked initiatives.')).not.toBeInTheDocument();
    });
    // Initiatives heading should also be absent
    expect(screen.queryByText(/Initiatives/i)).not.toBeInTheDocument();
  });

  // ── 13. Decisions hidden when endpoint not-ok ─────────────────────────────
  it('hides decisions section when endpoint returns non-ok', async () => {
    global.fetch = makeFetchMock((url) => {
      if (url.includes('/decisions')) return { ok: false, body: {} };
      if (url.includes('/tasks')) return { ok: true, body: { success: true, data: [] } };
      return { ok: false, body: {} };
    });

    await act(async () => {
      render(<PersonProfileSidebar person={{ id: 1, userId: 42 }} />);
    });

    await waitFor(() => {
      expect(screen.queryByText('No linked decisions.')).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/Decisions/i)).not.toBeInTheDocument();
  });

  // ── 14. Tasks fetch error → shows "No open tasks." gracefully ─────────────
  it('gracefully shows "No open tasks." when the tasks fetch rejects', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/tasks')) return Promise.reject(new Error('network'));
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });

    await act(async () => {
      render(<PersonProfileSidebar person={{ id: 1, userId: 42 }} />);
    });

    await waitFor(() => {
      expect(screen.getByText('No open tasks.')).toBeInTheDocument();
    });
  });

  // ── 15. Caps task list at 8 items ─────────────────────────────────────────
  it('renders at most 8 tasks even when the API returns more', async () => {
    const tasks = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      title: `Task ${i + 1}`,
      status: 'open' as const,
    }));

    global.fetch = makeFetchMock((url) => {
      if (url.includes('/tasks')) return { ok: true, body: { success: true, data: tasks } };
      return { ok: false, body: {} };
    });

    await act(async () => {
      render(<PersonProfileSidebar person={{ id: 1, userId: 42 }} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Task 1')).toBeInTheDocument();
    });

    expect(screen.getByText('Task 8')).toBeInTheDocument();
    expect(screen.queryByText('Task 9')).not.toBeInTheDocument();
  });

  // ── 16. data.items shape for tasks ────────────────────────────────────────
  it('accepts data.items shape from the tasks endpoint', async () => {
    const tasks = [{ id: 99, title: 'Items-shaped task', status: 'done' as const }];

    global.fetch = makeFetchMock((url) => {
      if (url.includes('/tasks')) return { ok: true, body: { success: true, data: { items: tasks } } };
      return { ok: false, body: {} };
    });

    await act(async () => {
      render(<PersonProfileSidebar person={{ id: 1, userId: 42 }} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Items-shaped task')).toBeInTheDocument();
    });
  });

  // ── 17. Tasks endpoint json.success=false → empty ─────────────────────────
  it('shows "No open tasks." when the task endpoint returns success:false', async () => {
    global.fetch = makeFetchMock((url) => {
      if (url.includes('/tasks')) return { ok: true, body: { success: false, error: 'oops' } };
      return { ok: false, body: {} };
    });

    await act(async () => {
      render(<PersonProfileSidebar person={{ id: 1, userId: 42 }} />);
    });

    await waitFor(() => {
      expect(screen.getByText('No open tasks.')).toBeInTheDocument();
    });
  });

  // ── 18. All three sections visible simultaneously ─────────────────────────
  it('shows tasks, initiatives, and decisions sections all at once', async () => {
    const tasks = [{ id: 1, title: 'Task A', status: 'open' as const }];
    const initiatives = [{ id: 2, title: 'Initiative A' }];
    const decisions = [{ id: 3, title: 'Decision A' }];

    global.fetch = makeFetchMock((url) => {
      if (url.includes('/tasks')) return { ok: true, body: { success: true, data: tasks } };
      if (url.includes('/initiatives')) return { ok: true, body: { success: true, data: initiatives } };
      if (url.includes('/decisions')) return { ok: true, body: { success: true, data: decisions } };
      return { ok: false, body: {} };
    });

    await act(async () => {
      render(<PersonProfileSidebar person={{ id: 1, userId: 42 }} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Task A')).toBeInTheDocument();
    });

    expect(screen.getByText('Initiative A')).toBeInTheDocument();
    expect(screen.getByText('Decision A')).toBeInTheDocument();
  });
});
