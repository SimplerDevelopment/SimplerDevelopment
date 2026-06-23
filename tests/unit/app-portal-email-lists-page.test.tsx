// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks (before page import)
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/portal/email/lists',
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

type FetchResp = { ok: boolean; json: () => Promise<unknown> };

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, json: async () => body };
}

function makeListRes(lists: unknown[]) {
  return makeRes({ success: true, data: lists });
}

function makeSubRes(subs: unknown[], total?: number) {
  return makeRes({ success: true, data: subs, total: total ?? subs.length });
}

// ---------------------------------------------------------------------------
// Data factories
// ---------------------------------------------------------------------------

function makeList(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: `List ${id}`,
    description: null,
    subscriberCount: 0,
    ...extra,
  };
}

function makeSub(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    email: `user${id}@example.com`,
    name: null,
    status: 'active',
    subscribedAt: '2025-01-01T00:00:00Z',
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Default fetch implementation — lists endpoint returns empty, subs empty
// ---------------------------------------------------------------------------

function installDefaultFetch() {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/portal/email/lists' && (!init || !init.method || init.method === 'GET')) {
      return makeListRes([]);
    }
    if (url.includes('/api/portal/email/lists/') && (!init?.method || init.method === 'GET' || init.method === 'DELETE')) {
      if (init?.method === 'DELETE') return makeRes({ success: true });
      return makeSubRes([]);
    }
    if (url === '/api/portal/email/lists' && init?.method === 'POST') {
      return makeRes({ success: true, data: { id: 99, name: 'New List' } });
    }
    if (url === '/api/portal/email/subscribers' && init?.method === 'POST') {
      return makeRes({ success: true, data: { id: 1 } });
    }
    if (url === '/api/portal/email/subscribers' && init?.method === 'PUT') {
      return makeRes({ success: true, data: { imported: 1, total: 1 } });
    }
    if (url.includes('/api/portal/email/subscribers') && init?.method === 'DELETE') {
      return makeRes({ success: true });
    }
    return makeRes({ success: true });
  });
  vi.stubGlobal('fetch', fetchMock);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let savedAlert: typeof window.alert;
let savedConfirm: typeof window.confirm;

beforeEach(() => {
  savedAlert = window.alert;
  savedConfirm = window.confirm;
  window.alert = vi.fn();
  window.confirm = vi.fn(() => true);
  installDefaultFetch();
});

afterEach(() => {
  window.alert = savedAlert;
  window.confirm = savedConfirm;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import PortalEmailListsPage from '@/app/portal/email/lists/page';

function renderPage() {
  return render(<PortalEmailListsPage />);
}

// ---------------------------------------------------------------------------
// Basic render / loading
// ---------------------------------------------------------------------------

describe('PortalEmailListsPage — initial render', () => {
  it('renders the page heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Subscriber Lists');
    });
  });

  it('renders the sub-heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Manage your email lists and contacts');
    });
  });

  it('shows Loading… while lists are fetching', () => {
    let resolve: (v: FetchResp) => void = () => {};
    fetchMock.mockImplementationOnce(
      () => new Promise<FetchResp>((res) => { resolve = res; }),
    );
    const { container } = renderPage();
    expect(container.textContent).toContain('Loading');
    // resolve so we don't leak the promise
    resolve(makeListRes([]));
  });

  it('shows empty-state message when no lists exist', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No lists yet. Create one above.');
    });
  });

  it('renders the "New List" button', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('New List');
    });
  });

  it('renders a back link to /portal/email', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/email"]');
      expect(link).toBeTruthy();
    });
  });

  it('shows "Select a list" placeholder in subscriber pane', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Select a list');
    });
  });

  it('shows the prompt to click a list when none is selected', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Click a list to view and manage subscribers.');
    });
  });
});

// ---------------------------------------------------------------------------
// Lists table
// ---------------------------------------------------------------------------

