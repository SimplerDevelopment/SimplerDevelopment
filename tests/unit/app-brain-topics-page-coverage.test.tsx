// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/brain/topics/page.tsx` — the Brain Topics admin
 * page. Covers:
 *   - Main page: initial render, loading state, error state, empty tree
 *   - Header buttons: new topic, import from tags
 *   - Create root topic flow (input, Enter, Escape, blur)
 *   - Tree/panel layout when tree has items
 *   - Side-panel: no-selection placeholder, topic detail panel load
 *   - TopicDetailPanel: loading, error, topic data, name/description/color/icon
 *     editing, save flows, entity listing, delete
 *   - ImportFromTagsWizard: open/close, preview, run import, done state
 *
 * Mocks: next/navigation, global fetch, @/components/brain/TopicTree (heavy
 * recursive component with HTML5 DnD — not renderable in jsdom without
 * extensive stub).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ───────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/portal/brain/topics',
  useSearchParams: () => new URLSearchParams(),
}));

// TopicTree is a complex drag-drop recursive component; stub to a simple
// representation that captures props so we can verify they are passed.
let capturedTreeProps: Record<string, unknown> = {};
vi.mock('@/components/brain/TopicTree', () => ({
  default: (props: Record<string, unknown>) => {
    capturedTreeProps = props;
    return React.createElement(
      'div',
      { 'data-testid': 'topic-tree' },
      `tree-mock: ${(props.tree as unknown[])?.length ?? 0} nodes`,
    );
  },
}));

// ─── Fetch stub ─────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<unknown> };
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, json: async () => body };
}

// Default flat topic list
const DEFAULT_TREE = [{ id: 1, name: 'Alpha', path: '/alpha', children: [] }];
const DEFAULT_FLAT = [{ id: 1, name: 'Alpha', path: '/alpha' }];

const DEFAULT_TOPIC_DETAIL = {
  id: 1,
  name: 'Alpha',
  description: null,
  color: null,
  icon: null,
  path: '/alpha',
  breadcrumb: [],
};

function setupDefault() {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('as=tree')) {
      return makeRes({ success: true, data: { tree: DEFAULT_TREE } });
    }
    if (url.includes('as=flat')) {
      return makeRes({ success: true, data: { items: DEFAULT_FLAT } });
    }
    // Single topic detail (matches /api/portal/brain/topics/N without sub-path)
    if (/\/api\/portal\/brain\/topics\/\d+$/.test(url)) {
      return makeRes({ success: true, data: DEFAULT_TOPIC_DETAIL });
    }
    // Entity list for any topic
    if (/\/api\/portal\/brain\/topics\/\d+\/entities/.test(url)) {
      return makeRes({ success: true, data: { items: [], byType: {} } });
    }
    return makeRes({ success: true, data: {} });
  });
}

beforeEach(() => {
  capturedTreeProps = {};
  fetchMock.mockReset();
  setupDefault();
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Import after mocks
import BrainTopicsAdminPage from '@/app/portal/brain/topics/page';

function renderPage() {
  return render(<BrainTopicsAdminPage />);
}

// ─── Shell rendering ─────────────────────────────────────────────────────────

describe('BrainTopicsAdminPage — shell', () => {
  it('renders the Topics heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Topics');
    });
  });

  it('shows loading copy while data is fetching', () => {
    // Make the fetch never resolve during this check
    fetchMock.mockImplementation(() => new Promise(() => {}) as Promise<FetchResp>);
    const { container } = renderPage();
    expect(container.textContent).toContain('Loading');
  });

  it('shows topic count after successful load', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('1 topic');
    });
  });

  it('pluralises topic count correctly for > 1', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('as=tree')) {
        return makeRes({ success: true, data: { tree: DEFAULT_TREE } });
      }
      if (url.includes('as=flat')) {
        return makeRes({
          success: true,
          data: {
            items: [
              { id: 1, name: 'A', path: '/a' },
              { id: 2, name: 'B', path: '/b' },
              { id: 3, name: 'C', path: '/c' },
            ],
          },
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('3 topics');
    });
  });

  it('shows "drag to reorganize" subtitle when loaded', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('drag to reorganize');
    });
  });

  it('renders the "New topic" button', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('New topic'),
      );
      expect(btn).toBeTruthy();
    });
  });

  it('renders the "Import from tags" button', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Import from tags'),
      );
      expect(btn).toBeTruthy();
    });
  });
});

// ─── Error state ─────────────────────────────────────────────────────────────

describe('BrainTopicsAdminPage — error states', () => {
  it('shows error banner on failed tree load (server message)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('as=tree')) {
        return makeRes({ success: false, message: 'tree load failed' }, false);
      }
      if (url.includes('as=flat')) {
        return makeRes({ success: true, data: { items: [] } });
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('tree load failed');
    });
  });

  it('shows error banner when fetch throws a network error', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('network down');
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('network down');
    });
  });

  it('shows fallback "Network error" when thrown value is not an Error', async () => {
    fetchMock.mockImplementation(async () => {
      throw 'plain string'; // not an Error
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Network error');
    });
  });
});

