/**
 * Baseline integration coverage for components/portal/CardDetailModal.tsx.
 *
 * Renders the modal against a mocked /api/portal/cards/:id payload that exercises
 * every section (header, description, comments, checklist, watchers, time logs,
 * files, dependencies, sidebar). Asserts each section renders, then drives a few
 * mutations (title save, checklist toggle, comment submit) and checks the
 * matching callback or fetch fired.
 *
 * Authored test-FIRST against the pre-refactor implementation. Must continue to
 * pass after the modal is split into components/portal/card-detail/**.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CardDetailModal from '@/components/portal/CardDetailModal';

interface FetchCall {
  url: string;
  init?: RequestInit;
}

const fixture = {
  card: {
    id: 7,
    columnId: 1,
    projectId: 42,
    title: 'Implement onboarding flow',
    description: 'Steps to onboard a new client.',
    priority: 'high',
    dueDate: null,
    order: 1,
    number: 12,
    key: 'PROJ-12',
    projectKey: 'PROJ',
  },
  timeLogs: [
    {
      id: 901,
      minutes: 45,
      note: 'Spec review',
      loggedAt: '2026-04-01T10:00:00.000Z',
      userId: 5,
      userName: 'Alex Kim',
    },
  ],
  files: [],
  comments: [
    {
      id: 11,
      body: 'First comment',
      mentions: null,
      createdAt: '2026-04-01T10:00:00.000Z',
      userId: 5,
      userName: 'Alex Kim',
    },
    {
      id: 12,
      body: 'Second comment',
      mentions: null,
      createdAt: '2026-04-02T10:00:00.000Z',
      userId: 6,
      userName: 'Riley Park',
    },
  ],
  labels: [{ id: 1, name: 'Backend', color: '#6366f1' }],
  activities: [],
  checklist: [
    { id: 21, text: 'Draft plan', completed: false, order: 0, createdAt: '2026-04-01T10:00:00.000Z', completedAt: null },
    { id: 22, text: 'Get sign-off', completed: false, order: 1, createdAt: '2026-04-01T10:00:00.000Z', completedAt: null },
  ],
  assignees: [{ id: 5, name: 'Alex Kim', email: 'alex@example.com' }],
  watching: true,
  blockers: [],
  blocking: [],
};

let fetchCalls: FetchCall[] = [];

function jsonOk<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installFetchMock() {
  fetchCalls = [];
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    fetchCalls.push({ url, init });

    if (url === '/api/portal/cards/7') {
      if (!init || init.method === undefined || init.method === 'GET') {
        return jsonOk(fixture);
      }
      if (init.method === 'PATCH') {
        return jsonOk({ id: 7 });
      }
    }
    if (url === '/api/portal/mentionable-users') {
      return jsonOk([
        { id: 5, name: 'Alex Kim' },
        { id: 6, name: 'Riley Park' },
      ]);
    }
    if (url === '/api/portal/projects/42/labels') {
      return jsonOk([{ id: 1, name: 'Backend', color: '#6366f1' }]);
    }
    if (url === '/api/portal/cards/7/artifacts') {
      return jsonOk([]);
    }
    if (url === '/api/portal/cards/7/artifacts/available') {
      return jsonOk([]);
    }
    if (url === '/api/portal/cards/7/comments' && init?.method === 'POST') {
      return jsonOk({
        id: 99,
        body: 'My new comment',
        mentions: [],
        createdAt: '2026-05-04T10:00:00.000Z',
        userId: 5,
        userName: 'Alex Kim',
        files: [],
      });
    }
    if (url.startsWith('/api/portal/checklist-items/')) {
      return jsonOk(null);
    }
    return jsonOk(null);
  }) as unknown as typeof fetch;
}

describe('CardDetailModal baseline', () => {
  beforeEach(() => {
    installFetchMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders every documented section', { timeout: 30_000 }, async () => {
    render(
      <CardDetailModal
        cardId={7}
        isStaff
        canEdit
        currentUserId={5}
        onClose={() => {}}
        onDeleted={() => {}}
        onUpdated={() => {}}
      />,
    );

    // Header — title + identifier
    await waitFor(() => expect(screen.getByText('Implement onboarding flow')).toBeInTheDocument());
    expect(screen.getByText('PROJ-12')).toBeInTheDocument();

    // Section labels (rendered as `<h3>` headings, all-caps)
    expect(screen.getByText(/^Labels$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Description$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Attachments/i)).toBeInTheDocument();
    expect(screen.getByText(/^Comments/i)).toBeInTheDocument();
    expect(screen.getByText(/^Time Tracked/i)).toBeInTheDocument();
    expect(screen.getByText(/^Activity/i)).toBeInTheDocument();

    // Description body
    expect(screen.getByText(/Steps to onboard a new client/i)).toBeInTheDocument();

    // Comments thread
    expect(screen.getByText('First comment')).toBeInTheDocument();
    expect(screen.getByText('Second comment')).toBeInTheDocument();

    // Checklist items
    expect(screen.getByText('Draft plan')).toBeInTheDocument();
    expect(screen.getByText('Get sign-off')).toBeInTheDocument();

    // Watchers (the Watch button is shown as 'Watching' since fixture sets watching=true)
    expect(screen.getByRole('button', { name: /Watching/i })).toBeInTheDocument();

    // Time logs
    expect(screen.getByText(/Spec review/i)).toBeInTheDocument();

    // Sidebar — assignee and labels (Alex Kim appears multiple times: comment author + assignee)
    expect(screen.getAllByText('Alex Kim').length).toBeGreaterThan(0);
    // Priority/Due Date controls in sidebar
    expect(screen.getByText('Priority')).toBeInTheDocument();
    expect(screen.getByText('Due Date')).toBeInTheDocument();
  });

  it('saves the title and fires onUpdated', { timeout: 30_000 }, async () => {
    const onUpdated = vi.fn();
    const user = userEvent.setup();

    render(
      <CardDetailModal
        cardId={7}
        isStaff
        canEdit
        currentUserId={5}
        onClose={() => {}}
        onDeleted={() => {}}
        onUpdated={onUpdated}
      />,
    );

    const heading = await screen.findByText('Implement onboarding flow');
    await user.click(heading);
    // The title becomes an editable input pre-filled with the existing title.
    const input = screen.getByDisplayValue('Implement onboarding flow') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, 'New onboarding title');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ id: 7, title: 'New onboarding title' }));

    const patchCall = fetchCalls.find(c => c.url === '/api/portal/cards/7' && c.init?.method === 'PATCH');
    expect(patchCall).toBeTruthy();
    const body = JSON.parse((patchCall!.init!.body as string) ?? '{}');
    expect(body.title).toBe('New onboarding title');
  });

  it('toggles a checklist item and PATCHes the API', { timeout: 30_000 }, async () => {
    const user = userEvent.setup();

    render(
      <CardDetailModal
        cardId={7}
        isStaff
        canEdit
        currentUserId={5}
        onClose={() => {}}
        onDeleted={() => {}}
        onUpdated={() => {}}
      />,
    );

    await screen.findByText('Draft plan');

    // Two checklist items, each with a "Mark complete" toggle. Toggle the first
    // (which corresponds to checklist-item id 21 in the fixture).
    const toggleButtons = screen.getAllByRole('button', { name: /Mark complete/i });
    await user.click(toggleButtons[0]);

    await waitFor(() => {
      const patch = fetchCalls.find(c => c.url === '/api/portal/checklist-items/21' && c.init?.method === 'PATCH');
      expect(patch).toBeTruthy();
    });
  });

  it('submits a new comment', { timeout: 30_000 }, async () => {
    const user = userEvent.setup();

    render(
      <CardDetailModal
        cardId={7}
        isStaff
        canEdit
        currentUserId={5}
        onClose={() => {}}
        onDeleted={() => {}}
        onUpdated={() => {}}
      />,
    );

    await screen.findByText('First comment');

    const textarea = screen.getByPlaceholderText(/Add a comment/i);
    await act(async () => {
      await user.type(textarea, 'My new comment');
    });
    // Submit button accessible name includes the icon ligature ("send Comment").
    await user.click(screen.getByRole('button', { name: /Comment/i }));

    await waitFor(() => {
      const post = fetchCalls.find(c => c.url === '/api/portal/cards/7/comments' && c.init?.method === 'POST');
      expect(post).toBeTruthy();
    });

    const post = fetchCalls.find(c => c.url === '/api/portal/cards/7/comments' && c.init?.method === 'POST')!;
    const body = JSON.parse((post.init!.body as string) ?? '{}');
    expect(body.body).toBe('My new comment');
  });
});