describe('PortalEmailListsPage — lists table', () => {
  it('renders list names after fetch', async () => {
    fetchMock.mockImplementationOnce(async () => makeListRes([makeList(1), makeList(2)]));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('List 1');
      expect(container.textContent).toContain('List 2');
    });
  });

  it('renders subscriber count (singular)', async () => {
    fetchMock.mockImplementationOnce(async () =>
      makeListRes([makeList(1, { subscriberCount: 1 })]),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('1 subscriber');
    });
  });

  it('renders subscriber count (plural)', async () => {
    fetchMock.mockImplementationOnce(async () =>
      makeListRes([makeList(1, { subscriberCount: 3 })]),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('3 subscribers');
    });
  });

  it('renders list description when present', async () => {
    fetchMock.mockImplementationOnce(async () =>
      makeListRes([makeList(1, { description: 'My newsletter' })]),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('My newsletter');
    });
  });

  it('renders a delete button for each list', async () => {
    fetchMock.mockImplementationOnce(async () =>
      makeListRes([makeList(1), makeList(2)]),
    );
    const { container } = renderPage();
    await waitFor(() => {
      const deleteIcons = Array.from(container.querySelectorAll('span.material-icons')).filter(
        (el) => el.textContent === 'delete',
      );
      expect(deleteIcons.length).toBe(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Create list form
// ---------------------------------------------------------------------------

describe('PortalEmailListsPage — create list form', () => {
  it('toggles the create form when New List is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New List'));
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('New List'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      expect(container.textContent).toContain('Create List');
    });
  });

  it('hides the form when Cancel is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New List'));
    const newListBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('New List'),
    ) as HTMLButtonElement;
    fireEvent.click(newListBtn);
    await waitFor(() => expect(container.textContent).toContain('Create List'));
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Create List');
    });
  });

  it('submits the create form and appends the new list', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/email/lists' && (!init?.method || init.method === 'GET')) {
        return makeListRes([]);
      }
      if (url === '/api/portal/email/lists' && init?.method === 'POST') {
        return makeRes({ success: true, data: { id: 99, name: 'Newsletter', description: null } });
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New List'));
    const newListBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('New List'),
    ) as HTMLButtonElement;
    fireEvent.click(newListBtn);
    await waitFor(() => expect(container.textContent).toContain('Create List'));
    const nameInput = container.querySelector('input[placeholder="e.g. Newsletter"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Newsletter' } });
    const submitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Create List'),
    ) as HTMLButtonElement;
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Newsletter');
    });
  });

  it('shows error message when create list fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/email/lists' && (!init?.method || init.method === 'GET')) {
        return makeListRes([]);
      }
      if (url === '/api/portal/email/lists' && init?.method === 'POST') {
        return makeRes({ success: false, message: 'Name is required' });
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New List'));
    const newListBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('New List'),
    ) as HTMLButtonElement;
    fireEvent.click(newListBtn);
    await waitFor(() => expect(container.textContent).toContain('Create List'));
    const nameInput = container.querySelector('input[placeholder="e.g. Newsletter"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Test' } });
    const submitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Create List'),
    ) as HTMLButtonElement;
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Name is required');
    });
  });

  it('shows Creating… on the submit button while saving', async () => {
    let resolvePost: (v: FetchResp) => void = () => {};
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/email/lists' && (!init?.method || init.method === 'GET')) {
        return makeListRes([]);
      }
      if (url === '/api/portal/email/lists' && init?.method === 'POST') {
        return new Promise<FetchResp>((res) => { resolvePost = res; });
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New List'));
    const newListBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('New List'),
    ) as HTMLButtonElement;
    fireEvent.click(newListBtn);
    await waitFor(() => expect(container.textContent).toContain('Create List'));
    const nameInput = container.querySelector('input[placeholder="e.g. Newsletter"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Test' } });
    const submitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Create List'),
    ) as HTMLButtonElement;
    fireEvent.click(submitBtn);
    expect(container.textContent).toContain('Creating');
    resolvePost(makeRes({ success: true, data: { id: 1, name: 'Test' } }));
  });
});