// ─── Empty tree state ─────────────────────────────────────────────────────────

describe('BrainTopicsAdminPage — empty tree', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('as=tree')) {
        return makeRes({ success: true, data: { tree: [] } });
      }
      if (url.includes('as=flat')) {
        return makeRes({ success: true, data: { items: [] } });
      }
      return makeRes({ success: true, data: {} });
    });
  });

  it('shows "No topics yet." empty state', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No topics yet.');
    });
  });

  it('shows "Create your first topic" button in the empty state', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Create your first topic');
    });
  });

  it('shows "import from existing tags" link in the empty state', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('import from existing tags');
    });
  });
});

// ─── TopicTree is rendered when tree has items ───────────────────────────────

describe('BrainTopicsAdminPage — with tree data', () => {
  it('renders the TopicTree mock when tree is non-empty', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="topic-tree"]')).toBeTruthy();
    });
  });

  it('passes tree prop to TopicTree', async () => {
    renderPage();
    await waitFor(() => {
      expect(capturedTreeProps.tree).toBeTruthy();
    });
  });

  it('passes allTopics (flat list) to TopicTree', async () => {
    renderPage();
    await waitFor(() => {
      expect(Array.isArray(capturedTreeProps.allTopics)).toBe(true);
    });
  });

  it('calls onSelect to set selectedId when TopicTree triggers it', async () => {
    renderPage();
    await waitFor(() => {
      expect(typeof capturedTreeProps.onSelect).toBe('function');
    });
    // Simulate a selection
    act(() => {
      (capturedTreeProps.onSelect as (node: { id: number }) => void)({ id: 1 });
    });
    // The side panel should load the detail; fetch for topics/1 should appear
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('/api/portal/brain/topics/1'))).toBe(true);
    });
  });
});

// ─── No-selection side panel ──────────────────────────────────────────────────

describe('BrainTopicsAdminPage — side panel (no selection)', () => {
  it('shows "Select a topic" placeholder when nothing is selected', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Select a topic to see its details');
    });
  });
});

// ─── Create root topic ────────────────────────────────────────────────────────

describe('BrainTopicsAdminPage — create root topic', () => {
  it('clicking "New topic" shows the root name input', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New topic'));
    const newBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('New topic') && !b.textContent?.includes('Create'),
    ) as HTMLButtonElement;
    fireEvent.click(newBtn);
    await waitFor(() => {
      expect(container.querySelector('input[placeholder="New root topic name…"]')).toBeTruthy();
    });
  });

  it('pressing Escape in the name input cancels without creating', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New topic'));
    const newBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('New topic'),
    ) as HTMLButtonElement;
    fireEvent.click(newBtn);
    await waitFor(() =>
      expect(container.querySelector('input[placeholder="New root topic name…"]')).toBeTruthy(),
    );
    const input = container.querySelector(
      'input[placeholder="New root topic name…"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Should not save' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => {
      expect(container.querySelector('input[placeholder="New root topic name…"]')).toBeFalsy();
    });
  });

  it('pressing Enter with a name calls POST /api/portal/brain/topics', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('as=tree')) return makeRes({ success: true, data: { tree: DEFAULT_TREE } });
      if (url.includes('as=flat')) return makeRes({ success: true, data: { items: DEFAULT_FLAT } });
      if (url === '/api/portal/brain/topics' && init?.method === 'POST') {
        return makeRes({ success: true, data: { id: 99 } });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New topic'));
    const newBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('New topic'),
    ) as HTMLButtonElement;
    fireEvent.click(newBtn);
    await waitFor(() =>
      expect(container.querySelector('input[placeholder="New root topic name…"]')).toBeTruthy(),
    );
    const input = container.querySelector(
      'input[placeholder="New root topic name…"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'New Root' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => c[0] === '/api/portal/brain/topics' && c[1]?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
    });
  });

  it('blurring the input with a name calls POST', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('as=tree')) return makeRes({ success: true, data: { tree: DEFAULT_TREE } });
      if (url.includes('as=flat')) return makeRes({ success: true, data: { items: DEFAULT_FLAT } });
      if (url === '/api/portal/brain/topics' && init?.method === 'POST') {
        return makeRes({ success: true, data: { id: 99 } });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New topic'));
    const newBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('New topic'),
    ) as HTMLButtonElement;
    fireEvent.click(newBtn);
    await waitFor(() =>
      expect(container.querySelector('input[placeholder="New root topic name…"]')).toBeTruthy(),
    );
    const input = container.querySelector(
      'input[placeholder="New root topic name…"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Blur Topic' } });
    fireEvent.blur(input);
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => c[0] === '/api/portal/brain/topics' && c[1]?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
    });
  });

  it('blurring with an empty name does NOT call POST', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New topic'));
    const newBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('New topic'),
    ) as HTMLButtonElement;
    fireEvent.click(newBtn);
    await waitFor(() =>
      expect(container.querySelector('input[placeholder="New root topic name…"]')).toBeTruthy(),
    );
    const input = container.querySelector(
      'input[placeholder="New root topic name…"]',
    ) as HTMLInputElement;
    fireEvent.blur(input);
    // Give any async actions time to run
    await new Promise((r) => setTimeout(r, 50));
    const postCall = fetchMock.mock.calls.find(
      (c) => c[0] === '/api/portal/brain/topics' && c[1]?.method === 'POST',
    );
    expect(postCall).toBeFalsy();
  });

  it('shows error when POST fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('as=tree')) return makeRes({ success: true, data: { tree: DEFAULT_TREE } });
      if (url.includes('as=flat')) return makeRes({ success: true, data: { items: DEFAULT_FLAT } });
      if (url === '/api/portal/brain/topics' && init?.method === 'POST') {
        return makeRes({ success: false, message: 'create error' }, false);
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New topic'));
    const newBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('New topic'),
    ) as HTMLButtonElement;
    fireEvent.click(newBtn);
    await waitFor(() =>
      expect(container.querySelector('input[placeholder="New root topic name…"]')).toBeTruthy(),
    );
    const input = container.querySelector(
      'input[placeholder="New root topic name…"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Bad topic' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(container.textContent).toContain('create error');
    });
  });

  it('"Create your first topic" button activates the root-create input', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('as=tree')) return makeRes({ success: true, data: { tree: [] } });
      if (url.includes('as=flat')) return makeRes({ success: true, data: { items: [] } });
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('No topics yet.'));
    const createBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create your first topic'),
    ) as HTMLButtonElement;
    fireEvent.click(createBtn);
    await waitFor(() => {
      expect(container.querySelector('input[placeholder="New root topic name…"]')).toBeTruthy();
    });
  });
});

// ─── Import from tags wizard ──────────────────────────────────────────────────

describe('ImportFromTagsWizard', () => {
  function setupImport(report: unknown = null, fail = false) {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('as=tree')) return makeRes({ success: true, data: { tree: DEFAULT_TREE } });
      if (url.includes('as=flat')) return makeRes({ success: true, data: { items: DEFAULT_FLAT } });
      if (url.includes('import-from-tags') && init?.method === 'POST') {
        if (fail) return makeRes({ success: false, message: 'import failed' }, false);
        return makeRes({ success: true, data: report ?? { topicsCreated: 0, notesAttached: 0, perTopic: [] } });
      }
      return makeRes({ success: true, data: {} });
    });
  }

  async function openWizard() {
    setupImport();
    const r = renderPage();
    await waitFor(() => expect(r.container.textContent).toContain('Import from tags'));
    const importBtn = Array.from(r.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Import from tags'),
    ) as HTMLButtonElement;
    fireEvent.click(importBtn);
    await waitFor(() => {
      expect(r.container.textContent).toContain('Import topics from tags');
    });
    return r;
  }

  it('opens the wizard when "Import from tags" is clicked', async () => {
    const { container } = await openWizard();
    expect(container.textContent).toContain('Import topics from tags');
  });

  it('closes via Cancel button', async () => {
    const { container } = await openWizard();
    const cancelBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Import topics from tags');
    });
  });

  it('closes via backdrop click when not busy', async () => {
    const { container } = await openWizard();
    const backdrop = container.querySelector('.fixed.inset-0.z-40') as HTMLElement;
    fireEvent.click(backdrop);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Import topics from tags');
    });
  });

  it('renders Preview button', async () => {
    const { container } = await openWizard();
    expect(container.textContent).toContain('Preview');
  });

  it('renders close (X) button in wizard header', async () => {
    const { container } = await openWizard();
    const closeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Close',
    ) as HTMLButtonElement;
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Import topics from tags');
    });
  });

  it('shows empty preview when no tags found', async () => {
    const { container } = await openWizard();
    await waitFor(() => {
      expect(container.textContent).toContain('No tags to import');
    });
  });

  it('renders perTopic table when report has items', async () => {
    setupImport({
      topicsCreated: 2,
      notesAttached: 5,
      perTopic: [
        { path: '/kb/topic-a', noteCount: 3, created: true },
        { path: '/kb/topic-b', noteCount: 2, created: false },
      ],
    });
    const r = renderPage();
    await waitFor(() => expect(r.container.textContent).toContain('Import from tags'));
    const importBtn = Array.from(r.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Import from tags'),
    ) as HTMLButtonElement;
    fireEvent.click(importBtn);
    await waitFor(() => {
      expect(r.container.textContent).toContain('/kb/topic-a');
      expect(r.container.textContent).toContain('/kb/topic-b');
    });
  });

  it('shows import count summary in preview', async () => {
    setupImport({
      topicsCreated: 3,
      notesAttached: 7,
      perTopic: [{ path: '/a', noteCount: 7, created: true }],
    });
    const r = renderPage();
    await waitFor(() => expect(r.container.textContent).toContain('Import from tags'));
    const importBtn = Array.from(r.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Import from tags'),
    ) as HTMLButtonElement;
    fireEvent.click(importBtn);
    await waitFor(() => {
      // The summary says "3 topics would be created … 7 note attachments"
      expect(r.container.textContent).toContain('3');
      expect(r.container.textContent).toContain('7');
    });
  });

  it('shows error when import POST fails', async () => {
    setupImport(null, true);
    const r = renderPage();
    await waitFor(() => expect(r.container.textContent).toContain('Import from tags'));
    const importBtn = Array.from(r.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Import from tags'),
    ) as HTMLButtonElement;
    fireEvent.click(importBtn);
    await waitFor(() => {
      expect(r.container.textContent).toContain('import failed');
    });
  });

  it('clicking "Run import" triggers a non-dry-run POST', async () => {
    setupImport({
      topicsCreated: 1,
      notesAttached: 2,
      perTopic: [{ path: '/x', noteCount: 2, created: true }],
    });
    const r = renderPage();
    await waitFor(() => expect(r.container.textContent).toContain('Import from tags'));
    const importBtn = Array.from(r.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Import from tags'),
    ) as HTMLButtonElement;
    fireEvent.click(importBtn);
    await waitFor(() => {
      expect(r.container.textContent).toContain('/x');
    });
    const runBtn = Array.from(r.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Run import'),
    ) as HTMLButtonElement;
    fireEvent.click(runBtn);
    await waitFor(() => {
      const importCalls = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes('import-from-tags'),
      );
      // Dry-run on open + actual run on click
      expect(importCalls.length).toBeGreaterThanOrEqual(2);
      const lastCall = importCalls[importCalls.length - 1];
      const body = JSON.parse(lastCall[1]?.body as string);
      expect(body.dryRun).toBe(false);
    });
  });

  it('shows "Import complete" after successful non-dry-run', async () => {
    // First call (dry-run on mount) returns preview; subsequent (run) returns done
    let callCount = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('as=tree')) return makeRes({ success: true, data: { tree: DEFAULT_TREE } });
      if (url.includes('as=flat')) return makeRes({ success: true, data: { items: DEFAULT_FLAT } });
      if (url.includes('import-from-tags') && init?.method === 'POST') {
        callCount++;
        const body = JSON.parse(init?.body as string);
        if (body.dryRun) {
          return makeRes({
            success: true,
            data: { topicsCreated: 1, notesAttached: 2, perTopic: [{ path: '/a', noteCount: 2, created: true }] },
          });
        }
        return makeRes({ success: true, data: { topicsCreated: 1, notesAttached: 2, perTopic: [] } });
      }
      return makeRes({ success: true, data: {} });
    });
    const r = renderPage();
    await waitFor(() => expect(r.container.textContent).toContain('Import from tags'));
    const importBtn = Array.from(r.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Import from tags'),
    ) as HTMLButtonElement;
    fireEvent.click(importBtn);
    await waitFor(() => expect(r.container.textContent).toContain('/a'));
    const runBtn = Array.from(r.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Run import'),
    ) as HTMLButtonElement;
    fireEvent.click(runBtn);
    await waitFor(() => {
      expect(r.container.textContent).toContain('Import complete');
    });
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  it('clicking "Done" after import completes calls onDone and closes wizard', async () => {
    let callCount = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('as=tree')) return makeRes({ success: true, data: { tree: DEFAULT_TREE } });
      if (url.includes('as=flat')) return makeRes({ success: true, data: { items: DEFAULT_FLAT } });
      if (url.includes('import-from-tags') && init?.method === 'POST') {
        callCount++;
        return makeRes({ success: true, data: { topicsCreated: 1, notesAttached: 2, perTopic: [{ path: '/a', noteCount: 2, created: true }] } });
      }
      return makeRes({ success: true, data: {} });
    });
    const r = renderPage();
    await waitFor(() => expect(r.container.textContent).toContain('Import from tags'));
    const importBtn = Array.from(r.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Import from tags'),
    ) as HTMLButtonElement;
    fireEvent.click(importBtn);
    await waitFor(() => expect(r.container.textContent).toContain('/a'));
    const runBtn = Array.from(r.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Run import'),
    ) as HTMLButtonElement;
    fireEvent.click(runBtn);
    await waitFor(() => expect(r.container.textContent).toContain('Import complete'));
    const doneBtn = Array.from(r.container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Done' || b.textContent?.includes('Done'),
    ) as HTMLButtonElement;
    fireEvent.click(doneBtn);
    await waitFor(() => {
      expect(r.container.textContent).not.toContain('Import topics from tags');
    });
  });
});