// ---------------------------------------------------------------------------
// Delete list
// ---------------------------------------------------------------------------

describe('PortalEmailListsPage — delete list', () => {
  it('removes a list when delete is confirmed', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/email/lists' && (!init?.method || init.method === 'GET')) {
        return makeListRes([makeList(5, { name: 'ToDelete' })]);
      }
      if (url.includes('/api/portal/email/lists/5') && init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ToDelete'));
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.querySelector('span.material-icons')?.textContent === 'delete',
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(container.textContent).not.toContain('ToDelete');
    });
    expect(window.confirm).toHaveBeenCalled();
  });

  it('does NOT remove the list when delete is cancelled', async () => {
    window.confirm = vi.fn(() => false);
    fetchMock.mockImplementationOnce(async () =>
      makeListRes([makeList(6, { name: 'KeepMe' })]),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('KeepMe'));
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.querySelector('span.material-icons')?.textContent === 'delete',
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('KeepMe');
    });
  });
});

// ---------------------------------------------------------------------------
// Select a list — subscriber pane
// ---------------------------------------------------------------------------

describe('PortalEmailListsPage — subscriber pane', () => {
  function setupWithList(subs: unknown[] = [], total?: number) {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/email/lists' && (!init?.method || init.method === 'GET')) {
        return makeListRes([makeList(1, { name: 'Newsletter', subscriberCount: subs.length })]);
      }
      if (url.includes('/api/portal/email/lists/1') && (!init?.method || init.method === 'GET')) {
        return makeSubRes(subs, total);
      }
      return makeRes({ success: true });
    });
  }

  it('shows list name as pane header when selected', async () => {
    setupWithList();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Newsletter'));
    const listRow = Array.from(container.querySelectorAll('div[class*="cursor-pointer"]')).find(
      (el) => el.textContent?.includes('Newsletter'),
    ) as HTMLElement;
    fireEvent.click(listRow);
    await waitFor(() => {
      // The subscriber pane's h2 should contain the list name.
      // There are two h2 elements: "Lists" and the selected-list name.
      const h2s = Array.from(container.querySelectorAll('h2'));
      const subPaneH2 = h2s.find((el) => el.textContent?.includes('Newsletter'));
      expect(subPaneH2).toBeTruthy();
    });
  });

  it('shows "No subscribers yet." when list is empty', async () => {
    setupWithList([]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Newsletter'));
    const listRow = Array.from(container.querySelectorAll('div[class*="cursor-pointer"]')).find(
      (el) => el.textContent?.includes('Newsletter'),
    ) as HTMLElement;
    fireEvent.click(listRow);
    await waitFor(() => {
      expect(container.textContent).toContain('No subscribers yet.');
    });
  });

  it('renders subscriber email addresses', async () => {
    setupWithList([makeSub(1), makeSub(2)]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Newsletter'));
    const listRow = Array.from(container.querySelectorAll('div[class*="cursor-pointer"]')).find(
      (el) => el.textContent?.includes('Newsletter'),
    ) as HTMLElement;
    fireEvent.click(listRow);
    await waitFor(() => {
      expect(container.textContent).toContain('user1@example.com');
      expect(container.textContent).toContain('user2@example.com');
    });
  });

  it('renders subscriber name when present', async () => {
    setupWithList([makeSub(1, { name: 'Alice Smith' })]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Newsletter'));
    const listRow = Array.from(container.querySelectorAll('div[class*="cursor-pointer"]')).find(
      (el) => el.textContent?.includes('Newsletter'),
    ) as HTMLElement;
    fireEvent.click(listRow);
    await waitFor(() => {
      expect(container.textContent).toContain('Alice Smith');
    });
  });

  it('renders status badges with correct colors', async () => {
    setupWithList([
      makeSub(1, { status: 'active' }),
      makeSub(2, { status: 'unsubscribed' }),
      makeSub(3, { status: 'bounced' }),
      makeSub(4, { status: 'complained' }),
    ]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Newsletter'));
    const listRow = Array.from(container.querySelectorAll('div[class*="cursor-pointer"]')).find(
      (el) => el.textContent?.includes('Newsletter'),
    ) as HTMLElement;
    fireEvent.click(listRow);
    await waitFor(() => {
      expect(container.textContent).toContain('active');
      expect(container.textContent).toContain('unsubscribed');
      expect(container.textContent).toContain('bounced');
      expect(container.textContent).toContain('complained');
    });
  });

  it('shows Import CSV button when a list is selected', async () => {
    setupWithList();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Newsletter'));
    const listRow = Array.from(container.querySelectorAll('div[class*="cursor-pointer"]')).find(
      (el) => el.textContent?.includes('Newsletter'),
    ) as HTMLElement;
    fireEvent.click(listRow);
    await waitFor(() => {
      expect(container.textContent).toContain('Import CSV');
    });
  });

  it('renders the add-subscriber form with email and name inputs', async () => {
    setupWithList();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Newsletter'));
    const listRow = Array.from(container.querySelectorAll('div[class*="cursor-pointer"]')).find(
      (el) => el.textContent?.includes('Newsletter'),
    ) as HTMLElement;
    fireEvent.click(listRow);
    await waitFor(() => {
      expect(container.querySelector('input[placeholder="Email address"]')).toBeTruthy();
      expect(container.querySelector('input[placeholder="Name"]')).toBeTruthy();
    });
  });

  it('renders the search and status-filter inputs', async () => {
    setupWithList();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Newsletter'));
    const listRow = Array.from(container.querySelectorAll('div[class*="cursor-pointer"]')).find(
      (el) => el.textContent?.includes('Newsletter'),
    ) as HTMLElement;
    fireEvent.click(listRow);
    await waitFor(() => {
      expect(container.querySelector('input[type="search"]')).toBeTruthy();
      expect(container.querySelector('select')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Add subscriber
// ---------------------------------------------------------------------------

describe('PortalEmailListsPage — add subscriber', () => {
  function setupWithList() {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/email/lists' && (!init?.method || init.method === 'GET')) {
        return makeListRes([makeList(1, { name: 'Newsletter', subscriberCount: 0 })]);
      }
      if (url.includes('/api/portal/email/lists/1')) {
        return makeSubRes([]);
      }
      if (url === '/api/portal/email/subscribers' && init?.method === 'POST') {
        return makeRes({ success: true, data: { id: 10 } });
      }
      return makeRes({ success: true });
    });
  }

  async function openList(container: HTMLElement) {
    await waitFor(() => expect(container.textContent).toContain('Newsletter'));
    const listRow = Array.from(container.querySelectorAll('div[class*="cursor-pointer"]')).find(
      (el) => el.textContent?.includes('Newsletter'),
    ) as HTMLElement;
    fireEvent.click(listRow);
    await waitFor(() => {
      expect(container.querySelector('input[placeholder="Email address"]')).toBeTruthy();
    });
  }

  it('adds a subscriber on form submit', async () => {
    setupWithList();
    const { container } = renderPage();
    await openList(container);
    const emailInput = container.querySelector('input[placeholder="Email address"]') as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'new@example.com' } });
    const addBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(addBtn);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u === '/api/portal/email/subscribers')).toBe(true);
    });
  });

  it('shows error when add subscriber fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/email/lists' && (!init?.method || init.method === 'GET')) {
        return makeListRes([makeList(1, { name: 'Newsletter' })]);
      }
      if (url.includes('/api/portal/email/lists/1')) {
        return makeSubRes([]);
      }
      if (url === '/api/portal/email/subscribers' && init?.method === 'POST') {
        return makeRes({ success: false, message: 'Email already subscribed' });
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await openList(container);
    const emailInput = container.querySelector('input[placeholder="Email address"]') as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'dup@example.com' } });
    const addBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(addBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Email already subscribed');
    });
  });
});