// ─── TopicDetailPanel (via tree selection) ────────────────────────────────────

describe('TopicDetailPanel', () => {
  const TOPIC_DETAIL = {
    id: 1,
    name: 'Alpha',
    description: 'An alpha topic',
    color: '#ff0000',
    icon: 'folder',
    path: '/alpha',
    breadcrumb: [{ id: 1, name: 'Alpha' }],
  };

  function setupWithDetail(detail = TOPIC_DETAIL) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('as=tree')) return makeRes({ success: true, data: { tree: DEFAULT_TREE } });
      if (url.includes('as=flat')) return makeRes({ success: true, data: { items: DEFAULT_FLAT } });
      if (url === `/api/portal/brain/topics/${detail.id}`) {
        return makeRes({ success: true, data: detail });
      }
      if (url.includes(`/api/portal/brain/topics/${detail.id}/entities`)) {
        return makeRes({ success: true, data: { items: [], byType: {} } });
      }
      return makeRes({ success: true, data: {} });
    });
  }

  async function openDetail(detail = TOPIC_DETAIL) {
    setupWithDetail(detail);
    const r = renderPage();
    await waitFor(() =>
      expect(r.container.querySelector('[data-testid="topic-tree"]')).toBeTruthy(),
    );
    act(() => {
      (capturedTreeProps.onSelect as (node: { id: number }) => void)({ id: detail.id });
    });
    await waitFor(() => {
      expect(r.container.textContent).toContain(detail.name);
    });
    return r;
  }

  it('shows the topic name in the detail panel', async () => {
    const { container } = await openDetail();
    expect(container.textContent).toContain('Alpha');
  });

  it('shows the topic path', async () => {
    const { container } = await openDetail();
    expect(container.textContent).toContain('/alpha');
  });

  it('shows the description', async () => {
    const { container } = await openDetail();
    expect(container.textContent).toContain('An alpha topic');
  });

  it('shows "No entities attached yet." when entity list is empty', async () => {
    const { container } = await openDetail();
    await waitFor(() => {
      expect(container.textContent).toContain('No entities attached yet.');
    });
  });

  it('shows entities grouped by type when present', async () => {
    const detail = { ...TOPIC_DETAIL };
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('as=tree')) return makeRes({ success: true, data: { tree: DEFAULT_TREE } });
      if (url.includes('as=flat')) return makeRes({ success: true, data: { items: DEFAULT_FLAT } });
      if (url === `/api/portal/brain/topics/${detail.id}`) {
        return makeRes({ success: true, data: detail });
      }
      if (url.includes(`/api/portal/brain/topics/${detail.id}/entities`)) {
        return makeRes({
          success: true,
          data: {
            items: [{ entityType: 'note', entityId: 5, title: 'My Note' }],
            byType: {
              note: [{ entityType: 'note', entityId: 5, title: 'My Note' }],
            },
          },
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const r = renderPage();
    await waitFor(() =>
      expect(r.container.querySelector('[data-testid="topic-tree"]')).toBeTruthy(),
    );
    act(() => {
      (capturedTreeProps.onSelect as (node: { id: number }) => void)({ id: detail.id });
    });
    await waitFor(() => {
      expect(r.container.textContent).toContain('My Note');
    });
  });

  it('shows the Delete topic button', async () => {
    const { container } = await openDetail();
    await waitFor(() => {
      const del = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Delete topic'),
      );
      expect(del).toBeTruthy();
    });
  });

  it('clicking Delete topic triggers DELETE API', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('as=tree')) return makeRes({ success: true, data: { tree: DEFAULT_TREE } });
      if (url.includes('as=flat')) return makeRes({ success: true, data: { items: DEFAULT_FLAT } });
      if (url === `/api/portal/brain/topics/${TOPIC_DETAIL.id}` && !init?.method) {
        return makeRes({ success: true, data: TOPIC_DETAIL });
      }
      if (url.includes(`/api/portal/brain/topics/${TOPIC_DETAIL.id}/entities`)) {
        return makeRes({ success: true, data: { items: [], byType: {} } });
      }
      if (url.includes(`/api/portal/brain/topics/${TOPIC_DETAIL.id}`) && init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: {} });
    });
    const r = renderPage();
    await waitFor(() =>
      expect(r.container.querySelector('[data-testid="topic-tree"]')).toBeTruthy(),
    );
    act(() => {
      (capturedTreeProps.onSelect as (node: { id: number }) => void)({ id: TOPIC_DETAIL.id });
    });
    // path is rendered as text; name is in an input value
    await waitFor(() => expect(r.container.textContent).toContain('/alpha'));
    const del = Array.from(r.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Delete topic'),
    ) as HTMLButtonElement;
    fireEvent.click(del);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => `${c[1]?.method ?? 'GET'} ${c[0]}`);
      expect(calls.some((c) => c.includes('DELETE') && c.includes('/api/portal/brain/topics/'))).toBe(true);
    });
  });

  it('shows error state when topic detail load fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('as=tree')) return makeRes({ success: true, data: { tree: DEFAULT_TREE } });
      if (url.includes('as=flat')) return makeRes({ success: true, data: { items: DEFAULT_FLAT } });
      if (url === `/api/portal/brain/topics/${TOPIC_DETAIL.id}`) {
        return makeRes({ success: false, message: 'detail error' });
      }
      return makeRes({ success: true, data: {} });
    });
    const r = renderPage();
    await waitFor(() =>
      expect(r.container.querySelector('[data-testid="topic-tree"]')).toBeTruthy(),
    );
    act(() => {
      (capturedTreeProps.onSelect as (node: { id: number }) => void)({ id: TOPIC_DETAIL.id });
    });
    await waitFor(() => {
      expect(r.container.textContent).toContain('detail error');
    });
  });

  it('editing the name field and blurring fires PATCH if changed', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('as=tree')) return makeRes({ success: true, data: { tree: DEFAULT_TREE } });
      if (url.includes('as=flat')) return makeRes({ success: true, data: { items: DEFAULT_FLAT } });
      if (url === `/api/portal/brain/topics/${TOPIC_DETAIL.id}` && !init?.method) {
        return makeRes({ success: true, data: TOPIC_DETAIL });
      }
      if (url.includes(`/api/portal/brain/topics/${TOPIC_DETAIL.id}/entities`)) {
        return makeRes({ success: true, data: { items: [], byType: {} } });
      }
      if (url === `/api/portal/brain/topics/${TOPIC_DETAIL.id}` && init?.method === 'PATCH') {
        return makeRes({ success: true, data: { ...TOPIC_DETAIL, name: 'Updated' } });
      }
      return makeRes({ success: true, data: {} });
    });
    const r = renderPage();
    await waitFor(() =>
      expect(r.container.querySelector('[data-testid="topic-tree"]')).toBeTruthy(),
    );
    act(() => {
      (capturedTreeProps.onSelect as (node: { id: number }) => void)({ id: TOPIC_DETAIL.id });
    });
    await waitFor(() => expect(r.container.textContent).toContain('Alpha'));
    // Find the name input (flex-1 min-w-0 text-base font-semibold)
    const nameInput = r.container.querySelector(
      'input.flex-1.min-w-0.text-base',
    ) as HTMLInputElement;
    expect(nameInput).toBeTruthy();
    fireEvent.change(nameInput, { target: { value: 'Updated' } });
    fireEvent.blur(nameInput);
    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter(
        (c) => c[0] === `/api/portal/brain/topics/${TOPIC_DETAIL.id}` && c[1]?.method === 'PATCH',
      );
      expect(patchCalls.length).toBeGreaterThan(0);
    });
  });

  it('does NOT fire PATCH if name blurred unchanged', async () => {
    const r = renderPage();
    // Wait for tree to be available and open detail
    setupWithDetail();
    await waitFor(() =>
      expect(r.container.querySelector('[data-testid="topic-tree"]')).toBeTruthy(),
    );
    act(() => {
      (capturedTreeProps.onSelect as (node: { id: number }) => void)({ id: TOPIC_DETAIL.id });
    });
    await waitFor(() => expect(r.container.textContent).toContain('Alpha'));
    const nameInput = r.container.querySelector(
      'input.flex-1.min-w-0.text-base',
    ) as HTMLInputElement;
    // Value is already 'Alpha' — blur without changing
    fireEvent.blur(nameInput);
    await new Promise((res) => setTimeout(res, 50));
    const patchCalls = fetchMock.mock.calls.filter(
      (c) => c[0] === `/api/portal/brain/topics/${TOPIC_DETAIL.id}` && c[1]?.method === 'PATCH',
    );
    expect(patchCalls.length).toBe(0);
  });

  it('renders breadcrumb when present', async () => {
    const detailWithBreadcrumb = {
      ...TOPIC_DETAIL,
      breadcrumb: [
        { id: 0, name: 'Root' },
        { id: 1, name: 'Alpha' },
      ],
    };
    const { container } = await openDetail(detailWithBreadcrumb);
    expect(container.textContent).toContain('Root');
  });

  it('shows "50 more" when entity list exceeds 50', async () => {
    const detail = { ...TOPIC_DETAIL };
    const manyNotes = Array.from({ length: 55 }, (_, i) => ({
      entityType: 'note' as const,
      entityId: i,
      title: `Note ${i}`,
    }));
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('as=tree')) return makeRes({ success: true, data: { tree: DEFAULT_TREE } });
      if (url.includes('as=flat')) return makeRes({ success: true, data: { items: DEFAULT_FLAT } });
      if (url === `/api/portal/brain/topics/${detail.id}`) {
        return makeRes({ success: true, data: detail });
      }
      if (url.includes(`/api/portal/brain/topics/${detail.id}/entities`)) {
        return makeRes({
          success: true,
          data: {
            items: manyNotes,
            byType: { note: manyNotes },
          },
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const r = renderPage();
    await waitFor(() =>
      expect(r.container.querySelector('[data-testid="topic-tree"]')).toBeTruthy(),
    );
    act(() => {
      (capturedTreeProps.onSelect as (node: { id: number }) => void)({ id: detail.id });
    });
    await waitFor(() => {
      expect(r.container.textContent).toContain('more');
    });
  });
});