// ---------------------------------------------------------------------------
// Remove subscriber
// ---------------------------------------------------------------------------

describe('PortalEmailListsPage — remove subscriber', () => {
  it('removes subscriber from list on delete confirm', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/email/lists' && (!init?.method || init.method === 'GET')) {
        return makeListRes([makeList(1, { name: 'Newsletter', subscriberCount: 1 })]);
      }
      if (url.includes('/api/portal/email/lists/1') && (!init?.method || init.method === 'GET')) {
        return makeSubRes([makeSub(42)]);
      }
      if (url.includes('/api/portal/email/subscribers?id=42') && init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Newsletter'));
    const listRow = Array.from(container.querySelectorAll('div[class*="cursor-pointer"]')).find(
      (el) => el.textContent?.includes('Newsletter'),
    ) as HTMLElement;
    fireEvent.click(listRow);
    await waitFor(() => {
      expect(container.textContent).toContain('user42@example.com');
    });
    // Click the close (remove) button for that subscriber
    const closeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.querySelector('span.material-icons')?.textContent === 'close',
    ) as HTMLButtonElement;
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(container.textContent).not.toContain('user42@example.com');
    });
    expect(window.confirm).toHaveBeenCalledWith('Remove this subscriber?');
  });

  it('does not remove subscriber when confirm returns false', async () => {
    window.confirm = vi.fn(() => false);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/email/lists' && (!init?.method || init.method === 'GET')) {
        return makeListRes([makeList(1, { name: 'Newsletter', subscriberCount: 1 })]);
      }
      if (url.includes('/api/portal/email/lists/1') && (!init?.method || init.method === 'GET')) {
        return makeSubRes([makeSub(99)]);
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Newsletter'));
    const listRow = Array.from(container.querySelectorAll('div[class*="cursor-pointer"]')).find(
      (el) => el.textContent?.includes('Newsletter'),
    ) as HTMLElement;
    fireEvent.click(listRow);
    await waitFor(() => expect(container.textContent).toContain('user99@example.com'));
    const closeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.querySelector('span.material-icons')?.textContent === 'close',
    ) as HTMLButtonElement;
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('user99@example.com');
    });
  });
});

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

describe('PortalEmailListsPage — CSV import', () => {
  function setupWithListAndCsv(importResponse: unknown) {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/email/lists' && (!init?.method || init.method === 'GET')) {
        return makeListRes([makeList(1, { name: 'Newsletter', subscriberCount: 0 })]);
      }
      if (url.includes('/api/portal/email/lists/1') && (!init?.method || init.method === 'GET')) {
        return makeSubRes([]);
      }
      if (url === '/api/portal/email/subscribers' && init?.method === 'PUT') {
        return makeRes(importResponse);
      }
      return makeRes({ success: true });
    });
  }

  async function openCsvPanel(container: HTMLElement) {
    await waitFor(() => expect(container.textContent).toContain('Newsletter'));
    const listRow = Array.from(container.querySelectorAll('div[class*="cursor-pointer"]')).find(
      (el) => el.textContent?.includes('Newsletter'),
    ) as HTMLElement;
    fireEvent.click(listRow);
    await waitFor(() => expect(container.textContent).toContain('Import CSV'));
    const importBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Import CSV'),
    ) as HTMLButtonElement;
    fireEvent.click(importBtn);
    await waitFor(() => {
      expect(container.querySelector('textarea')).toBeTruthy();
    });
  }

  it('shows the CSV textarea when Import CSV is clicked', async () => {
    setupWithListAndCsv({ success: true, data: { imported: 0, total: 0 } });
    const { container } = renderPage();
    await openCsvPanel(container);
    expect(container.querySelector('textarea')).toBeTruthy();
  });

  it('hides the CSV panel when Cancel is clicked', async () => {
    setupWithListAndCsv({ success: true, data: { imported: 0, total: 0 } });
    const { container } = renderPage();
    await openCsvPanel(container);
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(container.querySelector('textarea')).toBeFalsy();
    });
  });

  it('imports CSV and shows alert with result', async () => {
    setupWithListAndCsv({ success: true, data: { imported: 2, total: 2 } });
    const { container } = renderPage();
    await openCsvPanel(container);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: 'email,name\nalice@example.com,Alice\nbob@example.com,Bob' },
    });
    const importSubmitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Import',
    ) as HTMLButtonElement;
    fireEvent.click(importSubmitBtn);
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('Imported 2 of 2 subscribers.');
    });
  });

  it('shows error when CSV import fails', async () => {
    setupWithListAndCsv({ success: false, message: 'Import failed: bad data' });
    const { container } = renderPage();
    await openCsvPanel(container);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: 'email,name\nbadrow' },
    });
    const importSubmitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Import',
    ) as HTMLButtonElement;
    fireEvent.click(importSubmitBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Import failed: bad data');
    });
  });

  it('Import button is disabled when textarea is empty', async () => {
    setupWithListAndCsv({ success: true, data: { imported: 0, total: 0 } });
    const { container } = renderPage();
    await openCsvPanel(container);
    const importSubmitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Import',
    ) as HTMLButtonElement;
    expect(importSubmitBtn.disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

describe('PortalEmailListsPage — pagination', () => {
  it('shows pagination controls when total > 50', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/email/lists' && (!init?.method || init.method === 'GET')) {
        return makeListRes([makeList(1, { name: 'BigList', subscriberCount: 100 })]);
      }
      if (url.includes('/api/portal/email/lists/1')) {
        return makeSubRes([makeSub(1), makeSub(2)], 100);
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('BigList'));
    const listRow = Array.from(container.querySelectorAll('div[class*="cursor-pointer"]')).find(
      (el) => el.textContent?.includes('BigList'),
    ) as HTMLElement;
    fireEvent.click(listRow);
    await waitFor(() => {
      expect(container.textContent).toContain('Page 1');
      expect(container.textContent).toContain('Prev');
      expect(container.textContent).toContain('Next');
    });
  });

  it('does NOT show pagination when total <= 50', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/email/lists' && (!init?.method || init.method === 'GET')) {
        return makeListRes([makeList(1, { name: 'SmallList', subscriberCount: 10 })]);
      }
      if (url.includes('/api/portal/email/lists/1')) {
        return makeSubRes([makeSub(1)], 10);
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('SmallList'));
    const listRow = Array.from(container.querySelectorAll('div[class*="cursor-pointer"]')).find(
      (el) => el.textContent?.includes('SmallList'),
    ) as HTMLElement;
    fireEvent.click(listRow);
    await waitFor(() => {
      expect(container.textContent).toContain('user1@example.com');
    });
    expect(container.textContent).not.toContain('Prev');
    expect(container.textContent).not.toContain('Next');
  });

  it('Prev button is disabled on first page', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/email/lists' && (!init?.method || init.method === 'GET')) {
        return makeListRes([makeList(1, { name: 'BigList', subscriberCount: 100 })]);
      }
      if (url.includes('/api/portal/email/lists/1')) {
        return makeSubRes([makeSub(1)], 100);
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('BigList'));
    const listRow = Array.from(container.querySelectorAll('div[class*="cursor-pointer"]')).find(
      (el) => el.textContent?.includes('BigList'),
    ) as HTMLElement;
    fireEvent.click(listRow);
    await waitFor(() => expect(container.textContent).toContain('Prev'));
    const prevBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Prev',
    ) as HTMLButtonElement;
    expect(prevBtn.disabled).toBe(true);
  });

  it('clicking Next advances to page 2', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/email/lists' && (!init?.method || init.method === 'GET')) {
        return makeListRes([makeList(1, { name: 'BigList', subscriberCount: 100 })]);
      }
      if (url.includes('/api/portal/email/lists/1')) {
        return makeSubRes([makeSub(1)], 100);
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('BigList'));
    const listRow = Array.from(container.querySelectorAll('div[class*="cursor-pointer"]')).find(
      (el) => el.textContent?.includes('BigList'),
    ) as HTMLElement;
    fireEvent.click(listRow);
    await waitFor(() => expect(container.textContent).toContain('Next'));
    const nextBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Next',
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(nextBtn);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Page 2');
    });
  });
});