// ─── Mutation handlers (move, rename, delete, merge via tree props) ───────────

describe('BrainTopicsAdminPage — mutation handlers via tree props', () => {
  it('onMove calls POST /move endpoint', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('as=tree')) return makeRes({ success: true, data: { tree: DEFAULT_TREE } });
      if (url.includes('as=flat')) return makeRes({ success: true, data: { items: DEFAULT_FLAT } });
      if (url.includes('/move') && init?.method === 'POST') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: {} });
    });
    renderPage();
    await waitFor(() => expect(typeof capturedTreeProps.onMove).toBe('function'));
    await act(async () => {
      await (capturedTreeProps.onMove as (sourceId: number, newParentId: number | null) => Promise<void>)(1, null);
    });
    const moveCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/move'));
    expect(moveCalls.length).toBeGreaterThan(0);
  });

  it('onRename calls PATCH endpoint', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('as=tree')) return makeRes({ success: true, data: { tree: DEFAULT_TREE } });
      if (url.includes('as=flat')) return makeRes({ success: true, data: { items: DEFAULT_FLAT } });
      if (init?.method === 'PATCH') return makeRes({ success: true });
      return makeRes({ success: true, data: {} });
    });
    renderPage();
    await waitFor(() => expect(typeof capturedTreeProps.onRename).toBe('function'));
    await act(async () => {
      await (capturedTreeProps.onRename as (id: number, newName: string) => Promise<void>)(1, 'Renamed');
    });
    const patchCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === 'PATCH');
    expect(patchCalls.length).toBeGreaterThan(0);
  });

  it('onDelete calls DELETE endpoint', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('as=tree')) return makeRes({ success: true, data: { tree: DEFAULT_TREE } });
      if (url.includes('as=flat')) return makeRes({ success: true, data: { items: DEFAULT_FLAT } });
      if (init?.method === 'DELETE') return makeRes({ success: true });
      return makeRes({ success: true, data: {} });
    });
    renderPage();
    await waitFor(() => expect(typeof capturedTreeProps.onDelete).toBe('function'));
    await act(async () => {
      await (capturedTreeProps.onDelete as (id: number, opts: { force: boolean }) => Promise<void>)(1, { force: false });
    });
    const deleteCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === 'DELETE');
    expect(deleteCalls.length).toBeGreaterThan(0);
  });

  it('onMerge calls POST /merge endpoint', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('as=tree')) return makeRes({ success: true, data: { tree: DEFAULT_TREE } });
      if (url.includes('as=flat')) return makeRes({ success: true, data: { items: DEFAULT_FLAT } });
      if (url.includes('/merge') && init?.method === 'POST') return makeRes({ success: true });
      return makeRes({ success: true, data: {} });
    });
    renderPage();
    await waitFor(() => expect(typeof capturedTreeProps.onMerge).toBe('function'));
    await act(async () => {
      await (capturedTreeProps.onMerge as (sourceId: number, targetId: number) => Promise<void>)(1, 2);
    });
    const mergeCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/merge'));
    expect(mergeCalls.length).toBeGreaterThan(0);
  });

  it('onMove sets error on failure', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('as=tree')) return makeRes({ success: true, data: { tree: DEFAULT_TREE } });
      if (url.includes('as=flat')) return makeRes({ success: true, data: { items: DEFAULT_FLAT } });
      if (url.includes('/move') && init?.method === 'POST') {
        return makeRes({ success: false, message: 'move failed' }, false);
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(typeof capturedTreeProps.onMove).toBe('function'));
    await act(async () => {
      await (capturedTreeProps.onMove as (sourceId: number, newParentId: number | null) => Promise<void>)(1, null);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('move failed');
    });
  });

  it('onRename sets error on failure', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('as=tree')) return makeRes({ success: true, data: { tree: DEFAULT_TREE } });
      if (url.includes('as=flat')) return makeRes({ success: true, data: { items: DEFAULT_FLAT } });
      if (init?.method === 'PATCH') {
        return makeRes({ success: false, message: 'rename failed' }, false);
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(typeof capturedTreeProps.onRename).toBe('function'));
    await act(async () => {
      await (capturedTreeProps.onRename as (id: number, newName: string) => Promise<void>)(1, 'New');
    });
    await waitFor(() => {
      expect(container.textContent).toContain('rename failed');
    });
  });

  it('onDelete sets error on failure', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('as=tree')) return makeRes({ success: true, data: { tree: DEFAULT_TREE } });
      if (url.includes('as=flat')) return makeRes({ success: true, data: { items: DEFAULT_FLAT } });
      if (init?.method === 'DELETE') {
        return makeRes({ success: false, message: 'delete failed' }, false);
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(typeof capturedTreeProps.onDelete).toBe('function'));
    await act(async () => {
      await (capturedTreeProps.onDelete as (id: number, opts: { force: boolean }) => Promise<void>)(1, { force: false });
    });
    await waitFor(() => {
      expect(container.textContent).toContain('delete failed');
    });
  });

  it('onMerge sets error on failure', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('as=tree')) return makeRes({ success: true, data: { tree: DEFAULT_TREE } });
      if (url.includes('as=flat')) return makeRes({ success: true, data: { items: DEFAULT_FLAT } });
      if (url.includes('/merge') && init?.method === 'POST') {
        return makeRes({ success: false, message: 'merge failed' }, false);
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(typeof capturedTreeProps.onMerge).toBe('function'));
    await act(async () => {
      await (capturedTreeProps.onMerge as (sourceId: number, targetId: number) => Promise<void>)(1, 2);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('merge failed');
    });
  });

  it('onDelete clears selectedId when deleted topic was selected', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('as=tree')) return makeRes({ success: true, data: { tree: DEFAULT_TREE } });
      if (url.includes('as=flat')) return makeRes({ success: true, data: { items: DEFAULT_FLAT } });
      if (url === '/api/portal/brain/topics/1' && !init?.method) {
        return makeRes({ success: true, data: { id: 1, name: 'Alpha', description: null, color: null, icon: null, path: '/alpha', breadcrumb: [] } });
      }
      if (url.includes('/api/portal/brain/topics/1/entities')) {
        return makeRes({ success: true, data: { items: [], byType: {} } });
      }
      if (init?.method === 'DELETE') return makeRes({ success: true });
      return makeRes({ success: true, data: {} });
    });
    const r = renderPage();
    await waitFor(() =>
      expect(r.container.querySelector('[data-testid="topic-tree"]')).toBeTruthy(),
    );
    // Select topic 1
    act(() => {
      (capturedTreeProps.onSelect as (node: { id: number }) => void)({ id: 1 });
    });
    // The name input value won't be in textContent; wait for path (which IS text)
    await waitFor(() => expect(r.container.textContent).toContain('/alpha'));
    // Now delete the selected topic
    await act(async () => {
      await (capturedTreeProps.onDelete as (id: number, opts: { force: boolean }) => Promise<void>)(1, { force: false });
    });
    // After delete, should show the "Select a topic" placeholder again
    await waitFor(() => {
      expect(r.container.textContent).toContain('Select a topic to see its details');
    });
  });

  it('onMerge updates selectedId to targetId when source was selected', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('as=tree')) return makeRes({ success: true, data: { tree: DEFAULT_TREE } });
      if (url.includes('as=flat')) return makeRes({ success: true, data: { items: DEFAULT_FLAT } });
      if (url === '/api/portal/brain/topics/1' && !init?.method) {
        return makeRes({ success: true, data: { id: 1, name: 'Alpha', description: null, color: null, icon: null, path: '/alpha', breadcrumb: [] } });
      }
      if (url === '/api/portal/brain/topics/2' && !init?.method) {
        return makeRes({ success: true, data: { id: 2, name: 'Beta', description: null, color: null, icon: null, path: '/beta', breadcrumb: [] } });
      }
      if (url.includes('/entities')) {
        return makeRes({ success: true, data: { items: [], byType: {} } });
      }
      if (url.includes('/merge') && init?.method === 'POST') return makeRes({ success: true });
      return makeRes({ success: true, data: {} });
    });
    const r = renderPage();
    await waitFor(() =>
      expect(r.container.querySelector('[data-testid="topic-tree"]')).toBeTruthy(),
    );
    // Select topic 1
    act(() => {
      (capturedTreeProps.onSelect as (node: { id: number }) => void)({ id: 1 });
    });
    // The name input value won't be in textContent; wait for path (which IS text)
    await waitFor(() => expect(r.container.textContent).toContain('/alpha'));
    // Merge topic 1 into topic 2 — selection should shift to 2
    await act(async () => {
      await (capturedTreeProps.onMerge as (sourceId: number, targetId: number) => Promise<void>)(1, 2);
    });
    // Detail for topic 2 should now be fetched
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u === '/api/portal/brain/topics/2')).toBe(true);
    });
  });
});