// ---------------------------------------------------------------------------
// Search / filter
// ---------------------------------------------------------------------------

describe('PortalEmailListsPage — search and status filter', () => {
  it('typing in search fires a fetch with search param (after debounce)', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/email/lists' && (!init?.method || init.method === 'GET')) {
        return makeListRes([makeList(1, { name: 'FilterList' })]);
      }
      return makeSubRes([]);
    });
    const { container } = renderPage();
    // Open the list first with real timers
    await waitFor(() => expect(container.textContent).toContain('FilterList'));
    const listRow = Array.from(container.querySelectorAll('div[class*="cursor-pointer"]')).find(
      (el) => el.textContent?.includes('FilterList'),
    ) as HTMLElement;
    fireEvent.click(listRow);
    await waitFor(() => {
      expect(container.querySelector('input[type="search"]')).toBeTruthy();
    });
    // Now use fake timers just for the debounce
    vi.useFakeTimers();
    const searchInput = container.querySelector('input[type="search"]') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'alice' } });
    // advance debounce
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('search=alice'))).toBe(true);
    });
  });

  it('"No subscribers match." appears when search returns empty', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/email/lists' && (!init?.method || init.method === 'GET')) {
        return makeListRes([makeList(1, { name: 'FilterList' })]);
      }
      return makeSubRes([]);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('FilterList'));
    const listRow = Array.from(container.querySelectorAll('div[class*="cursor-pointer"]')).find(
      (el) => el.textContent?.includes('FilterList'),
    ) as HTMLElement;
    fireEvent.click(listRow);
    await waitFor(() => {
      expect(container.querySelector('input[type="search"]')).toBeTruthy();
    });
    vi.useFakeTimers();
    const searchInput = container.querySelector('input[type="search"]') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'zzznomatch' } });
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    await waitFor(() => {
      expect(container.textContent).toContain('No subscribers match.');
    });
  });

  it('selecting a status filter fires a fetch with status param', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/email/lists' && (!init?.method || init.method === 'GET')) {
        return makeListRes([makeList(1, { name: 'FilterList' })]);
      }
      return makeSubRes([]);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('FilterList'));
    const listRow = Array.from(container.querySelectorAll('div[class*="cursor-pointer"]')).find(
      (el) => el.textContent?.includes('FilterList'),
    ) as HTMLElement;
    fireEvent.click(listRow);
    await waitFor(() => {
      expect(container.querySelector('select')).toBeTruthy();
    });
    const select = container.querySelector('select') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: 'bounced' } });
    });
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('status=bounced'))).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Loading state for subscriber pane
// ---------------------------------------------------------------------------

describe('PortalEmailListsPage — subscriber pane loading', () => {
  it('shows Loading… in subscriber pane while fetching subscribers', async () => {
    let resolveSubFetch: (v: FetchResp) => void = () => {};
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/email/lists' && (!init?.method || init.method === 'GET')) {
        return makeListRes([makeList(1, { name: 'Newsletter' })]);
      }
      if (url.includes('/api/portal/email/lists/1')) {
        return new Promise<FetchResp>((res) => { resolveSubFetch = res; });
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Newsletter'));
    const listRow = Array.from(container.querySelectorAll('div[class*="cursor-pointer"]')).find(
      (el) => el.textContent?.includes('Newsletter'),
    ) as HTMLElement;
    // Click the list row — this triggers the subscriber fetch which is pending
    fireEvent.click(listRow);
    // The loading state appears synchronously via React state update.
    // Use act to flush the synchronous state updates, then check.
    await act(async () => {});
    expect(container.textContent).toContain('Loading');
    // Resolve so there is no dangling promise
    resolveSubFetch(makeSubRes([]));
  });
});
